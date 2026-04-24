CREATE OR REPLACE FUNCTION public.increment_profile_views_atomic(
  p_handle text,
  p_profile_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user_id uuid;
  v_creator_profile_id uuid := p_profile_id;
BEGIN
  IF p_handle IS NULL OR length(btrim(p_handle)) = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles p
     SET profile_view_count = coalesce(profile_view_count, 0) + 1
   WHERE p.handle = p_handle
     AND p.is_creator = true
   RETURNING p.id INTO v_user_id;

  IF v_user_id IS NULL AND v_creator_profile_id IS NULL THEN
    SELECT cp.id, cp.user_id
      INTO v_creator_profile_id, v_user_id
      FROM public.creator_profiles cp
     WHERE cp.username = p_handle
     LIMIT 1;
  END IF;

  IF v_creator_profile_id IS NOT NULL THEN
    UPDATE public.creator_profiles cp
       SET profile_view_count = coalesce(profile_view_count, 0) + 1
     WHERE cp.id = v_creator_profile_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    PERFORM public.increment_profile_daily_views(v_user_id);
  END IF;

  RETURN v_user_id;
END;
$fn$;
