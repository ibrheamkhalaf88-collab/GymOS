// ============================================================
// signup.js — Sign-up logic with 2-week free trial
// ============================================================
import { supabase } from './supabase-client.js';
import { validatePassword } from './validate.js';

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
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="None"/>
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

  setLoading(true);
  setMsg('');
  

  // Try Supabase first
  let result;
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

    if (error) throw error;

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
  localStorage.setItem('dp_current_user', JSON.stringify(result.user));
  localStorage.setItem('dp_user_email', result.user.email);

  // Auto-login after signup
  setMsg('✓ Account created — 30 days free / أنشأت حسابك — لديك 30 يوم مجاني ثم يفعّل الأدمن', '#CCFF00');
  setLoading(false);

  setTimeout(() => {
    window.location.href = 'app.html';
  }, 1500);
});

/* -------- Google OAuth (signup = sign-in or create new) -------- */
googleBtn.addEventListener('click', async () => {
  if (loading) return;
  if (!supabase) { setMsg('No connection / لا اتصال'); return; }
  const origin = window.location.origin;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      prompt: 'select_account',
      redirectTo: `${origin}/auth/callback?intent=signup`,
    },
  });
  if (error) {
    console.error('Google OAuth error:', error);
    setMsg('Could not start Google signup — try again');
  }
});
