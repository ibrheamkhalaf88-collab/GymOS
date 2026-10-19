-- 0010: columns written by the soft-delete path of DELETE /api/codes/{code}
-- (supabase/functions/gymos-api/index.ts). The code wrote revoked_at /
-- revoked_by but no migration ever created them, so every soft delete
-- returned 500 INTERNAL_ERROR. Verified live on 2026-10-16: production
-- public.codes has "revoked" only. "add column if not exists" keeps this
-- idempotent for environments that got the columns manually.
alter table public.codes
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by text;

-- ROLLBACK: alter table public.codes drop column if exists revoked, drop column if exists revoked_at, drop column if exists revoked_by; (loses revocation history)
