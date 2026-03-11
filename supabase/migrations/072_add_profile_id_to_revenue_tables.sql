-- Migration 072: Add profile_id to revenue/interaction tables for multi-profile attribution
-- This allows tracking which specific creator profile generated each revenue event

-- 1. Add profile_id column to tips
ALTER TABLE tips ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES creator_profiles(id) ON DELETE SET NULL;

-- 2. Add profile_id column to gift_purchases
ALTER TABLE gift_purchases ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES creator_profiles(id) ON DELETE SET NULL;

-- 3. Add profile_id column to custom_requests
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES creator_profiles(id) ON DELETE SET NULL;

-- 4. Add profile_id column to wishlist_items
ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES creator_profiles(id) ON DELETE SET NULL;

-- 5. Add profile_id column to fan_favorites
ALTER TABLE fan_favorites ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES creator_profiles(id) ON DELETE SET NULL;

-- 6. Backfill profile_id from the primary (oldest) creator_profile for each user
-- Tips
UPDATE tips t
SET profile_id = (
  SELECT cp.id FROM creator_profiles cp
  WHERE cp.user_id = t.creator_id AND cp.is_active = true
  ORDER BY cp.created_at ASC LIMIT 1
)
WHERE t.profile_id IS NULL;

-- Gift purchases
UPDATE gift_purchases gp
SET profile_id = (
  SELECT cp.id FROM creator_profiles cp
  WHERE cp.user_id = gp.creator_id AND cp.is_active = true
  ORDER BY cp.created_at ASC LIMIT 1
)
WHERE gp.profile_id IS NULL;

-- Custom requests
UPDATE custom_requests cr
SET profile_id = (
  SELECT cp.id FROM creator_profiles cp
  WHERE cp.user_id = cr.creator_id AND cp.is_active = true
  ORDER BY cp.created_at ASC LIMIT 1
)
WHERE cr.profile_id IS NULL;

-- Wishlist items
UPDATE wishlist_items wi
SET profile_id = (
  SELECT cp.id FROM creator_profiles cp
  WHERE cp.user_id = wi.creator_id AND cp.is_active = true
  ORDER BY cp.created_at ASC LIMIT 1
)
WHERE wi.profile_id IS NULL;

-- Fan favorites
UPDATE fan_favorites ff
SET profile_id = (
  SELECT cp.id FROM creator_profiles cp
  WHERE cp.user_id = ff.creator_id AND cp.is_active = true
  ORDER BY cp.created_at ASC LIMIT 1
)
WHERE ff.profile_id IS NULL;

-- 7. Create indexes for efficient profile_id lookups
CREATE INDEX IF NOT EXISTS idx_tips_profile_id ON tips(profile_id);
CREATE INDEX IF NOT EXISTS idx_gift_purchases_profile_id ON gift_purchases(profile_id);
CREATE INDEX IF NOT EXISTS idx_custom_requests_profile_id ON custom_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_profile_id ON wishlist_items(profile_id);
CREATE INDEX IF NOT EXISTS idx_fan_favorites_profile_id ON fan_favorites(profile_id);
