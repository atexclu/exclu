-- ============================================================================
-- Migration 053: Add tips & custom requests settings to profiles
-- ============================================================================
-- Creators can enable/disable tips and custom requests independently,
-- and set minimum amounts for each.
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tips_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_requests_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_tip_amount_cents INTEGER DEFAULT 500,
  ADD COLUMN IF NOT EXISTS min_custom_request_cents INTEGER DEFAULT 2000;

COMMENT ON COLUMN profiles.tips_enabled IS 'Whether this creator accepts tips from fans. Default: false (opt-in).';
COMMENT ON COLUMN profiles.custom_requests_enabled IS 'Whether this creator accepts custom content requests. Default: false (opt-in).';
COMMENT ON COLUMN profiles.min_tip_amount_cents IS 'Minimum tip amount in cents. Default: $5 (500).';
COMMENT ON COLUMN profiles.min_custom_request_cents IS 'Minimum custom request amount in cents. Default: $20 (2000).';
