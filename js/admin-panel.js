// ============================================================
// Admin Dashboard — User Management, Activation Codes & Coupons
// Extracted from admin.html inline script for maintainability
// Uses Supabase Edge Function admin endpoints.
// Requires admin JWT from sessionStorage (set after admin login).
// ============================================================

import { appConfig } from './config.js';
import { demoUsersAll, demoUsersSave, findDemoUser, demoAll as demoCodesAll } from './db.js';

const $ = (sel, root = document) => root.querySelector(sel);

// ---------- Auth guard: MUST be the first executable code ----------
// Runs before anything else so no runtime error below can ever bypass login.
const TOKEN = sessionStorage.getItem('dp_admin_token') || '';
let IS_DEMO = !appConfig.isProduction && (sessionStorage.getItem('dp_demo_admin') === '1' || TOKEN.startsWith('demo-'));

// In production, demo mode is completely disabled
if (appConfig.isProduction && IS_DEMO) {
  sessionStorage.removeItem('dp_demo_admin');
  IS_DEMO = false;
}

if (!TOKEN) {
  window.location.href = 'admin-login.html';
  throw new Error('no admin token');
}

// Helper to block cloud API calls in demo mode
function assertOnlineMode(featureName) {
  if (IS_DEMO) {
    showToast(`${featureName} يتطلب الوضع الأونلاين (Online Mode) — غير متاح في Demo Mode`, 'error');
    return false;
  }
  return true;
}

// ---------- HTML escaping (XSS prevention) ----------
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Safe attribute value escaping
const escAttr = (s) => esc(s).replace(/`/g, '&#96;');

// ---------- Toast notifications ----------
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer') || (() => {
    const c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
    return c;
  })();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(100px)';
    el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ---------- Confirmation Dialog ----------
let confirmResolve = null;

function showConfirm(options) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    const { title, message, icon, iconColor, okText, okClass, cancelText } = options;
    
    elements.confirmIcon.textContent = icon;
    elements.confirmIcon.style.background = `${iconColor}20`;
    elements.confirmIcon.style.color = iconColor;
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmOk.textContent = okText;
    elements.confirmOk.className = `btn ${okClass} btn-sm`;
    elements.confirmCancel.textContent = cancelText || 'Cancel / إلغاء';
    
    elements.confirmOverlay.classList.remove('hidden');
    elements.confirmOk.focus();
  });
}

function hideConfirm() {
  elements.confirmOverlay.classList.add('hidden');
  if (confirmResolve !== null) {
    confirmResolve(false);
    confirmResolve = null;
  }
}

// ---------- Configuration ----------
const TIER_LABEL = {
  trial: 'Trial / تجربة',
  monthly: 'Monthly / شهر',
  yearly: 'Yearly / سنة',
  lifetime: 'Lifetime / دائم',
  none: 'None / بدون',
  active: 'Active / نشط',
};

const DEFAULT_DAYS = { trial: 14, monthly: 30, yearly: 365, lifetime: 0, none: 0 };

const KIND_LABEL = {
  days_14: '14 days / 14 يوم',
  days_30: '30 days / 30 يوم',
  days_365: '365 days / 365 يوم',
  percent: 'Percent / نسبة',
};

const COUPON_KEY = 'dp_coupons';

// ---------- State ----------
let allUsers = [];
let loading = false;
let editId = null;
let pendingCoupon = null;

// ---------- DOM Elements ----------
const elements = {
  // Stats
  statTotal: $('#statTotal'),
  statActive: $('#statActive'),
  statTrial: $('#statTrial'),
  statExpired: $('#statExpired'),
  usersCount: $('#usersCount'),

  // Users table
  usersTableBody: $('#usersTableBody'),
  searchInput: $('#searchInput'),
  statusFilter: $('#statusFilter'),
  refreshBtn: $('#refreshBtn'),
  addUserBtn: $('#addUserBtn'),
  exportUsersXlsxBtn: $('#exportUsersXlsxBtn'),
  exportUsersCsvBtn: $('#exportUsersCsvBtn'),
  importUsersBtn: $('#importUsersBtn'),

  // Admin info
  adminEmailDisplay: $('#adminEmailDisplay'),
  adminLogoutBtn: $('#adminLogoutBtn'),
  modeBadge: $('#modeBadge'),

  // Activation codes
  codeListBody: $('#codeListBody'),
  codeListWrap: $('#codeListWrap'),
  codeCountBadge: $('#codeCountBadge'),
  codeSearchInput: $('#codeSearchInput'),
  codeStatusFilter: $('#codeStatusFilter'),
  toggleCodesBtn: $('#toggleCodesBtn'),
  codesToggleIcon: $('#codesToggleIcon'),
  codesToggleText: $('#codesToggleText'),
  addCodeBtn: $('#addCodeBtn'),
  codeLoadMoreBtn: $('#codeLoadMoreBtn'),
  codeLoadMoreWrap: $('#codeLoadMoreWrap'),

  // Coupons
  couponListBody: $('#couponListBody'),
  couponListWrap: $('#couponListWrap'),
  toggleCouponsBtn: $('#toggleCouponsBtn'),
  couponsToggleIcon: $('#couponsToggleIcon'),
  couponsToggleText: $('#couponsToggleText'),
  addCouponBtn: $('#addCouponBtn'),

  // User modal
  userModal: $('#userModal'),
  userModalTitleText: $('#userModalTitleText'),
  userForm: $('#userForm'),
  userName: $('#userName'),
  userEmail: $('#userEmail'),
  userPassword: $('#userPassword'),
  passwordRow: $('#passwordRow'),
  userSubType: $('#userSubType'),
  userDays: $('#userDays'),
  subPreview: $('#subPreview'),
  submitUserBtn: $('#submitUserBtn'),
  userModalMsg: $('#userModalMsg'),
  cancelUserBtn: $('#cancelUserBtn'),
  couponSection: $('#couponSection'),
  couponCode: $('#couponCode'),
  applyCouponBtn: $('#applyCouponBtn'),
  couponResult: $('#couponResult'),

  // Code modal
  codeModal: $('#codeModal'),
  codeForm: $('#codeForm'),
  codeCustom: $('#codeCustom'),
  codeTier: $('#codeTier'),
  codeDays: $('#codeDays'),
  codeDeviceLimit: $('#codeDeviceLimit'),
  codeOwner: $('#codeOwner'),
  codeNote: $('#codeNote'),
  cancelCodeBtn: $('#cancelCodeBtn'),
  submitCodeBtn: $('#submitCodeBtn'),
  codeModalMsg: $('#codeModalMsg'),
  codeResult: $('#codeResult'),
  codeResultValue: $('#codeResultValue'),
  codeCopyBtn: $('#codeCopyBtn'),
  codeWaLink: $('#codeWaLink'),

  // Password modal
  pwModal: $('#pwModal'),
  pwResultValue: $('#pwResultValue'),
  pwCopyBtn: $('#pwCopyBtn'),
  pwCloseBtn: $('#pwCloseBtn'),

  // Coupon modal
  couponModal: $('#couponModal'),
  couponForm: $('#couponForm'),
  couponCodeInput: $('#couponCodeInput'),
  couponType: $('#couponType'),
  couponValue: $('#couponValue'),
  couponModalMsg: $('#couponModalMsg'),
  cancelCouponBtn: $('#cancelCouponBtn'),
  submitCouponBtn: $('#submitCouponBtn'),

  // Confirmation dialog
  confirmOverlay: $('#confirmOverlay'),
  confirmIcon: $('#confirmIcon'),
  confirmTitle: $('#confirmTitle'),
  confirmMessage: $('#confirmMessage'),
  confirmOk: $('#confirmOk'),
  confirmCancel: $('#confirmCancel'),
};

// ---------- Confirm-dialog listeners (after `elements` is initialized) ----------
elements.confirmOk.addEventListener('click', () => {
  if (confirmResolve !== null) {
    confirmResolve(true);
    confirmResolve = null;
  }
  hideConfirm();
});

elements.confirmCancel.addEventListener('click', hideConfirm);
elements.confirmOverlay.addEventListener('click', (e) => {
  if (e.target === elements.confirmOverlay) hideConfirm();
});

// Close with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!elements.confirmOverlay.classList.contains('hidden')) hideConfirm();
    if (!elements.userModal.classList.contains('hidden')) closeUserModal();
    if (!elements.codeModal.classList.contains('hidden')) closeCodeModal();
    if (!elements.pwModal.classList.contains('hidden')) closePwModal();
    if (!elements.couponModal.classList.contains('hidden')) closeCouponModal();
    closeDataModal();
  }
});

// Initialize UI for demo/online mode
const modeText = IS_DEMO ? 'OFFLINE / محلي (Demo)' : (appConfig.isProduction ? 'ONLINE / إنتاج' : 'ONLINE / تطوير');
const modeColor = IS_DEMO ? '#ff9800' : '#CCFF00';
const modeBorder = IS_DEMO ? '#ff980055' : '#CCFF0055';

elements.modeBadge.textContent = modeText;
elements.modeBadge.style.color = modeColor;
elements.modeBadge.style.borderColor = modeBorder;
elements.adminEmailDisplay.textContent = IS_DEMO
  ? 'admin@gym.local (Demo)'
  : (((() => {
      try {
        return JSON.parse(localStorage.getItem('dp_current_user') || 'null');
      } catch {
        return null;
      }
    })() || {}).email || 'Admin');

// Logout handler
elements.adminLogoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('dp_admin_token');
  sessionStorage.removeItem('dp_demo_admin');
  localStorage.removeItem('dp_current_user');
  window.location.href = 'index.html';
});

// Add user button
elements.addUserBtn.addEventListener('click', openCreateUser);

// ---------- API Helpers ----------
const API_BASE = appConfig.apiUrl || 'https://mwfbgucayjgbbvcyelbo.functions.supabase.co/gymos-api';

async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: appConfig.supabaseAnonKey || '',
      Authorization: 'Bearer ' + TOKEN,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------- Timestamp Helpers ----------
const ts = (v) => {
  if (v == null) return null;
  return typeof v === 'number' ? v : (Date.parse(v) || null);
};

function normalizeUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.full_name || u.gym_name || u.name || '',
    gym_name: u.gym_name || '',
    created: ts(u.created),
    lastSignIn: ts(u.lastSignIn),
    status: u.status || 'active',
    subscription: u.subTier || u.subscription || 'none',
    subStart: ts(u.subStart),
    subEnd: ts(u.subEnd),
    subTier: u.subTier || null,
    days: u.days != null ? u.days : null,
    password: u.password,
    _demo: !!u._demo,
  };
}

// ---------- Cloud gym stats (Phase C) ----------
// codes.owner is either the account email or "user:<uuid>" (see /api/trial),
// so every user is linked to their cloud gym through both keys. An account
// with no bound code simply shows "—" instead of a fake zero.
function attachGymStats(users, stats) {
  const byOwner = new Map();
  for (const s of stats || []) {
    const key = String(s.owner || '').toLowerCase();
    if (!key) continue;
    if (!byOwner.has(key)) byOwner.set(key, []);
    byOwner.get(key).push(s);
  }
  for (const u of users) {
    const email = String(u.email || '').toLowerCase();
    const mine = [...(byOwner.get(email) || []), ...(byOwner.get(`user:${u.id}`) || [])];
    u._gymCodes = mine.map(s => s.code);
    u._members = mine.reduce((m, s) => Math.max(m, Number(s.members) || 0), 0);
    u._lastSync = mine.reduce((t, s) => Math.max(t, Number(s.lastSync) || 0), 0);
  }
}

const shortId = (id) => {
  const s = String(id || '');
  return s ? (s.length > 10 ? s.slice(0, 10) + '…' : s) : '—';
};

function fmtSync(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

// ---------- Demo Helpers ----------
async function demoGetUsers() {
  return demoUsersAll();
}

async function demoCreateUser(data) {
  if (findDemoUser(data.email)) throw new Error('Email already exists / البريد موجود مسبقاً');
  const users = demoUsersAll();
  users.push({ ...data, id: 'U' + Date.now().toString(36).toUpperCase(), createdAt: Date.now() });
  demoUsersSave(users);
  return users[users.length - 1];
}

async function demoUpdateUser(userId, updates) {
  const users = demoUsersAll();
  const i = users.findIndex(u => u.id === userId);
  if (i === -1) throw new Error('User not found / المستخدم غير موجود');
  users[i] = { ...users[i], ...updates };
  demoUsersSave(users);
  return users[i];
}

// ---------- Local Coupon Helpers ----------
function localCoupons() {
  try {
    return JSON.parse(localStorage.getItem(COUPON_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLocalCoupons(c) {
  localStorage.setItem(COUPON_KEY, JSON.stringify(c));
}

function couponTierOf(k) {
  return k === 'days_14' ? 'trial' : k === 'days_30' ? 'monthly' : k === 'days_365' ? 'yearly' : null;
}

function couponDaysOf(k) {
  return k === 'days_14' ? 14 : k === 'days_30' ? 30 : k === 'days_365' ? 365 : 0;
}

// ---------- Load Users ----------
let usersCursor = null;
let usersHasMore = false;

async function loadUsers(append = false) {
  if (loading) return;
  loading = true;
  if (!append) {
    elements.usersTableBody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">
            <span class="icon">⏳</span>
            <p class="empty-state-title">Loading users...</p>
            <p class="empty-state-text">جاري تحميل قائمة المستخدمين</p>
          </div>
        </td>
      </tr>`;
  }

  let data, statsRes;
  try {
    if (IS_DEMO) throw new Error('demo');
    const params = new URLSearchParams();
    if (usersCursor) params.set('cursor', usersCursor);
    params.set('perPage', '200');
    const search = elements.searchInput.value.trim();
    if (search) params.set('q', search);
    const status = elements.statusFilter.value;
    if (status !== 'all') params.set('status', status);
    
    const [apiRes, stats] = await Promise.all([
      api(`/api/users?${params.toString()}`),
      api('/api/admin/backup?scope=stats').catch(() => null),
    ]);
    data = apiRes;
    statsRes = stats;
    usersHasMore = data.hasMore === true;
    usersCursor = data.nextCursor || null;
    const users = (data.data || []).map(u => normalizeUser({ ...u, _demo: false }));
    attachGymStats(users, (statsRes && statsRes.stats) || []);
    if (append) allUsers.push(...users); else allUsers = users;
  } catch (err) {
    if (!IS_DEMO) {
      console.log('Admin API error:', err.message);
      if (/(401|403|FORBIDDEN|UNAUTHORIZED)/i.test(err.message || '')) {
        sessionStorage.removeItem('dp_admin_token');
        window.location.href = 'admin-login.html';
        return;
      }
      if (!append) {
        allUsers = [];
        elements.usersTableBody.innerHTML = `
          <tr>
            <td colspan="10">
              <div class="empty-state">
                <span class="icon">⚠️</span>
                <p class="empty-state-title">API Error / خطأ في الاتصال</p>
                <p class="empty-state-text">${esc(err.message)} — راجع الاتصال / أعد تسجيل الدخول</p>
              </div>
            </td>
          </tr>`;
      }
      loading = false;
      return;
    }
    const users = (await demoGetUsers()).map(u => normalizeUser({ ...u, _demo: true }));
    if (append) allUsers.push(...users); else allUsers = users;
  }

  if (!append) {
    renderUsers(allUsers);
    updateStats(allUsers);
  } else {
    // Append mode: just render the new users
    const startIdx = allUsers.length - (data?.data?.length || 0);
    const newUsers = allUsers.slice(startIdx);
    appendUsersToTable(newUsers);
    updateStats(allUsers);
  }
  loading = false;
}

