-- Migration 017: Migrate external_url to social_links as 'website'
-- This migration moves existing external_url values into the social_links JSONB column

-- Migrate existing external_url values to social_links
UPDATE profiles
SET social_links = COALESCE(social_links, '{}'::jsonb) || jsonb_build_object('website', external_url)
WHERE external_url IS NOT NULL 
  AND external_url != ''
  AND (social_links IS NULL OR NOT social_links ? 'website');

-- Add comment
COMMENT ON COLUMN profiles.social_links IS 'Social media links and website stored as JSONB. Includes: instagram, twitter, tiktok, youtube, snapchat, telegram, onlyfans, linktree, website';

-- Note: We keep the external_url column for now to avoid breaking existing code
-- It can be removed in a future migration after all references are updated
