-- ============================================================================
-- Migration 062: Create gift_purchases table
-- ============================================================================
-- Records every gift a fan sends to a creator via the wishlist.
-- Payment flow mirrors tips: Stripe Checkout → webhook → this table updated.
--
-- Commission rules: same as tips and link sales
--   - 5% processing fee paid by fan on top of the gift price
--   - 10% platform commission for free creators, 0% for premium
--   - Creator receives the remainder via Stripe Connect transfer
-- ============================================================================

CREATE TABLE IF NOT EXISTS gift_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  wishlist_item_id UUID NOT NULL REFERENCES wishlist_items(id) ON DELETE CASCADE,

  -- Payment
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100),
  currency TEXT NOT NULL DEFAULT 'USD',
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,

  -- Optional message from fan
  message TEXT CHECK (char_length(message) <= 500),
  is_anonymous BOOLEAN NOT NULL DEFAULT false,

  -- Status (mirrors tips)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),

  -- Commission breakdown (computed in webhook)
  platform_fee_cents INTEGER DEFAULT 0,
  creator_net_cents INTEGER DEFAULT 0,

  -- Creator notification tracking
  read_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gift_purchases_fan_id ON gift_purchases(fan_id);
CREATE INDEX IF NOT EXISTS idx_gift_purchases_creator_id ON gift_purchases(creator_id);
CREATE INDEX IF NOT EXISTS idx_gift_purchases_wishlist_item_id ON gift_purchases(wishlist_item_id);
CREATE INDEX IF NOT EXISTS idx_gift_purchases_status ON gift_purchases(status);
CREATE INDEX IF NOT EXISTS idx_gift_purchases_created_at ON gift_purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_purchases_creator_unread ON gift_purchases(creator_id, read_at) WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE gift_purchases ENABLE ROW LEVEL SECURITY;

-- Fan can view their own gift purchases
DROP POLICY IF EXISTS "Fans can view their own gift purchases" ON gift_purchases;
CREATE POLICY "Fans can view their own gift purchases"
  ON gift_purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = fan_id);

-- Creator can view all gifts they received
DROP POLICY IF EXISTS "Creators can view received gifts" ON gift_purchases;
CREATE POLICY "Creators can view received gifts"
  ON gift_purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_id);

-- Gifts are created via Edge Function (service_role) only
DROP POLICY IF EXISTS "Service role can insert gift purchases" ON gift_purchases;
CREATE POLICY "Service role can insert gift purchases"
  ON gift_purchases FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Creator can mark gifts as read
DROP POLICY IF EXISTS "Creators can mark gifts as read" ON gift_purchases;
CREATE POLICY "Creators can mark gifts as read"
  ON gift_purchases FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- Service role: full access (for webhook processing, gifted_count updates, refunds)
DROP POLICY IF EXISTS "Service role can manage gift purchases" ON gift_purchases;
CREATE POLICY "Service role can manage gift purchases"
  ON gift_purchases FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE gift_purchases IS 'Records each gift purchase from a fan to a creator via the wishlist. Payment processed via Stripe Checkout with Connect transfer. Commission identical to tips.';
