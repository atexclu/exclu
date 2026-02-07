-- Migration 013: Fix profile_analytics triggers to work with current schema
-- This migration corrects the triggers to use profiles instead of creator_profiles
-- and links.creator_id instead of links.profile_id

-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS auto_track_profile_view ON creator_profiles;
DROP TRIGGER IF EXISTS auto_track_link_click ON links;
DROP TRIGGER IF EXISTS auto_track_sale ON purchases;
DROP FUNCTION IF EXISTS track_profile_view();
DROP FUNCTION IF EXISTS track_link_click();
DROP FUNCTION IF EXISTS track_sale();

-- ----------------------------------------------------------------------------
-- Trigger 1: Track profile views
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION track_profile_view()
RETURNS TRIGGER AS $$
BEGIN
    -- Only track for creators
    IF NEW.is_creator = true THEN
        -- Increment profile_views in profile_analytics
        INSERT INTO profile_analytics (profile_id, date, profile_views)
        VALUES (NEW.id, CURRENT_DATE, 1)
        ON CONFLICT (profile_id, date)
        DO UPDATE SET 
            profile_views = profile_analytics.profile_views + 1,
            updated_at = now();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_track_profile_view
    AFTER UPDATE OF profile_view_count ON profiles
    FOR EACH ROW
    WHEN (NEW.profile_view_count > OLD.profile_view_count AND NEW.is_creator = true)
    EXECUTE FUNCTION track_profile_view();

-- ----------------------------------------------------------------------------
-- Trigger 2: Track link clicks
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION track_link_click()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment link_clicks in profile_analytics using creator_id
    INSERT INTO profile_analytics (profile_id, date, link_clicks)
    VALUES (NEW.creator_id, CURRENT_DATE, 1)
    ON CONFLICT (profile_id, date)
    DO UPDATE SET 
        link_clicks = profile_analytics.link_clicks + 1,
        updated_at = now();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_track_link_click
    AFTER UPDATE OF click_count ON links
    FOR EACH ROW
    WHEN (NEW.click_count > OLD.click_count AND NEW.creator_id IS NOT NULL)
    EXECUTE FUNCTION track_link_click();

-- ----------------------------------------------------------------------------
-- Trigger 3: Track sales
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION track_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_creator_id UUID;
BEGIN
    -- Get the creator_id from the link
    SELECT creator_id INTO v_creator_id
    FROM links
    WHERE id = NEW.link_id;
    
    IF v_creator_id IS NOT NULL THEN
        -- Increment sales and revenue in profile_analytics
        INSERT INTO profile_analytics (profile_id, date, sales_count, revenue_cents)
        VALUES (v_creator_id, CURRENT_DATE, 1, NEW.amount_cents)
        ON CONFLICT (profile_id, date)
        DO UPDATE SET 
            sales_count = profile_analytics.sales_count + 1,
            revenue_cents = profile_analytics.revenue_cents + EXCLUDED.revenue_cents,
            updated_at = now();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_track_sale
    AFTER INSERT ON purchases
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION track_sale();

-- ----------------------------------------------------------------------------
-- Migrate existing data to profile_analytics
-- ----------------------------------------------------------------------------

-- Migrate profile views from creator_profiles (not profiles)
INSERT INTO profile_analytics (profile_id, date, profile_views)
SELECT 
    id,
    CURRENT_DATE,
    profile_view_count
FROM creator_profiles
WHERE profile_view_count > 0
ON CONFLICT (profile_id, date) DO UPDATE SET
    profile_views = GREATEST(profile_analytics.profile_views, EXCLUDED.profile_views);

-- Migrate link clicks from links (using profile_id if available, otherwise skip)
INSERT INTO profile_analytics (profile_id, date, link_clicks)
SELECT 
    profile_id,
    CURRENT_DATE,
    SUM(click_count)
FROM links
WHERE profile_id IS NOT NULL AND click_count > 0
GROUP BY profile_id
ON CONFLICT (profile_id, date) DO UPDATE SET
    link_clicks = GREATEST(profile_analytics.link_clicks, EXCLUDED.link_clicks);

-- Migrate sales from purchases (join with links to get profile_id)
INSERT INTO profile_analytics (profile_id, date, sales_count, revenue_cents)
SELECT 
    l.profile_id,
    CURRENT_DATE,
    COUNT(*),
    SUM(p.amount_cents)
FROM purchases p
JOIN links l ON l.id = p.link_id
WHERE l.profile_id IS NOT NULL AND p.status = 'succeeded'
GROUP BY l.profile_id
ON CONFLICT (profile_id, date) DO UPDATE SET
    sales_count = GREATEST(profile_analytics.sales_count, EXCLUDED.sales_count),
    revenue_cents = GREATEST(profile_analytics.revenue_cents, EXCLUDED.revenue_cents);

-- Add comment
COMMENT ON TABLE profile_analytics IS 'Métriques quotidiennes par profil créateur. Alimentée automatiquement par les triggers sur profiles, links et purchases.';
