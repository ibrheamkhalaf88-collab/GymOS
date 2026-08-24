// activation.js - منطق التفعيل
const $ = id => document.getElementById(id);

$('activationForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = $('actCode').value.trim().toUpperCase();
  const msg = $('actMsg');
  msg.textContent = ''; msg.className = 'msg';

  // التحقق من الصيغة
  if (!/^IB-[A-Z0-9]{6}$/.test(code)) {
    msg.textContent = 'صيغة الكود غير صحيحة. يجب أن تكون IB-XXXXXX';
    msg.classList.add('err');
    $('actCode').focus();
    return;
  }

  // حفظ التفعيل
  const data = { code, date: new Date().toISOString(), active: true };
  localStorage.setItem('ib2040_user', JSON.stringify(data));

  msg.textContent = '✓ تم التفعيل بنجاح، جاري الدخول...';
  msg.classList.add('ok');

  setTimeout(() => {
    window.location.href = 'app.html';
  }, 800);
});

// إذا كان مفعّل مسبقاً → انتقل للتطبيق
(function() {
  const user = localStorage.getItem('ib2040_user');
  if (user) {
    try {
      const data = JSON.parse(user);
      if (data.active) window.location.href = 'app.html';
    } catch {}
  }
})();