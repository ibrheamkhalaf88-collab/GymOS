// ============================================================
// Digital Pulse — App configuration
// عدّل القيم هنا حسب إعداداتك
// ============================================================

export const appConfig = {
  brand: "DIGITAL PULSE",
  brandAr: "النبض الرقمي",

  // إصدار التطبيق — لازم يطابق versionName بالـ APK ويتحدث مع كل إصدار جديد
  appVersion: "1.1.6",

  // للدعم والتواصل (يظهر في شاشة التفعيل)
  supportPhone: "+972 568 802 803",
  supportWhatsApp: "972568802803", // بدون + أو مسافات

  // صلاحية المدير — يجب أن يطابق البريد في server/.env
  adminEmail: "ibrheamshady@gmail.com",
  adminDisplayName: "ADM_ROOT",

  // كلمة مرور لوحة الإدارة في الوضع التجريبي فقط (عند عدم ربط سيرفر) — تم توليدها تلقائياً، غيّرها بعد أول دخول
  demoAdminPassword: "E20062006kh@",

  // 🗄️ Supabase — Authentication + Edge Functions
  supabaseUrl: "https://mwfbgucayjgbbvcyelbo.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13ZmJndWNheWpnYmJ2Y3llbGJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NDQwMjEsImV4cCI6MjEwMzMyMDAyMX0.FP2qGp9pNhnC17xhBLN_81Pz0Lg1PS4B04VRrd7M9hY",
  apiUrl: "https://mwfbgucayjgbbvcyelbo.functions.supabase.co/gymos-api",

  language: "en",
};