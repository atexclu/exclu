-- ============================================================================
-- Migration 049: Adapt handle_new_user() to support fan accounts
-- ============================================================================
-- Currently, handle_new_user() sets is_creator = true for ALL new users.
-- This migration updates it to read raw_user_meta_data to distinguish
-- fan signups from creator signups.
--
-- Fan signup passes: { is_creator: false } in metadata
-- Creator signup passes: { is_creator: true } or nothing (default)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_creator BOOLEAN;
  v_role user_role;
BEGIN
  -- Determine account type from signup metadata (default: creator for backward compat)
  v_is_creator := COALESCE((NEW.raw_user_meta_data->>'is_creator')::boolean, true);
  
  IF v_is_creator THEN
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

  RETURN NEW;
END;
$$;
