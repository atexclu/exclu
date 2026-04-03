-- Revert migration 119: re-add 'paid-content/' prefix to storage paths
-- The files in Supabase Storage are actually stored under a 'paid-content/'
-- subfolder within the bucket, so the storage_path must include this prefix.

UPDATE assets
SET storage_path = 'paid-content/' || storage_path
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE 'paid-content/%'
  AND length(storage_path) > 10;

UPDATE links
SET storage_path = 'paid-content/' || storage_path
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE 'paid-content/%'
  AND length(storage_path) > 10;
