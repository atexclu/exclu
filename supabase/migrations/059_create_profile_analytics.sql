-- Migration 059: Create profile_analytics table (prod)
-- This repo previously had profile_analytics only in migrations_backup.
-- The creator dashboard chart relies on this table for historical metrics.

CREATE TABLE IF NOT EXISTS profile_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  profile_views INTEGER NOT NULL DEFAULT 0,
  link_clicks INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  revenue_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_profile_analytics_profile_date UNIQUE (profile_id, date)
);

CREATE INDEX IF NOT EXISTS idx_profile_analytics_profile_date
  ON profile_analytics(profile_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_profile_analytics_date
  ON profile_analytics(date DESC);

ALTER TABLE profile_analytics ENABLE ROW LEVEL SECURITY;
