-- Migration 058: Clean up backfill artifacts in profile_analytics
-- Migration 006 copied the total profile_view_count into a single day entry,
-- creating artificially high spikes (e.g. 77 views on one day when the real
-- total is 62). These entries are impossible: a single day cannot have more
-- views than the creator's current total. We zero them out.

UPDATE profile_analytics pa
SET profile_views = 0
FROM profiles p
WHERE pa.profile_id = p.id
  AND pa.profile_views > p.profile_view_count
  AND pa.date < CURRENT_DATE - INTERVAL '1 day';
