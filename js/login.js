// ============================================================
// login.js — Sign-in logic (email/password + Google OAuth)
// ============================================================
import { APP_BASE } from './config.js';
import { computeAccess, READONLY, showGate } from './access.js';
import { isNativeApp, startNativeGoogleOAuth, armNativeOAuthReturn } from './native-oauth.js';
import { codesDb } from './db.js';
import { license } from './license.js';
import { showToast, openModal } from './ui.js';
import { appConfig } from './config.js';

const $    = (sel, root = document) => root.querySelector(sel);
const msg  = $('#loginMsg');
const btn  = $('#loginBtn');
const form = $('#loginForm');
const googleBtn = $('#googleBtn');
const forgotLink = $('#forgotLink');
const resendBtn = $('#resendConfirmBtn');
let loading = false;

// Get return URL from query params (for redirect after login).
// ?return= is user-controlled and this value ends up in `location.href = returnUrl`
// (email/password path) and in the OAuth redirectTo, so `?return=https://evil.com`
// or `?return=//evil.com` used to bounce a freshly logged-in user off-site.
// Allowlist the app's own pages; anything else becomes app.html.
const RETURN_ALLOWED = ['app.html', 'onboarding.html', 'activate.html', 'index.html'];
const urlParams = new URLSearchParams(window.location.search);
const wantReturn = urlParams.get('return');
const returnUrl = RETURN_ALLOWED.includes(wantReturn) ? wantReturn : 'app.html';
const loginReason = urlParams.get('reason') || '';

// Check if this is first login (no trial used yet)
function isFirstLogin() {
  return !localStorage.getItem('dp_welcome_shown') && !localStorage.getItem('dp_trial_used');
}

// Auto-activate 30-day trial for first-time users (no modal, automatic)
async function autoActivateTrial(userEmail) {
  const shown = localStorage.getItem('dp_welcome_shown');
  if (shown) return false; // Already shown
  // This device already has a licence (paid code, account-linked code or the
  // server-minted trial from linkCloudIdentity). license.save() replaces the
  // WHOLE record, so the local fallback below used to detach the device from
  // its real cloud gym on a fresh device's first login — sync then pushed to
  // a placeholder code, failed, and looked like "my data disappeared".
  if (license.get()?.code) return false;
  
  localStorage.setItem('dp_welcome_shown', '1');
  
  // Create trial via codesDb
  try {
    const res = await codesDb.activate('TRIAL-' + Date.now().toString(36).toUpperCase().slice(-6), {
      deviceId: localStorage.getItem('dp_device_id') || '',
      deviceName: navigator.userAgent.slice(0, 40)
    });
    if (res.ok) {
      license.save(res.record);
      localStorage.setItem('dp_trial_used', '1');
      localStorage.setItem('dp_cloud', '1');
      showToast('🎁 تم تفعيل 30 يوم مجاناً كهدية ترحيبية! / 30-day welcome trial activated!');
    } else {
      // Fallback: create local trial
      const trialCode = 'TRI-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      license.save({ code: trialCode, tier: 'trial', days: 30 });
      localStorage.setItem('dp_trial_used', '1');
      showToast('🎁 تم تفعيل 30 يوم مجاناً كهدية ترحيبية! / 30-day welcome trial activated!');
    }
  } catch (e) {
    // Fallback: create local trial
    const trialCode = 'TRI-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    license.save({ code: trialCode, tier: 'trial', days: 30 });
    localStorage.setItem('dp_trial_used', '1');
    showToast('🎁 تم تفعيل 30 يوم مجاناً كهدية ترحيبية! / 30-day welcome trial activated!');
  }
  return true;
}

/* Resend the signup confirmation email when login reports an unconfirmed
   inbox. Throttled 30s so it can't be used as a mail spammer. */
if (resendBtn) {
  resendBtn.addEventListener('click', async () => {
    const email = $('#email').value.trim();
    if (!email.includes('@')) { setMsg('Enter your email first / أدخل بريدك أولاً'); return; }
    resendBtn.disabled = true;
    setMsg('');
    try {
      const { supabase: sb } = await import('./supabase-client.js');
      const { error } = sb ? await sb.auth.resend({ type: 'signup', email }) : { error: new Error('offline') };
      setMsg(error
        ? 'Could not resend — try again in a minute / تعذر الإرسال — جرّب بعد دقيقة'
        : '✉️ تم إرسال إيميل التأكيد — افتح بريدك وتحقق من السبام / Confirmation email sent', error ? '#ff3366' : '#CCFF00');
    } catch { setMsg('No connection / لا اتصال'); }
    setTimeout(() => { resendBtn.disabled = false; }, 30000);
  });
}

