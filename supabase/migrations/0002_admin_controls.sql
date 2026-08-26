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
alter table public.gyms add constraint gyms_code_device_key unique (code, device_id);

create index if not exists gyms_code_device_idx on public.gyms (code, device_id);
