-- Add model_categories to directory_agencies
-- Allows agencies to declare what type of models they manage
-- Used for filtering on the agency directory page
ALTER TABLE directory_agencies
  ADD COLUMN IF NOT EXISTS model_categories text[] DEFAULT '{}';

-- Index for GIN array containment queries (same approach as creator_profiles)
CREATE INDEX IF NOT EXISTS idx_directory_agencies_model_categories
  ON directory_agencies USING GIN (model_categories);
