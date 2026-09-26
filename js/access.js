// ============================================================
// Access — subscription gate: full / read-only / locked
//
// Replaces the old behaviour where an expired trial simply
// painted one red line of text on the login form and left the
// user with nowhere to go. Now an expired licence keeps the gym's
// data fully readable (and exportable) and offers a clear way in.
//
// SCOPE / HONESTY NOTE
// This is a UX + revenue guard, NOT a security boundary. Everything
// here lives in localStorage, which the user can edit by hand. The
// real enforcement is server-side: the codes table carries the real
// `expiresAt`, the Edge Function refuses to extend a licence past it,
// and RLS stops direct table access. So: fail OPEN on ambiguity —
// never lock a paying customer out over missing metadata — and let
// the server be the authority that actually matters.
// ============================================================

const LICENSE_KEY = "dp_license";
const SESSION_KEY = "dp_current_user";

export const DAY = 86400000;

export const FULL = "full";         // everything works
export const READONLY = "readonly"; // expired — read + export, no writes
export const LOCKED = "locked";     // no licence at all — must activate

/* ---------------------------------------------------------------
   Pure logic — no DOM, no storage. Directly unit-tested.
   --------------------------------------------------------------- */
export function computeAccess(input = {}, now = Date.now()) {
  const lic = input.lic || null;
  const user = input.user || null;

  // 1) A licence record (activation code, or the server-issued trial)
  //    is authoritative — it knows the real expiry instant.
  if (lic) {
    const exp = Number(lic.expiresAt);
    const base = {
      code: String(lic.code || ""),
      tier: String(lic.tier || "standard"),
      owner: String(lic.owner || ""),
      expiresAt: exp,
      isTrial: String(lic.tier || "") === "trial",
      isLifetime: exp === 0,
    };
    // 0 is the sentinel for a lifetime licence
    if (exp === 0) return { ...base, state: FULL, reason: "lifetime", daysLeft: Infinity };
    if (Number.isFinite(exp) && exp > now) {
      return { ...base, state: FULL, reason: "active", daysLeft: daysBetween(exp, now) };
    }
    return { ...base, state: READONLY, reason: "license_expired", daysLeft: 0 };
  }

  // 2) No licence record. Email signups (js/signup.js) never write one,
  //    they only keep a session — so fall back to that.
  if (user && (user.subscription === "active" || user.subscription === "trial")) {
    const subEnd = Number(user.subEnd);
    const isTrial = user.subscription === "trial";
    const base = {
      code: String(user.email || "").split("@")[0].toUpperCase(),
      tier: isTrial ? "trial" : "standard",
      owner: String(user.name || user.email || ""),
      expiresAt: subEnd,
      isTrial,
      isLifetime: false,
    };
    // No usable expiry in the session → we cannot prove it lapsed, so let
    // them in. Being wrong here costs one month; being wrong the other way
    // locks out a paying gym.
    if (!Number.isFinite(subEnd) || subEnd <= 0) {
      return { ...base, state: FULL, reason: "no_expiry_metadata", daysLeft: Infinity };
    }
    if (subEnd > now) return { ...base, state: FULL, reason: isTrial ? "trial_active" : "active", daysLeft: daysBetween(subEnd, now) };
    return { ...base, state: READONLY, reason: isTrial ? "trial_expired" : "subscription_expired", daysLeft: 0 };
  }

  // 3) Nothing at all.
  return {
    state: LOCKED,
    reason: "no_license",
    code: "",
    tier: "standard",
    owner: "",
    expiresAt: 0,
    isTrial: false,
    isLifetime: false,
    daysLeft: 0,
  };
}

export function daysBetween(expiresAt, now = Date.now()) {
  if (expiresAt === 0) return Infinity;
  return Math.max(0, Math.floor((expiresAt - now) / DAY));
}

export function canWrite(access) {
  return !!access && access.state === FULL;
}

/* ---------------------------------------------------------------
   Storage bridge
   --------------------------------------------------------------- */
function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); }
  catch { return null; }
}

export function readInputs() {
  return { lic: readJSON(LICENSE_KEY), user: readJSON(SESSION_KEY) };
}