/* -------- helpers -------- */
function setMsg(text, color = '#ff3366') {
  msg.textContent = text;
  msg.style.color = color;
}

async function setLoading(on) {
  loading = on;
  btn.disabled = on;
  if (on) {
    btn.innerHTML = `<div class="flex items-center gap-2">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg> Processing...</div>`;
  } else {
    btn.innerHTML = `
      <div class="flex flex-col items-center">
        <span>SIGN IN</span>
        <span class="text-xs opacity-80" dir="rtl">تسجيل الدخول</span>
      </div>
      <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;
  }
}

/* -------- DEMO mode helpers -------- */
async function demoSignIn(email, password) {
  const db = await import('./db.js');
  const { validatePassword } = await import('./validate.js');
  if (!validatePassword(password)) return { ok: false, error: 'Invalid email or password' };
  const users = db.demoUsersAll ? db.demoUsersAll() : [];
  let user = null;
  if (db.findDemoUser) user = db.findDemoUser(email);
  if (!user) {
    const allCodes = db.demoAll ? db.demoAll() : [];
    const codeMatch = allCodes.find(c => c.code === email && c.used);
    if (codeMatch) user = { id: codeMatch.code, email: codeMatch.code, name: codeMatch.usedDeviceName || codeMatch.owner || codeMatch.code, status: 'active', subscription: codeMatch.tier === 'lifetime' ? 'active' : (codeMatch.tier || 'trial'), subStart: codeMatch.createdAt || Date.now(), subEnd: (codeMatch.createdAt || Date.now()) + (codeMatch.days || 30) * 86400000, subTier: codeMatch.tier || 'trial' };
  }
  if (!user) return { ok: false, error: 'No account found with this email or code' };
  const demoUsers = db.demoUsersAll();
  const du = demoUsers.find(u => u.id === user.id);
  if (du && du.passHash === 'demo' && du.plainPassword !== password) return { ok: false, error: 'Invalid email or password' };
  const updated = users.map(u => u.id === user.id ? { ...u, lastLogin: Date.now() } : u);
  if (db.demoUsersSave) db.demoUsersSave(updated);
  return { ok: true, user };
}

/* -------- Check if user already has an active session -------- */
// 30 days, matching the licence/subscription horizon — the previous 24h window
// made paying users re-login daily for no reason. The app itself re-verifies
// access via access.js, so a stale-but-valid session is harmless.
const SESSION_AUTOLOGIN_MS = 30 * 24 * 60 * 60 * 1000;
function checkExistingSession() {
  const currentUser = JSON.parse(localStorage.getItem('dp_current_user'));
  if (currentUser && currentUser.loginAt && (Date.now() - currentUser.loginAt < SESSION_AUTOLOGIN_MS)) {
    const subCheck = checkSubscription(currentUser);
    if (subCheck.ok) { window.location.href = 'app.html'; return true; }
    // Session exists but subscription expired — show clear message instead of silent fail
    if (subCheck.access && subCheck.access.state === READONLY) {
      // Don't auto-redirect, let user see the login form with a clear message
      setMsg(subCheck.message || 'Free trial ended — enter activation code / انتهت الفترة المجانية — أدخل كود التفعيل', '#ff3366');
    }
  }
  return false;
}

/* Single source of truth for "may this account use the app".
   Delegates to access.js so the login page, the app and the store
   can never disagree about whether a trial has lapsed. */
function checkSubscription(user) {
  if (!user) return { ok: false, reason: 'no_user' };
  if (user.email === 'admin@gym.local' || user.email === 'ibrheamshady@gmail.com') return { ok: true, reason: 'admin' };
  if (user.subscription === 'none' || !user.subscription) {
    return { ok: false, reason: 'no_subscription', message: 'Your subscription has expired.' };
  }
  const a = computeAccess({ user });
  if (a.state === 'full') return { ok: true, reason: a.reason, daysLeft: a.daysLeft };
  return {
    ok: false,
    reason: a.reason,
    access: a,
    message: a.reason === 'trial_expired'
      ? 'Free trial ended / انتهت الفترة المجانية'
      : 'Subscription expired / انتهى الاشتراك',
  };
}

/* A lapsed trial used to leave the user staring at a red line on the
   form with nowhere to go. Open the gate instead: it explains what is
   still available and gives them the activation-code button. */
function deny(result) {
  if (result.access && result.access.state === READONLY) {
    showGate(result.access);
    return;
  }
  setMsg(result.message || 'Access denied');
}

function storeUserSession(user) {
  localStorage.setItem('dp_current_user', JSON.stringify({ id: user.id, email: user.email, name: user.name, status: user.status, subscription: user.subscription, subStart: user.subStart, subEnd: user.subEnd, subTier: user.subTier, loginAt: Date.now() }));
}

function mapSupabaseAuthError(err) {
  const code = (err?.code || err?.message || '').toLowerCase();
  if (code.includes('invalid_credentials') || code.includes('invalid login credentials') || code.includes('invalid_login_credentials') || code.includes('wrong password')) {
    return 'Invalid email or password / كلمة السر أو البريد غير صحيح';
  }
  if (code.includes('email not confirmed') || code.includes('email_not_confirmed')) {
    return 'Email not confirmed — check your inbox / البريد غير مؤكد — راجع بريدك';
  }
  if (code.includes('over_request_rate_limit') || code.includes('rate limit')) {
    return 'Too many attempts — try again later / محاولات كثيرة — حاول لاحقاً';
  }
  return `Login failed — ${err?.message || 'unknown error'}`;
}

/* -------- Email / Password login -------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;
  const email    = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !password) { setMsg('All fields are required / جميع الحقول مطلوبة'); return; }
  const { validatePassword } = await import('./validate.js');
  if (!validatePassword(password)) { setMsg('Weak password / كلمة سر ضعيفة (8+ chars, 1 letter + 1 digit)'); setLoading(false); return; }

  /* ---- Licence code + password ----
     Trial/activation accounts are identified by their code and live behind
     /api/auth/login — they have no email. Accepting the code here too means a
     trial user who "created an account" can actually sign back in from the
     login page instead of hearing "not found". */
  if (!email.includes('@')) {
    const code = email.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { setMsg('Enter an email or a 6-character code / أدخل بريدك أو كود التفعيل (6 خانات)'); return; }
    setLoading(true); setMsg('');
    try {
      const { codesDb } = await import('./db.js');
      const res = await codesDb.verifyClientLogin(code, password);
      if (res.ok) {
        const { license } = await import('./license.js');
        license.save(res.record);
        localStorage.setItem('dp_license_mode', codesDb.mode());
        const L = license.get();
        localStorage.setItem('dp_cloud', (codesDb.mode() === 'online' && L && L.data_enabled !== false) ? '1' : '0');
        setMsg('👋 Welcome back! / أهلاً بعودتك', '#CCFF00');
        setTimeout(() => { window.location.href = 'app.html'; }, 600);
        return;
      }
      const errors = {
        NOT_FOUND: 'Code not found / الكود غير موجود',
        NOT_ACTIVATED: 'This code was never activated / الكود لم يُفعّل بعد',
        NO_PASSWORD: 'No password set for this code / لا توجد كلمة سر لهذا الكود',
        WRONG_PASSWORD: 'Wrong code or password / الكود أو كلمة السر خاطئة',
        RATE_LIMITED: `Too many attempts — wait ${Math.ceil((res.secs || 60) / 60)} min / محاولات كثيرة`,
        NETWORK: 'No connection — check your internet / لا يوجد اتصال — افحص الشبكة',
      };
      setMsg(errors[res.error] || `Login failed (${res.error}) / فشل الدخول`);
    } catch (e) {
      console.error('[login] code login error:', e);
      setMsg('No connection / لا اتصال');
    }
    setLoading(false);
    return;
  }

  // Wrap entire login flow in try-catch to prevent stuck spinner
  try {
    await doEmailPasswordLogin(email, password, returnUrl);
  } catch (e) {
    console.error('[login] Unexpected error:', e);
    setMsg('Login error — please try again / خطأ في تسجيل الدخول — حاول مرة ثانية');
    setLoading(false);
  }
});

/* -------- Core email/password login logic (extracted for error handling) -------- */
async function doEmailPasswordLogin(email, password, returnUrl) {
  setLoading(true); setMsg('');
  if (resendBtn) resendBtn.classList.add('hidden');
  // Try Supabase first (lazy-loaded)
  let supabase = null;
  try { const { supabase: sb } = await import('./supabase-client.js'); supabase = sb; } catch { /* offline */ }
  if (supabase) {
    let credError = false;
    try {
      // Hard timeout: after a sign-out, supabase-js's Web Locks can deadlock the
      // next signInWithPassword on slow devices — the user then stares at
      // "signing you in" forever. A racing timeout surfaces a real message instead.
      const TIMEOUT_MS = 15000;
      const deadline = new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("Request timed out — check your internet / انتهت المهلة — افحص الشبكة"), { code: "over_request_timeout" })), TIMEOUT_MS));
      const { error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        deadline,
      ]);
      if (error) {
        // Real auth failure (wrong password, unconfirmed email, …) — surface it,
        // do NOT silently fall back to a demo account.
        credError = true;
        throw error;
      }
      const { data: { user: supUser } } = await Promise.race([supabase.auth.getUser(), deadline]);
      if (!supUser) { credError = true; throw new Error('No user'); }
      const sub = supUser.user_metadata?.subscription || 'trial';
      // Never invent a fresh 30 days when metadata lacks subEnd — that let any
      // email account without subscription data renew its trial on every login.
      // No expiry on record = not currently covered; the gate explains how to
      // activate, and a later login with valid metadata restores full access.
      const subEnd = supUser.user_metadata?.subEnd ? new Date(supUser.user_metadata.subEnd).getTime() : 0;
      const result = { ok: true, user: { id: supUser.id, email: supUser.email, name: supUser.user_metadata?.name || supUser.email.split('@')[0], status: 'active', subscription: sub, subStart: supUser.user_metadata?.subStart || Date.now(), subEnd: subEnd, subTier: supUser.user_metadata?.subTier || 'trial' } };
      // Adopt the server code bound to this account so this device syncs the
      // same gym data as every other device (was: email logins never synced).
      try { const { linkCloudIdentity } = await import('./cloud-link.js'); await linkCloudIdentity(supabase); } catch {}
      storeUserSession(result.user); localStorage.setItem('dp_user_email', result.user.email); localStorage.setItem('dp_user_id', result.user.id);
      try {
        if (isFirstLogin()) {
          await autoActivateTrial(result.user.email);
        }
      } catch (e) {
        console.warn('[login] autoActivateTrial failed:', e);
      }
      window.location.href = returnUrl;
      return;
    } catch (err) {
      if (err?.code === "over_request_timeout") {
        // Sign-in hung (Web Locks after sign-out, or dead network). Never leave
        // the spinner running.
        setMsg(err.message);
        setLoading(false);
        return;
      }
      if (credError) {
        console.warn('[login] Supabase rejected credentials:', err?.message || err);
        setMsg(mapSupabaseAuthError(err));
        // Unconfirmed email = the #1 "my account is stuck" case. Offer a way out.
        const rc = (err?.code || err?.message || '').toLowerCase();
        if (resendBtn) {
          const isUnconfirmed = rc.includes('email not confirmed') || rc.includes('email_not_confirmed');
          resendBtn.classList.toggle('hidden', !isUnconfirmed);
        }
        setLoading(false);
        return;
      }
      // Network/transient error — but NEVER fall through to a demo account when
      // a real identity already lives on this device: demoSignIn writes a
      // different dp_current_user id, which hides the real data behind another
      // namespace ("I logged in again and everything is gone").
      const hasRealIdentity = localStorage.getItem('dp_current_user') || localStorage.getItem('dp_license')
        || Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (hasRealIdentity) {
        setMsg('لا يوجد اتصال بالإنترنت — أعد المحاولة / No internet connection — please try again');
        setLoading(false);
        return;
      }
      console.warn('[login] Supabase unavailable, using demo fallback:', err?.message || err);
    }
  }
  // Demo fallback
  let result;
  try {
    result = await demoSignIn(email, password);
  } catch (e) {
    console.error('[login] demoSignIn threw:', e);
    setMsg('Login error — please try again / خطأ في تسجيل الدخول — حاول مرة ثانية');
    setLoading(false);
    return;
  }
  if (!result.ok) { setMsg(result.error || 'Login failed'); setLoading(false); return; }
  storeUserSession(result.user); localStorage.setItem('dp_user_email', result.user.email); localStorage.setItem('dp_user_id', result.user.id);
  try {
    if (isFirstLogin()) {
      await autoActivateTrial(result.user.email);
    }
  } catch (e) {
    console.warn('[login] autoActivateTrial failed:', e);
  }
  window.location.href = returnUrl;
}

/* -------- Forgot password -------- */
forgotLink.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  if (!email) {
    setMsg('Enter your email first / أدخل بريدك أولاً');
    return;
  }
  try {
    let supabase = null;
    try { const { supabase: sb } = await import('./supabase-client.js'); supabase = sb; } catch { /* offline */ }
    if (!supabase) throw new Error('offline');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${APP_BASE}reset-password.html` });
    if (error) throw error;
    // Confirm AFTER the request actually went out, naming the user's own
    // email so they know which inbox to check. The old line claimed "sent"
    // before the request even left — a false success when offline.
    setMsg(`✅ تم إرسال إيميل إلى بريدك (${email}) — تحقق من بريدك / Check your inbox`, '#CCFF00');
  } catch (err) {
    console.error(err);
    setMsg('Could not send reset email — try again later / تعذر إرسال إيميل الاستعادة');
  }
});

