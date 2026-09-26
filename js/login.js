// ============================================================
// login.js — Sign-in logic (email/password + Google OAuth)
// ============================================================
import { APP_BASE } from './config.js';
import { computeAccess, READONLY, showGate } from './access.js';

const $    = (sel, root = document) => root.querySelector(sel);
const msg  = $('#loginMsg');
const btn  = $('#loginBtn');
const form = $('#loginForm');
const googleBtn = $('#googleBtn');
const forgotLink = $('#forgotLink');
let loading = false;

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
    if (checkSubscription(currentUser).ok) { window.location.href = 'app.html'; return true; }
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
    } catch {
      setMsg('No connection / لا اتصال');
    }
    setLoading(false);
    return;
  }

  setLoading(true); setMsg('');
  // Try Supabase first (lazy-loaded)
  let supabase = null;
  try { const { supabase: sb } = await import('./supabase-client.js'); supabase = sb; } catch { /* offline */ }
  if (supabase) {
    let credError = false;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Real auth failure (wrong password, unconfirmed email, …) — surface it,
        // do NOT silently fall back to a demo account.
        credError = true;
        throw error;
      }
      const { data: { user: supUser } } = await supabase.auth.getUser();
      if (!supUser) { credError = true; throw new Error('No user'); }
      const sub = supUser.user_metadata?.subscription || 'trial';
      const subEnd = supUser.user_metadata?.subEnd ? new Date(supUser.user_metadata.subEnd).getTime() : Date.now() + 30 * 86400000;
      const result = { ok: true, user: { id: supUser.id, email: supUser.email, name: supUser.user_metadata?.name || supUser.email.split('@')[0], status: 'active', subscription: sub, subStart: supUser.user_metadata?.subStart || Date.now(), subEnd: subEnd, subTier: supUser.user_metadata?.subTier || 'trial' } };
      const subCheck = checkSubscription(result.user);
      if (!subCheck.ok) { deny(subCheck); setLoading(false); return; }
      storeUserSession(result.user); localStorage.setItem('dp_user_email', result.user.email); localStorage.setItem('dp_user_id', result.user.id); window.location.href = 'app.html'; return;
    } catch (err) {
      if (credError) {
        console.warn('[login] Supabase rejected credentials:', err?.message || err);
        setMsg(mapSupabaseAuthError(err));
        setLoading(false);
        return;
      }
      // Network/transient error only → fall through to demo
      console.warn('[login] Supabase unavailable, using demo fallback:', err?.message || err);
    }
  }
  // Demo fallback
  const result = await demoSignIn(email, password);
  if (!result.ok) { setMsg(result.error || 'Login failed'); setLoading(false); return; }
  const subCheck = checkSubscription(result.user);
  if (!subCheck.ok) { deny(subCheck); setLoading(false); return; }
  storeUserSession(result.user); localStorage.setItem('dp_user_email', result.user.email); localStorage.setItem('dp_user_id', result.user.id);
  window.location.href = 'app.html';
});

/* -------- Forgot password -------- */
forgotLink.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  if (!email) {
    setMsg('Enter your email first / أدخل بريدك أولاً');
    return;
  }
  setMsg('Reset link sent — check your inbox / تم إرسال رابط إعادة الضبط');
  try {
    let supabase = null;
    try { const { supabase: sb } = await import('./supabase-client.js'); supabase = sb; } catch { /* offline */ }
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${APP_BASE}reset-password.html` });
      if (error) throw error;
    }
  } catch (err) {
    console.error(err);
    setMsg('Could not send reset email — try again later');
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
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { prompt: 'select_account', redirectTo: `${APP_BASE}auth/callback.html` },
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
});

/* -------- Auto-redirect if session exists -------- */
if (checkExistingSession()) { /* auto-redirecting to app.html */ }
