-- ============================================================
-- 0012: admin 2FA storage + contact-message resolution
-- ============================================================
--
-- 1) public.admin_2fa — TOTP secrets for the admin panel (opt-in feature,
--    DEFAULT OFF). One row per admin email; gymos-api manages it exclusively:
--      POST /api/admin/2fa/setup    -> fresh secret (enabled stays false)
--      POST /api/admin/2fa/enable   -> verify a live code, arm + mint recovery codes
--      POST /api/admin/2fa/disable  -> verify, then delete the row
--    With no ENABLED row the /api/admin/login gate is a no-op, so the owner
--    can never be locked out by this table's mere existence.
--
-- 2) public.contact_messages (created by 0006) gains resolution tracking for
--    the new admin inbox endpoints:
--      GET   /api/admin/contact-messages
--      PATCH /api/admin/contact-messages/resolve
--    Both columns are ADD COLUMN IF NOT EXISTS — guarded, idempotent.
--
-- ROLLBACK:
--   drop table if exists public.admin_2fa;
--   alter table public.contact_messages
--     drop column if exists resolved_at,
--     drop column if exists resolved;
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_2fa (
  admin_email    TEXT PRIMARY KEY,
  secret         TEXT NOT NULL,
  enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_codes JSONB NOT NULL DEFAULT '[]'::jsonb,  -- bcrypt hashes, never plaintext
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS ON with ZERO policies: only the gymos-api Edge Function (service_role)
-- may read/write. anon/authenticated get nothing (0008/0009 lockdown pattern).
ALTER TABLE public.admin_2fa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_2fa FROM anon, authenticated;
GRANT ALL ON public.admin_2fa TO service_role;

-- contact_messages resolution columns (guarded, additive).
ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- ============================================================
-- VERIFICATION (run after applying):
--   SELECT schemaname, tablename, rowsecurity FROM pg_tables
--     WHERE schemaname='public' AND tablename IN ('admin_2fa','contact_messages');
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='contact_messages'
--       AND column_name IN ('resolved','resolved_at');
--   SELECT grantee, privilege_type FROM information_schema.table_privileges
--     WHERE table_schema='public' AND table_name='admin_2fa'
--       AND grantee IN ('anon','authenticated');  -- must return ZERO rows
-- ============================================================
