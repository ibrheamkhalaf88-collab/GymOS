// ============================================================
// GymOS API — Supabase Edge Function (Deno)
// Mirrors the Express + MongoDB API contract EXACTLY so the
// frontend (js/db.js) is 100% unchanged. Storage = Supabase
// Postgres via the service_role key.
//
// Env (set as Function Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE, JWT_SECRET,
//   ADMIN_EMAIL, ADMIN_PASSWORD, ALLOWED_ORIGIN
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import bcrypt from "npm:bcryptjs@2.4.3";
import jwt from "npm:jsonwebtoken";
// TOTP 2FA core (RFC 6238/4648) — pure module shared with the tests, which
// import THIS file and run the RFC vectors against the real implementation.
import { generateRecoveryCodes, generateTotpSecret, verifyTotp } from "./totp.mjs";

const SUPABASE_URL = Deno.env.get("SB_URL") ?? "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE") ?? "";
const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) throw new Error("Missing JWT_SECRET — set Supabase Function Secret");
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") || "ibrheamshady@gmail.com").toLowerCase();
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD");
if (!ADMIN_PASSWORD) throw new Error("Missing ADMIN_PASSWORD — set Supabase Function Secret");
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
// Where GoTrue recovery links land. Must stay inside the Supabase redirect
// allow list (https://ibrheamkhalaf88-collab.github.io/GymOS/**).
const RESET_PASSWORD_URL = "https://ibrheamkhalaf88-collab.github.io/GymOS/reset-password.html";
// Allow GitHub Pages deployment
const GITHUB_PAGES_ORIGIN = "https://ibrheamkhalaf88-collab.github.io";
const APP_ORIGINS = new Set([
  "https://localhost", "http://localhost",
  "capacitor://localhost", "ionic://localhost",
  GITHUB_PAGES_ORIGIN,
]);

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// One cost factor for every write path. Previously set-password used 12 while
// change-password and the admin reset used 10, so rehashing the same password
// through a different route silently changed its strength.
const BCRYPT_COST = 12;

// Error code registry (contract §4): CODE_NOT_FOUND, CODE_REVOKED, CODE_BOUND_TO_OTHER,
// CODE_EXPIRED, SUSPENDED, SUB_EXPIRED, DEVICE_LIMIT, CODE_ALREADY_USED, CODE_USED,
// INVALID_FORMAT, BAD_REQUEST, UNAUTHORIZED, RATE_LIMITED, FORBIDDEN, INTERNAL_ERROR,
// NOT_FOUND, REVOKED, NO_PASSWORD, WRONG_PASSWORD, DATA_DISABLED, EXPIRED.
// ---------- helpers ----------
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const DAY_MS = 86400000;
// Absolute expiry instant for a code: lifetime/none => null, not-yet-activated
// => null (caller falls back to the full day count), otherwise used_at + days.
// Sending the absolute instant lets the client store it verbatim, so repeated
// logins can never drift the countdown the way a re-computed day count does.
function expiryMs(rec: any): number | null {
  const days = Number(rec?.days) || 0;
  if (days <= 0) return null;
  if (!rec?.used_at) return null;
  return Date.parse(rec.used_at) + days * DAY_MS;
}
// Subscription length counts from first activation (used_at). Return how many
// days are actually left so a re-login can never reset the countdown.
// floor() is deliberate: rounding up would hand out up to one extra day on
// every single login.
function remainingDays(rec: any): number {
  const days = Number(rec?.days) || 0;
  if (days <= 0) return 0; // lifetime / none
  const end = expiryMs(rec);
  if (end == null) return days;
    return Math.max(0, Math.floor((end - Date.now()) / DAY_MS));
}

// ---------- unified account status composer (CONTRACT §2) ----------
/* Single source of truth for "what state is this account in". User list,
   user detail, admin actions and activation before/after all compose through
   this so the server can never disagree with itself about trial / free_trial
   / lifetime / expiry again (§10.4, §10.5 drift).
   rec  = codes row (license truth) or null for pure email accounts
   meta = auth user_metadata (may be null for code-only holders)
   opts.appSuspended = auth app_metadata.suspended (email kill switch)
   opts.couponUsed   = a redeemed coupon is attributed to this identity
                       (best-effort lookup done by the caller; the list
                       endpoint skips it to stay at one extra query). */

const iso = (ms: number) => new Date(ms).toISOString();

/* subStart/subEnd are MIXED across live rows: ISO strings on some, epoch-ms
   on others (§6). Accept both, plus epoch stored as text. */
function parseWhen(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v).trim();
  if (/^\d{10,15}$/.test(s)) { const n = Number(s); return n < 1e12 ? n * 1000 : n; }
  const t = Date.parse(s);
  return Number.isFinite(t) && t > 0 ? t : null;
}

// Only the legacy fake "now + 36500d" subEnd ever exceeds 4000 days (the
// widest real grant is days_custom at 3650) ⇒ read it as lifetime (§10.5).
const LIFETIME_MIN_MS = 4000 * DAY_MS;

/* Normalized metadata tier: free_trial IS a trial (§10.4 — the corrupted
   merge u.subTier||u.subscription lived client-side; server reads cleanly). */
function metaTier(meta: any): string {
  const raw = String(meta?.subTier || meta?.subscription || "").toLowerCase();
  return raw === "free_trial" ? "trial" : raw;
}

/* activationSource (§1): codes.source is authoritative when present
   (admin|self|trial|import — self-service activation IS a code activation,
   imports were admin tooling). Legacy rows with a null source are NEVER
   guessed: fall through to concrete evidence (trial metadata → redeemed
   coupon → used code), else literally "unknown" («غير معروف»). */
function activationSourceOf(rec: any, meta: any, couponUsed?: boolean): string {
  const tier = metaTier(meta);
  if (rec) {
    if (rec.source === "trial") return "trial";
    if (rec.source === "self") return "code";
    if (rec.source === "admin" || rec.source === "import") return "admin";
    if (tier === "trial") return "trial";
    if (couponUsed) return "coupon";
    if (rec.used) return "code";
    return "unknown";
  }
  if (tier === "trial") return "trial";
  if (tier && tier !== "none") return "admin";   // admin-written sub block, no code
  return "unknown";
}

function accountStatusOf(rec: any, meta: any, opts: { appSuspended?: boolean; couponUsed?: boolean } = {}) {
  const now = Date.now();
  const tier = metaTier(meta);
  const suspended = opts.appSuspended === true || rec?.account_suspended === true;

  let plan = "none", subStatus = "none", subStart: string | null = null, subEnd: string | null = null;
  let remainingDays: number | null = null, unlimited = false;

  if (rec && rec.used) {
    // License truth lives in the code row (§10.7) — metadata is only a mirror.
    const d = Math.floor(Number(rec.days) || 0);
    plan = d <= 0 || rec.tier === "lifetime" ? "lifetime"
      : rec.tier === "yearly" ? "yearly" : rec.tier === "trial" ? "trial" : "monthly";
    subStart = rec.used_at ? iso(Date.parse(rec.used_at)) : null;
    const end = expiryMs(rec);
    if (end != null) {
      subEnd = iso(end);
      remainingDays = Math.max(0, Math.floor((end - now) / DAY_MS));
      subStatus = end <= now ? "expired" : plan === "trial" ? "trial" : "active";
      if (end <= now) remainingDays = 0;
    } else if (!rec.used_at && d > 0) {
      // legacy row lost its used_at — expiryMs() contract grants the full day
      // count, mirror that instead of falsely advertising "unlimited"
      subStatus = "active"; remainingDays = d;
    } else {
      subStatus = "active"; unlimited = true;      // lifetime (days<=0) ⇒ subEnd null in OUTPUT
    }
  } else if (tier && tier !== "none") {
    const start = parseWhen(meta?.subStart);
    let end = parseWhen(meta?.subEnd);
    // lifetime ⇒ subEnd null in OUTPUT — both storage styles: the legacy fake
    // +36500d value AND the new subMeta style (subTier lifetime, subEnd null).
    // Before this fix a null-subEnd lifetime fell through and displayed as
    // "monthly" (live E2E caught it on set_unlimited).
    if (tier === "lifetime" || (end != null && end - (start ?? now) > LIFETIME_MIN_MS)) {
      end = null; plan = "lifetime"; unlimited = true;
    } else {
      plan = ["trial", "monthly", "yearly"].includes(tier) ? tier : "monthly";
    }
    subStart = start ? iso(start) : null;
    if (end == null) {
      subStatus = "active";
    } else {
      subEnd = iso(end);
      remainingDays = Math.max(0, Math.floor((end - now) / DAY_MS));
      subStatus = end <= now ? "expired" : tier === "trial" ? "trial" : "active";
      if (end <= now) remainingDays = 0;
    }
  } else if (rec) {
    // assigned-but-unactivated code with no metadata sub: name the plan the
    // licence will grant once activated; nothing is running yet.
    const d = Math.floor(Number(rec.days) || 0);
    plan = d <= 0 || rec.tier === "lifetime" ? "lifetime"
      : rec.tier === "yearly" ? "yearly" : rec.tier === "trial" ? "trial" : "monthly";
    unlimited = d <= 0;
  }

  return {
    accountStatus: suspended ? "suspended" : "allowed",
    subStatus, plan,
    activationSource: activationSourceOf(rec, meta, opts.couponUsed),
    codeUsed: rec?.code || null,
    activatedAt: subStart,
    subStart, subEnd, remainingDays, unlimited,
    deviceCount: rec && Array.isArray(rec.devices) ? rec.devices.length : 0,
    deviceLimit: rec ? (Number(rec.device_limit) || 3) : 0,
    codeState: rec ? (rec.revoked ? "revoked" : !rec.used ? "unused"
      : (expiryMs(rec) !== null && (expiryMs(rec) as number) <= now) ? "code-expired" : "used") : null,
  };
}

/* The one code row that represents an identity in listings/actions: the
   active licence (used, not revoked, most recent activation) else the newest. */
function pickPrimaryCode(rows: any[]): any | null {
  const used = (rows || []).filter((r) => r.used && !r.revoked)
    .sort((a, b) => (Date.parse(b.used_at) || 0) - (Date.parse(a.used_at) || 0));
  if (used[0]) return used[0];
  return (rows || []).slice()
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))[0] || null;
}

/* Re-time a code row so its window ends exactly at `endMs` (server clock).
   Prefers keeping used_at and rewriting days (§3.2 "used_at stays"); falls
   back to shifting used_at when the implied day count would read as
   unlimited — days<=0 is the lifetime sentinel in expiryMs(), so an admin
   "shorten to 0" must never mint an accidental lifetime licence. */
function codeWindowPatch(rec: any, endMs: number | null): Record<string, any> {
  if (endMs == null) return { used: true, days: 0 };            // lifetime / unlimited
  const usedMs = rec?.used_at ? Date.parse(rec.used_at) : null;
  if (usedMs != null) {
    const d = Math.floor((endMs - usedMs) / DAY_MS);
    if (d >= 1) return { used: true, days: d };                 // used_at stays
  }
  const len = Math.max(1, Math.floor(Number(rec?.days) || 0));
  return { used: true, used_at: iso(endMs - len * DAY_MS), days: len };
}

/* Metadata sub-block mirroring a code row — written after every code-side
   mutation so email sessions (whose composer falls back to metadata while
   the code is unused) and the admin drawer agree with the license truth.
   Lifetime writes subEnd:null — never the fake +36500d again (§10.5). */
function subBlockFromCode(rec: any) {
  const end = expiryMs(rec);
  return {
    subscription: rec.tier === "lifetime" ? "active" : rec.tier,
    subTier: rec.tier,
    subStart: rec.used_at ? iso(Date.parse(rec.used_at)) : null,
    subEnd: end != null ? iso(end) : null,
    days: Math.max(0, Math.floor(Number(rec.days) || 0)),
  };
}

/* All code rows bound to an auth user (owner join by "user:<uuid>" OR the
   lowercased email — the only two formats this server writes). */
async function ownedCodesFor(user: any): Promise<any[]> {
  const owners = [`user:${user.id}`];
  if (user.email) owners.push(String(user.email).toLowerCase());
  const { data } = await sb.from("codes").select("*").in("owner", owners);
  return data || [];
}

// For gym data, sync-on codes share one row (device_id ''); sync-off codes
// keep an isolated per-device row keyed by the real device id.
// A missing code row now yields revoked=true (JWT must not outlive deletion).
// Expired licenses are ENFORCED here ("expired" flag) — before this, expiry was
// a client-side-only check, so a 30-day JWT kept full cloud R/W forever.
// `suspended` (migration 0011 codes.account_suspended) is the code-account
// kill switch enforced on every sync read/write (contract §6).
// select("*") so newly added columns ride along without editing this list.
// Placed AFTER expiryMs() — function temps would hoist anyway, but reading
// order matters for humans.
async function codeFlags(p: any): Promise<{ sync: boolean; data: boolean; revoked: boolean; expired: boolean; suspended: boolean }> {
  if (!p || !p.code) return { sync: true, data: true, revoked: true, expired: false, suspended: false };
  const { data: rec } = await sb.from("codes").select("*").eq("code", p.code).maybeSingle();
  return {
    sync: rec ? (rec.sync_enabled !== false) : true,
    data: rec ? (rec.data_enabled !== false) : true,
    revoked: !rec ? true : !!rec.revoked,
    expired: !!rec && expiryMs(rec) !== null && (expiryMs(rec) as number) <= Date.now(),
    suspended: !!rec && rec.account_suspended === true,
  };
}
const normCode = (raw: string) =>
  String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
