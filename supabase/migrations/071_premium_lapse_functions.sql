-- Migration 071: Premium lapse / restore functions
-- When a user loses premium, additional profiles (all except the oldest) are deactivated.
-- When premium is restored, all profiles are reactivated.
-- The first profile (by created_at) always stays active (free tier = 1 profile).

-- Deactivate additional profiles when premium lapses
CREATE OR REPLACE FUNCTION deactivate_additional_profiles(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  first_profile_id uuid;
BEGIN
  -- Find the oldest (first) profile for this user
  SELECT id INTO first_profile_id
  FROM creator_profiles
  WHERE user_id = target_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  -- Deactivate all profiles except the first one
  UPDATE creator_profiles
  SET is_active = false
  WHERE user_id = target_user_id
    AND id != first_profile_id;
END;
$$;

-- Reactivate all profiles when premium is restored
CREATE OR REPLACE FUNCTION reactivate_all_profiles(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE creator_profiles
  SET is_active = true
  WHERE user_id = target_user_id;
END;
$$;
