-- Fix the 2 pending tips from atexclu@gmail.com to t.berthou9@gmail.com
-- These tips were paid but ConfirmURL + verify-payment didn't fire/succeed

-- Find the fan user ID (atexclu@gmail.com) and creator user ID (t.berthou9@gmail.com)
-- and update the latest 2 pending tips to succeeded

WITH fan AS (
  SELECT id FROM auth.users WHERE email = 'atexclu@gmail.com' LIMIT 1
),
creator AS (
  SELECT id FROM auth.users WHERE email = 't.berthou9@gmail.com' LIMIT 1
)
UPDATE tips
SET status = 'succeeded',
    paid_at = created_at
WHERE fan_id = (SELECT id FROM fan)
  AND creator_id = (SELECT id FROM creator)
  AND status = 'pending'
  AND created_at > '2026-04-03';

-- Credit the creator wallet for these tips
-- First get the total amount that needs crediting
DO $$
DECLARE
  v_creator_id UUID;
  v_tip RECORD;
BEGIN
  SELECT id INTO v_creator_id FROM auth.users WHERE email = 't.berthou9@gmail.com' LIMIT 1;

  FOR v_tip IN
    SELECT id, amount_cents, creator_net_cents
    FROM tips
    WHERE creator_id = v_creator_id
      AND status = 'succeeded'
      AND paid_at = created_at  -- our marker for just-fixed tips
      AND created_at > '2026-04-03'
  LOOP
    -- Credit wallet with net amount (amount minus 5% fan fee minus 10% commission)
    DECLARE
      v_net INTEGER;
    BEGIN
      v_net := v_tip.creator_net_cents;
      IF v_net IS NULL OR v_net = 0 THEN
        v_net := ROUND(v_tip.amount_cents * 0.9); -- 10% commission fallback
      END IF;

      UPDATE profiles
      SET wallet_balance_cents = wallet_balance_cents + v_net,
          total_earned_cents = total_earned_cents + v_net
      WHERE id = v_creator_id;
    END;
  END LOOP;
END $$;
