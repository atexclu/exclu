-- ============================================================
-- Migration 114: Allow guest gifting on gift_purchases
-- ============================================================
-- Makes fan_id nullable (guests can gift without an account)
-- Adds fan_name column for guest display name
-- Mirrors the tips table pattern for guest support
-- ============================================================

-- 1. Make fan_id nullable for guest gifting
ALTER TABLE gift_purchases ALTER COLUMN fan_id DROP NOT NULL;

-- 2. Add fan_name for guest identification
ALTER TABLE gift_purchases ADD COLUMN IF NOT EXISTS fan_name TEXT;

-- 3. Update RLS: allow anon users to view their gifts by id (for success page)
DROP POLICY IF EXISTS "Anyone can view gift by id" ON gift_purchases;
CREATE POLICY "Anyone can view gift by id"
  ON gift_purchases FOR SELECT
  TO anon
  USING (true);
