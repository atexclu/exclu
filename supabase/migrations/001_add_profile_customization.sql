-- Add customization fields to profiles table
-- Run this in Supabase SQL Editor

-- Theme color for creator's public page
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT 'pink';

-- Social links stored as JSONB for flexibility
-- Example: {"twitter": "https://twitter.com/user", "tiktok": "https://tiktok.com/@user", ...}
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}';

-- Creator's country of residence (ISO 2-letter code, e.g. 'FR', 'US', 'DE')
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT;

-- Supported theme colors: pink, purple, blue, orange, green, red
-- Supported social platforms: twitter, tiktok, telegram, onlyfans, fansly, linktree, instagram, youtube, snapchat
