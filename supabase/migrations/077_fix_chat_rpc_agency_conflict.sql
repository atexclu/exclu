-- Migration 077: Fix Chat RPCs — suppression de la dépendance à agency_members
-- ============================================================================
--
-- PROBLÈME (migration 076) :
--   accept_chatter_invitation et revoke_chatter_access référençaient agency_members
--   avec les colonnes (profile_id, user_id) qui n'existent pas en prod.
--   La table réelle a (agency_user_id, chatter_user_id, accessible_profile_ids...).
--
-- FIX :
--   chatter_invitations devient la SEULE source de vérité pour l'accès chatter.
--   agency_members est conservé intact pour le panel agence existant, mais
--   le système de chat n'y écrit plus.
--
-- IMPACT :
--   - Aucun impact sur le panel agence (agency_members non modifié).
--   - get_chatter_profiles() utilise déjà chatter_invitations → pas de changement.
--   - claim_conversation() utilise déjà chatter_invitations → pas de changement.
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════
-- 1. ACCEPT CHATTER INVITATION (sans agency_members)
--    Accepte un token d'invitation. Met à jour chatter_invitations uniquement.
--    Retourne un JSON avec le résultat (success ou error) pour le frontend.
-- ══════════════════════════════════════════════════════════════════════
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
  -- Récupérer l'invitation valide (non expirée, non déjà acceptée/révoquée)
  SELECT * INTO v_inv
  FROM chatter_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE; -- Lock pour éviter double-acceptation concurrente

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invitation_invalid_or_expired');
  END IF;

  -- Marquer comme acceptée avec l'identité du user connecté
  UPDATE chatter_invitations
  SET
    status      = 'accepted',
    chatter_id  = v_user_id,
    accepted_at = now()
  WHERE id = v_inv.id;

  -- Récupérer le username du profil pour le message de confirmation frontend
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

-- ══════════════════════════════════════════════════════════════════════
-- 2. REVOKE CHATTER ACCESS (sans agency_members)
--    Le créateur révoque l'accès d'un chatter immédiatement.
--    Les conversations actives sont remises en queue (non perdues).
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
  -- Vérifier que l'appelant est propriétaire du profil
  IF NOT EXISTS (
    SELECT 1 FROM creator_profiles
    WHERE id = p_profile_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized'
      USING HINT = 'Only the profile owner can revoke chatter access.';
  END IF;

  -- Révoquer l'invitation (source de vérité — RLS prend effet immédiatement)
  UPDATE chatter_invitations
  SET status = 'revoked'
  WHERE chatter_id  = p_chatter_id
    AND profile_id  = p_profile_id;

  -- Remettre les conversations actives de ce chatter en queue unclaimed
  -- Important : on ne supprime pas les conversations, elles restent avec leur historique
  UPDATE conversations
  SET
    assigned_chatter_id = NULL,
    status              = 'unclaimed'
  WHERE profile_id            = p_profile_id
    AND assigned_chatter_id   = p_chatter_id
    AND status                = 'active';
END;
$$;
