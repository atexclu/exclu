-- Query to find all links without associated content
-- These are links that have neither storage_path NOR any link_media entries
-- Safe to delete as they have no media attached

SELECT 
  l.id,
  l.title,
  l.slug,
  l.creator_id,
  p.handle as creator_handle,
  p.display_name as creator_name,
  l.status,
  l.price_cents,
  l.created_at,
  l.storage_path,
  COUNT(lm.asset_id) as link_media_count
FROM links l
LEFT JOIN profiles p ON l.creator_id = p.id
LEFT JOIN link_media lm ON l.id = lm.link_id
WHERE l.storage_path IS NULL
GROUP BY l.id, l.title, l.slug, l.creator_id, p.handle, p.display_name, l.status, l.price_cents, l.created_at, l.storage_path
HAVING COUNT(lm.asset_id) = 0
ORDER BY l.created_at DESC;

-- Count of orphaned links
SELECT COUNT(*) as orphaned_links_count
FROM links l
LEFT JOIN link_media lm ON l.id = lm.link_id
WHERE l.storage_path IS NULL
GROUP BY l.id
HAVING COUNT(lm.asset_id) = 0;

-- DELETE query (run ONLY after verifying the SELECT results above)
-- UNCOMMENT AND RUN CAREFULLY:
/*
DELETE FROM links
WHERE id IN (
  SELECT l.id
  FROM links l
  LEFT JOIN link_media lm ON l.id = lm.link_id
  WHERE l.storage_path IS NULL
  GROUP BY l.id
  HAVING COUNT(lm.asset_id) = 0
);
*/
