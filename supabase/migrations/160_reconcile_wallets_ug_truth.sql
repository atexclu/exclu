-- Migration 160: Reconcile wallets against UG Payments truth (docs/sales/sales.md, up to 2026-04-21)
--
-- Problem
--   A prior webhook/confirmation flow treated "Successful Verify" (card auth only, no money
--   captured) as a completed sale, and also flagged transactions whose actual Sale was
--   declined. That inflated creator wallets & total_earned. Test-card (4242...) and dev-only
--   transactions were also marked succeeded in DB.
--
-- This migration
--   1. Marks the exact 25 illegit DB rows as failed/cancelled (purchases, tips, custom_requests).
--      Each row is referenced by UUID; re-running is a no-op thanks to status guards.
--   2. Recomputes, for every creator with any non-zero wallet/earned/withdrawn value,
--      the three ledger fields from the legit DB state:
--        total_earned_cents   = Σ creator_net_cents over surviving succeeded/paid rows
--        total_withdrawn_cents = Σ amount_cents over active payouts (pending/processing/approved/completed/paid/sent)
--        wallet_balance_cents  = GREATEST(0, total_earned - total_withdrawn)   -- clamped
--   3. Writes one audit row per impacted creator to wallet_adjustments
--      (reason = 'ug-payment-reconciliation-2026-04-21'). The unique constraint on
--      (source_table, source_id, reason) makes the log write idempotent.
--
-- Pending payouts are intentionally left untouched (three of them exceed the legit earnings —
-- bellebaby $58.50/$49.50, sexyboy $22.50/$22.50, yomomma69 $90/$45, star $45/$0 — will be
-- reviewed manually by the admin).

BEGIN;

-- ── Step 1: Mark illegit rows ────────────────────────────────────────

-- 1a. Purchases with no matching UG Successful Sale
UPDATE purchases
SET status = 'failed'
WHERE status = 'succeeded'
  AND id IN (
    -- Declined Sale after Successful Verify (real buyer, capture failed)
    '52300e0b-5bc7-4265-b6a1-1289587651c7', -- Jeff Neuburger
    'c09bc923-c365-46ff-8cea-8a7d02e62300', -- Stefan Setzenstuhl
    'd19a3453-818b-414d-8d7d-69d80a51f76b', -- Ralph Naim
    -- Duplicates of a single UG Successful Sale (webhook double-fire)
    'd5248b04-8a57-428e-830f-c051786c63aa', -- Jacek dup
    '12507b60-2011-45c3-ab3e-963b4719970b', -- Andrew Alders dup
    '0ae31552-80ad-4f8e-9829-7ff937d80a97', -- njuyx dup
    -- Test-card (4242XXXXXX4242) pre-production dev tests
    '533f8590-668e-4f15-b45c-c109dc517a9c',
    'd01a2238-938a-4298-8e80-07fa80361e73',
    -- Fake dev ugp_transaction_id (never went through UG)
    'ce3693d2-9bd6-4f82-a954-9e7a71e056fc', -- REALTEST_*
    '209a04c8-3e10-44d2-adae-e4df1b2886c0', -- FINAL_FIX_*
    '675b1eff-91cf-4cc9-9431-34ff45d66e8a', -- PROXY_REAL_*
    '7b6c93f6-437f-40ba-92b9-c31b92e5ca7f', -- FINAL_TEST_*
    'b5fda593-13cd-45a0-89da-37ad57cedc21', -- PROOF_*
    '14b174fd-b082-4be3-844c-58158d0775ce', -- AUTHTEST2
    'ed45a47a-7e0b-4151-a5ca-64c911694a24', -- UGP_*
    '9ecd61f2-2167-47c7-886c-118be1a737e3'  -- TEST_123
  );

-- 1b. Tips with no matching UG Sale
UPDATE tips
SET status = 'failed'
WHERE status = 'succeeded'
  AND id IN (
    '16fbb088-670b-42f5-9d57-0e0d9aa5f898' -- tbdevpro test with 4242 card
  );

-- 1c. Custom requests with no matching UG Sale (Verify-only, capture never happened)
UPDATE custom_requests
SET status = 'cancelled'
WHERE status IN ('delivered','paid','in_progress','completed')
  AND id IN (
    -- atexclu / tbtbtb dev tests
    '878e80d2-ac6c-4aad-8872-574c84f3f0bb',
    'de5dd12d-943f-4a86-97ea-b12426756423',
    'c9e8e40c-54e0-4767-9347-72a01a602b6c',
    '44b548f0-56f6-4c40-a526-f96e261c657a',
    '836cfc30-e4d1-4148-9eb6-5f5ac0e7d077',
    -- Real creators but UG capture declined
    '7f1b8966-0620-4138-a9f1-5ab83a6464d3', -- Sen08
    'fc86d9f0-36c1-48f3-9183-1c0b08caef40', -- star
    '1067668a-5b10-4182-af29-c147ca787cac'  -- star
  );

