-- 182_public_assets_bucket.sql
-- Configure the `public-assets` bucket created via the Storage API: raise
-- file_size_limit to 300 MB so the onboarding tutorial video (~230 MB) can
-- be hosted there, and pin allowed_mime_types to the image+video types we
-- actually serve.
--
-- The bucket itself was created via the Storage API (which respects the
-- project-wide max). This migration relaxes the bucket-level cap exactly
-- like 175_paid_content_bucket_size_limit.sql does for paid-content.
--
-- Idempotent: only updates an existing bucket; safe to re-apply.

UPDATE storage.buckets
SET file_size_limit = 300 * 1024 * 1024,  -- 300 MB
    allowed_mime_types = ARRAY[
      'video/mp4', 'video/webm',
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'
    ]
WHERE id = 'public-assets';

DO $$
DECLARE
  v_limit bigint;
  v_public boolean;
BEGIN
  SELECT file_size_limit, public INTO v_limit, v_public
    FROM storage.buckets WHERE id = 'public-assets';
  IF v_limit IS NULL THEN
    RAISE NOTICE 'public-assets bucket not found — create it via the Storage API first';
  ELSE
    RAISE NOTICE 'public-assets bucket: file_size_limit=% MB, public=%',
      v_limit / (1024 * 1024), v_public;
  END IF;
END $$;