function appendUsersToTable(users) {
  const tbody = elements.usersTableBody;
  if (!tbody) return;
  const rows = users.map(u => `
    <tr class="hover:bg-[#171717]/50 transition-colors" data-open-account="${escAttr(u.id || '')}" style="cursor:pointer;" title="Open Account Detail Center / فتح مركز تفاصيل الحساب">
      <td>
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style="background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);">${esc((u.name || '?').charAt(0).toUpperCase())}</div>
          <div style="min-width:0;">
            <span>${esc(u.name || '—')}</span>
            <span class="subline">${esc([u.created ? 'Created ' + fmtDay(u.created) : '', u.lastSignIn ? 'Login ' + fmtDay(u.lastSignIn) : ''].filter(Boolean).join(' · '))}</span>
          </div>
        </div>
      </td>
      <td class="font-headline text-sm" style="color: var(--accent);">${esc(u.gym_name || '—')}</td>
      <td class="font-mono text-sm" style="color: var(--accent);">${esc(u.email || '—')}</td>
      <td class="font-mono text-xs opacity-70" title="${escAttr(u.id || '')}">${esc(shortId(u.id))}</td>
      <td>${esc(TIER_LABEL[u.subscription] || u.subscription || 'None')}</td>
      <td class="whitespace-nowrap">${expiryText(u)}</td>
      <td class="text-center font-mono text-sm">${(u._gymCodes || []).length ? u._members : '<span class="opacity-40">—</span>'}</td>
      <td class="text-xs whitespace-nowrap">${(u._gymCodes || []).length && u._lastSync ? fmtSync(u._lastSync) : '<span class="opacity-40">—</span>'}</td>
      <td>${tierBadge(u)}</td>
      <td>
        <div class="flex gap-1 flex-wrap justify-end">
          <button class="btn btn-secondary btn-sm" data-action="viewdata" data-id="${escAttr(u.id)}" title="عرض بيانات السحابة لهذا الحساب">👁 View / بيانات</button>
          <button class="btn btn-secondary btn-sm" data-action="backup" data-id="${escAttr(u.id)}" title="تنزيل نسخة JSON من بيانات الحساب">⬇ Backup / نسخ</button>
          <button class="btn btn-secondary btn-sm" data-action="restore" data-id="${escAttr(u.id)}" title="استعادة بيانات من ملف JSON">⬆ Restore / استعادة</button>
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${escAttr(u.id)}">✎ Edit / تعديل</button>
          <button class="btn btn-secondary btn-sm" data-action="send-reset" data-email="${escAttr(u.email || '')}" title="إرسال رابط إعادة تعيين كلمة السر إلى بريد المستخدم">🔑 Reset Mail / رابط كلمة السر</button>
          ${u.status === 'suspended'
            ? `<button class="btn btn-success btn-sm" data-action="activate" data-id="${escAttr(u.id)}">▶️ Activate / تفعيل</button>`
            : `<button class="btn btn-warning btn-sm" data-action="suspend" data-id="${escAttr(u.id)}">⏸️ Suspend / تعليق</button>`}
        </div>
      </td>
    </tr>`).join('');
  tbody.insertAdjacentHTML('beforeend', rows);
  
  // Event delegation on table body handles all actions — no per-row binding needed
}

// ---------- Render Users ----------
function tierBadge(user) {
  const now = Date.now();
  const tier = user.subscription;
  const expired = user.status !== 'suspended' &&
    (tier === 'trial' || tier === 'monthly' || tier === 'yearly' || tier === 'active') &&
    user.subEnd && user.subEnd <= now;
  const suspended = user.status === 'suspended';

  if (suspended) return '<span class="badge badge-danger">🚫 Suspended / موقوف</span>';
  if (expired) return '<span class="badge badge-danger">⏰ Expired / منتهي</span>';
  if (tier === 'trial') return '<span class="badge badge-info">🧪 Trial / تجربة</span>';
  if (tier === 'lifetime') return '<span class="badge badge-success">♾️ Lifetime / مدى الحياة</span>';
  if (tier === 'active' || tier === 'monthly' || tier === 'yearly') return '<span class="badge badge-success">✅ Active / نشط</span>';
  return '<span class="badge badge-neutral">❌ None / بدون</span>';
}

function expiryText(user) {
  if (user.subscription === 'lifetime') return '<span style="color: var(--accent);">♾️ Lifetime</span>';
  if (!user.subEnd) return '—';
  return new Date(user.subEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderUsers(users) {
  const q = elements.searchInput.value.trim().toLowerCase();
  const st = elements.statusFilter.value;
  let list = users;

  if (q) list = list.filter(u => (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q) || (u.id || '').toLowerCase().includes(q));

  if (st !== 'all') {
    const now = Date.now();
    list = list.filter(u => {
      if (st === 'active') return u.status !== 'suspended' && u.subscription !== 'none' && (!u.subEnd || u.subEnd > now);
      if (st === 'trial') return u.subscription === 'trial' && u.subEnd && u.subEnd > now;
      if (st === 'trial_expired') return u.subscription === 'trial' && u.subEnd && u.subEnd <= now && u.status !== 'suspended';
      if (st === 'expired') return u.subscription !== 'none' && u.subscription !== 'lifetime' && u.subEnd && u.subEnd <= now;
      if (st === 'suspended') return u.status === 'suspended';
      return true;
    });
  }

  if (!list.length) {
    elements.usersTableBody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">
            <span class="icon">👤</span>
            <p class="empty-state-title">No users found / لا توجد مستخدمين</p>
            <p class="empty-state-text">Try adjusting your filters / حاول تعديل الفلاتر</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  elements.usersTableBody.innerHTML = list.map(u => `
    <tr class="hover:bg-[#171717]/50 transition-colors" data-open-account="${escAttr(u.id || '')}" style="cursor:pointer;" title="Open Account Detail Center / فتح مركز تفاصيل الحساب">
      <td>
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style="background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);">${esc((u.name || '?').charAt(0).toUpperCase())}</div>
          <div style="min-width:0;">
            <span>${esc(u.name || '—')}</span>
            <span class="subline">${esc([u.created ? 'Created ' + fmtDay(u.created) : '', u.lastSignIn ? 'Login ' + fmtDay(u.lastSignIn) : ''].filter(Boolean).join(' · '))}</span>
          </div>
        </div>
      </td>
      <td class="font-headline text-sm" style="color: var(--accent);">${esc(u.gym_name || '—')}</td>
      <td class="font-mono text-sm" style="color: var(--accent);">${esc(u.email || '—')}</td>
      <td class="font-mono text-xs opacity-70" title="${escAttr(u.id || '')}">${esc(shortId(u.id))}</td>
      <td>${esc(TIER_LABEL[u.subscription] || u.subscription || 'None')}</td>
      <td class="whitespace-nowrap">${expiryText(u)}</td>
      <td class="text-center font-mono text-sm">${(u._gymCodes || []).length ? u._members : '<span class="opacity-40">—</span>'}</td>
      <td class="text-xs whitespace-nowrap">${(u._gymCodes || []).length && u._lastSync ? fmtSync(u._lastSync) : '<span class="opacity-40">—</span>'}</td>
      <td>${tierBadge(u)}</td>
      <td>
        <div class="flex gap-1 flex-wrap justify-end">
          <button class="btn btn-secondary btn-sm" data-action="viewdata" data-id="${escAttr(u.id)}" title="عرض بيانات السحابة لهذا الحساب">👁 View / بيانات</button>
          <button class="btn btn-secondary btn-sm" data-action="backup" data-id="${escAttr(u.id)}" title="تنزيل نسخة JSON من بيانات الحساب">⬇ Backup / نسخ</button>
          <button class="btn btn-secondary btn-sm" data-action="restore" data-id="${escAttr(u.id)}" title="استعادة بيانات من ملف JSON">⬆ Restore / استعادة</button>
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${escAttr(u.id)}">✎ Edit / تعديل</button>
          <button class="btn btn-secondary btn-sm" data-action="send-reset" data-email="${escAttr(u.email || '')}" title="إرسال رابط إعادة تعيين كلمة السر إلى بريد المستخدم">🔑 Reset Mail / رابط كلمة السر</button>
          ${u.status === 'suspended'
            ? `<button class="btn btn-success btn-sm" data-action="activate" data-id="${escAttr(u.id)}">▶️ Activate / تفعيل</button>`
            : `<button class="btn btn-warning btn-sm" data-action="suspend" data-id="${escAttr(u.id)}">⏸️ Suspend / تعليق</button>`}
        </div>
      </td>
    </tr>`).join('');
}

function updateStats(users) {
  const now = Date.now();
  const active = users.filter(u => u.status !== 'suspended' && u.subscription !== 'none' && u.subscription !== 'lifetime' && u.subEnd && u.subEnd > now).length
    + users.filter(u => u.subscription === 'lifetime' && u.status !== 'suspended').length;
  const trial = users.filter(u => u.subscription === 'trial' && u.subEnd && u.subEnd > now && u.status !== 'suspended').length;
  const expired = users.filter(u => u.subscription !== 'none' && u.subscription !== 'lifetime' && u.subEnd && u.subEnd <= now).length;

  elements.statTotal.textContent = users.length;
  elements.statActive.textContent = active;
  elements.statTrial.textContent = trial;
  elements.statExpired.textContent = expired;
  if (elements.usersCount) elements.usersCount.textContent = users.length;
}

// ---------- Subscription Preview ----------
function previewText() {
  const tier = elements.userSubType.value;
  if (tier === 'lifetime') return 'Lifetime — never expires / مدى الحياة — لا ينتهي';
  if (tier === 'none') return 'No subscription / بدون اشتراك';
  const days = parseInt(elements.userDays.value) || DEFAULT_DAYS[tier] || 30;
  const end = Date.now() + days * 86400000;
  return `${days} days → ${new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}  (${days} يوم)`;
}

function refreshPreview() {
  if (elements.userSubType.value === 'lifetime' || elements.userSubType.value === 'none') {
    elements.userDays.disabled = true;
  } else {
    elements.userDays.disabled = false;
  }
  elements.subPreview.textContent = previewText();
}

window._setDays = (d) => {
  elements.userDays.value = d;
  refreshPreview();
};

window._setCodeDays = (d) => {
  elements.codeDays.value = d;
};

elements.userSubType.addEventListener('change', () => {
  if (elements.userSubType.value !== 'lifetime' && elements.userSubType.value !== 'none') {
    elements.userDays.value = parseInt(elements.userDays.value) || DEFAULT_DAYS[elements.userSubType.value] || 30;
  }
  refreshPreview();
});

elements.userDays.addEventListener('input', refreshPreview);

// Quick-set day buttons for user modal
document.querySelectorAll('[data-days]').forEach(btn => {
  btn.addEventListener('click', () => {
    const days = parseInt(btn.dataset.days);
    elements.userDays.value = days;
    refreshPreview();
  });
});

// Quick-set day buttons for code modal
document.querySelectorAll('[data-code-days]').forEach(btn => {
  btn.addEventListener('click', () => {
    const days = parseInt(btn.dataset.codeDays);
    elements.codeDays.value = days;
  });
});

// ---------- Modal: Create / Edit User ----------
function openCreateUser() {
  editId = null;
  elements.userModalTitleText.textContent = 'Add User / إضافة مستخدم';
  elements.passwordRow.classList.remove('hidden');
  elements.userPassword.required = true;
  elements.userEmail.disabled = false;
  elements.userForm.reset();
  elements.userSubType.value = 'monthly';
  elements.userDays.value = 30;
  elements.submitUserBtn.textContent = 'Create User / إنشاء';
  elements.couponSection.classList.add('hidden');
  pendingCoupon = null;
  elements.userModalMsg.textContent = '';
  refreshPreview();
  elements.userModal.classList.remove('hidden');
}

function editUser(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;
  editId = id;
  elements.userModalTitleText.textContent = 'Edit Subscription / تعديل الاشتراك';
  elements.passwordRow.classList.add('hidden');
  elements.userPassword.required = false;
  elements.userName.value = u.name || '';
  elements.userEmail.value = u.email || '';
  elements.userEmail.disabled = true;
  const tier = ['trial', 'monthly', 'yearly', 'lifetime', 'none'].includes(u.subscription) ? u.subscription : 'none';
  elements.userSubType.value = tier;
  elements.userDays.value = u.days || (tier === 'yearly' ? 365 : tier === 'trial' ? 14 : tier === 'lifetime' ? 0 : 30);
  elements.submitUserBtn.textContent = 'Save Changes / حفظ';
  elements.couponSection.classList.remove('hidden');
  pendingCoupon = null;
  elements.userModalMsg.textContent = '';
  refreshPreview();
  elements.userModal.classList.remove('hidden');
}

// ---------- Modal Close Functions ----------
function closeUserModal() {
  pendingCoupon = null;
  elements.userModal.classList.add('hidden');
}

function closeCodeModal() {
  elements.codeResult.classList.add('hidden');
  elements.codeModal.classList.add('hidden');
}

function closePwModal() {
  elements.pwModal.classList.add('hidden');
}

function closeCouponModal() {
  elements.couponModal.classList.add('hidden');
}

elements.cancelUserBtn.addEventListener('click', closeUserModal);
elements.userModal.addEventListener('click', (e) => {
  if (e.target === elements.userModal) closeUserModal();
});

elements.cancelCodeBtn.addEventListener('click', closeCodeModal);
elements.codeModal.addEventListener('click', (e) => {
  if (e.target === elements.codeModal) closeCodeModal();
});

elements.pwCloseBtn.addEventListener('click', closePwModal);
elements.pwModal.addEventListener('click', (e) => {
  if (e.target === elements.pwModal) closePwModal();
});

elements.cancelCouponBtn.addEventListener('click', closeCouponModal);
elements.couponModal.addEventListener('click', (e) => {
  if (e.target === elements.couponModal) closeCouponModal();
});

// ---------- Save User (Create or Edit) ----------
elements.userForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;

  const name = elements.userName.value.trim();
  const email = elements.userEmail.value.trim().toLowerCase();
  const password = elements.userPassword.value;
  const tier = elements.userSubType.value;
  const days = parseInt(elements.userDays.value) || DEFAULT_DAYS[tier] || 0;

  if (!name || !email) {
    elements.userModalMsg.textContent = 'Name and email are required / الاسم والبريد مطلوبان';
    return;
  }
  if (editId === null && password.length < 8) {
    elements.userModalMsg.textContent = 'Password must be 8+ characters / 8 أحرف على الأقل';
    return;
  }

  loading = true;
  elements.userModalMsg.textContent = '';
  elements.submitUserBtn.disabled = true;

  const now = Date.now();
  const subEnd = tier === 'lifetime' ? now + 36500 * 86400000 : tier === 'none' ? null : now + days * 86400000;
  const subscription = {
    tier,
    days: tier === 'lifetime' || tier === 'none' ? 0 : days,
  };

  // Claim coupon first (if any) — atomic redeem
  let claimedCoupon = null;
  if (pendingCoupon) {
    try {
      await apiRedeemCoupon(pendingCoupon, editId || 'pending');
      claimedCoupon = { code: pendingCoupon, userId: editId || 'pending' };
    } catch (err) {
      elements.userModalMsg.textContent = (err.message || 'Coupon could not be redeemed') + ' / الكوبون مستخدم بالفعل';
      loading = false;
      elements.submitUserBtn.disabled = false;
      return;
    }
  }

  let savedId = editId;
  try {
    if (editId === null) {
      if (IS_DEMO) {
        const created = await demoCreateUser({
          name, email, password, status: 'active',
          subscription: tier === 'none' ? 'none' : (tier === 'lifetime' ? 'active' : tier),
          subStart: now, subEnd, subTier: tier, days: subscription.days,
          lastLogin: null,
        });
        savedId = created && created.id;
        if (claimedCoupon) claimedCoupon.userId = savedId || 'pending';
      } else {
        const created = await api('/api/users', {
          method: 'POST',
          body: JSON.stringify({ email, password, full_name: name, subscription }),
        });
        savedId = created && created.id;
        if (claimedCoupon) claimedCoupon.userId = savedId || 'pending';
      }
    } else {
      if (IS_DEMO) {
        await demoUpdateUser(editId, {
          name,
          subscription: tier === 'none' ? 'none' : (tier === 'lifetime' ? 'active' : tier),
          subStart: (allUsers.find(x => x.id === editId) || {}).subStart || now,
          subEnd, subTier: tier, days: subscription.days, status: 'active',
        });
      } else {
        await api('/api/users/' + editId, {
          method: 'PATCH',
          body: JSON.stringify({ name, subscription }),
        });
      }
    }
    elements.userModal.classList.add('hidden');
    pendingCoupon = null;
    await loadUsers();
    showToast(editId === null ? 'User created successfully / تم إنشاء المستخدم بنجاح' : 'User updated successfully / تم تحديث المستخدم بنجاح', 'success');
  } catch (err) {
    console.error(err);
    if (claimedCoupon) {
      try { await apiReleaseCoupon(claimedCoupon.code, claimedCoupon.userId); } catch (e) { console.warn('coupon release failed', e); }
    }
    elements.userModalMsg.textContent = err.message || 'Failed / فشل';
  } finally {
    loading = false;
    elements.submitUserBtn.disabled = false;
  }
});

// ---------- Users Import / Export (Excel / CSV) ----------
async function exportUsersXLSX() {
  try {
    const { store } = await import('./store.js');
    const blob = await store.exportToXLSX();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gymos-users-${fileStamp()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast('Users exported to Excel / تم تصدير المستخدمين إلى Excel', 'success');
  } catch (err) {
    console.error('[export xlsx]', err);
    showToast('Export failed: ' + err.message, 'error');
  }
}

async function exportUsersCSV() {
  try {
    const { store } = await import('./store.js');
    const blob = store.exportToCSV();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gymos-users-${fileStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast('Users exported to CSV / تم تصدير المستخدمين إلى CSV', 'success');
  } catch (err) {
    console.error('[export csv]', err);
    showToast('Export failed: ' + err.message, 'error');
  }
}

async function importUsers() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;

    const confirmed = await showConfirm({
      title: 'Import Users / استيراد المستخدمين',
      message: `This will import users from "${file.name}". Existing users (by email) will be updated, new users added. A backup of current users will be downloaded first. / سيستورد المستخدمين من "${file.name}". المستخدمون الحاليون (بالبريد) سيتم تحديثهم، والجدد سيضافون. نسخة احتياطية ستُنزل أولاً.`,
      icon: '📥',
      iconColor: '#CCFF00',
      okText: 'Import / استيراد',
      okClass: 'btn-primary',
      cancelText: 'Cancel / إلغاء',
    });
    if (!confirmed) return;

    // Backup current users first
    try {
      const { store } = await import('./store.js');
      const backup = store.exportAll();
      downloadJson(`gymos-pre-import-${fileStamp()}.json`, backup);
    } catch (e) {
      console.warn('pre-import backup failed', e);
    }

    loading = true;
    try {
      const { store } = await import('./store.js');
      const result = await store.importFromFile(file, { skipDuplicates: false });
      showToast(`Import done: ${result.added} added, ${result.updated} updated${result.errors.length ? `, ${result.errors.length} errors` : ''}`, result.errors.length ? 'warning' : 'success');
      if (result.errors.length) {
        console.warn('Import errors:', result.errors);
      }
      await loadUsers();
    } catch (err) {
      console.error('[import]', err);
      showToast('Import failed: ' + err.message, 'error');
    } finally {
      loading = false;
    }
  });
  document.body.appendChild(input);
  input.click();
}

