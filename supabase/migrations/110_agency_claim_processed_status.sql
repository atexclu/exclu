-- ============================================================================
-- Migration 110: Update agency_claim_requests status to use 'processed'
-- ============================================================================
-- Replaces approve/reject semantics with a simple pending/processed workflow.
-- Existing approved/rejected rows are migrated to 'processed'.
-- ============================================================================

-- 1. Drop the old constraint
ALTER TABLE agency_claim_requests
  DROP CONSTRAINT IF EXISTS agency_claim_requests_status_check;

-- 2. Migrate old values
UPDATE agency_claim_requests
  SET status = 'processed'
  WHERE status IN ('approved', 'rejected');

-- 3. Add the new constraint
ALTER TABLE agency_claim_requests
  ADD CONSTRAINT agency_claim_requests_status_check
  CHECK (status IN ('pending', 'processed'));
