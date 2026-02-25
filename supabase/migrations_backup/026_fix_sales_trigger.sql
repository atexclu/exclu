-- Fix: the auto_track_sale trigger was checking status = 'completed'
-- but the webhook inserts status = 'succeeded'. Also fix the column
-- reference from links.profile_id to links.creator_id.

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

-- Recreate the trigger to fire on status = 'succeeded' (what Stripe webhook actually inserts)
DROP TRIGGER IF EXISTS auto_track_sale ON purchases;
CREATE TRIGGER auto_track_sale
    AFTER INSERT ON purchases
    FOR EACH ROW
    WHEN (NEW.status = 'succeeded')
    EXECUTE FUNCTION track_sale();
