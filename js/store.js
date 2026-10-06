// ============================================================
// Store — local-first data for facility data (per device)
// Members / Devices / Ledger / Check-ins / Notifications
// All client business data stays on the device by design.
// ============================================================

import { requireWrite } from "./access.js";

const PREFIX = "dp_";
const COLLECTIONS = ["members", "devices", "trainers", "ledger", "checkins", "notifications", "audit_log"];
const TOMB_KEY = "dp_tombstones";
const AUDIT_KEY = "dp_audit_log";
const AUDIT_MAX = 5000; // احتفظ بـ 5000 عملية كحد أقصى

const listeners = new Map();
let _suppressCloud = false;

// ---- Per-account data isolation ----
// كل حساب له نطاق تخزين خاص به (dp_<id>_members …) حتى لا يرى أو يمسح أحدهم
// بيانات الآخر على نفس الجهاز. قبل الحسابات كانت البيانات عمومية على الجهاز.
function currentAccountId() {
  try {
    const u = JSON.parse(localStorage.getItem("dp_current_user") || "null");
    if (u && u.id) return String(u.id).replace(/[^A-Za-z0-9_-]/g, "") || null;
  } catch {}
  return null;
}

function memColKey(col) {
  const uid = currentAccountId();
  return uid ? `${PREFIX}${uid}_${col}` : `${PREFIX}${col}`;
}
function memTombKey() {
  const uid = currentAccountId();
  return uid ? `${PREFIX}${uid}_tombstones` : TOMB_KEY;
}
function memSeededKey() {
  const uid = currentAccountId();
  return uid ? `${PREFIX}${uid}_seeded` : "dp_seeded";
}
// السحابة مرتبطة بترخيص الجهاز — لا تسمح بدفع بيانات حساب آخر إلى سحابة
// ترخيص لا يملكه، ولا تعطل المزامنة إلا إذا كان الحساب مالك الترخيص.
export function cloudAllowed(lic) {
  if (!lic) return false;
  if (!lic.owner) return true;
  const o = String(lic.owner).toLowerCase();
  try {
    const u = JSON.parse(localStorage.getItem("dp_current_user") || "null");
    if (!u) return true;
    // جلسة كود التفعيل (activate.js) هي نفسها حساب هذا الترخيص — id هو الكود
    // نفسه. أقوى مطابقة ممكنة عندما يكون المالك رقم هاتف أو اسم بلا بريد
    // للمقارنة: بدونها كانت جلسات الأكواد تُطفئ المزامنة بصمت.
    if (u.id && lic.code && String(u.id).toLowerCase() === String(lic.code).toLowerCase()) return true;
    const email = String(u.email || "").toLowerCase();
    // Email-linked codes store owner as "user:<uuid>" (set by /api/trial under
    // a Supabase session) — they must match the session's user id, not email.
    // Without this, every email-linked account was silently never syncing.
    return email === o
      || (!!u.id && o === `user:${String(u.id).toLowerCase()}`)
      || email === "ibrheamshady@gmail.com";
  } catch { return true; }
}

function read(col) {
  try { return JSON.parse(localStorage.getItem(memColKey(col))) || []; }
  catch { return []; }
}
function readTomb() {
  try { return JSON.parse(localStorage.getItem(memTombKey())) || {}; }
  catch { return {}; }
}
function writeTomb(t) { localStorage.setItem(memTombKey(), JSON.stringify(t)); }
function tsOf(it) { return Number(it && it.updatedAt) || Number(it && it.createdAt) || 0; }

// ---------- Audit Log ----------
function readAudit() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY)) || []; }
  catch { return []; }
}
function writeAudit(list) { localStorage.setItem(AUDIT_KEY, JSON.stringify(list)); }

function currentUserIdentity() {
  try {
    const u = JSON.parse(localStorage.getItem("dp_current_user") || "null");
    if (u) return { id: u.id, name: u.name, email: u.email };
  } catch {}
  return { id: "unknown", name: "Unknown", email: "" };
}

