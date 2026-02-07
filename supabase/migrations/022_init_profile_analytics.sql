-- Migration 022: Fix profile_analytics foreign key and initialize entries
-- This migration corrects the foreign key to point to profiles instead of creator_profiles
-- and initializes entries for all creator profiles

-- Drop the old foreign key constraint
ALTER TABLE profile_analytics
DROP CONSTRAINT IF EXISTS profile_analytics_profile_id_fkey;

-- Delete orphaned entries (profile_id not in profiles table)
DELETE FROM profile_analytics
WHERE profile_id NOT IN (SELECT id FROM profiles);

-- Add the correct foreign key constraint pointing to profiles
ALTER TABLE profile_analytics
ADD CONSTRAINT profile_analytics_profile_id_fkey 
FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Create initial entries in profile_analytics for all creator profiles that don't have one yet
INSERT INTO profile_analytics (profile_id, date, profile_views, link_clicks, sales_count, revenue_cents)
SELECT 
    id,
    CURRENT_DATE,
    COALESCE(profile_view_count, 0),
    0,
    0,
    0
FROM profiles
WHERE is_creator = true
ON CONFLICT (profile_id, date) DO NOTHING;

-- Add a comment explaining this table
COMMENT ON TABLE profile_analytics IS 'Daily aggregated metrics per creator profile. Each creator profile must have at least one entry to avoid foreign key constraint errors when triggers fire. Fed by triggers on profiles (profile views), links (clicks), and purchases (sales). The profile_id references profiles.id (not creator_profiles).';
