-- Allow anonymous and authenticated users to read public assets
CREATE POLICY "public_assets_read" ON "public"."assets"
  FOR SELECT
  USING (is_public = true);

-- Allow reading storage objects that correspond to public assets
CREATE POLICY "public_content_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'paid-content'
    AND EXISTS (
      SELECT 1 FROM public.assets
      WHERE assets.storage_path = objects.name
        AND assets.is_public = true
    )
  );
