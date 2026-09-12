// ============================================================
// Supabase Auth Client — single instance used everywhere
// Supports: email/password sign-in, Google OAuth, sign-up,
// forgot password, session persistence.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { appConfig } from './config.js';

// prefers env vars (for Vercel deployment), falls back to js/config.js,
// then falls back to the known project URL.
const SUPABASE_URL =
  (typeof process !== 'undefined' && process.env.VITE_SUPABASE_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  appConfig.supabaseUrl ||
  'https://mwfbgucayjgbbvcyelbo.supabase.co';

const SUPABASE_ANON_KEY =
  (typeof process !== 'undefined' && process.env.VITE_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  appConfig.supabaseAnonKey ||
  '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// convenience re-export so other modules can import { supabase } from here
