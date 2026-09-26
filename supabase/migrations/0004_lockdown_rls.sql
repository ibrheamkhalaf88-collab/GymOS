-- ============================================================
-- GymOS Supabase — CRITICAL lockdown: stop direct PostgREST access
-- ============================================================
-- FINDING (verified live against the production project):
--   The public anon key ships inside the APK, the desktop build and
--   js/config.js on GitHub Pages. With RLS off and default grants, that key
--   could do all of the following against /rest/v1 directly, bypassing the
--   Edge Function completely:
--     GET    /rest/v1/codes?select=*   -> 200, every activation code
--                                         INCLUDING the bcrypt pass_hash
--     GET    /rest/v1/gyms?select=*   -> 200, every customer's members,
--                                         phone numbers and revenue ledger
--     PATCH  /rest/v1/codes           -> 200, revoke/kill any customer's access
--     DELETE /rest/v1/codes           -> 204, delete a customer outright
--     PATCH  /rest/v1/gyms            -> 200, overwrite/inject gym data
--
-- FIX: enable RLS and drop anon/authenticated grants. No policies are
-- created on purpose — with RLS enabled and zero policies, PostgREST returns
-- an empty set for reads and denies every write.
--
-- This does NOT break the app. Nothing in js/ or any HTML page talks to
-- /rest/v1 (verified by grep); every read and write goes through the Edge
-- Function, which authenticates the caller and then uses the service_role
-- key. service_role bypasses RLS by design, so the API keeps working while
-- the raw table becomes unreachable from the internet.
--
-- Apply with:  supabase db push   (or paste into Supabase → SQL Editor)
-- ============================================================

-- 1. Enable RLS on both tables.
alter table public.codes enable row level security;
alter table public.gyms enable row level security;

-- 2. Remove any policy that may have been added to allow direct client access,
--    so RLS ends up deny-by-default rather than partially open.
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename in ('codes', 'gyms')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
    raise notice 'dropped policy % on %', pol.policyname, pol.tablename;
  end loop;
end $$;

-- 3. Belt and braces: explicitly revoke table-level access from the two
--    public roles. RLS alone is the real gate; this removes the grant so the
--    tables do not even appear as readable in the PostgREST schema cache.
revoke all on public.codes from anon, authenticated;
revoke all on public.gyms from anon, authenticated;

-- 4. service_role keeps full access (it bypasses RLS, but be explicit so a
--    future GRANT change cannot quietly break the API).
grant all on public.codes to service_role;
grant all on public.gyms to service_role;

-- ============================================================
-- Housekeeping: rows whose activation code no longer exists.
-- EGAQYV and TZSAJJ were left behind when their codes were deleted — the
-- customers can no longer authenticate (a missing code is treated as revoked)
-- but their member lists, phone numbers and ledger were still stored, and
-- readable by anyone thanks to the hole closed above.
-- These statements are idempotent and only touch gym rows with no code.
-- ============================================================
delete from public.gyms g
where not exists (select 1 from public.codes c where c.code = g.code);

-- Verify after applying:
--   curl "$SUPABASE_URL/rest/v1/codes?select=code" -H "apikey: $ANON"
--     -> expected 200 with []   (readable but empty: RLS on, no policies)
--   curl -X PATCH "$SUPABASE_URL/rest/v1/codes" -H "apikey: $ANON" \
--        -H "content-type: application/json" -d '{"revoked":true}'
--     -> expected 401/403
--   POST /api/admin/login on the Edge Function -> must still return 200
--     for valid credentials and 200 for GET /api/users.
