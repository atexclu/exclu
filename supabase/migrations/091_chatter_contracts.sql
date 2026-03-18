-- Migration 091: Chatter Contracts System
-- ============================================================================
--
-- OBJECTIF :
--   Permettre aux créateurs de signaler qu'ils cherchent des chatters,
--   et aux chatters de soumettre des demandes d'accès (reverse du système
--   d'invitation existant). Le créateur accepte ou refuse depuis son panel.
--
-- TABLES MODIFIÉES :
--   1. profiles → seeking_chatters (bool), seeking_chatters_description (text)
--
-- NOUVELLES TABLES :
--   2. chatter_requests — demandes envoyées par un chatter vers un créateur
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════
-- 1. Colonnes sur profiles pour la visibilité Contracts
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS seeking_chatters BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS seeking_chatters_description TEXT DEFAULT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 2. Table chatter_requests
--    Demande d'un chatter pour gérer les conversations d'un créateur.
--    Le créateur peut accepter ou refuser.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chatter_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id      UUID REFERENCES creator_profiles(id) ON DELETE CASCADE,
  chatter_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message         TEXT DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  responded_at    TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(creator_id, chatter_id)
);

CREATE INDEX IF NOT EXISTS idx_chatter_requests_creator ON chatter_requests(creator_id);
CREATE INDEX IF NOT EXISTS idx_chatter_requests_chatter ON chatter_requests(chatter_id);
CREATE INDEX IF NOT EXISTS idx_chatter_requests_status ON chatter_requests(status);
CREATE INDEX IF NOT EXISTS idx_chatter_requests_profile ON chatter_requests(profile_id) WHERE profile_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 3. RLS policies for chatter_requests
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE chatter_requests ENABLE ROW LEVEL SECURITY;

-- Chatters can insert their own requests
DROP POLICY IF EXISTS "chatter_insert_own_request" ON chatter_requests;
CREATE POLICY "chatter_insert_own_request"
  ON chatter_requests FOR INSERT
  WITH CHECK (chatter_id = auth.uid());

-- Chatters can view their own requests
DROP POLICY IF EXISTS "chatter_view_own_requests" ON chatter_requests;
CREATE POLICY "chatter_view_own_requests"
  ON chatter_requests FOR SELECT
  USING (chatter_id = auth.uid());

-- Creators can view requests addressed to them
DROP POLICY IF EXISTS "creator_view_own_requests" ON chatter_requests;
CREATE POLICY "creator_view_own_requests"
  ON chatter_requests FOR SELECT
  USING (creator_id = auth.uid());

-- Creators can update (accept/reject) requests addressed to them
DROP POLICY IF EXISTS "creator_update_own_requests" ON chatter_requests;
CREATE POLICY "creator_update_own_requests"
  ON chatter_requests FOR UPDATE
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════════
-- 4. RPC: get_creators_seeking_chatters
--    Returns creators who are looking for chatters (for the Contracts tab).
--    Excludes creators where the calling chatter already has a pending/accepted request.
-- ══════════════════════════════════════════════════════════════════════

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
  has_pending   BOOLEAN
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
        AND cr.status IN ('pending', 'accepted')
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

GRANT EXECUTE ON FUNCTION public.get_creators_seeking_chatters() TO authenticated;
