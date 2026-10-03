// ============================================================
// Digital Pulse — Shared Constants
// Single source of truth for all magic numbers, strings, keys
// ============================================================

// ---- Time ----
export const DAY_MS = 86400000;
export const HOUR_MS = 3600000;
export const MINUTE_MS = 60000;
export const WEEK_MS = 7 * DAY_MS;
export const MONTH_MS = 30 * DAY_MS;
export const YEAR_MS = 365 * DAY_MS;

// ---- JWT / Session ----
export const JWT_EXPIRY_CLIENT = '30d';
export const JWT_EXPIRY_ADMIN = '12h';
export const SESSION_AUTOLOGIN_MS = 30 * DAY_MS; // 30 days

// ---- Rate Limiting ----
export const LOGIN_MAX_ATTEMPTS = 8;
export const LOGIN_LOCKOUT_MS = 15 * MINUTE_MS;
export const ACTIVATION_MAX_ATTEMPTS = 20;
export const TRIAL_MAX_PER_IP = 3;
export const TRIAL_WINDOW_MS = 24 * HOUR_MS;

// ---- Pagination ----
export const CODE_PAGE_SIZE = 100;
export const CODE_MAX_PAGES = 20; // 2000 codes max
export const USER_PAGE_SIZE = 200;
export const USER_MAX_PAGES = 25; // 5000 users max
export const COUPON_PAGE_SIZE = 100;
export const ADMIN_CODE_PAGE_SIZE = 50;

// ---- Storage Keys (localStorage / sessionStorage) ----
export const STORAGE_KEYS = {
  // License & auth
  LICENSE: 'dp_license',
  CURRENT_USER: 'dp_current_user',
  DEVICE_ID: 'dp_device_id',
  JWT: 'dp_jwt',
  JWT_EXPIRY: 'dp_jwt_exp',
  CLOUD_ENABLED: 'dp_cloud',
  PENDING_SYNC: 'dp_pending_sync',
  CODES_CACHE: 'dp_codes_cache',
  LICENSE_MODE: 'dp_license_mode',
  
  // Onboarding & settings
  ONBOARDED: 'dp_onboarded',
  LANGUAGE: 'dp_lang',
  PLAN_PRICES: 'dp_plan_prices',
  GYM_NAME: 'dp_gym_name',
  TRIAL_USED: 'dp_trial_used',
  TRIAL_DEVICE: 'dp_trial_device',
  WELCOME_SHOWN: 'dp_welcome_shown',
  
  // Admin
  ADMIN_TOKEN: 'dp_admin_token',
  DEMO_ADMIN: 'dp_demo_admin',
  ADMIN_PW_HASH: 'dp_demo_admin_pw_hash',
  
  // OAuth
  OAUTH_DEEPLINK_HANDLED: 'dp_oauth_deeplink_handled',
  IOS_HINT_DISMISSED: 'dp_ios_hint_dismissed',
  
  // Rate limiting
  LOGIN_LOCK: 'dp_login_lock',
  
  // Data collections (per-account prefixed)
  COLLECTIONS: ['members', 'devices', 'trainers', 'ledger', 'checkins', 'notifications', 'audit_log'],
  TOMBSTONES: 'dp_tombstones',
  AUDIT_LOG: 'dp_audit_log',
  AUDIT_MAX: 5000,
  SEEDED: 'dp_seeded',
  LEGACY_MIGRATED: 'dp_legacy_migrated',
};

// Re-export COLLECTIONS for direct imports
export const COLLECTIONS = ['members', 'devices', 'trainers', 'ledger', 'checkins', 'notifications', 'audit_log'];

// Re-export AUDIT_MAX for direct imports
export const AUDIT_MAX = 5000;

// ---- Activation Code ----
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_FORMAT_REGEX = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;
export const CODE_RAW_REGEX = /^[A-Z0-9]{6}$/;

// ---- Plans & Pricing ----
export const PLAN_PRICES_KEY = 'dp_plan_prices';

export const PLAN_DEFAULTS = {
  half: { key: 'half', en: 'Half', ar: 'نص', defaultPrice: 9, days: 15 },
  regular: { key: 'regular', en: 'Regular', ar: 'عادي', defaultPrice: 29, days: 30 },
  pro: { key: 'pro', en: 'Pro', ar: 'اخترافي', defaultPrice: 49, days: 30 },
};

export const PLAN_KEYS = Object.keys(PLAN_DEFAULTS);
export const TIER_LABELS = {
  trial: { en: 'TRIAL', ar: 'تجربة', icon: '🎁' },
  monthly: { en: 'MONTHLY', ar: 'شهرية', icon: '📅' },
  yearly: { en: 'YEARLY', ar: 'سنوية', icon: '🗓️' },
  lifetime: { en: 'LIFETIME', ar: 'دائمة', icon: '♾️' },
  standard: { en: 'STANDARD', ar: 'عادية', icon: '🔑' },
  vip: { en: 'VIP', ar: 'مميزة', icon: '💎' },
  guest: { en: 'GUEST', ar: 'زائر', icon: '👤' },
  half: { en: 'HALF', ar: 'نص', icon: '🔹' },
  regular: { en: 'REGULAR', ar: 'عادي', icon: '✅' },
  pro: { en: 'PRO', ar: 'اخترافي', icon: '⭐' },
};

