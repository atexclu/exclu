-- ============================================================================
-- Migration 104: Agency Categories & Classification
-- ============================================================================
-- Adds categorization fields to directory_agencies table for filtering
-- Based on OnlyFans Agency Classification Categories
-- ============================================================================

-- Add category columns to directory_agencies
ALTER TABLE directory_agencies 
  ADD COLUMN IF NOT EXISTS pricing_structure text 
    CHECK (pricing_structure IS NULL OR pricing_structure IN (
      'high_commission', 'mid_commission', 'low_commission', 'fixed_fee'
    )),
  ADD COLUMN IF NOT EXISTS target_market text[]
    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS services_offered text[]
    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS platform_focus text[]
    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS geography text[]
    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS growth_strategy text[]
    DEFAULT '{}';

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_directory_agencies_pricing 
  ON directory_agencies(pricing_structure) 
  WHERE pricing_structure IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_directory_agencies_target_market 
  ON directory_agencies USING GIN(target_market);

CREATE INDEX IF NOT EXISTS idx_directory_agencies_services 
  ON directory_agencies USING GIN(services_offered);

CREATE INDEX IF NOT EXISTS idx_directory_agencies_platform 
  ON directory_agencies USING GIN(platform_focus);

CREATE INDEX IF NOT EXISTS idx_directory_agencies_geography 
  ON directory_agencies USING GIN(geography);

CREATE INDEX IF NOT EXISTS idx_directory_agencies_growth 
  ON directory_agencies USING GIN(growth_strategy);

-- Add claim system columns
ALTER TABLE directory_agencies
  ADD COLUMN IF NOT EXISTS is_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claimed_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claim_requested_by_email text,
  ADD COLUMN IF NOT EXISTS claim_requested_at timestamptz;

-- Index for claim queries
CREATE INDEX IF NOT EXISTS idx_directory_agencies_claimed 
  ON directory_agencies(is_claimed, claim_pending);

COMMENT ON COLUMN directory_agencies.pricing_structure IS 'Agency pricing model: high_commission (50%+), mid_commission (30-50%), low_commission (<30%), fixed_fee';
COMMENT ON COLUMN directory_agencies.target_market IS 'Target creator segments: beginner_models, mid_tier_creators, top_creators, niche_models, ai_models';
COMMENT ON COLUMN directory_agencies.services_offered IS 'Services: full_management, chatting, marketing';
COMMENT ON COLUMN directory_agencies.platform_focus IS 'Platforms: onlyfans, multi_platform, exclu';
COMMENT ON COLUMN directory_agencies.geography IS 'Geographic locations/markets';
COMMENT ON COLUMN directory_agencies.growth_strategy IS 'Growth methods: paid_traffic, reddit, twitter, snapchat, organic, ai, viral_insta_tiktok, adult_traffic, sfs';
COMMENT ON COLUMN directory_agencies.is_claimed IS 'Whether this agency profile has been claimed by a real agency';
COMMENT ON COLUMN directory_agencies.claim_pending IS 'Whether there is a pending claim request awaiting admin approval';
