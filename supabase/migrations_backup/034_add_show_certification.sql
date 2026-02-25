-- Add show_certification column to profiles (premium feature)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_certification boolean DEFAULT true;
