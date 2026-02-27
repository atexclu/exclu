-- ============================================================================
-- Migration 050: Create fan_favorites table
-- ============================================================================
-- Allows fans to follow/favorite creators. When a fan signs up from a
-- creator's profile, that creator is automatically added to favorites.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fan_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_fan_creator UNIQUE (fan_id, creator_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fan_favorites_fan_id ON fan_favorites(fan_id);
CREATE INDEX IF NOT EXISTS idx_fan_favorites_creator_id ON fan_favorites(creator_id);

-- Enable RLS
ALTER TABLE fan_favorites ENABLE ROW LEVEL SECURITY;

-- Fan can read their own favorites
DROP POLICY IF EXISTS "Fans can view their own favorites" ON fan_favorites;
CREATE POLICY "Fans can view their own favorites"
  ON fan_favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = fan_id);

-- Fan can add favorites
DROP POLICY IF EXISTS "Fans can add favorites" ON fan_favorites;
CREATE POLICY "Fans can add favorites"
  ON fan_favorites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = fan_id);

-- Fan can remove favorites
DROP POLICY IF EXISTS "Fans can remove favorites" ON fan_favorites;
CREATE POLICY "Fans can remove favorites"
  ON fan_favorites FOR DELETE
  TO authenticated
  USING (auth.uid() = fan_id);

-- Creators can see how many fans favorited them (count only, not fan details)
DROP POLICY IF EXISTS "Creators can view their own fan favorites" ON fan_favorites;
CREATE POLICY "Creators can view their own fan favorites"
  ON fan_favorites FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_id);

COMMENT ON TABLE fan_favorites IS 'Fan-to-creator follow/favorite relationships. Used for fan dashboard and creator audience metrics.';
