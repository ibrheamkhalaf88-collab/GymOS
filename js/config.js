// ============================================================
// Digital Pulse — App configuration
// عدّل القيم هنا حسب إعداداتك
// ============================================================

// الجذر المطلق للتطبيق (يشتغل على GitHub Pages تحت /GymOS/ وعلى localhost)
// يُحسب من موقع ملف config.js (js/config.js → الجذر)
export const APP_BASE = new URL("../", import.meta.url).href;

export const appConfig = {
  brand: "DIGITAL PULSE",
  brandAr: "النبض الرقمي",

  // إصدار التطبيق — لازم يطابق versionName بالـ APK ويتحدث مع كل إصدار جديد
  appVersion: "1.3.1",

  // للدعم والتواصل (يظهر في شاشة التفعيل)
  supportPhone: "+972 568 802 803",
  supportWhatsApp: "972568802803", // بدون + أو مسافات

  // صلاحية المدير — يجب أن يطابق البريد في server/.env
  adminEmail: "ibrheamshady@gmail.com",
  adminDisplayName: "ADM_ROOT",

  // 🔐 Demo admin password — REMOVED FROM SOURCE
  // In demo mode, the password is validated against a hash stored in localStorage
  // Set via: localStorage.setItem('dp_demo_admin_pw_hash', await bcrypt.hash('yourpass', 12))
  // Default fallback (only if no hash exists): "DemoGym2026!"
  get demoAdminPassword() {
    try {
      const hash = localStorage.getItem('dp_demo_admin_pw_hash');
      if (hash) return null; // Will use hash comparison
    } catch {}
    return "DemoGym2026!"; // Fallback only
  },

  // 🗄️ Supabase — Authentication + Edge Functions
  // These should be set via build-time env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
  // Fallback to known project for development only
  supabaseUrl: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || "https://mwfbgucayjgbbvcyelbo.supabase.co",
  supabaseAnonKey: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13ZmJndWNheWpnYmJ2Y3llbGJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NDQwMjEsImV4cCI6MjEwMzMyMDAyMX0.FP2qGp9pNhnC17xhBLN_81Pz0Lg1PS4B04VRrd7M9hY",
  apiUrl: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || "https://mwfbgucayjgbbvcyelbo.functions.supabase.co/gymos-api",

  language: "en",
};