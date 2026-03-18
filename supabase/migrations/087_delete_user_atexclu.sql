-- ══════════════════════════════════════════════════════════════════════
-- 087 — Delete user atexclu@gmail.com and all related data
--
-- Most FK constraints use ON DELETE CASCADE from auth.users,
-- so deleting from auth.users will cascade to:
--   conversations, messages, fan_tags, fan_favorites, tips,
--   custom_requests, gift_purchases, etc.
--
-- We explicitly clean up tables that reference profiles.id
-- (not auth.users.id) before deleting the user.
-- ══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Find user by email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = 'atexclu@gmail.com';

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'User atexclu@gmail.com not found, skipping.';
    RETURN;
  END IF;

  -- Delete creator_profiles (cascades to conversations, fan_tags, etc.)
  DELETE FROM creator_profiles WHERE user_id = target_user_id;

  -- Delete profile row
  DELETE FROM profiles WHERE id = target_user_id;

  -- Delete referrals (both directions)
  DELETE FROM referrals WHERE referrer_id = target_user_id OR referred_id = target_user_id;

  -- Delete from auth.users (cascades to remaining FK-linked rows)
  DELETE FROM auth.users WHERE id = target_user_id;

  RAISE NOTICE 'User atexclu@gmail.com (%) deleted successfully.', target_user_id;
END $$;
