-- Add exclusive_content_text column to profiles
-- This stores the custom text for the "Exclusive content" gradient button on the public profile
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS exclusive_content_text text DEFAULT NULL;
