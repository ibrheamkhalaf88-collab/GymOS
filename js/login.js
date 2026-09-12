// ============================================================
// login.js — Sign-in logic (email/password + Google OAuth)
// ============================================================
import { supabase } from './supabase-client.js';

const $    = (sel, root = document) => root.querySelector(sel);
const msg  = $('#loginMsg');
const btn  = $('#loginBtn');
const form = $('#loginForm');
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

/* -------- Email / Password login -------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;

  const email    = $('#email').value.trim();
  const password = $('#password').value;

  if (!email || !password) {
    setMsg('All fields are required / جميع الحقول مطلوبة');
    return;
  }

  setLoading(true);
  setMsg('');

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes('invalid login credentials') ||
        error.message.toLowerCase().includes('invalid password')) {
      setMsg('Invalid email or password / البريد أو كلمة السر غير صحيحة');
    } else if (error.message.toLowerCase().includes('user does not exist')) {
      setMsg('No account found with this email / لا يوجد حساب بهذا البريد');
    } else {
      setMsg(`Login failed — ${error.message}`);
    }
    setLoading(false);
    return;
  }

  // ✅ logged in
  localStorage.setItem('dp_user_email', email);
  window.location.href = 'app.html';
});

/* -------- Forgot password -------- */
$('#forgotLink').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  if (!email) {
    setMsg('Enter your email first / أدخل بريدك أولاً');
    return;
  }
  setMsg('Reset link sent — check your inbox / تم إرسال رابط إعادة الضبط');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password.html`,
    });
    if (error) throw error;
  } catch (err) {
    console.error(err);
    setMsg('Could not send reset email — try again later');
  }
});

/* -------- Google OAuth -------- */
googleBtn.addEventListener('click', async () => {
  if (loading) return;
  setLoading(true);
  setMsg('');

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      prompt: 'select_account',
      // 🔴 REPLACE with your real Supabase project URL before deploying
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    console.error('Google OAuth error:', error);
    setMsg('Could not start Google login — try again');
    setLoading(false);
    return;
  }
  // Supabase redirects to redirectTo URL — the callback handles the rest
});