// Wire up import/export buttons
elements.exportUsersXlsxBtn?.addEventListener('click', exportUsersXLSX);
elements.exportUsersCsvBtn?.addEventListener('click', exportUsersCSV);
elements.importUsersBtn?.addEventListener('click', importUsers);

// ---------- Cloud data: View / Backup / Restore (Phase C) ----------
function findGymUser(id) {
  return allUsers.find(u => u.id === id) || null;
}

// Demo/offline mode has no server gyms, and an account without a bound code
// has nothing to fetch. Returns the user's codes, or null after explaining why.
function gymCodesFor(u) {
  if (!u) { showToast('User not found / المستخدم غير موجود', 'error'); return null; }
  if (!assertOnlineMode('بيانات السحابة')) return null;
  if (u._demo) { showToast('Demo users have no cloud data / مستخدمو Demo ليس لديهم بيانات سحابية', 'error'); return null; }
  const codes = u._gymCodes || [];
  if (!codes.length) { showToast('No activation code bound to this account / لا يوجد كود مرتبط بهذا الحساب', 'error'); return null; }
  return codes;
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const fileStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const safeName = (s) => String(s || 'user').replace(/[^A-Za-z0-9._@-]+/g, '_').slice(0, 60);

// One-off overlay — the panel's other modals are static HTML, but this view
// renders whatever the server returned.
function openDataModal(inner) {
  closeDataModal();
  const overlay = document.createElement('div');
  overlay.id = 'dpDataModal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:80;display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML = `
    <div style="background:#111;border:1px solid #333;border-radius:1rem;max-width:720px;width:100%;max-height:85vh;overflow:auto;padding:1.25rem;">
      ${inner}
    </div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDataModal(); });
  document.body.appendChild(overlay);
}

function closeDataModal() {
  document.getElementById('dpDataModal')?.remove();
}

function membersPreview(data) {
  const members = Array.isArray(data?.members) ? data.members : [];
  if (!members.length) return '<p class="text-sm opacity-60">No members in this copy / لا يوجد أعضاء في هذه النسخة</p>';
  const rows = members.slice(0, 25).map(m => `
    <tr>
      <td style="padding:.25rem .5rem;">${esc(m.name || '—')}</td>
      <td style="padding:.25rem .5rem;font-family:monospace;">${esc(m.phone || '—')}</td>
      <td style="padding:.25rem .5rem;">${m.joinDate ? new Date(m.joinDate).toLocaleDateString('en-GB') : '—'}</td>
    </tr>`).join('');
  const more = members.length > 25
    ? `<p class="text-xs opacity-60" style="margin-top:.5rem;">… ${members.length - 25} more in the file / والمزيد داخل الملف</p>` : '';
  return `
    <table style="width:100%;font-size:.85rem;border-collapse:collapse;">
      <thead><tr style="text-align:left;opacity:.7;">
        <th style="padding:.25rem .5rem;">Name / الاسم</th>
        <th style="padding:.25rem .5rem;">Phone / الهاتف</th>
        <th style="padding:.25rem .5rem;">Joined / الانضمام</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>${more}`;
}

async function viewUserData(id) {
  const u = findGymUser(id);
  const codes = gymCodesFor(u);
  if (!codes) return;
  try {
    const parts = [];
    for (const c of codes) {
      const res = await api(`/api/admin/backup?scope=code&code=${encodeURIComponent(c)}`);
      const rows = res.gyms || [];
      const count = rows.reduce((m, g) => Math.max(m, Array.isArray(g.data?.members) ? g.data.members.length : 0), 0);
      const latest = rows.reduce((t, g) => Math.max(t, g.saved_at ? Date.parse(g.saved_at) || 0 : 0), 0);
      const primary = rows.find(g => g.device_id === '') || rows[0];
      parts.push(`
        <section style="margin-top:1rem;border-top:1px solid #333;padding-top:.75rem;">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;">
            <b style="font-family:monospace;color:var(--accent);">${esc(res.code?.code || c)}</b>
            <span class="text-xs">${esc(TIER_LABEL[res.code?.tier] || res.code?.tier || '')} · ${esc(res.code?.owner || 'بدون مالك / no owner')}</span>
          </div>
          <p class="text-xs" style="margin:.35rem 0;">
            ${count} members / عضو · Last sync: ${latest ? new Date(latest).toLocaleString('en-GB') : '—'}${rows.length > 1 ? ` · ${rows.length} device rows / صفوف أجهزة` : ''}
          </p>
          ${membersPreview(primary?.data)}
          <details style="margin-top:.5rem;">
            <summary class="text-xs cursor-pointer" style="opacity:.7;">Raw JSON / البيانات الخام</summary>
            <pre style="font-size:.7rem;max-height:200px;overflow:auto;background:#000;padding:.5rem;border-radius:.5rem;">${esc(JSON.stringify(primary?.data || {}, null, 2))}</pre>
          </details>
        </section>`);
    }
    openDataModal(`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
        <h3 style="font-weight:bold;">☁️ Cloud data / بيانات السحابة — ${esc(u.email || u.id)}</h3>
        <div style="display:flex;gap:.5rem;">
          <button class="btn btn-secondary btn-sm" id="dmdDownload">⬇ Backup / تنزيل</button>
          <button class="btn btn-secondary btn-sm" id="dmdClose">✕</button>
        </div>
      </div>
      ${parts.join('')}`);
    document.getElementById('dmdClose').addEventListener('click', closeDataModal);
    document.getElementById('dmdDownload').addEventListener('click', () => backupUserData(id));
  } catch (err) {
    showToast('View failed: ' + err.message, 'error');
  }
}

async function backupUserData(id) {
  const u = findGymUser(id);
  const codes = gymCodesFor(u);
  if (!codes) return;
  try {
    const exportCodes = [];
    for (const c of codes) {
      const res = await api(`/api/admin/backup?scope=code&code=${encodeURIComponent(c)}`);
      exportCodes.push({ code: res.code, gyms: res.gyms || [] });
    }
    downloadJson(`gymos-backup-${safeName(u.email || u.id)}-${fileStamp()}.json`, {
      app: 'GymOS', kind: 'user-backup', version: 1,
      user: { id: u.id, email: u.email, name: u.name },
      exportedAt: Date.now(),
      codes: exportCodes,
    });
    showToast('Backup downloaded / تم تنزيل النسخة الاحتياطية', 'success');
  } catch (err) {
    showToast('Backup failed: ' + err.message, 'error');
  }
}

async function restoreUserData(id) {
  const u = findGymUser(id);
  const codes = gymCodesFor(u);
  if (!codes) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch {
      showToast('Invalid JSON file / ملف JSON غير صالح', 'error'); return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      showToast('Unsupported file shape / شكل الملف غير مدعوم', 'error'); return;
    }
    // Accept either our own export ({ codes: [...] }) or a raw gym-data object.
    let targetCode = codes[0];
    let data = null;
    if (Array.isArray(parsed.codes)) {
      const entry = parsed.codes.find(e => codes.includes(e?.code?.code)) || parsed.codes[0];
      targetCode = entry?.code?.code || targetCode;
      const rows = entry.gyms || [];
      data = (rows.find(g => g.device_id === '') || rows[0])?.data || null;
    } else {
      data = parsed;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || (data.members != null && !Array.isArray(data.members))) {
      showToast('No gym data inside this file / لا توجد بيانات داخل الملف', 'error'); return;
    }
    const newCount = Array.isArray(data.members) ? data.members.length : 0;

    // Show BOTH sides in the confirmation, and keep the server's current copy
    // around for the pre-restore snapshot.
    let current = null;
    try {
      const res = await api(`/api/admin/backup?scope=code&code=${encodeURIComponent(targetCode)}`);
      const rows = res.gyms || [];
      current = (rows.find(g => g.device_id === '') || rows[0])?.data ?? null;
    } catch { /* offline — the warning below still stands */ }
    const curCount = Array.isArray(current?.members) ? current.members.length : 0;

    const confirmed = await showConfirm({
      title: 'Restore cloud data / استعادة بيانات السحابة',
      message: `سيتم استبدال بيانات «${targetCode}» في السحابة: ${curCount} عضو حاليًا ← ${newCount} عضو من الملف. سيُنزَّل نسخة من البيانات الحالية قبل الاستبدال، ولن يُحذف أي شيء آخر. / Replace now?`,
      icon: '⬆️',
      iconColor: '#ff9800',
      okText: 'Restore / استعادة',
      okClass: 'btn-warning',
      cancelText: 'لا، إلغاء / No, cancel',
    });
    if (!confirmed) return; // زر «لا» لا يمسّ أي بيانات أبداً

    loading = true;
    try {
      // 1) snapshot of what is about to be replaced — saved locally, always
      if (current) {
        downloadJson(`gymos-pre-restore-${safeName(targetCode)}-${fileStamp()}.json`, {
          app: 'GymOS', kind: 'pre-restore-snapshot',
          code: targetCode, savedAt: Date.now(), data: current,
        });
      }
      // 2) then the actual replace
      await api('/api/admin/backup', { method: 'PUT', body: JSON.stringify({ code: targetCode, data }) });
      showToast('Restored / تمت الاستعادة بنجاح', 'success');
      loading = false;
      await loadUsers();
    } catch (err) {
      showToast('Restore failed: ' + err.message, 'error');
    } finally {
      loading = false;
    }
  });
  document.body.appendChild(input);
  input.click();
}

// ---------- Row Actions: Suspend / Activate / Edit ----------
elements.usersTableBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || loading) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === 'edit') {
    editUser(id);
    return;
  }

  // Phase C cloud actions — each explains itself and returns; none of them
  // falls through to the suspend/activate confirmation below.
  if (action === 'viewdata') { await viewUserData(id); return; }
  if (action === 'backup') { await backupUserData(id); return; }
  if (action === 'restore') { await restoreUserData(id); return; }

  // Email the user a branded password-reset link (GoTrue recovery via SMTP).
  if (action === 'send-reset') {
    if (IS_DEMO) { showToast('Demo mode — no email sent / وضع التجربة — لا إيميل', 'error'); return; }
    const email = btn.dataset.email || '';
    if (!email) { showToast('No email on this account / لا يوجد بريد لهذا الحساب', 'error'); return; }
    const confirmedReset = await showConfirm({
      title: 'Send Reset Email / إرسال رابط كلمة السر',
      message: `A password-reset link will be emailed to ${email}. / سيتم إرسال رابط إعادة تعيين كلمة السر إلى ${email}.`,
      icon: '🔑',
      iconColor: '#CCFF00',
      okText: 'Send / إرسال',
      okClass: 'btn-success',
      cancelText: 'Cancel / إلغاء',
    });
    if (!confirmedReset) return;
    try {
      await api('/api/users/send-reset', { method: 'POST', body: JSON.stringify({ email }) });
      showToast('✉️ Reset link sent / تم إرسال الرابط إلى بريد المستخدم', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to send reset email: ' + err.message, 'error');
    }
    return;
  }

  const isSuspend = action === 'suspend';
  const confirmed = await showConfirm({
    title: isSuspend ? 'Suspend User / تعليق المستخدم' : 'Activate User / تفعيل المستخدم',
    message: isSuspend
      ? 'This will suspend the user\'s access. They won\'t be able to use the app until reactivated. / سيؤدي هذا إلى تعليق وصول المستخدم. لن يتمكن من استخدام التطبيق حتى يتم إعادة تفعيله.'
      : 'This will activate the user\'s account and restore their access. / سيؤدي هذا إلى تفعيل حساب المستخدم واستعادة وصوله.',
    icon: isSuspend ? '⏸️' : '▶️',
    iconColor: isSuspend ? '#ff9800' : '#25D366',
    okText: isSuspend ? 'Suspend / تعليق' : 'Activate / تفعيل',
    okClass: isSuspend ? 'btn-warning' : 'btn-success',
    cancelText: 'Cancel / إلغاء',
  });

  if (!confirmed) return;

  loading = true;
  let updated = false;
  try {
    if (IS_DEMO) {
      await demoUpdateUser(id, { status: isSuspend ? 'suspended' : 'active' });
      updated = true;
    } else {
      await api('/api/users/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ suspend: isSuspend }),
      });
      updated = true;
    }
  } catch (err) {
    console.error(err);
    showToast('Action failed: ' + err.message, 'error');
  }
  // Release the flag BEFORE refreshing: loadUsers() early-returns while
  // loading is true, which silently left the table stale after every
  // suspend/activate until the admin hit Refresh by hand.
  loading = false;
  if (updated) {
    await loadUsers();
    showToast(isSuspend ? 'User suspended / تم تعليق المستخدم' : 'User activated / تم تفعيل المستخدم', 'success');
  }
});

// ---------- Filters / Refresh ----------
let searchDebounce = null;
elements.searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    usersCursor = null;
    usersHasMore = false;
    loadUsers(false);
  }, 300);
});
elements.statusFilter.addEventListener('change', () => {
  usersCursor = null;
  usersHasMore = false;
  loadUsers(false);
});
elements.refreshBtn.addEventListener('click', () => {
  usersCursor = null;
  usersHasMore = false;
  loadUsers(false);
});

// Load more users on scroll (infinite scroll)
let scrollLoading = false;
window.addEventListener('scroll', () => {
  if (scrollLoading || !usersHasMore || loading) return;
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = document.documentElement.clientHeight;
  if (scrollTop + clientHeight >= scrollHeight - 200) {
    scrollLoading = true;
    loadUsers(true).finally(() => { scrollLoading = false; });
  }
});

// ============================================================
// ACTIVATION CODES
// ============================================================

const CODE_PAGE_SIZE = 50;

