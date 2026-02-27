-- ============================================================================
-- Migration 051: Create tips table
-- ============================================================================
-- Tips are direct monetary gifts from fans to creators, with an optional
-- message. Payment goes through Stripe Checkout → creator's Connect account.
-- Commission follows the same rules as link sales (10% free / 0% premium + 5% processing).
-- ============================================================================

CREATE TABLE IF NOT EXISTS tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Payment
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100),
  currency TEXT NOT NULL DEFAULT 'USD',
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,

  -- Content
  message TEXT CHECK (char_length(message) <= 500),
  is_anonymous BOOLEAN DEFAULT false,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),

  -- Commission breakdown
  platform_fee_cents INTEGER DEFAULT 0,
  creator_net_cents INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,

  -- Creator read tracking
  read_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tips_fan_id ON tips(fan_id);
CREATE INDEX IF NOT EXISTS idx_tips_creator_id ON tips(creator_id);
CREATE INDEX IF NOT EXISTS idx_tips_status ON tips(status);
CREATE INDEX IF NOT EXISTS idx_tips_created_at ON tips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_creator_unread ON tips(creator_id, read_at) WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;

-- Fan can view their own tips
DROP POLICY IF EXISTS "Fans can view their own tips" ON tips;
CREATE POLICY "Fans can view their own tips"
  ON tips FOR SELECT
  TO authenticated
  USING (auth.uid() = fan_id);

-- Creator can view tips they received
DROP POLICY IF EXISTS "Creators can view received tips" ON tips;
CREATE POLICY "Creators can view received tips"
  ON tips FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_id);

-- Tips are created via Edge Function (service_role), not directly by users.
-- Fan INSERT is restricted to prevent direct DB manipulation.
DROP POLICY IF EXISTS "Service role can insert tips" ON tips;
CREATE POLICY "Service role can insert tips"
  ON tips FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Creator can update read_at (mark as read)
DROP POLICY IF EXISTS "Creators can mark tips as read" ON tips;
CREATE POLICY "Creators can mark tips as read"
  ON tips FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

COMMENT ON TABLE tips IS 'Monetary tips from fans to creators. Created via Edge Function after Stripe Checkout. Commission matches link sales rules.';
