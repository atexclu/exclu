-- Migration 011: Fix existing links to add missing columns
-- This migration ensures all existing links have the required columns
-- Safe to run multiple times (idempotent)

-- Ensure is_public column exists with default value
ALTER TABLE links
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Update all existing links that have NULL is_public to false
UPDATE links
SET is_public = false
WHERE is_public IS NULL;

-- Ensure show_on_profile column exists with default value
ALTER TABLE links
ADD COLUMN IF NOT EXISTS show_on_profile BOOLEAN DEFAULT true;

-- Update all existing links that have NULL show_on_profile to true
UPDATE links
SET show_on_profile = true
WHERE show_on_profile IS NULL;

-- Add index for performance when querying public content (if not exists)
CREATE INDEX IF NOT EXISTS idx_links_is_public 
ON links(creator_id, is_public) 
WHERE is_public = true AND status = 'published';

-- Add index for performance when querying visible links (if not exists)
CREATE INDEX IF NOT EXISTS idx_links_show_on_profile 
ON links(creator_id, show_on_profile) 
WHERE show_on_profile = true AND status = 'published';

-- Ensure content_order exists in profiles
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

-- Add comments to document the columns
COMMENT ON COLUMN links.is_public IS 'Controls whether content appears in the public gallery. Only published AND is_public content is accessible to non-owners. Default: false';
COMMENT ON COLUMN links.show_on_profile IS 'Controls whether paid link appears on the public profile page. Default: true';

-- Ensure updated_at trigger exists
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
