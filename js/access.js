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
  if (lic && lic.suspended) {
    const base = { code: String(lic.code || ""), tier: String(lic.tier || "standard"), owner: String(lic.owner || ""), expiresAt: Number(lic.expiresAt) || 0, isTrial: false, isLifetime: false };
    return { ...base, state: READONLY, reason: "suspended", daysLeft: 0 };
  }

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
  if (user && user.suspended) {
    return { state: READONLY, reason: "suspended", daysLeft: 0, code: "", tier: "standard", owner: "", expiresAt: 0, isTrial: false, isLifetime: false };
  }

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
    // No usable expiry in the session → we cannot prove they're still covered,
    // so do NOT grant write access. Fail to read-only instead of failing open:
    // this branch used to give FULL forever, which is how phones kept entering
    // the app without any account. Read-only keeps their data visible/exportable
    // while they re-login (metadata refreshes) or activate a code. The server
    // remains the real authority on expiry.
    if (!Number.isFinite(subEnd) || subEnd <= 0) {
      return { ...base, state: READONLY, reason: "no_expiry_metadata", daysLeft: 0 };
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
   UI — Modal activation gate over the app (not a separate page)
   --------------------------------------------------------------- */
const BRAND = "#CCFF00";
const INK = "#c4c9ac";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&", "<": "<", ">": ">", '"': "\"", "'": "'" }[c]));
}

function fmtDate(ts) {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "";
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" });
  } catch { return ""; }
}