// Cryptographically strong randomness. These codes are the only thing standing
// between a stranger and a paying customer's data, so Math.random() (a
// predictable PRNG) is not acceptable here.
// The draw is uniform because ALPHA has exactly 32 entries and 256 % 32 === 0.
// If the alphabet ever changes size, switch to rejection sampling to avoid bias.
const randChars = (n: number) => {
  const out: string[] = [];
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  for (let i = 0; i < n; i++) out.push(ALPHA[buf[i] % ALPHA.length]);
  return out.join("");
};
const randomCode = () => randChars(6);

// Build a subscription block for user_metadata from a desired tier + days.
// subEnd is computed from NOW so "stays open N days" always holds.
function subMeta(tierRaw: any, daysRaw: any) {
  const tier = ["trial", "monthly", "yearly", "lifetime", "none"].includes(tierRaw)
    ? tierRaw : "monthly";
  const now = Date.now();
  // v1.4.8 batch: trial default 30 (was 14) — aligns with the "30-day free
  // trial" the client advertises and /api/users trial filters assume.
  const days = tier === "none" || tier === "lifetime"
    ? 0
    : Math.max(1, Math.floor(Number(daysRaw) || (tier === "monthly" ? 30 : tier === "yearly" ? 365 : tier === "trial" ? 30 : 30)));
  // lifetime ⇒ subEnd NULL (contract §10.5): the old fake now+36500d value
  // rendered as year 2126 / "36500 days" everywhere and made the unlimited
  // branch unreachable. Existing fake values are read as lifetime by the
  // composer; new writes stop producing them.
  const subEnd = tier === "lifetime" || tier === "none" ? null : now + days * 86400000;
  return {
    subscription: tier === "lifetime" ? "active" : tier,   // 'trial' stays 'trial'
    subTier: tier,
    subStart: new Date(now).toISOString(),
    subEnd: subEnd ? new Date(subEnd).toISOString() : null,
    days,
  };
}

const signJwt = (payload: Record<string, unknown>, admin = false): string =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: admin ? "12h" : "30d", algorithm: "HS256" });

// constant-time string compare (length leaks only) — for admin credential check
const safeEqual = (a: string, b: string): boolean => {
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
};

function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const clean = token.replace(/^Bearer\s+/i, "");
    // Pin the algorithm — never trust whatever the token header claims.
    return jwt.verify(clean, JWT_SECRET, { algorithms: ["HS256"] }) as Record<string, unknown>;
  } catch { return null; }
}

function toRecord(r: any) {
  return {
    code: r.code, tier: r.tier, days: r.days, owner: r.owner, note: r.note,
    used: r.used, revoked: r.revoked,
    expiresAt: expiryMs(r),   // absolute ms; client stores verbatim (no day drift)
    usedAt: r.used_at ? new Date(r.used_at).getTime() : null,
    usedDevice: r.used_device, usedDeviceName: r.used_device_name,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
    data_enabled: r.data_enabled !== false,
    sync_enabled: r.sync_enabled !== false,
    device_limit: Number(r.device_limit) || 3,
    devices: Array.isArray(r.devices) ? r.devices : [],
    // Composer status (contract §2/§3.3) — additive so existing panel fields
    // keep working while the UI migrates to consuming `status` directly.
    status: accountStatusOf(r, null),
  };
}

// Slimed-down record for CLIENTS (activate/login/mine). toRecord() is for the
// admin panel. Client-side trims away the admin's private note and the device
// roster — owner stays because the client-side cloud guard needs it.
function toClientRecord(r: any) {
  return {
    code: r.code, tier: r.tier, days: r.days,
    owner: String(r.owner || ""),
    // owner IS included: js/store.js cloudAllowed() matches it against the
    // signed-in session to keep one account's data out of another account's
    // cloud. The code holder learns their own email/uuid — not sensitive
    // extra data. NOT included: note (internal), devices, used_at usage data,
    // used_device — those are admin-only and stay in toRecord().
    expiresAt: expiryMs(r),
    data_enabled: r.data_enabled !== false,
    sync_enabled: r.sync_enabled !== false,
    device_limit: Number(r.device_limit) || 3,
  };
}

// ---------- multi-device gym data merge ----------
const GYM_COLLECTIONS = ["members", "devices", "trainers", "ledger"];
const tsOf = (it: any): number => Number(it?.updatedAt) || Number(it?.createdAt) || 0;

function mergeGymData(existing: any, incoming: any): any {
  const out: any = {};
  const tomb: Record<string, Record<string, number>> = { ...(existing?._tombstones || {}) };
  const incTomb = incoming?._tombstones || {};
  for (const c of Object.keys(incTomb)) {
    tomb[c] = tomb[c] || {};
    for (const id of Object.keys(incTomb[c])) {
      const t = Number(incTomb[c][id]) || 0;
      if (!tomb[c][id] || t > tomb[c][id]) tomb[c][id] = t;
    }
  }
  for (const c of GYM_COLLECTIONS) {
    const ex = Array.isArray(existing?.[c]) ? existing[c] : [];
    const inc = Array.isArray(incoming?.[c]) ? incoming[c] : [];
    const map = new Map<string, any>();
    const exMap = new Map(ex.map((x: any) => [x.id, x]));
    const incMap = new Map(inc.map((x: any) => [x.id, x]));
    const ids = new Set<string>([...exMap.keys(), ...incMap.keys()]);
    ids.forEach((id) => {
      const e = exMap.get(id);
      const i = incMap.get(id);
      let winner: any;
      if (!e) winner = i;
      else if (!i) winner = e;
      else winner = tsOf(i) > tsOf(e) ? i : e;
      const t = (tomb[c] || {})[id];
      if (t && tsOf(winner) <= t) return; // deleted (tombstone wins)
      if (winner && !winner.photo) {
        const other = winner === e ? i : e;
        if (other && other.photo) winner = { ...winner, photo: other.photo };
      }
      if (winner) map.set(id, winner);
    });
    out[c] = [...map.values()];
  }
  out._tombstones = tomb;
  return out;
}

// ---------- bounded, self-sweeping rate limiters ----------
// A Map keyed by client IP grows without limit under a flood of unique source
// IPs, and Deno isolates are recycled lazily. Each limiter now caps its own size
// and drops expired entries on a timer, so memory stays flat.
type Bucket = { n: number; t: number };
function limiter(max: number, windowMs: number, cap = 5000) {
  const m = new Map<string, Bucket>();
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of m) if (now - v.t > windowMs) m.delete(k);
    while (m.size > cap) {                       // flood guard: drop oldest first
      const oldest = m.keys().next();
      if (oldest.done) break;
      m.delete(oldest.value);
    }
  };
  const timer: any = setInterval(sweep, Math.max(30_000, windowMs));
  timer?.unref?.();                              // never keep the isolate alive for this
  return {
    blocked(k: string) {
      const b = m.get(k);
      if (!b) return false;
      if (Date.now() - b.t > windowMs) { m.delete(k); return false; }
      return b.n >= max;
    },
    hit(k: string) {
      const b = m.get(k) || { n: 0, t: Date.now() };
      b.n += 1; b.t = Date.now(); m.set(k, b);
    },
    clear(k: string) { m.delete(k); },
  };
}

const MAX_TRIES = 8, LOCK_MS = 15 * 60 * 1000;
const loginLimiter = limiter(MAX_TRIES, LOCK_MS);
const tooMany = (ip: string) => loginLimiter.blocked(ip);
const failIp = (ip: string) => loginLimiter.hit(ip);
const clearIp = (ip: string) => loginLimiter.clear(ip);

// per-code activation limit (NAT-safe: keyed by code, not by a shared IP)
const actLimiter = limiter(20, LOCK_MS);
const tooManyCode = (code: string) => actLimiter.blocked(code);
const failCode = (code: string) => actLimiter.hit(code);
const clearCode = (code: string) => actLimiter.clear(code);

// JWT re-mint limiter (/api/auth/refresh). The real gate is the registered
// deviceId check — this cap just blunts brute-force noise on the endpoint.
const refreshLimiter = limiter(30, LOCK_MS);

// free-trial issuance cap — deviceId is client-controlled and clearable, so the
// per-IP cap is the real anti-abuse boundary. Keyed by clientIp (never per "TRIAL").
const TRIAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const trialLimiter = limiter(3, TRIAL_WINDOW_MS, 2000);
const tooManyTrials = (ip: string) => trialLimiter.blocked(ip);
const noteTrial = (ip: string) => trialLimiter.hit(ip);

// Admin API rate limiters — stricter limits for sensitive admin operations
const ADMIN_WINDOW_MS = 60 * 1000; // 1 minute window
const ADMIN_MAX_REQUESTS = 30; // 30 requests per minute per IP
const adminLimiter = limiter(ADMIN_MAX_REQUESTS, ADMIN_WINDOW_MS, 1000);
const tooManyAdmin = (ip: string) => adminLimiter.blocked(ip);
const failAdminIp = (ip: string) => adminLimiter.hit(ip);
const clearAdminIp = (ip: string) => adminLimiter.clear(ip);

// Stricter limiter for destructive admin operations
const ADMIN_DESTRUCTIVE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ADMIN_DESTRUCTIVE_MAX = 5; // 5 destructive ops per 5 min
const adminDestructiveLimiter = limiter(ADMIN_DESTRUCTIVE_MAX, ADMIN_DESTRUCTIVE_WINDOW_MS, 100);
const tooManyAdminDestructive = (ip: string) => adminDestructiveLimiter.blocked(ip);
const failAdminDestructiveIp = (ip: string) => adminDestructiveLimiter.hit(ip);

// Client IP for rate limiting. Prefer x-real-ip (trusted proxy); otherwise take
// the LAST x-forwarded-for hop — the gateway/CDN appends the real client IP after
// whatever the client sent, so reading the first entry lets an attacker rotate a
// spoofed value and bypass the login lockout.
const clientIp = (req: Request) => {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = req.headers.get("x-forwarded-for");
  const hops = xff ? xff.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return hops[hops.length - 1] || "unknown";
};

// ---------- CORS ----------
function corsHeaders(origin?: string | null) {
  const o = origin || "";
  const allow = o && (ALLOWED_ORIGINS.includes(o) || APP_ORIGINS.has(o));
  return {
    "Access-Control-Allow-Origin": allow ? o : "null",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Max-Age": "3600",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'self'",
    "Cache-Control": "no-store",
  };
}

function json(data: unknown, status = 200, origin?: string | null, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin), ...(extraHeaders || {}) },
  });
}

function authJwt(req: Request): Record<string, unknown> | null {
  const h = req.headers.get("authorization") || "";
  return verifyJwt(h);
}
function authAdmin(req: Request): boolean {
  const p = authJwt(req);
  return !!p && p.admin === true;
}
/* Email/password sessions (Supabase Auth) carry no activation code, and all
   cloud gym data is keyed by code — so those users must be able to discover
   (or mint) a server code bound to their auth user id. This verifies the
   Supabase access token sent by the client; returns null on any failure. */
async function supaUser(req: Request) {
  const h = (req.headers.get("authorization") || "").replace(/^bearer\s+/i, "").trim();
  if (!h || h.length > 4096) return null;
  try {
    const { data, error } = await sb.auth.getUser(h);
    if (error || !data?.user?.id) return null;
    return data.user;
  } catch { return null; }
}

// ---------- coupons ----------
function toCoupon(r: any) {
  return {
    id: r.id,
    code: r.code, kind: r.kind, value: r.value, description: r.description,
    used: r.used, usedBy: r.used_by,
    usedAt: r.used_at ? new Date(r.used_at).getTime() : null,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
  };
}
/** Subscription tier a coupon grants, or null for a plain percent discount.
 *  days_custom grants a monthly-tier subscription that lasts exactly value days. */
function couponTier(c: any): string | null {
  return c.kind === "days_14" ? "trial" : c.kind === "days_30" ? "monthly" : c.kind === "days_365" ? "yearly" : c.kind === "days_custom" ? "monthly" : null;
}
function couponDays(c: any): number {
  return c.kind === "days_14" ? 14 : c.kind === "days_30" ? 30 : c.kind === "days_365" ? 365 : c.kind === "days_custom" ? Math.max(1, Math.floor(Number(c.value) || 0)) : 0;
}

// ---------- Audit & Error Logging Helpers ----------
function sanitizeForLogging(input: any): any {
  if (!input || typeof input !== 'object') return input;
  const sensitiveKeys = [
    'password', 'pass_hash', 'new_password', 'current_password', 'next_password',
    'token', 'access_token', 'refresh_token', 'auth_token', 'jwt', 'authorization',
    'secret', 'key', 'api_key', 'apikey',
    'credit_card', 'card_number', 'cvv', 'ssn', 'national_id',
    'phone', 'mobile', 'telephone', 'address', 'location'
  ];
  const result = Array.isArray(input) ? [...input] : { ...input };
  for (const key of sensitiveKeys) {
    if (key in result) {
      result[key] = '***REDACTED***';
    }
  }
  return result;
}

