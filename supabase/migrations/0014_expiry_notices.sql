-- ============================================================
-- 0014: expiry-notice dedup (one email per subscription period)
-- ============================================================
-- gymos-expiry-cron runs DAILY. Without this table a customer inside the
-- notice window would receive an email EVERY DAY until expiry (13 emails for
-- a 13-day window). The function records one row per (email, sub_end) after a
-- successful send and skips pairs already recorded — so each subscription
-- period triggers exactly ONE notice. A renewal creates a NEW sub_end, which
-- makes the pair eligible again naturally. RLS ON, no policies: only the
-- service_role (Edge Functions) touches it.
--
-- ROLLBACK: drop table if exists public.expiry_notices;

create table if not exists public.expiry_notices (
  email   text        not null,
  sub_end timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (email, sub_end)
);

alter table public.expiry_notices enable row level security;