/* -------- Google OAuth -------- */
// The Google button used to give zero feedback: setLoading() only repaints
// the main SIGN IN button, so for several seconds of OAuth setup the user
// saw a dead button, tapped again, and concluded the page hung. Give the
// Google button its own spinner and a self-clearing "still here?" note.
const GOOGLE_IDLE_HTML = googleBtn ? googleBtn.innerHTML : "";
let googleWatchdog = null;
function setGoogleLoading(on) {
  if (!googleBtn) return;
  googleBtn.disabled = on;
  googleBtn.classList.toggle("loading", on);
  googleBtn.innerHTML = on
    ? `<div class="flex items-center gap-2">
        <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg> Opening Google… / جاري فتح جوجل…</div>`
    : GOOGLE_IDLE_HTML;
}

googleBtn.addEventListener('click', async () => {
  if (loading) return;
  loading = true;
  setGoogleLoading(true);
  setMsg('');
  clearTimeout(googleWatchdog);
  googleWatchdog = setTimeout(() => {
    // Reaching this means the OAuth redirect never happened.
    setGoogleLoading(false);
    loading = false;
    setMsg('Taking too long — tap again or check your connection / لسه هنا؟ جرّب مرة ثانية أو افحص الشبكة');
  }, 10000);
  let supabase = null;
  try { const { supabase: sb } = await import('./supabase-client.js'); supabase = sb; } catch { /* offline */ }
  if (!supabase) { clearTimeout(googleWatchdog); setMsg('No connection / لا اتصال'); setGoogleLoading(false); loading = false; return; }

  // Native APK: Google refuses OAuth inside embedded WebViews (403
  // disallowed_useragent), so the in-page redirect flow can never finish.
  // Open the system browser instead; the deep link (com.digitalpulse.gym://)
  // brings the auth code back and the session completes asynchronously, so
  // swap the short watchdog for a patient one that just resets this button
  // if the user closes the browser without finishing.
  if (isNativeApp()) {
    clearTimeout(googleWatchdog);
    const nativeErr = await startNativeGoogleOAuth(returnUrl);
    if (nativeErr) {
      setMsg(nativeErr);
      setGoogleLoading(false);
      loading = false;
      return;
    }
    setMsg('أكمل تسجيل الدخول في المتصفح ثم عُد للتطبيق / Finish in your browser, then come back', '#CCFF00');
    googleWatchdog = setTimeout(() => { setGoogleLoading(false); loading = false; }, 60000);
    return;
  }

  // Web flow: redirect to Google OAuth
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { prompt: 'select_account', redirectTo: `${APP_BASE}auth/callback.html?return=${encodeURIComponent(returnUrl)}` },
  });
  if (error) {
    clearTimeout(googleWatchdog);
    console.error('Google OAuth error:', error);
    setMsg('Could not start Google login — try again');
    setGoogleLoading(false);
    loading = false;
    return;
  }
  // success path navigates away; the page (and timers) die with it.
  // If we reach here without redirect, something went wrong — watchdog will handle it.
});

