// ============================================================
// signup.js — Sign-up logic with 30-day free trial
// ============================================================
import { supabase } from './supabase-client.js';
import { validatePassword } from './validate.js';
import { APP_BASE } from './config.js';

const $    = (sel, root = document) => root.querySelector(sel);
const msg  = $('#signupMsg');
const btn  = $('#signupBtn');
const form = $('#signupForm');
const googleBtn = $('#googleBtn');
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
      </svg> Creating account...</div>`;
  } else {
    btn.innerHTML = `
      <div class="flex flex-col items-center">
        <span>Create Account</span>
        <span class="text-xs opacity-80" dir="rtl">إنشاء حساب جديد</span>
      </div>
      <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;
  }
}

// Demo mode: create user locally (when Supabase not connected)
async function demoSignUp(email, password, name) {
  const { demoUsersAll, demoUsersSave, findDemoUser } = await import('./db.js');

  // Check if email already exists
  const existing = findDemoUser(email);
  if (existing) {
    return { ok: false, error: 'Account already exists with this email / حساب موجود مسبقاً' };
  }

  // Validate password: must be 8+ chars with at least 1 letter + 1 digit
  if (!validatePassword(password)) {
    return { ok: false, error: 'Password must be 8+ chars with 1 letter + 1 digit / يجب أن تكون كلمة المرور 8 حروف على الأقل وتحتوي على رقم' };
  }

  const now = Date.now();
  const expiry = now + 30 * 86400000; // 30-day free trial (admin approves after)

  const newUser = {
    id: 'U' + Date.now().toString(36).toUpperCase(),
    email: email.toLowerCase(),
    name: name || email.split('@')[0],
    passHash: 'demo',
    plainPassword: password,
    status: 'active',
    subscription: 'trial',
    subStart: now,
    subEnd: expiry,
    subTier: 'free_trial',
    createdAt: now,
    lastLogin: null,
  };

  const list = demoUsersAll();
  list.push(newUser);
  demoUsersSave(list);

  return { ok: true, user: newUser };
}

function mapSignupError(err) {
  const msg = (err?.message || 'unknown error').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return 'An account already exists with this email — try signing in / حساب موجود مسبقاً بهذا البريد — سجّل الدخول';
  }
  if (msg.includes('over_email_send_rate_limit') || msg.includes('rate limit')) {
    return 'Too many signups — try again later / تسجيلات كثيرة — حاول لاحقاً';
  }
  if (msg.includes('weak password') || msg.includes('password should be')) {
    return 'Password too weak — use 8+ chars with 1 letter + 1 digit / كلمة السر ضعيفة';
  }
  return `Signup failed — ${err?.message || 'unknown error'}`;
}

/* -------- Form submit -------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;

  const email    = $('#email').value.trim().toLowerCase();
  const password = $('#password').value;
  const name     = $('#name').value.trim() || email.split('@')[0];

  // Validation
  if (!email || !password) {
    setMsg('Email and password are required / البريد وكلمة السر مطلوبة');
    return;
  }
  if (!email.includes('@')) {
    setMsg('Invalid email / البريد غير صحيح');
    return;
  }
  if (!validatePassword(password)) {
    setMsg('Password must be 8+ chars with 1 letter + 1 digit / يجب أن تكون كلمة المرور 8 حروف على الأقل وتحتوي على رقم');
    return;
  }
  if (password !== $('#confirm').value) {
    setMsg('Passwords do not match / كلمتا المرور غير متطابقتين');
    return;
  }

  setLoading(true);
  setMsg('');

  // Try Supabase first
  let result;
  if (supabase) {
    let realError = null;
    try {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
            subscription: 'trial',
            subStart: Date.now(),
            subEnd: Date.now() + 30 * 86400000,
            subTier: 'free_trial',
          },
        },
      });

      if (error) { realError = error; throw error; }

      if (data.user) {
        result = {
          ok: true,
          user: {
            id: data.user.id,
            email: data.user.email,
            name: name,
            status: 'active',
            subscription: 'trial',
            subStart: Date.now(),
            subEnd: Date.now() + 30 * 86400000,
            subTier: 'free_trial',
          }
        };
      } else {
        throw new Error('No user returned');
      }
    } catch (err) {
      if (realError) {
        // Real Supabase error (already-registered email, weak remote password, …) —
        // surface it instead of silently creating a local demo account.
        setMsg(mapSignupError(realError));
        setLoading(false);
        return;
      }
      console.warn('[signup] Supabase failed, falling back to demo:', err?.message || err);
    }
  }

  if (!result) {
    result = await demoSignUp(email, password, name);
    if (!result.ok) {
      setMsg(result.error || 'Signup failed');
      setLoading(false);
      return;
    }
  }

  // Success
  // Signup OK — 30-day free trial, then admin approves

  // Store user for immediate login
  localStorage.setItem('dp_current_user', JSON.stringify({ ...result.user, loginAt: Date.now() }));
  localStorage.setItem('dp_user_email', result.user.email);

  // Auto-login after signup
  setMsg('✓ Account created — 30 days free / أنشأت حسابك — لديك 30 يوم مجاني ثم يفعّل الأدمن', '#CCFF00');
  setLoading(false);

  setTimeout(() => {
    window.location.href = 'app.html';
  }, 1500);
});

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
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      prompt: 'select_account',
      redirectTo: `${APP_BASE}auth/callback.html`,
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