function gateContent(a) {
  const isLocked = a.state === LOCKED;
  // Suspended ≠ expired (contract §1): an admin suspension gets its own title,
  // its own message and NO inline activation form — the server's §3.1 gate
  // makes a suspension un-liftable by codes, so the form would only invite a
  // guaranteed SUSPENDED rejection.
  const isSuspended = a.reason === "suspended";
  const when = fmtDate(a.expiresAt);
  const title = isSuspended ? "Account suspended" : isLocked ? "Activate your gym" : "Free trial ended";
  const titleAr = isSuspended ? "الحساب موقوف إدارياً" : isLocked ? "فعّل التطبيق" : "انتهت الفترة المجانية";
  const icon = isSuspended ? "⛔" : isLocked ? "🔑" : "⏳";
  const message = isSuspended
    ? "This account was suspended by the administrator. Your data is safe — you can still view, search and export everything — but changes are paused until the suspension is lifted."
    : isLocked
    ? "Enter the activation code we sent you to start managing your gym."
    : "Your data is safe. You can still view, search and export everything.";
  const messageAr = isSuspended
    ? "تم إيقاف هذا الحساب من قِبل الإدارة. بياناتك محفوظة — ما زال بإمكانك عرض أعضائك والبحث وتصدير كل شيء — لكن التعديلات متوقفة حتى يُرفع الإيقاف."
    : isLocked
    ? "أدخل كود التفعيل الذي أرسلناه لك لبدء إدارة صالتك."
    : "بياناتك محفوظة. لا يزال بإمكانك عرض وبحث وتصدير كل شيء.";

  return `
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:52px;line-height:1;margin-bottom:12px">${icon}</div>
      <h1 style="margin:0;font-size:21px;font-weight:800;letter-spacing:-.02em">${esc(title)}</h1>
      <p style="margin:6px 0 0;font-size:19px;font-weight:700;color:#c4c9ac" dir="rtl">${esc(titleAr)}</p>
      ${when ? `<p style="margin:10px 0 0;font-size:12px;color:#6b6f5a">${esc(when)}</p>` : ""}
    </div>
    <p style="font-size:13.5px;line-height:1.7;color:${INK};text-align:center;margin:0 0 18px">
      ${esc(message)}
      <br /><span dir="rtl" style="color:#8b8f78">${esc(messageAr)}</span>
    </p>
    ${!isLocked && !isSuspended ? `
    <div style="background:#14150f;border:1px solid #2a2c1e;border-radius:12px;padding:14px;margin-bottom:20px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#6b6f5a;margin-bottom:9px">Still available</div>
      <div style="font-size:12.5px;color:${INK};line-height:1.9">
        ✓ View members & history<br />✓ Search and reports<br />✓ Export a backup
      </div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#6b6f5a;margin:11px 0 9px">Paused</div>
      <div style="font-size:12.5px;color:#7a7e68;line-height:1.9">
        ✕ Adding or editing members<br />✕ Payments and check-ins
      </div>
    </div>` : ""}
    ${isSuspended ? "" : `
    <!-- Inline activation form -->
    <form id="activationFormInline" class="space-y-4" autocomplete="off">
      <div class="flex justify-center gap-2 sm:gap-3" dir="ltr" style="margin-bottom: 8px;">
        <input aria-label="Digit 1" autofocus class="digit-input" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]*" style="width: 3rem; height: 4rem; text-align: center; font-family: 'Space Grotesk', sans-serif; font-size: 2rem; font-weight: 700; background-color: #000000; border: 1px solid #333333; color: #ccff00; border-radius: 1rem; transition: all 0.2s ease;" />
        <input aria-label="Digit 2" class="digit-input" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]*" style="width: 3rem; height: 4rem; text-align: center; font-family: 'Space Grotesk', sans-serif; font-size: 2rem; font-weight: 700; background-color: #000000; border: 1px solid #333333; color: #ccff00; border-radius: 1rem; transition: all 0.2s ease;" />
        <input aria-label="Digit 3" class="digit-input" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]*" style="width: 3rem; height: 4rem; text-align: center; font-family: 'Space Grotesk', sans-serif; font-size: 2rem; font-weight: 700; background-color: #000000; border: 1px solid #333333; color: #ccff00; border-radius: 1rem; transition: all 0.2s ease;" />
        <span class="text-3xl font-light self-center" style="color:#444933;">-</span>
        <input aria-label="Digit 4" class="digit-input" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]*" style="width: 3rem; height: 4rem; text-align: center; font-family: 'Space Grotesk', sans-serif; font-size: 2rem; font-weight: 700; background-color: #000000; border: 1px solid #333333; color: #ccff00; border-radius: 1rem; transition: all 0.2s ease;" />
        <input aria-label="Digit 5" class="digit-input" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]*" style="width: 3rem; height: 4rem; text-align: center; font-family: 'Space Grotesk', sans-serif; font-size: 2rem; font-weight: 700; background-color: #000000; border: 1px solid #333333; color: #ccff00; border-radius: 1rem; transition: all 0.2s ease;" />
        <input aria-label="Digit 6" class="digit-input" maxlength="1" type="text" inputmode="numeric" pattern="[0-9]*" style="width: 3rem; height: 4rem; text-align: center; font-family: 'Space Grotesk', sans-serif; font-size: 2rem; font-weight: 700; background-color: #000000; border: 1px solid #333333; color: #ccff00; border-radius: 1rem; transition: all 0.2s ease;" />
      </div>
      <div id="manualBlockInline" class="flex flex-col gap-2 mb-2" style="display: none;">
        <label class="text-xs uppercase tracking-widest opacity-60 px-1" style="color:#c4c9ac;">Manual Activation / التنشيط اليدوي</label>
        <input id="manualCodeInline" class="w-full bg-[#171717] border border-[#333333] rounded-lg py-4 px-4 font-headline tracking-widest focus:outline-none focus:border-[#C3F400] focus:ring-1 focus:ring-[#C3F400]/30 transition-all placeholder:opacity-40" placeholder="Enter Code Manually / أدخل الرمز يدوياً" style="color: #CCFF00;" type="text"/>
      </div>
      <p id="actMsgInline" class="text-sm text-center min-h-[1.5em]" style="color:#ff3366;"></p>
      <button type="submit" class="w-full py-4 font-headline font-bold text-lg rounded-lg neon-shadow hover:bg-[#abd600] active:scale-95 transition-all duration-150 uppercase tracking-widest flex items-center justify-center gap-2" style="background-color: #CCFF00; color: #000000; box-shadow: 0 0 20px rgba(204, 255, 0, 0.5);">
        <div class="flex flex-col items-center">
          <span>VERIFY</span>
          <span class="text-xs opacity-80" dir="rtl">تحقق</span>
        </div>
        <span class="material-symbols-outlined">arrow_forward</span>
      </button>
      <div class="flex gap-2">
        <button type="button" id="toggleManualBtn" class="flex-1 py-2 text-xs uppercase tracking-widest font-headline opacity-70 hover:opacity-100 transition-opacity" style="color:#c7c6c6; background: transparent; border: none;">Show manual entry / إدخال يدوي</button>
      </div>
    </form>`}
    ${isLocked ? `<a href="activate.html#trial" style="display:block;text-align:center;margin-top:10px;background:transparent;color:${INK};font-weight:700;padding:13px;border-radius:12px;text-decoration:none;border:1px solid #333527;font-size:13.5px">
      Start a 30-day free trial
      <span style="display:block;font-size:11px;font-weight:600;opacity:.7" dir="rtl">ابدأ تجربة مجانية ٣٠ يوم</span>
    </a>` : ""}
    ${isSuspended
      ? `<p style="text-align:center;font-size:11.5px;color:#6b6f5a;margin:14px 0 0;line-height:1.6">
          تواصل مع الإدارة لرفع الإيقاف
          <span style="display:block">Contact your administrator to lift the suspension</span>
        </p>`
      : `<p style="text-align:center;font-size:11.5px;color:#6b6f5a;margin:14px 0 0;line-height:1.6">
      Need a code? Contact us on WhatsApp
      <span dir="rtl" style="display:block">تحتاج كود؟ تواصل معنا على واتساب</span>
    </p>`}`;
}

