-- Migration 020: Cleanup and document profile views system
-- This migration documents the current profile view counting system and removes obsolete elements

-- ============================================================================
-- PROFILE VIEW COUNTING SYSTEM (Current Implementation)
-- ============================================================================
--
-- The profile view counting system works as follows:
--
-- 1. Storage: profiles.profile_view_count (INTEGER)
--    - Stores the total number of profile page visits
--    - Incremented via the increment-profile-view Edge Function
--
-- 2. Increment Flow:
--    - When a user visits /{handle}, CreatorPublic.tsx calls the Edge Function
--    - Edge Function: increment-profile-view
--      * Validates the handle
--      * Increments profiles.profile_view_count by 1
--      * Only increments for creator profiles (is_creator = true)
--      * Includes rate limiting (60 requests per minute per IP)
--
-- 3. Analytics Tracking (Optional):
--    - Trigger: auto_track_profile_view (on profiles table)
--    - When profile_view_count increases, the trigger copies the increment
--      to profile_analytics.profile_views for daily aggregation
--    - This allows historical tracking and analytics
--
-- 4. Admin Display:
--    - admin-get-users Edge Function reads profile_view_count directly from profiles
--    - AdminUsers.tsx displays the count in the admin dashboard
--
-- ============================================================================

-- Ensure the profile_view_count column exists with proper defaults
ALTER TABLE profiles
ALTER COLUMN profile_view_count SET DEFAULT 0;

-- Ensure the column is NOT NULL (set to 0 if NULL)
UPDATE profiles
SET profile_view_count = 0
WHERE profile_view_count IS NULL;

ALTER TABLE profiles
ALTER COLUMN profile_view_count SET NOT NULL;

-- Add index for performance when sorting by views in admin
CREATE INDEX IF NOT EXISTS idx_profiles_view_count 
ON profiles(profile_view_count DESC)
WHERE is_creator = true;

-- Update comment to document the system
COMMENT ON COLUMN profiles.profile_view_count IS 'Total number of profile page visits. Incremented via increment-profile-view Edge Function when users visit /{handle}. Only tracked for creator profiles (is_creator = true).';

-- Ensure the trigger exists and is properly configured
-- (The trigger was created in migration 013_fix_profile_analytics_triggers.sql)
-- This is just a verification/documentation step

-- Verify trigger exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'auto_track_profile_view'
    ) THEN
        RAISE NOTICE 'WARNING: auto_track_profile_view trigger does not exist. It should be created by migration 013.';
    END IF;
END $$;

-- ============================================================================
-- CLEANUP: Remove obsolete creator_profiles references (if applicable)
-- ============================================================================
--
-- NOTE: The creator_profiles table was part of a multi-profile system that
-- is no longer in use. The current system uses profiles.is_creator instead.
-- If creator_profiles is completely obsolete, it can be dropped in a future
-- migration after verifying no dependencies exist.
--
-- For now, we just document this and leave the table intact for safety.

COMMENT ON TABLE profile_analytics IS 'Daily aggregated metrics per creator profile. Fed by triggers on profiles (profile views), links (clicks), and purchases (sales). The profile_id references profiles.id (not creator_profiles).';
