-- ============================================================
-- GymOS Supabase — Google Drive backup tokens
-- Stores encrypted OAuth tokens per activation code
-- ============================================================
-- Idempotent — safe to re-run.

create table if not exists public.drive_tokens (
  code         text primary key references public.codes(code) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at   timestamptz not null,
  scope        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- RLS lockdown (same pattern as codes/gyms/coupons)
alter table public.drive_tokens enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'drive_tokens'
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
    raise notice 'dropped policy % on %', pol.policyname, pol.tablename;
  end loop;
end $$;

revoke all on public.drive_tokens from anon, authenticated;
grant all on public.drive_tokens to service_role;

-- Index for cleanup queries
create index if not exists drive_tokens_expires_at_idx on public.drive_tokens (expires_at);
-- ROLLBACK: drop table if exists public.drive_tokens; (disconnects every Drive account — customers must re-consent)
