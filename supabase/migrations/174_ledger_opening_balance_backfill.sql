-- 174_ledger_opening_balance_backfill.sql
-- Opening-balance backfill: for every creator whose profiles.wallet_balance_cents
-- disagrees with the sum of their wallet_transactions rows, write a single
-- synthetic ledger row representing the pre-refonte earnings that were
-- reconciled directly into the profile by migration 160 (21 April 2026)
-- without going through the ledger (which only existed after migration 170).
--
-- Without this backfill, reconcile-payments would fire drift alerts every hour
-- for these legacy creators, and the first real withdrawal after today would
-- push their ledger into nonsensical negative territory while the profile
-- balance decremented normally.
--
-- Idempotency: apply_wallet_transaction dedupes on
-- (owner_id, source_type, direction, source_transaction_id) so re-running is a
-- no-op. The marker source_transaction_id `legacy-opening-balance-2026-04-24`
-- uniquely tags these rows so they're auditable forever.

DO $$
DECLARE
  r record;
  v_diff bigint;
  v_direction wallet_tx_direction;
BEGIN
  FOR r IN SELECT * FROM find_wallet_drift() LOOP
    v_diff := r.projection_cents - r.ledger_cents;
    IF v_diff = 0 THEN
      CONTINUE;
    END IF;
    v_direction := CASE WHEN v_diff > 0 THEN 'credit'::wallet_tx_direction ELSE 'debit'::wallet_tx_direction END;

    PERFORM apply_wallet_transaction(
      p_owner_id := r.user_id,
      p_owner_kind := 'creator'::wallet_owner_kind,
      p_direction := v_direction,
      p_amount_cents := abs(v_diff),
      p_source_type := 'manual_adjustment'::wallet_tx_source,
      p_source_id := r.user_id,
      p_source_transaction_id := 'legacy-opening-balance-2026-04-24',
      p_source_ugp_mid := NULL,
      p_parent_id := NULL,
      p_metadata := jsonb_build_object(
        'reason', 'backfill-pre-refonte-earnings',
        'migration_source', '160_reconcile_wallets_ug_truth',
        'projection_cents_at_backfill', r.projection_cents,
        'ledger_cents_at_backfill', r.ledger_cents
      ),
      p_admin_notes := 'Opening balance backfill: pre-refonte earnings reconciled from purchases/tips/gift_purchases/custom_requests tables into profiles.wallet_balance_cents by migration 160, before the ledger was introduced (migration 170). This synthetic row makes the ledger and the profile projection match so future debits/credits stay consistent.'
    );

    -- Note: apply_wallet_transaction will ALSO update
    -- profiles.wallet_balance_cents by +v_diff (or -v_diff) on its own. For a
    -- pure "opening balance" we want the projection to STAY the same, so we
    -- undo that side-effect with a direct UPDATE that subtracts what the RPC
    -- just added. The goal is: ledger_sum == projection, without changing the
    -- projection. This exception to ledger discipline is intentional and only
    -- happens in this migration (marked with a specific admin_notes).
    UPDATE profiles
    SET wallet_balance_cents = coalesce(wallet_balance_cents, 0) - (CASE WHEN v_direction = 'credit' THEN abs(v_diff) ELSE -abs(v_diff) END),
        total_earned_cents = coalesce(total_earned_cents, 0) - (CASE WHEN v_direction = 'credit' THEN abs(v_diff) ELSE 0 END)
    WHERE id = r.user_id;
  END LOOP;
END $$;

-- Sanity: after this migration, find_wallet_drift() should return zero rows.
-- We don't assert here because the migration is one-shot and idempotent via
-- source_transaction_id; a future re-run will no-op.