let _cache = null;
export function getAccess(force = false) {
  if (force || !_cache) _cache = computeAccess(readInputs());
  return _cache;
}
export function invalidate() { _cache = null; }

/* ---------------------------------------------------------------
   Write guard — installed into the store's mutation choke points.
   Returns false and opens the gate when the write is not allowed.
   --------------------------------------------------------------- */
let onBlocked = null;
/** The default handler always shows the gate. Without this, a refused write
    would be a silent no-op — the user taps "add member" and nothing happens
    with no explanation, which reads as a broken app rather than a paywall. */
export function setBlockedHandler(fn) { onBlocked = fn; }

export function requireWrite(what = "") {
  const a = getAccess();
  if (canWrite(a)) return true;
  if (onBlocked) onBlocked(a, what);
  else showGate(a);
  return false;
}

/* ---------------------------------------------------------------
   UI — self-contained so it works on any page regardless of that
   page's stylesheet (the .auth-* classes only exist in login.html).
   --------------------------------------------------------------- */
const BRAND = "#CCFF00";
const INK = "#c4c9ac";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(ts) {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "";
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch { return ""; }
}

function shell(inner) {
  return `<div id="dpGate" style="position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.94);backdrop-filter:blur(6px);color:#fff;font-family:Inter,Tajawal,system-ui,sans-serif;overflow-y:auto">
  <div style="width:100%;max-width:440px;background:#000;border:1px solid #444933;border-radius:16px;padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.8);position:relative;overflow:hidden">
    <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${BRAND}"></div>
    ${inner}
  </div>
</div>`;
}

function gateContent(a) {
  if (a.state === READONLY) {
    const when = fmtDate(a.expiresAt);
    return `
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:52px;line-height:1;margin-bottom:12px">⏳</div>
        <h1 style="margin:0;font-size:21px;font-weight:800;letter-spacing:-.02em">Free trial ended</h1>
        <p style="margin:6px 0 0;font-size:19px;font-weight:700;color:#c4c9ac" dir="rtl">انتهت الفترة المجانية</p>
        ${when ? `<p style="margin:10px 0 0;font-size:12px;color:#6b6f5a">${esc(when)}</p>` : ""}
      </div>
      <p style="font-size:13.5px;line-height:1.7;color:${INK};text-align:center;margin:0 0 18px">
        Your data is safe. You can still view, search and export everything.
        <br /><span dir="rtl" style="color:#8b8f78">بياناتك محفوظة. لا يزال بإمكانك عرض وبحث وتصدير كل شيء.</span>
      </p>
      <div style="background:#14150f;border:1px solid #2a2c1e;border-radius:12px;padding:14px;margin-bottom:20px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#6b6f5a;margin-bottom:9px">Still available</div>
        <div style="font-size:12.5px;color:${INK};line-height:1.9">
          ✓ View members &amp; history<br />✓ Search and reports<br />✓ Export a backup
        </div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#6b6f5a;margin:11px 0 9px">Paused</div>
        <div style="font-size:12.5px;color:#7a7e68;line-height:1.9">
          ✕ Adding or editing members<br />✕ Payments and check-ins
        </div>
      </div>
      <a href="activate.html" style="display:block;text-align:center;background:${BRAND};color:#000;font-weight:800;padding:15px;border-radius:12px;text-decoration:none;font-size:15px">
        Enter activation code
        <span style="display:block;font-size:11px;font-weight:600;opacity:.75" dir="rtl">ضع كود التفعيل</span>
      </a>
      <p style="text-align:center;font-size:11.5px;color:#6b6f5a;margin:14px 0 0;line-height:1.6">
        Need a code? <a href="activate.html" style="color:${BRAND}">Get one</a> or contact us on WhatsApp
        <span dir="rtl" style="display:block">تحتاج كود؟ اطلبه منّا</span>
      </p>`;
  }

  // LOCKED
  return `
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:52px;line-height:1;margin-bottom:12px">🔑</div>
      <h1 style="margin:0;font-size:21px;font-weight:800;letter-spacing:-.02em">Activate your gym</h1>
      <p style="margin:6px 0 0;font-size:19px;font-weight:700;color:#c4c9ac" dir="rtl">فعّل التطبيق</p>
    </div>
    <p style="font-size:13.5px;line-height:1.7;color:${INK};text-align:center;margin:0 0 20px">
      Enter the activation code we sent you to start managing your gym.
      <br /><span dir="rtl" style="color:#8b8f78">أدخل كود التفعيل الذي أرسلناه لك لبدء إدارة صالتك.</span>
    </p>
    <a href="activate.html" style="display:block;text-align:center;background:${BRAND};color:#000;font-weight:800;padding:15px;border-radius:12px;text-decoration:none;font-size:15px">
      Enter activation code
      <span style="display:block;font-size:11px;font-weight:600;opacity:.75" dir="rtl">ضع كود التفعيل</span>
    </a>
    <a href="activate.html#trial" style="display:block;text-align:center;margin-top:10px;background:transparent;color:${INK};font-weight:700;padding:13px;border-radius:12px;text-decoration:none;border:1px solid #333527;font-size:13.5px">
      Start a 30-day free trial
      <span style="display:block;font-size:11px;font-weight:600;opacity:.7" dir="rtl">ابدأ تجربة مجانية ٣٠ يوم</span>
    </a>`;
}

