-- ============================================================
-- GymOS Supabase — performance indexes (P0 fix #4)
-- Fixes COLLSCAN on admin list sort + filters
-- ============================================================

-- Admin list sorts by created_at DESC
create index if not exists codes_created_at_desc on public.codes (created_at desc);

-- Filters on used/revoked (admin table, expiry)
create index if not exists codes_used_revoked on public.codes (used, revoked);

-- Owner search (admin search box) — trigram for ILIKE
create extension if not exists pg_trgm;
create index if not exists codes_owner_trgm on public.codes using gin (owner gin_trgm_ops);

-- Gym load by code+device_id already indexed (gyms_code_device_idx), add saved_at for ETag
create index if not exists gyms_saved_at_idx on public.gyms (saved_at desc);
