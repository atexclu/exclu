-- Fix handle_new_user trigger to be more robust
-- Add explicit error handling and ensure creator_profiles insert works

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
  v_display_name TEXT;
BEGIN
  v_is_creator := COALESCE((NEW.raw_user_meta_data->>'is_creator')::boolean, true);
  v_is_chatter := COALESCE((NEW.raw_user_meta_data->>'is_chatter')::boolean, false);
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'handle',
    split_part(NEW.email, '@', 1)
  );

  IF v_is_chatter THEN
    v_role := 'chatter'::user_role;
    v_is_creator := false;
  ELSIF v_is_creator THEN
    v_role := 'creator'::user_role;
  ELSE
    v_role := 'fan'::user_role;
  END IF;

  -- Insert profile (or update role if exists with different role)
  INSERT INTO public.profiles (id, display_name, is_creator, role)
  VALUES (NEW.id, v_display_name, v_is_creator, v_role)
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
        role = COALESCE(EXCLUDED.role, profiles.role);

  -- For creator accounts, also create a default creator_profile
  IF v_is_creator THEN
    BEGIN
      INSERT INTO public.creator_profiles (user_id, display_name, username)
      VALUES (
        NEW.id,
        v_display_name,
        COALESCE(NEW.raw_user_meta_data->>'handle', 'user_' || LEFT(NEW.id::text, 8))
      )
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Log but don't fail the signup
      RAISE WARNING 'handle_new_user: creator_profiles insert failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail user signup due to trigger errors
  RAISE WARNING 'handle_new_user failed: % %', SQLSTATE, SQLERRM;
  RETURN NEW;
END;
$$;
