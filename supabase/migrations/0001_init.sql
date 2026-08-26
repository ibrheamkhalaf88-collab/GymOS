-- ============================================================
-- GymOS — Supabase schema
-- Replaces the old MongoDB collections (codes, gyms).
-- Run this in Supabase → SQL Editor, or it is applied automatically
-- by the deploy script.
-- ============================================================

create table if not exists public.codes (
  id            bigserial primary key,
  code          text unique not null,
  tier          text not null default 'monthly',
  days          integer not null default 30,
  owner         text not null default '',
  note          text not null default '',
  pass_hash     text,
  used          boolean not null default false,
  revoked       boolean not null default false,
  used_at       timestamptz,
  used_device   text,
  used_device_name text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.gyms (
  id         bigserial primary key,
  code       text unique not null,
  data       jsonb not null default '{}'::jsonb,
  saved_at   timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists codes_code_idx on public.codes (code);
create index if not exists gyms_code_idx on public.gyms (code);
