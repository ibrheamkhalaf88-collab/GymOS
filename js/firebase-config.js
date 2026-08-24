// ============================================================
// Firebase initialization (Auth + Firestore)
// ⚠️ ضع إعدادات مشروع Firebase الخاص بك في js/config.js → firebaseConfig
// حتى يتم ذلك، يعمل التطبيق بوضع تجريبي محلي (DEMO MODE)
// اتبع الخطوات في SETUP.md
// ============================================================

import { appConfig } from "./config.js";

const firebaseConfig = {
  apiKey: "PLACEHOLDER_API_KEY",
  authDomain: "PLACEHOLDER_AUTH_DOMAIN",
  projectId: "PLACEHOLDER_PROJECT_ID",
  storageBucket: "PLACEHOLDER_STORAGE_BUCKET",
  messagingSenderId: "PLACEHOLDER_MESSAGING_SENDER_ID",
  appId: "PLACEHOLDER_APP_ID",
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== "PLACEHOLDER_API_KEY";

let auth = null;
let db = null;

if (isFirebaseConfigured) {
  try {
    const [{ initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"),
    ]);
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.info("[Digital Pulse] Firebase initialized.");
  } catch (err) {
    console.error("[Digital Pulse] Failed to init Firebase, falling back to demo mode.", err);
  }
}

export const onlineMode = () => isFirebaseConfigured && !!db;
export { auth, db, appConfig };