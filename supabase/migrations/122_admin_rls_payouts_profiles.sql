-- Allow admins to read all profiles and payouts
-- This is needed for the admin Payments tab to work

-- Admin can read all profiles
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    )
  );

-- Enable RLS on payouts if not already enabled
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Creator can read own payouts
DROP POLICY IF EXISTS "Creators can read own payouts" ON payouts;
CREATE POLICY "Creators can read own payouts"
  ON payouts FOR SELECT
  TO authenticated
  USING (creator_id = auth.uid());

-- Creator can insert own payouts (via request-withdrawal edge function with service_role)
DROP POLICY IF EXISTS "Service role manages payouts" ON payouts;
CREATE POLICY "Service role manages payouts"
  ON payouts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin can read all payouts
DROP POLICY IF EXISTS "Admins can read all payouts" ON payouts;
CREATE POLICY "Admins can read all payouts"
  ON payouts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    )
  );
