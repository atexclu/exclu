-- Add exclusive content button columns to profiles
-- exclusive_content_text: custom label for the gradient button on the public profile
-- exclusive_content_link_id: which paid link the button opens (references links.id)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS exclusive_content_text text DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS exclusive_content_link_id uuid DEFAULT NULL REFERENCES links(id) ON DELETE SET NULL;
