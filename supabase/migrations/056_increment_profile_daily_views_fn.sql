-- Migration 056: Add SQL function to atomically increment daily profile views
-- Called by the increment-profile-view Edge Function via rpc()

CREATE OR REPLACE FUNCTION increment_profile_daily_views(p_profile_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profile_analytics (profile_id, date, profile_views)
  VALUES (p_profile_id, CURRENT_DATE, 1)
  ON CONFLICT (profile_id, date)
  DO UPDATE SET
    profile_views = profile_analytics.profile_views + 1,
    updated_at = now();
END;
$$;

-- Allow the service role (used by Edge Functions) to call this function
GRANT EXECUTE ON FUNCTION increment_profile_daily_views(UUID) TO service_role;
