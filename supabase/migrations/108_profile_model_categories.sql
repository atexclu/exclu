-- Add model_categories to profiles table
-- For agency accounts, stores the types of models they manage
-- Used for filtering in directory/agencies (profile-based agency entries)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS model_categories text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_profiles_model_categories
  ON profiles USING GIN (model_categories);
