// ============================================================
// Firebase config stub — MIGRATED TO SUPABASE
// This file is kept only for backward compatibility.
// All authentication now goes through the Supabase Edge Function
// defined in supabase/functions/gymos-api/index.ts
// ============================================================

import { appConfig } from "./config.js";

const firebaseConfig = { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };

export const isFirebaseConfigured = false;
export const onlineMode = () => false;
export { appConfig };