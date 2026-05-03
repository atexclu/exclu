-- ============================================================================
-- Migration 198: get_or_create_fan_conversation RPC
-- ============================================================================
-- Lets a logged-in fan open (or create) a 1:1 conversation with a creator
-- profile from the public profile "Chat" CTA. Handles three cases the fan
-- cannot do via plain INSERT/UPDATE because there is no fan UPDATE policy
-- on conversations:
--   1. New conversation → INSERT
--   2. Existing conversation → return its id
--   3. Existing conversation soft-deleted by fan (mig. 180) or archived
--      → reset fan_deleted_at, revive archived → unclaimed
-- SECURITY DEFINER bypasses the missing fan UPDATE policy safely: the
-- function only ever touches the caller's own (fan_id = auth.uid()) row.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_fan_conversation(
  p_profile_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_conv_id uuid;
  v_fan_deleted timestamptz;
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_id is required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.creator_profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator profile not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, fan_deleted_at, status
    INTO v_conv_id, v_fan_deleted, v_status
    FROM public.conversations
    WHERE fan_id = v_user_id AND profile_id = p_profile_id
    LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (fan_id, profile_id)
      VALUES (v_user_id, p_profile_id)
      RETURNING id INTO v_conv_id;
  ELSIF v_fan_deleted IS NOT NULL OR v_status = 'archived' THEN
    UPDATE public.conversations
       SET fan_deleted_at = NULL,
           status = CASE WHEN status = 'archived' THEN 'unclaimed' ELSE status END
     WHERE id = v_conv_id;
  END IF;

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_fan_conversation(uuid) TO authenticated;
