// ============================================================
// Input validation & sanitization layer (anti-injection / anti-XSS)
// Every user-controlled value passes through here before being
// rendered or persisted. Defense-in-depth on top of escaping.
// ============================================================

const CODE_RE = /^[A-Z0-9]{6}$/;

/** Strict activation-code sanitizer: A-Z0-9 only, returns XXX-XXX or null */
export function sanitizeCode(raw) {
  const clean = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return CODE_RE.test(clean) ? `${clean.slice(0, 3)}-${clean.slice(3)}` : null;
}

/** Human names: letters (any script), spaces, limited punctuation; 2..40 chars */
export function sanitizeName(raw) {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")   // strip control chars
    .replace(/[<>$`{}|\\^~]/g, "")            // strip HTML/code-ish chars
    .trim()
    .slice(0, 40);
  return s.length >= 2 ? s : null;
}

/** Phones: digits, +, spaces, dashes; E.164-ish length guard */
export function sanitizePhone(raw) {
  const s = String(raw ?? "").replace(/[^+\d\s-]/g, "").trim().slice(0, 20);
  return /^\+?[\d\s-]{7,20}$/.test(s) ? s : "";
}

/** Money: non-negative, max 2 decimals, hard ceiling */
export function sanitizeAmount(raw, max = 1000000) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Math.min(n, max) * 100) / 100;
}

/** Integer days clamp */
export function clampDays(raw, min = 1, max = 1095) {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Free-text notes: strip angle brackets & control chars */
export function sanitizeText(raw, maxLen = 200) {
  return String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLen);
}

/** Password policy: 8..72 chars, at least 1 letter + 1 digit, no leading/trailing spaces */
export function validatePassword(pw) {
  const s = String(pw ?? "");
  if (s.length < 8 || s.length > 72) return false;
  if (s !== s.trim()) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  if (!/\d/.test(s)) return false;
  return true;
}

// ---- Brute-force protection (per browser session) ----
// Storage-agnostic session store (browser sessionStorage / memory in Node)
const _mem = new Map();
const sess = {
  get(k) { try { const v = globalThis.sessionStorage?.getItem(k); if (v != null) return v; } catch {} return _mem.get(k); },
  set(k, v) { try { if (globalThis.sessionStorage) { globalThis.sessionStorage.setItem(k, v); return; } } catch {} _mem.set(k, v); },
  del(k) { try { globalThis.sessionStorage?.removeItem(k); } catch {} _mem.delete(k); },
};

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes

export function loginLockRemaining(key = "dp_login_lock") {
  try {
    const st = JSON.parse(sess.get(key) || "{}");
    if (st.n >= MAX_ATTEMPTS && Date.now() - st.t < LOCK_MS) {
      return Math.ceil((LOCK_MS - (Date.now() - st.t)) / 1000);
    }
  } catch {}
  return 0;
}

export function recordFailedAttempt(key = "dp_login_lock") {
  let st = { n: 0, t: Date.now() };
  try { st = JSON.parse(sess.get(key)) || st; } catch {}
  st.n += 1;
  st.t = Date.now();
  sess.set(key, JSON.stringify(st));
  return st.n;
}

export function resetAttempts(key = "dp_login_lock") {
  sess.del(key);
}