// Load activation codes
async function loadCodes() {
  let rows = [];
  try {
    if (IS_DEMO) {
      rows = demoCodesAll();
    } else {
      const data = await api('/api/codes?limit=200');
      rows = Array.isArray(data) ? data : (data.data || []);
    }
  } catch (err) {
    elements.codeListBody.innerHTML = `<tr><td colspan="7" style="color: var(--danger);">${esc(err.message || 'Could not load codes')}</td></tr>`;
    return;
  }

  // Apply filters
  const search = elements.codeSearchInput.value.trim().toUpperCase();
  const status = elements.codeStatusFilter.value;

  if (search) {
    rows = rows.filter(c => c.code.toUpperCase().includes(search) || (c.owner || '').toUpperCase().includes(search));
  }
  if (status !== 'all') {
    if (status === 'ready') rows = rows.filter(c => !c.used && !c.revoked);
    else if (status === 'used') rows = rows.filter(c => c.used && !c.revoked);
    else if (status === 'revoked') rows = rows.filter(c => c.revoked);
  }

  // Pagination
  const start = 0;
  const end = CODE_PAGE_SIZE;
  const pageRows = rows.slice(start, end);
  const hasMore = rows.length > end;

  elements.codeCountBadge.textContent = rows.length;

  if (!pageRows.length) {
    elements.codeListBody.innerHTML = '<tr><td colspan="7" class="text-center py-4" style="color: var(--text-muted);">No codes found / لا توجد أكواد</td></tr>';
    elements.codeLoadMoreWrap.classList.add('hidden');
    return;
  }

  elements.codeListBody.innerHTML = pageRows.map(c => {
    const isUsed = c.used;
    const isRevoked = c.revoked;
    let statusHtml, statusClass;
    if (isRevoked) {
      statusHtml = '🚫 Revoked / ملغي';
      statusClass = 'badge-danger';
    } else if (isUsed) {
      statusHtml = '✅ Used / مفعّل';
      statusClass = 'badge-success';
    } else {
      statusHtml = '✅ Ready / جاهز';
      statusClass = 'badge-success';
    }

    const owner = c.owner ? esc(c.owner) : '—';
    const deviceCount = Array.isArray(c.devices) ? c.devices.length : 0;
    const deviceLimit = c.device_limit || 3;
    const expires = c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : (c.tier === 'lifetime' ? '♾️ Lifetime' : '—');

    return `
      <tr class="hover:bg-[#171717]/50 transition-colors">
        <td class="py-2 px-2 font-mono" style="color: var(--accent);">${esc(c.code)}</td>
        <td class="py-2 px-2">${esc(TIER_LABEL[c.tier] || c.tier)}</td>
        <td class="py-2 px-2">${owner}</td>
        <td class="py-2 px-2">${deviceCount} / ${deviceLimit}</td>
        <td class="py-2 px-2">${esc(expires)}</td>
        <td class="py-2 px-2"><span class="badge ${statusClass}">${esc(statusHtml)}</span></td>
        <td class="py-2 px-2 text-right">
          <div class="flex justify-end gap-1">
            ${!isRevoked ? `
              <button class="btn btn-danger btn-sm" data-action="revoke" data-code="${escAttr(c.code)}">Revoke / إلغاء</button>
            ` : `
              <button class="btn btn-success btn-sm" data-action="unrevoke" data-code="${escAttr(c.code)}">Restore / استعادة</button>
            `}
            <button class="btn btn-secondary btn-sm" data-action="reset-pw" data-code="${escAttr(c.code)}">Reset PW</button>
            <button class="btn btn-secondary btn-sm" data-action="copy" data-code="${escAttr(c.code)}">Copy</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  elements.codeLoadMoreWrap.classList.toggle('hidden', !hasMore);
}

// Code actions
elements.codeListBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const code = btn.dataset.code;

  if (action === 'copy') {
    await navigator.clipboard.writeText(code);
    showToast('Code copied / تم نسخ الكود', 'success');
    return;
  }

  if (action === 'reset-pw') {
    await resetCodePassword(code);
    return;
  }

  const isRevoke = action === 'revoke';
  const confirmed = await showConfirm({
    title: isRevoke ? 'Revoke Code / إلغاء الكود' : 'Restore Code / استعادة الكود',
    message: isRevoke
      ? `This will revoke activation code ${code}. The user will lose access until a new code is issued. / سيؤدي هذا إلى إلغاء كود التفعيل ${code}. سيفقد المستخدم الوصول حتى يتم إصدار كود جديد.`
      : `This will restore activation code ${code}. The user will regain access. / سيؤدي هذا إلى استعادة كود التفعيل ${code}. سيستعيد المستخدم الوصول.`,
    icon: isRevoke ? '🚫' : '♻️',
    iconColor: isRevoke ? '#ff3366' : '#25D366',
    okText: isRevoke ? 'Revoke / إلغاء' : 'Restore / استعادة',
    okClass: isRevoke ? 'btn-danger' : 'btn-success',
    cancelText: 'Cancel / إلغاء',
  });

  if (!confirmed) return;

  btn.disabled = true;
  try {
    if (IS_DEMO) {
      const list = demoCodesAll();
      const item = list.find(c => c.code === code);
      if (item) {
        item.revoked = isRevoke;
        localStorage.setItem('dp_demo_codes', JSON.stringify(list));
      }
    } else {
      await api('/api/codes/' + encodeURIComponent(code) + '/revoke', {
        method: 'PATCH',
        body: JSON.stringify({ revoked: isRevoke }),
      });
    }
    await loadCodes();
    showToast(isRevoke ? 'Code revoked / تم إلغاء الكود' : 'Code restored / تم استعادة الكود', 'success');
  } catch (err) {
    console.error(err);
    showToast('Action failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// Toggle codes visibility
elements.toggleCodesBtn.addEventListener('click', async () => {
  const show = elements.codeListWrap.classList.contains('hidden');
  elements.codeListWrap.classList.toggle('hidden', !show);
  elements.codesToggleIcon.style.transform = show ? 'rotate(180deg)' : 'rotate(0deg)';
  elements.codesToggleText.textContent = show ? 'Hide / إخفاء' : 'Show / عرض';
  if (show) await loadCodes();
});

// Filters for codes
elements.codeSearchInput.addEventListener('input', loadCodes);
elements.codeStatusFilter.addEventListener('change', loadCodes);

// Create code modal
elements.addCodeBtn.addEventListener('click', () => {
  elements.codeForm.reset();
  elements.codeModalMsg.textContent = '';
  elements.codeResult.classList.add('hidden');
  elements.codeCustom.value = '';
  elements.codeTier.value = 'monthly';
  elements.codeDays.value = 60;
  elements.codeDeviceLimit.value = 3;
  elements.codeOwner.value = '';
  elements.codeNote.value = '';
  elements.codeModal.classList.remove('hidden');
});

// Create code form submit
elements.codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;

  const custom = elements.codeCustom.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const tier = elements.codeTier.value;
  const daysRaw = parseInt(elements.codeDays.value) || 0;
  const days = daysRaw > 0 ? daysRaw : tier === 'lifetime' ? 0 : tier === 'yearly' ? 365 : 30;
  const deviceLimit = parseInt(elements.codeDeviceLimit.value) || 3;
  const owner = elements.codeOwner.value.trim().toLowerCase();
  const note = elements.codeNote.value.trim();

  loading = true;
  elements.codeModalMsg.textContent = '';
  elements.submitCodeBtn.disabled = true;

  try {
    let result;
    if (IS_DEMO) {
      const list = demoCodesAll();
      const code = custom || (() => {
        const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let c;
        do { c = Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join(''); }
        while (list.some(x => x.code === c));
        return c;
      })();
      if (list.some(x => x.code === code)) throw new Error('Code already exists / الكود موجود مسبقاً');

      const item = {
        id: code, code, tier, days,
        owner, note,
        used: false, revoked: false,
        createdAt: Date.now(),
        data_enabled: true, sync_enabled: true,
        device_limit: deviceLimit,
        devices: [],
      };
      list.unshift(item);
      localStorage.setItem('dp_demo_codes', JSON.stringify(list));
      result = { code, ...item };
    } else {
      result = await api('/api/codes', {
        method: 'POST',
        body: JSON.stringify({ custom: custom || '', tier, days, device_limit: deviceLimit, owner, note }),
      });
    }

    // Show result with copy + WhatsApp
    elements.codeResultValue.textContent = result.code;
    elements.codeWaLink.href = `https://wa.me/?text=${encodeURIComponent('Your activation code: ' + result.code)}`;
    elements.codeResult.classList.remove('hidden');
    elements.codeModalMsg.textContent = 'Code created successfully! / تم إنشاء الكود بنجاح';
    elements.codeModalMsg.style.color = 'var(--accent)';
    elements.codeForm.reset();
    await loadCodes();
    showToast('Code created successfully / تم إنشاء الكود بنجاح', 'success');
  } catch (err) {
    console.error(err);
    elements.codeModalMsg.textContent = err.message || 'Failed to create code';
    elements.codeModalMsg.style.color = 'var(--danger)';
  } finally {
    loading = false;
    elements.submitCodeBtn.disabled = false;
  }
});

// Copy code result
elements.codeCopyBtn.addEventListener('click', async () => {
  const code = elements.codeResultValue.textContent;
  await navigator.clipboard.writeText(code);
  showToast('Code copied / تم نسخ الكود', 'success');
});

// Reset code password
async function resetCodePassword(code) {
  const confirmed = await showConfirm({
    title: 'Reset Password / إعادة تعيين كلمة المرور',
    message: `This will generate a new temporary password for code ${code}. The old password will no longer work. / سيؤدي هذا إلى إنشاء كلمة مرور مؤقتة جديدة للكود ${code}. لن تعمل كلمة المرور القديمة بعد الآن.`,
    icon: '🔐',
    iconColor: '#ff9800',
    okText: 'Reset / إعادة تعيين',
    okClass: 'btn-warning',
    cancelText: 'Cancel / إلغاء',
  });

  if (!confirmed) return;

  try {
    let tempPassword;
    if (IS_DEMO) {
      const list = demoCodesAll();
      const item = list.find(c => c.code === code);
      if (!item) throw new Error('Code not found');
      const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      tempPassword = Array.from({ length: 12 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
      item.passHash = 'demo';
      item.plainPassword = tempPassword;
      localStorage.setItem('dp_demo_codes', JSON.stringify(list));
    } else {
      const res = await api('/api/codes/' + encodeURIComponent(code) + '/reset-password', { method: 'PATCH' });
      tempPassword = res.tempPassword;
    }
    elements.pwResultValue.textContent = tempPassword;
    elements.pwModal.classList.remove('hidden');
    showToast('Temporary password generated / تم إنشاء كلمة مرور مؤقتة', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to reset password: ' + err.message, 'error');
  }
}

elements.pwCopyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(elements.pwResultValue.textContent);
  showToast('Password copied / تم نسخ كلمة المرور', 'success');
});

// ============================================================
// COUPONS
// ============================================================

async function apiListCoupons() {
  if (IS_DEMO) return localCoupons();
  const r = await api('/api/coupons?limit=200');
  return Array.isArray(r) ? r : (r.data || []);
}

async function apiDeleteCoupon(code) {
  if (IS_DEMO) {
    saveLocalCoupons(localCoupons().filter(c => c.code.toUpperCase() !== code.toUpperCase()));
    return;
  }
  await api('/api/coupons/' + encodeURIComponent(code), { method: 'DELETE' });
}

async function apiCreateCoupon(code, kind, value, description) {
  if (IS_DEMO) {
    const list = localCoupons();
    if (list.some(c => c.code.toUpperCase() === code.toUpperCase())) throw new Error('Coupon code already exists / رمز الكوبون موجود مسبقاً');
    const rec = { code, kind, value, description, used: false, createdAt: Date.now() };
    saveLocalCoupons([rec, ...list]);
    return rec;
  }
  return api('/api/coupons', { method: 'POST', body: JSON.stringify({ code, kind, value, description }) });
}

async function apiPeekCoupon(code) {
  if (IS_DEMO) {
    const c = localCoupons().find(x => x.code.toUpperCase() === code.toUpperCase());
    if (!c) throw new Error('Invalid coupon / كوبون غير صحيح');
    if (c.used) throw new Error('Coupon already used / الكوبون مستخدم بالفعل');
    return { coupon: c, tier: couponTierOf(c.kind), days: couponDaysOf(c.kind) };
  }
  return api('/api/coupons/' + encodeURIComponent(code));
}

async function apiRedeemCoupon(code, userId) {
  if (IS_DEMO) {
    const list = localCoupons();
    const i = list.findIndex(x => x.code.toUpperCase() === code.toUpperCase());
    if (i === -1) throw new Error('Invalid coupon / كوبون غير صحيح');
    if (list[i].used) throw new Error('Coupon already used / الكوبون مستخدم بالفعل');
    list[i].used = true;
    list[i].usedAt = Date.now();
    list[i].usedBy = userId || '';
    saveLocalCoupons(list);
    return { ok: true };
  }
  return api('/api/coupons/redeem', { method: 'POST', body: JSON.stringify({ code, userId: userId || '' }) });
}

async function apiReleaseCoupon(code, userId) {
  if (IS_DEMO) {
    const list = localCoupons();
    const i = list.findIndex(x => x.code.toUpperCase() === code.toUpperCase());
    if (i !== -1 && list[i].usedBy === userId) {
      list[i].used = false;
      list[i].usedBy = '';
      list[i].usedAt = null;
      saveLocalCoupons(list);
    }
    return;
  }
  await api('/api/coupons/release', { method: 'POST', body: JSON.stringify({ code, userId }) });
}

// Toggle coupons visibility
elements.toggleCouponsBtn.addEventListener('click', async () => {
  const show = elements.couponListWrap.classList.contains('hidden');
  elements.couponListWrap.classList.toggle('hidden', !show);
  elements.couponsToggleIcon.style.transform = show ? 'rotate(180deg)' : 'rotate(0deg)';
  elements.couponsToggleText.textContent = show ? 'Hide / إخفاء' : 'Show / عرض';
  if (show) await loadCoupons();
});

// Load coupons
async function loadCoupons() {
  let rows = [];
  try {
    rows = await apiListCoupons();
  } catch (err) {
    elements.couponListBody.innerHTML = '<tr><td colspan="5" style="color: var(--danger);">' + esc(err.message || 'Could not load coupons') + '</td></tr>';
    return;
  }

  if (!rows.length) {
    elements.couponListBody.innerHTML = '<tr><td colspan="5" class="text-center py-4" style="color: var(--text-muted);">No coupons yet / لا توجد كوبونات</td></tr>';
    return;
  }

  elements.couponListBody.innerHTML = rows.map((c) => `
    <tr style="border-top:1px solid #2a2a2a;">
      <td class="py-2 px-2" style="font-family:monospace;">${esc(c.code)}</td>
      <td class="py-2 px-2">${esc(KIND_LABEL[c.kind] || c.kind)}</td>
      <td class="py-2 px-2">
        <span class="badge ${c.used ? 'badge-danger' : 'badge-success'}">
          ${c.used ? '📦 Used / مستخدم' : '✅ Unused / متاح'}
        </span>
      </td>
      <td class="py-2 px-2" style="color: var(--text-muted);">${esc(c.usedBy || '—')}</td>
      <td class="py-2 px-2 text-right">
        <button class="btn btn-danger btn-sm" data-del-coupon="${escAttr(c.code)}">Delete / حذف</button>
      </td>
    </tr>`).join('');
}

// Delete coupon
elements.couponListBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-del-coupon]');
  if (!btn) return;

  const code = btn.dataset.delCoupon;
  const confirmed = await showConfirm({
    title: 'Delete Coupon / حذف الكوبون',
    message: `This will permanently delete coupon ${code}. This action cannot be undone. / سيؤدي هذا إلى حذف الكوبون ${code} بشكل دائم. لا يمكن التراجع عن هذا الإجراء.`,
    icon: '🗑️',
    iconColor: '#ff3366',
    okText: 'Delete / حذف',
    okClass: 'btn-danger',
    cancelText: 'Cancel / إلغاء',
  });

  if (!confirmed) return;

  btn.disabled = true;
  try {
    await apiDeleteCoupon(code);
    await loadCoupons();
    showToast('Coupon deleted / تم حذف الكوبون', 'success');
  } catch (err) {
    btn.disabled = false;
    showToast('Delete failed: ' + err.message, 'error');
  }
});