/* -------- Auto-redirect if session exists -------- */
if (checkExistingSession()) { /* auto-redirecting to app.html */ }

// Native APK: arm the deep-link return path for Google OAuth (system
// browser → com.digitalpulse.gym://auth/callback.html → auth/callback.html).
armNativeOAuthReturn();

/* -------- Safety net: force-unfreeze loading after 30s (last resort) -------- */
setTimeout(() => {
  if (loading) {
    console.warn('[login] Safety net triggered: loading was stuck for 30s, forcing reset');
    loading = false;
    setLoading(false);
    setMsg('Something went wrong — please refresh and try again / حدث خطأ — يرجى تحديث الصفحة والمحاولة مرة ثانية');
  }
}, 30000);

/* -------- Global error handler (prevents silent failures) -------- */
window.addEventListener('error', (e) => {
  console.error('[login] Uncaught error:', e.error || e.message);
  if (loading) {
    loading = false;
    setLoading(false);
    setMsg('An error occurred — please refresh and try again / حدث خطأ — يرجى تحديث الصفحة والمحاولة مرة ثانية');
  }
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[login] Unhandled rejection:', e.reason);
  if (loading) {
    loading = false;
    setLoading(false);
    setMsg('An error occurred — please refresh and try again / حدث خطأ — يرجى تحديث الصفحة والمحاولة مرة ثانية');
  }
});
