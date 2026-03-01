-- ============================================================================
-- Migration 066: Rework custom_requests for upfront payment (manual capture)
-- ============================================================================
-- New flow: fan pays upfront via Stripe Checkout (capture_method: manual).
-- Payment is held for up to 6 days. Creator accepts → capture, refuses → void.
-- Guests can submit requests by providing email (+password if new account).
-- ============================================================================

-- 1. Add columns for guest fan identification
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS fan_email TEXT;
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS is_new_account BOOLEAN DEFAULT false;

-- 2. Change expires_at default from 7 days to 6 days (within Stripe's 7-day auth window)
ALTER TABLE custom_requests ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '6 days');

-- 3. Update status CHECK to include pending_payment (keep legacy statuses for backward compat)
ALTER TABLE custom_requests DROP CONSTRAINT IF EXISTS custom_requests_status_check;
ALTER TABLE custom_requests ADD CONSTRAINT custom_requests_status_check
  CHECK (status IN (
    'pending_payment',  -- Checkout created, awaiting Stripe completion
    'pending',          -- Payment authorized (uncaptured), awaiting creator response
    'delivered',        -- Creator uploaded content, payment captured
    'refused',          -- Creator declined, payment voided
    'expired',          -- 6 days passed, payment voided
    'cancelled',        -- Fan cancelled or checkout abandoned
    -- Legacy statuses kept for backward compatibility
    'accepted', 'paid', 'in_progress', 'completed'
  ));

-- 4. Helper function: look up a user ID by email (used by edge functions via RPC)
CREATE OR REPLACE FUNCTION get_user_id_by_email(input_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE email = lower(input_email) LIMIT 1;
$$;

-- 5. Index on fan_email for lookups
CREATE INDEX IF NOT EXISTS idx_custom_requests_fan_email ON custom_requests(fan_email) WHERE fan_email IS NOT NULL;
