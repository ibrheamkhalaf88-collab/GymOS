-- ============================================================
-- 0013: daily expiry-reminder schedule (pg_cron + pg_net)
-- ============================================================
--
-- Schedules 'gymos-expiry-daily' at 09:00 UTC every day. Each firing POSTs to
-- the gymos-expiry-cron Edge Function (/scheduled) with a Bearer secret; the
-- function answers 401 unless the header matches the CRON_SECRET function
-- secret, so a placeholder header is inert by design.
--
-- !!! SECURITY — PLACEHOLDER INTENTIONAL !!!
-- The header below carries the LITERAL token CRON_SECRET_PLACEHOLDER. The
-- real secret is NEVER committed. The orchestrator must, at deploy time:
--   1. supabase secrets set CRON_SECRET=<generated-random-value>
--   2. update the stored job header to the SAME value:
--        select cron.unschedule('gymos-expiry-daily');
--        select cron.schedule('gymos-expiry-daily', '0 9 * * *', $$
--          select net.http_post(
--            url:='https://mwfbgucayjgbbvcyelbo.functions.supabase.co/gymos-expiry-cron/scheduled',
--            headers:='{"Authorization":"Bearer <REAL_CRON_SECRET>"}'::jsonb,
--            body:='{}'::jsonb);
--        $$);
-- Until then every firing receives 401 and sends nothing — safe to land,
-- useless until the secret is set.
--
-- Inspect/verify:
--   select jobname, schedule, command from cron.job where jobname = 'gymos-expiry-daily';
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- ROLLBACK:
--   select cron.unschedule('gymos-expiry-daily');
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent re-schedule: drop any previous definition first so the command
-- (and its header) always match THIS migration.
select cron.unschedule('gymos-expiry-daily')
where exists (select 1 from cron.job where jobname = 'gymos-expiry-daily');

select cron.schedule(
  'gymos-expiry-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url:='https://mwfbgucayjgbbvcyelbo.functions.supabase.co/gymos-expiry-cron/scheduled',
    headers:='{"Authorization":"Bearer CRON_SECRET_PLACEHOLDER"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);

-- Audit-trail documentation row (idempotent — never duplicated on re-runs).
insert into public.admin_audit_log (admin_email, action, target_type, target_id, details)
select 'expiry-cron', 'expiry_cron_scheduled', 'system', 'gymos-expiry-daily',
       jsonb_build_object(
         'schedule', '0 9 * * *',
         'function', 'gymos-expiry-cron/scheduled',
         'secret_state', 'PLACEHOLDER — orchestrator must set CRON_SECRET and update the cron header at deploy'
       )
where not exists (
  select 1 from public.admin_audit_log where action = 'expiry_cron_scheduled'
);
