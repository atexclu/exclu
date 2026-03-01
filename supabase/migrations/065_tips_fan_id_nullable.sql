-- ============================================================================
-- Migration 065: Allow anonymous tips (fan_id nullable on tips table)
-- Visitors can tip without a Supabase account. fan_id is null in that case.
-- The FK constraint is dropped and the column made nullable.
-- RLS policies are updated to only expose tips to authenticated fans.
-- ============================================================================

-- 1. Drop the NOT NULL constraint and FK on fan_id
ALTER TABLE tips
  ALTER COLUMN fan_id DROP NOT NULL;

-- 2. Drop the old FK constraint (recreate as nullable FK)
ALTER TABLE tips
  DROP CONSTRAINT IF EXISTS tips_fan_id_fkey;

ALTER TABLE tips
  ADD CONSTRAINT tips_fan_id_fkey
    FOREIGN KEY (fan_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;

-- 3. Update RLS: fans can only see their own tips when logged in
DROP POLICY IF EXISTS "Fans can view their own tips" ON tips;
CREATE POLICY "Fans can view their own tips"
  ON tips FOR SELECT
  TO authenticated
  USING (fan_id = auth.uid());

-- 4. Allow unauthenticated inserts via service role (edge function uses service role key)
-- No change needed — service role bypasses RLS.
