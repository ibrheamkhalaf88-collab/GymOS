// ============================================================
// Store — local-first data for facility data (per device)
// Members / Devices / Ledger / Check-ins / Notifications
// All client business data stays on the device by design.
// ============================================================

const PREFIX = "dp_";
const COLLECTIONS = ["members", "devices", "trainers", "ledger", "checkins", "notifications"];
const TOMB_KEY = "dp_tombstones";

const listeners = new Map();
let _suppressCloud = false;

function read(col) {
  try { return JSON.parse(localStorage.getItem(PREFIX + col)) || []; }
  catch { return []; }
}
function readTomb() {
  try { return JSON.parse(localStorage.getItem(TOMB_KEY)) || {}; }
  catch { return {}; }
}
function writeTomb(t) { localStorage.setItem(TOMB_KEY, JSON.stringify(t)); }
function tsOf(it) { return Number(it && it.updatedAt) || Number(it && it.createdAt) || 0; }

function write(col, list) {
  localStorage.setItem(PREFIX + col, JSON.stringify(list));
  emit(col, list);
  if (!_suppressCloud) queueCloudSave();
}

// ---- Website cloud sync (online mode only) ----
// After login/activation with a password, every change is pushed to the
// cloud so the owner can continue from any browser.
// NOTE: only a *minimal* subset is sent to the cloud (no member photos,
// no volatile checkin/notification logs) to keep cloud storage very small.
let _cloudTimer = null;

function cloudDump() {
  const dump = {};
  COLLECTIONS.forEach((c) => {
    if (c === "checkins" || c === "notifications") return; // logs stay local-only
    const list = read(c);
    if (c === "members") {
      dump[c] = list.map(({ photo, ...m }) => m); // drop heavy base64 photos
    } else {
      dump[c] = list;
    }
  });
  dump._tombstones = readTomb();
  return dump;
}

