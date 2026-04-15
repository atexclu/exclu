-- 134_signup_hardening.sql
-- Phase 2A: tables supporting the check-signup-allowed preflight edge function.
--
-- - signup_attempts: every signup preflight attempt (allowed / blocked)
--   is logged here with IP, device fingerprint, and outcome. Used by the
--   cooldown check and by admins for after-the-fact auditing / soft-ban.
-- - disposable_email_domains: open-source blacklist of throwaway-email
--   domains, seeded via scripts/seed-disposable-domains.ts.
--
-- Both tables are written exclusively by the check-signup-allowed edge fn
-- using service_role (bypasses RLS). Read access is admin-only via the
-- public.is_admin() function shipped by migration 122.

create table if not exists public.signup_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip inet not null,
  device_fingerprint text,
  user_agent text,
  outcome text not null check (outcome in (
    'allowed',
    'blocked_rate',
    'blocked_disposable',
    'blocked_fingerprint',
    'blocked_captcha',
    'blocked_bot',
    'blocked_internal_secret',
    'failed_validation',
    'completed'
  )),
  block_reason text,
  created_at timestamptz not null default now()
);

-- Indexes match the query patterns in check-signup-allowed:
-- - cooldown lookup by ip + recency
-- - cooldown lookup by fingerprint + recency
-- - admin audit by email + recency
create index if not exists signup_attempts_ip_idx
  on public.signup_attempts(ip, created_at desc);
create index if not exists signup_attempts_fp_idx
  on public.signup_attempts(device_fingerprint, created_at desc)
  where device_fingerprint is not null;
create index if not exists signup_attempts_email_idx
  on public.signup_attempts(email, created_at desc);

create table if not exists public.disposable_email_domains (
  domain text primary key,
  source text,
  added_at timestamptz not null default now()
);

alter table public.signup_attempts enable row level security;
alter table public.disposable_email_domains enable row level security;

-- Admin-only read. No insert/update/delete policies: service_role bypasses
-- RLS, and no other role should ever touch these tables.
drop policy if exists "admins read signup attempts" on public.signup_attempts;
create policy "admins read signup attempts" on public.signup_attempts
  for select using (public.is_admin());

drop policy if exists "admins read disposable domains" on public.disposable_email_domains;
create policy "admins read disposable domains" on public.disposable_email_domains
  for select using (public.is_admin());
