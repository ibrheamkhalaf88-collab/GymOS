// ============================================================
// signup.js — Sign-up logic (email/password)
// ============================================================
import { supabase } from './supabase-client.js';

const $    = (sel, root = document) => root.querySelector(sel);
const msg  = $('#signupMsg');
const form = $('#signupForm');
const submitBtn = form.querySelector('button[type="submit"]');
let loading = false;

function setMsg(text, color = '#ff3366') {
  msg.textContent = text;
  msg.style.color = color;
}

async function setLoading(on) {
  loading = on;
  submitBtn.disabled = on;
  if (on) {
    submitBtn.innerHTML = `<div class="flex items-center gap-2">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg> Creating account...</div>`;
  } else {
    submitBtn.innerHTML = `
      <div class="flex flex-col items-center">
        <span>CREATE ACCOUNT</span>
        <span class="text-xs opacity-80" dir="rtl">إنشاء حساب</span>
      </div>
      <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;

  const name     = $('#name').value.trim();
  const email    = $('#email').value.trim();
  const password = $('#password').value;
  const confirm  = $('#confirm').value;

  if (!email || !password || !confirm) {
    setMsg('All required fields must be filled / يجب تعبئة جميع الحقول المطلوبة');
    return;
  }

  if (password !== confirm) {
    setMsg('Passwords do not match / كلمات السر غير متطابقة');
    return;
  }

  if (password.length < 8) {
    setMsg('Password must be at least 8 characters / يجب أن تكون 8 أحرف على الأقل');
    return;
  }

  setLoading(true);
  setMsg('');

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name || null,
      },
    },
  });

  if (error) {
    console.error('Signup error:', error);
    if (error.message.toLowerCase().includes('already registered')) {
      setMsg('An account with this email already exists — try signing in / حساب بهذا البريد مسجّل بالفعل');
    } else {
      setMsg(`Signup failed — ${error.message}`);
    }
    setLoading(false);
    return;
  }

  setMsg('✓ Account created — check your email to confirm / تم إنشاء الحساب — تفّقد بريدك لتأكيد الحساب', '#CCFF00');
  setLoading(false);
});
