-- ============================================================================
-- Migration 094: Allow all accepted chatters to use mass messages
-- ============================================================================
-- The original RLS required can_mass_message permission (default false).
-- This migration relaxes it so any accepted chatter can use mass messages,
-- matching the creator's request to make this feature available to chatters.
-- ============================================================================

-- Drop old restrictive policies
DROP POLICY IF EXISTS "chatter_read_mass_messages" ON mass_messages;
DROP POLICY IF EXISTS "chatter_insert_mass_messages" ON mass_messages;

-- Chatter with accepted invitation: can read mass messages for that profile
CREATE POLICY "chatter_read_mass_messages"
  ON mass_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.profile_id = mass_messages.profile_id
        AND ci.chatter_id = auth.uid()
        AND ci.status = 'accepted'
    )
  );

-- Chatter with accepted invitation: can insert mass messages for that profile
CREATE POLICY "chatter_insert_mass_messages"
  ON mass_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.profile_id = mass_messages.profile_id
        AND ci.chatter_id = auth.uid()
        AND ci.status = 'accepted'
    )
  );