// Create coupon modal
elements.addCouponBtn.addEventListener('click', () => {
  elements.couponModal.classList.remove('hidden');
  elements.couponForm.reset();
  elements.couponModalMsg.textContent = '';
});

// Create coupon form
elements.couponForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;

  const code = elements.couponCodeInput.value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
  const kind = elements.couponType.value;
  const value = parseInt(elements.couponValue.value) || 0;

  if (!code) {
    elements.couponModalMsg.textContent = 'Enter coupon code / أدخل رمز الكوبون';
    elements.couponModalMsg.style.color = 'var(--danger)';
    return;
  }
  if (kind === 'percent' && value < 1) {
    elements.couponModalMsg.textContent = 'Percentage must be 1-100 / النسبة يجب أن تكون 1-100';
    elements.couponModalMsg.style.color = 'var(--danger)';
    return;
  }

  loading = true;
  elements.couponModalMsg.textContent = 'Creating... / جارٍ الإنشاء';
  elements.couponModalMsg.style.color = 'var(--text-muted)';
  elements.submitCouponBtn.disabled = true;

  try {
    await apiCreateCoupon(code, kind, value, '');
    elements.couponModalMsg.textContent = 'Coupon created / تم إنشاء الكوبون';
    elements.couponModalMsg.style.color = 'var(--accent)';
    elements.couponForm.reset();
    await loadCoupons();
    elements.couponModal.classList.add('hidden');
    showToast('Coupon created successfully / تم إنشاء الكوبون بنجاح', 'success');
  } catch (err) {
    console.error(err);
    elements.couponModalMsg.textContent = err.message || 'Failed to create coupon';
    elements.couponModalMsg.style.color = 'var(--danger)';
  } finally {
    loading = false;
    elements.submitCouponBtn.disabled = false;
  }
});

// Apply coupon to user form
elements.applyCouponBtn.addEventListener('click', async () => {
  const code = elements.couponCode.value.trim().toUpperCase();
  if (!code) {
    elements.couponResult.textContent = 'Enter coupon code / أدخل رمز الكوبون';
    elements.couponResult.style.color = 'var(--danger)';
    return;
  }

  elements.applyCouponBtn.disabled = true;
  elements.couponResult.textContent = 'Checking… / جارٍ التحقق';
  elements.couponResult.style.color = 'var(--text-muted)';

  try {
    const r = await apiPeekCoupon(code);
    pendingCoupon = code;
    if (r.tier) {
      elements.userSubType.value = r.tier;
      elements.userDays.value = r.days;
    }
    elements.couponResult.textContent = 'Coupon applied — save to confirm / تم تطبيق الكوبون — احفظ للتأكيد';
    elements.couponResult.style.color = 'var(--accent)';
    elements.couponCode.value = '';
    refreshPreview();
    showToast('Coupon applied successfully / تم تطبيق الكوبون بنجاح', 'success');
  } catch (err) {
    pendingCoupon = null;
    elements.couponResult.textContent = (err.message || 'Invalid coupon') + ' / كوبون غير صحيح';
    elements.couponResult.style.color = 'var(--danger)';
    showToast('Invalid coupon / كوبون غير صحيح', 'error');
  } finally {
    elements.applyCouponBtn.disabled = false;
  }
});

// ============================================================
// INITIALIZATION
// ============================================================

// Expose functions for inline onclick handlers
window._openCreate = openCreateUser;
window._editUser = editUser;
window._setDays = (d) => { elements.userDays.value = d; refreshPreview(); };
window._setCodeDays = (d) => { elements.codeDays.value = d; };
// The modal markup uses inline onclick="closeXxxModal()" — without these
// exports every ✕ button threw a ReferenceError and modals never closed.
window.closeUserModal = closeUserModal;
window.closeCodeModal = closeCodeModal;
window.closePwModal = closePwModal;
window.closeCouponModal = closeCouponModal;

// Initial load
loadUsers();

/* ============================================================
   ADMIN CONTROL CENTER V2 — frontend-only redesign module.
   Lives in the existing admin-panel.js (precached) + admin.html.
   No new endpoints, no duplicate systems. Metrics that the
   existing backend cannot produce are shown as NOT AVAILABLE.
   ============================================================ */

// ---------- V2 helpers ----------
function fmtDay(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtAgo(ms) {
  if (!ms) return '—';
  const d = Math.max(0, Date.now() - ms);
  const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dd = Math.floor(d / 86400000);
  const short = dd >= 1 ? dd + 'd' : h >= 1 ? h + 'h' : m >= 1 ? m + 'm' : 'now';
  return `<span title="${escAttr(new Date(ms).toLocaleString('en-GB'))}">${esc(short)}</span>`;
}
function v2Parse(v) { try { return typeof v === 'string' ? JSON.parse(v) : (v || {}); } catch { return {}; } }
function tlItem(whenMs, html, tone) {
  return `<div class="tl-item ${tone ? 't-' + tone : ''}"><div class="tl-when">${fmtAgo(whenMs)} · ${esc(fmtDay(whenMs))}</div><div class="tl-what">${html}</div></div>`;
}

// ---------- V2 charts (pure HTML/CSS — no dependencies) ----------
function v2Bars(series, color) {
  const max = Math.max(1, ...series.map(s => s.value));
  if (!series.length || max === 0) return '<div class="empty-state"><span class="icon">📉</span><p class="empty-state-text">No recorded data yet</p></div>';
  const bars = series.map(s => `
    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; min-width:0;">
      <div title="${escAttr(s.label + ': ' + s.value)}" style="width:70%; max-width:34px; height:${Math.round(6 + (s.value / max) * 88)}px; border-radius:6px 6px 3px 3px; background:${color}; opacity:${s.value ? 0.9 : 0.25};"></div>
      <div style="font-size:0.58rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">${esc(s.label)}</div>
      <div style="font-size:0.62rem; font-weight:700; color:var(--text);">${s.value}</div>
    </div>`).join('');
  return `<div style="display:flex; align-items:flex-end; gap:6px; height:150px; padding-top:4px;">${bars}</div>`;
}
function v2Donut(parts) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return '<div class="empty-state"><span class="icon">🫧</span><p class="empty-state-text">No accounts yet</p></div>';
  let acc = 0;
  const stops = parts.filter(p => p.value > 0).map(p => {
    const from = (acc / total) * 360; acc += p.value;
    const to = (acc / total) * 360;
    return `${p.color} ${from}deg ${to}deg`;
  }).join(', ');
  const legend = parts.map(p => `<span><i style="background:${p.color}"></i>${esc(p.label)} <b>${p.value}</b></span>`).join('');
  return `<div style="display:flex; align-items:center; gap:1.2rem; flex-wrap:wrap;">
    <div style="width:118px; height:118px; border-radius:50%; flex-shrink:0; background:conic-gradient(${stops || 'var(--border) 0deg 360deg)'}; display:flex; align-items:center; justify-content:center;">
      <div style="width:74px; height:74px; border-radius:50%; background:var(--bg-card); display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <div class="font-headline" style="font-size:1.3rem; font-weight:700;">${total}</div>
        <div style="font-size:0.6rem; color:var(--text-muted); letter-spacing:.1em;">TOTAL</div>
      </div>
    </div>
    <div class="legend" style="flex-direction:column; align-items:flex-start; gap:0.4rem;">${legend}</div>
  </div>`;
}

// ---------- V2 fetch caches (60s) ----------
const V2_CACHE = { errors: null, errorsAt: 0, audit: null, auditAt: 0, codes: null, codesAt: 0, stats: null, statsAt: 0 };
async function v2FetchErrors(force) {
  if (IS_DEMO) return [];
  if (!force && V2_CACHE.errors && Date.now() - V2_CACHE.errorsAt < 60000) return V2_CACHE.errors;
  const r = await api('/api/admin/errors?limit=200');
  V2_CACHE.errors = (r && r.data) || []; V2_CACHE.errorsAt = Date.now();
  return V2_CACHE.errors;
}
async function v2FetchAudit(force) {
  if (IS_DEMO) return [];
  if (!force && V2_CACHE.audit && Date.now() - V2_CACHE.auditAt < 60000) return V2_CACHE.audit;
  const r = await api('/api/admin/audit-log?limit=200');
  V2_CACHE.audit = (r && r.data) || []; V2_CACHE.auditAt = Date.now();
  return V2_CACHE.audit;
}
async function v2FetchCodes(force) {
  if (IS_DEMO) return [];
  if (!force && V2_CACHE.codes && Date.now() - V2_CACHE.codesAt < 60000) return V2_CACHE.codes;
  const r = await api('/api/codes?limit=200');
  V2_CACHE.codes = Array.isArray(r) ? r : ((r && r.data) || []); V2_CACHE.codesAt = Date.now();
  return V2_CACHE.codes;
}
async function v2FetchStats(force) {
  if (IS_DEMO) return [];
  if (!force && V2_CACHE.stats && Date.now() - V2_CACHE.statsAt < 60000) return V2_CACHE.stats;
  const r = await api('/api/admin/backup?scope=stats').catch(() => null);
  V2_CACHE.stats = (r && r.stats) || []; V2_CACHE.statsAt = Date.now();
  return V2_CACHE.stats;
}
async function v2FetchGymForCode(code) {
  if (IS_DEMO || !code) return null;
  const r = await api('/api/admin/backup?scope=code&code=' + encodeURIComponent(code)).catch(() => null);
  if (!r) return null;
  const gyms = Array.isArray(r.gyms) ? r.gyms : (r.gym ? [r.gym] : []);
  return { codeRow: r.code || null, gyms };
}

