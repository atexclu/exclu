-- Migration 057: Fix profile_analytics RLS policies to use profiles.id directly
-- The FK was corrected in migration 022 to reference profiles(id),
-- but the RLS policies still joined through creator_profiles which may not exist.

DROP POLICY IF EXISTS "Users can view their own profile analytics" ON profile_analytics;
DROP POLICY IF EXISTS "Users can manage their own profile analytics" ON profile_analytics;

CREATE POLICY "Users can view their own profile analytics"
  ON profile_analytics FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Users can manage their own profile analytics"
  ON profile_analytics FOR ALL
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
