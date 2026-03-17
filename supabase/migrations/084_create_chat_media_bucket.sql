-- ══════════════════════════════════════════════════════════════════════
-- 084 — Create chat-media storage bucket
--
-- Public bucket for media (images/videos) shared in chat conversations.
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  52428800, -- 50 MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload chat media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

-- Allow public read (bucket is public)
CREATE POLICY "Public read access for chat media"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'chat-media');
