-- ============================================================================
-- Migration 096: Allow chatters to read ALL assets (including non-public)
-- for creator profiles they manage via accepted invitation.
-- ============================================================================
-- Previously only public assets were visible to non-owners.
-- Chatters need to see private assets to create paid links from chat.
-- ============================================================================

CREATE POLICY "chatter_read_managed_assets"
  ON assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.profile_id = assets.profile_id
        AND ci.chatter_id = auth.uid()
        AND ci.status = 'accepted'
    )
  );
