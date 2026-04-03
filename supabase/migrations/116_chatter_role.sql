-- ============================================================================
-- Migration 116: Add 'chatter' role to user_role enum
-- ============================================================================
-- Chatters are a distinct account type — not fans, not creators.
-- This lets all redirect/auth logic use profile.role = 'chatter' directly.
-- ============================================================================

-- 1. Add 'chatter' value to the existing user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'chatter';

-- 2. Update handle_new_user to create chatter profiles when is_chatter = true
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_creator BOOLEAN;
  v_is_chatter BOOLEAN;
  v_role user_role;
BEGIN
  v_is_creator := COALESCE((NEW.raw_user_meta_data->>'is_creator')::boolean, true);
  v_is_chatter := COALESCE((NEW.raw_user_meta_data->>'is_chatter')::boolean, false);

  IF v_is_chatter THEN
    v_role := 'chatter'::user_role;
    v_is_creator := false;
  ELSIF v_is_creator THEN
    v_role := 'creator'::user_role;
  ELSE
    v_role := 'fan'::user_role;
  END IF;

  INSERT INTO public.profiles (id, display_name, is_creator, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_is_creator,
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  -- For creator accounts, also create a default creator_profile
  IF v_is_creator THEN
    INSERT INTO public.creator_profiles (user_id, display_name)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Update existing chatter accounts (fan accounts that have accepted chatter invitations)
UPDATE profiles
SET role = 'chatter'::user_role
WHERE role = 'fan'::user_role
  AND id IN (
    SELECT DISTINCT chatter_id
    FROM chatter_invitations
    WHERE status = 'accepted'
      AND chatter_id IS NOT NULL
  );

-- 4. Update accept_chatter_invitation to also set role = 'chatter'
CREATE OR REPLACE FUNCTION public.accept_chatter_invitation(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv             chatter_invitations%ROWTYPE;
  v_user_id         UUID := auth.uid();
  v_profile_username TEXT;
BEGIN
  SELECT * INTO v_inv
  FROM chatter_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invitation_invalid_or_expired');
  END IF;

  -- Mark invitation as accepted
  UPDATE chatter_invitations
  SET
    status      = 'accepted',
    chatter_id  = v_user_id,
    accepted_at = now()
  WHERE id = v_inv.id;

  -- Promote the user's profile to chatter role
  UPDATE profiles
  SET role = 'chatter'::user_role
  WHERE id = v_user_id
    AND role != 'creator'::user_role; -- Don't demote creators

  SELECT username INTO v_profile_username
  FROM creator_profiles
  WHERE id = v_inv.profile_id;

  RETURN json_build_object(
    'success',          true,
    'profile_id',       v_inv.profile_id,
    'profile_username', v_profile_username
  );
END;
$$;
