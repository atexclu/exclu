-- Migration 029: Delete test accounts completely
-- Account 1: totoberthou / @testeuroutil / totoberthou@gmail.com
-- Account 2: tbdevpro / @tbdevpro / tbdevpro@gmail.com

-- We use a DO block to look up user IDs by handle, then cascade-delete everything.

DO $$
DECLARE
  v_user_id UUID;
  v_link_ids UUID[];
  v_handle TEXT;
BEGIN
  -- Process each account by handle
  FOREACH v_handle IN ARRAY ARRAY['testeuroutil', 'tbdevpro']
  LOOP
    -- Look up the user ID from profiles
    SELECT id INTO v_user_id FROM profiles WHERE handle = v_handle;

    IF v_user_id IS NULL THEN
      RAISE NOTICE 'No profile found for handle %, skipping', v_handle;
      CONTINUE;
    END IF;

    RAISE NOTICE 'Deleting user % (handle: %)', v_user_id, v_handle;

    -- Collect all link IDs for this user (needed for link_media and purchases)
    SELECT ARRAY_AGG(id) INTO v_link_ids FROM links WHERE creator_id = v_user_id;

    -- 1. Delete link_media rows (junction table between links and assets)
    IF v_link_ids IS NOT NULL THEN
      DELETE FROM link_media WHERE link_id = ANY(v_link_ids);
      RAISE NOTICE '  Deleted link_media for % links', array_length(v_link_ids, 1);
    END IF;

    -- 2. Delete purchases tied to this user's links
    IF v_link_ids IS NOT NULL THEN
      DELETE FROM purchases WHERE link_id = ANY(v_link_ids);
      RAISE NOTICE '  Deleted purchases';
    END IF;

    -- 3. Delete profile_analytics
    DELETE FROM profile_analytics WHERE profile_id = v_user_id;
    RAISE NOTICE '  Deleted profile_analytics';

    -- 4. Delete links
    DELETE FROM links WHERE creator_id = v_user_id;
    RAISE NOTICE '  Deleted links';

    -- 5. Delete assets
    DELETE FROM assets WHERE creator_id = v_user_id;
    RAISE NOTICE '  Deleted assets';

    -- 6. Delete affiliate_payouts (via affiliates)
    DELETE FROM affiliate_payouts WHERE affiliate_id IN (
      SELECT id FROM affiliates WHERE user_id = v_user_id
    );
    RAISE NOTICE '  Deleted affiliate_payouts';

    -- 7. Delete referrals (as affiliate or as referred user)
    DELETE FROM referrals WHERE affiliate_id IN (
      SELECT id FROM affiliates WHERE user_id = v_user_id
    );
    DELETE FROM referrals WHERE referred_user_id = v_user_id;
    RAISE NOTICE '  Deleted referrals';

    -- 8. Delete affiliates
    DELETE FROM affiliates WHERE user_id = v_user_id;
    RAISE NOTICE '  Deleted affiliates';

    -- 9. Delete agency_members (as agency owner or as chatter)
    DELETE FROM agency_members WHERE agency_user_id = v_user_id OR chatter_user_id = v_user_id;
    RAISE NOTICE '  Deleted agency_members';

    -- 10. Delete creator_profiles
    DELETE FROM creator_profiles WHERE user_id = v_user_id;
    RAISE NOTICE '  Deleted creator_profiles';

    -- 11. Delete the profile itself
    DELETE FROM profiles WHERE id = v_user_id;
    RAISE NOTICE '  Deleted profile';

    -- 12. Delete the auth user (this is the Supabase auth account)
    DELETE FROM auth.users WHERE id = v_user_id;
    RAISE NOTICE '  Deleted auth.users entry for %', v_user_id;

    RAISE NOTICE 'Done deleting user % (%)', v_handle, v_user_id;
  END LOOP;
END $$;
