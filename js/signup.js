// ============================================================
// signup.js — Sign-up logic with 30-day free trial
// ============================================================
import { supabase } from './supabase-client.js';

import { APP_BASE, appConfig } from './config.js';
import { isNativeApp, startNativeGoogleOAuth, armNativeOAuthReturn } from './native-oauth.js';
import { writeSession } from './session.js';

const $    = (sel, root = document) => root.querySelector(sel);
const msg  = $('#signupMsg');
const btn  = $('#sendCodeBtn');
const form = $('#signupForm');
const googleBtn = $('#googleBtn');
let loading = false;

// Get return URL from query params (for redirect after signup).
// Same allowlist as login.js / auth/callback.html: ?return=//evil.com would
// otherwise ride along into the OAuth redirectTo and the native deep link.
const RETURN_ALLOWED = ['app.html', 'onboarding.html', 'activate.html', 'index.html'];
const urlParams = new URLSearchParams(window.location.search);
const wantReturn = urlParams.get('return');
const returnUrl = RETURN_ALLOWED.includes(wantReturn) ? wantReturn : 'app.html';

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
      </svg> Sending code...</div>`;
  } else {
    btn.innerHTML = `
      <div class="flex flex-col items-center">
        <span>SEND VERIFICATION CODE</span>
        <span class="text-xs opacity-80" dir="rtl">إرسال رمز التحقق</span>
      </div>
      <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>`;
  }
}

/* -------- OTP helpers -------- */
let pendingEmail = '';


function showStep(step) {
  document.getElementById('stepEmail').classList.toggle('hidden', step !== 'email');
  document.getElementById('stepOtp').classList.toggle('hidden', step !== 'otp');
}

function getOtpCode() {
  return Array.from(document.querySelectorAll('.otp-box')).map((b) => b.value).join('');
}

function clearOtpBoxes() {
  document.querySelectorAll('.otp-box').forEach((b) => { b.value = ''; });
}

// Auto-advance between OTP boxes
document.querySelectorAll('.otp-box').forEach((box, idx, boxes) => {
  box.addEventListener('input', (e) => {
    const v = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = v.slice(0, 1);
    if (v && idx < boxes.length - 1) boxes[idx + 1].focus();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !box.value && idx > 0) boxes[idx - 1].focus();
  });
  box.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    text.split('').forEach((ch, i) => { if (boxes[i]) boxes[i].value = ch; });
    if (text.length === 6) boxes[5].focus();
  });
});

/* -------- Step 1: Send OTP -------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;

  const email = $('#email').value.trim().toLowerCase();
  const name  = $('#name').value.trim() || email.split('@')[0];

  if (!email || !email.includes('@')) {
    setMsg('Invalid email / البريد غير صحيح');
    return;
  }

  setLoading(true);
  setMsg('');

  if (!supabase) {
    setMsg('No connection / لا اتصال');
    setLoading(false);
    return;
  }

  try {
    const res = await fetch(`${appConfig.apiUrl}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to send code');

    pendingEmail = email;
    $('#otpEmail').textContent = email;
    showStep('otp');
    clearOtpBoxes();
    document.querySelectorAll('.otp-box')[0].focus();
    setMsg('✓ Code sent — check your email / تم إرسال الرمز — افحص بريدك', '#CCFF00');
  } catch (err) {
    setMsg(`Signup failed — ${err?.message || 'unknown error'}`);
  } finally {
    setLoading(false);
  }
});

/* -------- Step 2: Verify OTP -------- */
document.getElementById('verifyOtpBtn').addEventListener('click', async () => {
  if (loading) return;
  const code = getOtpCode();
  if (code.length !== 6) {
    setMsg('Enter the full 6-digit code / أدخل الرمز كاملاً (6 أرقام)');
    return;
  }

  setLoading(true);
  setMsg('');

  try {
    const res = await fetch(`${appConfig.apiUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, code, deviceId: localStorage.getItem('dp_device_id') || '' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Verification failed');

    const { setJwt } = await import('./db.js');
    setJwt(data.token);

    writeSession(data.user);

    const { license } = await import('./license.js');
    license.save(data.record);

    localStorage.setItem('dp_license_mode', 'online');
    localStorage.setItem('dp_cloud', '1');
    // dp_current_user is written ONLY via writeSession() (INV5). Already called above.

    setMsg('✓ Verified — welcome! / تم التحقق — أهلاً بك', '#CCFF00');
    setTimeout(() => { window.location.href = 'app.html'; }, 1200);
  } catch (err) {
    setMsg(`Invalid code — ${err?.message || 'try again'} / رمز خاطئ — حاول مرة ثانية`);
    clearOtpBoxes();
    document.querySelectorAll('.otp-box')[0].focus();
  } finally {
    setLoading(false);
  }
});

/* -------- Resend + Back -------- */
document.getElementById('resendOtpBtn').addEventListener('click', async () => {
  if (loading) return;
  setLoading(true);
  setMsg('');
  try {
    const res = await fetch(`${appConfig.apiUrl}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to resend');
    setMsg('✓ Code resent / تم إعادة إرسال الرمز', '#CCFF00');
  } catch (err) {
    setMsg(`Resend failed — ${err?.message || 'try later'} / فشل الإرسال — حاول لاحقاً`);
  } finally {
    setLoading(false);
  }
});

document.getElementById('backToEmailBtn').addEventListener('click', () => {
  showStep('email');
  clearOtpBoxes();
  setMsg('');
});

/* -------- Email confirmation disabled (mailer_autoconfirm=true) --------
   The "check your email" screen is no longer needed: signup creates an active
   session immediately. Block removed from signup.html; kept this comment as a
   marker in case confirmation is re-enabled later. */

/* -------- Google OAuth (signup = sign-in or create new) -------- */
// Same dead-button problem as login.js: give the Google button its own
// spinner + watchdog instead of touching the main submit button's state.
const GOOGLE_IDLE_HTML = googleBtn ? googleBtn.innerHTML : "";
let googleWatchdog = null;
function setGoogleLoading(on) {
  if (!googleBtn) return;
  googleBtn.disabled = on;
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
  clearTimeout(googleWatchdog);
  googleWatchdog = setTimeout(() => {
    setGoogleLoading(false);
    loading = false;
    setMsg('Taking too long — tap again or check your connection / لسه هنا؟ جرّب مرة ثانية أو افحص الشبكة');
  }, 10000);
  if (!supabase) { clearTimeout(googleWatchdog); setMsg('No connection / لا اتصال'); setGoogleLoading(false); loading = false; return; }

  // Native APK: Google refuses OAuth inside embedded WebViews (403
  // disallowed_useragent). Open the system browser instead; the deep link
  // (com.digitalpulse.gym://) completes the session asynchronously, so swap
  // the short watchdog for a patient one that resets this button if the
  // user closes the browser without finishing. See js/native-oauth.js.
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

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      prompt: 'select_account',
      redirectTo: `${APP_BASE}auth/callback.html?return=${encodeURIComponent(returnUrl)}`,
    },
  });
  if (error) {
    clearTimeout(googleWatchdog);
    console.error('Google OAuth error:', error);
    setMsg('Could not start Google signup — try again');
    setGoogleLoading(false);
    loading = false;
  }
});

// Native APK: arm the deep-link return path for Google OAuth.
armNativeOAuthReturn();