function auditLog(action, collection, itemId, details = {}) {
  const user = currentUserIdentity();
  const log = {
    id: uid("audit"),
    ts: Date.now(),
    action,           // "create" | "update" | "delete"
    collection,       // "members" | "devices" | "trainers" | "ledger" | "checkins"
    itemId,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    details,          // { before: {...}, after: {...}, fields: ["name", "phone"] }
  };
  const logs = readAudit();
  logs.unshift(log);
  if (logs.length > AUDIT_MAX) logs.length = AUDIT_MAX;
  writeAudit(logs);
  return log;
}

function getAuditLog(options = {}) {
  let logs = readAudit();
  if (options.collection) logs = logs.filter(l => l.collection === options.collection);
  if (options.itemId) logs = logs.filter(l => l.itemId === options.itemId);
  if (options.userId) logs = logs.filter(l => l.userId === options.userId);
  if (options.action) logs = logs.filter(l => l.action === options.action);
  if (options.since) logs = logs.filter(l => l.ts >= options.since);
  if (options.until) logs = logs.filter(l => l.ts <= options.until);
  if (options.limit) logs = logs.slice(0, options.limit);
  return logs;
}

function write(col, list) {
  localStorage.setItem(memColKey(col), JSON.stringify(list));
  emit(col, list);
  if (!_suppressCloud) queueCloudSave();
}

// ---- Website cloud sync (online mode only) ----
// After login/activation with a password, every change is pushed to the
// cloud so the owner can continue from any browser.
// NOTE: only a *minimal* subset is sent to the cloud (no member photos,
// no volatile checkin/notification logs) to keep cloud storage very small.
let _cloudTimer = null;

// ---- Sync status (for the live badge in Settings) ----
// dp_pending_sync = "1" means: there are local changes that have NOT
// reached the cloud yet. The Settings cloud-sync row renders this state
// live; the UI listens to the "dp:syncstatus" event.
const PENDING_KEY = "dp_pending_sync";
let _syncState = "ok"; // ok | syncing | error
let _lastSyncOk = 0;

function setSyncState(s) {
  if (_syncState === s) return;
  _syncState = s;
  try { window.dispatchEvent(new CustomEvent("dp:syncstatus")); } catch {}
}

function syncStatus() {
  const enabled = localStorage.getItem("dp_cloud") === "1";
  const pending = enabled && localStorage.getItem(PENDING_KEY) === "1";
  const state = !enabled ? "off"
    : _syncing ? "syncing"
    : _syncState === "error" ? "error"
    : pending ? "pending" : "ok";
  return { state, pending, lastOk: _lastSyncOk, enabled };
}

function syncStatusDetailed() {
  const base = syncStatus();
  if (!base.enabled && base.state !== "off") return base;
  
  // Count pending items by collection
  const pendingCounts = {};
  COLLECTIONS.forEach(c => {
    if (c === "audit_log") return;
    const list = read(c);
    // Items with updatedAt > lastSyncOk are pending
    const pending = list.filter(item => item.updatedAt && item.updatedAt > _lastSyncOk).length;
    if (pending > 0) pendingCounts[c] = pending;
  });
  
  const totalPending = Object.values(pendingCounts).reduce((a, b) => a + b, 0);
  
  return {
    ...base,
    pendingCounts,
    totalPending,
    lastSyncOk: _lastSyncOk,
    lastSyncOkFormatted: _lastSyncOk ? new Date(_lastSyncOk).toLocaleString("ar-EG") : "—",
  };
}

function markSaved() {
  localStorage.removeItem(PENDING_KEY);
  _lastSyncOk = Date.now();
  setSyncState("ok");
}

function cloudDump() {
  const dump = {};
  COLLECTIONS.forEach((c) => {
    if (c === "checkins" || c === "notifications") return; // logs stay local-only
    const list = read(c);
    if (c === "members") {
      dump[c] = list.filter((x) => !x._demo).map(({ photo: _photo, ...m }) => m); // drop demo rows + heavy base64 photos
    } else {
      dump[c] = list.filter((x) => !x._demo);
    }
  });
  dump._tombstones = readTomb();
  return dump;
}

