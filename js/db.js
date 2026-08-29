// ============================================================
// Codes database client — MongoDB REST API backend
// Online mode : GymOS API (see server/) — JWT per gym + admin token
// Demo mode   : localStorage fallback (no API configured)
//
// Same public API as before, so screens don't change:
//   codesDb.activate / verifyClientLogin / setClientPassword /
//   changeClientPassword / loadGym / saveGym / create / list /
//   get / remove / setRevoked / adminSignIn / adminSignOut / onAuth
// ============================================================

import { appConfig } from "./config.js";
import { sanitizeCode, sanitizeText, validatePassword } from "./validate.js";

const API = () => String(appConfig.apiUrl || "").replace(/\/+$/, "");
export const onlineMode = () => !!API();

async function api(path, { method = "GET", body, auth = false, admin = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${sessionStorage.getItem("dp_jwt") || ""}`;
  if (admin) headers.Authorization = `Bearer ${sessionStorage.getItem("dp_admin_token") || ""}`;
  const res = await fetch(`${API()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "REQUEST_FAILED"), { code: data.error, status: res.status });
  return data;
}

/* ---------------- Shared helpers ---------------- */
export function normalizeCode(raw) {
  const clean = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 6 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : null;
}

function randomCode() {
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}`;
}

/* ---------------- DEMO mode (localStorage) ---------------- */
const DEMO_KEY = "dp_demo_codes";
function demoAll() { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || []; } catch { return []; } }
function demoSave(list) { localStorage.setItem(DEMO_KEY, JSON.stringify(list)); }
function demoSeed() {
  if (demoAll().length) return;
  const now = Date.now();
  demoSave([
    { id: "7Q2-K9D", code: "7Q2-K9D", tier: "monthly", days: 30, owner: "", createdAt: now, used: false, revoked: false },
    { id: "X4M-P8T", code: "X4M-P8T", tier: "yearly", days: 365, owner: "", createdAt: now, used: false, revoked: false },
    { id: "B9R-W3C", code: "B9R-W3C", tier: "monthly", days: 30, owner: "Demo Gym", createdAt: now - 86400000 * 2, used: true, usedDeviceName: "Demo Phone", usedAt: now - 86400000, revoked: false },
    { id: "K1Z-L6N", code: "K1Z-L6N", tier: "lifetime", days: 0, owner: "", createdAt: now, used: false, revoked: true },
  ]);
}

/* ---------------- Public API ---------------- */
const _authListeners = new Set();
function _notifyDemo() {
  const email = sessionStorage.getItem("dp_demo_admin") === "1" ? "demo-admin" : null;
  _authListeners.forEach((cb) => cb(email));
}

export const codesDb = {
  mode: () => (onlineMode() ? "online" : "demo"),

  onAuth(cb) {
    _authListeners.add(cb);
    if (onlineMode()) {
      // restore session silently
      api("/api/gym", { auth: true })
        .then(() => cb(sessionStorage.getItem("dp_code") || null))
        .catch(() => cb(null));
      return () => {};
    }
    cb(sessionStorage.getItem("dp_demo_admin") === "1" ? "demo-admin" : null);
    return () => {};
  },

  async adminSignIn(email, password) {
    if (onlineMode()) {
      const r = await api("/api/admin/login", { method: "POST", body: { email, password } });
      sessionStorage.setItem("dp_admin_token", r.token);
      return;
    }
    const { appConfig } = await import("./config.js");
    if (email.trim().toLowerCase() !== appConfig.adminEmail.toLowerCase()) {
      throw new Error("This email is not the admin email / هذا البريد ليس بريد المدير");
    }
    if (password !== appConfig.demoAdminPassword) throw new Error("Wrong password / كلمة مرور خاطئة");
    sessionStorage.setItem("dp_demo_admin", "1");
    _notifyDemo();
  },

  async adminSignOut() {
    if (onlineMode()) { sessionStorage.removeItem("dp_admin_token"); return; }
    sessionStorage.removeItem("dp_demo_admin");
    _notifyDemo();
  },

  async create({ tier = "monthly", days = 30, note = "", custom = "", owner = "" } = {}) {
    const rec = {
      tier, days: Math.max(0, Number(days) || 0),
      owner: sanitizeText(owner, 40), note: sanitizeText(note, 200),
    };
    if (onlineMode()) {
      return api("/api/codes", { method: "POST", admin: true, body: { ...rec, custom: sanitizeCode(custom) || "" } });
    }
    demoSeed();
    const code = normalizeCode(custom) || (() => { do { var c = randomCode(); } while (demoAll().some((x) => x.code === c)); return c; })();
    const item = { id: code, code, createdAt: Date.now(), used: false, revoked: false, ...rec };
    const list = demoAll();
    if (list.some((x) => x.code === code)) throw new Error("Code already exists / الكود موجود مسبقاً");
    list.unshift(item); demoSave(list);
    return item;
  },

  async get(code) {
    const id = normalizeCode(code);
    if (!id) return null;
    if (onlineMode()) {
      try { return await api(`/api/codes/${id}`); } catch { return null; }
    }
    demoSeed();
    return demoAll().find((c) => c.code === id) || null;
  },

  async list() {
    if (onlineMode()) return api("/api/codes", { admin: true }).then(res => Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : [])).catch(() => []);
    demoSeed();
    return demoAll().sort((a, b) => b.createdAt - a.createdAt);
  },

  async remove(code) {
    const id = normalizeCode(code);
    if (!id) return;
    if (onlineMode()) { await api(`/api/codes/${id}`, { method: "DELETE", admin: true }); return; }
    demoSave(demoAll().filter((c) => c.code !== id));
  },

  async setRevoked(code, revoked) {
    const id = normalizeCode(code);
    if (!id) return;
    if (onlineMode()) { await api(`/api/codes/${id}/revoke`, { method: "PATCH", admin: true, body: { revoked } }); return; }
    const list = demoAll();
    const item = list.find((c) => c.code === id);
    if (item) { item.revoked = revoked; demoSave(list); }
  },

  // Admin: toggle cloud data transfer for a code
  async setDataEnabled(code, val) {
    const id = normalizeCode(code);
    if (!id) return;
    if (onlineMode()) { await api(`/api/codes/${id}/data`, { method: "PATCH", admin: true, body: { data_enabled: !!val } }); return; }
    const list = demoAll();
    const item = list.find((c) => c.code === id);
    if (item) { item.data_enabled = !!val; demoSave(list); }
  },

  // Admin: toggle multi-device sync for a code
  async setSyncEnabled(code, val) {
    const id = normalizeCode(code);
    if (!id) return;
    if (onlineMode()) { await api(`/api/codes/${id}/sync`, { method: "PATCH", admin: true, body: { sync_enabled: !!val } }); return; }
    const list = demoAll();
    const item = list.find((c) => c.code === id);
    if (item) { item.sync_enabled = !!val; demoSave(list); }
  },

  // Admin: set max activated devices for a code
  async setDeviceLimit(code, val) {
    const id = normalizeCode(code);
    if (!id) return;
    const lim = Math.max(1, Math.min(20, Math.floor(Number(val) || 3)));
    if (onlineMode()) { await api(`/api/codes/${id}/limit`, { method: "PATCH", admin: true, body: { device_limit: lim } }); return; }
    const list = demoAll();
    const item = list.find((c) => c.code === id);
    if (item) { item.device_limit = lim; demoSave(list); }
  },

  // Admin: reset a client's website password → returns temp password
  async resetClientPassword(code) {
    const id = normalizeCode(code);
    if (!id) throw new Error("INVALID_FORMAT");
    const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const temp = Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
    if (onlineMode()) {
      const r = await api(`/api/codes/${id}/reset-password`, { method: "PATCH", admin: true });
      return { temp: r.tempPassword };
    }
    demoSeed();
    const list = demoAll();
    const item = list.find((c) => c.code === id);
    if (item) { item.passHash = "demo"; item.plainPassword = temp; demoSave(list); }
    return { temp };
  },

  async activate(code, deviceInfo) {
    const id = sanitizeCode(code);
    if (!id) return { ok: false, error: "INVALID_FORMAT" };
    if (onlineMode()) {
      try {
        const r = await api("/api/auth/activate", {
          method: "POST",
          body: { code: id, deviceId: deviceInfo.deviceId, deviceName: deviceInfo.deviceName },
        });
        sessionStorage.setItem("dp_jwt", r.token);
        sessionStorage.setItem("dp_code", r.record.code);
        return { ok: true, record: r.record };
      } catch (err) {
        return { ok: false, error: err.code || "NOT_FOUND" };
      }
    }
    demoSeed();
    const record = demoAll().find((c) => c.code === id);
    if (!record) return { ok: false, error: "NOT_FOUND" };
    if (record.used) return { ok: false, error: "ALREADY_USED" };
    if (record.revoked) return { ok: false, error: "REVOKED" };
    Object.assign(record, {
      used: true, usedAt: Date.now(),
      usedDevice: deviceInfo.deviceId, usedDeviceName: deviceInfo.deviceName,
    });
    demoSave(demoAll());
    return { ok: true, record };
  },

  async verifyClientLogin(code, password) {
    const id = sanitizeCode(code);
    if (!id) return { ok: false, error: "INVALID_FORMAT" };
    if (!validatePassword(password)) return { ok: false, error: "WRONG_PASSWORD" };
    if (onlineMode()) {
      try {
        const r = await api("/api/auth/login", {
          method: "POST",
          body: { code: id, password, deviceId: localStorage.getItem("dp_device_id") || "" },
        });
        sessionStorage.setItem("dp_jwt", r.token);
        sessionStorage.setItem("dp_code", r.record.code);
        return { ok: true, record: r.record };
      } catch (err) {
        return { ok: false, error: err.code || "WRONG_PASSWORD" };
      }
    }
    demoSeed();
    const rec = demoAll().find((c) => c.code === id);
    if (!rec || !rec.used) return { ok: false, error: "NOT_FOUND" };
    if (!rec.passHash) return { ok: false, error: "NO_PASSWORD" };
    if ((rec.plainPassword || "") !== password) return { ok: false, error: "WRONG_PASSWORD" };
    return { ok: true, record: rec };
  },

  async setClientPassword(code, password) {
    const id = sanitizeCode(code);
    if (!id || !validatePassword(password)) throw new Error("Weak password / كلمة سر ضعيفة");
    const L = JSON.parse(localStorage.getItem("dp_license") || "{}");
    localStorage.setItem("dp_cloud", (onlineMode() && L.data_enabled) ? "1" : "0");
    if (onlineMode()) {
      const r = await api("/api/auth/set-password", { method: "POST", body: { code: id, password } });
      sessionStorage.setItem("dp_jwt", r.token);
      sessionStorage.setItem("dp_code", id);
      return true;
    }
    const list = demoAll();
    const item = list.find((c) => c.code === id);
    if (item) { item.passHash = "demo"; item.plainPassword = password; demoSave(list); } // demo-only convenience
    return true;
  },

  async changeClientPassword(code, currentPw, newPw) {
    const id = sanitizeCode(code);
    if (!id || !validatePassword(newPw)) return { ok: false, error: "WEAK_PASSWORD" };
    if (onlineMode()) {
      try {
        await api("/api/auth/change-password", { method: "POST", auth: true, body: { current: currentPw, next: newPw } });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.code || "FAILED" };
      }
    }
    const chk = await this.verifyClientLogin(id, currentPw);
    if (!chk.ok) return chk;
    const list = demoAll();
    const item = list.find((c) => c.code === id);
    if (item) { item.passHash = "demo"; item.plainPassword = newPw; demoSave(list); }
    return { ok: true };
  },

  async loadGym(code) {
    if (!onlineMode()) return null;
    try {
      const g = await api("/api/gym", { auth: true });
      return g && g.data ? g : null;
    } catch { return null; }
  },

  async saveGym(code, data) {
    if (!onlineMode()) return false;
    try { await api("/api/gym", { method: "PUT", auth: true, body: data }); return true; }
    catch { return false; }
  },
};

// ---- Periodic codes sync (online) ----
let _codesSyncTimer = null;
async function syncCodesCache() {
  if (!onlineMode() || !navigator.onLine) return;
  try {
    const res = await api("/api/codes", { admin: true });
    const list = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
    if (list.length) localStorage.setItem("dp_codes_cache", JSON.stringify({ at: Date.now(), list }));
  } catch {}
}
function startCodesSync() {
  if (_codesSyncTimer) return;
  syncCodesCache();
  _codesSyncTimer = setInterval(syncCodesCache, 60_000);
  window.addEventListener("online", syncCodesCache);
}
if (typeof window !== "undefined") {
  // ابدأ التزامن عند التحميل إذا كان الأدمن مسجلاً
  if (sessionStorage.getItem("dp_admin_token") || sessionStorage.getItem("dp_demo_admin")) startCodesSync();
  window.addEventListener("storage", (e) => { if (e.key === "dp_admin_token" || e.key === "dp_demo_admin") startCodesSync(); });
}

export { newId } from "./util.js";