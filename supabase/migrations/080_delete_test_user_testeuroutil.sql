-- Migration 080: One-shot cleanup for test user testeuroutil@gmail.com
-- Safe against schema drift: checks table/column existence before deleting.

DO $$
DECLARE
  v_email TEXT := 'testeuroutil@gmail.com';
  v_uid UUID;
BEGIN
  SELECT id INTO v_uid
  FROM auth.users
  WHERE email = v_email
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'User % not found in auth.users', v_email;
    RETURN;
  END IF;

  -- Chat-related tables
  IF to_regclass('public.messages') IS NOT NULL AND to_regclass('public.conversations') IS NOT NULL THEN
    DELETE FROM public.messages
    WHERE conversation_id IN (
      SELECT id FROM public.conversations WHERE fan_id = v_uid
    );
  END IF;

  IF to_regclass('public.conversations') IS NOT NULL THEN
    DELETE FROM public.conversations WHERE fan_id = v_uid;
  END IF;

  IF to_regclass('public.chatter_invitations') IS NOT NULL THEN
    DELETE FROM public.chatter_invitations WHERE email = v_email OR chatter_id = v_uid OR invited_by = v_uid;
  END IF;

  IF to_regclass('public.fan_tags') IS NOT NULL THEN
    DELETE FROM public.fan_tags WHERE fan_id = v_uid;
  END IF;

  IF to_regclass('public.mass_messages') IS NOT NULL THEN
    DELETE FROM public.mass_messages WHERE sent_by = v_uid;
  END IF;

  -- Commerce / fan activity
  IF to_regclass('public.tips') IS NOT NULL THEN
    DELETE FROM public.tips WHERE fan_id = v_uid;
  END IF;

  IF to_regclass('public.gift_purchases') IS NOT NULL THEN
    DELETE FROM public.gift_purchases WHERE fan_id = v_uid;
  END IF;

  IF to_regclass('public.custom_requests') IS NOT NULL THEN
    DELETE FROM public.custom_requests WHERE fan_id = v_uid;
  END IF;

  IF to_regclass('public.fan_favorites') IS NOT NULL THEN
    DELETE FROM public.fan_favorites WHERE fan_id = v_uid;
  END IF;

  IF to_regclass('public.purchases') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'buyer_id'
    ) THEN
      DELETE FROM public.purchases WHERE buyer_id = v_uid;
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'user_id'
    ) THEN
      DELETE FROM public.purchases WHERE user_id = v_uid;
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'fan_id'
    ) THEN
      DELETE FROM public.purchases WHERE fan_id = v_uid;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'purchases' AND column_name = 'buyer_email'
    ) THEN
      DELETE FROM public.purchases WHERE buyer_email = v_email;
    END IF;
  END IF;

  -- Profile/auth cleanup
  IF to_regclass('public.creator_profiles') IS NOT NULL THEN
    DELETE FROM public.creator_profiles WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    DELETE FROM public.profiles WHERE id = v_uid;
  END IF;

  DELETE FROM auth.users WHERE id = v_uid;

  RAISE NOTICE 'Deleted test user and related data for uid=%', v_uid;
END $$;
