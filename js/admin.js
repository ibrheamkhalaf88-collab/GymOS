// ============================================================
// admin.js — Admin panel logic for user account management
// Uses Supabase Edge Function admin endpoints (/api/users).
// Requires admin JWT from sessionStorage (set after admin login).
// ============================================================
import { supabase } from './supabase-client.js';

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
  el.innerHTML = `${type === 'err' ? '⚠️ ' : '✅ '}${msg}`;
  toast.appendChild(el);
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
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = `https://mwfbgucayjgbbvcyelbo.supabase.co/gymos-api${path}`;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* -------- Load users -------- */
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
    console.error(err);
    table.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center">
      <div class="text-[#ff3366] font-headline mb-2">⚠️ Failed to load users</div>
      <p class="text-sm text-muted">${err.message}</p>
      <p class="text-xs text-muted mt-2">Make sure you're logged in as admin and the Edge Function is deployed.</p>
    </td></tr>`;
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
  if (status !== 'all') filtered = filtered.filter(u => u.status === status);

  if (!filtered.length) {
    table.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-muted">
      No users found / لم يتم العثور على مستخدمين
    </td></tr>`;
    return;
  }

  table.innerHTML = filtered.map(u => {
    const statusColor = u.status === 'active' ? '#CCFF00' : '#ff3366';
    const statusBg = u.status === 'active' ? 'bg-[#CCFF00]/10 border-[#CCFF00]/30' : 'bg-[#ff3366]/10 border-[#ff3366]/30';
    const statusText = u.status === 'active' ? 'ACTIVE' : 'SUSPENDED';
    const statusAr = u.status === 'active' ? 'نشط' : 'معلق';
    return `
      <tr class="hover:bg-[#171717]/50 transition-colors">
        <td class="px-6 py-4 font-mono text-sm" style="color: #CCFF00;">${u.email || '—'}</td>
        <td class="px-6 py-4">
          <span class="font-medium">${u.full_name || '—'}</span>
          <span class="text-[10px] text-muted ml-2">ID: ${u.id.slice(-8)}</span>
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
            ${u.status === 'active' ? `
              <button data-action="suspend" data-id="${u.id}" class="px-3 py-1.5 rounded-lg border border-[#ff3366]/30 text-[#ff3366] hover:bg-[#ff3366]/10 transition-all text-[10px] font-headline tracking-widest uppercase">
                SUSPEND / تعليق
              </button>
            ` : `
              <button data-action="resume" data-id="${u.id}" class="px-3 py-1.5 rounded-lg border border-[#CCFF00]/30 text-[#CCFF00] hover:bg-[#CCFF00]/10 transition-all text-[10px] font-headline tracking-widest uppercase">
                RESUME / تفعيل
              </button>
            `}
            <button data-action="delete" data-id="${u.id}" class="px-3 py-1.5 rounded-lg border border-[#ff3366]/30 text-[#ff3366] hover:bg-[#ff3366]/10 transition-all text-[10px] font-headline tracking-widest uppercase">
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

/* -------- Row actions (suspend/resume/delete) -------- */
table.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const userId = btn.dataset.id;

  if (!confirm(
    action === 'suspend'
      ? `Suspend this user? / تعليق هذا المستخدم؟`
      : action === 'resume'
        ? `Resume this user? / تفعيل هذا المستخدم؟`
        : `Delete this user permanently? / حذف هذا المستخدم نهائياً؟`
  )) return;

  try {
    const data = await adminFetch(`/api/users/${userId}`, {
      method: action === 'suspend' ? 'PATCH' : action === 'resume' ? 'PATCH' : 'DELETE',
      body: action === 'suspend' || action === 'resume'
        ? JSON.stringify({ suspend: action === 'suspend' })
        : undefined,
    });

    if (action === 'delete') {
      toast(`User deleted: ${userId.slice(-8)}`);
      await loadUsers();
      return;
    }

    toast(data.suspended
      ? `User suspended / تم تعليق المستخدم`
      : `User resumed / تم تفعيل المستخدم`);
    await loadUsers();
  } catch (err) {
    console.error(err);
    toast(`Action failed: ${err.message}`, 'err');
  }
});

/* -------- Boot -------- */
loadUsers();
