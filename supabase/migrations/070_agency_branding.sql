-- Migration 070: Agency branding
-- Adds agency branding columns for the 12.6 feature.
-- agency_name & agency_logo_url live on profiles (account-level, shared across all profiles).
-- show_agency_branding lives on creator_profiles (per-profile toggle, default true for agency users).

-- Account-level agency branding info
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agency_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agency_logo_url text;

-- Per-profile toggle: creator can opt-out of showing agency branding on their public page
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS show_agency_branding boolean DEFAULT true;
