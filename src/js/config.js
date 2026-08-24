// Firebase configuration
// IMPORTANT: Replace with your own Firebase project credentials
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "digital-pulse-pro.firebaseapp.com",
  projectId: "digital-pulse-pro",
  storageBucket: "digital-pulse-pro.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// App configuration
export const appConfig = {
  appName: "Digital Pulse Pro",
  appNameAr: "النبض الرقمي برو",
  version: "1.0.0",
  apiUrl: "/api",
  language: "en",
  languages: {
    en: { code: "en", name: "English", dir: "ltr" },
    ar: { code: "ar", name: "العربية", dir: "rtl" }
  },
  planTypes: {
    basic: { name: "Basic", nameAr: "أساسي", color: "lime" },
    pro: { name: "Pro", nameAr: "محترف", color: "pink" },
    enterprise: { name: "Enterprise", nameAr: "مؤسسي", color: "orange" }
  },
  deviceStatuses: {
    online: { label: "Online", labelAr: "متصل", color: "#22c55e" },
    offline: { label: "Offline", labelAr: "متوقف", color: "#ef4444" },
    warning: { label: "Warning", labelAr: "تحذير", color: "#f59e0b" }
  }
};

// License key validation
export const licenseConfig = {
  prefix: "DPRO",
  length: 6
};