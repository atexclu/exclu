-- ============================================================================
-- Migration 103: Scheduled article auto-publish (pg_cron)
--
-- Runs every minute. Flips blog_articles from 'scheduled' → 'published'
-- when scheduled_at <= now(). Also sets published_at if not already set.
-- ============================================================================

-- 1. Enable pg_cron (Supabase has this extension available)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. Function: publish_scheduled_articles
CREATE OR REPLACE FUNCTION publish_scheduled_articles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE blog_articles
  SET
    status       = 'published',
    published_at = COALESCE(published_at, now()),
    updated_at   = now()
  WHERE status = 'scheduled'
    AND scheduled_at IS NOT NULL
    AND scheduled_at <= now();

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON FUNCTION publish_scheduled_articles IS
  'Auto-publishes scheduled blog articles whose scheduled_at has passed. Called by pg_cron every minute.';

-- 3. Schedule the cron job (every minute)
SELECT cron.schedule(
  'publish-scheduled-articles',
  '* * * * *',
  $$SELECT publish_scheduled_articles()$$
);
