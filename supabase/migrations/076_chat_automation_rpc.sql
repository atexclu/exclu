-- Migration 076: Chat Automation & RPC Functions
-- RPCs: claim_conversation, accept_chatter_invitation, get_chatter_profiles,
--        revoke_chatter_access, get_conversation_with_messages

-- ══════════════════════════════════════════════════════════════════════
-- 1. CLAIM CONVERSATION (atomique via FOR UPDATE)
--    Un chatter s'attribue une conversation unclaimed.
--    Lève une exception si la conversation est déjà prise (gestion race condition).
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.claim_conversation(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chatter_id UUID := auth.uid();
  v_profile_id UUID;
BEGIN
  -- Lock la ligne pour éviter le double-claim concurrent
  SELECT profile_id INTO v_profile_id
  FROM conversations
  WHERE id = p_conversation_id
    AND status = 'unclaimed'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_already_claimed'
      USING HINT = 'This conversation was already claimed by another chatter.';
  END IF;

  -- Vérifier que le chatter a accès à ce profil
  IF NOT EXISTS (
    SELECT 1 FROM chatter_invitations
    WHERE profile_id = v_profile_id
      AND chatter_id = v_chatter_id
      AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'You do not have access to this profile.';
  END IF;

  -- Attribution
  UPDATE conversations
  SET
    assigned_chatter_id = v_chatter_id,
    status = 'active',
    is_read = true
  WHERE id = p_conversation_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 2. ACCEPT CHATTER INVITATION
--    Accepte un token d'invitation et met à jour agency_members.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.accept_chatter_invitation(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv   chatter_invitations%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_profile_username TEXT;
BEGIN
  -- Chercher l'invitation valide
  SELECT * INTO v_inv
  FROM chatter_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invitation_invalid_or_expired');
  END IF;

  -- Marquer comme acceptée
  UPDATE chatter_invitations
  SET
    status = 'accepted',
    chatter_id = v_user_id,
    accepted_at = now()
  WHERE id = v_inv.id;

  -- Upsert dans agency_members pour compatibilité avec le panel agence existant
  INSERT INTO agency_members (profile_id, user_id, role, permissions)
  VALUES (v_inv.profile_id, v_user_id, 'chatter', v_inv.permissions)
  ON CONFLICT (profile_id, user_id)
  DO UPDATE SET
    permissions = EXCLUDED.permissions,
    role = 'chatter';

  -- Récupérer le username du profil pour le message de confirmation
  SELECT username INTO v_profile_username
  FROM creator_profiles
  WHERE id = v_inv.profile_id;

  RETURN json_build_object(
    'success', true,
    'profile_id', v_inv.profile_id,
    'profile_username', v_profile_username
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 3. GET CHATTER PROFILES
--    Retourne la liste des profils auxquels le chatter connecté a accès,
--    avec compteurs de conversations unclaimed et actives.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_chatter_profiles()
RETURNS TABLE (
  profile_id       UUID,
  username         TEXT,
  display_name     TEXT,
  avatar_url       TEXT,
  permissions      JSONB,
  unclaimed_count  BIGINT,
  active_count     BIGINT,
  chat_mode        TEXT,
  chatter_persona  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.username,
    cp.display_name,
    cp.avatar_url,
    ci.permissions,
    COUNT(CASE WHEN conv.status = 'unclaimed' THEN 1 END),
    COUNT(CASE WHEN conv.status = 'active' AND conv.assigned_chatter_id = v_user_id THEN 1 END),
    cp.chat_mode,
    cp.chatter_persona
  FROM chatter_invitations ci
  JOIN creator_profiles cp ON cp.id = ci.profile_id
  LEFT JOIN conversations conv ON conv.profile_id = ci.profile_id
  WHERE ci.chatter_id = v_user_id
    AND ci.status = 'accepted'
    AND cp.is_active = true
  GROUP BY cp.id, cp.username, cp.display_name, cp.avatar_url, ci.permissions, cp.chat_mode, cp.chatter_persona;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. REVOKE CHATTER ACCESS
--    Le créateur révoque l'accès d'un chatter immédiatement.
--    - Révoque l'invitation
--    - Retire de agency_members
--    - Un-claim les conversations actives
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_chatter_access(
  p_chatter_id UUID,
  p_profile_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifier que l'appelant est créateur du profil
  IF NOT EXISTS (
    SELECT 1 FROM creator_profiles
    WHERE id = p_profile_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Only the profile owner can revoke chatter access.';
  END IF;

  -- Révoquer l'invitation
  UPDATE chatter_invitations
  SET status = 'revoked'
  WHERE chatter_id = p_chatter_id
    AND profile_id = p_profile_id;

  -- Retirer de agency_members
  DELETE FROM agency_members
  WHERE user_id = p_chatter_id
    AND profile_id = p_profile_id;

  -- Un-claim les conversations actives de ce chatter sur ce profil
  UPDATE conversations
  SET
    assigned_chatter_id = NULL,
    status = 'unclaimed'
  WHERE profile_id = p_profile_id
    AND assigned_chatter_id = p_chatter_id
    AND status = 'active';
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 5. GET CHATTERS FOR PROFILE
--    Retourne la liste des chatters d'un profil (pour le créateur).
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
  -- Vérifier que l'appelant est créateur du profil
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
  GROUP BY ci.id, ci.email, ci.status, ci.chatter_id, p.display_name, p.avatar_url,
           ci.permissions, ci.created_at, ci.accepted_at, ci.expires_at
  ORDER BY ci.created_at DESC;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 6. AUTO-ARCHIVE INACTIVE CONVERSATIONS (appelable par un cron job)
--    Archive les conversations sans activité depuis 72h.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auto_archive_inactive_conversations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH archived AS (
    UPDATE conversations
    SET
      status = 'archived',
      archived_at = now()
    WHERE status = 'active'
      AND (
        last_message_at < now() - INTERVAL '72 hours'
        OR (last_message_at IS NULL AND created_at < now() - INTERVAL '72 hours')
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM archived;

  RETURN v_count;
END;
$$;
