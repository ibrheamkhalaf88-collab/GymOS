// ============================================================
// Supabase Auth Client — single instance used everywhere
// Supports: email/password sign-in, Google OAuth, sign-up,
// forgot password, session persistence.
// ============================================================
import { appConfig } from './config.js';

// The UMD build (vendor/supabase-js.js) exposes window.supabase with all
// exports (createClient, SupabaseClient, etc.). Load it as a classic script
// BEFORE any module that imports this file, e.g.:
//   <script src="vendor/supabase-js.js"></script>
const createClient = (globalThis.supabase && globalThis.supabase.createClient) || null;

// prefers env vars (for Vercel deployment), falls back to js/config.js,
// then falls back to the known project URL.
const SUPABASE_URL =
  (typeof process !== 'undefined' && process.env.VITE_SUPABASE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  appConfig.supabaseUrl ||
  '';

const SUPABASE_ANON_KEY =
  (typeof process !== 'undefined' && process.env.VITE_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  appConfig.supabaseAnonKey ||
  '';

// Never throw at module load: if Supabase isn't configured (local/demo mode) we
// export null and every caller falls back to its offline/demo path.
let supabase = null;
try {
  if (createClient && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.warn('[supabase-client] Supabase not configured — running in demo mode.');
  }
} catch (err) {
  console.warn('[supabase-client] init failed — running in demo mode:', err?.message || err);
}

export { supabase };
