-- 175_paid_content_bucket_size_limit.sql
-- Raise the paid-content storage bucket's file_size_limit to 500 MB so video
-- uploads >50 MB stop silently failing. The client-side validator already
-- caps at 500 MB (ContentLibrary.tsx:139, MAX_FILE_SIZE_MB) so anything we
-- accept on the form should also be accepted by the bucket.
--
-- The bucket was created through Supabase Studio rather than a migration,
-- so its default file_size_limit was inherited from the project default
-- (often 50 MB on the standard tier). Modern phone videos easily exceed
-- that, which manifests to the creator as "I can't upload my video".
--
-- Idempotent: only updates if the bucket exists; the value can be
-- re-applied without consequence.

UPDATE storage.buckets
SET file_size_limit = 500 * 1024 * 1024  -- 500 MB
WHERE id = 'paid-content'
  AND (file_size_limit IS NULL OR file_size_limit < 500 * 1024 * 1024);

-- Sanity audit: emit a NOTICE with the current value after the update so a
-- failed migration is obvious in the apply logs.
DO $$
DECLARE
  v_limit bigint;
BEGIN
  SELECT file_size_limit INTO v_limit FROM storage.buckets WHERE id = 'paid-content';
  IF v_limit IS NULL THEN
    RAISE NOTICE 'paid-content bucket not found — skipping size-limit update';
  ELSE
    RAISE NOTICE 'paid-content bucket file_size_limit is now % bytes (% MB)',
      v_limit, v_limit / (1024 * 1024);
  END IF;
END $$;
