-- Migration 100: Add is_managing field to get_creators_seeking_chatters RPC
-- This allows the frontend to distinguish between pending requests and accepted invitations

CREATE OR REPLACE FUNCTION public.get_creators_seeking_chatters()
RETURNS TABLE (
  creator_id    UUID,
  display_name  TEXT,
  handle        TEXT,
  avatar_url    TEXT,
  bio           TEXT,
  location      TEXT,
  aurora_gradient TEXT,
  description   TEXT,
  has_pending   BOOLEAN,
  is_managing   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.handle,
    p.avatar_url,
    p.bio,
    p.location,
    p.aurora_gradient,
    p.seeking_chatters_description,
    EXISTS (
      SELECT 1 FROM chatter_requests cr
      WHERE cr.creator_id = p.id
        AND cr.chatter_id = v_user_id
        AND cr.status = 'pending'
    ),
    EXISTS (
      SELECT 1 FROM chatter_invitations ci
      JOIN creator_profiles cp ON ci.profile_id = cp.id
      WHERE cp.user_id = p.id
        AND ci.chatter_id = v_user_id
        AND ci.status = 'accepted'
    )
  FROM profiles p
  WHERE p.seeking_chatters = true
    AND p.is_creator = true
    AND p.id != v_user_id
    -- Exclude creators who already rejected this chatter
    AND NOT EXISTS (
      SELECT 1 FROM chatter_requests cr
      WHERE cr.creator_id = p.id
        AND cr.chatter_id = v_user_id
        AND cr.status = 'rejected'
    )
  ORDER BY p.created_at DESC;
END;
$$;
