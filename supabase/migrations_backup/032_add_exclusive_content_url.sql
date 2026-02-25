-- Add exclusive_content_url column for custom redirect URL on the exclusive content button
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS exclusive_content_url text DEFAULT NULL;
