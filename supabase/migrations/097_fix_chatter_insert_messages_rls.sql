-- ============================================================================
-- Migration 097: Fix messages INSERT RLS for chatters
-- ============================================================================
-- The previous policy only allowed chatters to insert when
-- assigned_chatter_id = auth.uid(). This blocked mass messages
-- and any message from a chatter with an accepted invitation
-- but who isn't specifically assigned to that conversation.
-- ============================================================================

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
          -- Chatter assigné à la conversation
          OR (c.assigned_chatter_id = auth.uid() AND sender_type IN ('chatter', 'creator'))
          -- Chatter avec invitation acceptée sur le profil (mass message, non-assigned)
          OR (
            sender_type = 'chatter'
            AND EXISTS (
              SELECT 1 FROM chatter_invitations ci
              WHERE ci.profile_id = c.profile_id
                AND ci.chatter_id = auth.uid()
                AND ci.status = 'accepted'
            )
          )
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
