-- ============================================================
-- GymOS Supabase — CRITICAL RLS Lockdown (Complete Version)
-- Covers: codes, gyms, coupons, drive_tokens
-- Safe to re-run (idempotent)
-- Review before applying to production!
-- ============================================================

-- ============================================================
-- PRE-FLIGHT CHECKS (run these first to verify current state)
-- ============================================================
-- Check current RLS status:
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('codes', 'gyms', 'coupons', 'drive_tokens');
-- Check current grants:
-- SELECT grantee, privilege_type FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name IN ('codes', 'gyms', 'coupons', 'drive_tokens');
-- Check current policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('codes', 'gyms', 'coupons', 'drive_tokens');

-- ============================================================
-- 1. Enable RLS on ALL tables
-- ============================================================
ALTER TABLE IF EXISTS public.codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.drive_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Drop ALL existing policies on these tables
-- ============================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' 
      AND tablename IN ('codes', 'gyms', 'coupons', 'drive_tokens')
  LOOP
    EXECUTE FORMAT('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
    RAISE NOTICE 'Dropped policy % on %', pol.policyname, pol.tablename;
  END LOOP;
END $$;

-- ============================================================
-- 3. Revoke ALL grants from anon/authenticated roles
--    (service_role bypasses RLS, so no revoke needed)
-- ============================================================
REVOKE ALL ON public.codes FROM anon, authenticated;
REVOKE ALL ON public.gyms FROM anon, authenticated;
REVOKE ALL ON public.coupons FROM anon, authenticated;
REVOKE ALL ON public.drive_tokens FROM anon, authenticated;

-- ============================================================
-- 4. Explicitly grant full access to service_role
--    (bypasses RLS by design; Edge Function uses service_role)
-- ============================================================
GRANT ALL ON public.codes TO service_role;
GRANT ALL ON public.gyms TO service_role;
GRANT ALL ON public.coupons TO service_role;
GRANT ALL ON public.drive_tokens TO service_role;

-- ============================================================
-- 5. Grant sequence access for bigserial columns (if tables exist)
-- ============================================================
DO $$
DECLARE
  seq_name TEXT;
BEGIN
  -- codes table
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'codes_id_seq') THEN
    GRANT ALL ON SEQUENCE public.codes_id_seq TO service_role;
  END IF;
  -- gyms table
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'gyms_id_seq') THEN
    GRANT ALL ON SEQUENCE public.gyms_id_seq TO service_role;
  END IF;
  -- coupons table
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'coupons_id_seq') THEN
    GRANT ALL ON SEQUENCE public.coupons_id_seq TO service_role;
  END IF;
  -- drive_tokens has no bigserial (code is PK)
END $$;

-- ============================================================
-- 6. Housekeeping: orphaned gym rows (codes deleted but gym data remains)
-- ============================================================
DELETE FROM public.gyms g
WHERE NOT EXISTS (SELECT 1 FROM public.codes c WHERE c.code = g.code);

-- ============================================================
-- 7. VERIFICATION QUERIES (run AFTER applying)
-- ============================================================
-- Expected results:
-- 1. RLS enabled on all 4 tables:
--    SELECT schemaname, tablename, rowsecurity 
--    FROM pg_tables 
--    WHERE schemaname = 'public' AND tablename IN ('codes', 'gyms', 'coupons', 'drive_tokens');
--    -> rowsecurity = true for all
--
-- 2. No policies on these tables:
--    SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('codes', 'gyms', 'coupons', 'drive_tokens');
--    -> 0 rows
--
-- 3. anon/authenticated have NO privileges:
--    SELECT grantee, privilege_type 
--    FROM information_schema.table_privileges 
--    WHERE table_schema = 'public' AND table_name IN ('codes', 'gyms', 'coupons', 'drive_tokens') 
--      AND grantee IN ('anon', 'authenticated');
--    -> 0 rows
--
-- 4. service_role has ALL privileges:
--    SELECT grantee, privilege_type 
--    FROM information_schema.table_privileges 
--    WHERE table_schema = 'public' AND table_name IN ('codes', 'gyms', 'coupons', 'drive_tokens') 
--      AND grantee = 'service_role';
--    -> INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER for each table
--
-- 5. Anon key test (should return empty array, not data):
--    curl "$SUPABASE_URL/rest/v1/codes?select=code" -H "apikey: $ANON_KEY"
--    -> 200 OK with []
--
-- 6. Anon key write test (should fail):
--    curl -X PATCH "$SUPABASE_URL/rest/v1/codes" -H "apikey: $ANON_KEY" -H "content-type: application/json" -d '{"revoked":true}'
--    -> 401/403
--
-- 7. Edge Function admin login still works:
--    POST /api/admin/login with valid credentials -> 200 OK
--
-- 8. Edge Function admin endpoints still work:
--    GET /api/users with admin JWT -> 200 OK
--    GET /api/admin/backup with admin JWT -> 200 OK

-- ============================================================
-- ROLLBACK PLAN (if something breaks)
-- ============================================================
-- If Edge Function stops working (unlikely, service_role bypasses RLS):
-- 1. Temporarily grant back to authenticated:
--    GRANT SELECT ON public.codes TO authenticated;
--    GRANT SELECT ON public.gyms TO authenticated;
--    GRANT SELECT ON public.coupons TO authenticated;
--    GRANT SELECT ON public.drive_tokens TO authenticated;
-- 2. Or disable RLS temporarily:
--    ALTER TABLE public.codes DISABLE ROW LEVEL SECURITY;
--    ALTER TABLE public.gyms DISABLE ROW LEVEL SECURITY;
--    ALTER TABLE public.coupons DISABLE ROW LEVEL SECURITY;
--    ALTER TABLE public.drive_tokens DISABLE ROW LEVEL SECURITY;
-- 3. Then investigate and re-apply correctly.

-- ============================================================
-- NOTES
-- ============================================================
-- * This migration is idempotent - safe to run multiple times
-- * No policies are created intentionally - deny-by-default is the goal
-- * service_role (used by Edge Function) bypasses RLS automatically
-- * The anon key in the APK/GitHub Pages can no longer read/write tables directly
-- * All data access MUST go through the Edge Function (gymos-api)