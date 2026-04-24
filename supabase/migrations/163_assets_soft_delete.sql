-- Migration 163: Soft-delete for assets
--
-- Problem
--   When a creator deleted a file from the library, the DB row was hard-deleted.
--   Because link_media.asset_id is RESTRICT, deletes were blocked when the
--   asset was used by a link — but the UI silently swallowed the error and
--   misled the creator. Worse, drops that did go through (unlinked assets)
--   wiped the file, so any paid link or fan that later referenced it lost
--   access to the content.
--
-- Fix
--   Keep the DB row and the storage file; just hide the asset from the
--   creator's library. A "deleted" asset stays attachable via link_media,
--   serves purchased buyers, and can be hard-deleted later by a purge job
--   once no link or purchase still depends on it.
--
-- Shape
--   assets.deleted_at TIMESTAMPTZ NULL  -- null = active, set = soft-deleted
--   + partial index on active assets (most common read path)
--   + RLS tweaks so "public" surfaces (feed, profile) hide deleted rows;
--     creator-only SELECT path is kept wide-open so the Edit link UI can
--     still show the creator that the asset behind the link is archived.

BEGIN;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_assets_creator_active
  ON public.assets(creator_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Public read: only non-deleted public assets (feed, creator profile).
DROP POLICY IF EXISTS "public_assets_read" ON public.assets;
CREATE POLICY "public_assets_read" ON public.assets
  FOR SELECT
  USING (is_public = true AND deleted_at IS NULL);

-- Chatter read: only non-deleted assets from managed profiles.
DROP POLICY IF EXISTS "chatter_read_managed_assets" ON public.assets;
CREATE POLICY "chatter_read_managed_assets" ON public.assets
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.chatter_invitations ci
      WHERE ci.profile_id = public.assets.profile_id
        AND ci.chatter_id = auth.uid()
        AND ci.status = 'accepted'
    )
  );

-- creator_assets_owner stays ALL/owner-based: lets us keep a "Trash" or
-- show deleted assets inside EditLink where that's useful.

COMMIT;
