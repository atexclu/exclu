-- Add show_deeplinks column to profiles (premium feature for mobile deep linking)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_deeplinks boolean DEFAULT true;
