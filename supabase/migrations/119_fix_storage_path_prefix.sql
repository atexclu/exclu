-- Fix assets with duplicated bucket prefix in storage_path
-- Some assets have storage_path = 'paid-content/userId/...' instead of 'userId/...'
-- The bucket name is already 'paid-content', so the path should NOT include it

UPDATE assets
SET storage_path = SUBSTRING(storage_path FROM LENGTH('paid-content/') + 1)
WHERE storage_path LIKE 'paid-content/%';

-- Also fix links table if any have the same issue
UPDATE links
SET storage_path = SUBSTRING(storage_path FROM LENGTH('paid-content/') + 1)
WHERE storage_path LIKE 'paid-content/%';