// Modal shell with semi-transparent backdrop
function shell(inner) {
  return `<div id="dpGate" style="position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);color:#fff;font-family:Inter,Tajawal,system-ui,sans-serif;overflow-y:auto">
  <div style="width:100%;max-width:440px;background:#000;border:1px solid #444933;border-radius:16px;padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.9);position:relative;overflow:hidden">
    <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${BRAND}"></div>
    ${inner}
  </div>
</div>`;
}

export function hideGate() {
  document.getElementById("dpGate")?.remove();
  document.body.style.overflow = "";
}

export function showGate(access = getAccess()) {
  if (access.state === FULL) { hideGate(); return; }
  if (document.getElementById("dpGate")) return;
  
  document.body.style.overflow = "hidden";
  document.body.insertAdjacentHTML("beforeend", shell(gateContent(access)));
  
  // Wire up the inline activation form
  const form = document.getElementById("activationFormInline");
  const msgEl = document.getElementById("actMsgInline");
  const digitInputs = form?.querySelectorAll(".digit-input");
  const manualBlock = document.getElementById("manualBlockInline");
  const manualCodeInput = document.getElementById("manualCodeInline");
  const toggleManualBtn = document.getElementById("toggleManualBtn");
  let useManual = false;

  // Auto-focus and auto-advance digit inputs
  if (digitInputs) {
    digitInputs.forEach((input, idx) => {
      input.addEventListener("input", (e) => {
        if (e.target.value && idx < digitInputs.length - 1) {
          digitInputs[idx + 1].focus();
        }
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !e.target.value && idx > 0) {
          digitInputs[idx - 1].focus();
        }
      });
    });
  }

  // Toggle manual entry
  if (toggleManualBtn && manualBlock) {
    toggleManualBtn.addEventListener("click", () => {
      useManual = !useManual;
      manualBlock.style.display = useManual ? "flex" : "none";
      toggleManualBtn.textContent = useManual ? "Hide manual entry / إخفاء الإدخال اليدوي" : "Show manual entry / إدخال يدوي";
      if (useManual) manualCodeInput?.focus();
    });
  }

  // Handle form submit
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalBtnHtml = submitBtn.innerHTML;
      
      // Get code from either digit inputs or manual input
      let code = "";
      if (useManual && manualCodeInput?.value) {
        code = manualCodeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      } else if (digitInputs) {
        code = Array.from(digitInputs).map(i => i.value).join("").toUpperCase();
      }
      
      if (!code || code.length !== 6) {
        msgEl.textContent = "Enter a valid 6-character code / أدخل كود صحيح من 6 خانات";
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<div class="flex items-center gap-2"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Verifying...</div>`;
      msgEl.textContent = "";

      try {
        const { codesDb } = await import('./db.js');
        const res = await codesDb.verifyClientLogin(code, ""); // No password for activation
        if (res.ok) {
          const { license } = await import('./license.js');
          license.save(res.record);
          localStorage.setItem('dp_license_mode', codesDb.mode());
          const L = license.get();
          localStorage.setItem('dp_cloud', (codesDb.mode() === 'online' && L && L.data_enabled !== false) ? '1' : '0');
          
          msgEl.textContent = "";
          msgEl.style.color = "#CCFF00";
          msgEl.textContent = "✅ Activated! / تم التفعيل بنجاح";
          
          // Refresh access and close gate
          setTimeout(() => {
            invalidate();
            const newAccess = getAccess(true);
            if (canWrite(newAccess)) {
              hideGate();
              // Reload the app to reflect new license state
              window.location.reload();
            }
          }, 800);
        } else {
          const errors = {
            NOT_FOUND: 'Code not found / الكود غير موجود',
            NOT_ACTIVATED: 'This code was never activated / الكود لم يُفعّل بعد',
            NO_PASSWORD: 'No password set for this code / لا توجد كلمة سر لهذا الكود',
            WRONG_PASSWORD: 'Wrong code / الكود خاطئ',
            RATE_LIMITED: `Too many attempts — wait ${Math.ceil((res.secs || 60) / 60)} min / محاولات كثيرة`,
            SUSPENDED: 'Account suspended by administrator',
            SUB_EXPIRED: 'Your subscription has expired',
            ACTIVATION_DISABLED: 'Code activation disabled',

            NETWORK: 'No connection — check your internet / لا يوجد اتصال — افحص الشبكة',
          };
          msgEl.textContent = errors[res.error] || `Activation failed (${res.error}) / فشل التفعيل`;
        }
      } catch (err) {
        console.error('[activation] error:', err);
        msgEl.textContent = "No connection / لا اتصال";
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    });
  }
  
  // Return a promise that resolves when gate closes (for future use)
return new Promise((_resolve, _reject) => {
  // Promise handlers stored for future use when gate can be closed programmatically
  // Currently the gate is closed via user interaction or page navigation
});
}

export function isGateOpen() {
  return !!document.getElementById("dpGate");
}

/* Read-only strip along the bottom of the app, so the state is
   visible before the user discovers a dead button.
   A SUSPENDED account is a different state with a different message
   (contract §1) — it gets its own banner pinned to the TOP of the app
   in an amber/red tone; the bottom strip says "trial ended", which is
   the wrong message for an admin suspension. */
const BANNER_ID = "dpAccessBar";
const SUSPENDED_BANNER_ID = "dpSuspendedBar";

function removeBannerStrip() {
  document.getElementById(BANNER_ID)?.remove();
  document.body.style.paddingBottom = "";
}

export function showBanner(access = getAccess()) {
  if (access.state !== READONLY) { removeBannerStrip(); hideSuspendedBanner(); return; }
  if (access.reason === "suspended") { removeBannerStrip(); showSuspendedBanner(); return; }
  hideSuspendedBanner();
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

/* The suspended banner — bilingual, Arabic first (RTL), unmistakable. */
function showSuspendedBanner() {
  if (document.getElementById(SUSPENDED_BANNER_ID)) return;
  const el = document.createElement("div");
  el.id = SUSPENDED_BANNER_ID;
  el.setAttribute("role", "alert");
  el.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:99990;background:#20100a;border-bottom:1px solid #6b2a12;padding:11px 14px;display:flex;align-items:center;gap:12px;justify-content:center;flex-wrap:wrap;font-family:Inter,Tajawal,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5)";
  el.innerHTML = `<span style="font-size:13px;font-weight:700;color:#ffb9a0" dir="rtl">⛔ الحساب موقوف إدارياً — تواصل مع الإدارة</span>
    <span style="font-size:12px;color:#d9a08c">Account suspended — contact your administrator</span>`;
  document.body.appendChild(el);
}

export function hideSuspendedBanner() {
  document.getElementById(SUSPENDED_BANNER_ID)?.remove();
}

export function hideBanner() {
  removeBannerStrip();
  hideSuspendedBanner();
}

/* ---------------------------------------------------------------
   Reconnect re-check (owner-flagged flaw #8)
   ---------------------------------------------------------------
   The gate recomputes from localStorage, but a suspension or expiry
   that happened server-side never reaches an idle device: the server
   only ever ANSWERS, it never pushes. So the moment the browser fires
   'online' we (1) ask the same endpoints the app-start flow uses for
   a fresh verdict, and (2) re-render the gate/banner so a suspension
   or early expiry applies as soon as the device reconnects — not
   only on the next reload.

   • live email session → POST /api/auth/mine  (findLinkedCode, the
     exact call linkCloudIdentity() uses at app start)
   • code-only device  → POST /api/auth/refresh (the remintJwt()
     endpoint; called directly because remintJwt swallows the error
     code and we must distinguish SUSPENDED from a dead network)

   A SUSPENDED verdict is written onto the local licence (computeAccess
   reads lic.suspended) so the state flips on THIS session. A healthy
   verdict refreshes expiresAt from the server record and lifts a stale
   suspension mark — admin reactivation propagates too. Anything else
   (offline, 429, NOT_FOUND, transport error) stays silent: the fail-
   OPEN rule wins, the server remains the authority on every write. */

const RECONNECT_THROTTLE_MS = 10_000; // flaky links fire 'online' repeatedly
let _lastReconnectCheck = 0;
let _recheckInFlight = false;

const UA_SLICE = () => String((typeof navigator !== "undefined" && navigator.userAgent) || "").slice(0, 40);

function markLicense(patch) {
  const lic = readJSON(LICENSE_KEY);
  if (!lic) return;
  try { localStorage.setItem(LICENSE_KEY, JSON.stringify({ ...lic, ...patch })); } catch { /* private mode */ }
}

function applyVerdict(error, record) {
  const lic = readJSON(LICENSE_KEY);
  if (!lic) return;
  if (error === "SUSPENDED") {
    if (!lic.suspended) markLicense({ suspended: true });
    return;
  }
  if (error) return; // REVOKED / NOT_FOUND / RATE_LIMITED / network — never guess
  const patch = {};
  if (lic.suspended) patch.suspended = false;
  // Only a positive finite expiry is safe to mirror — expiryMs() returns
  // null for lifetime codes, and Number(null) === 0 would masquerade as
  // the lifetime sentinel and wipe a real countdown.
  const recExp = record ? Number(record.expiresAt) : NaN;
  if (Number.isFinite(recExp) && recExp > 0 && recExp !== Number(lic.expiresAt)) {
    patch.expiresAt = recExp;
  }
  if (Object.keys(patch).length) markLicense(patch);
}

async function fetchServerVerdict() {
  const lic = readJSON(LICENSE_KEY);
  const deviceId = localStorage.getItem("dp_device_id") || "";
  if (!lic?.code || !deviceId) return;
  const { appConfig } = await import("./config.js");
  const base = String(appConfig.apiUrl || "").replace(/\/+$/, "");
  if (!base || !navigator.onLine) return;

  // 1) Email-session device — the /api/auth/mine path from app start.
  let emailPathTried = false;
  try {
    const { supabase } = await import("./supabase-client.js");
    const { data: { session } } = await (supabase?.auth.getSession?.() ?? Promise.resolve({ data: { session: null } }));
    const token = session?.access_token;
    if (token) {
      emailPathTried = true;
      try {
        const { findLinkedCode } = await import("./db.js");
        const res = await findLinkedCode(token, deviceId, UA_SLICE());
        applyVerdict(null, res?.record || null);
      } catch (e) {
        applyVerdict(e?.code || null, null);
      }
    }
  } catch { /* supabase-client unavailable — code-only path below still runs */ }

  // 2) Code-only device — /api/auth/refresh. Same trust rules as remintJwt:
  //    the deviceId must already be registered, so a stolen code alone
  //    learns nothing (the server answers NOT SUSPENDED only for a bound device).
  if (!emailPathTried) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (appConfig.supabaseAnonKey) headers.apikey = appConfig.supabaseAnonKey;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      let res;
      try {
        res = await fetch(`${base}/api/auth/refresh`, {
          method: "POST", headers,
          body: JSON.stringify({ code: lic.code, deviceId }),
          signal: ctrl.signal,
        });
      } finally { clearTimeout(t); }
      const data = await res.json().catch(() => ({}));
      applyVerdict(res.ok ? null : (data.error || "REQUEST_FAILED"), null);
    } catch { /* transport failure — fail open, stay silent */ }
  }
}

async function onReconnect() {
  const now = Date.now();
  if (now - _lastReconnectCheck < RECONNECT_THROTTLE_MS) return; // no double-refresh
  _lastReconnectCheck = now;
  if (_recheckInFlight) return;
  _recheckInFlight = true;
  try {
    await fetchServerVerdict();
  } finally {
    _recheckInFlight = false;
  }
  const cur = getAccess(true);
  showBanner(cur);
  enforceSyncSuspension(cur.reason === "suspended");
  if (cur.state !== FULL) showGate(cur);
  else hideGate();
}

/* Suspended accounts must not keep the cloud-sync loop retrying in the
   background — every attempt just hits the server's SUSPENDED gate and
   the badge flaps "login expired" with nothing actionable. The retry
   loop itself lives in store.js (startSync/stopSync + the 20s interval),
   which is OUTSIDE this file's ownership — so we drive it through the
   store's public API from here and flag it in the contract report.
   startSync() is idempotent and re-checks entitlements, so restarting
   after the suspension lifts is safe. */
let _syncStoppedByUs = false;
async function enforceSyncSuspension(suspended) {
  try {
    const { store } = await import("./store.js");
    if (suspended) {
      store.stopSync();
      _syncStoppedByUs = true;
    } else if (_syncStoppedByUs) {
      _syncStoppedByUs = false;
      store.startSync();
    }
  } catch { /* store unavailable (pure-Node tests / offline shell) — never break the gate */ }
}

/* ---------------------------------------------------------------
   Boot wiring
   --------------------------------------------------------------- */
export function install({ blockOnLocked = true } = {}) {
  invalidate();
  const a = getAccess();
  setBlockedHandler((acc) => showGate(acc));
  showBanner(a);
  enforceSyncSuspension(a.reason === "suspended");

  // Reconnect re-check (flaw #8): suspension/expiry must apply as soon as
  // the device regains network — a tablet left offline all day must not
  // keep running on a stale FULL state until the next reload.
  window.addEventListener("online", onReconnect);

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
    enforceSyncSuspension(cur.reason === "suspended");
    if (cur.state !== FULL) showGate(cur);
    else { hideGate(); hideBanner(); }
  }, 60_000);

  // Another tab activated a code → pick it up without a reload.
  window.addEventListener("storage", (e) => {
    if (e.key === LICENSE_KEY || e.key === SESSION_KEY) {
      const cur = getAccess(true);
      enforceSyncSuspension(cur.reason === "suspended");
      if (canWrite(cur)) { hideGate(); hideBanner(); }
      else showGate(cur);
    }
  });

  return a;
}