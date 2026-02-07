-- Migration 010: Add is_public column to links table
-- This migration adds public content visibility feature
-- Safe for production with 500+ existing accounts

-- Add is_public column to links table
ALTER TABLE links
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Add index for performance when querying public content
CREATE INDEX IF NOT EXISTS idx_links_is_public 
ON links(creator_id, is_public) 
WHERE is_public = true AND status = 'published';

-- Add content_order to profiles for drag & drop ordering of public content
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS content_order TEXT[] DEFAULT '{}';

-- Update RLS policies for links table to ensure security
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public can view public content" ON links;

-- Policy: Public can view published content that is marked as public (free gallery content)
-- CRITICAL SECURITY: Only published AND is_public = true content is accessible
CREATE POLICY "Public can view public content"
ON links
FOR SELECT
USING (
  status = 'published' 
  AND is_public = true
);

-- Add comment to document the security model
COMMENT ON COLUMN links.is_public IS 'Controls whether content appears in the public gallery. Only published AND is_public content is accessible to non-owners. This is separate from show_on_profile which controls paid link visibility.';

-- Add trigger to update updated_at timestamp when is_public changes
CREATE OR REPLACE FUNCTION update_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_links_updated_at_trigger ON links;
CREATE TRIGGER update_links_updated_at_trigger
BEFORE UPDATE ON links
FOR EACH ROW
EXECUTE FUNCTION update_links_updated_at();
