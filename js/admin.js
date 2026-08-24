// ============ لوحة إدارة الأكواد ============
const MASTER_PASSWORD = "ib2040";

// مفاتيح التخزين المحلي
const STORAGE_KEYS = {
  admin_auth: 'ib2040_admin_auth',   // جلسة المدير
  codes: 'ib2040_codes',             // قائمة الأكواد المسجلة
  users: 'ib2040_users',             // المستخدمون المفعلون
};

// ============ مصادقة المدير ============
const $ = id => document.getElementById(id);

// التحقق أثناء التحميل
(function checkAdmin() {
  if (sessionStorage.getItem(STORAGE_KEYS.admin_auth) === MASTER_PASSWORD) {
    showPanel();
  } else {
    showAuth();
  }
})();

function showAuth() {
  $('adminAuth').classList.remove('hidden');
  $('adminPanel').classList.add('hidden');
}

function showPanel() {
  $('adminAuth').classList.add('hidden');
  $('adminPanel').classList.remove('hidden');
  renderAll();
}

$('authForm').addEventListener('submit', e => {
  e.preventDefault();
  const pass = $('adminPass').value;
  const msg = $('authMsg');
  if (pass === MASTER_PASSWORD) {
    sessionStorage.setItem(STORAGE_KEYS.admin_auth, pass);
    msg.textContent = ''; msg.className = 'msg';
    showPanel();
  } else {
    msg.textContent = '❌ باسورد خاطئ';
    msg.classList.add('err');
  }
});

function goBack() {
  window.location.href = 'app.html';
}

// ============ بيانات الأكواد ============
function getCodes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.codes)) || []; }
  catch { return []; }
}
function saveCodes(codes) {
  localStorage.setItem(STORAGE_KEYS.codes, JSON.stringify(codes));
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.users)) || []; }
  catch { return []; }
}
function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

// ============ إضافة كود ============
$('addCodeForm').addEventListener('submit', e => {
  e.preventDefault();
  let code = $('newCode').value.trim().toUpperCase();
  if (!code) {
    // إنشاء كود تلقائي
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code = 'IB-' + Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
  // تنظيف الكود
  if (!code.startsWith('IB-')) code = 'IB-' + code;

  let codes = getCodes();
  if (codes.some(c => c.code === code)) {
    alert('هذا الكود موجود مسبقاً!'); return;
  }
  codes.push({ code, addedAt: new Date().toISOString(), used: false, usedBy: null, usedAt: null });
  saveCodes(codes);
  $('newCode').value = '';
  renderAll();
});

// ============ مسح كود ============
function deleteCode(index) {
  if (!confirm('حذف هذا الكود نهائياً؟')) return;
  const codes = getCodes();
  codes.splice(index, 1);
  saveCodes(codes);
  renderAll();
}

// ============ إضافة مستخدم (من data Affiliation)
function addUser(code) {
  let users = getUsers();
  if (users.some(u => u.code === code)) return; // مكرر
  users.push({ code, activatedAt: new Date().toISOString() });
  saveUsers(users);
}

function deleteUser(index) {
  if (!confirm('حذف هذا المستخدم؟')) return;
  const users = getUsers();
  users.splice(index, 1);
  saveUsers(users);
  renderAll();
}

// ============ تمرير الكود كمستخدم (للتجربة)
function registerUser(code) {
  const codes = getCodes();
  const ci = codes.findIndex(c => c.code === code);
  if (ci !== -1 && !codes[ci].used) {
    codes[ci].used = true;
    codes[ci].usedBy = code;
    codes[ci].usedAt = new Date().toISOString();
    saveCodes(codes);
  }
  addUser(code);
}

// ============ تصدير واستيراد ============
function exportCodes() {
  const data = { codes: getCodes(), users: getUsers(), exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ib2040-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importCodes() {
  $('importFile').click();
}
$('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.codes && Array.isArray(data.codes)) saveCodes(data.codes);
      if (data.users && Array.isArray(data.users)) saveUsers(data.users);
      alert('تم الاستيراد بنجاح!');
      renderAll();
    } catch { alert('ملف JSON غير صالح'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ============ أكواد تجريبية ============
function addDemoCodes() {
  const demos = ['IB-2040AA', 'IB-2040BB', 'IB-2040CC', 'IB-2040DD', 'IB-2040EE'];
  let codes = getCodes();
  demos.forEach(d => {
    if (!codes.some(c => c.code === d)) codes.push({ code: d, addedAt: new Date().toISOString(), used: false });
  });
  saveCodes(codes);
  renderAll();
}

// ============ Rendering ============
function renderAll() {
  const codes = getCodes();
  const users = getUsers();

  // تحديث العدادات
  const cc = codes.length;
  $('codesCount').textContent = cc;
  $('codesCount2').textContent = cc;
  $('usersCount').textContent = users.length;
  $('usersCount2').textContent = users.length;

  // جدول الأكواد
  const ct = $('codesTable');
  ct.innerHTML = '';
  if (cc === 0) {
    $('codesEmpty').style.display = '';
  } else {
    $('codesEmpty').style.display = 'none';
    codes.forEach((c, i) => {
      const date = new Date(c.addedAt).toLocaleDateString('ar-SA');
      const badge = c.used
        ? `<span class="badge badge-no">مستخدم</span> <small class="muted" style="font-size:10px">${c.usedBy} — ${new Date(c.usedAt).toLocaleDateString('ar-SA')}</small>`
        : `<span class="badge badge-ok">متاح</span>`;
      ct.innerHTML += `<tr>
        <td>${i+1}</td>
        <td><span class="mono">${c.code}</span></td>
        <td>${date}</td>
        <td>${badge}</td>
        <td><button class="del-btn" onclick="deleteCode(${i})" title="حذف">🗑</button></td>
      </tr>`;
    });
  }

  // جدول المستخدمين
  const ut = $('usersTable');
  ut.innerHTML = '';
  if (users.length === 0) {
    $('usersEmpty').style.display = '';
  } else {
    $('usersEmpty').style.display = 'none';
    users.forEach((u, i) => {
      const date = new Date(u.activatedAt).toLocaleDateString('ar-SA');
      ut.innerHTML += `<tr>
        <td>${i+1}</td>
        <td><span class="mono">${u.code}</span></td>
        <td>${date}</td>
        <td><button class="del-btn" onclick="deleteUser(${i})" title="حذف">🗑</button></td>
      </tr>`;
    });
  }
}

// ============ مزامنة: من المستخدم لأكواد (محاكاة) ============
// عند فتح لوحة التحكم، نتحقق إذا كان المستخدم الحالي استخدم كوداً
// في التطبيق الحقيقي هذا يتم عبر سيرفر. هنا نعتمد على localStorage
(function syncFromActivation() {
  const raw = localStorage.getItem('ib2040_user');
  if (!raw) return;
  try {
    const user = JSON.parse(raw);
    if (user && user.code && user.active) {
      const codes = getCodes();
      if (codes.some(c => c.code === user.code && !c.used)) {
        const ci = codes.findIndex(c => c.code === user.code);
        codes[ci].used = true;
        codes[ci].usedBy = user.code;
        codes[ci].usedAt = user.date || new Date().toISOString();
        saveCodes(codes);
      }
      addUser(user.code);
    }
  } catch {}
})();