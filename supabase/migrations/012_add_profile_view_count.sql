-- Migration 012: Add profile_view_count column to profiles table
-- This migration adds a counter for profile page visits

-- Add profile_view_count column with default value 0
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS profile_view_count INTEGER DEFAULT 0;

-- Add index for performance when sorting by views
CREATE INDEX IF NOT EXISTS idx_profiles_view_count 
ON profiles(profile_view_count DESC);

-- Add comment to document the column
COMMENT ON COLUMN profiles.profile_view_count IS 'Tracks the number of times a creator profile has been visited. Incremented via increment-profile-view Edge Function.';
