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

/* -------- DEMO mode helpers -------- */
async function demoSignIn(email, password) {
  const db = await import('./db.js');
  if (db.demoSeedUsers) db.demoSeedUsers();
  const users = db.demoUsersAll ? db.demoUsersAll() : [];
  let user = null;
  if (db.findDemoUser) user = db.findDemoUser(email);
  if (!user) {
    const allCodes = db.demoAll ? db.demoAll() : [];
    const codeMatch = allCodes.find(c => c.code === email && c.used);
    if (codeMatch) {
      user = {
        id: codeMatch.code, email: codeMatch.code,
        name: codeMatch.usedDeviceName || codeMatch.owner || codeMatch.code,
        status: 'active',
        subscription: codeMatch.tier === 'lifetime' ? 'active' : (codeMatch.tier || 'trial'),
        subStart: codeMatch.createdAt || Date.now(),
        subEnd: (codeMatch.createdAt || Date.now()) + (codeMatch.days || 30) * 86400000,
        subTier: codeMatch.tier || 'trial',
      };
    }
  }
  if (!user) return { ok: false, error: 'No account found with this email or code' };
  if (db.validateDemoPassword && !db.validateDemoPassword(user, password)) return { ok: false, error: 'Invalid email or password' };
  const updated = users.map(u => u.id === user.id ? { ...u, lastLogin: Date.now() } : u);
  if (db.demoUsersSave) db.demoUsersSave(updated);
  return { ok: true, user };
}

/* -------- Check if user already has an active session -------- */
function checkExistingSession() {
  const currentUser = JSON.parse(localStorage.getItem('dp_current_user'));
  if (currentUser && currentUser.loginAt && (Date.now() - currentUser.loginAt < 24 * 60 * 60 * 1000)) {
    if (checkSubscription(currentUser).ok) { window.location.href = 'app.html'; return true; }
  }
  return false;
}

function checkSubscription(user) {
  if (!user) return { ok: false, reason: 'no_user' };
  if (user.email === 'admin@gym.local' || user.email === 'ibrheamshady@gmail.com') return { ok: true, reason: 'admin' };
  const now = Date.now();
  if (!user.subscription || user.subscription === 'none') return { ok: false, reason: 'no_subscription', message: 'Your subscription has expired.' };
  if (user.subscription === 'trial') { if (now > user.subEnd) return { ok: false, reason: 'trial_expired', message: 'Trial expired.' }; return { ok: true, reason: 'trial_active', daysLeft: Math.ceil((user.subEnd - now) / 86400000) }; }
  if (user.subscription === 'active') { if (now > user.subEnd) return { ok: false, reason: 'expired', message: 'Subscription expired.' }; return { ok: true, reason: 'active', daysLeft: Math.ceil((user.subEnd - now) / 86400000) }; }
  return { ok: false, reason: 'unknown' };
}

function storeUserSession(user) {
  localStorage.setItem('dp_current_user', JSON.stringify({ id: user.id, email: user.email, name: user.name, status: user.status, subscription: user.subscription, subStart: user.subStart, subEnd: user.subEnd, subTier: user.subTier, loginAt: Date.now() }));
}

/* -------- Email / Password login -------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;
  const email    = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !password) { setMsg('All fields are required / جميع الحقول مطلوبة'); return; }
  setLoading(true); setMsg('');
  // Try Supabase first
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: { user: supUser } } = await supabase.auth.getUser();
    if (!supUser) throw new Error('No user');
    const sub = supUser.user_metadata?.subscription || 'trial';
    const subEnd = supUser.user_metadata?.subEnd ? new Date(supUser.user_metadata.subEnd).getTime() : Date.now() + 14*86400000;
    const result = { ok: true, user: { id: supUser.id, email: supUser.email, name: supUser.user_metadata?.name || supUser.email.split('@')[0], status: 'active', subscription: sub, subStart: supUser.user_metadata?.subStart || Date.now(), subEnd: subEnd, subTier: supUser.user_metadata?.subTier || 'trial' } };
    const subCheck = checkSubscription(result.user);
    if (!subCheck.ok) { setMsg(subCheck.message || 'Access denied'); setLoading(false); return; }
    storeUserSession(result.user); localStorage.setItem('dp_user_email', result.user.email); window.location.href = 'app.html'; return;
  } catch (err) { console.log('Supabase failed, trying demo:', err.message); }
  // Demo fallback
  const result = await demoSignIn(email, password);
  if (!result.ok) { setMsg(result.error || 'Login failed'); setLoading(false); return; }
  const subCheck = checkSubscription(result.user);
  if (!subCheck.ok) { setMsg(subCheck.message || 'Access denied'); setLoading(false); return; }
  storeUserSession(result.user); localStorage.setItem('dp_user_email', result.user.email); localStorage.setItem('dp_user_id', result.user.id);
  console.log('Login OK (demo):', subCheck.reason); window.location.href = 'app.html';
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
