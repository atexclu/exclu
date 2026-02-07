-- Migration 009: Add public content visibility feature
-- This migration adds the ability for creators to make their content publicly visible on their profile
-- with proper RLS security to prevent unauthorized access to non-public content

-- Add is_public column to links table
-- This controls whether content appears in the public gallery on the creator's profile
-- Different from show_on_profile which controls if paid links appear on the profile
ALTER TABLE links
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Add index for performance when querying public content
CREATE INDEX IF NOT EXISTS idx_links_is_public ON links(creator_id, is_public) WHERE is_public = true AND status = 'published';

-- Add content_order to profiles for drag & drop ordering of public content
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS content_order TEXT[] DEFAULT '{}';

-- Update RLS policies for links table to ensure security

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own links" ON links;
DROP POLICY IF EXISTS "Users can insert their own links" ON links;
DROP POLICY IF EXISTS "Users can update their own links" ON links;
DROP POLICY IF EXISTS "Users can delete their own links" ON links;
DROP POLICY IF EXISTS "Public can view published links on profile" ON links;
DROP POLICY IF EXISTS "Public can view public content" ON links;

-- Policy 1: Creators can view all their own links (public and private)
CREATE POLICY "Users can view their own links"
ON links
FOR SELECT
USING (auth.uid() = creator_id);

-- Policy 2: Creators can insert their own links
CREATE POLICY "Users can insert their own links"
ON links
FOR INSERT
WITH CHECK (auth.uid() = creator_id);

-- Policy 3: Creators can update their own links
CREATE POLICY "Users can update their own links"
ON links
FOR UPDATE
USING (auth.uid() = creator_id)
WITH CHECK (auth.uid() = creator_id);

-- Policy 4: Creators can delete their own links
CREATE POLICY "Users can delete their own links"
ON links
FOR DELETE
USING (auth.uid() = creator_id);

-- Policy 5: Public can view published links that are marked to show on profile (paid links)
-- This is for the paid content links that appear on the profile
CREATE POLICY "Public can view published links on profile"
ON links
FOR SELECT
USING (
  status = 'published' 
  AND show_on_profile = true
);

-- Policy 6: Public can view published content that is marked as public (free gallery content)
-- This is for the public content gallery
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
COMMENT ON COLUMN links.show_on_profile IS 'Controls whether paid links appear on the creator profile. Works independently from is_public.';

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
