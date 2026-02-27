-- ============================================================================
-- Migration 054: Add is_support_link column to links table
-- ============================================================================
-- Support links are paid links with no content attached. Fans pay to
-- support the creator directly. The existing checkout flow handles them
-- like normal link purchases, but the PublicLink UI shows a "support"
-- message instead of a content unlock card.
-- ============================================================================

ALTER TABLE links
  ADD COLUMN IF NOT EXISTS is_support_link BOOLEAN DEFAULT false;

COMMENT ON COLUMN links.is_support_link IS 'True for support links that have a price but no content. Used to display a support-focused UI instead of the content unlock card.';