function queueCloudSave() {
  if (localStorage.getItem("dp_cloud") !== "1") return;
  // There are local changes not yet confirmed by the cloud → badge "unsynced".
  localStorage.setItem(PENDING_KEY, "1");
  try { window.dispatchEvent(new CustomEvent("dp:syncstatus")); } catch {}
  clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(async () => {
    try {
      const lic = JSON.parse(localStorage.getItem("dp_license") || "null");
      if (!lic || !lic.code || !cloudAllowed(lic)) { localStorage.removeItem(PENDING_KEY); return; }
      const { codesDb } = await import("./db.js");
      if (!codesDb.saveGym) { localStorage.removeItem(PENDING_KEY); return; }
      const dump = cloudDump();
      // saveGym resolves `false` instead of throwing on failure — only a
      // confirmed push may clear the pending flag (a silent false here used
      // to show "synced" while the data never left this device).
      const ok = await codesDb.saveGym(lic.code, { savedAt: Date.now(), data: dump });
      if (!ok) { setSyncState("error"); return; }
      markSaved();
    } catch (err) {
      setSyncState("error"); // pending flag stays set → retried by sync loop / online event
      console.warn("[GymOS] cloud save skipped:", err && err.message);
    }
  }, 1500);
}
// ---------- Multi-device sync engine ----------
// Pulls the cloud state, merges item-by-item with the local state by
// updatedAt (newer wins; deletions propagate via tombstones), writes the
// merged result locally (only if changed), then pushes it back. The server
// also merges, so two devices editing at the same time never clobber.
let _syncing = false;
let _syncTimer = null;

function mergeTombstones(a, b) {
  const out = { ...(a || {}) };
  Object.keys(b || {}).forEach((c) => {
    out[c] = out[c] || {};
    Object.keys(b[c]).forEach((id) => {
      const t = Number(b[c][id]) || 0;
      if (!out[c][id] || t > out[c][id]) out[c][id] = t;
    });
  });
  return out;
}

function mergeStates(local, cloud, tombstones) {
  const result = {};
  COLLECTIONS.forEach((c) => {
    if (c === "checkins" || c === "notifications") {
      result[c] = local[c] || []; // local-only logs
      return;
    }
    const tomb = tombstones[c] || {};
    const ex = local[c] || [];
    const inc = cloud[c] || [];
    const map = new Map();
    const exMap = new Map(ex.map((x) => [x.id, x]));
    const incMap = new Map(inc.map((x) => [x.id, x]));
    const ids = new Set([...exMap.keys(), ...incMap.keys()]);
    ids.forEach((id) => {
      const e = exMap.get(id);
      const i = incMap.get(id);
      let winner;
      if (!e) winner = i;
      else if (!i) winner = e;
      else winner = tsOf(i) > tsOf(e) ? i : e; // tie → keep local
      const t = tomb[id];
      if (t && tsOf(winner) <= t) return; // deleted
      if (winner && !winner.photo) {
        const other = winner === e ? i : e;
        if (other && other.photo) winner = { ...winner, photo: other.photo };
      }
      if (winner) map.set(id, winner);
    });
    result[c] = [...map.values()];
  });
  return result;
}

async function syncNow() {
  if (_syncing) return;
  if (localStorage.getItem("dp_cloud") !== "1") return;
  const lic = JSON.parse(localStorage.getItem("dp_license") || "null");
  if (!lic || !lic.code || !cloudAllowed(lic)) return;
  _syncing = true;
  setSyncState("syncing");
  try {
    const { codesDb } = await import("./db.js");
    if (!codesDb.saveGym) return;
    const local = cloudDump();
    const cloudRes = await codesDb.loadGym(lic.code);
    const cloud = cloudRes && cloudRes.data ? cloudRes.data : null;
    let merged, mergedTomb;
    if (cloud) {
      mergedTomb = mergeTombstones(local._tombstones, cloud._tombstones);
      merged = mergeStates(local, cloud, mergedTomb);
    } else {
      merged = local;
      mergedTomb = local._tombstones;
    }
    _suppressCloud = true;
    COLLECTIONS.forEach((c) => {
      if (!(c in merged)) return;
      const next = merged[c];
      const cur = read(c);
      if (cur.length !== next.length || JSON.stringify(cur) !== JSON.stringify(next)) write(c, next);
    });
    writeTomb(mergedTomb);
    _suppressCloud = false;
    const push = {};
    COLLECTIONS.forEach((c) => { if (c in merged) push[c] = merged[c]; });
    push._tombstones = mergedTomb;
    // Same honesty rule as queueCloudSave: saveGym returns false on failure,
    // and clearing dp_pending_sync without a confirmed push is silent data loss.
    const ok = await codesDb.saveGym(lic.code, { savedAt: Date.now(), data: push });
    if (!ok) { setSyncState("error"); return; }
    markSaved();
  } catch (e) {
    setSyncState("error");
    console.warn("[GymOS] sync failed:", e && e.message);
  } finally {
    _suppressCloud = false;
    _syncing = false;
    // A local edit may have been queued mid-flight or the state flapped from
    // "syncing" back during the await — re-notify so the badge is accurate.
    try { window.dispatchEvent(new CustomEvent("dp:syncstatus")); } catch {}
  }
}

