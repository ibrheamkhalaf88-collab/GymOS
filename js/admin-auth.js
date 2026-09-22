// ============================================================
// admin-auth.js — Admin authentication for the admin panel
// Admins log in with ADMIN_EMAIL / ADMIN_PASSWORD (same as Edge Function).
// On success, stores admin JWT in sessionStorage for admin API calls.
// ============================================================
import { appConfig } from './config.js';

const $    = (sel, root = document) => root.querySelector(sel);
const form = $('#adminLoginForm');
const emailInput = $('#adminEmail');
const passInput = $('#adminPassword');
const msg = $('#adminLoginMsg');
const loginBtn = $('#adminLoginBtn');
let loading = false;

function setMsg(text, color = '#ff3366') {
  msg.textContent = text;
  msg.style.color = color;
}

async function setLoading(on) {
  loading = on;
  loginBtn.disabled = on;
  if (on) {
    loginBtn.innerHTML = `<div class="flex items-center gap-2">
      <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg> Signing in as admin...</div>`;
  } else {
    loginBtn.innerHTML = `
      <div class="flex flex-col items-center">
        <span>Admin Sign In</span>
        <span class="text-xs opacity-80" dir="rtl">تسجيل دخول المدير</span>
      </div>
      <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;

  const email = emailInput.value.trim().toLowerCase();
  const password = passInput.value;

  if (!email || !password) {
    setMsg('Both fields are required / كلا الحقلين مطلوبان');
    return;
  }

  setLoading(true);
  setMsg('');

  // Call the admin login endpoint directly
  const url = `${appConfig.apiUrl}/api/admin/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (data.error === 'WRONG_CREDENTIALS') {
      setMsg('Invalid admin email or password / البريد أو كلمة السر غير صحيحة');
    } else if (data.error === 'RATE_LIMITED') {
      setMsg(`Too many attempts — wait ${Math.ceil((data.secs || 900) / 60)} minutes`);
    } else {
      setMsg(`Login failed — ${data.error}`);
    }
    setLoading(false);
    return;
  }

  // ✅ Admin logged in — store token
  sessionStorage.setItem('dp_admin_token', data.token);
  setMsg('✓ Admin authenticated — loading dashboard…', '#CCFF00');

  // Redirect to the admin dashboard section after short delay
  setTimeout(() => {
    window.location.href = 'admin.html';
  }, 600);
});