// ---------- V2 i18n ----------
const V2_I18N = {
  en: {
    'nav.overview': 'Overview', 'nav.users': 'Users & Accounts', 'nav.licenses': 'Subscriptions & Licenses',
    'nav.sync': 'Cloud Sync', 'nav.backups': 'Backups & Recovery', 'nav.activity': 'Sessions & Activity',
    'nav.security': 'Security & Resets', 'nav.audit': 'Errors & Audit Logs', 'nav.versions': 'App Versions', 'nav.settings': 'Admin Settings',
    'shell.console': 'Control Center',
    'act.refresh': 'Refresh', 'act.newUser': 'New user', 'act.newCode': 'New code', 'act.newCoupon': 'Coupon', 'act.logout': 'Logout',
    'ov.title': 'Overview', 'ov.sub': 'Live snapshot from the existing APIs — nothing fabricated',
    'ov.total': 'Total accounts', 'ov.active': 'Active', 'ov.trial': 'Trial', 'ov.expired': 'Expired subscriptions',
    'ov.suspended': 'Suspended', 'ov.syncFail': 'Logged errors', 'ov.syncFailNote': 'unresolved entries in error_log',
    'ov.online': 'Confirmed online now', 'ov.onlineNote': 'Requires last_seen heartbeat on codes table (extension point identified)',
    'ov.backups': 'Successful backups', 'ov.backupsNote': 'Drive backup is down (503) — see Backups center',
    'ov.growth': 'New registrations — last 8 weeks', 'ov.distribution': 'Account status distribution',
    'ov.recentAdmin': 'Recent administrative activity', 'ov.viewAll': 'View all', 'ov.alerts': 'Security & sync alerts',
    'us.title': 'Users & Accounts', 'us.sub': 'Click any row to open the Account Detail Center',
    'li.title': 'Subscriptions & Licenses', 'li.sub': 'Activation codes grant cloud access · coupons grant free days',
    'sy.title': 'Cloud Sync Center', 'sy.sub': 'Server-persisted sync state per account — traced from JWT to database',
    'sy.authFail': 'Auth-related failures', 'sy.authFailNote': 'error_log entries with 401/403/FORBIDDEN',
    'sy.totalErr': 'Total logged errors', 'sy.lastOk': 'Most recent successful sync', 'sy.perAccount': 'Sync status per account', 'sy.jwtNote': 'JWT sync-fix status',
    'th.account': 'Account', 'th.code': 'Code', 'th.members': 'Members', 'th.lastSync': 'Last successful sync', 'th.health': 'Health',
    'th.actions': 'Safe recovery', 'th.when': 'When', 'th.error': 'Error', 'th.user': 'User', 'th.status': 'Status',
    'bk.title': 'Backups & Recovery', 'bk.sub': 'Honest status only — an upload is not proof of recoverability',
    'bk.verified': 'Restore-verified backups', 'bk.untested': 'UNVERIFIED', 'bk.untestedNote': 'No isolated restore test has been run yet in this environment',
    'bk.drive': 'Google Drive engine', 'bk.driveNote': 'Boot SyntaxError fixed locally — deploy pending approval',
    'bk.adminJson': 'Admin JSON snapshots', 'bk.available': 'AVAILABLE', 'bk.adminJsonNote': 'Per-account download + snapshot-first restore below', 'bk.perAccount': 'Recovery posture per account',
    'ac.title': 'Sessions & Activity', 'ac.sub': 'Only recorded events are shown — presence tracking is not implemented server-side yet',
    'ac.lastLogin': 'Latest user login (any account)', 'ac.active7': 'Accounts seen in the metadata window',
    'ac.active7Note': 'Derived from last_sign_in_at — not a live presence signal', 'ac.presence': 'Live presence (online now)',
    'ac.presenceNote': 'Needs last_seen heartbeat — extension point: codes table + codeFlags()', 'ac.loginsChart': 'Logins per week — last 8 weeks (from account metadata)',
    'se.title': 'Security & Password Resets', 'se.sub': 'No plaintext passwords are ever displayed or stored',
    'se.session': 'Admin session', 'se.failedAdmin': 'Failed admin logins', 'se.failedAdminNote': 'From the immutable audit table',
    'se.resets': 'Password reset links sent', 'se.rls': 'Database isolation', 'se.rlsVal': 'RLS deny-by-default',
    'se.rlsNote': 'All 7 tables: service-role access only via gymos-api', 'se.recentResets': 'Recent password-reset activity',
    'au.title': 'System Errors & Audit Logs', 'au.sub': 'Existing admin endpoints, now surfaced', 'au.errors': 'Error log', 'au.audit': 'Admin audit trail',
    've.title': 'Application Versions', 've.sub': 'Shipped version vs latest GitHub release',
    've.shipped': 'Shipped app version', 've.latest': 'Latest GitHub release', 've.apk': 'Release assets',
    've.note': 'Version bumps must move all seven files together (build.gradle, package.json, js/config.js, scripts/build.js, sw.js cache, tests, index.html fallback). The in-app updater compares installedVersion() against the latest release tag.',
    'st.title': 'Admin Settings', 'st.sub': 'Console preferences & system pointers', 'st.prefs': 'Console preferences',
    'st.theme': 'Theme', 'st.lang': 'Language', 'st.system': 'System pointers', 'st.auth': 'Auth',
    'st.isolation': 'Isolation', 'st.isolationVal': 'RLS deny-by-default · service-role only',
    'st.danger': 'Danger zone', 'st.dangerVal': 'No destructive controls are exposed by design',
    'dr.overview': 'Overview', 'dr.license': 'License', 'dr.sync': 'Cloud Sync', 'dr.data': 'Customer Data',
    'dr.backup': 'Backups', 'dr.security': 'Security', 'dr.timeline': 'Activity',
  },
  ar: {
    'nav.overview': 'النظرة العامة', 'nav.users': 'المستخدمون والحسابات', 'nav.licenses': 'الاشتراكات والتراخيص',
    'nav.sync': 'المزامنة السحابية', 'nav.backups': 'النسخ الاحتياطي والاستعادة', 'nav.activity': 'الجلسات والنشاط',
    'nav.security': 'الأمان وإعادة التعيين', 'nav.audit': 'الأخطاء وسجل التدقيق', 'nav.versions': 'إصدارات التطبيق', 'nav.settings': 'إعدادات الأدمن',
    'shell.console': 'مركز التحكم',
    'act.refresh': 'تحديث', 'act.newUser': 'مستخدم جديد', 'act.newCode': 'كود تفعيل', 'act.newCoupon': 'كوبون', 'act.logout': 'خروج',
    'ov.title': 'النظرة العامة', 'ov.sub': 'لقطة حيّة من الواجهات الموجودة — بلا أي أرقام مفبركة',
    'ov.total': 'إجمالي الحسابات', 'ov.active': 'نشط', 'ov.trial': 'تجريبي', 'ov.expired': 'اشتراكات منتهية',
    'ov.suspended': 'موقوف', 'ov.syncFail': 'الأخطاء المسجّلة', 'ov.syncFailNote': 'سجلات غير معالجة في error_log',
    'ov.online': 'متصلون الآن (مؤكد)', 'ov.onlineNote': 'يتطلب عمود last_seen بجدول codes (نقطة امتداد محددة)',
    'ov.backups': 'نسخ ناجحة', 'ov.backupsNote': 'نسخ Drive معطّل (503) — راجع مركز النسخ',
    'ov.growth': 'التسجيلات الجديدة — آخر 8 أسابيع', 'ov.distribution': 'توزيع حالات الحسابات',
    'ov.recentAdmin': 'أحدث العمليات الإدارية', 'ov.viewAll': 'عرض الكل', 'ov.alerts': 'تنبيهات الأمان والمزامنة',
    'us.title': 'المستخدمون والحسابات', 'us.sub': 'اضغط أي صف لفتح مركز تفاصيل الحساب',
    'li.title': 'الاشتراكات والتراخيص', 'li.sub': 'أكواد التفعيل تمنح وصولاً سحابياً · الكوبونات تمنح أياماً مجانية',
    'sy.title': 'مركز المزامنة السحابية', 'sy.sub': 'حالة المزامنة لكل حساب — من الـJWT حتى قاعدة البيانات',
    'sy.authFail': 'إخفاقات المصادقة', 'sy.authFailNote': 'سجلات 401/403/FORBIDDEN في error_log',
    'sy.totalErr': 'إجمالي الأخطاء المسجلة', 'sy.lastOk': 'أحدث مزامنة ناجحة', 'sy.perAccount': 'حالة المزامنة لكل حساب', 'sy.jwtNote': 'حالة إصلاح JWT للمزامنة',
    'th.account': 'الحساب', 'th.code': 'الكود', 'th.members': 'الأعضاء', 'th.lastSync': 'آخر مزامنة ناجحة', 'th.health': 'الصحة',
    'th.actions': 'استعادة آمنة', 'th.when': 'متى', 'th.error': 'الخطأ', 'th.user': 'المستخدم', 'th.status': 'الحالة',
    'bk.title': 'النسخ الاحتياطي والاستعادة', 'bk.sub': 'حالة صادقة فقط — نجاح الرفع ليس دليلاً على قابلية الاستعادة',
    'bk.verified': 'نسخ مُتحقق منها بالاستعادة', 'bk.untested': 'غير مُتحقق', 'bk.untestedNote': 'لم يُنفَّذ اختبار استعادة معزول بعد بهذه البيئة',
    'bk.drive': 'محرك Google Drive', 'bk.driveNote': 'الـSyntaxError أُصلح محلياً — النشر بانتظار الموافقة',
    'bk.adminJson': 'لقطات JSON إدارية', 'bk.available': 'متاح', 'bk.adminJsonNote': 'تنزيل لكل حساب + استعادة بلقطة أولية أدناه', 'bk.perAccount': 'وضع الاستعادة لكل حساب',
    'ac.title': 'الجلسات والنشاط', 'ac.sub': 'تُعرض الأحداث المسجلة فقط — لا يوجد تتبع حضور سيرفري بعد',
    'ac.lastLogin': 'آخر دخول مستخدم (أي حساب)', 'ac.active7': 'حسابات ظهرت بنافذة البيانات الوصفية',
    'ac.active7Note': 'مشتق من last_sign_in_at — ليس مؤشر حضور حياً', 'ac.presence': 'الحضور الحيّ (متصل الآن)',
    'ac.presenceNote': 'يتطلب last_seen — نقطة الامتداد: جدول codes + codeFlags()', 'ac.loginsChart': 'الدخول أسبوعياً — آخر 8 أسابيع (من بيانات الحساب)',
    'se.title': 'الأمان وإعادة التعيين', 'se.sub': 'لا تُعرض كلمات المرور نصاً صريحاً ولا تُخزن أبداً',
    'se.session': 'جلسة الأدمن', 'se.failedAdmin': 'دخول أدمن فاشل', 'se.failedAdminNote': 'من جدول التدقيق غير القابل للتعديل',
    'se.resets': 'روابط إعادة تعيين أُرسلت', 'se.rls': 'عزل قاعدة البيانات', 'se.rlsVal': 'RLS رفض افتراضي',
    'se.rlsNote': 'كل الجداول الـ7: وصول service-role فقط عبر gymos-api', 'se.recentResets': 'أحدث نشاط إعادة تعيين',
    'au.title': 'أخطاء النظام وسجل التدقيق', 'au.sub': 'واجهات الأدمن الموجودة — صارت ظاهرة', 'au.errors': 'سجل الأخطاء', 'au.audit': 'سجل تدقيق الأدمن',
    've.title': 'إصدارات التطبيق', 've.sub': 'النسخة المنشورة مقابل آخر إصدار على GitHub',
    've.shipped': 'نسخة التطبيق المنشورة', 've.latest': 'أحدث إصدار GitHub', 've.apk': 'ملفات الإصدار',
    've.note': 'رفع الإصدار لازم يحرّك الملفات السبعة معاً (build.gradle, package.json, js/config.js, scripts/build.js, كاش sw.js, الاختبارات, index.html). المحدّث الذاتي يقارن النسخة المثبتة مع آخر tag.',
    'st.title': 'إعدادات الأدمن', 'st.sub': 'تفضيلات الكونسول ومؤشرات النظام', 'st.prefs': 'تفضيلات الكونسول',
    'st.theme': 'الثيم', 'st.lang': 'اللغة', 'st.system': 'مؤشرات النظام', 'st.auth': 'المصادقة',
    'st.isolation': 'العزل', 'st.isolationVal': 'RLS رفض افتراضي · service-role فقط',
    'st.danger': 'منطقة الخطر', 'st.dangerVal': 'لا توجد عناصر تحكم مدمرة بالتصميم',
    'dr.overview': 'نظرة عامة', 'dr.license': 'الترخيص', 'dr.sync': 'المزامنة', 'dr.data': 'بيانات العملاء',
    'dr.backup': 'النسخ', 'dr.security': 'الأمان', 'dr.timeline': 'النشاط',
  },
};
function v2Lang() { return localStorage.getItem('dp_admin_lang') || 'ar'; }
function applyI18n() {
  const lang = v2Lang();
  const dict = V2_I18N[lang] || V2_I18N.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (dict[k]) el.textContent = dict[k];
  });
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const seg = document.querySelector('#stLangSeg');
  if (seg) seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.langPick === lang));
}
function setLang(lang) {
  localStorage.setItem('dp_admin_lang', lang);
  applyI18n();
  const active = document.querySelector('.v2-view.active');
  if (active) showView(active.id.replace('view-', '')); // re-render with new labels
}

// ---------- V2 theme ----------
function setTheme(t) {
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('dp_admin_theme', t);
  const seg = document.querySelector('#stThemeSeg');
  if (seg) seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.themePick === t));
}

// ---------- V2 router ----------
const V2_LOADERS = {};
function showView(name) {
  const view = document.getElementById('view-' + name);
  if (!view) return;
  document.querySelectorAll('.v2-view').forEach(v => v.classList.remove('active'));
  view.classList.add('active');
  document.querySelectorAll('.v2-nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.body.classList.remove('sidebar-open');
  if (location.hash !== '#view-' + name) history.replaceState(null, '', '#view-' + name);
  if (V2_LOADERS[name]) { try { V2_LOADERS[name](); } catch (e) { console.error('V2 loader failed:', e); } }
}

// ---------- V2: Overview ----------
function weeklyBuckets(field) {
  const weeks = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7 + 1);
    const start = new Date(end.getTime() - 7 * 86400000);
    weeks.push({ start: start.getTime(), end: end.getTime(), label: new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), value: 0 });
  }
  for (const u of allUsers) {
    const t = Number(u[field] || 0);
    if (!t) continue;
    const b = weeks.find(w => t >= w.start && t < w.end + 7 * 86400000);
    if (b) b.value++;
  }
  return weeks;
}
async function refreshOverview() {
  const now = Date.now();
  const suspended = allUsers.filter(u => u.status === 'suspended').length;
  const ovS = document.getElementById('ovSuspended'); if (ovS) ovS.textContent = String(suspended);
  const reg30 = allUsers.filter(u => u.created && u.created > now - 30 * 86400000).length;
  const regNote = document.getElementById('ovRegNote');
  if (regNote) regNote.textContent = '+' + reg30 + ' في آخر 30 يوم / in last 30 days';
  const growthEl = document.getElementById('ovGrowthChart');
  if (growthEl) growthEl.innerHTML = v2Bars(weeklyBuckets('created'), 'var(--accent)');

  const active = allUsers.filter(u => u.status !== 'suspended' && u.subscription !== 'none' && (!u.subEnd || u.subEnd > now)).length;
  const trial = allUsers.filter(u => u.subscription === 'trial' && u.subEnd && u.subEnd > now && u.status !== 'suspended').length;
  const expired = allUsers.filter(u => u.subscription !== 'none' && u.subscription !== 'lifetime' && u.subEnd && u.subEnd <= now).length;
  const lifetime = allUsers.filter(u => u.subscription === 'lifetime' && u.status !== 'suspended').length;
  const none = allUsers.filter(u => u.subscription === 'none' && u.status !== 'suspended').length;
  const donutEl = document.getElementById('ovDonut');
  if (donutEl) donutEl.innerHTML = v2Donut([
    { label: 'Active', value: Math.max(0, active - trial - lifetime), color: 'var(--success)' },
    { label: 'Trial', value: trial, color: 'var(--info)' },
    { label: 'Lifetime', value: lifetime, color: 'var(--accent)' },
    { label: 'Expired', value: expired, color: 'var(--danger)' },
    { label: 'Suspended', value: suspended, color: 'var(--warning)' },
    { label: 'None', value: none, color: 'var(--text-muted)' },
  ]);

  try {
    const errs = await v2FetchErrors();
    const unresolved = errs.filter(e => !e.resolved);
    const sf = document.getElementById('ovSyncFail'); if (sf) sf.textContent = String(unresolved.length);
    const sfn = document.getElementById('ovSyncFailNote'); if (sfn) sfn.textContent = unresolved.length + ' / ' + errs.length + ' unresolved';
    const alertsEl = document.getElementById('ovAlerts');
    if (alertsEl) {
      const topErrs = unresolved.slice(0, 4);
      alertsEl.innerHTML = topErrs.length
        ? topErrs.map(e => tlItem(ts(e.created_at), `<b>${esc(e.error_code || 'ERR')}</b> — ${esc((e.error_message || e.endpoint || '').slice(0, 90))}`, 'red')).join('')
        : '<div class="empty-state"><span class="icon">✅</span><p class="empty-state-text">No unresolved alerts / لا تنبيهات معلقة</p></div>';
    }
  } catch { const sf = document.getElementById('ovSyncFail'); if (sf) sf.textContent = '—'; }

  try {
    const audit = await v2FetchAudit();
    const act = document.getElementById('ovActivity');
    if (act) act.innerHTML = audit.slice(0, 8).map(e => tlItem(ts(e.created_at), `<b>${esc(e.action)}</b> ${e.target_type ? '· ' + esc(e.target_type) + ' ' + esc(shortId(e.target_id)) : ''} <span style="color:var(--text-muted)">— ${esc(e.admin_email || '')}</span>`)).join('');
  } catch { const act = document.getElementById('ovActivity'); if (act) act.innerHTML = '<div class="empty-state"><p class="empty-state-text">Audit log unavailable</p></div>'; }
}

// ---------- V2: Cloud Sync view ----------
function syncHealthOf(lastSyncMs) {
  if (!lastSyncMs) return '<span class="badge badge-neutral">No sync yet</span>';
  const age = Date.now() - lastSyncMs;
  if (age < 7 * 86400000) return '<span class="badge badge-success">Healthy</span>';
  if (age < 30 * 86400000) return '<span class="badge badge-warning">Stale</span>';
  return '<span class="badge badge-danger">Very stale</span>';
}
async function refreshSyncView() {
  const health = document.getElementById('syApiHealth');
  try {
    await api('/api/health');
    if (health) { health.textContent = 'REACHABLE'; health.style.color = 'var(--success)'; }
    const hn = document.getElementById('syApiHealthNote'); if (hn) hn.textContent = 'GET /api/health returned 200';
  } catch (e) {
    if (health) { health.textContent = 'UNREACHABLE'; health.style.color = 'var(--danger)'; }
    const hn = document.getElementById('syApiHealthNote'); if (hn) hn.textContent = String(e.message || e).slice(0, 80);
  }
  try {
    const errs = await v2FetchErrors();
    const authFail = errs.filter(e => /401|403|FORBIDDEN|UNAUTHORIZED|AUTH/i.test(String(e.error_code || '') + ' ' + String(e.endpoint || '')));
    const af = document.getElementById('syAuthFail'); if (af) af.textContent = String(authFail.length);
    const te = document.getElementById('syTotalErr'); if (te) te.textContent = String(errs.length);
  } catch { const af = document.getElementById('syAuthFail'); if (af) af.textContent = '—'; }
  try {
    const stats = await v2FetchStats();
    let maxSync = 0;
    const byOwner = new Map();
    for (const s of stats) {
      const key = String(s.owner || '').toLowerCase();
      if (!byOwner.has(key)) byOwner.set(key, []);
      byOwner.get(key).push(s);
      maxSync = Math.max(maxSync, Number(s.lastSync) || 0);
    }
    const lo = document.getElementById('syLastOk'); if (lo) lo.innerHTML = maxSync ? fmtSync(maxSync) + ' · ' + fmtAgo(maxSync) : '—';
    const body = document.getElementById('syTableBody');
    if (body) {
      body.innerHTML = stats.length ? stats.map(s => {
        const u = allUsers.find(x => String(x.email || '').toLowerCase() === String(s.owner || '').toLowerCase() || (x._gymCodes || []).includes(s.code));
        return `<tr>
          <td>${esc(u ? (u.name || u.email || '—') : (s.owner || '—'))}${u ? `<span class="subline">${esc(u.email || '')}</span>` : ''}</td>
          <td class="mono">${esc(s.code || '—')}</td>
          <td class="text-center font-mono">${Number(s.members) || 0}</td>
          <td>${s.lastSync ? fmtSync(Number(s.lastSync)) + ' <span class="subline">' + fmtAgo(Number(s.lastSync)) + '</span>' : '<span class="opacity-40">—</span>'}</td>
          <td>${syncHealthOf(Number(s.lastSync) || 0)}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="5"><div class="empty-state"><span class="icon">☁️</span><p class="empty-state-text">No cloud sync rows recorded yet</p></div></td></tr>';
    }
  } catch {
    const body = document.getElementById('syTableBody');
    if (body) body.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p class="empty-state-text">Failed to load sync stats</p></div></td></tr>';
  }
}

// ---------- V2: Backups view ----------
async function refreshBackupsView() {
  const drive = document.getElementById('bkDrive');
  try {
    const r = await fetch(API_BASE.replace('/gymos-api', '/gymos-drive-backup') + '/health', { method: 'GET' });
    if (r.ok) { if (drive) { drive.textContent = 'UP'; drive.style.color = 'var(--success)'; } }
    else { if (drive) { drive.textContent = 'DOWN (' + r.status + ')'; drive.style.color = 'var(--danger)'; } }
  } catch { if (drive) { drive.textContent = 'DOWN'; drive.style.color = 'var(--danger)'; } }
  const body = document.getElementById('bkTableBody');
  if (!body) return;
  try {
    const stats = await v2FetchStats();
    if (!stats.length) { body.innerHTML = '<tr><td colspan="5"><div class="empty-state"><span class="icon">☁️</span><p class="empty-state-text">No accounts with cloud data yet</p></div></td></tr>'; return; }
    body.innerHTML = stats.map(s => {
      const u = allUsers.find(x => String(x.email || '').toLowerCase() === String(s.owner || '').toLowerCase() || (x._gymCodes || []).includes(s.code));
      const uid = u ? u.id : '';
      const actions = uid ? `
        <div class="flex gap-1 flex-wrap justify-end">
          <button class="btn btn-secondary btn-sm" data-bk="view" data-id="${escAttr(uid)}">👁</button>
          <button class="btn btn-secondary btn-sm" data-bk="backup" data-id="${escAttr(uid)}">⬇</button>
          <button class="btn btn-secondary btn-sm" data-bk="restore" data-id="${escAttr(uid)}">⬆</button>
        </div>` : '<span class="na-pill">account not on this page</span>';
      return `<tr>
        <td>${esc(u ? (u.name || u.email || '—') : (s.owner || '—'))}${u ? `<span class="subline">${esc(u.email || '')}</span>` : ''}</td>
        <td class="mono">${esc(s.code || '—')}</td>
        <td class="text-center font-mono">${Number(s.members) || 0}</td>
        <td>${s.lastSync ? fmtSync(Number(s.lastSync)) + ' <span class="subline">' + fmtAgo(Number(s.lastSync)) + '</span>' : '<span class="opacity-40">—</span>'}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
  } catch {
    body.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p class="empty-state-text">Failed to load recovery posture</p></div></td></tr>';
  }
}

// ---------- V2: Sessions & Activity view ----------
async function refreshActivityView() {
  const seen = allUsers.filter(u => u.lastSignIn);
  const latest = seen.reduce((m, u) => Math.max(m, u.lastSignIn), 0);
  const ll = document.getElementById('acLastLogin');
  if (ll) ll.innerHTML = latest ? fmtSync(latest) + ' <span class="subline">' + fmtAgo(latest) + '</span>' : '—';
  const a7 = document.getElementById('acActive7');
  if (a7) a7.textContent = String(seen.filter(u => u.lastSignIn > Date.now() - 7 * 86400000).length);
  const chart = document.getElementById('acLoginsChart');
  if (chart) chart.innerHTML = v2Bars(weeklyBuckets('lastSignIn'), 'var(--info)');
}

// ---------- V2: Security view ----------
async function refreshSecurityView() {
  const token = sessionStorage.getItem('dp_admin_token') || '';
  const sess = document.getElementById('seSession');
  const note = document.getElementById('seSessionNote');
  if (sess) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1] || '{}'));
      const exp = payload.exp ? payload.exp * 1000 : 0;
      sess.textContent = payload.admin ? 'HS256 admin JWT' : 'session token';
      if (note) note.textContent = exp ? 'Expires ' + fmtDay(exp) + ' · sessionStorage (per tab)' : 'sessionStorage (per tab)';
    } catch { sess.textContent = 'session token'; if (note) note.textContent = 'sessionStorage (per tab)'; }
  }
  try {
    const audit = await v2FetchAudit();
    const failed = audit.filter(e => e.action === 'login_failed');
    const resets = audit.filter(e => e.action === 'send_reset_email' || e.action === 'reset_password' || /reset/i.test(String(e.action)));
    const fa = document.getElementById('seFailedAdmin'); if (fa) fa.textContent = String(failed.length);
    const rs = document.getElementById('seResets'); if (rs) rs.textContent = String(resets.length);
    const list = document.getElementById('seResetList');
    if (list) {
      list.innerHTML = resets.length
        ? resets.slice(0, 8).map(e => {
            const d = v2Parse(e.details);
            const target = (d && (d.email || d.user_email)) || e.target_id || '';
            return tlItem(ts(e.created_at), `<b>${esc(e.action)}</b> → ${esc(String(target).slice(0, 60))} <span style="color:var(--text-muted)">by ${esc(e.admin_email || '')}</span>`, 'green');
          }).join('')
        : '<div class="empty-state"><span class="icon">📭</span><p class="empty-state-text">No reset activity recorded yet</p></div>';
    }
  } catch { const fa = document.getElementById('seFailedAdmin'); if (fa) fa.textContent = '—'; }
}

