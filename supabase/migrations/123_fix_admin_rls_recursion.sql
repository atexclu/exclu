-- Fix infinite recursion in admin RLS policy on profiles
-- The "Admins can read all profiles" policy checks profiles.is_admin,
-- which triggers the same policy again → infinite loop → 500 error.
-- Solution: use a SECURITY DEFINER function to check admin status.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Drop the broken policy
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;

-- Recreate using the SECURITY DEFINER function (bypasses RLS on profiles)
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Also fix the payouts policy to use the same function
DROP POLICY IF EXISTS "Admins can read all payouts" ON payouts;
CREATE POLICY "Admins can read all payouts"
  ON payouts FOR SELECT
  TO authenticated
  USING (public.is_admin());
