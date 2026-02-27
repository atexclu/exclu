-- ============================================================================
-- Migration 052: Create custom_requests table
-- ============================================================================
-- Custom requests allow fans to ask creators for personalized content
-- with a proposed price. The workflow is:
--   1. Fan submits request + proposed amount (min $20)
--   2. Creator accepts (optionally adjusts amount) or refuses
--   3. If accepted, fan pays via Stripe Checkout
--   4. Creator delivers content (attaches a link)
--   5. Auto-expires after 7 days if creator doesn't respond
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Request details
  description TEXT NOT NULL CHECK (char_length(description) >= 10 AND char_length(description) <= 2000),
  proposed_amount_cents INTEGER NOT NULL CHECK (proposed_amount_cents >= 2000),
  final_amount_cents INTEGER CHECK (final_amount_cents >= 2000 OR final_amount_cents IS NULL),
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Creator response
  creator_response TEXT CHECK (char_length(creator_response) <= 1000),

  -- Payment (after acceptance)
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,

  -- Commission breakdown
  platform_fee_cents INTEGER DEFAULT 0,
  creator_net_cents INTEGER DEFAULT 0,

  -- Delivery
  delivery_link_id UUID REFERENCES links(id) ON DELETE SET NULL,
  delivered_at TIMESTAMPTZ,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',      -- Fan submitted, creator hasn't responded
      'accepted',     -- Creator accepted, awaiting fan payment
      'paid',         -- Fan paid after acceptance
      'in_progress',  -- Creator preparing content
      'delivered',    -- Content delivered via link
      'completed',    -- Confirmed complete (auto after 7d post-delivery or fan confirms)
      'refused',      -- Creator refused
      'expired',      -- Auto-refused after 7 days without response
      'cancelled'     -- Fan cancelled before payment
    )),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),

  -- Creator read tracking
  read_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_requests_fan_id ON custom_requests(fan_id);
CREATE INDEX IF NOT EXISTS idx_custom_requests_creator_id ON custom_requests(creator_id);
CREATE INDEX IF NOT EXISTS idx_custom_requests_status ON custom_requests(status);
CREATE INDEX IF NOT EXISTS idx_custom_requests_expires_at ON custom_requests(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_custom_requests_created_at ON custom_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_requests_creator_unread ON custom_requests(creator_id, read_at) WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE custom_requests ENABLE ROW LEVEL SECURITY;

-- Fan can view their own requests
DROP POLICY IF EXISTS "Fans can view their own requests" ON custom_requests;
CREATE POLICY "Fans can view their own requests"
  ON custom_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = fan_id);

-- Creator can view requests they received
DROP POLICY IF EXISTS "Creators can view received requests" ON custom_requests;
CREATE POLICY "Creators can view received requests"
  ON custom_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_id);

-- Requests are created via Edge Function (service_role) to enforce validation
DROP POLICY IF EXISTS "Service role can insert requests" ON custom_requests;
CREATE POLICY "Service role can insert requests"
  ON custom_requests FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Creator can update status (accept/refuse) and delivery info
DROP POLICY IF EXISTS "Creators can update received requests" ON custom_requests;
CREATE POLICY "Creators can update received requests"
  ON custom_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- Fan can cancel their own pending requests
DROP POLICY IF EXISTS "Fans can cancel their pending requests" ON custom_requests;
CREATE POLICY "Fans can cancel their pending requests"
  ON custom_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = fan_id AND status = 'pending')
  WITH CHECK (auth.uid() = fan_id AND status = 'cancelled');

-- Service role can update any request (for webhook processing, expiry cron)
DROP POLICY IF EXISTS "Service role can update requests" ON custom_requests;
CREATE POLICY "Service role can update requests"
  ON custom_requests FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE custom_requests IS 'Custom content requests from fans to creators. Follows a multi-step workflow: submit → accept/refuse → pay → deliver → complete. Auto-expires after 7 days.';
