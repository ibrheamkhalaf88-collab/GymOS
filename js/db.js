// ============================================================
// Codes database — the online activation-code system
// Online mode : Firebase Firestore (collection: "codes")
// Demo mode   : localStorage fallback (when Firebase not configured)
// ============================================================

import { db, auth, onlineMode } from "./firebase-config.js";

// Firestore SDK is loaded LAZILY (dynamic import) so DEMO mode works
// fully offline — a static import here would kill both activation and
// admin pages whenever gstatic is unreachable.
const FS = () => import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

// ---- Code format: XXX-XXX (unambiguous alphabet) ----
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeCode(raw) {
  const clean = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 6 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : null;
}

function randomCode() {
  const pick = () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}`;
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// =========================== DEMO MODE ===========================
const DEMO_KEY = "dp_demo_codes";

function demoAll() {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || []; }
  catch { return []; }
}
function demoSave(list) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(list));
}
function demoSeed() {
  if (demoAll().length) return;
  const now = Date.now();
  const seed = [
    { id: "7Q2-K9D", code: "7Q2-K9D", tier: "standard", days: 365, note: "Demo code", createdAt: now, used: false, revoked: false },
    { id: "X4M-P8T", code: "X4M-P8T", tier: "vip", days: 365, note: "Demo VIP", createdAt: now, used: false, revoked: false },
    { id: "B9R-W3C", code: "B9R-W3C", tier: "standard", days: 30, note: "Demo monthly", createdAt: now,
      used: true, usedDevice: "device_demo_1", usedDeviceName: "Demo Phone", usedAt: now - 86400000 * 2, revoked: false },
    { id: "K1Z-L6N", code: "K1Z-L6N", tier: "guest", days: 7, note: "Revoked example", createdAt: now, used: false, revoked: true },
  ];
  demoSave(seed);
}

  // ---------- Admin session ----------
  const _authListeners = new Set();
  function _notifyDemo() {
    const email = sessionStorage.getItem("dp_demo_admin") === "1" ? "demo-admin" : null;
    _authListeners.forEach((cb) => cb(email));
  }

  export const codesDb = {
    mode: () => (onlineMode() ? "online" : "demo"),

    // ---------- Admin session ----------
    onAuth(cb) {
      _authListeners.add(cb);
      if (onlineMode()) {
        FS().then(({ onAuthStateChanged }) =>
          onAuthStateChanged(auth, (user) => cb(user ? user.email : null)));
        return () => {};
      }
      cb(sessionStorage.getItem("dp_demo_admin") === "1" ? "demo-admin" : null);
      return () => {};
    },

    async adminSignIn(email, password) {
      if (onlineMode()) {
        const { signInWithEmailAndPassword } = await FS();
        await signInWithEmailAndPassword(auth, email, password);
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
      if (onlineMode()) { const { signOut } = await FS(); await signOut(auth); return; }
      sessionStorage.removeItem("dp_demo_admin");
      _notifyDemo();
    },

  // ---------- CRUD ----------
  async create({ tier = "standard", days = 365, note = "", custom = "" } = {}) {
    const code = normalizeCode(custom) || randomCode();
    const record = {
      code,
      tier,
      days: Number(days) || 365,
      note,
      createdAt: Date.now(),
      used: false,
      revoked: false,
    };
    if (onlineMode()) {
      const { doc, setDoc } = await FS();
      await setDoc(doc(db, "codes", code), record);
    } else {
      demoSeed();
      const list = demoAll();
      if (list.some((c) => c.code === code)) throw new Error("Code already exists / الكود موجود مسبقاً");
      list.unshift({ id: code, ...record });
      demoSave(list);
    }
    return record;
  },

  async get(code) {
    const id = normalizeCode(code);
    if (!id) return null;
    if (onlineMode()) {
      const { doc, getDoc } = await FS();
      const snap = await getDoc(doc(db, "codes", id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }
    demoSeed();
    return demoAll().find((c) => c.code === id) || null;
  },

  async list() {
    if (onlineMode()) {
      const { collection, getDocs } = await FS();
      const snap = await getDocs(collection(db, "codes"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    demoSeed();
    return demoAll().sort((a, b) => b.createdAt - a.createdAt);
  },

  async remove(code) {
    const id = normalizeCode(code);
    if (!id) return;
    if (onlineMode()) {
      const { doc, deleteDoc } = await FS();
      await deleteDoc(doc(db, "codes", id));
    } else {
      demoSave(demoAll().filter((c) => c.code !== id));
    }
  },

  async setRevoked(code, revoked) {
    const id = normalizeCode(code);
    if (!id) return;
    if (onlineMode()) {
      const { doc, updateDoc } = await FS();
      await updateDoc(doc(db, "codes", id), { revoked });
    } else {
      const list = demoAll();
      const item = list.find((c) => c.code === id);
      if (item) { item.revoked = revoked; demoSave(list); }
    }
  },

  // ---------- Client activation ----------
  // Marks the code as used (only allowed while unused & unrevoked).
  async activate(code, deviceInfo) {
    const id = normalizeCode(code);
    if (!id) return { ok: false, error: "INVALID_FORMAT" };

    const record = await this.get(id);
    if (!record) return { ok: false, error: "NOT_FOUND" };
    if (record.used) return { ok: false, error: "ALREADY_USED" };
    if (record.revoked) return { ok: false, error: "REVOKED" };

    const patch = {
      used: true,
      usedAt: Date.now(),
      usedDevice: deviceInfo.deviceId,
      usedDeviceName: deviceInfo.deviceName,
    };
    if (onlineMode()) {
      const { doc, updateDoc } = await FS();
      await updateDoc(doc(db, "codes", id), patch);
    } else {
      const list = demoAll();
      const item = list.find((c) => c.code === id);
      Object.assign(item, patch);
      demoSave(list);
    }
    return { ok: true, record: { ...record, ...patch } };
  },
};

export { newId };