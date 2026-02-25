-- Migration 015: Add mime_type and storage_path columns to links table
-- These columns are needed to store content directly in links for the public gallery

-- Add mime_type column to links table
ALTER TABLE links
ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Add storage_path column to links table
ALTER TABLE links
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Add index for performance when querying by mime_type
CREATE INDEX IF NOT EXISTS idx_links_mime_type ON links(mime_type);

-- Add index for storage_path lookups
CREATE INDEX IF NOT EXISTS idx_links_storage_path ON links(storage_path);

-- Add comment
COMMENT ON COLUMN links.mime_type IS 'MIME type of the content (e.g., image/jpeg, video/mp4)';
COMMENT ON COLUMN links.storage_path IS 'Path to the content file in Supabase storage (paid-content bucket)';
n