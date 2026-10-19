-- ============================================================
-- 0015: Drive backup visibility (fixes silent backup stoppage)
-- ============================================================
-- QA A8 finding: a pulled/revoked Drive token stopped backups SILENTLY and
-- forever, with no admin-visible signal. POST /backup (client-driven) now
-- stamps drive_tokens.last_backup_at after each successful upload, and the
-- admin panel reads it via GET /api/admin/drive-status so the owner sees
-- "connected but never backed up" / "stale N days" per account.
--
-- ROLLBACK:
--   alter table public.drive_tokens drop column if exists last_backup_at;

alter table public.drive_tokens
  add column if not exists last_backup_at timestamptz;