export function hideGate() {
  document.getElementById("dpGate")?.remove();
}

export function showGate(access = getAccess()) {
  if (access.state === FULL) { hideGate(); return; }
  if (document.getElementById("dpGate")) return;
  document.body.insertAdjacentHTML("beforeend", shell(gateContent(access)));
}

export function isGateOpen() {
  return !!document.getElementById("dpGate");
}

/* Read-only strip along the bottom of the app, so the state is
   visible before the user discovers a dead button. */
const BANNER_ID = "dpAccessBar";
export function showBanner(access = getAccess()) {
  if (access.state !== READONLY) { hideBanner(); return; }
  if (document.getElementById(BANNER_ID)) return;
  const el = document.createElement("div");
  el.id = BANNER_ID;
  el.setAttribute("role", "status");
  el.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99990;background:#1a1408;border-top:1px solid #4a3d12;padding:11px 14px;display:flex;align-items:center;gap:12px;justify-content:center;flex-wrap:wrap;font-family:Inter,Tajawal,system-ui,sans-serif;box-shadow:0 -8px 24px rgba(0,0,0,.5)";
  el.innerHTML = `<span style="font-size:12.5px;color:#e8d9a0">⏳ Free trial ended — read only &nbsp;<span dir="rtl" style="color:#a99a6b">انتهت الفترة المجانية — عرض فقط</span></span>
    <a href="activate.html" style="background:${BRAND};color:#000;font-weight:800;font-size:12px;padding:8px 16px;border-radius:9px;text-decoration:none;white-space:nowrap">Enter code</a>`;
  document.body.appendChild(el);
  document.body.style.paddingBottom = "64px";
}

export function hideBanner() {
  document.getElementById(BANNER_ID)?.remove();
  document.body.style.paddingBottom = "";
}

/* ---------------------------------------------------------------
   Boot wiring
   --------------------------------------------------------------- */
export function install({ blockOnLocked = true } = {}) {
  invalidate();
  const a = getAccess();
  setBlockedHandler((acc) => showGate(acc));
  showBanner(a);

  if (blockOnLocked && a.state === LOCKED) {
    showGate(a);
    // Deliberately still wire the listeners below. A user who pastes a code in
    // the activation tab must be able to come back to this one-locked app
    // tab and have the gate lift, rather than needing a manual reload.
  }

  // Re-check periodically: a licence can lapse while the app sits open
  // on a tablet all day, and the UI must not silently keep writing.
  setInterval(() => {
    const cur = getAccess(true);
    showBanner(cur);
    if (cur.state !== FULL) showGate(cur);
    else { hideGate(); hideBanner(); }
  }, 60_000);

  // Another tab activated a code → pick it up without a reload.
  window.addEventListener("storage", (e) => {
    if (e.key === LICENSE_KEY || e.key === SESSION_KEY) {
      const cur = getAccess(true);
      if (canWrite(cur)) { hideGate(); hideBanner(); }
      else showGate(cur);
    }
  });

  return a;
}
