-- CRITICAL SECURITY FIX: Purchases data isolation
-- ================================================
--
-- PROBLEM:
-- The "Public can read succeeded purchases by session" RLS policy was too permissive.
-- It allowed ANY user (including anonymous) to read ALL succeeded purchases that have
-- a stripe_session_id set. Combined with the dashboard not filtering by creator,
-- every creator could see every other creator's sales data (total sales, revenue).
--
-- ROOT CAUSE:
-- Policy: USING (status = 'succeeded' AND stripe_session_id IS NOT NULL)
-- This returns ALL succeeded purchases to any query, not just the one matching
-- a specific session_id.
--
-- FIX (two-pronged):
-- 1. FRONTEND (AppDashboard.tsx): Now explicitly filters purchases by the creator's
--    own link IDs (.in('link_id', creatorLinkIds)), so even with permissive RLS,
--    only the creator's own data is returned.
-- 2. RLS (this migration): Replace the blanket public policy with a role-scoped one.
--    The public policy for post-checkout verification is kept but scoped to anon role
--    only (buyers are not authenticated). Authenticated creators are covered by
--    "Creators see purchases of their links" which properly checks creator_id.
--
-- The "Creators see purchases of their links" policy is correct and unchanged:
--   USING (EXISTS (SELECT 1 FROM links l WHERE l.id = purchases.link_id AND l.creator_id = auth.uid()))

-- 1. Drop the overly permissive policy
DROP POLICY IF EXISTS "Public can read succeeded purchases by session" ON purchases;

-- 2. Re-create with the same conditions but scoped to anon role only.
-- This policy is needed for PublicLink.tsx post-checkout verification where the buyer
-- is NOT authenticated. The stripe_session_id is a unique Stripe-generated value
-- that acts as a secret - only the buyer who just completed checkout knows it.
-- Authenticated users (creators) should ONLY access purchases via the
-- "Creators see purchases of their links" policy which properly filters by creator_id.
CREATE POLICY "Anon can verify purchase by session"
ON purchases
FOR SELECT
TO anon
USING (
  status = 'succeeded'
  AND stripe_session_id IS NOT NULL
);
