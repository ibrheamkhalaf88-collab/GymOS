-- ============================================================
-- GymOS Supabase — server-side coupons
-- ============================================================
-- FINDING:
--   Coupons lived only in the admin browser's localStorage
--   (admin.html, key "dp_coupons"). That means:
--     * they vanish if the admin clears site data or switches browser,
--     * a coupon created on the laptop is invisible on the phone,
--     * there is no record of who redeemed what, or when,
--     * applying a coupon burned it immediately, even if the admin then
--       abandoned the subscription edit without saving.
--
-- FIX: a real table behind the Edge Function, which already authenticates
-- the admin with a JWT. Nothing in js/ or any HTML page talks to /rest/v1,
-- so the same RLS lockdown applied to codes/gyms applies here: RLS on, zero
-- policies, no grants to anon/authenticated, service_role only.
--
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.coupons (
  id          bigserial primary key,
  code        text unique not null,
  -- days_14 | days_30 | days_365 | percent
  kind        text not null default 'days_30',
  -- percent discount, 1-100; unused for the day-based kinds
  value       integer not null default 0,
  description text not null default '',
  used        boolean not null default false,
  used_at     timestamptz,
  -- which account redeemed it, so a coupon cannot be quietly reused
  used_by     text,
  created_at  timestamptz not null default now()
);

create index if not exists coupons_code_idx on public.coupons (code);
create index if not exists coupons_used_idx on public.coupons (used);

-- Same lockdown as 0004: RLS enabled with no policies means PostgREST returns
-- an empty set for reads and denies every write, even with the public anon key
-- that ships inside the APK.
alter table public.coupons enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'coupons'
  loop
    execute format('drop policy %I on public.%I', pol.policname, pol.tablename);
    raise notice 'dropped policy % on %', pol.policname, pol.tablename;
  end loop;
end $$;

revoke all on public.coupons from anon, authenticated;
grant all on public.coupons to service_role;

-- The sequence behind the bigserial needs the same treatment, otherwise a
-- later `grant all` elsewhere could leave inserts failing on nextval().
-- Guarded because create-table-if-not-exists may have skipped creation.
do $$
begin
  if exists (select 1 from pg_class where relname = 'coupons_id_seq') then
    execute 'grant all on sequence public.coupons_id_seq to service_role';
  end if;
end $$;
