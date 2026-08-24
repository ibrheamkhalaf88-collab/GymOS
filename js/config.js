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

  // صلاحية المدير — يجب أن يطابق البريد في firestore.rules و SETUP.md
  adminEmail: "admin@example.com",
  adminDisplayName: "ADM_ROOT",

  // كلمة مرور لوحة الإدارة في الوضع التجريبي فقط (عند عدم ربط Firebase)
  demoAdminPassword: "admin2040",

  language: "en",
};