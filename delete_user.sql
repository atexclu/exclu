-- Delete user atexclu@gmail.com and all associated data
-- First get the user ID
DO $$
DECLARE
  user_uuid UUID;
BEGIN
  -- Get user ID
  SELECT id INTO user_uuid FROM auth.users WHERE email = 'atexclu@gmail.com';
  
  IF user_uuid IS NULL THEN
    RAISE NOTICE 'User atexclu@gmail.com not found';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Deleting user % and all associated data...', user_uuid;
  
  -- Delete from public schema tables (in dependency order)
  DELETE FROM fan_favorites WHERE fan_id = user_uuid OR creator_id = user_uuid;
  DELETE FROM fan_tags WHERE created_by = user_uuid;
  DELETE FROM messages WHERE sender_id = user_uuid;
  DELETE FROM conversations WHERE fan_id = user_uuid OR assigned_chatter_id = user_uuid;
  DELETE FROM mass_messages WHERE sent_by = user_uuid;
  DELETE FROM chatter_invitations WHERE chatter_id = user_uuid;
  DELETE FROM chatter_requests WHERE chatter_id = user_uuid OR creator_id = user_uuid;
  DELETE FROM link_media WHERE link_id IN (SELECT id FROM links WHERE creator_id = user_uuid);
  DELETE FROM link_purchases WHERE buyer_id = user_uuid OR link_id IN (SELECT id FROM links WHERE creator_id = user_uuid);
  DELETE FROM links WHERE creator_id = user_uuid;
  DELETE FROM assets WHERE creator_id = user_uuid;
  DELETE FROM tips WHERE fan_id = user_uuid OR creator_id = user_uuid;
  DELETE FROM gift_purchases WHERE fan_id = user_uuid OR creator_id = user_uuid;
  DELETE FROM wishlist_items WHERE creator_id = user_uuid;
  DELETE FROM custom_requests WHERE fan_id = user_uuid OR creator_id = user_uuid;
  DELETE FROM profile_analytics WHERE user_id = user_uuid;
  DELETE FROM creator_profiles WHERE user_id = user_uuid;
  DELETE FROM profiles WHERE id = user_uuid;
  
  -- Delete from auth schema
  DELETE FROM auth.identities WHERE user_id = user_uuid;
  DELETE FROM auth.sessions WHERE user_id = user_uuid;
  DELETE FROM auth.mfa_factors WHERE user_id = user_uuid;
  DELETE FROM auth.mfa_amr_claims WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id = user_uuid);
  DELETE FROM auth.refresh_tokens WHERE user_id = user_uuid;
  DELETE FROM auth.users WHERE id = user_uuid;
  
  RAISE NOTICE 'User deleted successfully';
END $$;