function queueCloudSave() {
  if (localStorage.getItem("dp_cloud") !== "1") return;
  clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(async () => {
    try {
      const lic = JSON.parse(localStorage.getItem("dp_license") || "null");
      if (!lic || !lic.code) return;
      const { codesDb } = await import("./db.js");
      if (!codesDb.saveGym) return;
      const dump = cloudDump();
      await codesDb.saveGym(lic.code, { savedAt: Date.now(), data: dump });
    } catch (err) { console.warn("[GymOS] cloud save skipped:", err && err.message); }
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
  if (!lic || !lic.code) return;
  _syncing = true;
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
    await codesDb.saveGym(lic.code, { savedAt: Date.now(), data: push });
  } catch (e) {
    console.warn("[GymOS] sync failed:", e && e.message);
  } finally {
    _suppressCloud = false;
    _syncing = false;
  }
}

let _onVis = null;
let _onFocus = null;

function startSync() {
  if (_syncTimer) return;
  if (localStorage.getItem("dp_cloud") !== "1") return;
  syncNow();
  _syncTimer = setInterval(syncNow, 20000);
  _onVis = () => { if (document.visibilityState === "visible") syncNow(); };
  _onFocus = () => syncNow();
  document.addEventListener("visibilitychange", _onVis);
  window.addEventListener("focus", _onFocus);
}

function stopSync() {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  if (_onVis) { document.removeEventListener("visibilitychange", _onVis); _onVis = null; }
  if (_onFocus) { window.removeEventListener("focus", _onFocus); _onFocus = null; }
}

function emit(col, list) {
  (listeners.get(col) || new Set()).forEach((cb) => cb(list));
}

function seed(col) {
  const data = seedData(col);
  write(col, data);
  return data;
}

function seedData(col) {
  switch (col) {
    case "members": {
      const now = Date.now();
      const day = 86400000;
      return [
        { id: "m1", name: "Alex Mercer", phone: "+970599111222", plan: "pro", status: "active",
          joinDate: now - day * 120, expiresAt: now + day * 45, checkins: 42, paidAmount: 150,
          photo: "assets/img/member-1.jpg", tag: "PT Active" },
        { id: "m2", name: "Sarah Connor", phone: "+970599333444", plan: "regular", status: "expired",
          joinDate: now - day * 200, expiresAt: now - day * 2, checkins: 28, paidAmount: 80,
          photo: "assets/img/member-2.jpg", tag: "" },
        { id: "m3", name: "John Doe", phone: "+970599555666", plan: "half", status: "trial",
          joinDate: now - day * 3, expiresAt: now + day * 4, checkins: 4, paidAmount: 0,
          photo: "", tag: "GUEST" },
        { id: "m4", name: "Marcus Wright", phone: "+970599777888", plan: "pro", status: "active",
          joinDate: now - day * 60, expiresAt: now + day * 12, checkins: 19, paidAmount: 120,
          photo: "assets/img/member-3.jpg", tag: "Cardio Focus" },
        { id: "m5", name: "Lena Hassan", phone: "+970599999000", plan: "pro", status: "frozen",
          joinDate: now - day * 300, expiresAt: now + day * 65, checkins: 88, paidAmount: 120,
          photo: "", tag: "" },
      ];
    }
    case "devices": {
      const day = 86400000;
      const now = Date.now();
      return [
        { id: "d1", name: "Treadmill 04", maintenanceStatus: "in-repair", cost: 350,
          createdAt: now - day * 2, updatedAt: now - day },
        { id: "d2", name: "Cable Tower A", maintenanceStatus: "in-repair", cost: 120,
          createdAt: now - day * 4, updatedAt: now - day * 2 },
        { id: "d3", name: "Spin Bike 12", maintenanceStatus: "in-repair", cost: 60,
          createdAt: now - day, updatedAt: now - day },
        { id: "d4", name: "Leg Press 02", maintenanceStatus: "completed", cost: 220,
          repairedAt: now - day * 5, createdAt: now - day * 10, updatedAt: now - day * 5 },
        { id: "d5", name: "Rowing Machine", maintenanceStatus: "completed", cost: 90,
          repairedAt: now - day * 12, createdAt: now - day * 20, updatedAt: now - day * 12 },
      ];
    }
    case "trainers": {
      const pm = new Date(); pm.setDate(1); pm.setMonth(pm.getMonth() - 1);
      return [
        { id: "t1", name: "Coach Ahmad", salary: 400, phone: "+970599000111",
          payDay: 1, lastPaidAt: pm.getTime(), startedAt: Date.now() - 86400000 * 210,
          contractEnd: null },
        { id: "t2", name: "Coach Lena", salary: 300, phone: "",
          payDay: 5, lastPaidAt: null, startedAt: Date.now() - 86400000 * 90,
          contractEnd: Date.now() + 86400000 * 60 },
      ];
    }
    case "ledger": {
      const min = 60000;
      const day = 86400000;
      return [
        { id: "l1", type: "revenue", amount: 120, description: "Pro Membership Renewal", category: "subscriptions", date: Date.now() - min * 2 },
        { id: "l2", type: "expense", amount: 85, description: "Payment Declined", category: "failed", date: Date.now() - min * 15 },
        { id: "l3", type: "revenue", amount: 45.5, description: "POS: Supplements", category: "pos", date: Date.now() - min * 42 },
        { id: "l4", type: "revenue", amount: 2450, description: "Subscriptions batch", category: "subscriptions", date: Date.now() - day * 6 },
        { id: "l5", type: "expense", amount: 350, description: "Treadmill 04 repair", category: "maintenance", date: Date.now() - day * 8 },
        { id: "l6", type: "revenue", amount: 1890, description: "Subscriptions batch", category: "subscriptions", date: Date.now() - day * 14 },
        { id: "l7", type: "expense", amount: 600, description: "Electricity bill", category: "utilities", date: Date.now() - day * 18 },
        { id: "l8", type: "revenue", amount: 2150, description: "New memberships", category: "subscriptions", date: Date.now() - day * 24 },
        { id: "l9", type: "revenue", amount: 1720, description: "Subscriptions batch", category: "subscriptions", date: Date.now() - day * 38 },
        { id: "l10", type: "expense", amount: 480, description: "Equipment parts", category: "maintenance", date: Date.now() - day * 44 },
        { id: "l11", type: "revenue", amount: 1980, description: "Subscriptions batch", category: "subscriptions", date: Date.now() - day * 52 },
        { id: "l12", type: "revenue", amount: 1640, description: "New memberships", category: "subscriptions", date: Date.now() - day * 68 },
        { id: "l13", type: "expense", amount: 520, description: "Electricity bill", category: "utilities", date: Date.now() - day * 75 },
        { id: "l14", type: "revenue", amount: 1810, description: "Subscriptions batch", category: "subscriptions", date: Date.now() - day * 83 },
      ];
    }
    case "checkins": {
      const list = [];
      for (let i = 29; i >= 0; i--) {
        list.push({
          id: `c${i}`,
          date: Date.now() - i * 86400000,
          count: Math.round(60 + 40 * Math.sin(i / 4) + Math.random() * 30),
        });
      }
      return list;
    }
    case "notifications":
      return [
        { id: "n1", severity: "alert", titleEn: "Treadmill 04 offline", titleAr: "جهاز المشي ٠٤ متوقف",
          subEn: "Belt slippage reported", subAr: "تم الإبلاغ عن انزلاق الحزام", time: Date.now() - 7200000 },
        { id: "n2", severity: "info", titleEn: "Capacity alert", titleAr: "تنبيه السعة",
          subEn: "Floor utilization at 85%", subAr: "استخدام الصالة بنسبة ٨٥٪", time: Date.now() - 3600000 * 5 },
        { id: "n3", severity: "frost", titleEn: "Weekly report ready", titleAr: "التقرير الأسبوعي جاهز",
          subEn: "Tap to view in Reports", subAr: "اضغط للعرض في التقارير", time: Date.now() - 86400000 },
      ];
    default:
      return [];
  }
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
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

export const store = {
  all(col) {
    if (!COLLECTIONS.includes(col)) throw new Error(`Unknown collection: ${col}`);
    return localStorage.getItem(PREFIX + col) === null ? seed(col) : read(col);
  },

  subscribe(col, cb) {
    if (!listeners.has(col)) listeners.set(col, new Set());
    listeners.get(col).add(cb);
    return () => listeners.get(col).delete(cb);
  },

  insert(col, data) {
    const item = { id: uid(col[0]), createdAt: Date.now(), updatedAt: Date.now(), ...data };
    const list = this.all(col);
    list.unshift(item);
    write(col, list);

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
    const list = this.all(col);
    const i = list.findIndex((x) => x.id === id);
    if (i === -1) throw new Error("Item not found");
    list[i] = { ...list[i], ...patch, updatedAt: Date.now() };
    write(col, list);
    return list[i];
  },

  remove(col, id) {
    const list = this.all(col);
    const filtered = list.filter((x) => x.id !== id);
    const t = readTomb();
    t[col] = t[col] || {};
    t[col][id] = Date.now();
    writeTomb(t);
    write(col, filtered);
  },

  get(col, id) {
    return this.all(col).find((x) => x.id === id) || null;
  },

  resetAll() {
    COLLECTIONS.forEach((c) => localStorage.removeItem(PREFIX + c));
    COLLECTIONS.forEach((c) => seed(c));
  },

  exportAll() {
    const dump = {};
    COLLECTIONS.forEach((c) => { dump[c] = this.all(c); });
    return { app: "digital-pulse", version: 1, exportedAt: new Date().toISOString(), data: dump };
  },

  importAll(dump) {
    if (!dump || !dump.data) throw new Error("Invalid backup file");
    Object.entries(dump.data).forEach(([col, list]) => {
      if (COLLECTIONS.includes(col)) write(col, Array.isArray(list) ? list : []);
    });
  },

  startSync,
  stopSync,
  syncNow,

  // ---------- Derived stats ----------
  stats() {
    const members = this.all("members");
    const devices = this.all("devices");
    const ledger = this.all("ledger");
    const checkins = this.all("checkins");

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const lastMonthStart = new Date(monthStart); lastMonthStart.setMonth(monthStart.getMonth() - 1);

    const revenueBetween = (from, to) =>
      ledger.filter((l) => l.type === "revenue" && l.date >= from && l.date < to)
            .reduce((s, l) => s + Number(l.amount || 0), 0);

    const thisMonthRev = revenueBetween(monthStart.getTime(), Infinity);
    const lastMonthRev = revenueBetween(lastMonthStart.getTime(), monthStart.getTime());
    const growth = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 : 100;

    return {
      activeMembers: members.filter((m) => m.status === "active").length,
      endedToday: members.filter((m) => m.status === "expired" && m.expiresAt >= startOfToday.getTime()).length,
      totalExpired: members.filter((m) => m.status === "expired").length,
      maintAlerts: devices.filter((d) => d.maintenanceStatus !== "completed").length,
      failedPayments: members.filter((m) => m.status === "expired").length,
      revenueThisMonth: thisMonthRev,
      revenueGrowthPct: Math.round(growth * 10) / 10,
      totalRevenue: ledger.filter((l) => l.type === "revenue").reduce((s, l) => s + Number(l.amount || 0), 0),
      totalExpenses: ledger.filter((l) => l.type === "expense").reduce((s, l) => s + Number(l.amount || 0), 0),
      checkins7: checkins.slice(-7).map((c) => c.count),
      checkins30: checkins.slice(-30).map((c) => c.count),
    };
  },
};