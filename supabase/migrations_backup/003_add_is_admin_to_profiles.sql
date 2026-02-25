-- Add is_admin flag to profiles for admin-only features (e.g. admin dashboard, impersonation tools)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT FALSE;
