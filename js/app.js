// app.js - منطق التطبيق الرئيسي
const MASTER_PASSWORD = "ib2040";

const $ = id => document.getElementById(id);

// التحقق من التفعيل
(function init() {
  const user = localStorage.getItem('ib2040_user');
  if (!user) { window.location.href = 'onboarding-1.html'; return; }
  try {
    const data = JSON.parse(user);
    if (!data.active) { window.location.href = 'onboarding-1.html'; return; }
    $('statCode').textContent = data.code;
    $('statDate').textContent = new Date(data.date).toLocaleDateString('ar-SA');
  } catch { window.location.href = 'onboarding-1.html'; }
})();

// تسجيل الخروج
$('logoutBtn').addEventListener('click', () => {
  if (confirm('تسجيل الخروج؟ ستحتاج لإعادة إدخال الكود.')) {
    localStorage.removeItem('ib2040_user');
    window.location.href = 'onboarding-1.html';
  }
});

// زر لوحة الأكواد
$('adminBtn').addEventListener('click', () => {
  window.location.href = 'admin-codes.html';
});

// اختصار: Ctrl+Shift+A
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    const pass = prompt('🔐 أدخل الباسورد للوصول لصفحة إدارة الأكواد:');
    if (pass === MASTER_PASSWORD) window.location.href = 'admin-codes.html';
    else if (pass !== null) alert('❌ باسورد خاطئ');
  }
});