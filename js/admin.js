// ============================================================
// admin.js — Admin panel logic for user account management
// Uses Supabase Edge Function admin endpoints (/api/users).
// Requires admin JWT from sessionStorage (set after admin login).
// ============================================================
import { supabase } from './supabase-client.js';
import { appConfig } from './config.js';

const $    = (sel, root = document) => root.querySelector(sel);
const table = $('#usersTableBody');
const search = $('#searchInput');
const statusFilter = $('#statusFilter');
const refreshBtn = $('#refreshBtn');
const createBtn = $('#createUserBtn');
const closeModalBtn = $('#closeModalBtn');
const cancelCreateBtn = $('#cancelCreateBtn');
const modal = $('#createModal');
const createForm = $('#createForm');
const createMsg = $('#createMsg');

// Stats
const totalSpan = $('#totalUsers');
const activeSpan = $('#activeUsers');
const suspendedSpan = $('#suspendedUsers');
const lastLoginInfo = $('#lastLoginInfo');

let allUsers = [];
let loading = false;

/* -------- utils -------- */
function setMsg(el, text, color = '#ff3366') {
  el.textContent = text;
  el.style.color = color;
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// HTML-escape user-controlled values before rendering (admin table renders
// user_metadata.full_name/email supplied by self-signed-up users → stored XSS guard)
const esc = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function toast(msg, type = 'ok') {
  const root = document.getElementById('toastRoot') || (() => {
    const r = document.createElement('div');
    r.id = 'toastRoot';
    r.className = 'fixed bottom-6 right-6 z-50 flex flex-col gap-2';
    document.body.appendChild(r);
    return r;
  })();
  const el = document.createElement('div');
  el.className = `p-4 rounded-lg border ${type === 'err' ? 'border-[#ff3366] bg-[#ff3366]/10' : 'border-[#CCFF00] bg-[#CCFF00]/10'} text-sm font-headline tracking-widest`;
  el.style.color = type === 'err' ? '#ff3366' : '#CCFF00';
  el.innerHTML = `${type === 'err' ? '⚠️ ' : '✅ '}${esc(msg)}`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 2500);
}

