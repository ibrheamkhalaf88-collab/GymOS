-- 0011: account status + activation source tracking on codes
--
-- WHY: v1.4.5 re-enables code activation (POST /api/auth/activate) behind a
-- trusted session and needs (a) an admin-suspension mirror on the code row so
-- the code-only login path can enforce suspension without an extra admin-API
-- round-trip, and (b) an activation-source field so legacy accounts whose
-- source was never recorded display "unknown / غير معروف" instead of being
-- guessed. Additive only: no data loss, no RLS/policy changes, no resets.
-- service_role already has ALL on public.codes, so new columns are covered
-- automatically; RLS stays ON and unchanged.
--
-- ROLLBACK:
--   alter table public.codes
--     drop column if exists account_suspended,
--     drop column if exists suspended_at,
--     drop column if exists suspended_by,
--     drop column if exists source;
-- (metadata keys are additive and ignored by older code; no grant changes.)

alter table public.codes
  add column if not exists account_suspended boolean not null default false,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by text,
  add column if not exists source text;

-- NOTE: source has NO default and NO backfill on purpose. Legacy rows keep NULL
-- and the UI renders "unknown / غير معروف" (never guessed). New rows get their
-- source set explicitly by the server ('admin' | 'self' | 'trial' | 'import').
-- Do NOT rerun 0005_coupons.sql (historical typo pol.policname) — out of scope.