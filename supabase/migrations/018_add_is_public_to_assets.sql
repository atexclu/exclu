-- Add is_public column to assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Add index for filtering public assets
CREATE INDEX IF NOT EXISTS idx_assets_is_public ON assets(is_public);

-- Add comment
COMMENT ON COLUMN assets.is_public IS 'Whether this asset is publicly visible on the creator profile without payment';
