// ============================================================
// Digital Pulse — App configuration
// عدّل القيم هنا حسب إعداداتك
// ============================================================

export const appConfig = {
  brand: "DIGITAL PULSE",
  brandAr: "النبض الرقمي",

  // للدعم والتواصل (يظهر في شاشة التفعيل)
  supportPhone: "+972 568 802 803",
  supportWhatsApp: "972568802803", // بدون + أو مسافات

  // صلاحية المدير — يجب أن يطابق البريد في server/.env
  adminEmail: "admin@example.com",
  adminDisplayName: "ADM_ROOT",

  // كلمة مرور لوحة الإدارة في الوضع التجريبي فقط (عند عدم ربط سيرفر)
  demoAdminPassword: "admin2040",

  // 🗄️ MongoDB REST API — ضع رابط السيرفر هنا للتشغيل السحابي
  // مثال: "https://gymos-api.onrender.com/api"
  // اتركه فارغاً "" للوضع التجريبي المحلي (بدون قاعدة بيانات)
  apiUrl: "",

  language: "en",
};