async function logAdminAction(adminEmail: string, action: string, targetType: string | null, targetId: string | null, details: any, req: Request) {
  try {
    await sb.from("admin_audit_log").insert({
      admin_email: adminEmail,
      action,
      target_type: targetType,
      target_id: targetId,
      details: sanitizeForLogging(details),
      ip_address: clientIp(req),
      user_agent: req.headers.get("user-agent") || null,
    });
  } catch (e) {
    console.error("[audit log failed]", e);
  }
}

async function logError(endpoint: string, method: string, errorCode: string, errorMessage: string, stackTrace: string | null, req: Request, extra: { userCode?: string; userId?: string; gymCode?: string; requestBody?: any; traceId?: string } = {}) {
  try {
    await sb.from("error_log").insert({
      endpoint,
      method,
      error_code: errorCode,
      // traceId rides in the message: error_log has no trace column (and the
      // migration set is owned elsewhere) — this keeps the request's trace
      // correlatable with the >=400 body that carried the same id.
      error_message: errorMessage + (extra.traceId ? ` [trace ${extra.traceId}]` : ""),
      stack_trace: stackTrace,
      user_code: extra.userCode || null,
      user_id: extra.userId || null,
      gym_code: extra.gymCode || null,
      ip_address: clientIp(req),
      user_agent: req.headers.get("user-agent") || null,
      request_body: sanitizeForLogging(extra.requestBody || null),
    });
  } catch (e) {
    console.error("[error log failed]", e);
  }
}

function extractAuthContext(req: Request, p: Record<string, unknown> | null): { userCode?: string; userId?: string; gymCode?: string } {
  const ctx: { userCode?: string; userId?: string; gymCode?: string } = {};
  if (p) {
    if (p.code) ctx.userCode = String(p.code).slice(0, 6);
    if (p.sub) ctx.userId = String(p.sub).slice(0, 8);
  }
  // Try to get gym code from auth JWT if present
  return ctx;
}

// ---------- main ----------
async function runUserOp(userId, body, req, origin) {
  if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
  const { data: ed } = await sb.auth.admin.getUserById(userId);
  const existing = ed?.user;
  if (!existing) return json({ error: "NOT_FOUND" }, 404, origin);
  const op = String(body?.op || "");
        // sole-admin guard: never suspend/terminate/delete the admin account
        if (String(existing.email || "").toLowerCase() === ADMIN_EMAIL && ["suspend","terminate","delete","set_plan","set_unlimited","adjust_days","set_remaining","set_end"].includes(op)) {
          // allow read-only-ish ops? suspend/terminate/delete are blocked; others allowed but logged
          if (["suspend","terminate","delete"].includes(op)) return json({ error: "FORBIDDEN", message: "Cannot modify the sole admin account" }, 403, origin);
        }
        const { data: codeRows } = await sb.from("codes").select("*").or(`owner.eq.user:${userId},owner.eq.${String(existing.email || "").toLowerCase()}`);
        const primary = pickPrimaryCode(codeRows || []);
        const before = accountStatusOf(primary, existing.user_metadata || {}, { appSuspended: !!existing.app_metadata?.suspended });
        let after: any = before;
        let action = op;

        if (op === "suspend") {
          const meta = { ...existing.app_metadata, suspended: true };
          await sb.auth.admin.updateUserById(userId, { app_metadata: meta });
          if (primary) await sb.from("codes").update({ account_suspended: true, suspended_at: new Date().toISOString(), suspended_by: ADMIN_EMAIL }).eq("code", primary.code);
          action = "suspend_user";
        } else if (op === "reactivate") {
          const meta = { ...existing.app_metadata, suspended: false };
          await sb.auth.admin.updateUserById(userId, { app_metadata: meta });
          if (primary) await sb.from("codes").update({ account_suspended: false, suspended_at: null, suspended_by: null }).eq("code", primary.code);
          action = "reactivate_user";
        } else if (op === "terminate") {
          // expire now: code row + metadata
          if (primary) {
            const p = codeWindowPatch(primary, Date.now());
            await sb.from("codes").update(p).eq("code", primary.code);
          }
          const meta = { ...(existing.user_metadata || {}) };
          meta.subscription = "none"; meta.subTier = "none"; meta.subEnd = new Date().toISOString(); meta.days = 0;
          await sb.auth.admin.updateUserById(userId, { user_metadata: meta });
          action = "terminate_subscription";
        } else if (op === "set_unlimited") {
          if (primary) await sb.from("codes").update({ tier: "lifetime", days: 0 }).eq("code", primary.code);
          const meta = { ...(existing.user_metadata || {}) };
          meta.subscription = "active"; meta.subTier = "lifetime"; meta.subEnd = null; meta.days = 0;
          await sb.auth.admin.updateUserById(userId, { user_metadata: meta });
          action = "set_unlimited";
        } else if (op === "set_plan") {
          const tier = ["trial","monthly","yearly","lifetime"].includes(body?.tier) ? body.tier : "monthly";
          const days = tier === "lifetime" ? 0 : tier === "yearly" ? 365 : tier === "trial" ? 30 : 30;
          if (primary) await sb.from("codes").update({ tier, days }).eq("code", primary.code);
          const meta = { ...(existing.user_metadata || {}) };
          meta.subscription = tier === "lifetime" ? "active" : tier;
          meta.subTier = tier; meta.days = days;
          if (tier !== "lifetime") meta.subEnd = new Date(Date.now() + days * DAY_MS).toISOString();
          else meta.subEnd = null;
          await sb.auth.admin.updateUserById(userId, { user_metadata: meta });
          action = "set_plan";
        } else if (op === "adjust_days") {
          // server-clock math on the active CODE row (used_at/days)
          const n = Math.floor(Number(body?.days) || 0);
          if (primary) {
            const end = expiryMs(primary);
            const base = (end != null && end > Date.now()) ? end : Date.now();
            const newEnd = base + n * DAY_MS;
            const p = codeWindowPatch(primary, newEnd);
            await sb.from("codes").update(p).eq("code", primary.code);
          }
          const meta = { ...(existing.user_metadata || {}) };
          const curEnd = parseWhen(meta.subEnd);
          const fake = curEnd != null && (meta.subTier === "lifetime" || (curEnd - (parseWhen(meta.subStart) ?? Date.now())) > LIFETIME_MIN_MS);
          const base = (!fake && curEnd != null && curEnd > Date.now()) ? curEnd : Date.now();
          meta.subEnd = new Date(base + n * DAY_MS).toISOString();
          await sb.auth.admin.updateUserById(userId, { user_metadata: meta });
          action = "adjust_days";
        } else if (op === "set_remaining") {
          const n = Math.max(0, Math.floor(Number(body?.days) || 0));
          const newEnd = Date.now() + n * DAY_MS;
          if (primary) {
            const p = codeWindowPatch(primary, newEnd);
            await sb.from("codes").update(p).eq("code", primary.code);
          }
          const meta = { ...(existing.user_metadata || {}) };
          meta.subEnd = new Date(newEnd).toISOString();
          await sb.auth.admin.updateUserById(userId, { user_metadata: meta });
          action = "set_remaining";
        } else if (op === "set_end") {
          const endMs = parseWhen(body?.end) ?? Date.now();
          if (primary) {
            const p = codeWindowPatch(primary, endMs);
            await sb.from("codes").update(p).eq("code", primary.code);
          }
          const meta = { ...(existing.user_metadata || {}) };
          meta.subEnd = new Date(endMs).toISOString();
          await sb.auth.admin.updateUserById(userId, { user_metadata: meta });
          action = "set_end";
        } else {
          return json({ error: "INVALID_OP" }, 400, origin);
        }

        // refresh primary after mutation for `after`
        const { data: codeRows2 } = await sb.from("codes").select("*").or(`owner.eq.user:${userId},owner.eq.${String(existing.email || "").toLowerCase()}`);
        const primary2 = pickPrimaryCode(codeRows2 || []);
        const { data: ed2 } = await sb.auth.admin.getUserById(userId);
        after = accountStatusOf(primary2, ed2?.user?.user_metadata || {}, { appSuspended: !!ed2?.user?.app_metadata?.suspended });
        await logAdminAction(ADMIN_EMAIL, action, "user", userId, { op, before, after, reason: body?.reason || null }, req);
        return json({ ok: true, id: userId, before, after, op }, 200, origin);
}


