-- supabase/migrations/148_feed_visuals_and_earnings.sql
--
-- Follow-up to 147:
--   A) assets.feed_blur_path — storage path of a pre-blurred thumbnail
--      generated client-side at upload (≈ 64px width). Non-subscribed viewers
--      receive ONLY this path, so the full-res image is never exposed in the
--      page source. The bucket RLS policy for paid-content already treats
--      public sub-paths under public assets as readable, but we tighten the
--      contract with an explicit column + comment so the frontend knows
--      which URL to sign.
--
--   B) storage policy update — previously only rows where is_public=true
--      were readable from storage. Now we also allow reading an asset's
--      feed_blur_path for any public asset regardless of the row's
--      is_public state (the blur preview is BY DESIGN safe to expose).
--      Since feed_blur_path is only ever set for public feed content, this
--      doesn't leak anything extra.
--
--   C) fan_creator_subscriptions.creator_net_cents — denormalized at webhook
--      time so the creator-side earnings dashboards don't need to recompute
--      commission each time. 100% for Pro, 85% for Free (15% platform fee
--      per pricing spec).

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  A — assets.feed_blur_path                                            ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE "public"."assets"
  ADD COLUMN IF NOT EXISTS "feed_blur_path" text;

COMMENT ON COLUMN "public"."assets"."feed_blur_path" IS
  'Storage path of a pre-blurred thumbnail (~64px wide, JPEG) generated client-side on upload. Served to non-subscribed viewers so the full-res image never leaves the server for locked posts.';

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  B — storage policy: allow reading feed_blur_path for public assets   ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- Complement to the existing "public_content_read" policy (migration 064):
-- the blur preview sibling object is always readable if the parent asset
-- is public. This keeps the lock-screen preview cheap (no signed URL is
-- actually needed because the blur is safe) while keeping the full-res
-- object behind a signed URL only subscribed users can obtain.
DROP POLICY IF EXISTS "public_blur_preview_read" ON storage.objects;
CREATE POLICY "public_blur_preview_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'paid-content'
    AND EXISTS (
      SELECT 1 FROM public.assets
      WHERE assets.feed_blur_path = objects.name
        AND assets.is_public = true
    )
  );

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  C — fan_creator_subscriptions.creator_net_cents                      ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE "public"."fan_creator_subscriptions"
  ADD COLUMN IF NOT EXISTS "creator_net_cents" integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN "public"."fan_creator_subscriptions"."creator_net_cents" IS
  'Net amount (in cents) credited to the creator wallet per billing cycle. Computed at Sale/Rebill time from price_cents * (1 - platform commission).';

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  D — creator_subscription_earnings view                               ║
-- ║      (aggregate used by the creator dashboard)                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- Lifetime + recent earnings per creator from fan subscriptions.
-- Uses the price_cents of active cycles; for a robust ledger a dedicated
-- `fan_subscription_charges` table would be next, but this gives the
-- creator an accurate-enough picture from day one.
CREATE OR REPLACE VIEW "public"."creator_fan_subscription_earnings"
WITH ("security_invoker" = 'on')
AS
SELECT
  sub.creator_user_id                AS creator_user_id,
  COUNT(*) FILTER (WHERE sub.status IN ('active', 'cancelled') AND sub.period_end > now()) AS active_subscribers,
  COALESCE(SUM(sub.creator_net_cents) FILTER (WHERE sub.started_at IS NOT NULL), 0) AS lifetime_net_cents,
  COALESCE(SUM(sub.creator_net_cents) FILTER (WHERE sub.period_start >= (now() - interval '30 days')), 0) AS last_30d_net_cents
  FROM public.fan_creator_subscriptions sub
 GROUP BY sub.creator_user_id;

COMMENT ON VIEW "public"."creator_fan_subscription_earnings" IS
  'Per-creator roll-up of active subscribers + lifetime / last-30d fan subscription earnings. security_invoker=on so creators only see their own row through the underlying RLS.';
