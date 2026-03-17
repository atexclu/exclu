-- Migration 083: Fix chatter invitation flow
--
-- Fixes:
--   1. get_chatter_invitation_by_token — new SECURITY DEFINER RPC so the
--      accept page can read invitation info without auth (token = authorization).
--   2. get_profile_chatters — filter out revoked/expired invitations.
--   3. Clean up stale test invitations for testeuroutil@gmail.com.

-- ══════════════════════════════════════════════════════════════════════
-- 1. GET INVITATION BY TOKEN (public, no auth required)
--    Called by AcceptChatterInvite page before the user is logged in.
--    The token itself acts as authorization (64-char random hex).
--    Returns limited info only (no permissions, no sensitive data).
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_chatter_invitation_by_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN json_build_object('error', 'invalid_token');
  END IF;

  SELECT json_build_object(
    'id',                    ci.id,
    'email',                 ci.email,
    'status',                ci.status,
    'expires_at',            ci.expires_at,
    'creator_display_name',  cp.display_name,
    'creator_avatar_url',    cp.avatar_url
  ) INTO v_result
  FROM chatter_invitations ci
  JOIN creator_profiles cp ON cp.id = ci.profile_id
  WHERE ci.token = p_token;

  IF v_result IS NULL THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN v_result;
END;
$$;

-- Allow both anon and authenticated roles to call this function
GRANT EXECUTE ON FUNCTION public.get_chatter_invitation_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_chatter_invitation_by_token(TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- 2. FIX get_profile_chatters — only return pending + accepted
--    Previously returned ALL statuses including revoked/expired,
--    causing duplicate entries in ChatSettingsPanel.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_profile_chatters(p_profile_id UUID)
RETURNS TABLE (
  invitation_id UUID,
  email         TEXT,
  status        TEXT,
  chatter_id    UUID,
  display_name  TEXT,
  avatar_url    TEXT,
  permissions   JSONB,
  invited_at    TIMESTAMPTZ,
  accepted_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  active_conv_count  BIGINT,
  total_revenue_cents BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM creator_profiles
    WHERE id = p_profile_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    ci.id,
    ci.email,
    ci.status,
    ci.chatter_id,
    p.display_name,
    p.avatar_url,
    ci.permissions,
    ci.created_at,
    ci.accepted_at,
    ci.expires_at,
    COUNT(DISTINCT conv.id) FILTER (WHERE conv.status = 'active'),
    COALESCE(SUM(conv.total_revenue_cents), 0)::BIGINT
  FROM chatter_invitations ci
  LEFT JOIN profiles p ON p.id = ci.chatter_id
  LEFT JOIN conversations conv ON conv.profile_id = ci.profile_id
    AND conv.assigned_chatter_id = ci.chatter_id
  WHERE ci.profile_id = p_profile_id
    AND ci.status IN ('pending', 'accepted')
  GROUP BY ci.id, ci.email, ci.status, ci.chatter_id, p.display_name, p.avatar_url,
           ci.permissions, ci.created_at, ci.accepted_at, ci.expires_at
  ORDER BY ci.created_at DESC;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Clean up stale/duplicate test invitations
--    Keep only the most recent invitation per (email, profile_id).
-- ══════════════════════════════════════════════════════════════════════
DELETE FROM chatter_invitations
WHERE id NOT IN (
  SELECT DISTINCT ON (email, profile_id) id
  FROM chatter_invitations
  ORDER BY email, profile_id, created_at DESC
);