let _onVis = null;
let _onFocus = null;
let _onOnline = null;

function startSync() {
  if (_syncTimer) return;
  if (localStorage.getItem("dp_cloud") !== "1") return;
  const lic = JSON.parse(localStorage.getItem("dp_license") || "null");
  if (!lic || !lic.code || !cloudAllowed(lic)) return;
  syncNow();
  _syncTimer = setInterval(syncNow, 20000);
  _onVis = () => { if (document.visibilityState === "visible") syncNow(); };
  _onFocus = () => syncNow();
  // Network came back → push any pending changes immediately.
  _onOnline = () => syncNow();
  document.addEventListener("visibilitychange", _onVis);
  window.addEventListener("focus", _onFocus);
  window.addEventListener("online", _onOnline);
}

function stopSync() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  if (_onVis) { document.removeEventListener("visibilitychange", _onVis); _onVis = null; }
  if (_onFocus) { window.removeEventListener("focus", _onFocus); _onFocus = null; }
  if (_onOnline) { window.removeEventListener("online", _onOnline); _onOnline = null; }
}

function emit(col, list) {
  (listeners.get(col) || new Set()).forEach((cb) => cb(list));
}

// Demo seeding removed on purpose: a fresh install must arrive EMPTY.
// (The old fake roster confused real gym owners and could leak into their
// cloud on the first sync.)

export function uid(prefix = "id") {
  const uuid = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  return `${prefix}_${uuid}`;
}

// ---------- Plans & prices (editable by the admin) ----------
const PLAN_PRICES_KEY = "dp_plan_prices";

// Pricing per marketing-strategy skill: charm endings (<$100 rule),
// middle-tier anchoring (Pro positioned as best value), entry "Half" tier
export const PLANS = [
  { key: "half", en: "Half", ar: "نص", defaultPrice: 9 },
  { key: "regular", en: "Regular", ar: "عادي", defaultPrice: 29 },
  { key: "pro", en: "Pro", ar: "اخترافي", defaultPrice: 49 },
];

export function planPrices() {
  const defaults = Object.fromEntries(PLANS.map((p) => [p.key, p.defaultPrice]));
  try {
    const saved = JSON.parse(localStorage.getItem(PLAN_PRICES_KEY));
    if (saved && typeof saved === "object") return { ...defaults, ...saved };
  } catch {}
  return defaults;
}

export function savePlanPrices(prices) {
  localStorage.setItem(PLAN_PRICES_KEY, JSON.stringify(prices));
}

// Sort members newest-join-first (deterministic). The stored array order can
// be scrambled after a cloud merge or an import, so the roster+exports always
// present clients in a stable, meaningful order.
export function sortMembers(list = []) {
  return list
    .slice()
    .sort((a, b) => (b.joinDate || b.createdAt || 0) - (a.joinDate || a.createdAt || 0));
}