-- ── Step 2: Recompute ledger per creator from legit DB state ─────────

CREATE TEMP TABLE _recon_snapshot ON COMMIT DROP AS
SELECT
  id AS creator_id,
  wallet_balance_cents AS old_wallet,
  total_earned_cents AS old_earned,
  total_withdrawn_cents AS old_withdrawn
FROM profiles
WHERE total_earned_cents <> 0
   OR wallet_balance_cents <> 0
   OR total_withdrawn_cents <> 0;

CREATE TEMP TABLE _recon_targets ON COMMIT DROP AS
SELECT
  s.creator_id,
  (
    COALESCE((
      SELECT SUM(pu.creator_net_cents)::bigint
      FROM purchases pu
      JOIN links l ON l.id = pu.link_id
      WHERE l.creator_id = s.creator_id AND pu.status = 'succeeded'
    ), 0)
    + COALESCE((
      SELECT SUM(t.creator_net_cents)::bigint
      FROM tips t
      WHERE t.creator_id = s.creator_id AND t.status = 'succeeded'
    ), 0)
    + COALESCE((
      SELECT SUM(g.creator_net_cents)::bigint
      FROM gift_purchases g
      WHERE g.creator_id = s.creator_id AND g.status = 'succeeded'
    ), 0)
    + COALESCE((
      SELECT SUM(cr.creator_net_cents)::bigint
      FROM custom_requests cr
      WHERE cr.creator_id = s.creator_id
        AND cr.status IN ('paid','in_progress','delivered','completed')
    ), 0)
  )::bigint AS new_earned,
  COALESCE((
    SELECT SUM(po.amount_cents)::bigint
    FROM payouts po
    WHERE po.creator_id = s.creator_id
      AND po.status IN ('pending','processing','approved','completed','paid','sent')
  ), 0)::bigint AS new_withdrawn
FROM _recon_snapshot s;

UPDATE profiles p
SET total_earned_cents    = t.new_earned,
    total_withdrawn_cents = t.new_withdrawn,
    wallet_balance_cents  = GREATEST(0::bigint, t.new_earned - t.new_withdrawn)
FROM _recon_targets t
WHERE p.id = t.creator_id;

-- ── Step 3: Audit log (one row per impacted creator) ─────────────────

INSERT INTO wallet_adjustments (creator_id, amount_cents, reason, source_table, source_id, source_state)
SELECT
  s.creator_id,
  (GREATEST(0::bigint, t.new_earned - t.new_withdrawn) - s.old_wallet)::integer,
  'ug-payment-reconciliation-2026-04-21',
  'reconciliation',
  s.creator_id,
  format(
    'wallet %s->%s, earned %s->%s, withdrawn %s->%s',
    s.old_wallet,
    GREATEST(0::bigint, t.new_earned - t.new_withdrawn),
    s.old_earned, t.new_earned,
    s.old_withdrawn, t.new_withdrawn
  )
FROM _recon_snapshot s
JOIN _recon_targets t ON t.creator_id = s.creator_id
WHERE s.old_earned <> t.new_earned
   OR s.old_withdrawn <> t.new_withdrawn
   OR s.old_wallet <> GREATEST(0::bigint, t.new_earned - t.new_withdrawn)
ON CONFLICT (source_table, source_id, reason) DO NOTHING;

-- ── Step 4: Rebuild profile_analytics from legit purchases ────────────
-- The track_sale trigger writes on INSERT/UPDATE to 'succeeded' but never
-- reverses when status moves back to 'failed'. Rebuild sales_count and
-- revenue_cents from scratch; preserve profile_views and link_clicks.

INSERT INTO profile_analytics (profile_id, date, sales_count, revenue_cents)
SELECT l.creator_id, pu.created_at::date, COUNT(*)::int, COALESCE(SUM(pu.amount_cents),0)::bigint
FROM purchases pu JOIN links l ON l.id = pu.link_id
WHERE pu.status = 'succeeded'
GROUP BY l.creator_id, pu.created_at::date
ON CONFLICT (profile_id, date) DO UPDATE
SET sales_count = EXCLUDED.sales_count,
    revenue_cents = EXCLUDED.revenue_cents,
    updated_at = now()
WHERE profile_analytics.sales_count <> EXCLUDED.sales_count
   OR profile_analytics.revenue_cents <> EXCLUDED.revenue_cents;

-- Zero out stale (creator, date) rows that used to have sales but no longer do
UPDATE profile_analytics pa
SET sales_count = 0, revenue_cents = 0, updated_at = now()
WHERE (pa.sales_count > 0 OR pa.revenue_cents > 0)
  AND NOT EXISTS (
    SELECT 1 FROM purchases pu JOIN links l ON l.id = pu.link_id
    WHERE pu.status = 'succeeded' AND l.creator_id = pa.profile_id AND pu.created_at::date = pa.date
  );

COMMIT;
