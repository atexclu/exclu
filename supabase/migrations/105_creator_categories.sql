-- ============================================================================
-- Migration 105: Creator/Model Categories
-- ============================================================================
-- Adds categorization fields to creator_profiles for directory filtering
-- Based on Model Directory Categories (Updated)
-- ============================================================================

-- Add category columns to creator_profiles
ALTER TABLE creator_profiles 
  ADD COLUMN IF NOT EXISTS model_categories text[]
    DEFAULT '{}';

-- Create GIN index for array filtering
CREATE INDEX IF NOT EXISTS idx_creator_profiles_categories 
  ON creator_profiles USING GIN(model_categories);

-- "New In" filtering: use created_at DESC index directly
-- Filter at query time with: WHERE created_at > (now() - interval '10 days')
CREATE INDEX IF NOT EXISTS idx_creator_profiles_created_at 
  ON creator_profiles(created_at DESC);

COMMENT ON COLUMN creator_profiles.model_categories IS 'Array of category tags: trending_now (18yo, college, teen, petite, goth, alt, cosplay, pornstar), type_look (latina, asian, ebony, indian, arab, hijab, bbw, milf, redhead, blonde, brunette, natural, skinny, girl_next_door, amateur), niche_kinks (joi, asmr, fetish, femdom, hairy, squirting, anal, trans, femboy, feet, domination, latex), features (big_tits, big_ass, tattooed, fitness, pregnant, lesbian, couple), experience (girlfriend_experience, ai_girlfriend)';
