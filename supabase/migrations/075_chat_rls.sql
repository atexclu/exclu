-- Migration 075: Row Level Security — Chatting System
-- Toutes les RLS policies pour conversations, messages, fan_tags, chatter_invitations.

-- ══════════════════════════════════════════════════════════════════════
-- Activer RLS sur les nouvelles tables
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatter_invitations  ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════
-- CHATTER INVITATIONS
-- ══════════════════════════════════════════════════════════════════════

-- Créateur peut tout faire sur ses invitations
DROP POLICY IF EXISTS "creator_manage_own_invitations" ON chatter_invitations;
CREATE POLICY "creator_manage_own_invitations"
  ON chatter_invitations FOR ALL
  USING (
    invited_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM creator_profiles cp
      WHERE cp.id = chatter_invitations.profile_id
        AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    invited_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM creator_profiles cp
      WHERE cp.id = chatter_invitations.profile_id
        AND cp.user_id = auth.uid()
    )
  );

-- Chatter peut voir ses propres invitations (pour les accepter)
DROP POLICY IF EXISTS "chatter_see_own_invitation" ON chatter_invitations;
CREATE POLICY "chatter_see_own_invitation"
  ON chatter_invitations FOR SELECT
  USING (
    chatter_id = auth.uid()
    OR (
      status = 'pending'
      AND email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- CONVERSATIONS
-- ══════════════════════════════════════════════════════════════════════

-- Fan voit ses propres conversations
DROP POLICY IF EXISTS "fan_see_own_conversations" ON conversations;
CREATE POLICY "fan_see_own_conversations"
  ON conversations FOR SELECT
  USING (fan_id = auth.uid());

-- Créateur voit toutes conversations de son profil
DROP POLICY IF EXISTS "creator_see_profile_conversations" ON conversations;
CREATE POLICY "creator_see_profile_conversations"
  ON conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM creator_profiles cp
      WHERE cp.id = conversations.profile_id
        AND cp.user_id = auth.uid()
    )
  );

-- Chatter voit les conversations qui lui sont assignées + les unclaimed de ses profils
DROP POLICY IF EXISTS "chatter_see_conversations" ON conversations;
CREATE POLICY "chatter_see_conversations"
  ON conversations FOR SELECT
  USING (
    assigned_chatter_id = auth.uid()
    OR (
      status = 'unclaimed'
      AND EXISTS (
        SELECT 1 FROM chatter_invitations ci
        WHERE ci.profile_id = conversations.profile_id
          AND ci.chatter_id = auth.uid()
          AND ci.status = 'accepted'
      )
    )
    OR (
      -- Chatter peut aussi voir les actives de ses profils (pour les stats)
      status = 'active'
      AND EXISTS (
        SELECT 1 FROM chatter_invitations ci
        WHERE ci.profile_id = conversations.profile_id
          AND ci.chatter_id = auth.uid()
          AND ci.status = 'accepted'
      )
    )
  );

-- Fan peut créer sa conversation
DROP POLICY IF EXISTS "fan_insert_conversation" ON conversations;
CREATE POLICY "fan_insert_conversation"
  ON conversations FOR INSERT
  WITH CHECK (fan_id = auth.uid());

-- Chatter peut mettre à jour les conversations de ses profils
DROP POLICY IF EXISTS "chatter_update_conversation" ON conversations;
CREATE POLICY "chatter_update_conversation"
  ON conversations FOR UPDATE
  USING (
    assigned_chatter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.profile_id = conversations.profile_id
        AND ci.chatter_id = auth.uid()
        AND ci.status = 'accepted'
    )
  );

-- Créateur peut mettre à jour ses conversations
DROP POLICY IF EXISTS "creator_update_conversation" ON conversations;
CREATE POLICY "creator_update_conversation"
  ON conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM creator_profiles cp
      WHERE cp.id = conversations.profile_id
        AND cp.user_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- MESSAGES
-- ══════════════════════════════════════════════════════════════════════

-- Helper: vérifie qu'un utilisateur participe à une conversation
-- (fan, chatter assigné, créateur du profil, chatter avec invitation acceptée)
DROP POLICY IF EXISTS "conversation_participants_read_messages" ON messages;
CREATE POLICY "conversation_participants_read_messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          c.fan_id = auth.uid()
          OR c.assigned_chatter_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM creator_profiles cp
            WHERE cp.id = c.profile_id AND cp.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM chatter_invitations ci
            WHERE ci.profile_id = c.profile_id
              AND ci.chatter_id = auth.uid()
              AND ci.status = 'accepted'
          )
        )
    )
  );

-- Seul le sender peut insérer et son sender_id doit correspondre à auth.uid()
DROP POLICY IF EXISTS "participants_insert_messages" ON messages;
CREATE POLICY "participants_insert_messages"
  ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          -- Fan dans sa propre conversation
          (c.fan_id = auth.uid() AND sender_type = 'fan')
          -- Chatter assigné
          OR (c.assigned_chatter_id = auth.uid() AND sender_type IN ('chatter', 'creator'))
          -- Créateur du profil (mode solo)
          OR (
            sender_type = 'creator'
            AND EXISTS (
              SELECT 1 FROM creator_profiles cp
              WHERE cp.id = c.profile_id AND cp.user_id = auth.uid()
            )
          )
        )
    )
  );

-- Marquer messages comme lus (UPDATE is_read, read_at seulement)
DROP POLICY IF EXISTS "participants_update_messages_read" ON messages;
CREATE POLICY "participants_update_messages_read"
  ON messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          c.fan_id = auth.uid()
          OR c.assigned_chatter_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM creator_profiles cp
            WHERE cp.id = c.profile_id AND cp.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM chatter_invitations ci
            WHERE ci.profile_id = c.profile_id
              AND ci.chatter_id = auth.uid()
              AND ci.status = 'accepted'
          )
        )
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- FAN TAGS
-- ══════════════════════════════════════════════════════════════════════

-- Chatters et créateurs peuvent gérer les tags des fans de leurs profils
DROP POLICY IF EXISTS "chatter_creator_manage_fan_tags" ON fan_tags;
CREATE POLICY "chatter_creator_manage_fan_tags"
  ON fan_tags FOR ALL
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.profile_id = fan_tags.profile_id
        AND ci.chatter_id = auth.uid()
        AND ci.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1 FROM creator_profiles cp
      WHERE cp.id = fan_tags.profile_id AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM chatter_invitations ci
        WHERE ci.profile_id = fan_tags.profile_id
          AND ci.chatter_id = auth.uid()
          AND ci.status = 'accepted'
      )
      OR EXISTS (
        SELECT 1 FROM creator_profiles cp
        WHERE cp.id = fan_tags.profile_id AND cp.user_id = auth.uid()
      )
    )
  );
