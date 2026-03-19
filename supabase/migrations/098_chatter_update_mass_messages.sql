-- ============================================================================
-- Migration 098: Allow chatters to UPDATE mass_messages they created
-- ============================================================================
-- The BroadcastPanel updates status/sent_at/recipient_count after sending.
-- Without this policy, the update silently fails for chatters.
-- ============================================================================

CREATE POLICY "chatter_update_own_mass_messages"
  ON mass_messages FOR UPDATE
  USING (
    sent_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.profile_id = mass_messages.profile_id
        AND ci.chatter_id = auth.uid()
        AND ci.status = 'accepted'
    )
  );
