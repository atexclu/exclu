-- ============================================================================
-- Migration 087: Allow chatters to create links on behalf of creators
-- ============================================================================
-- Chatters need to insert into `links` and `link_media` when creating
-- paid content links from the chat interface. The existing RLS policies
-- only allow creator_id = auth.uid(), which blocks chatters.
--
-- We add policies that check chatter_has_access_to_profile() and require
-- the created_by_chatter_id to be set to the chatter's own ID.
-- ============================================================================

-- Allow chatters to INSERT links for creators they manage
DROP POLICY IF EXISTS "Chatters can create links for managed profiles" ON links;
CREATE POLICY "Chatters can create links for managed profiles"
  ON links FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_chatter_id = auth.uid()
    AND profile_id IS NOT NULL
    AND chatter_has_access_to_profile(auth.uid(), profile_id)
  );

-- Allow chatters to SELECT links they created (needed for .select() after insert)
DROP POLICY IF EXISTS "Chatters can view links they created" ON links;
CREATE POLICY "Chatters can view links they created"
  ON links FOR SELECT
  TO authenticated
  USING (created_by_chatter_id = auth.uid());

-- Allow chatters to INSERT link_media for links they created
DROP POLICY IF EXISTS "Chatters can attach media to their links" ON link_media;
CREATE POLICY "Chatters can attach media to their links"
  ON link_media FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM links
      WHERE links.id = link_media.link_id
        AND links.created_by_chatter_id = auth.uid()
    )
  );
