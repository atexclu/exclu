-- Add show_available_now column to profiles (premium feature for availability indicator)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_available_now boolean DEFAULT false;
