-- ============================================================
-- GymOS Supabase schema — admin per-code controls + multi-device
-- Applied on top of 0001_init.sql.
-- ============================================================

-- Per-code admin controls
alter table public.codes add column if not exists data_enabled  boolean not null default true;
alter table public.codes add column if not exists sync_enabled  boolean not null default true;
alter table public.codes add column if not exists device_limit  integer not null default 3;
alter table public.codes add column if not exists devices       jsonb   not null default '[]'::jsonb;

-- Gym data keyed by (code, device_id) so sync-off codes keep an
-- isolated per-device cloud copy, while sync-on codes share (device_id = '').
alter table public.gyms add column if not exists device_id text not null default '';
alter table public.gyms drop constraint if exists gyms_code_key;

-- Guarded because this migration has to be re-runnable: `db push` executes it
-- whenever the remote migration history does not already contain it, and
-- production received these DDL statements by hand (the old CI never ran
-- `db push`), so the constraint is usually already there. A bare
-- `add constraint` would abort the whole push with "already exists" and leave
-- every later migration -- including the RLS lockdown in 0004 -- unapplied.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gyms_code_device_key'
  ) then
    alter table public.gyms
      add constraint gyms_code_device_key unique (code, device_id);
  end if;
end $$;

create index if not exists gyms_code_device_idx on public.gyms (code, device_id);
