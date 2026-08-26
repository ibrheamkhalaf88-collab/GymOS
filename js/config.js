// ============================================================
// Digital Pulse — App configuration
// عدّل القيم هنا حسب إعداداتك
// ============================================================

export const appConfig = {
  brand: "DIGITAL PULSE",
  brandAr: "النبض الرقمي",

  // إصدار التطبيق — لازم يطابق versionName بالـ APK ويتحدث مع كل إصدار جديد
  appVersion: "1.1.5",

  // للدعم والتواصل (يظهر في شاشة التفعيل)
  supportPhone: "+972 568 802 803",
  supportWhatsApp: "972568802803", // بدون + أو مسافات

  // صلاحية المدير — يجب أن يطابق البريد في server/.env
  adminEmail: "admin@example.com",
  adminDisplayName: "ADM_ROOT",

  // كلمة مرور لوحة الإدارة في الوضع التجريبي فقط (عند عدم ربط سيرفر)
  demoAdminPassword: "ibrheam",

  // 🗄️ Supabase Edge Function API — التشغيل السحابي (بدون فيزا)
  // مثال: "https://<project>.functions.supabase.co/gymos-api"
  apiUrl: "https://mwfbgucayjgbbvcyelbo.functions.supabase.co/gymos-api",

  language: "en",
};