export const store = {
  sortMembers,
  all(col) {
    if (!COLLECTIONS.includes(col)) throw new Error(`Unknown collection: ${col}`);
    const key = memColKey(col);
    const raw = localStorage.getItem(key);
    if (raw !== null) return read(col);
    const seedFlag = localStorage.getItem(memSeededKey());
    // Migration: account يدخل أول مرة على جهاز فيه داتا قديمة (داتا ما قبل
    // الحسابات) → نستورد نسخة إلى نطاقه حتى لا تضيع بيانات المالك السابق.
    // الهجرة مرة واحدة فقط على الجهاز — فلا تتسرب الداتا القديمة لحسابات أخرى.
    if (seedFlag !== "1") {
      const uid = currentAccountId();
      if (uid && localStorage.getItem("dp_legacy_migrated") !== "1") {
        // نستورد كل المجموعات في نفَس واحدة: الكود القديم رفع علامة
        // "dp_legacy_migrated" بعد أول مجموعة، فكان members يستورد لكن
        // devices/ledger/trainers لا تُستورد أبداً. النسخ الأصلية تبقى في
        // مكانها، والبيانات الموجودة في نطاق الحساب لا تُستبدل أبداً.
        let imported = false;
        for (const c of [...COLLECTIONS, "tombstones"]) {
          const legacyRaw = localStorage.getItem(PREFIX + c);
          const targetKey = c === "tombstones" ? memTombKey() : memColKey(c);
          if (legacyRaw === null || localStorage.getItem(targetKey) !== null) continue;
          try {
            JSON.parse(legacyRaw); // تحقق من السلامة قبل المساس بالنطاق
            localStorage.setItem(targetKey, legacyRaw);
            imported = true;
          } catch { /* سطر قديم تالف — تخطَّه */ }
        }
        if (imported) localStorage.setItem("dp_legacy_migrated", "1");
        if (localStorage.getItem(key) !== null) return read(col);
      }
    }
    // لا تعيد زرع تلقائياً بعد مسح المستخدم — ارجع فارغاً، الزرع فقط عند أول تثبيت
    if (seedFlag === "1") return [];
    // No demo seeding: a brand-new install must be EMPTY. The old fake roster
    // (Alex Mercer, Sarah Connor…) confused real gym owners and could leak into
    // their cloud on first sync. Legacy pre-account data still migrates above.
    localStorage.setItem(memColKey(col), "[]");
    if (COLLECTIONS.every((c) => localStorage.getItem(memColKey(c)) !== null)) localStorage.setItem(memSeededKey(), "1");
    return [];
  },

  // اعتماد نطاق تجربة جهازية إلى حساب كود فعلي عند التبديل على نفس الجهاز:
  // نسخ صفوف التجربة إلى نطاق الكود — بدون حذف الأصل، وبدون لمس صفوف موجودة
  // أصلاً في نطاق الهدف (التجربة ملك للجهاز، الكود ملك للحساب).
  adoptNamespace(fromId, toId) {
    const clean = (v) => String(v || "").replace(/[^A-Za-z0-9_-]/g, "");
    const from = clean(fromId), to = clean(toId);
    if (!from || !to || from === to) return 0;
    let copied = 0;
    for (const c of [...COLLECTIONS, "tombstones"]) {
      const srcKey = `${PREFIX}${from}_${c}`;
      const dstKey = `${PREFIX}${to}_${c}`;
      const raw = localStorage.getItem(srcKey);
      if (raw === null || localStorage.getItem(dstKey) !== null) continue;
      try {
        JSON.parse(raw);
        localStorage.setItem(dstKey, raw);
        copied++;
      } catch { /* سطر تالف — تخطَّه */ }
    }
    return copied;
  },

  subscribe(col, cb) {
    if (!listeners.has(col)) listeners.set(col, new Set());
    listeners.get(col).add(cb);
    return () => listeners.get(col).delete(cb);
  },

  insert(col, data) {
    if (!requireWrite(`add ${col}`)) return null;
    const item = { id: uid(col[0]), createdAt: Date.now(), updatedAt: Date.now(), ...data };
    const list = this.all(col);
    list.unshift(item);
    write(col, list);

    auditLog("create", col, item.id, { after: item });

    // Auto ledger entry when a paying member joins
    if (col === "members" && Number(data.paidAmount) > 0) {
      this.insert("ledger", {
        type: "revenue",
        amount: Number(data.paidAmount),
        description: `Membership: ${data.name}`,
        category: "subscriptions",
        date: Date.now(),
      });
    }
    return item;
  },

  update(col, id, patch) {
    if (!requireWrite(`edit ${col}`)) return null;
    const list = this.all(col);
    const i = list.findIndex((x) => x.id === id);
    if (i === -1) throw new Error("Item not found");
    const before = { ...list[i] };
    const changedFields = Object.keys(patch).filter(k => patch[k] !== before[k]);
    list[i] = { ...list[i], ...patch, updatedAt: Date.now() };
    write(col, list);
    auditLog("update", col, id, { before, after: list[i], fields: changedFields });
    return list[i];
  },

  remove(col, id) {
    if (!requireWrite(`delete ${col}`)) return false;
    const list = this.all(col);
    const item = list.find((x) => x.id === id);
    const filtered = list.filter((x) => x.id !== id);
    const t = readTomb();
    t[col] = t[col] || {};
    t[col][id] = Date.now();
    writeTomb(t);
    write(col, filtered);
    if (item) auditLog("delete", col, id, { before: item });
    return true;
  },

  get(col, id) {
    return this.all(col).find((x) => x.id === id) || null;
  },

  resetAll() {
    // يمسح بيانات الحساب الحالي فقط — لا يمس أحداً آخر على نفس الجهاز.
    // Every removed item is tombstoned so the wipe propagates to the CLOUD
    // copy (the sync engine unions local+cloud; without tombstones the next
    // pull would resurrect everything the user just deleted).
    const now = Date.now();
    const tomb = readTomb();
    COLLECTIONS.forEach((c) => {
      (read(c) || []).forEach((item) => {
        if (item && item.id) { tomb[c] = tomb[c] || {}; tomb[c][item.id] = now; }
      });
      localStorage.removeItem(memColKey(c));
    });
    writeTomb(tomb);
    // لا تعد زرع بيانات وهمية بعد المسح — اتركها فارغة للعميل النهائي
    localStorage.setItem(memSeededKey(), "1");
    // Push the emptied state to the cloud immediately (sync is stopped by the
    // caller, so this is the only chance before the page reloads).
    queueCloudSave();
  },

  exportAll() {
    const dump = {};
    COLLECTIONS.forEach((c) => { dump[c] = this.all(c); });
    return { app: "digital-pulse", version: 1, exportedAt: new Date().toISOString(), data: dump };
  },

  importAll(dump) {
    if (!requireWrite("import a backup")) return false;
    if (!dump || !dump.data) throw new Error("Invalid backup file");
    Object.entries(dump.data).forEach(([col, list]) => {
      if (COLLECTIONS.includes(col)) write(col, Array.isArray(list) ? list : []);
    });
  },

  startSync,
  stopSync,
  syncNow,
  syncStatus,
  syncStatusDetailed,
  auditLog: auditLog,
  getAuditLog: getAuditLog,

  // ---------- Derived stats ----------
  stats() {
    const members = this.all("members");
    const devices = this.all("devices");
    const ledger = this.all("ledger");
    const checkins = this.all("checkins");

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const lastMonthStart = new Date(monthStart); lastMonthStart.setMonth(monthStart.getMonth() - 1);

    // Live status derived from expiresAt/frozen — NOT the stored field (which is
    // only ever set at insert and goes stale the moment a membership expires).
    const effStatus = (m) =>
      Date.now() > m.expiresAt ? "expired"
      : m.status === "frozen" ? "frozen"
      : (m.status === "trial" && Date.now() <= m.expiresAt ? "trial" : "active");

    const revenueBetween = (from, to) =>
      ledger.filter((l) => l.type === "revenue" && l.date >= from && l.date < to)
            .reduce((s, l) => s + Number(l.amount || 0), 0);

    const thisMonthRev = revenueBetween(monthStart.getTime(), Infinity);
    const lastMonthRev = revenueBetween(lastMonthStart.getTime(), monthStart.getTime());
    const growth = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 : (thisMonthRev > 0 ? 100 : 0);

     return {
       activeMembers: members.filter((m) => effStatus(m) === "active").length,
       endedToday: members.filter((m) => effStatus(m) === "expired" && m.expiresAt >= startOfToday.getTime()).length,
       totalExpired: members.filter((m) => effStatus(m) === "expired").length,
       maintAlerts: devices.filter((d) => d.maintenanceStatus !== "completed").length,
       revenueThisMonth: thisMonthRev,
      revenueGrowthPct: Math.round(growth * 10) / 10,
      totalRevenue: ledger.filter((l) => l.type === "revenue").reduce((s, l) => s + Number(l.amount || 0), 0),
      totalExpenses: ledger.filter((l) => l.type === "expense").reduce((s, l) => s + Number(l.amount || 0), 0),
      checkins7: checkins.slice(-7).map((c) => c.count),
      checkins30: checkins.slice(-30).map((c) => c.count),
    };
  },
};