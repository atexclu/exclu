-- Migration 021: Update sales counters for existing purchases
-- This migration ensures that all existing sales are properly reflected in profile_analytics

-- ============================================================================
-- SALES COUNTER SYSTEM
-- ============================================================================
--
-- Sales are tracked in two places:
-- 1. purchases table: Individual purchase records
-- 2. profile_analytics table: Aggregated daily metrics per creator
--
-- The profile_analytics.sales_count and revenue_cents are updated via:
-- - SQL trigger: auto_track_sale (on purchases table)
-- - Increments sales_count and revenue_cents when a new purchase is created
--
-- This migration backfills profile_analytics for any existing purchases
-- that may not have been properly tracked.
-- ============================================================================

-- Backfill profile_analytics with existing purchase data
-- This will aggregate all purchases by creator and date
INSERT INTO profile_analytics (profile_id, date, sales_count, revenue_cents)
SELECT 
    l.creator_id as profile_id,
    DATE(p.created_at) as date,
    COUNT(p.id)::INTEGER as sales_count,
    SUM(p.amount_cents)::BIGINT as revenue_cents
FROM purchases p
INNER JOIN links l ON l.id = p.link_id
WHERE l.creator_id IS NOT NULL
GROUP BY l.creator_id, DATE(p.created_at)
ON CONFLICT (profile_id, date) 
DO UPDATE SET
    sales_count = GREATEST(profile_analytics.sales_count, EXCLUDED.sales_count),
    revenue_cents = GREATEST(profile_analytics.revenue_cents, EXCLUDED.revenue_cents),
    updated_at = now();

-- Add comment to document the system
COMMENT ON TABLE purchases IS 'Individual purchase records. Each purchase is linked to a link (content) and tracked in profile_analytics via the auto_track_sale trigger.';

-- Verify the trigger exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'auto_track_sale'
    ) THEN
        RAISE NOTICE 'WARNING: auto_track_sale trigger does not exist. It should be created by migration 013.';
    END IF;
END $$;
