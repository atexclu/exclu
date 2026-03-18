-- ============================================================================
-- Migration 093: Fix chatter link creation RLS policies
-- ============================================================================
-- The previous migration (092) used chatter_has_access_to_profile() which
-- checks agency_members table. But chatter access is stored in
-- chatter_invitations table. This migration replaces the policies with
-- correct checks against chatter_invitations.
-- ============================================================================

-- Drop the broken policies from migration 092
DROP POLICY IF EXISTS "Chatters can create links for managed profiles" ON links;
DROP POLICY IF EXISTS "Chatters can view links they created" ON links;
DROP POLICY IF EXISTS "Chatters can attach media to their links" ON link_media;

-- Allow chatters to INSERT links for profiles they are invited to manage
CREATE POLICY "Chatters can create links for managed profiles"
  ON links FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_chatter_id = auth.uid()
    AND profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.chatter_id = auth.uid()
        AND ci.profile_id = links.profile_id
        AND ci.status = 'accepted'
    )
  );

-- Allow chatters to SELECT links they created
CREATE POLICY "Chatters can view links they created"
  ON links FOR SELECT
  TO authenticated
  USING (created_by_chatter_id = auth.uid());

-- Allow chatters to INSERT link_media for links they created
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

-- ============================================================================
-- Storage: Allow chatters to read (sign URLs) for paid-content assets
-- belonging to profiles they manage.
-- The storage path pattern is: {creator_user_id}/assets/{asset_id}/...
-- ============================================================================
DROP POLICY IF EXISTS "Chatters can read managed creator content" ON storage.objects;
CREATE POLICY "Chatters can read managed creator content"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'paid-content'
    AND EXISTS (
      SELECT 1
      FROM chatter_invitations ci
      JOIN creator_profiles cp ON cp.id = ci.profile_id
      WHERE ci.chatter_id = auth.uid()
        AND ci.status = 'accepted'
        AND storage.objects.name LIKE cp.user_id::text || '/%'
    )
  );
