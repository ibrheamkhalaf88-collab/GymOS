// ============================================================
// Digital Pulse — App configuration
// عدّل القيم هنا حسب إعداداتك
// ============================================================

// الجذر المطلق للتطبيق (يشتغل على GitHub Pages تحت /GymOS/ وعلى localhost)
// يُحسب من موقع ملف config.js (js/config.js → الجذر)
export const APP_BASE = new URL("../", import.meta.url).href;

// كشف بيئة التشغيل: إنتاج أم تطوير محلي
const isProduction = (() => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return hostname !== 'localhost' && 
         hostname !== '127.0.0.1' && 
         !hostname.endsWith('.local') &&
         hostname !== '';
})();

export const appConfig = {
  brand: "DIGITAL PULSE",
  brandAr: "النبض الرقمي",

  // إصدار التطبيق — لازم يطابق versionName بالـ APK ويتحدث مع كل إصدار جديد
  appVersion: "1.4.4",

  // للدعم والتواصل (يظهر في شاشة التفعيل)
  supportPhone: "+972 568 802 803",
  supportWhatsApp: "972568802803", // بدون + أو مسافات

  // صلاحية المدير — يجب أن يطابق البريد في server/.env
  adminEmail: "ibrheamshady@gmail.com",
  adminDisplayName: "ADM_ROOT",

  // 🗄️ Supabase — Authentication + Edge Functions
  supabaseUrl: "https://mwfbgucayjgbbvcyelbo.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13ZmJndWNheWpnYmJ2Y3llbGJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NDQwMjEsImV4cCI6MjEwMzMyMDAyMX0.FP2qGp9pNhnC17xhBLN_81Pz0Lg1PS4B04VRrd7M9hY",
  apiUrl: "https://mwfbgucayjgbbvcyelbo.functions.supabase.co/gymos-api",

  // Google OAuth — for Google Drive backup (set in Google Cloud Console)
  // Enable "Google Drive API" and create OAuth 2.0 credentials
  // Authorized redirect URI: https://<your-domain>/GymOS/auth/drive-callback.html
  googleClientId: "", // e.g., "123456789-abc.apps.googleusercontent.com"

  language: "en",

  // بيئة التشغيل (للاستخدام في الكود)
  isProduction,
  
  // Demo mode: متاح فقط في بيئة التطوير المحلية
  // في الإنتاج: IS_DEMO سيكون دائماً false ولا يمكن تفعيله
  demoModeEnabled: !isProduction,
};