// ============================================================
// session — the single writer for dp_current_user (Phase B)
//
// Three paths used to mint this key with three different shapes
// (login.js, signup.js — and activation-code logins which never wrote
// it AT ALL, so app.html bounced code users straight back to the login
// page and the store kept reading the shared bare dp_<collection> keys).
// Every writer now normalises through writeSession(), so readers
// (access.js gate, store.js namespacing, app.js boot) always see the
// same fields: id, email, name, status, subscription, subStart, subEnd,
// subTier, loginAt. Unknown fields (passHash, plainPassword, …) are
// dropped structurally — only the keys below ever reach storage.
// ============================================================

const SESSION_KEY = "dp_current_user";
const EMAIL_KEY = "dp_user_email";
const ID_KEY = "dp_user_id";

// Device-local trials (TRI-… local fallback, TRIAL-… demo-minted) belong to
// the DEVICE, not to a person: their namespace may follow the device when a
// real activation code takes over (see activate.js → store.adoptNamespace).
export function isTrialSessionId(id) {
  return /^(TRI|TRIAL)-/i.test(String(id || ""));
}

export function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}

// Normalise and persist. Returns the stored session, or null when there is
// no usable id (nothing is written in that case).
export function writeSession(user = {}) {
  const id = String(user.id ?? "").trim();
  if (!id) return null;
  const now = Date.now();
  const session = {
    id,
    email: String(user.email ?? ""),
    name: String(user.name || user.email || ""),
    status: String(user.status || "active"),
    subscription: String(user.subscription || "active"),
    subStart: Number(user.subStart) || now,
    subEnd: Number(user.subEnd) || 0,
    subTier: String(user.subTier || "standard"),
    loginAt: now,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    if (session.email) localStorage.setItem(EMAIL_KEY, session.email);
    localStorage.setItem(ID_KEY, session.id);
  } catch { return null; }
  return session;
}

// The session an activation-code login / activation / trial creates.
// Email priority: (1) the JWT the server just issued — it knows the buyer;
// (2) the owner when the owner IS an email (keeps cloudAllowed's owner
// match happy); (3) the code itself, exactly what demo code sessions have
// always used — so the same code resolves to the same id on both paths.
export function codeSessionFromRecord(record = {}) {
  const code = String(record.code || "").trim();
  if (!code) return null;
  let email = "";
  try {
    const jwt = String(localStorage.getItem("dp_jwt") || "");
    const part = jwt.split(".")[1];
    if (part) {
      const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      if (payload && payload.email) email = String(payload.email);
    }
  } catch { /* malformed token — fall through */ }
  const owner = String(record.owner || "");
  if (!email && owner.includes("@")) email = owner;
  if (!email) email = code;
  const now = Date.now();
  const days = Number(record.days) || 0;
  // expiresAt === 0 is the lifetime sentinel; otherwise a day-based record
  // gets its real instant so the access gate never re-guesses it.
  const expiresAt = Number(record.expiresAt) || (days > 0 ? now + days * 86400000 : 0);
  return {
    id: code,
    email,
    name: String(record.owner || email || code),
    status: "active",
    subscription: String(record.tier || "standard") === "trial" ? "trial" : "active",
    subStart: Number(record.createdAt) || now,
    subEnd: expiresAt,
    subTier: String(record.tier || "standard"),
    loginAt: now,
  };
}

// Write the code's session — but NEVER hijack a real account's namespace:
// another account's local data must stay visible to its owner ("I logged
// in again and everything is gone" is the exact bug we are killing here).
// Rules: no session → write; same code → refresh; a device-local TRIAL
// session → replace (its rows are carried over by activate.js); any other
// real account → keep untouched.
export function writeCodeSession(record) {
  const draft = codeSessionFromRecord(record);
  if (!draft) return null;
  const cur = readSession();
  if (cur && cur.id && cur.id !== draft.id && !isTrialSessionId(cur.id)) return cur;
  return writeSession(draft);
}
