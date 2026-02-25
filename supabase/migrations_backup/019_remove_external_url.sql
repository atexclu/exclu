-- Migration 019: Remove external_url column from profiles
-- The external_url field has been migrated to social_links as 'website'
-- This migration removes the deprecated column

-- Drop the external_url column
ALTER TABLE profiles
DROP COLUMN IF EXISTS external_url;

-- Add comment
COMMENT ON COLUMN profiles.social_links IS 'Social media links and website stored as JSONB. Includes: instagram, twitter, tiktok, youtube, snapchat, telegram, onlyfans, fansly, linktree, website';
