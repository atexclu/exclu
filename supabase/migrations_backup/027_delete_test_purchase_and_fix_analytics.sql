-- Delete the test purchase
DELETE FROM purchases WHERE id = 'd9af7697-972d-4cac-a12d-bc817e73c4cb';

-- Decrement the analytics counter that was incremented by the trigger
-- The purchase was for link 31b9dc44... with amount_cents 53, on 2026-02-07
-- We need to find the creator_id via the link
DO $$
DECLARE
  v_creator_id UUID;
BEGIN
  SELECT creator_id INTO v_creator_id FROM links WHERE id = '31b9dc44-4d26-4339-84c3-517ed24ce208';
  
  IF v_creator_id IS NOT NULL THEN
    UPDATE profile_analytics
    SET sales_count = GREATEST(sales_count - 1, 0),
        revenue_cents = GREATEST(revenue_cents - 53, 0)
    WHERE profile_id = v_creator_id
      AND date = '2026-02-07';
  END IF;
END $$;
