-- Agency classification columns on profiles table
-- For account-based agencies (premium accounts managing multiple profiles)
-- These mirror the directory_agencies classification columns but are stored on the user profile
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS agency_pricing text,
  ADD COLUMN IF NOT EXISTS agency_target_market text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS agency_services_offered text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS agency_platform_focus text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS agency_growth_strategy text[] DEFAULT '{}';

-- model_categories (from migration 108) is reused as agency_model_types

CREATE INDEX IF NOT EXISTS idx_profiles_agency_target_market
  ON profiles USING GIN (agency_target_market);

CREATE INDEX IF NOT EXISTS idx_profiles_agency_services
  ON profiles USING GIN (agency_services_offered);

CREATE INDEX IF NOT EXISTS idx_profiles_agency_platform
  ON profiles USING GIN (agency_platform_focus);

CREATE INDEX IF NOT EXISTS idx_profiles_agency_growth
  ON profiles USING GIN (agency_growth_strategy);
