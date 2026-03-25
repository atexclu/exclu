-- ============================================================================
-- Migration 111: Agency Contact Form Refactor
-- ============================================================================
-- Transforms agency_claim_requests into a unified contact request system.
-- Adds fields for WhatsApp, Telegram, monthly revenue, and creator agency support.
-- Expands status to allow 'approved' and 'rejected' for creator agency contacts.
-- ============================================================================

-- 1. Add new contact form fields
ALTER TABLE agency_claim_requests
  ADD COLUMN IF NOT EXISTS requester_whatsapp text,
  ADD COLUMN IF NOT EXISTS requester_telegram text,
  ADD COLUMN IF NOT EXISTS requester_monthly_revenue text,
  ADD COLUMN IF NOT EXISTS agency_profile_email text,   -- creator's auth email (for approval forwarding)
  ADD COLUMN IF NOT EXISTS is_creator_agency boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_agency_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agency_name text;            -- denormalized for display (both agency types)

-- 2. Make agency_id nullable so profile-based agencies can also submit requests
ALTER TABLE agency_claim_requests
  ALTER COLUMN agency_id DROP NOT NULL;

-- 3. Expand the status constraint:
--    - Directory agencies:  pending → processed
--    - Creator agencies:    pending → approved | rejected
ALTER TABLE agency_claim_requests
  DROP CONSTRAINT IF EXISTS agency_claim_requests_status_check;

ALTER TABLE agency_claim_requests
  ADD CONSTRAINT agency_claim_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'processed'));

-- 4. Index for profile agency lookups
CREATE INDEX IF NOT EXISTS idx_agency_claim_requests_profile
  ON agency_claim_requests(profile_agency_id)
  WHERE profile_agency_id IS NOT NULL;
