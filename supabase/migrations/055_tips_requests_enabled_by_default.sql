-- ============================================================================
-- Migration 055: Enable tips & custom requests by default for all creators
-- ============================================================================
-- Previously these were opt-in (DEFAULT false). Changing to opt-out (DEFAULT true)
-- so all creators automatically have these features enabled on their profile.
-- Also updates all existing profiles to enable these features.
-- ============================================================================

-- Update existing profiles
UPDATE profiles SET tips_enabled = true WHERE tips_enabled = false OR tips_enabled IS NULL;
UPDATE profiles SET custom_requests_enabled = true WHERE custom_requests_enabled = false OR custom_requests_enabled IS NULL;

-- Change column defaults for future signups
ALTER TABLE profiles ALTER COLUMN tips_enabled SET DEFAULT true;
ALTER TABLE profiles ALTER COLUMN custom_requests_enabled SET DEFAULT true;