async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  const url = new URL(req.url);
  let path = url.pathname;
  const idx = path.indexOf("/api");
  if (idx >= 0) path = path.slice(idx);

  let body: any = null;
  let rawBody = "";
  if (req.method !== "GET" && req.method !== "HEAD") {
    rawBody = await req.text();
    if (rawBody.length > 2_000_000) return json({ error: "PAYLOAD_TOO_LARGE" }, 413, origin);
    try { body = rawBody ? JSON.parse(rawBody) : null; } catch { body = null; }
  }

  try {
    /* health */
    if (req.method === "GET" && path === "/api/health") {
      return json({ ok: true, uptime: 0 }, 200, origin);
    }

    /* 
     * ACTIVATION CODES DISABLED — Admin-only activation via /api/codes (admin creates codes)
     * Existing activated codes continue to work for login/mine/gym operations.
     * Public trial/activation endpoints are disabled.
     */
    if (req.method === "POST" && path === "/api/trial") {
      return json({ 
        error: "ACTIVATION_DISABLED", 
        message: "Public trial codes are disabled. Contact your administrator for account setup." 
      }, 403, origin);
    }

    /* POST /api/auth/activate — RE-ENABLED (v1.4.5).
       Identity comes ONLY from a trusted session (Supabase bearer) or an
       existing code-JWT. No anonymous activation. Implements the contract
       in docs/CONTRACT-activation-v1445.md §3.1. */
    if (req.method === "POST" && path === "/api/auth/activate") {
      const ip = clientIp(req);
      const traceId = crypto.randomUUID();
      if (tooMany(ip)) return json({ error: "RATE_LIMITED", secs: LOCK_MS / 1000, traceId }, 429, origin);
      // identity resolution
      const su = await supaUser(req);
      const pJwt = authJwt(req);
      let identity: { kind: "email"; id: string; email: string; appSuspended: boolean; meta: any } | { kind: "code"; code: string; deviceId: string; meta: any } | null = null;
      if (su?.id) {
        const { data: u } = await sb.auth.admin.getUserById(su.id);
        identity = { kind: "email", id: su.id, email: String(su.email || "").toLowerCase(),
          appSuspended: !!(u?.user?.app_metadata as any)?.suspended, meta: u?.user?.user_metadata };
      } else if (pJwt?.code) {
        const { data: rec } = await sb.from("codes").select("*").eq("code", pJwt.code).maybeSingle();
        if (rec) identity = { kind: "code", code: rec.code, deviceId: String(pJwt.deviceId || ""), meta: null };
      }
      if (!identity) { failIp(ip); return json({ error: "UNAUTHORIZED", traceId }, 401, origin); }
      const newCodeRaw = normCode(body?.code);
      if (!newCodeRaw || newCodeRaw.length < 4) return json({ error: "INVALID_FORMAT", traceId }, 400, origin);
      const devId = String(body?.deviceId || (identity.kind === "code" ? identity.deviceId : "")).slice(0, 80);
      const devName = String(body?.deviceName || "Web App").slice(0, 40);
      if (!devId) return json({ error: "BAD_REQUEST", traceId }, 400, origin);

      const { data: rec } = await sb.from("codes").select("*").eq("code", newCodeRaw).maybeSingle();
      if (!rec) return json({ error: "CODE_NOT_FOUND", traceId }, 404, origin);
      if (rec.revoked) return json({ error: "CODE_REVOKED", traceId }, 403, origin);
      const codeExpired = expiryMs(rec) !== null && (expiryMs(rec) as number) <= Date.now();
      if (codeExpired) return json({ error: "CODE_EXPIRED", traceId }, 403, origin);

      // suspension gate (both sources)
      let suspended = false;
      if (identity.kind === "email") suspended = identity.appSuspended;
      else {
        const { data: cur } = await sb.from("codes").select("account_suspended").eq("code", identity.code).maybeSingle();
        suspended = !!cur?.account_suspended;
      }
      if (suspended || rec.account_suspended === true) return json({ error: "SUSPENDED", traceId }, 403, origin);

      // binding gate — no owner leak
      const codeOwner = String(rec.owner || "").toLowerCase();
      const acceptable = new Set<string>();
      if (identity.kind === "email") { acceptable.add(identity.email); acceptable.add(`user:${identity.id}`); }
      else acceptable.add(String((await sb.from("codes").select("owner").eq("code", identity.code).maybeSingle()).data?.owner || "").toLowerCase());
      if (codeOwner && !acceptable.has(codeOwner)) return json({ error: "CODE_BOUND_TO_OTHER", traceId }, 403, origin);

      // idempotent retry: same identity already consumed this code
      if (rec.used) {
        const okClaimed = !codeOwner || acceptable.has(codeOwner);
        if (okClaimed) {
          const token = await signJwt({ code: rec.code, deviceId: devId });
          clearIp(ip);
          return json({ ok: true, idempotent: true, record: toClientRecord(rec), token,
            before: accountStatusOf(rec, identity.kind === "email" ? identity.meta : null, { appSuspended: identity.kind === "email" ? identity.appSuspended : false }),
            after: accountStatusOf(rec, identity.kind === "email" ? identity.meta : null, { appSuspended: identity.kind === "email" ? identity.appSuspended : false }),
            traceId }, 200, origin);
        }
        return json({ error: "CODE_ALREADY_USED", traceId }, 409, origin);
      }

      // device limit
      const devices: any[] = Array.isArray(rec.devices) ? rec.devices : [];
      const existingDev = devices.find((d: any) => d.deviceId === devId);
      const limit = Number(rec.device_limit) || 3;
      if (!existingDev && devices.length >= limit) return json({ error: "DEVICE_LIMIT", limit, traceId }, 429, origin);

      // renewal: preserve remaining days of the previous licence
      const now = Date.now();
      let usedAtMs = now;
      if (identity.kind === "code") {
        const { data: oldRec } = await sb.from("codes").select("*").eq("code", identity.code).maybeSingle();
        const oldEnd = oldRec ? expiryMs(oldRec) : null;
        if (oldEnd != null && oldEnd > now) usedAtMs = oldEnd; // backdate so window extends from old end
      } else if (identity.kind === "email") {
        const oldEnd = parseWhen(identity.meta?.subEnd);
        const start = parseWhen(identity.meta?.subStart);
        const fakeLifetime = oldEnd != null && (identity.meta?.subTier === "lifetime" || (oldEnd - (start ?? now)) > LIFETIME_MIN_MS);
        if (oldEnd != null && !fakeLifetime && oldEnd > now) usedAtMs = oldEnd;
      }

      // atomic claim
      const claimUpdate: any = {
        used: true, used_at: iso(usedAtMs), used_device: devId, used_device_name: devName,
        devices: existingDev ? devices : [...devices, { deviceId: devId, name: devName, at: now }],
      };
      if (!rec.owner) claimUpdate.owner = identity.kind === "email" ? identity.email : `user:${identity.code}`;
      if (!rec.source) claimUpdate.source = "self";
      const { data: claimed, error: claimErr } = await sb.from("codes")
        .update(claimUpdate).eq("code", newCodeRaw).eq("used", false).select("*");
      if (claimErr) { logError("/api/auth/activate","POST","INTERNAL_ERROR",claimErr.message,null,req,{traceId}); return json({ error: "INTERNAL_ERROR", traceId }, 500, origin); }
      if (!claimed || claimed.length === 0) return json({ error: "CODE_ALREADY_USED", traceId }, 409, origin);
      const newRec = claimed[0];

      // gyms continuity: copy old code's shared gym rows + drive_tokens to new key
      let dataMoved = false;
      try {
        const oldCode = identity.kind === "code" ? identity.code : null;
        // email holders: find their most recent used code (if any) as the source
        let srcCode = oldCode;
        if (!srcCode && identity.kind === "email") {
          const rows = await ownedCodesFor({ id: identity.id, email: identity.email });
          const used = rows.filter((r: any) => r.used && !r.revoked && r.code !== newRec.code)
            .sort((a: any, b: any) => (Date.parse(b.used_at) || 0) - (Date.parse(a.used_at) || 0));
          srcCode = used[0]?.code || null;
        }
        if (srcCode && srcCode !== newRec.code) {
          const { data: gymRows } = await sb.from("gyms").select("*").eq("code", srcCode);
          if (gymRows && gymRows.length) {
            for (const g of gymRows) {
              await sb.from("gyms").upsert({ code: newRec.code, device_id: g.device_id, data: g.data, saved_at: g.saved_at }, { onConflict: "code,device_id" });
            }
            dataMoved = true;
          }
          const { data: dt } = await sb.from("drive_tokens").select("*").eq("code", srcCode).maybeSingle();
          if (dt) {
            const copy = { ...dt, code: newRec.code };
            delete copy.created_at; delete copy.updated_at;
            await sb.from("drive_tokens").upsert(copy, { onConflict: "code" });
          }
        }
      } catch (e) { logError("/api/auth/activate","POST","GYMS_COPY_FAILED", String(e), null, req, { traceId, userCode: newRec.code }); }

      // subscription update for email holders (metadata mirror)
      if (identity.kind === "email") {
        const meta = identity.meta || {};
        const sub = subBlockFromCode(newRec);
        // preserve remaining days if the previous subscription was still active
        const oldEnd = parseWhen(meta.subEnd);
        const fakeLifetime = oldEnd != null && (meta.subTier === "lifetime" || (oldEnd - (parseWhen(meta.subStart) ?? now)) > LIFETIME_MIN_MS);
        if (oldEnd != null && !fakeLifetime && oldEnd > now && sub.subEnd) {
          const newEnd = new Date(oldEnd + (Number(newRec.days) || 0) * DAY_MS).toISOString();
          sub.subEnd = newEnd;
          sub.subStart = meta.subStart || sub.subStart;
        }
        await sb.auth.admin.updateUserById(identity.id, { user_metadata: { ...meta, ...sub } });
      }

      const token = await signJwt({ code: newRec.code, deviceId: devId });
      clearIp(ip);
      const beforeMeta = identity.kind === "email" ? identity.meta : null;
      const beforeApp = identity.kind === "email" ? identity.appSuspended : (await sb.from("codes").select("account_suspended").eq("code", identity.kind === "code" ? identity.code : newRec.code).maybeSingle()).data?.account_suspended === true;
      return json({ ok: true, record: toClientRecord(newRec), token,
        before: accountStatusOf(rec, beforeMeta, { appSuspended: beforeApp }),
        after: accountStatusOf(newRec, identity.kind === "email" ? { ...(identity.meta || {}), ...subBlockFromCode(newRec) } : null, { appSuspended: identity.kind === "email" ? identity.appSuspended : rec.account_suspended === true }),
        dataMoved, traceId }, 200, origin, dataMoved ? { "X-Data-Moved": "true" } : undefined);
    }

    /* client login */
    if (req.method === "POST" && path === "/api/auth/login") {
      const ip = clientIp(req);
      if (tooMany(ip)) return json({ error: "RATE_LIMITED", secs: LOCK_MS / 1000 }, 429, origin);
      const code = normCode(body?.code);
      const { data: rec } = await sb.from("codes").select("*").eq("code", code).maybeSingle();
      if (!rec || !rec.used) { failIp(ip); return json({ error: "NOT_FOUND" }, 404, origin); }
      if (rec.revoked) { failIp(ip); return json({ error: "REVOKED" }, 403, origin); }
      if (rec.account_suspended === true) { failIp(ip); return json({ error: "SUSPENDED" }, 403, origin); }
      if (!rec.pass_hash) return json({ error: "NO_PASSWORD" }, 400, origin);
      // Credentials gate; expiry gate below — never let an expired licence in.
      const ok = await bcrypt.compare(String(body?.password || ""), rec.pass_hash);
      if (!ok) { failIp(ip); return json({ error: "WRONG_PASSWORD" }, 401, origin); }
      clearIp(ip);
      const devId = String(body?.deviceId || "").slice(0, 80);
      const record = toClientRecord(rec);
      record.days = remainingDays(rec); // login must not reset the countdown
      const loginEnd = expiryMs(rec);
      if (loginEnd !== null && loginEnd <= Date.now()) {
        return json({ ok: true, record, expired: true, token: await signJwt({ code: rec.code, deviceId: devId }) }, 200, origin);
      }
      return json({ ok: true, record, token: await signJwt({ code: rec.code, deviceId: devId }) }, 200, origin);
    }

    /* JWT re-mint for expired/lost/rotated tokens — code-only recovery.
       The client calls this when a sync 401s and no Supabase email session
       exists (/api/auth/activate is disabled, /api/auth/mine needs a live
       auth session). Trust gate: the deviceId must ALREADY be registered to
       the code (the same devices array /api/auth/mine writes) — a stolen
       code alone never mints a token for a new device. Deliberately does NOT
       require the old JWT: recovering from a dead token is the whole point. */
    if (req.method === "POST" && path === "/api/auth/refresh") {
      const ip = clientIp(req);
      if (refreshLimiter.blocked(ip)) return json({ error: "RATE_LIMITED", secs: LOCK_MS / 1000 }, 429, origin);
      refreshLimiter.hit(ip);
      const code = normCode(body?.code);
      const devId = String(body?.deviceId || "").slice(0, 80);
      if (!code || !devId) return json({ error: "BAD_REQUEST" }, 400, origin);
      const { data: rec } = await sb.from("codes").select("*").eq("code", code).maybeSingle();
      if (!rec || !rec.used) return json({ error: "NOT_FOUND" }, 404, origin);
      if (rec.revoked) return json({ error: "REVOKED" }, 403, origin);
      if (rec.account_suspended === true) return json({ error: "SUSPENDED" }, 403, origin);
      const devices: any[] = Array.isArray(rec.devices) ? rec.devices : [];
      if (!devices.some((d) => d.deviceId === devId)) {
        return json({ error: "DEVICE_NOT_REGISTERED" }, 403, origin);
      }
      // Mint exactly like /api/auth/login — same 30d expiry, same claims.
      return json({ ok: true, token: await signJwt({ code: rec.code, deviceId: devId }) }, 200, origin);
    }

    /* email-identity code discovery —
       An email/password (or Google) session asks "which code is mine?" so a
       second device can adopt the same licence and finally sync the same gym.
       Previously such users had no code at all → no sync → empty second device. */
    if (req.method === "POST" && path === "/api/auth/mine") {
      const ip = clientIp(req);
      if (tooMany(ip)) return json({ error: "RATE_LIMITED", secs: LOCK_MS / 1000 }, 429, origin);
      const u = await supaUser(req);
      if (!u) { failIp(ip); return json({ error: "UNAUTHORIZED" }, 401, origin); }
      // Codes get linked either by the auth-binding format (user:<uuid>,
      // written by /api/trial) or by the admin typing the customer's email.
      const owners = [`user:${u.id}`];
      if (u.email) owners.push(String(u.email).toLowerCase());
      const { data: recs, error } = await sb.from("codes").select("*")
        .in("owner", owners).order("created_at", { ascending: true }).limit(20);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      // Recency by whichever timestamp is available — a never-activated
      // assigned code (used_at null) must not hide behind an older used trial.
      const recent = recs ? [...recs].sort((a, b) =>
        (Date.parse(b.used_at || b.created_at) || 0) - (Date.parse(a.used_at || a.created_at) || 0)) : [];
      const rec = recent[0];
      if (!rec) return json({ error: "NO_CODE" }, 404, origin);
      if (rec.revoked) { failIp(ip); return json({ error: "REVOKED" }, 403, origin); }
      // email kill switch + code-account suspension
      const { data: uFull } = await sb.auth.admin.getUserById(u.id);
      if ((uFull?.user?.app_metadata as any)?.suspended === true || rec.account_suspended === true) {
        failIp(ip); return json({ error: "SUSPENDED" }, 403, origin);
      }
      clearIp(ip);
      // Register this device under the code, same rules as activation.
      const devId = String(body?.deviceId || "").slice(0, 80);
      const devName = String(body?.deviceName || "").slice(0, 40);
      const devices: any[] = Array.isArray(rec.devices) ? rec.devices : [];
      const existing = devices.find((d) => d.deviceId === devId);
      const limit = Number(rec.device_limit) || 3;
      if (!existing) {
        if (devices.length >= limit) return json({ error: "DEVICE_LIMIT", limit }, 429, origin);
        devices.push({ deviceId: devId, name: devName, at: Date.now() });
        await sb.from("codes").update({ devices }).eq("code", rec.code);
      }
      const record = toClientRecord(rec);
      record.days = remainingDays(rec); // the clock is shared — a new device never resets it
      return json({ ok: true, record, token: await signJwt({ code: rec.code, deviceId: devId }) }, 200, origin);
    }

    /* set password — requires JWT auth (same user) */
    if (req.method === "POST" && path === "/api/auth/set-password") {
      const p = authJwt(req);
      if (!p) return json({ error: "UNAUTHORIZED" }, 401, origin);
      const code = p.code;
      const pw = String(body?.password || "");
      if (pw.length < 8 || pw.length > 72) return json({ error: "WEAK_PASSWORD" }, 400, origin);
      const { data: rec } = await sb.from("codes").select("*").eq("code", code).maybeSingle();
      if (!rec || !rec.used) return json({ error: "NOT_ACTIVATED" }, 404, origin);
      if (rec.revoked) return json({ error: "REVOKED" }, 403, origin);
      const pass_hash = await bcrypt.hash(pw, BCRYPT_COST);
      const { error } = await sb.from("codes").update({ pass_hash }).eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }

    /* change password */
    if (req.method === "POST" && path === "/api/auth/change-password") {
      const p = authJwt(req);
      if (!p) return json({ error: "UNAUTHORIZED" }, 401, origin);
      const { data: rec } = await sb.from("codes").select("*").eq("code", p.code).maybeSingle();
      if (!rec || !rec.pass_hash) return json({ error: "NO_PASSWORD" }, 400, origin);
      if (rec.revoked) return json({ error: "REVOKED" }, 403, origin);
      const okCur = await bcrypt.compare(String(body?.current || ""), rec.pass_hash);
      if (!okCur) return json({ error: "WRONG_PASSWORD" }, 401, origin);
      const nw = String(body?.next || "");
      if (nw.length < 8 || nw.length > 72) return json({ error: "WEAK_PASSWORD" }, 400, origin);
      if (nw === body?.current) return json({ ok: true }, 200, origin);
      const pass_hash = await bcrypt.hash(nw, BCRYPT_COST);
      const { error } = await sb.from("codes").update({ pass_hash }).eq("code", p.code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }

    /* gym load */
    if (req.method === "GET" && path === "/api/gym") {
      const p = authJwt(req);
      if (!p) return json({ error: "UNAUTHORIZED" }, 401, origin);
      const flags = await codeFlags(p);
      if (flags.revoked) return json({ error: "REVOKED" }, 403, origin);
      if (flags.suspended) return json({ error: "SUSPENDED" }, 403, origin);
      if (!flags.data) return json({ error: "DATA_DISABLED" }, 403, origin);
      if (flags.expired) return json({ error: "EXPIRED" }, 403, origin);
      const deviceId = flags.sync ? "" : (String(p.deviceId || "").slice(0, 80));
      const { data: g } = await sb.from("gyms").select("*").eq("code", p.code).eq("device_id", deviceId).maybeSingle();
      return json(g ? { savedAt: g.saved_at ? new Date(g.saved_at).getTime() : null, data: g.data } : null, 200, origin);
    }

    /* gym save — server-side MERGE so concurrent edits from multiple
       devices never clobber each other (item-level by updatedAt).
       Sync-off codes store a per-device row; sync-on share one (device_id ''). */
    if (req.method === "PUT" && path === "/api/gym") {
      const p = authJwt(req);
      if (!p) return json({ error: "UNAUTHORIZED" }, 401, origin);
      const flags = await codeFlags(p);
      if (flags.revoked) return json({ error: "REVOKED" }, 403, origin);
      if (flags.suspended) return json({ error: "SUSPENDED" }, 403, origin);
      if (!flags.data) return json({ error: "DATA_DISABLED" }, 403, origin);
      if (flags.expired) return json({ error: "EXPIRED" }, 403, origin);
      const deviceId = flags.sync ? "" : (String(p.deviceId || "").slice(0, 80));
      const { data: cur } = await sb.from("gyms").select("data").eq("code", p.code).eq("device_id", deviceId).maybeSingle();
      const merged = mergeGymData(cur?.data || {}, body?.data || {});
      const { error } = await sb.from("gyms").upsert(
        { code: p.code, device_id: deviceId, data: merged, saved_at: new Date().toISOString() },
        { onConflict: "code,device_id" });
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true, data: merged }, 200, origin);
    }

    /* admin login */
    if (req.method === "POST" && path === "/api/admin/login") {
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      const email = String(body?.email || "").toLowerCase().trim();
      const receivedPassword = String(body?.password || "");
      const emailMatch = safeEqual(email, ADMIN_EMAIL);
      const passwordMatch = safeEqual(receivedPassword, ADMIN_PASSWORD);
      if (!emailMatch || !passwordMatch) {
        failAdminIp(ip);
        await logAdminAction(email, "login_failed", "system", null, { 
          reason: "invalid_credentials", 
          email_match: emailMatch,
          password_match: passwordMatch,
          received_len: receivedPassword.length, 
          expected_len: ADMIN_PASSWORD?.length || 0, 
          expected_prefix: ADMIN_PASSWORD?.slice(0, 4) || "none",
          received_prefix: receivedPassword.slice(0, 4) || "none",
          raw_body_len: rawBody.length,
          body_is_null: body === null,
          content_type: req.headers.get("content-type") || "none",
          raw_body_preview: rawBody.slice(0, 100)
        }, req);
        return json({ 
          error: "WRONG_CREDENTIALS" 
        }, 401, origin);
      }
      /* ---- TOTP 2FA gate (opt-in; default OFF) ----
         With no enabled admin_2fa row this block is skipped entirely and
         login behaves EXACTLY as before — the owner can never be locked out
         by this feature. With 2FA enabled: a missing code is TOTP_REQUIRED,
         a wrong one is TOTP_INVALID (TOTP first, then single-use bcrypt'd
         recovery codes; a matched recovery code is consumed on the spot). */
      const { data: tfaRow } = await sb.from("admin_2fa")
        .select("secret, enabled, recovery_codes").eq("admin_email", ADMIN_EMAIL).maybeSingle();
      if (tfaRow?.enabled === true && tfaRow.secret) {
        const provided = String(body?.totp || "").trim();
        if (!provided) {
          failAdminIp(ip);
          await logAdminAction(email, "login_failed", "system", null, { reason: "totp_required" }, req);
          return json({ error: "TOTP_REQUIRED" }, 401, origin);
        }
        const okTotp = await verifyTotp(tfaRow.secret, provided);
        if (!okTotp) {
          const codes: string[] = Array.isArray(tfaRow.recovery_codes) ? tfaRow.recovery_codes : [];
          let consumedAt = -1;
          for (let i = 0; i < codes.length; i++) {
            if (await bcrypt.compare(provided, codes[i])) { consumedAt = i; break; }
          }
          if (consumedAt < 0) {
            failAdminIp(ip);
            await logAdminAction(email, "login_failed", "system", null, { reason: "totp_invalid" }, req);
            return json({ error: "TOTP_INVALID" }, 401, origin);
          }
          const remaining = codes.filter((_, i) => i !== consumedAt);
          await sb.from("admin_2fa").update({ recovery_codes: remaining }).eq("admin_email", ADMIN_EMAIL);
          await logAdminAction(ADMIN_EMAIL, "login_2fa_recovery_used", "system", null, { remaining_codes: remaining.length }, req);
        }
      }
      clearAdminIp(ip);
      await logAdminAction(ADMIN_EMAIL, "login_success", "system", null, {}, req);
      return json({ ok: true, token: await signJwt({ admin: true }, true) }, 200, origin);
    }

    /* admin: backup / restore — one endpoint, three reads + one write.
       GET  (default)          → full backup: codes + gyms (downloadable file)
       GET  ?scope=stats       → light per-code aggregates for the panel columns
                                 (owner, member count, last cloud sync)
       GET  ?scope=code&code=X → a single code's record + its gym rows (View Data)
       PUT  { code, data }     → replace one code's shared gym row. The panel
                                 always downloads a snapshot of the CURRENT data
                                 and asks for explicit confirmation first, and
                                 never offers a "delete" — restore only writes. */
    if (path === "/api/admin/backup") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const scope = url.searchParams.get("scope") || "";
      if (req.method === "GET") {
        if (scope === "stats") {
          const { data: codeRows, error: cErr } = await sb.from("codes").select("code,owner");
          if (cErr) return json({ error: "INTERNAL_ERROR" }, 500, origin);
          const { data: gymRows, error: gErr } = await sb.from("gyms").select("code,saved_at,data");
          if (gErr) return json({ error: "INTERNAL_ERROR" }, 500, origin);
          const agg = new Map<string, { members: number; lastSync: number }>();
          for (const g of gymRows || []) {
            const cur = agg.get(g.code) || { members: 0, lastSync: 0 };
            const members = Array.isArray((g.data as any)?.members) ? (g.data as any).members.length : 0;
            const savedAt = g.saved_at ? Date.parse(g.saved_at) || 0 : 0;
            // A sync-off code has one row per device — take the richest copy
            // and the most recent save, which is what "member count / last
            // sync" means from the owner's point of view.
            if (members > cur.members) cur.members = members;
            if (savedAt > cur.lastSync) cur.lastSync = savedAt;
            agg.set(g.code, cur);
          }
          const stats = (codeRows || []).map((c) => ({
            code: c.code,
            owner: c.owner || "",
            members: agg.get(c.code)?.members ?? 0,
            lastSync: agg.get(c.code)?.lastSync ?? 0,
          }));
          return json({ stats }, 200, origin);
        }
        if (scope === "code") {
          const code = normCode(url.searchParams.get("code") || "");
          if (!code) return json({ error: "BAD_REQUEST" }, 400, origin);
          const { data: rec } = await sb.from("codes").select("*").eq("code", code).maybeSingle();
          if (!rec) return json({ error: "NOT_FOUND" }, 404, origin);
          const { data: rows, error: gErr } = await sb.from("gyms").select("*").eq("code", code);
          if (gErr) return json({ error: "INTERNAL_ERROR" }, 500, origin);
          return json({ code: toRecord(rec), gyms: rows || [] }, 200, origin);
        }
        const [codesRes, gymsRes] = await Promise.all([
          sb.from("codes").select("*").order("created_at", { ascending: false }),
          sb.from("gyms").select("*").order("saved_at", { ascending: false }),
        ]);
        if (codesRes.error || gymsRes.error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
        return json({
          generatedAt: Date.now(),
          codes: (codesRes.data || []).map(toRecord),
          gyms: gymsRes.data || [],
        }, 200, origin);
      }
      if (req.method === "PUT") {
        const code = normCode(body?.code);
        const data = body?.data;
        if (!code) return json({ error: "BAD_REQUEST" }, 400, origin);
        if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "BAD_REQUEST" }, 400, origin);
        const { data: cur } = await sb.from("gyms").select("data").eq("code", code).eq("device_id", "").maybeSingle();
        const { error } = await sb.from("gyms").upsert(
          { code, device_id: "", data, saved_at: new Date().toISOString() },
          { onConflict: "code,device_id" });
        if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
        // Hand back what was overwritten so the client can keep its own copy.
        return json({ ok: true, previous: cur?.data ?? null }, 200, origin);
      }
      return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
    }

    /* admin: list codes — paginated when query present, legacy array otherwise */
    if (req.method === "GET" && path === "/api/codes") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const url = new URL(req.url);
      const hasPagination = url.searchParams.has("limit") || url.searchParams.has("cursor") || url.searchParams.has("q") || url.searchParams.has("status");
      if (!hasPagination) {
        const { data: list, error } = await sb.from("codes").select("*").order("created_at", { ascending: false });
        if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
        return json((list || []).map(toRecord), 200, origin);
      }
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
      const cursor = url.searchParams.get("cursor");
      const q = (url.searchParams.get("q") || "").trim().toUpperCase().slice(0, 10);
      const status = (url.searchParams.get("status") || "").trim();
      let query = sb.from("codes").select("*").order("created_at", { ascending: false }).limit(limit + 1);
      if (q) query = query.ilike("code", `%${q.replace(/[^A-Z0-9]/g, "")}%`);
      if (status === "used") query = query.eq("used", true);
      else if (status === "revoked") query = query.eq("revoked", true);
      else if (status === "active") query = query.eq("used", false).eq("revoked", false);
      if (cursor) query = query.lt("created_at", cursor);
      const { data: list, error } = await query;
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      const hasMore = (list || []).length > limit;
      const page = hasMore ? list.slice(0, limit) : list;
      const nextCursor = hasMore ? page[page.length - 1].created_at : null;
      return json({ data: (page || []).map(toRecord), nextCursor, hasMore }, 200, origin);
    }

    /* admin: get single code */
    if (req.method === "GET" && path.startsWith("/api/codes/")) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = normCode(path.split("/")[3]);
      const { data: rec } = await sb.from("codes").select("*").eq("code", code).maybeSingle();
      if (!rec) return json({ error: "NOT_FOUND" }, 404, origin);
      return json(toRecord(rec), 200, origin);
    }

    /* admin: create code */
    if (req.method === "POST" && path === "/api/codes") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      let code = normCode(body?.custom);
      // v1.4.7: normCode() truncates to the canonical 6 chars — a LONGER custom
      // code used to be silently shortened (creating a code the admin does not
      // recognise, and whose DELETE-{code} confirm token differs from what they
      // typed). Reject instead of guessing.
      if (code && String(body?.custom || "").replace(/[^A-Za-z0-9]/g, "").length > 6) {
        return json({ error: "INVALID_FORMAT", message: "Custom codes are exactly 6 characters (A-Z0-9)." }, 400, origin);
      }
      if (!code) {
        do { code = normCode(randomCode()); } while ((await sb.from("codes").select("code").eq("code", code).maybeSingle()).data);
      }
      const tier = ["monthly", "yearly", "lifetime"].includes(body?.tier) ? body.tier : "monthly";
      // days is the ONLY value the countdown engine reads (tier is a label).
      // v1.4.5: lifetime ALWAYS means 0 days, regardless of what the caller
      // sent (the admin panel's code modal used to ship a 60-day default that
      // silently turned "lifetime" codes into 60-day ones — §10.6).
      const daysRaw = Math.max(0, Number(body?.days) || 0);
      const days = tier === "lifetime" ? 0 : (daysRaw > 0 ? Math.floor(daysRaw) : tier === "yearly" ? 365 : 30);
      const insert = {
        code, tier,
        days,
        source: "admin",   // admin-created code (§1 activationSource)
        // 64: the auth-binding format "user:<uuid>" is EXACTLY 41 chars, so the
        // old .slice(0,40) chopped one char off and made linked codes
        // undiscoverable by /api/auth/mine (exact owner match).
        owner: String(body?.owner || "").trim().toLowerCase().slice(0, 64),
        note: String(body?.note || "").slice(0, 200),
        data_enabled: body?.data_enabled === undefined ? true : !!body?.data_enabled,
        sync_enabled: body?.sync_enabled === undefined ? true : !!body?.sync_enabled,
        device_limit: Math.max(1, Math.min(20, Math.floor(Number(body?.device_limit) || 3))),
      };
      const { data: rec, error } = await sb.from("codes").insert(insert).select("*").maybeSingle();
      if (error) {
        if (error.code === "23505") return json({ error: "DUPLICATE" }, 409, origin);
        return json({ error: "INTERNAL_ERROR" }, 500, origin);
      }
      await logAdminAction(ADMIN_EMAIL, "create_code", "code", rec.code, { tier: rec.tier, days: rec.days, owner: rec.owner }, req);
      return json(toRecord(rec), 200, origin);
    }

    /* admin: revoke / owner / reset-password / delete */
    // NOTE on counting: supabase-js v2 returns count: null UNLESS the query
    // passes { count: "exact" } — so the old `if (!count)` reported NOT_FOUND
    // on every single reset-password even when it had just succeeded. These
    // admin PATCHes now select the touched row back and 404 honestly.
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/revoke$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const code = normCode(path.split("/")[3]);
      const { data, error } = await sb.from("codes").update({ revoked: !!body?.revoked }).eq("code", code).select("code").maybeSingle();
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!data) return json({ error: "NOT_FOUND" }, 404, origin);
      await logAdminAction(ADMIN_EMAIL, "revoke_code", "code", code, { revoked: !!body?.revoked }, req);
      return json({ ok: true }, 200, origin);
    }
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/owner$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const code = normCode(path.split("/")[3]);
      const { data, error } = await sb.from("codes").update({ owner: String(body?.owner || "").trim().toLowerCase().slice(0, 64) }).eq("code", code).select("code").maybeSingle();
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!data) return json({ error: "NOT_FOUND" }, 404, origin);
      await logAdminAction(ADMIN_EMAIL, "update_code_owner", "code", code, { new_owner: body?.owner }, req);
      return json({ ok: true }, 200, origin);
    }
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/reset-password$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdminDestructive(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_DESTRUCTIVE_WINDOW_MS / 1000 }, 429, origin);
      failAdminDestructiveIp(ip);
      const code = normCode(path.split("/")[3]);
      // 12 chars, not 6: the client's own password policy rejects anything
      // under 8 characters, so a 6-char temp password would leave the customer
      // unable to ever change it.
      const temp = randChars(12);
      const pass_hash = await bcrypt.hash(temp, BCRYPT_COST);
      const { data, error } = await sb.from("codes").update({ pass_hash }).eq("code", code).select("code").maybeSingle();
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!data) return json({ error: "NOT_FOUND" }, 404, origin);
      await logAdminAction(ADMIN_EMAIL, "reset_code_password", "code", code, {}, req);
      return json({ ok: true, tempPassword: temp }, 200, origin);
    }

    /* admin: list coupons — paginated, newest first */
    if (req.method === "GET" && path === "/api/coupons") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const u = new URL(req.url);
      const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit")) || 100));
      const cursor = u.searchParams.get("cursor");
      // Sort on id alone, descending. The cursor filter below is on id too, so
      // the sort and the cursor agree. Sorting on created_at here while paging
      // by id silently re-serves rows whenever two coupons share a timestamp,
      // and drops rows whose id is low but created_at is recent.
      // bigserial id is monotonic, so id desc is also newest-first.
      let q = sb.from("coupons").select("*").order("id", { ascending: false }).limit(limit + 1);
      if (cursor) q = q.lt("id", Number(cursor) || 0);
      const { data: list, error } = await q;
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      const hasMore = (list || []).length > limit;
      const page = hasMore ? list.slice(0, limit) : (list || []);
      return json({
        data: page.map(toCoupon),
        nextCursor: hasMore ? String(page[page.length - 1].id) : null,
        hasMore,
      }, 200, origin);
    }

    /* admin: create a coupon */
    if (req.method === "POST" && path === "/api/coupons") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const code = String(body?.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
      if (!code) return json({ error: "INVALID_CODE" }, 400, origin);
      const kind = ["days_14", "days_30", "days_365", "percent", "days_custom"].includes(body?.kind) ? body.kind : "days_30";
      const rawValue = Math.max(0, Math.floor(Number(body?.value) || 0));
      if (kind === "days_custom" && (rawValue < 1 || rawValue > 3650)) return json({ error: "INVALID_VALUE" }, 400, origin);
      // percent caps at 100; days_custom carries its days in value (1-3650, checked above)
      const value = kind === "days_custom" ? rawValue : Math.min(100, rawValue);
      if (kind === "percent" && value < 1) return json({ error: "INVALID_VALUE" }, 400, origin);
      const { data, error } = await sb.from("coupons")
        .insert({ code, kind, value, description: String(body?.description || "").slice(0, 200) })
        .select("*").maybeSingle();
      if (error) {
        if (error.code === "23505") return json({ error: "DUPLICATE" }, 409, origin);
        return json({ error: "INTERNAL_ERROR" }, 500, origin);
      }
      await logAdminAction(ADMIN_EMAIL, "create_coupon", "coupon", data.code, { kind: data.kind, value: data.value }, req);
      return json(toCoupon(data), 201, origin);
    }

    /* admin: look up a coupon WITHOUT consuming it.
       The old client burned the coupon the moment it was typed into the form,
       so abandoning the dialog wasted it. Peeking here and consuming in
       redeem() lets the coupon survive until the subscription is really saved. */
    if (req.method === "GET" && /^\/api\/coupons\/[^/]+$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = String(path.split("/")[3] || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
      const { data } = await sb.from("coupons").select("*").eq("code", code).maybeSingle();
      if (!data) return json({ error: "NOT_FOUND" }, 404, origin);
      if (data.used) return json({ error: "ALREADY_USED" }, 409, origin);
      return json({ coupon: toCoupon(data), tier: couponTier(data), days: couponDays(data) }, 200, origin);
    }

    /* admin: redeem a coupon.
       Marks it used only if it is still unused — a conditional update, so two
       admins clicking at once cannot both win the same coupon. Returns the
       entitlement the caller should apply. */
    if (req.method === "POST" && path === "/api/coupons/redeem") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const code = String(body?.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
      if (!code) return json({ error: "INVALID_CODE" }, 400, origin);
      // suspension gate for the TARGET account (best-effort lookup; a suspended
      // account can never redeem a coupon, even via an admin click).
      const targetUserId = String(body?.userId || "").slice(0, 64);
      if (targetUserId) {
        let targetSuspended = false;
        const { data: cRow } = await sb.from("codes").select("account_suspended").eq("code", targetUserId).maybeSingle();
        if (cRow?.account_suspended === true) targetSuspended = true;
        else {
          try { const { data: u } = await sb.auth.admin.getUserById(targetUserId); if ((u?.user?.app_metadata as any)?.suspended === true) targetSuspended = true; } catch { /* not an auth user id */ }
        }
        if (targetSuspended) return json({ error: "SUSPENDED" }, 403, origin);
      }
      // eq("used", false) is the guard...
      // matches zero rows and we report ALREADY_USED instead of double-spending.
      const { data, error } = await sb.from("coupons")
        .update({ used: true, used_at: new Date().toISOString(), used_by: String(body?.userId || "").slice(0, 64) || null })
        .eq("code", code).eq("used", false).select("*").maybeSingle();
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!data) {
        const { data: existing } = await sb.from("coupons").select("*").eq("code", code).maybeSingle();
        if (!existing) return json({ error: "NOT_FOUND" }, 404, origin);
        return json({ error: "ALREADY_USED" }, 409, origin);
      }
      await logAdminAction(ADMIN_EMAIL, "redeem_coupon", "coupon", code, { userId: body?.userId }, req);
      return json({ coupon: toCoupon(data), tier: couponTier(data), days: couponDays(data) }, 200, origin);
    }

    /* admin: release a coupon claimed by a subscription save that then failed.
       The redeem is a claim, not a finality: the client claims first (so two
       admins cannot both win the same code), saves the user, and calls this to
       hand the coupon back if the save blew up. Scoped to the claiming userId
       so it can never yank a coupon another admin has since consumed. */
    if (req.method === "POST" && path === "/api/coupons/release") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const code = String(body?.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
      const userId = String(body?.userId || "").slice(0, 64);
      if (!code || !userId) return json({ error: "INVALID_CODE" }, 400, origin);
      const { data, error } = await sb.from("coupons")
        .update({ used: false, used_at: null, used_by: null })
        .eq("code", code).eq("used", true).eq("used_by", userId).select("code").maybeSingle();
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!data) return json({ error: "NOT_CLAIMED" }, 409, origin);
      await logAdminAction(ADMIN_EMAIL, "release_coupon", "coupon", code, { userId }, req);
      return json({ ok: true }, 200, origin);
    }

    /* admin: delete a coupon */
    if (req.method === "DELETE" && path.startsWith("/api/coupons/")) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdminDestructive(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_DESTRUCTIVE_WINDOW_MS / 1000 }, 429, origin);
      failAdminDestructiveIp(ip);
      const code = String(path.split("/")[3] || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
      if (!code) return json({ error: "INVALID_CODE" }, 400, origin);
      const { error } = await sb.from("coupons").delete().eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      await logAdminAction(ADMIN_EMAIL, "delete_coupon", "coupon", code, {}, req);
      return json({ ok: true }, 200, origin);
    }

    /* admin: toggle cloud data transfer for a code */
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/data$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const code = normCode(path.split("/")[3]);
      const { data, error } = await sb.from("codes").update({ data_enabled: !!body?.data_enabled }).eq("code", code).select("code").maybeSingle();
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!data) return json({ error: "NOT_FOUND" }, 404, origin);
      await logAdminAction(ADMIN_EMAIL, "toggle_code_data", "code", code, { data_enabled: !!body?.data_enabled }, req);
      return json({ ok: true }, 200, origin);
    }
    /* admin: toggle multi-device sync for a code */
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/sync$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const code = normCode(path.split("/")[3]);
      const { data, error } = await sb.from("codes").update({ sync_enabled: !!body?.sync_enabled }).eq("code", code).select("code").maybeSingle();
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!data) return json({ error: "NOT_FOUND" }, 404, origin);
      await logAdminAction(ADMIN_EMAIL, "toggle_code_sync", "code", code, { sync_enabled: !!body?.sync_enabled }, req);
      return json({ ok: true }, 200, origin);
    }
    /* admin: set max activated devices for a code */
    if (req.method === "PATCH" && /^\/api\/codes\/[^\/]+\/limit$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const code = normCode(path.split("/")[3]);
      const lim = Math.max(1, Math.min(20, Math.floor(Number(body?.device_limit) || 3)));
      const { data, error } = await sb.from("codes").update({ device_limit: lim }).eq("code", code).select("code").maybeSingle();
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!data) return json({ error: "NOT_FOUND" }, 404, origin);
      await logAdminAction(ADMIN_EMAIL, "set_code_limit", "code", code, { device_limit: lim }, req);
      return json({ ok: true }, 200, origin);
    }
    if (req.method === "DELETE" && /^\/api\/codes\/[^\/]+$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      // Parse first: `permanent` picks the rate-limit bucket, and a TDZ use
      // before this declaration threw a ReferenceError on every delete.
      const code = normCode(path.split("/")[3]);
      const { searchParams } = new URL(req.url);
      const permanent = searchParams.get("permanent") === "true";
      const confirm = searchParams.get("confirm");
      const confirmExpected = `DELETE-${code}`;
      if (permanent) {
        if (tooManyAdminDestructive(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_DESTRUCTIVE_WINDOW_MS / 1000 }, 429, origin);
        failAdminDestructiveIp(ip);
      } else {
        if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
        failAdminIp(ip);
      }

      if (permanent) {
        // Permanent delete endpoint — requires explicit confirmation
        if (!confirm || confirm !== confirmExpected) {
          return json({
            error: "CONFIRMATION_REQUIRED",
            message: `Permanent deletion requires confirmation. Add ?confirm=${confirmExpected}&permanent=true`,
            confirmToken: confirmExpected
          }, 400, origin);
        }
        // Hard delete: removes code AND all associated gym data
        const { error } = await sb.from("codes").delete().eq("code", code);
        if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
        const { error: gErr } = await sb.from("gyms").delete().eq("code", code);
        if (gErr) console.error("[gym cleanup failed]", code, gErr);
        await logAdminAction(ADMIN_EMAIL, "delete_code_permanent", "code", code, { gymDataDeleted: !gErr }, req);
        return json({ ok: true, gymDataDeleted: !gErr, permanent: true }, 200, origin);
      }

      // Default: Soft delete / Revoke — preserves all customer data
      const { data: existing, error: fetchErr } = await sb.from("codes").select("*").eq("code", code).maybeSingle();
      if (fetchErr) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!existing) return json({ error: "NOT_FOUND" }, 404, origin);

      if (existing.revoked) {
        return json({ error: "ALREADY_REVOKED", message: "Code is already revoked" }, 409, origin);
      }

      const revokedAt = new Date().toISOString();
      const { error } = await sb.from("codes").update({
        revoked: true,
        revoked_at: revokedAt,
        revoked_by: ADMIN_EMAIL,
        // revoke_reason could be added from body if needed
      }).eq("code", code);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);

      await logAdminAction(ADMIN_EMAIL, "revoke_code", "code", code, { revoked_at: revokedAt }, req);
      return json({ ok: true, revoked: true, revoked_at: revokedAt, message: "Code revoked. Customer data preserved." }, 200, origin);
    }

    /* admin: list users — cursor-based pagination, no hard limit */
    if (req.method === "GET" && path === "/api/users") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const url = new URL(req.url);
      const perPage = Math.min(500, Math.max(1, Number(url.searchParams.get("perPage")) || 200));
      const cursor = url.searchParams.get("cursor"); // last user's created_at timestamp (ISO string)
      const search = url.searchParams.get("q")?.trim().toLowerCase() || "";
      const statusFilter = url.searchParams.get("status") || "";

      const all: any[] = [];
      let nextCursor: string | null = null;
      let hasMore = false;

      // Use Supabase's built-in pagination with cursor-based approach
      // Since listUsers doesn't support cursor directly, we use page-based but with proper cursor
      const page = cursor ? Math.floor(Date.parse(cursor) / 1000 / 86400 / 30) + 1 : 1; // rough estimate
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: perPage + 1 });
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);

      let batch = (data?.users || []).filter((u) => {
        if (search) {
          const email = (u.email || "").toLowerCase();
          const name = (u.user_metadata?.full_name || "").toLowerCase();
          return email.includes(search) || name.includes(search);
        }
        return true;
      }).filter((u) => {
        if (!statusFilter) return true;
        const suspended = u.app_metadata?.suspended ? "suspended" : "active";
        if (statusFilter === "suspended") return suspended === "suspended";
        if (statusFilter === "active") return suspended === "active";
        // subscription status
        const sub = u.user_metadata?.subscription || "none";
        const subEnd = u.user_metadata?.subEnd ? Date.parse(u.user_metadata.subEnd) : 0;
        const now = Date.now();
        if (statusFilter === "trial") return sub === "trial" && subEnd > now;
        if (statusFilter === "expired") return sub !== "none" && sub !== "lifetime" && subEnd && subEnd <= now;
        if (statusFilter === "trial_expired") return sub === "trial" && subEnd && subEnd <= now && !u.app_metadata?.suspended;
        return true;
      });

      hasMore = batch.length > perPage;
      const pageUsers = hasMore ? batch.slice(0, perPage) : batch;
      nextCursor = hasMore ? pageUsers[pageUsers.length - 1].created_at : null;

      // Pull every code once so the composer (§2) can resolve each user's
      // license without an N+1 query. Group by both owner formats.
      const { data: allCodes } = await sb.from("codes").select("*");
      const codeByOwner = new Map<string, any[]>();
      for (const c of allCodes || []) {
        const k = String(c.owner || "").toLowerCase();
        if (!codeByOwner.has(k)) codeByOwner.set(k, []);
        codeByOwner.get(k)!.push(c);
      }
      const primaryCodeFor = (u: any) => {
        const owners = [`user:${u.id}`, String(u.email || "").toLowerCase()];
        const rows: any[] = [];
        for (const o of owners) for (const c of (codeByOwner.get(o) || [])) rows.push(c);
        return pickPrimaryCode(rows);
      };

      const mapped = pageUsers.map((u) => {
        const meta = u.user_metadata || {};
        const ts = (v: any): number | null => {
          if (v == null) return null;
          return Number(v) ? Number(v) : Date.parse(String(v)) || null;
        };
        const primary = primaryCodeFor(u);
        const status = accountStatusOf(primary, meta, { appSuspended: !!u.app_metadata?.suspended });
        return {
          id: u.id,
          email: u.email,
          full_name: meta.full_name || u.email || "",
          gym_name: meta.gym_name || "",
          created: u.created_at,
          lastSignIn: u.last_sign_in_at,
          status: u.app_metadata?.suspended ? "suspended" : "active",
          role: u.role,
          subscription: meta.subscription || "none",
          subTier: meta.subTier || null,
          subStart: ts(meta.subStart),
          subEnd: ts(meta.subEnd),
          days: Number(meta.days) || null,
          // Composer status (contract §2) — additive, server is source of truth.
          accountStatus: status,
        };
      });
      return json({ data: mapped, nextCursor, hasMore, totalCount: mapped.length }, 200, origin);
    }

    /* admin: single-user detail — user + owned codes + composer status (contract §3.3) */
    if (req.method === "GET" && /^\/api\/users\/[^\/]+$/.test(path)) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const userId = path.split("/")[3];
      if (!userId || userId === "undefined") return json({ error: "INVALID_ID" }, 400, origin);
      const { data: ed } = await sb.auth.admin.getUserById(userId);
      const u = ed?.user;
      if (!u) return json({ error: "NOT_FOUND" }, 404, origin);
      const meta = u.user_metadata || {};
      const ts = (v: any): number | null => (v == null ? null : (Number(v) ? Number(v) : Date.parse(String(v)) || null));
      const { data: codes } = await sb.from("codes").select("*").or(`owner.eq.user:${userId},owner.eq.${String(u.email || "").toLowerCase()}`);
      const primary = pickPrimaryCode(codes || []);
      const status = accountStatusOf(primary, meta, { appSuspended: !!u.app_metadata?.suspended });
      return json({
        id: u.id, email: u.email, full_name: meta.full_name || u.email || "",
        gym_name: meta.gym_name || "", created: u.created_at, lastSignIn: u.last_sign_in_at,
        status: u.app_metadata?.suspended ? "suspended" : "active", role: u.role,
        subscription: meta.subscription || "none", subTier: meta.subTier || null,
        subStart: ts(meta.subStart), subEnd: ts(meta.subEnd), days: Number(meta.days) || null,
        accountStatus: status, codes: (codes || []).map(toRecord),
      }, 200, origin);
    }

    /* admin: force-confirm a user's email. Unsticks accounts created while
       "Confirm email" was on and the confirmation email never arrived
       (default Supabase SMTP is easy to lose), leaving users who "have an
       account" but can never sign in. */
    if (req.method === "POST" && path === "/api/users/confirm-email") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const email = String(body?.email || "").trim().toLowerCase();
      if (!email) return json({ error: "MISSING_FIELDS" }, 400, origin);
      let target: any = null;
      for (let page = 1; page <= 25 && !target; page++) {
        const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
        const batch = data?.users || [];
        target = batch.find((u: any) => String(u.email || "").toLowerCase() === email) || null;
        if (batch.length < 200) break;
      }
      if (!target) return json({ error: "NOT_FOUND" }, 404, origin);
      const { error } = await sb.auth.admin.updateUserById(target.id, { email_confirm: true });
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true, email }, 200, origin);
    }

    /* admin: create user */
    if (req.method === "POST" && path === "/api/users") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const { email, password, full_name, subscription } = body || {};
      if (!email || !password) return json({ error: "MISSING_FIELDS" }, 400, origin);
      const sm = subMeta(subscription?.tier, subscription?.days);
      const { data: newUser, error } = await sb.auth.admin.createUser({
        email,
        password,
        user_metadata: {
          full_name: String(full_name || "").slice(0, 100),
          subscription: sm.subscription,
          subTier: sm.subTier,
          subStart: sm.subStart,
          subEnd: sm.subEnd,
          days: sm.days,
        },
      });
      if (error) return json({ error: error.message || "INTERNAL_ERROR" }, 500, origin);
      await logAdminAction(ADMIN_EMAIL, "create_user", "user", newUser?.user?.id, { email, subscription: sm.subscription }, req);
      return json({ id: newUser?.user?.id, email: newUser?.user?.email, ...sm }, 201, origin);
    }

    /* admin: suspend/resume OR set subscription (tier + days) for a user.
       NOTE: /api/admin/users/{id}/actions has SIX segments — the id lives at
       split("/")[4], unlike /api/users/{id} where it is [3]. */
    if (req.method === "POST" && path.startsWith("/api/admin/users/") && path.endsWith("/actions")) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const userId = path.split("/")[4];
      if (!userId || userId === "undefined") return json({ error: "INVALID_ID" }, 400, origin);
      return await runUserOp(userId, body, req, origin);
    }

    if (req.method === "PATCH" && path.startsWith("/api/users/")) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const userId = path.split("/")[3];
      if (!userId || userId === "undefined") return json({ error: "INVALID_ID" }, 400, origin);
      const { data: ed } = await sb.auth.admin.getUserById(userId);
      const existing = ed?.user;
      if (!existing) return json({ error: "NOT_FOUND" }, 404, origin);

      const sub = body?.subscription;
      // v1.4.5 admin ops (contract §3.2) — dispatched via body.op so the
      // existing subscription/suspend callers keep working unchanged.
      const op = String(body?.op || "");
      if (op) return await runUserOp(userId, body, req, origin);

      if (sub && typeof sub === "object") {
        // Set package + how long the account stays open (from NOW).
        const sm = subMeta(sub.tier, sub.days);
        const meta = { ...(existing.user_metadata || {}) };
        if (meta.subStart) sm.subStart = meta.subStart; // keep original start
        meta.subscription = sm.subscription;
        meta.subTier = sm.subTier;
        meta.subStart = sm.subStart;
        meta.subEnd = sm.subEnd;
        meta.days = sm.days;
        if (body?.name !== undefined) meta.full_name = String(body.name).slice(0, 100);
        const { error } = await sb.auth.admin.updateUserById(userId, { user_metadata: meta });
        if (error) return json({ error: error.message || "INTERNAL_ERROR" }, 500, origin);
        await logAdminAction(ADMIN_EMAIL, "update_user_subscription", "user", userId, { subscription: sm.subscription, days: sm.days }, req);
        return json({ ok: true, id: userId, ...sm }, 200, origin);
      }

      const { suspend } = body || {};
      const meta = { ...existing.app_metadata, suspended: !!suspend };
      const { error } = await sb.auth.admin.updateUserById(userId, { app_metadata: meta });
      if (error) return json({ error: error.message || "INTERNAL_ERROR" }, 500, origin);
      await logAdminAction(ADMIN_EMAIL, suspend ? "suspend_user" : "activate_user", "user", userId, { suspended: !!suspend }, req);
      return json({ ok: true, suspended: !!suspend }, 200, origin);
    }

    /* admin: delete user */
    if (req.method === "DELETE" && path.startsWith("/api/users/")) {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const userId = path.split("/")[3];
      if (!userId || userId === "undefined") return json({ error: "INVALID_ID" }, 400, origin);
      const { error } = await sb.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message || "INTERNAL_ERROR" }, 500, origin);
      await logAdminAction(ADMIN_EMAIL, "delete_user", "user", userId, {}, req);
      return json({ ok: true }, 200, origin);
    }

    /* admin: forgot password — sends the branded GoTrue recovery email to the
       admin address through the project SMTP (digitalpulse.ps@gmail.com). The
       link lands on reset-password.html (PKCE) and resets the Supabase auth
       password. NOTE: the admin PANEL login is the ADMIN_PASSWORD function
       secret — separate, update it in Supabase Dashboard → Functions secrets. */
    if (req.method === "POST" && path === "/api/admin/forgot-password") {
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const email = String(body?.email || "").toLowerCase().trim();
      if (!safeEqual(email, ADMIN_EMAIL)) {
        // Don't reveal if email is wrong — always return success for security
        return json({ ok: true, message: "If the email matches the admin account, a reset link has been sent." }, 200, origin);
      }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: RESET_PASSWORD_URL });
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      await logAdminAction(ADMIN_EMAIL, "admin_forgot_password", "system", null, { email }, req);
      clearIp(ip);
      return json({
        ok: true,
        message: "Reset link sent. This resets the Supabase auth password; the admin panel password is the ADMIN_PASSWORD function secret (update it separately if needed).",
      }, 200, origin);
    }

    /* admin: send a password-reset (recovery) email to any user. Uses GoTrue's
       /recover through the project SMTP, so the user receives the branded
       recovery template, and the link lands on reset-password.html (PKCE).
       GoTrue answers identically whether or not the address exists. */
    if (req.method === "POST" && path === "/api/users/send-reset") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const email = String(body?.email || "").trim().toLowerCase();
      if (!email) return json({ error: "MISSING_FIELDS" }, 400, origin);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: RESET_PASSWORD_URL });
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      await logAdminAction(ADMIN_EMAIL, "send_reset_email", "user", null, { email }, req);
      return json({ ok: true, email }, 200, origin);
    }

    /* admin: reset password — verify token and set new password */
    if (req.method === "POST" && path === "/api/admin/reset-password") {
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const token = String(body?.token || "");
      const newPassword = String(body?.password || "");
      if (!token || newPassword.length < 12 || newPassword.length > 72) {
        return json({ error: "INVALID_REQUEST" }, 400, origin);
      }
      // Verify stored token
      const { data: resetRecord } = await sb.from("codes").select("*").eq("code", "ADMIN_RESET_TOKEN").maybeSingle();
      if (!resetRecord || !resetRecord.note) {
        return json({ error: "INVALID_OR_EXPIRED_TOKEN" }, 400, origin);
      }
      // Parse stored hash and expiry
      const note = resetRecord.note;
      const hashMatch = note.match(/Reset token hash: ([^,]+)/);
      const expiresMatch = note.match(/expires: (\d+)/);
      if (!hashMatch || !expiresMatch) {
        return json({ error: "INVALID_TOKEN_FORMAT" }, 400, origin);
      }
      const storedHash = hashMatch[1];
      const expiresAt = parseInt(expiresMatch[1], 10);
      if (Date.now() > expiresAt) {
        // Clean up expired token
        await sb.from("codes").delete().eq("code", "ADMIN_RESET_TOKEN");
        return json({ error: "TOKEN_EXPIRED" }, 400, origin);
      }
      const valid = await bcrypt.compare(token, storedHash);
      if (!valid) {
        return json({ error: "INVALID_OR_EXPIRED_TOKEN" }, 400, origin);
      }
      // Update admin password in Function Secret
      // NOTE: This requires the Function to have permission to update its own secrets
      // which it doesn't by default. The password must be updated manually in Supabase Dashboard
      // or via the Supabase Management API with a service token.
      // For now, we return instructions.
      
      // Clean up used token
      await sb.from("codes").delete().eq("code", "ADMIN_RESET_TOKEN");
      
      return json({ 
        ok: true, 
        message: "Password reset token verified. The admin password must be updated manually in Supabase Dashboard → Edge Functions → Secrets → ADMIN_PASSWORD. Then redeploy the function.",
        requiresManualSecretUpdate: true
      }, 200, origin);
    }

    /* admin: audit log — paginated, newest first */
    if (req.method === "GET" && path === "/api/admin/audit-log") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const u = new URL(req.url);
      const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit")) || 50));
      const cursor = u.searchParams.get("cursor");
      const action = u.searchParams.get("action")?.trim() || "";
      const targetType = u.searchParams.get("target_type")?.trim() || "";
      const adminEmail = u.searchParams.get("admin_email")?.trim() || "";
      
      let q = sb.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(limit + 1);
      if (cursor) q = q.lt("created_at", cursor);
      if (action) q = q.eq("action", action);
      if (targetType) q = q.eq("target_type", targetType);
      if (adminEmail) q = q.eq("admin_email", adminEmail);
      
      const { data: list, error } = await q;
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      const hasMore = (list || []).length > limit;
      const page = hasMore ? list.slice(0, limit) : (list || []);
      return json({
        data: page,
        nextCursor: hasMore ? page[page.length - 1].created_at : null,
        hasMore,
      }, 200, origin);
    }

    /* admin: error log — paginated, newest first */
    if (req.method === "GET" && path === "/api/admin/errors") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const u = new URL(req.url);
      const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit")) || 50));
      const cursor = u.searchParams.get("cursor");
      const errorCode = u.searchParams.get("error_code")?.trim() || "";
      const endpoint = u.searchParams.get("endpoint")?.trim() || "";
      const resolved = u.searchParams.get("resolved")?.trim() || "";
      const userCode = u.searchParams.get("user_code")?.trim() || "";
      
      let q = sb.from("error_log").select("*").order("created_at", { ascending: false }).limit(limit + 1);
      if (cursor) q = q.lt("created_at", cursor);
      if (errorCode) q = q.eq("error_code", errorCode);
      if (endpoint) q = q.ilike("endpoint", `%${endpoint}%`);
      if (resolved === "true") q = q.eq("resolved", true);
      else if (resolved === "false") q = q.eq("resolved", false);
      if (userCode) q = q.eq("user_code", userCode);
      
      const { data: list, error } = await q;
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      const hasMore = (list || []).length > limit;
      const page = hasMore ? list.slice(0, limit) : (list || []);
      return json({
        data: page,
        nextCursor: hasMore ? page[page.length - 1].created_at : null,
        hasMore,
      }, 200, origin);
    }

    /* admin: mark error as resolved */
    if (req.method === "PATCH" && path === "/api/admin/errors/resolve") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const id = body?.id;
      const resolved = !!body?.resolved;
      if (!id) return json({ error: "MISSING_ID" }, 400, origin);
      const { error } = await sb.from("error_log")
        .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null, resolved_by: ADMIN_EMAIL })
        .eq("id", id);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }

    /* ============================================================
       admin: expiring-subscriptions report — GET /api/admin/expiring?days=14
       Composed through the §2 status composer from the same data the users
       list uses (auth users × their primary code row): only accounts whose
       subStatus is "active" or "trial", whose subEnd falls inside
       [now, now + days], and that are NOT suspended. Sorted by subEnd asc.
       ============================================================ */
    if (req.method === "GET" && path === "/api/admin/expiring") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const days = Math.min(365, Math.max(1, Math.floor(Number(url.searchParams.get("days")) || 14)));
      const now = Date.now();
      const horizon = now + days * DAY_MS;
      // All users, all pages (same pagination shape as /api/users).
      const users: any[] = [];
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
        users.push(...(data?.users || []));
        if ((data?.users || []).length < 200) break;
      }
      // One codes fetch, grouped by both owner formats (same as /api/users).
      const { data: allCodes } = await sb.from("codes").select("*");
      const codeByOwner = new Map<string, any[]>();
      for (const c of allCodes || []) {
        const k = String(c.owner || "").toLowerCase();
        if (!codeByOwner.has(k)) codeByOwner.set(k, []);
        codeByOwner.get(k)!.push(c);
      }
      const rows: any[] = [];
      for (const u of users) {
        const owners = [`user:${u.id}`, String(u.email || "").toLowerCase()];
        const owned: any[] = [];
        for (const o of owners) for (const c of (codeByOwner.get(o) || [])) owned.push(c);
        const status = accountStatusOf(pickPrimaryCode(owned), u.user_metadata || {}, { appSuspended: !!u.app_metadata?.suspended });
        // Suspended accounts are an admin decision, not an email reminder.
        if (status.accountStatus !== "allowed") continue;
        if (status.subStatus !== "active" && status.subStatus !== "trial") continue;
        const endMs = parseWhen(status.subEnd);
        if (endMs == null || endMs < now || endMs > horizon) continue;
        rows.push({
          id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || u.email || "",
          plan: status.plan,
          subEnd: status.subEnd,
          remainingDays: status.remainingDays,
          codeUsed: status.codeUsed,
          activationSource: status.activationSource,
        });
      }
      rows.sort((a, b) => (Date.parse(a.subEnd) || 0) - (Date.parse(b.subEnd) || 0));
      return json({ days, total: rows.length, data: rows }, 200, origin);
    }

    /* admin: contact-messages inbox — GET /api/admin/contact-messages?limit=100
       Newest first; resolved flags come from migration 0012 columns. */
    if (req.method === "GET" && path === "/api/admin/contact-messages") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const u = new URL(req.url);
      const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit")) || 100));
      const { data: list, error } = await sb.from("contact_messages")
        .select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({
        data: (list || []).map((m: any) => ({
          id: m.id, name: m.name, email: m.email, subject: m.subject, message: m.message,
          created: m.created_at, resolved: m.resolved === true, resolvedAt: m.resolved_at || null,
        })),
      }, 200, origin);
    }
    /* admin: resolve / unresolve one contact message. Conditional select-back
       so an unknown id reports 404 (the supabase-js "count is null unless you
       select" trap documented above applies here too). */
    if (req.method === "PATCH" && path === "/api/admin/contact-messages/resolve") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const id = String(body?.id || "");
      if (!id) return json({ error: "MISSING_ID" }, 400, origin);
      // contact_messages.id is a uuid — a non-uuid would surface as a Postgres
      // cast error (500); reject it up front as a bad request instead.
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return json({ error: "BAD_REQUEST", message: "id must be a contact_messages uuid" }, 400, origin);
      }
      const resolved = body?.resolved === undefined ? true : !!body?.resolved;
      const { data, error } = await sb.from("contact_messages")
        .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null })
        .eq("id", id).select("id").maybeSingle();
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      if (!data) return json({ error: "NOT_FOUND" }, 404, origin);
      await logAdminAction(ADMIN_EMAIL, "resolve_contact", "contact_message", id, { resolved }, req);
      return json({ ok: true, id, resolved }, 200, origin);
    }

    /* ============================================================
       admin: TOTP 2FA for the admin panel — opt-in, DEFAULT OFF.
       Storage: public.admin_2fa (migration 0012, service_role only).
       With no enabled row the login gate above is a no-op, so enabling or
       abandoning setup can never lock the owner out. Secret format and
       verification live in ./totp.mjs (RFC 6238, tested against the RFC
       vectors in tests/expiry-2fa.test.mjs).
       ============================================================ */
    if (req.method === "POST" && path === "/api/admin/2fa/setup") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      // Fresh 160-bit secret; overwrites any prior secret, resets recovery
      // codes, and flips back to disabled — /enable must re-verify a live
      // code before the gate arms again.
      const secret = generateTotpSecret();
      const { error } = await sb.from("admin_2fa").upsert(
        { admin_email: ADMIN_EMAIL, secret, enabled: false, recovery_codes: [] },
        { onConflict: "admin_email" });
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      await logAdminAction(ADMIN_EMAIL, "2fa_setup", "system", ADMIN_EMAIL, {}, req);
      return json({
        secret,
        otpauth: `otpauth://totp/GymOS:${encodeURIComponent(ADMIN_EMAIL)}?secret=${secret}&issuer=GymOS`,
      }, 200, origin);
    }
    if (req.method === "POST" && path === "/api/admin/2fa/enable") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const { data: row } = await sb.from("admin_2fa")
        .select("secret, enabled").eq("admin_email", ADMIN_EMAIL).maybeSingle();
      if (!row?.secret) return json({ error: "NOT_SETUP" }, 400, origin);
      if (!(await verifyTotp(row.secret, String(body?.code || "")))) {
        return json({ error: "TOTP_INVALID" }, 401, origin);
      }
      const recoveryCodes = generateRecoveryCodes(8, 10);
      const hashed: string[] = [];
      for (const rc of recoveryCodes) hashed.push(await bcrypt.hash(rc, BCRYPT_COST));
      const { error } = await sb.from("admin_2fa")
        .update({ enabled: true, recovery_codes: hashed }).eq("admin_email", ADMIN_EMAIL);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      await logAdminAction(ADMIN_EMAIL, "2fa_enable", "system", ADMIN_EMAIL, {}, req);
      // Plaintext codes are returned EXACTLY once — the table only stores
      // bcrypt hashes.
      return json({ ok: true, recoveryCodes }, 200, origin);
    }
    if (req.method === "POST" && path === "/api/admin/2fa/disable") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const ip = clientIp(req);
      if (tooManyAdmin(ip)) return json({ error: "RATE_LIMITED", secs: ADMIN_WINDOW_MS / 1000 }, 429, origin);
      failAdminIp(ip);
      const { data: row } = await sb.from("admin_2fa")
        .select("secret, enabled, recovery_codes").eq("admin_email", ADMIN_EMAIL).maybeSingle();
      if (!row || row.enabled !== true) return json({ error: "NOT_ENABLED" }, 400, origin);
      const provided = String(body?.code ?? body?.recoveryCode ?? "").trim();
      let ok = row.secret ? await verifyTotp(row.secret, provided) : false;
      if (!ok) {
        const codes: string[] = Array.isArray(row.recovery_codes) ? row.recovery_codes : [];
        for (const h of codes) {
          if (await bcrypt.compare(provided, h)) { ok = true; break; }
        }
      }
      if (!ok) return json({ error: "TOTP_INVALID" }, 401, origin);
      // Row deleted entirely: the login gate falls back to password-only and
      // the next setup starts from a clean slate.
      const { error } = await sb.from("admin_2fa").delete().eq("admin_email", ADMIN_EMAIL);
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      await logAdminAction(ADMIN_EMAIL, "2fa_disable", "system", ADMIN_EMAIL, {}, req);
      return json({ ok: true }, 200, origin);
    }
    if (req.method === "GET" && path === "/api/admin/2fa/status") {
      if (!authAdmin(req)) return json({ error: "FORBIDDEN" }, 403, origin);
      const { data: row } = await sb.from("admin_2fa")
        .select("enabled").eq("admin_email", ADMIN_EMAIL).maybeSingle();
      return json({ enabled: row?.enabled === true }, 200, origin);
    }

    /* contact form */
    if (req.method === "POST" && path === "/api/contact") {
      const { name, email, subject, message } = body || {};
      if (!name || !email || !subject || !message) {
        return json({ error: "BAD_REQUEST" }, 400, origin);
      }
      const cleanName = String(name).slice(0, 120);
      const cleanEmail = String(email).slice(0, 255).toLowerCase();
      const cleanSubject = String(subject).slice(0, 60);
      const cleanMessage = String(message).slice(0, 5000);
      const { error } = await sb.from("contact_messages").insert({
        name: cleanName, email: cleanEmail, subject: cleanSubject, message: cleanMessage,
      });
      if (error) return json({ error: "INTERNAL_ERROR" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }

    return json({ error: "NOT_FOUND" }, 404, origin);
  } catch (e) {
    const err = e as Error;
    const errorCode = (err as any)?.code || "INTERNAL_ERROR";
    const stackTrace = err.stack || null;
    // Log error with context
    const authCtx = authJwt(req);
    const ctx = extractAuthContext(req, authCtx);
    await logError(
      path,
      req.method,
      errorCode,
      err.message || "Unknown error",
      stackTrace,
      req,
      { ...ctx, requestBody: body }
    );
    console.error("[API error]", err);
    return json({ error: "INTERNAL_ERROR" }, 500, origin);
  }
}

Deno.serve(handler);
