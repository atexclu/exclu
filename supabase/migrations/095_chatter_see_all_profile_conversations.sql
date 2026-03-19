-- ============================================================================
-- Migration 095: Allow chatters to see ALL conversations for managed profiles
-- ============================================================================
-- The previous policy only let chatters see assigned + unclaimed/active.
-- For mass messages and dashboard stats, chatters need to see all
-- conversations for profiles they manage (including archived).
-- ============================================================================

DROP POLICY IF EXISTS "chatter_see_conversations" ON conversations;
CREATE POLICY "chatter_see_conversations"
  ON conversations FOR SELECT
  USING (
    assigned_chatter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.profile_id = conversations.profile_id
        AND ci.chatter_id = auth.uid()
        AND ci.status = 'accepted'
    )
  );
