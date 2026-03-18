-- =============================================================================
-- Delete user atexclu@gmail.com and ALL related data
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================================
-- This script resolves the user ID, then deletes data in the correct order
-- to avoid FK constraint violations (especially link_media → assets RESTRICT).
-- Most tables cascade from auth.users, but we explicitly clean up first.
-- =============================================================================

DO $$
DECLARE
  v_user_id UUID;
  v_link_ids UUID[];
  v_asset_ids UUID[];
  v_profile_ids UUID[];
BEGIN
  -- 1. Resolve user ID from auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'atexclu@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User atexclu@gmail.com not found — nothing to delete.';
    RETURN;
  END IF;

  RAISE NOTICE 'Found user: %', v_user_id;

  -- 2. Collect creator_profile IDs
  SELECT ARRAY_AGG(id) INTO v_profile_ids
  FROM creator_profiles WHERE user_id = v_user_id;

  -- 3. Collect link IDs (owned by this user)
  SELECT ARRAY_AGG(id) INTO v_link_ids
  FROM links WHERE creator_id = v_user_id;

  -- 4. Collect asset IDs (owned by this user)
  SELECT ARRAY_AGG(id) INTO v_asset_ids
  FROM assets WHERE creator_id = v_user_id;

  -- 5. Delete link_media first (RESTRICT on asset_id blocks cascade)
  IF v_link_ids IS NOT NULL THEN
    DELETE FROM link_media WHERE link_id = ANY(v_link_ids);
    RAISE NOTICE 'Deleted link_media for % links', array_length(v_link_ids, 1);
  END IF;

  -- 6. Delete messages (sender_id has no CASCADE)
  DELETE FROM messages WHERE sender_id = v_user_id;
  RAISE NOTICE 'Deleted messages sent by user';

  -- 7. Delete conversations (as fan)
  DELETE FROM conversations WHERE fan_id = v_user_id;
  RAISE NOTICE 'Deleted conversations as fan';

  -- 8. Delete conversations on creator profiles
  IF v_profile_ids IS NOT NULL THEN
    DELETE FROM conversations WHERE profile_id = ANY(v_profile_ids);
    RAISE NOTICE 'Deleted conversations on creator profiles';
  END IF;

  -- 9. Delete fan_tags
  DELETE FROM fan_tags WHERE fan_id = v_user_id;
  IF v_profile_ids IS NOT NULL THEN
    DELETE FROM fan_tags WHERE profile_id = ANY(v_profile_ids);
  END IF;

  -- 10. Delete fan_favorites
  DELETE FROM fan_favorites WHERE fan_id = v_user_id;

  -- 11. Delete chatter invitations
  DELETE FROM chatter_invitations WHERE chatter_id = v_user_id;
  IF v_profile_ids IS NOT NULL THEN
    DELETE FROM chatter_invitations WHERE profile_id = ANY(v_profile_ids);
  END IF;

  -- 12. Delete purchases
  DELETE FROM purchases WHERE buyer_id = v_user_id;
  IF v_link_ids IS NOT NULL THEN
    DELETE FROM purchases WHERE link_id = ANY(v_link_ids);
  END IF;

  -- 13. Delete tips
  DELETE FROM tips WHERE fan_id = v_user_id;
  DELETE FROM tips WHERE creator_id = v_user_id;

  -- 14. Delete gift_purchases
  DELETE FROM gift_purchases WHERE fan_id = v_user_id;
  DELETE FROM gift_purchases WHERE creator_id = v_user_id;

  -- 15. Delete custom_requests
  DELETE FROM custom_requests WHERE fan_id = v_user_id;
  DELETE FROM custom_requests WHERE creator_id = v_user_id;

  -- 16. Delete wishlist items
  IF v_profile_ids IS NOT NULL THEN
    DELETE FROM wishlist_items WHERE profile_id = ANY(v_profile_ids);
  END IF;

  -- 17. Delete links
  IF v_link_ids IS NOT NULL THEN
    DELETE FROM links WHERE id = ANY(v_link_ids);
    RAISE NOTICE 'Deleted % links', array_length(v_link_ids, 1);
  END IF;

  -- 18. Delete assets
  IF v_asset_ids IS NOT NULL THEN
    DELETE FROM assets WHERE id = ANY(v_asset_ids);
    RAISE NOTICE 'Deleted % assets', array_length(v_asset_ids, 1);
  END IF;

  -- 19. Delete sales, payouts, profile_analytics
  DELETE FROM sales WHERE creator_id = v_user_id;
  DELETE FROM payouts WHERE creator_id = v_user_id;
  IF v_profile_ids IS NOT NULL THEN
    DELETE FROM profile_analytics WHERE profile_id = ANY(v_profile_ids);
  END IF;
  DELETE FROM profile_analytics WHERE profile_id = v_user_id;

  -- 20. Delete profile_links
  DELETE FROM profile_links WHERE profile_id = v_user_id;

  -- 21. Clear exclusive_content_link_id FK on profiles before deleting
  UPDATE profiles SET exclusive_content_link_id = NULL WHERE id = v_user_id;

  -- 22. Delete referrals
  DELETE FROM referrals WHERE referred_id = v_user_id;
  DELETE FROM referrals WHERE referrer_id = v_user_id;

  -- 23. Delete user_roles
  DELETE FROM user_roles WHERE user_id = v_user_id;

  -- 24. Delete creator_profiles
  IF v_profile_ids IS NOT NULL THEN
    DELETE FROM creator_profiles WHERE id = ANY(v_profile_ids);
    RAISE NOTICE 'Deleted % creator_profiles', array_length(v_profile_ids, 1);
  END IF;

  -- 25. Delete profiles row
  DELETE FROM profiles WHERE id = v_user_id;
  RAISE NOTICE 'Deleted profiles row';

  -- 26. Finally delete the auth user
  DELETE FROM auth.users WHERE id = v_user_id;
  RAISE NOTICE 'Deleted auth.users row for atexclu@gmail.com — DONE';

END $$;
