-- Add aurora_gradient column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS aurora_gradient TEXT DEFAULT 'aurora';

-- Add comment
COMMENT ON COLUMN profiles.aurora_gradient IS 'Selected Aurora background gradient ID';
