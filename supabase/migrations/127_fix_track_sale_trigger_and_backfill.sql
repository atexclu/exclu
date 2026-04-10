-- Migration 127: Fix track_sale trigger to also fire on UPDATE + backfill analytics
--
-- Problem: The track_sale trigger only fired on INSERT with status='succeeded'.
-- But the UGP flow inserts purchases as 'pending' then UPDATEs to 'succeeded'.
-- This meant profile_analytics.sales_count and revenue_cents were never incremented
-- for UGP payments.
--
-- Fix:
--   1. Replace trigger to fire on INSERT OR UPDATE when status = 'succeeded'
--   2. Add guard for UPDATE: only fire when old status was NOT 'succeeded' (idempotency)
--   3. Backfill profile_analytics for all succeeded purchases not yet tracked

-- ── 1. Replace the track_sale function with UPDATE support ──────────────

CREATE OR REPLACE FUNCTION track_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_creator_id UUID;
BEGIN
    -- Only process if this is a genuine transition to 'succeeded'
    -- INSERT: NEW.status must be 'succeeded' (handled by trigger WHEN clause)
    -- UPDATE: OLD.status must NOT be 'succeeded' to avoid double-counting
    IF TG_OP = 'UPDATE' AND OLD.status = 'succeeded' THEN
        RETURN NEW;
    END IF;

    SELECT creator_id INTO v_creator_id
    FROM links
    WHERE id = NEW.link_id;

    IF v_creator_id IS NOT NULL THEN
        INSERT INTO profile_analytics (profile_id, date, sales_count, revenue_cents)
        VALUES (v_creator_id, COALESCE(NEW.created_at::date, CURRENT_DATE), 1, NEW.amount_cents)
        ON CONFLICT (profile_id, date)
        DO UPDATE SET
            sales_count = profile_analytics.sales_count + 1,
            revenue_cents = profile_analytics.revenue_cents + EXCLUDED.revenue_cents,
            updated_at = now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Recreate trigger for INSERT OR UPDATE ────────────────────────────

DROP TRIGGER IF EXISTS auto_track_sale ON purchases;
CREATE TRIGGER auto_track_sale
    AFTER INSERT OR UPDATE ON purchases
    FOR EACH ROW
    WHEN (NEW.status = 'succeeded')
    EXECUTE FUNCTION track_sale();

-- ── 3. Backfill profile_analytics for succeeded purchases not yet tracked ──
-- We re-aggregate from scratch to avoid duplicates

INSERT INTO profile_analytics (profile_id, date, sales_count, revenue_cents)
SELECT
    l.creator_id AS profile_id,
    p.created_at::date AS date,
    COUNT(*) AS sales_count,
    COALESCE(SUM(p.amount_cents), 0) AS revenue_cents
FROM purchases p
JOIN links l ON l.id = p.link_id
WHERE p.status = 'succeeded'
  AND l.creator_id IS NOT NULL
GROUP BY l.creator_id, p.created_at::date
ON CONFLICT (profile_id, date)
DO UPDATE SET
    sales_count = EXCLUDED.sales_count,
    revenue_cents = EXCLUDED.revenue_cents,
    updated_at = now();