// ---- License Tiers ----
export const LICENSE_TIERS = {
  monthly: { days: 30, label: TIER_LABELS.monthly },
  yearly: { days: 365, label: TIER_LABELS.yearly },
  lifetime: { days: 0, label: TIER_LABELS.lifetime },
  standard: { days: 30, label: TIER_LABELS.standard },
  vip: { days: 30, label: TIER_LABELS.vip },
  guest: { days: 1, label: TIER_LABELS.guest },
  trial: { days: 14, label: TIER_LABELS.trial },
};

// ---- Device Limits ----
export const DEFAULT_DEVICE_LIMIT = 3;
export const MAX_DEVICE_LIMIT = 20;
export const MIN_DEVICE_LIMIT = 1;

// ---- Coupon Kinds ----
export const COUPON_KINDS = {
  days_14: { days: 14, tier: 'trial', label: { en: 'Free 2 weeks', ar: 'أسبوعين مجاناً' } },
  days_30: { days: 30, tier: 'monthly', label: { en: 'Free 1 month', ar: 'شهر مجاني' } },
  days_365: { days: 365, tier: 'yearly', label: { en: 'Free 1 year', ar: 'سنة مجانية' } },
  percent: { days: 0, tier: null, label: { en: 'Percentage discount', ar: 'نسبة مئوية' } },
};

// ---- Sync Intervals ----
export const CLOUD_SAVE_DEBOUNCE_MS = 1500;
export const SYNC_INTERVAL_MS = 20000;
export const CODES_SYNC_INTERVAL_MS = 60000;
export const ACCESS_CHECK_INTERVAL_MS = 60000;

// ---- Access States ----
export const ACCESS_STATES = {
  FULL: 'full',
  READONLY: 'readonly',
  LOCKED: 'locked',
};

// ---- Member Status ----
export const MEMBER_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  TRIAL: 'trial',
  FROZEN: 'frozen',
};

// ---- Device Maintenance Status ----
export const MAINTENANCE_STATUS = {
  PENDING: 'pending',
  IN_REPAIR: 'in-repair',
  COMPLETED: 'completed',
};

// ---- Ledger Types ----
export const LEDGER_TYPES = {
  REVENUE: 'revenue',
  EXPENSE: 'expense',
};

export const LEDGER_CATEGORIES = {
  SUBSCRIPTIONS: 'subscriptions',
  MAINTENANCE: 'maintenance',
  SALARY: 'salary',
  ADVANCE: 'advance',
  POS: 'pos',
  OTHER_INCOME: 'other-income',
  FAILED: 'failed',
};

// ---- Colors (matching CSS variables) ----
export const COLORS = {
  VOLT: '#CCFF00',
  VOLT_DIM: 'rgba(204, 255, 0, 0.15)',
  ALERT: '#FF3366',
  ALERT_DIM: 'rgba(255, 51, 102, 0.15)',
  FROST: '#9BAFBC',
  FROST_DIM: 'rgba(155, 175, 188, 0.1)',
  SURFACE: '#171717',
  BG: '#000000',
  TEXT_PRIMARY: '#FAFAFA',
  TEXT_SECONDARY: '#B3B3B3',
  TEXT_MUTED: '#737373',
};

// ---- API Endpoints ----
export const API_ENDPOINTS = {
  HEALTH: '/api/health',
  ACTIVATE: '/api/auth/activate',
  LOGIN: '/api/auth/login',
  SET_PASSWORD: '/api/auth/set-password',
  CHANGE_PASSWORD: '/api/auth/change-password',
  MINE: '/api/auth/mine',
  TRIAL: '/api/trial',
  GYM: '/api/gym',
  CODES: '/api/codes',
  CODE_REVOKE: (code) => `/api/codes/${code}/revoke`,
  CODE_OWNER: (code) => `/api/codes/${code}/owner`,
  CODE_RESET_PW: (code) => `/api/codes/${code}/reset-password`,
  CODE_DATA: (code) => `/api/codes/${code}/data`,
  CODE_SYNC: (code) => `/api/codes/${code}/sync`,
  CODE_LIMIT: (code) => `/api/codes/${code}/limit`,
  CODE_DELETE: (code) => `/api/codes/${code}`,
  ADMIN_LOGIN: '/api/admin/login',
  USERS: '/api/users',
  USER_CONFIRM_EMAIL: '/api/users/confirm-email',
  USER_BY_ID: (id) => `/api/users/${id}`,
  COUPONS: '/api/coupons',
  COUPON_BY_CODE: (code) => `/api/coupons/${code}`,
  COUPON_REDEEM: '/api/coupons/redeem',
  COUPON_RELEASE: '/api/coupons/release',
  CONTACT: '/api/contact',
};

// ---- Deep Links ----
export const DEEPLINK_SCHEME = 'com.digitalpulse.gym://';
export const DEEPLINK_CALLBACK = 'com.digitalpulse.gym://auth/callback.html';

// ---- Validation Limits ----
export const VALIDATION = {
  NAME_MIN: 2,
  NAME_MAX: 40,
  PHONE_MAX: 20,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 72,
  NOTE_MAX: 200,
  CODE_NOTE_MAX: 140,
  COUPON_DESC_MAX: 200,
  GYM_NAME_MAX: 40,
  TAG_MAX: 20,
  AMOUNT_MAX: 1000000,
  DAYS_MIN: 1,
  DAYS_MAX: 1095, // 3 years
  DEVICE_NAME_MAX: 40,
  CUSTOM_CODE_MAX: 6,
  COUPON_CODE_MAX: 32,
};

// ---- Animations ----
export const ANIMATION = {
  FAST: 120,
  BASE: 200,
  SLOW: 350,
  STAGGER_DELAY: 50,
};

// ---- Breakpoints ----
export const BREAKPOINTS = {
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
};