-- ============================================================
-- GymOS Supabase — Admin Audit Log & Centralized Error Log
-- Separate tables for security and debugging
-- ============================================================

-- ============================================================
-- 1. Admin Audit Log — tracks all admin actions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  admin_email   TEXT NOT NULL,
  action        TEXT NOT NULL,           -- 'view_user', 'suspend_user', 'create_code', 'backup', 'restore', 'login', etc.
  target_type   TEXT,                    -- 'user', 'code', 'coupon', 'gym_data', 'system'
  target_id     TEXT,                    -- user_id, code, coupon_code, etc.
  details       JSONB,                   -- sanitized details (NO passwords, tokens, PII)
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_email_idx ON public.admin_audit_log (admin_email);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx ON public.admin_audit_log (action);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON public.admin_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);

-- RLS Lockdown (same pattern as other tables)
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_audit_log' LOOP
    EXECUTE FORMAT('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
GRANT ALL ON SEQUENCE public.admin_audit_log_id_seq TO service_role;

-- ============================================================
-- 2. Centralized Error Log — application errors with context
--    Separate from audit log: this is for debugging, not security tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.error_log (
  id            BIGSERIAL PRIMARY KEY,
  -- Request context
  endpoint      TEXT NOT NULL,           -- API path that errored
  method        TEXT NOT NULL,           -- HTTP method
  -- Error details
  error_code    TEXT,                    -- e.g., 'WRONG_PASSWORD', 'RATE_LIMITED', 'INTERNAL_ERROR'
  error_message TEXT NOT NULL,           -- sanitized (no passwords, tokens, PII)
  stack_trace   TEXT,                    -- sanitized stack trace
  -- User context (minimal, for correlation)
  user_code     TEXT,                    -- activation code if applicable (hashed/partial)
  user_id       TEXT,                    -- auth user id if available (hashed/partial)
  gym_code      TEXT,                    -- gym code if applicable
  -- Request metadata
  ip_address    INET,
  user_agent    TEXT,
  request_body  JSONB,                   -- SANITIZED (no passwords, tokens, PII)
  -- Resolution
  resolved      BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT,
  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS error_log_endpoint_idx ON public.error_log (endpoint);
CREATE INDEX IF NOT EXISTS error_log_error_code_idx ON public.error_log (error_code);
CREATE INDEX IF NOT EXISTS error_log_user_code_idx ON public.error_log (user_code);
CREATE INDEX IF NOT EXISTS error_log_created_at_idx ON public.error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS error_log_resolved_idx ON public.error_log (resolved) WHERE resolved = FALSE;

-- RLS Lockdown
ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'error_log' LOOP
    EXECUTE FORMAT('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;
REVOKE ALL ON public.error_log FROM anon, authenticated;
GRANT ALL ON public.error_log TO service_role;
GRANT ALL ON SEQUENCE public.error_log_id_seq TO service_role;

-- ============================================================
-- 3. Helper function to sanitize error data (for use in Edge Function)
-- ============================================================
-- This function removes sensitive fields from JSON objects before logging
CREATE OR REPLACE FUNCTION public.sanitize_for_logging(input JSONB) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  sensitive_keys CONSTANT TEXT[] := ARRAY[
    'password', 'pass_hash', 'new_password', 'current_password', 'next_password',
    'token', 'access_token', 'refresh_token', 'auth_token', 'jwt', 'authorization',
    'secret', 'key', 'api_key', 'apikey',
    'credit_card', 'card_number', 'cvv', 'ssn', 'national_id',
    'phone', 'mobile', 'telephone', 'address', 'location'
  ];
  result JSONB := input;
  key TEXT;
BEGIN
  IF input IS NULL OR jsonb_typeof(input) <> 'object' THEN
    RETURN input;
  END IF;
  FOREACH key IN ARRAY sensitive_keys LOOP
    IF result ? key THEN
      result := result - key || jsonb_build_object(key, '***REDACTED***');
    END IF;
  END LOOP;
  RETURN result;
END $$;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Run after applying:
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('admin_audit_log', 'error_log');
-- SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('admin_audit_log', 'error_log');
-- SELECT grantee, privilege_type FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name IN ('admin_audit_log', 'error_log') AND grantee IN ('anon', 'authenticated', 'service_role');

-- ============================================================
-- USAGE NOTES
-- ============================================================
-- Admin Audit Log: Write from admin endpoints after successful operations
--   Example: INSERT INTO admin_audit_log (admin_email, action, target_type, target_id, details, ip_address, user_agent) VALUES (...)
-- 
-- Error Log: Write from catch blocks in Edge Function
--   Example: INSERT INTO error_log (endpoint, method, error_code, error_message, stack_trace, user_code, ip_address, user_agent, request_body) VALUES (...)
--   Use public.sanitize_for_logging() on request_body before inserting
-- 
-- Admin endpoints to read logs:
--   GET /api/admin/audit-log?q=&page=&perPage=&action=&target_type=
--   GET /api/admin/errors?q=&page=&perPage=&error_code=&endpoint=&resolved=
-- 
-- Both are ADMIN ONLY (require admin JWT)
-- ROLLBACK: drop table if exists public.admin_error_log; drop table if exists public.admin_audit_log; (loses the audit trail — compliance risk)
