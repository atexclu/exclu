-- Add exclusive_content_image_url column for preview image on the exclusive content button
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS exclusive_content_image_url text DEFAULT NULL;