/* -------- Send admin request with JWT -------- */
async function adminFetch(path, opts = {}) {
  // Try sessionStorage admin token first
  let token = sessionStorage.getItem('dp_admin_token') || '';
  // Fallback: try to sign in as admin silently
  if (!token) {
    const { data: { session } } = await supabase?.auth.getSession?.() ?? { data: { session: null } };
    // If admin is logged in via the app, reuse that session
    if (session?.user?.email) {
      // Call the Edge Function with the user's session — but it checks admin=true JWT
      // We'll rely on the Edge Function checking authAdmin which requires admin JWT
    }
  }
  // For now assume dp_admin_token is set (user went through admin login)
  const headers = { 'Content-Type': 'application/json' };
  if (appConfig.supabaseAnonKey) headers['apikey'] = appConfig.supabaseAnonKey;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = `${appConfig.apiUrl}${path}`;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* -------- Load users -------- */
// Demo fallback: read local users when the API is unreachable (demo mode)
async function demoUsers() {
  const { demoAll } = await import('./db.js');
  // Codes → user shape (so demo codes show up in admin)
  const demoCodes = demoAll().filter(c => c.used);
  return demoCodes.map(c => ({
    id: c.code,
    email: c.code,
    full_name: c.owner || c.usedDeviceName || c.code,
    status: c.revoked ? 'suspended' : 'active',
    created: c.createdAt,
    lastSignIn: c.usedAt,
    subscription: c.tier === 'lifetime' ? 'active' : 'trial',
    subEnd: (c.createdAt || Date.now()) + (c.days || 30) * 86400000,
    _demo: true,
  }));
}

// Demo-mode mutations on localStorage
async function demoAction(userId, action) {
  const { demoAll, demoSave } = await import('./db.js');
  if (action === 'delete') {
    demoSave(demoAll().filter(c => c.code !== userId));
    return { ok: true };
  }
  const list = demoAll();
  const item = list.find(c => c.code === userId);
  if (!item) throw new Error('User not found');
  if (action === 'suspend') {
    item.revoked = true;
  } else if (action === 'resume') {
    item.revoked = false;
  } else if (action === 'activate') {
    // Activate: grant 30 more days from now
    item.revoked = false;
    item.used = true;
    item.usedAt = Date.now();
    item.days = 30;
    item.tier = 'monthly';
  }
  demoSave(list);
  return { ok: true };
}

async function loadUsers() {
  if (loading) return;
  loading = true;
  table.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-muted">Loading users…</td></tr>`;

  try {
    const users = await adminFetch('/api/users');
    allUsers = users;
    renderTable(users);
    renderStats(users);
  } catch (err) {
    console.warn('Admin API unreachable — using demo mode', err);
    toast('DEMO MODE — API unreachable, showing local data only', 'err');
    const users = await demoUsers();
    allUsers = users;
    renderTable(users);
    renderStats(users);
  } finally {
    loading = false;
  }
}

/* -------- Render table -------- */
function renderTable(users) {
  const q = search.value.trim().toLowerCase();
  const status = statusFilter.value;

  let filtered = users;
  if (q) filtered = filtered.filter(u =>
    u.email?.toLowerCase().includes(q) ||
    u.full_name?.toLowerCase().includes(q)
  );
  if (status === 'trial_expired') {
    filtered = filtered.filter(u => u.subscription === 'trial' && u.subEnd && Date.now() > u.subEnd);
  } else if (status !== 'all') {
    filtered = filtered.filter(u => u.status === status);
  }

  if (!filtered.length) {
    table.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-muted">
      No users found / لم يتم العثور على مستخدمين
    </td></tr>`;
    return;
  }

  table.innerHTML = filtered.map(u => {
    const trialExpired = u.subscription === 'trial' && u.subEnd && Date.now() > u.subEnd;
    const isSuspended = u.status === 'suspended' || u.revoked;
    const isPending = trialExpired && !isSuspended;

    let statusColor, statusBg, statusText, statusAr;
    if (isSuspended) {
      statusColor = '#ff3366';
      statusBg = 'bg-[#ff3366]/10 border-[#ff3366]/30';
      statusText = 'SUSPENDED';
      statusAr = 'معلق';
    } else if (isPending) {
      statusColor = '#ff9800';
      statusBg = 'bg-[#ff9800]/10 border-[#ff9800]/30';
      statusText = 'TRIAL ENDED';
      statusAr = 'انتهى التجريبي';
    } else {
      statusColor = '#CCFF00';
      statusBg = 'bg-[#CCFF00]/10 border-[#CCFF00]/30';
      statusText = 'ACTIVE';
      statusAr = 'نشط';
    }
    return `
      <tr class="hover:bg-[#171717]/50 transition-colors">
        <td class="px-6 py-4 font-mono text-sm" style="color: #CCFF00;">${esc(u.email) || '—'}</td>
        <td class="px-6 py-4">
          <span class="font-medium">${esc(u.full_name) || '—'}</span>
          <span class="text-[10px] text-muted ml-2">ID: ${esc(u.id.slice(-8))}</span>
        </td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-headline tracking-widest uppercase border ${statusBg}"
                style="color:${statusColor};">
            ${statusText}
            <span class="font-arabic normal-case opacity-60">${statusAr}</span>
          </span>
        </td>
        <td class="px-6 py-4 text-sm text-muted font-mono whitespace-nowrap">${formatDate(u.created)}</td>
        <td class="px-6 py-4 text-sm text-muted font-mono whitespace-nowrap">${formatDate(u.lastSignIn)}</td>
        <td class="px-6 py-4 text-right">
          <div class="flex justify-end gap-2">
            ${isSuspended ? `
              <button data-action="activate" data-id="${esc(u.id)}" class="px-3 py-1.5 rounded-lg border border-[#CCFF00]/30 text-[#CCFF00] hover:bg-[#CCFF00]/10 transition-all text-[10px] font-headline tracking-widest uppercase">
                ACTIVATE / تفعيل
              </button>
            ` : isPending ? `
              <button data-action="activate" data-id="${esc(u.id)}" class="px-3 py-1.5 rounded-lg border border-[#CCFF00]/30 text-[#CCFF00] hover:bg-[#CCFF00]/10 transition-all text-[10px] font-headline tracking-widest uppercase">
                ACTIVATE / تفعيل
              </button>
            ` : `
              <button data-action="suspend" data-id="${esc(u.id)}" class="px-3 py-1.5 rounded-lg border border-[#ff3366]/30 text-[#ff3366] hover:bg-[#ff3366]/10 transition-all text-[10px] font-headline tracking-widest uppercase">
                SUSPEND / تعليق
              </button>
            `}
            <button data-action="delete" data-id="${esc(u.id)}" class="px-3 py-1.5 rounded-lg border border-[#ff3366]/30 text-[#ff3366] hover:bg-[#ff3366]/10 transition-all text-[10px] font-headline tracking-widest uppercase">
              DELETE / حذف
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

/* -------- Render stats -------- */
function renderStats(users) {
  const total = users.length;
  const active = users.filter(u => u.status === 'active').length;
  const suspended = users.filter(u => u.status === 'suspended').length;
  const lastLogin = users
    .filter(u => u.lastSignIn)
    .sort((a, b) => new Date(b.lastSignIn) - new Date(a.lastSignIn))[0];

  totalSpan.textContent = total;
  activeSpan.textContent = active;
  suspendedSpan.textContent = suspended;
  lastLoginInfo.textContent = lastLogin
    ? `${lastLogin.email} — ${formatDate(lastLogin.lastSignIn)}`
    : '—';
}

/* -------- Event listeners -------- */
refreshBtn.addEventListener('click', loadUsers);
search.addEventListener('input', () => renderTable(allUsers));
statusFilter.addEventListener('change', () => renderTable(allUsers));

/* -------- Create modal -------- */
createBtn.addEventListener('click', () => {
  modal.classList.remove('hidden');
  createForm.reset();
  setMsg(createMsg, '', '#ff3366');
  $('#submitCreateBtn').textContent = 'Create / إنشاء';
  $('#submitCreateBtn').disabled = false;
});

closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
cancelCreateBtn.addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.add('hidden');
});

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loading) return;

  const name  = $('#userName').value.trim();
  const email = $('#userEmail').value.trim();
  const pass  = $('#userPassword').value;

  if (!email || !pass) {
    setMsg(createMsg, 'Email and password are required / البريد وكلمة السر مطلوبان');
    return;
  }
  if (pass.length < 8) {
    setMsg(createMsg, 'Password must be 8+ characters / يجب أن تكون 8 أحرف على الأقل');
    return;
  }

  setMsg(createMsg, 'Creating user…', '#CCFF00');
  $('#submitCreateBtn').disabled = true;

  try {
    const data = await adminFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass, full_name: name }),
    });
    setMsg(createMsg, `✓ User created — ${data.email}`, '#CCFF00');
    toast(`User created: ${data.email}`);
    modal.classList.add('hidden');
    await loadUsers();
  } catch (err) {
    console.error(err);
    setMsg(createMsg, `✗ ${err.message}`);
    toast(`Failed: ${err.message}`, 'err');
    $('#submitCreateBtn').disabled = false;
  }
});

