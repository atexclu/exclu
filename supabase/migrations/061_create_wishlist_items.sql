-- ============================================================================
-- Migration 061: Create wishlist_items table
-- ============================================================================
-- Each creator has their own wishlist. Items can be:
--   - Based on a preset (preset_id is set, price/image can be overridden)
--   - Fully custom (preset_id is NULL, all fields set by creator)
--
-- Gifting flow:
--   1. Fan sees wishlist on public creator page
--   2. Fan clicks "Gift 🎁" → Stripe Checkout (create-gift-checkout EF)
--   3. Payment validated → gift_purchases row inserted, gifted_count incremented
--   4. Item shows "Gifted ✓" when gifted_count >= max_quantity (if max_quantity is set)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Optional link to a preset (NULL for fully custom items)
  preset_id UUID REFERENCES wishlist_preset_items(id) ON DELETE SET NULL,

  -- Display (can override preset values)
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  description TEXT CHECK (char_length(description) <= 500),
  emoji TEXT DEFAULT '🎁',
  image_url TEXT,

  -- Pricing (can override preset default)
  price_cents INTEGER NOT NULL CHECK (price_cents >= 100),
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Quantity management
  -- NULL = unlimited gifting allowed
  max_quantity INTEGER CHECK (max_quantity IS NULL OR max_quantity >= 1),
  gifted_count INTEGER NOT NULL DEFAULT 0 CHECK (gifted_count >= 0),

  -- Display order on the creator's page
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Visibility toggle (creator can hide without deleting)
  is_visible BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wishlist_items_creator_id ON wishlist_items(creator_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_creator_visible ON wishlist_items(creator_id, is_visible);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_preset_id ON wishlist_items(preset_id);

-- Enable RLS
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read visible wishlist items (needed for creator public page)
DROP POLICY IF EXISTS "Anyone can view visible wishlist items" ON wishlist_items;
CREATE POLICY "Anyone can view visible wishlist items"
  ON wishlist_items FOR SELECT
  USING (is_visible = true);

-- Creator: can view ALL their own items (including hidden ones in dashboard)
DROP POLICY IF EXISTS "Creators can view all their own wishlist items" ON wishlist_items;
CREATE POLICY "Creators can view all their own wishlist items"
  ON wishlist_items FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_id);

-- Creator: can insert their own items
DROP POLICY IF EXISTS "Creators can insert their own wishlist items" ON wishlist_items;
CREATE POLICY "Creators can insert their own wishlist items"
  ON wishlist_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

-- Creator: can update their own items
DROP POLICY IF EXISTS "Creators can update their own wishlist items" ON wishlist_items;
CREATE POLICY "Creators can update their own wishlist items"
  ON wishlist_items FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- Creator: can delete their own items
DROP POLICY IF EXISTS "Creators can delete their own wishlist items" ON wishlist_items;
CREATE POLICY "Creators can delete their own wishlist items"
  ON wishlist_items FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- Service role: full access (for webhook gifted_count increments)
DROP POLICY IF EXISTS "Service role can manage wishlist items" ON wishlist_items;
CREATE POLICY "Service role can manage wishlist items"
  ON wishlist_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE wishlist_items IS 'Creator wishlist items. Can be based on presets or fully custom. gifted_count tracks how many times this item has been gifted.';
