-- Migration 191: Content/Feed two-axis refactor
--
-- Replaces the overloaded is_public / is_feed_preview model on `assets` with
-- a clean two-axis model:
--   - in_feed   : set in /app/content. Asset shows up in the public feed.
--   - is_public : set per-post in /app/home and /app/profile. When TRUE the
--                 post is visible to everyone; when FALSE the post is shown
--                 blurred to non-subscribers.
--
-- Backfill preserves what creators currently see: any asset previously
-- public OR set as the free preview becomes in_feed = TRUE; previously
-- private assets become in_feed = FALSE. is_public keeps its existing
-- values; existing public assets remain unblurred.
--
-- Storage RLS is widened so subscribers can fetch full-res for subs-only
-- feed assets directly via signed URLs (no extra Edge Function needed).

BEGIN;

-- ── 1) Add in_feed column ─────────────────────────────────────────────────
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS in_feed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assets.in_feed
  IS 'Whether this asset appears on the creator profile feed. Set in /app/content. Defaults FALSE — creators opt in.';

-- ── 2) Backfill from existing flags ───────────────────────────────────────
-- Anything currently visible (is_public OR was the free preview) stays in feed.
UPDATE public.assets
   SET in_feed = true
 WHERE (is_public = true OR is_feed_preview = true)
   AND deleted_at IS NULL
   AND in_feed = false;

-- ── 3) Drop is_feed_preview column + its partial unique indexes ──────────
DROP INDEX IF EXISTS public.uniq_feed_preview_per_profile;
DROP INDEX IF EXISTS public.uniq_feed_preview_per_creator_legacy;

ALTER TABLE public.assets
  DROP COLUMN IF EXISTS is_feed_preview;

-- ── 4) Replace is_public-based public read policy with in_feed-based ──────
-- The DB row is readable when the asset is in feed; storage access is
-- gated separately below. This lets fans receive blur path / mime / caption
-- regardless of public/subs status, while full-res storage stays gated.
DROP POLICY IF EXISTS "public_assets_read" ON public.assets;
CREATE POLICY "public_assets_read" ON public.assets
  FOR SELECT
  USING (in_feed = true AND deleted_at IS NULL);

-- ── 5) Storage policy: allow reads for public OR subscribed ───────────────
-- Replaces the migration 064 policy which gated only on is_public.
DROP POLICY IF EXISTS "public_content_read" ON storage.objects;
CREATE POLICY "public_content_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'paid-content'
    AND EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.storage_path = storage.objects.name
        AND a.in_feed = true
        AND a.deleted_at IS NULL
        AND (
          a.is_public = true
          OR EXISTS (
            SELECT 1 FROM public.fan_creator_subscriptions s
            WHERE s.fan_id = auth.uid()
              AND s.status = 'active'
              AND s.period_end > now()
              AND (
                (a.profile_id IS NOT NULL AND s.creator_profile_id = a.profile_id)
                OR (a.profile_id IS NULL AND s.creator_user_id = a.creator_id)
              )
          )
        )
    )
  );

-- ── 6) Update feed-ordering helper index to reference in_feed ─────────────
DROP INDEX IF EXISTS public.idx_assets_profile_feed;
CREATE INDEX idx_assets_profile_feed
  ON public.assets (profile_id, in_feed, created_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;