// ---------- V2: Errors & Audit view ----------
async function refreshAuditView(force) {
  const errBody = document.getElementById('auErrBody');
  try {
    const errs = await v2FetchErrors(force);
    const cnt = document.getElementById('auErrCount'); if (cnt) cnt.textContent = String(errs.length);
    if (errBody) {
      errBody.innerHTML = errs.length ? errs.map(e => `<tr>
        <td class="text-xs whitespace-nowrap">${fmtDay(ts(e.created_at))} <span class="subline">${fmtAgo(ts(e.created_at))}</span></td>
        <td class="mono text-xs">${esc((e.method || '') + ' ' + (e.endpoint || '')).slice(0, 42)}</td>
        <td class="mono text-xs" style="color:var(--danger);">${esc(e.error_code || '—')}</td>
        <td class="text-xs" style="max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escAttr(String(e.error_message || ''))}">${esc(String(e.error_message || '—').slice(0, 70))}</td>
        <td class="mono text-xs">${esc(shortId(e.user_code || e.user_id || e.gym_code))}</td>
        <td>${e.resolved ? '<span class="badge badge-success">resolved</span>' : '<span class="badge badge-danger">open</span>'}</td>
        <td><button class="btn ${e.resolved ? 'btn-secondary' : 'btn-success'} btn-sm" data-err-resolve="${escAttr(String(e.id))}" data-resolved="${e.resolved ? '1' : '0'}">${e.resolved ? 'Reopen' : 'Resolve'}</button></td>
      </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state"><span class="icon">✅</span><p class="empty-state-text">No errors recorded — clean log</p></div></td></tr>';
    }
  } catch {
    if (errBody) errBody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><p class="empty-state-text">Failed to load error log</p></div></td></tr>';
  }
  const audList = document.getElementById('auAuditList');
  try {
    const audit = await v2FetchAudit(force);
    const cnt = document.getElementById('auAuditCount'); if (cnt) cnt.textContent = String(audit.length);
    if (audList) {
      audList.innerHTML = audit.slice(0, 50).map(e => {
        const d = v2Parse(e.details);
        const detailStr = Object.keys(d || {}).length ? `<details style="margin-top:4px;"><summary style="cursor:pointer; font-size:0.68rem; color:var(--text-muted);">details</summary><pre class="mono" style="font-size:0.62rem; color:var(--text-muted); white-space:pre-wrap; margin:4px 0 0;">${esc(JSON.stringify(d, null, 1).slice(0, 400))}</pre></details>` : '';
        return tlItem(ts(e.created_at), `<b>${esc(e.action)}</b> ${e.target_type ? '· ' + esc(e.target_type) + ' ' + esc(shortId(e.target_id)) : ''} <span style="color:var(--text-muted)">— ${esc(e.admin_email || '')}</span>${detailStr}`, e.action === 'login_failed' ? 'red' : '');
      }).join('') || '<div class="empty-state"><p class="empty-state-text">No audit entries yet</p></div>';
    }
  } catch {
    if (audList) audList.innerHTML = '<div class="empty-state"><p class="empty-state-text">Failed to load audit trail</p></div>';
  }
}

// ---------- V2: Versions view ----------
async function refreshVersionsView() {
  const shipped = document.getElementById('veShipped');
  const badge = document.getElementById('v2VersionBadge');
  const v = (appConfig && appConfig.appVersion) || '?';
  if (shipped) shipped.textContent = String(v);
  if (badge) badge.textContent = String(v);
  try {
    const r = await fetch('https://api.github.com/repos/ibrheamkhalaf88-collab/GymOS/releases/latest');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rel = await r.json();
    const lat = document.getElementById('veLatest');
    if (lat) lat.textContent = String(rel.tag_name || '—');
    const latN = document.getElementById('veLatestNote');
    if (latN) latN.textContent = 'published ' + (rel.published_at ? fmtDay(Date.parse(rel.published_at)) : '—');
    const assets = document.getElementById('veAssets');
    if (assets) assets.textContent = (rel.assets || []).map(a => a.name).join(' · ') || 'none';
  } catch (e) {
    const lat = document.getElementById('veLatest');
    if (lat) { lat.textContent = 'unavailable'; lat.style.color = 'var(--text-muted)'; }
    const latN = document.getElementById('veLatestNote');
    if (latN) latN.textContent = String(e.message || e).slice(0, 60);
  }
}

// ---------- V2: Account Detail Drawer ----------
let drCurrent = null; // current account user object
function dispatchRowAction(action, id, email) {
  // Reuse the audited users-table delegation (confirm dialogs, audit, refresh)
  const btn = document.createElement('button');
  btn.dataset.action = action;
  if (id) btn.dataset.id = id;
  if (email) btn.dataset.email = email;
  btn.style.display = 'none';
  elements.usersTableBody.appendChild(btn);
  btn.click();
  btn.remove();
}
function drKv(rows) {
  return rows.map(r => `<dt>${esc(r[0])}</dt><dd>${r[1]}</dd>`).join('');
}
function userCodesOf(u, codes) {
  const email = String(u.email || '').toLowerCase();
  return (codes || []).filter(c => String(c.owner || '').toLowerCase() === email || String(c.owner || '') === 'user:' + u.id);
}
async function openAccount(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) { showToast('Account not on this page — refresh first', 'error'); return; }
  drCurrent = u;
  const ov = document.getElementById('drawerOverlay');
  if (!ov) return;
  ov.classList.remove('hidden');
  const av = document.getElementById('drAvatar');
  if (av) av.textContent = (u.name || '?').charAt(0).toUpperCase();
  const nm = document.getElementById('drName'); if (nm) nm.textContent = u.name || u.email || '—';
  const em = document.getElementById('drEmail'); if (em) em.textContent = u.email || '—';
  const st = document.getElementById('drStatusBadge');
  if (st) { st.innerHTML = tierBadge(u); }
  drShowTab('overview');
}
function closeDrawer() {
  const ov = document.getElementById('drawerOverlay');
  if (ov) ov.classList.add('hidden');
  drCurrent = null;
}
function drShowTab(name) {
  document.querySelectorAll('#drTabs button').forEach(b => b.classList.toggle('active', b.dataset.drtab === name));
  document.querySelectorAll('.drawer-tabpanel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('drt-' + name);
  if (panel) panel.classList.add('active');
  const R = {
    overview: drRenderOverview, license: drRenderLicense, sync: drRenderSync,
    data: drRenderData, backup: drRenderBackup, security: drRenderSecurity, timeline: drRenderTimeline,
  }[name];
  if (R) { try { R(drCurrent); } catch (e) { console.error('drawer tab failed:', e); } }
}
function drRenderOverview(u) {
  if (!u) return;
  const kv = document.getElementById('drOverviewKv');
  if (!kv) return;
  const now = Date.now();
  const daysLeft = u.subEnd ? Math.max(0, Math.ceil((u.subEnd - now) / 86400000)) : null;
  kv.innerHTML = drKv([
    ['User ID', `<span class="mono copyable" data-copy="${escAttr(u.id || '')}" title="Click to copy">${esc(u.id || '—')}</span>`],
    ['Email', `<span class="copyable" data-copy="${escAttr(u.email || '')}">${esc(u.email || '—')}</span>`],
    ['Gym name', esc(u.gym_name || '—')],
    ['Registered', u.created ? esc(fmtDay(u.created)) + ' <span class="subline">' + fmtAgo(u.created) + '</span>' : '<span class="na-pill">NOT AVAILABLE</span>'],
    ['Account status', u.status === 'suspended' ? '<span class="badge badge-danger">suspended</span>' : '<span class="badge badge-success">active</span>'],
    ['Subscription', esc(TIER_LABEL[u.subscription] || u.subscription || '—')],
    ['Expires', u.subEnd ? esc(fmtDay(u.subEnd)) : (u.subscription === 'lifetime' ? 'lifetime' : '—')],
    ['Days remaining', daysLeft != null ? String(daysLeft) : (u.subscription === 'lifetime' ? 'unlimited' : '—')],
    ['Last login', u.lastSignIn ? esc(fmtDay(u.lastSignIn)) + ' <span class="subline">' + fmtAgo(u.lastSignIn) + '</span>' : '<span class="na-pill">NOT AVAILABLE</span>'],
    ['Last activity', '<span class="na-pill">NOT AVAILABLE</span>'],
    ['Presence', '<span class="na-pill">NOT AVAILABLE</span>'],
    ['App version', '<span class="na-pill">NOT TRACKED</span>'],
  ]);
  kv.querySelectorAll('[data-copy]').forEach(el => el.addEventListener('click', () => {
    navigator.clipboard.writeText(el.dataset.copy || '').then(() => showToast('Copied / تم النسخ', 'success')).catch(() => {});
  }));
}
async function drRenderLicense(u) {
  const panel = document.getElementById('drt-license');
  if (!panel || !u) return;
  panel.innerHTML = '<div class="empty-state"><span class="icon">⏳</span></div>';
  const codes = await v2FetchCodes().catch(() => []);
  const mine = userCodesOf(u, codes);
  const rows = mine.length ? mine.map(c => {
    const exp = (Number(c.days) > 0 && c.used_at) ? Date.parse(c.used_at) + Number(c.days) * 86400000 : null;
    return `<div class="result-box" style="margin-bottom:0.6rem; flex-wrap:wrap;">
      <span class="result-code" style="font-size:1.05rem;">${esc(c.code)}</span>
      <span class="badge ${c.revoked ? 'badge-danger' : 'badge-success'}">${c.revoked ? 'revoked' : 'active'}</span>
      <span class="text-xs" style="color:var(--text-muted);">tier ${esc(c.tier || '—')} · ${Number(c.days) || 0}d · ${exp ? 'ends ' + esc(fmtDay(exp)) : (Number(c.days) > 0 ? 'never used' : 'lifetime')}</span>
      <button class="btn btn-danger btn-sm" data-dr-revoke="${escAttr(c.code)}" ${c.revoked ? 'disabled' : ''}>Revoke</button>
    </div>`;
  }).join('') : '<div class="empty-state"><span class="icon">🔑</span><p class="empty-state-text">No activation code is linked to this account yet</p></div>';
  panel.innerHTML = `
    <dl class="kv" style="margin-bottom:1rem;">
      ${drKv([
        ['Activation date', u.subStart ? esc(fmtDay(u.subStart)) : (mine[0] && mine[0].used_at ? esc(fmtDay(Date.parse(mine[0].used_at))) : '—')],
        ['Expiration', u.subEnd ? esc(fmtDay(u.subEnd)) : '—'],
        ['Trial status', u.subscription === 'trial' ? 'trial plan' : '—'],
      ])}
    </dl>
    <div class="chart-title" style="margin-bottom:0.5rem;">Linked codes</div>
    ${rows}
    <div class="chart-title" style="margin:1rem 0 0.5rem;">Controls</div>
    <div class="flex gap-2 flex-wrap">
      <button class="btn btn-secondary btn-sm" data-dr-act="edit">✎ Edit subscription</button>
      ${u.status === 'suspended'
        ? '<button class="btn btn-success btn-sm" data-dr-act="activate">▶️ Reactivate</button>'
        : '<button class="btn btn-warning btn-sm" data-dr-act="suspend">⏸ Suspend</button>'}
      <button class="btn btn-secondary btn-sm" data-dr-act="send-reset">🔑 Send password reset</button>
      <button class="btn btn-secondary btn-sm" data-dr-assign="1">🔗 Assign code by email</button>
    </div>
    <p class="text-xs" style="color:var(--text-muted); margin-top:0.6rem;">Custom exact expiry dates are not supported by the existing API (it computes from +days). Extend via Edit subscription instead.</p>
  `;
  panel.querySelectorAll('[data-dr-act]').forEach(b => b.addEventListener('click', () => {
    dispatchRowAction(b.dataset.drAct, u.id, u.email);
    setTimeout(() => closeDrawer(), 400);
  }));
  panel.querySelectorAll('[data-dr-revoke]').forEach(b => b.addEventListener('click', async () => {
    const code = b.dataset.drRevoke;
    const ok = await showConfirm({ title: 'Revoke code', message: 'Revoking ' + code + ' blocks its cloud access immediately. Customer data is never deleted.', icon: '🚫', iconColor: '#fb5b74', okText: 'Revoke', okClass: 'btn-danger' });
    if (!ok) return;
    try { await api('/api/codes/' + encodeURIComponent(code) + '/revoke', { method: 'PATCH', body: JSON.stringify({ revoked: true }) }); showToast('Code revoked', 'success'); drRenderLicense(u); }
    catch (e) { showToast('Revoke failed: ' + e.message, 'error'); }
  }));
  const assignBtn = panel.querySelector('[data-dr-assign]');
  if (assignBtn) assignBtn.addEventListener('click', async () => {
    if (!mine.length) { showToast('Create a code first (New code button)', 'error'); return; }
    const unlinked = mine;
    const code = unlinked.length === 1 ? unlinked[0].code : (window.prompt('Code to link (' + unlinked.map(c => c.code).join(', ') + '):', unlinked[0].code) || '');
    if (!code) return;
    const owner = (window.prompt('Owner email for ' + code + ':', u.email || '') || '').trim().toLowerCase();
    if (!owner) return;
    const ok = await showConfirm({ title: 'Link code to account', message: code + ' will be owned by ' + owner, icon: '🔗', iconColor: '#38bdf8', okText: 'Link', okClass: 'btn-primary' });
    if (!ok) return;
    try { await api('/api/codes/' + encodeURIComponent(code) + '/owner', { method: 'PATCH', body: JSON.stringify({ owner }) }); showToast('Code linked (audited)', 'success'); V2_CACHE.codes = null; drRenderLicense(u); }
    catch (e) { showToast('Link failed: ' + e.message, 'error'); }
  });
}
async function drRenderSync(u) {
  const panel = document.getElementById('drt-sync');
  if (!panel || !u) return;
  panel.innerHTML = '<div class="empty-state"><span class="icon">⏳</span></div>';
  const codes = await v2FetchCodes().catch(() => []);
  const mine = userCodesOf(u, codes);
  let html = '';
  for (const c of mine) {
    const g = await v2FetchGymForCode(c.code);
    const rows = (g && g.gyms || []).map(x => `<tr>
      <td class="mono text-xs">${esc(x.device_id || '(shared)')}</td>
      <td>${x.saved_at ? esc(fmtDay(Date.parse(x.saved_at))) + ' <span class="subline">' + fmtAgo(Date.parse(x.saved_at)) + '</span>' : '—'}</td>
    </tr>`).join('');
    html += `<div class="chart-title" style="margin-bottom:0.4rem;">Code ${esc(c.code)}</div>
      <table class="data-table" style="margin-bottom:1rem;"><thead><tr><th>Device row</th><th>Last saved</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2"><span class="opacity-40">No cloud rows for this code</span></td></tr>'}</tbody></table>`;
  }
  let errHtml = '';
  try {
    const errs = (await v2FetchErrors()).filter(e => (e.user_code && mine.some(c => c.code === e.user_code)) || (e.user_id && e.user_id === u.id));
    errHtml = `<div class="chart-title" style="margin:0.6rem 0 0.4rem;">Recorded errors for this account</div>` + (errs.length
      ? '<div class="timeline">' + errs.slice(0, 6).map(e => tlItem(ts(e.created_at), `<b>${esc(e.error_code || 'ERR')}</b> ${esc(String(e.error_message || '').slice(0, 80))}`, 'red')).join('') + '</div>'
      : '<p class="text-xs" style="color:var(--text-muted);">None recorded / لا أخطاء مسجلة</p>');
  } catch { errHtml = ''; }
  panel.innerHTML = (html || '<div class="empty-state"><span class="icon">☁️</span><p class="empty-state-text">This account has no linked code, so it cannot use cloud sync yet</p></div>') + errHtml +
    `<p class="text-xs" style="color:var(--text-muted); margin-top:0.8rem;">The client retries failed syncs automatically every 20s while the app is open; no server-side retry endpoint exists.</p>`;
}
async function drRenderData(u) {
  const panel = document.getElementById('drt-data');
  if (!panel || !u) return;
  panel.innerHTML = '<div class="empty-state"><span class="icon">⏳</span></div>';
  const codes = await v2FetchCodes().catch(() => []);
  const mine = userCodesOf(u, codes);
  if (!mine.length) { panel.innerHTML = '<div class="empty-state"><span class="icon">🗂️</span><p class="empty-state-text">No code linked — no cloud data exists for this account</p></div>'; return; }
  let html = '';
  for (const c of mine) {
    const g = await v2FetchGymForCode(c.code);
    const data = (g && g.gyms || []).reduce((acc, x) => ({ ...(acc || {}), ...(x.data || {}) }), {}) || {};
    const members = Array.isArray(data.members) ? data.members : [];
    const ledger = Array.isArray(data.ledger) ? data.ledger : [];
    const revenue = ledger.reduce((s, e) => s + (Number(e && (e.amount != null ? e.amount : (e.total != null ? e.total : 0))) || 0), 0);
    const counts = ['members', 'memberships', 'devices', 'trainers', 'ledger', 'checkins', 'notifications'].map(k =>
      `<span class="badge ${Array.isArray(data[k]) ? 'badge-info' : 'badge-neutral'}">${esc(k)}: ${Array.isArray(data[k]) ? data[k].length : '—'}</span>`).join(' ');
    const preview = members.slice(0, 5).map(m => `<li style="font-size:0.78rem; margin-bottom:2px;">${esc(String(m.name || '—').slice(0, 40))} <span class="subline" style="display:inline;">${m.expiresAt ? 'ends ' + esc(fmtDay(ts(m.expiresAt))) : ''}</span></li>`).join('');
    html += `<div class="chart-title" style="margin-bottom:0.4rem;">Code ${esc(c.code)} — read-only summary</div>
      <div style="margin-bottom:0.6rem;">${counts}</div>
      <dl class="kv" style="margin-bottom:0.8rem;">
        <dt>Recorded revenue (ledger)</dt><dd class="mono">${revenue ? revenue.toLocaleString('en-US') : '0'}</dd>
        <dt>Last updated</dt><dd>${(g && g.gyms || []).reduce((m, x) => Math.max(m, x.saved_at ? Date.parse(x.saved_at) : 0), 0) ? fmtAgo((g.gyms).reduce((m, x) => Math.max(m, x.saved_at ? Date.parse(x.saved_at) : 0), 0)) : '—'}</dd>
      </dl>
      ${members.length ? `<div class="chart-title" style="margin-bottom:0.3rem;">Members preview (first 5 of ${members.length})</div><ul style="padding-inline-start:1.1rem;">${preview}</ul>` : ''}
      <p class="text-xs" style="color:var(--text-muted); margin:0.6rem 0 1.2rem;">Full records stay in the account's own cloud row; this drawer never mixes accounts and never edits customer data.</p>`;
  }
  panel.innerHTML = html;
}
async function drRenderBackup(u) {
  const panel = document.getElementById('drt-backup');
  if (!panel || !u) return;
  const codes = (await v2FetchCodes().catch(() => []));
  const mine = userCodesOf(u, codes);
  panel.innerHTML = `
    <dl class="kv" style="margin-bottom:1rem;">
      ${drKv([
        ['Latest backup', '<span class="na-pill">NOT AVAILABLE</span> (Drive engine is down — deploy pending)'],
        ['Backup integrity', '<span class="badge badge-warning">UNVERIFIED</span> <span class="subline">no isolated restore test has been run</span>'],
        ['Recovery points', mine.length ? '1 cloud copy per code (mutable, no history)' : '—'],
      ])}
    </dl>
    <div class="chart-title" style="margin-bottom:0.5rem;">Safe recovery actions</div>
    <div class="flex gap-2 flex-wrap">
      <button class="btn btn-secondary btn-sm" data-dr-act="viewdata">👁 View cloud data</button>
      <button class="btn btn-secondary btn-sm" data-dr-act="backup">⬇ Download JSON snapshot</button>
      <button class="btn btn-secondary btn-sm" data-dr-act="restore">⬆ Restore (snapshot-first)</button>
    </div>
    <p class="text-xs" style="color:var(--text-muted); margin-top:0.6rem;">Restore replaces the shared cloud row and hands back a snapshot of the previous data first. It never touches other accounts.</p>
  `;
  panel.querySelectorAll('[data-dr-act]').forEach(b => b.addEventListener('click', () => {
    dispatchRowAction(b.dataset.drAct, u.id, u.email);
    setTimeout(() => closeDrawer(), 400);
  }));
}
async function drRenderSecurity(u) {
  const panel = document.getElementById('drt-security');
  if (!panel || !u) return;
  let errHtml = '';
  try {
    const errs = (await v2FetchErrors()).filter(e => e.user_id && e.user_id === u.id);
    errHtml = errs.length ? '<div class="chart-title" style="margin:0.8rem 0 0.4rem;">Recorded failures</div><div class="timeline">' + errs.slice(0, 5).map(e => tlItem(ts(e.created_at), `<b>${esc(e.error_code || 'ERR')}</b> ${esc(String(e.error_message || '').slice(0, 70))}`, 'red')).join('') + '</div>' : '';
  } catch { errHtml = ''; }
  panel.innerHTML = `
    <dl class="kv" style="margin-bottom:1rem;">
      ${drKv([
        ['Last authenticated activity', u.lastSignIn ? esc(fmtDay(u.lastSignIn)) + ' <span class="subline">' + fmtAgo(u.lastSignIn) + '</span>' : '<span class="na-pill">NOT AVAILABLE</span>'],
        ['Failed login events', '<span class="na-pill">NOT AVAILABLE</span> <span class="subline">user-side login failures are not logged by the existing API</span>'],
        ['Active sessions / revoke', '<span class="na-pill">NOT AVAILABLE</span> <span class="subline">GoTrue admin sign-out is not exposed by the existing API</span>'],
        ['Suspension state', u.status === 'suspended' ? '<span class="badge badge-danger">suspended</span>' : '<span class="badge badge-success">active</span>'],
      ])}
    </dl>
    <div class="chart-title" style="margin-bottom:0.5rem;">Controls</div>
    <div class="flex gap-2 flex-wrap">
      <button class="btn btn-secondary btn-sm" data-dr-act="send-reset">🔑 Initiate password reset</button>
      ${u.status === 'suspended'
        ? '<button class="btn btn-success btn-sm" data-dr-act="activate">▶️ Reactivate</button>'
        : '<button class="btn btn-warning btn-sm" data-dr-act="suspend">⏸ Suspend</button>'}
    </div>
    <p class="text-xs" style="color:var(--text-muted); margin-top:0.6rem;">The reset link is emailed by GoTrue — no password is ever displayed here. Suspension never deletes customer data.</p>
  ` + errHtml;
  panel.querySelectorAll('[data-dr-act]').forEach(b => b.addEventListener('click', () => {
    dispatchRowAction(b.dataset.drAct, u.id, u.email);
    setTimeout(() => closeDrawer(), 400);
  }));
}
async function drRenderTimeline(u) {
  const panel = document.getElementById('drt-timeline');
  if (!panel || !u) return;
  panel.innerHTML = '<div class="empty-state"><span class="icon">⏳</span></div>';
  const items = [];
  if (u.created) items.push({ t: u.created, html: '<b>Account registered</b> (Supabase auth)', tone: 'green' });
  if (u.lastSignIn) items.push({ t: u.lastSignIn, html: '<b>Last sign-in</b>', tone: '' });
  if (u.subStart) items.push({ t: u.subStart, html: '<b>Subscription window started</b>', tone: '' });
  try {
    const codes = await v2FetchCodes().catch(() => []);
    const mine = userCodesOf(u, codes);
    const audit = await v2FetchAudit().catch(() => []);
    const needle = [u.id, String(u.email || '').toLowerCase(), ...mine.map(c => c.code)].filter(Boolean).map(String);
    for (const e of audit) {
      const d = v2Parse(e.details);
      const hay = JSON.stringify([e.target_id, e.target_type, d]).toLowerCase();
      if (needle.some(n => hay.includes(String(n).toLowerCase()))) {
        items.push({ t: ts(e.created_at), html: `<b>${esc(e.action)}</b> <span style="color:var(--text-muted)">by ${esc(e.admin_email || '')}</span>`, tone: e.action === 'login_failed' ? 'red' : '' });
      }
    }
  } catch { /* timeline shows recorded items only */ }
  items.sort((a, b) => (b.t || 0) - (a.t || 0));
  panel.innerHTML = items.length
    ? '<div class="timeline">' + items.slice(0, 30).map(i => tlItem(i.t, i.html, i.tone)).join('') + '</div>'
    : '<div class="empty-state"><span class="icon">📜</span><p class="empty-state-text">No recorded events for this account yet — nothing is fabricated</p></div>';
}

// ---------- V2 init ----------
V2_LOADERS.overview = refreshOverview;
V2_LOADERS.sync = refreshSyncView;
V2_LOADERS.backups = refreshBackupsView;
V2_LOADERS.activity = refreshActivityView;
V2_LOADERS.security = refreshSecurityView;
V2_LOADERS.audit = () => refreshAuditView(false);
V2_LOADERS.versions = refreshVersionsView;

function v2Init() {
  applyI18n();
  setTheme(localStorage.getItem('dp_admin_theme') || 'dark');

  // Sidebar navigation
  document.querySelectorAll('.v2-nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => showView(b.dataset.goto)));
  const burger = document.getElementById('v2Burger');
  if (burger) burger.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  const scrim = document.getElementById('sidebarScrim');
  if (scrim) scrim.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

  // Topbar toggles
  const themeBtn = document.getElementById('v2ThemeBtn');
  if (themeBtn) themeBtn.addEventListener('click', () => setTheme(document.documentElement.hasAttribute('data-theme') ? 'dark' : 'light'));
  const langBtn = document.getElementById('v2LangBtn');
  if (langBtn) langBtn.addEventListener('click', () => setLang(v2Lang() === 'ar' ? 'en' : 'ar'));

  // Settings segments
  document.querySelectorAll('#stThemeSeg button').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themePick)));
  document.querySelectorAll('#stLangSeg button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.langPick)));

  // Row click → Account Detail Center (buttons keep their own handlers)
  if (elements.usersTableBody) {
    elements.usersTableBody.addEventListener('click', (e) => {
      if (e.target.closest('[data-action], button, a, input, select')) return;
      const row = e.target.closest('[data-open-account]');
      if (row) openAccount(row.dataset.openAccount);
    });
  }

  // Drawer controls
  const drCloseBtn = document.getElementById('drClose');
  if (drCloseBtn) drCloseBtn.addEventListener('click', closeDrawer);
  const drOverlay = document.getElementById('drawerOverlay');
  if (drOverlay) drOverlay.addEventListener('click', (e) => { if (e.target === drOverlay) closeDrawer(); });
  document.querySelectorAll('#drTabs button').forEach(b => b.addEventListener('click', () => drShowTab(b.dataset.drtab)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // Backups center per-row actions (reuse audited flows)
  const bkBody = document.getElementById('bkTableBody');
  if (bkBody) bkBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bk]');
    if (!btn) return;
    const id = btn.dataset.id;
    const map = { view: 'viewdata', backup: 'backup', restore: 'restore' };
    dispatchRowAction(map[btn.dataset.bk] || btn.dataset.bk, id);
  });

  // Errors resolve/reopen
  const errBody = document.getElementById('auErrBody');
  if (errBody) errBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-err-resolve]');
    if (!btn) return;
    const id = btn.dataset.errResolve;
    const resolved = btn.dataset.resolved !== '1';
    try {
      await api('/api/admin/errors/resolve', { method: 'PATCH', body: JSON.stringify({ id, resolved }) });
      showToast(resolved ? 'Error marked resolved (audited)' : 'Error reopened', 'success');
      V2_CACHE.errors = null;
      refreshAuditView(true);
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
  });
  const errRef = document.getElementById('auErrRefresh');
  if (errRef) errRef.addEventListener('click', () => refreshAuditView(true));
  const audRef = document.getElementById('auAuditRefresh');
  if (audRef) audRef.addEventListener('click', () => refreshAuditView(true));

  // Boot view from hash, then periodic overview refresh
  const initial = (location.hash.match(/view-([a-z]+)/) || [])[1];
  showView(initial && document.getElementById('view-' + initial) ? initial : 'overview');
  setInterval(() => {
    const active = document.querySelector('.v2-view.active');
    if (active && active.id === 'view-overview') refreshOverview().catch(() => {});
  }, 90000);
  window.__V2_OK = true; // QA probe: v2Init completed all wiring
}
v2Init();