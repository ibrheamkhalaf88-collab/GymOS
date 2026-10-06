// ============================================================
// Admin Dashboard — User Management, Activation Codes & Coupons
// Extracted from admin.html inline script for maintainability
// Uses Supabase Edge Function admin endpoints.
// Requires admin JWT from sessionStorage (set after admin login).
// ============================================================

import { appConfig } from './config.js';
import { demoUsersAll, demoUsersSave, findDemoUser, demoAll as demoCodesAll } from './db.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------- Auth guard: MUST be the first executable code ----------
// Runs before anything else so no runtime error below can ever bypass login.
const TOKEN = sessionStorage.getItem('dp_admin_token') || '';
const IS_DEMO = sessionStorage.getItem('dp_demo_admin') === '1' || TOKEN.startsWith('demo-');

if (!TOKEN) {
  window.location.href = 'admin-login.html';
  throw new Error('no admin token');
}

// ---------- HTML escaping (XSS prevention) ----------
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');

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

// Legacy alias for compatibility
function toast(msg, type = 'ok') {
  showToast(msg, type === 'err' ? 'error' : 'success');
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
  }
});

// Initialize UI for demo/online mode
elements.modeBadge.textContent = IS_DEMO ? 'OFFLINE / محلي' : 'ONLINE / أونلاين';
elements.modeBadge.style.color = IS_DEMO ? '#ff9800' : '#CCFF00';
elements.modeBadge.style.borderColor = IS_DEMO ? '#ff980055' : '#CCFF0055';
elements.adminEmailDisplay.textContent = IS_DEMO
  ? 'admin@gym.local'
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
    name: u.full_name || u.name || '',
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
async function loadUsers() {
  if (loading) return;
  loading = true;
  elements.usersTableBody.innerHTML = `
    <tr>
      <td colspan="6">
        <div class="empty-state">
          <span class="icon">⏳</span>
          <p class="empty-state-title">Loading users...</p>
          <p class="empty-state-text">جاري تحميل قائمة المستخدمين</p>
        </div>
      </td>
    </tr>`;

  let users;
  try {
    if (IS_DEMO) throw new Error('demo');
    const data = await api('/api/users');
    users = (data || []).map(u => normalizeUser({ ...u, _demo: false }));
  } catch (err) {
    if (!IS_DEMO) {
      console.log('Admin API error:', err.message);
      if (/(401|403|FORBIDDEN|UNAUTHORIZED)/i.test(err.message || '')) {
        sessionStorage.removeItem('dp_admin_token');
        window.location.href = 'admin-login.html';
        return;
      }
      users = [];
      elements.usersTableBody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state">
              <span class="icon">⚠️</span>
              <p class="empty-state-title">API Error / خطأ في الاتصال</p>
              <p class="empty-state-text">${esc(err.message)} — راجع الاتصال / أعد تسجيل الدخول</p>
            </div>
          </td>
        </tr>`;
      loading = false;
      return;
    }
    users = (await demoGetUsers()).map(u => normalizeUser({ ...u, _demo: true }));
  }

  allUsers = users;
  renderUsers(users);
  updateStats(users);
  loading = false;
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

  if (q) list = list.filter(u => (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q));

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
        <td colspan="6">
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
    <tr class="hover:bg-[#171717]/50 transition-colors">
      <td>
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-[#333627] flex items-center justify-center text-xs font-bold" style="color: var(--accent);">${esc((u.name || '?').charAt(0).toUpperCase())}</div>
          <span>${esc(u.name || '—')}</span>
        </div>
      </td>
      <td class="font-mono text-sm" style="color: var(--accent);">${esc(u.email || '—')}</td>
      <td>${esc(TIER_LABEL[u.subscription] || u.subscription || 'None')}</td>
      <td class="whitespace-nowrap">${expiryText(u)}</td>
      <td>${tierBadge(u)}</td>
      <td>
        <div class="flex gap-1 flex-wrap justify-end">
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${escAttr(u.id)}">✎ Edit / تعديل</button>
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
  try {
    if (IS_DEMO) {
      await demoUpdateUser(id, { status: isSuspend ? 'suspended' : 'active' });
    } else {
      await api('/api/users/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ suspend: isSuspend }),
      });
    }
    await loadUsers();
    showToast(isSuspend ? 'User suspended / تم تعليق المستخدم' : 'User activated / تم تفعيل المستخدم', 'success');
  } catch (err) {
    console.error(err);
    showToast('Action failed: ' + err.message, 'error');
  } finally {
    loading = false;
  }
});

// ---------- Filters / Refresh ----------
elements.searchInput.addEventListener('input', () => renderUsers(allUsers));
elements.statusFilter.addEventListener('change', () => renderUsers(allUsers));
elements.refreshBtn.addEventListener('click', loadUsers);

// ============================================================
// ACTIVATION CODES
// ============================================================

let codeListPage = 0;
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

// Initial load
loadUsers();