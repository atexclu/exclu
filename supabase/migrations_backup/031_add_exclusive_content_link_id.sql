-- Add exclusive_content_link_id column (was missing from 030 which was already applied)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS exclusive_content_link_id uuid DEFAULT NULL REFERENCES links(id) ON DELETE SET NULL;
