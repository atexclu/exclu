-- ============================================================================
-- Migration 060: Create wishlist_preset_items table
-- ============================================================================
-- Global catalogue of preset gift items managed by Exclu.
-- Creators can add these to their personal wishlist and customize the price/image.
-- Changing a preset here does NOT affect creator copies (they are independent rows).
-- ============================================================================

CREATE TABLE IF NOT EXISTS wishlist_preset_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Display
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  description TEXT CHECK (char_length(description) <= 500),
  emoji TEXT DEFAULT '🎁',
  image_url TEXT,

  -- Default price (creators can override)
  default_price_cents INTEGER NOT NULL CHECK (default_price_cents >= 100),
  currency TEXT NOT NULL DEFAULT 'USD',

  -- Ordering in the gallery
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Visibility
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Preset items are readable by everyone (used in onboarding gallery and creator dashboard)
ALTER TABLE wishlist_preset_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active preset items" ON wishlist_preset_items;
CREATE POLICY "Anyone can view active preset items"
  ON wishlist_preset_items FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Service role can manage preset items" ON wishlist_preset_items;
CREATE POLICY "Service role can manage preset items"
  ON wishlist_preset_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed the initial preset catalogue
INSERT INTO wishlist_preset_items (name, description, emoji, default_price_cents, sort_order) VALUES
  ('MacBook',            'Apple MacBook laptop',                                         '💻', 129900, 1),
  ('Louboutin',          'Christian Louboutin heels',                                    '👠',  69500, 2),
  ('Victoria''s Secret', 'Victoria''s Secret gift card',                                 '🛍️',  12500, 3),
  ('Amazon Gift Card',   'Amazon gift card',                                              '🛒',   5000, 4),
  ('Dinner Date',        'Treat me to a nice dinner out',                                '🍽️',  20000, 5),
  ('Spa Day',            'Relaxing spa & wellness day',                                  '💆',  15000, 6),
  ('Flowers',            'Beautiful bouquet delivered to me',                            '💐',   8000, 7),
  ('Perfume',            'Luxury fragrance of my choice',                                '🌸',  20000, 8);

COMMENT ON TABLE wishlist_preset_items IS 'Global catalogue of preset gift items available for creators to add to their wishlist. Managed by Exclu admins.';
