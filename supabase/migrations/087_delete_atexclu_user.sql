-- Migration to delete atexclu user and all related data
-- This is a one-time cleanup script

DO $$
DECLARE
  atexclu_user_id UUID;
BEGIN
  -- Find the atexclu user ID
  SELECT id INTO atexclu_user_id
  FROM profiles
  WHERE email LIKE '%atexclu%' OR handle LIKE '%atexclu%'
  LIMIT 1;

  -- If user found, delete all related data
  IF atexclu_user_id IS NOT NULL THEN
    RAISE NOTICE 'Deleting user: %', atexclu_user_id;

    -- Delete from creator_profiles (multi-profile system)
    DELETE FROM creator_profiles WHERE user_id = atexclu_user_id;

    -- Delete from referrals (both as referrer and referred)
    DELETE FROM referrals WHERE referrer_id = atexclu_user_id OR referred_id = atexclu_user_id;

    -- Delete from affiliate-related tables
    DELETE FROM affiliate_earnings WHERE creator_id = atexclu_user_id;

    -- Delete from wishlist_items
    DELETE FROM wishlist_items WHERE creator_id = atexclu_user_id;

    -- Delete from gift_purchases (as creator or fan)
    DELETE FROM gift_purchases WHERE creator_id = atexclu_user_id OR fan_id = atexclu_user_id;

    -- Delete from custom_requests (as creator or fan)
    DELETE FROM custom_requests WHERE creator_id = atexclu_user_id OR fan_id = atexclu_user_id;

    -- Delete from tips (as creator or fan)
    DELETE FROM tips WHERE creator_id = atexclu_user_id OR fan_id = atexclu_user_id;

    -- Delete from purchases
    DELETE FROM purchases WHERE creator_id = atexclu_user_id OR fan_id = atexclu_user_id;

    -- Delete from fan_favorites
    DELETE FROM fan_favorites WHERE fan_id = atexclu_user_id OR creator_id = atexclu_user_id;

    -- Delete from assets
    DELETE FROM assets WHERE creator_id = atexclu_user_id;

    -- Delete from links
    DELETE FROM links WHERE creator_id = atexclu_user_id;

    -- Delete from profile_analytics
    DELETE FROM profile_analytics WHERE user_id = atexclu_user_id;

    -- Delete from profiles
    DELETE FROM profiles WHERE id = atexclu_user_id;

    -- Delete from auth.users (requires service_role or admin privileges)
    -- This will cascade to other auth-related tables
    DELETE FROM auth.users WHERE id = atexclu_user_id;

    RAISE NOTICE 'User atexclu and all related data deleted successfully';
  ELSE
    RAISE NOTICE 'User atexclu not found';
  END IF;
END $$;
