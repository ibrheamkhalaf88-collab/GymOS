-- ============================================================
-- 0016: OTP verification codes for email verification
-- ============================================================
-- Stores 6-digit OTP codes sent to emails for verification.
-- Used by /api/auth/send-otp and /api/auth/verify-otp.
--
-- ROLLBACK:
--   drop table if exists public.otp_codes;

create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_otp_codes_email on public.otp_codes(email);
create index if not exists idx_otp_codes_expires on public.otp_codes(expires_at);

-- RLS: only service role can access (no policies = service role only)
alter table public.otp_codes enable row level security;