/* -------- Row actions (suspend/resume/delete/activate) -------- */
table.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const userId = btn.dataset.id;
  const isDemo = allUsers.some(u => u.id === userId && u._demo);

  const confirmMsg = {
    suspend:   `Suspend this user? / تعليق هذا المستخدم؟`,
    resume:    `Activate this user? / تفعيل هذا المستخدم؟`,
    activate:  `Activate this user permanently? / تفعيل هذا المستخدم نهائياً (30 يوم إضافية)؟`,
    delete:    `Delete this user permanently? / حذف هذا المستخدم نهائياً؟`,
  };

  if (!confirm(confirmMsg[action])) return;

  try {
    if (isDemo) {
      await demoAction(userId, action);
    } else {
      await adminFetch(`/api/users/${userId}`, {
        method: action === 'suspend' || action === 'resume' ? 'PATCH' : 'DELETE',
        body: action === 'suspend' || action === 'resume'
          ? JSON.stringify({ suspend: action === 'suspend' })
          : undefined,
      });
    }

    const msgs = {
      suspend:  `User suspended / تم تعليق المستخدم`,
      resume:   `User resumed / تم تفعيل المستخدم`,
      activate: `User activated — 30 days granted / تم التفعيل — 30 يوم مجاني`,
      delete:   `User deleted / تم حذف المستخدم`,
    };
    toast(msgs[action]);
    await loadUsers();
  } catch (err) {
    console.error(err);
    toast(`Action failed: ${err.message}`, 'err');
  }
});

/* -------- Boot -------- */
loadUsers();
