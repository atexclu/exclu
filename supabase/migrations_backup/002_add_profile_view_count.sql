-- Add profile view counter to profiles table
-- Run this in Supabase SQL Editor or via migrations

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_view_count BIGINT DEFAULT 0;
