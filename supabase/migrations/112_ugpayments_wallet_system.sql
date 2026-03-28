-- ============================================================
-- Migration 112: UG Payments wallet system + payment infrastructure
-- Replaces Stripe Connect (direct payouts) with internal wallet + manual withdrawals
-- ============================================================

-- ============================================================
-- PART A: Wallet columns on profiles
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_balance_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_earned_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_withdrawn_cents BIGINT NOT NULL DEFAULT 0;

-- Bank details for withdrawals (replaces Stripe Connect onboarding)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_iban TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_bic TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_holder_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_country TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_setup_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- UGPayments subscription tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_ugp_member_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_ugp_username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- ============================================================
-- PART B: UGP transaction columns on payment tables
-- ============================================================

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS ugp_transaction_id TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS ugp_merchant_reference TEXT;

ALTER TABLE tips ADD COLUMN IF NOT EXISTS ugp_transaction_id TEXT;
ALTER TABLE tips ADD COLUMN IF NOT EXISTS ugp_merchant_reference TEXT;

ALTER TABLE gift_purchases ADD COLUMN IF NOT EXISTS ugp_transaction_id TEXT;
ALTER TABLE gift_purchases ADD COLUMN IF NOT EXISTS ugp_merchant_reference TEXT;

ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS ugp_transaction_id TEXT;
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS ugp_merchant_reference TEXT;

-- ============================================================
-- PART C: Extend existing payouts table for manual withdrawals
-- ============================================================

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS bank_iban TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS bank_holder_name TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Extend status CHECK to include 'approved' and 'rejected'
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check
  CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'rejected'));

-- ============================================================
-- PART D: Payment events audit table
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL,
  merchant_reference TEXT NOT NULL,
  amount_decimal TEXT NOT NULL,
  transaction_state TEXT,
  customer_email TEXT,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processing_result TEXT,
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_txn_id ON payment_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_ref ON payment_events(merchant_reference);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_txn_unique ON payment_events(transaction_id);

-- RLS: only service_role can access payment_events
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PART E: Addon charges table (multi-profile billing)
-- ============================================================

CREATE TABLE IF NOT EXISTS addon_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  amount_cents INTEGER NOT NULL,
  profile_count INTEGER NOT NULL,
  extra_profiles INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'charged', 'failed', 'waived')),
  charged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addon_charges_creator ON addon_charges(creator_id);
ALTER TABLE addon_charges ENABLE ROW LEVEL SECURITY;

-- Creator can view their own addon charges
CREATE POLICY "Creator can view own addon charges"
  ON addon_charges FOR SELECT
  USING (creator_id = auth.uid());

-- ============================================================
-- PART F: Indexes for wallet operations
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_wallet_positive
  ON profiles(wallet_balance_cents) WHERE wallet_balance_cents > 0;

CREATE INDEX IF NOT EXISTS idx_profiles_payout_setup
  ON profiles(payout_setup_complete) WHERE payout_setup_complete = TRUE;

CREATE INDEX IF NOT EXISTS idx_purchases_ugp_txn
  ON purchases(ugp_transaction_id) WHERE ugp_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tips_ugp_txn
  ON tips(ugp_transaction_id) WHERE ugp_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gift_purchases_ugp_txn
  ON gift_purchases(ugp_transaction_id) WHERE ugp_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custom_requests_ugp_txn
  ON custom_requests(ugp_transaction_id) WHERE ugp_transaction_id IS NOT NULL;

-- ============================================================
-- PART G: Atomic wallet RPCs (SECURITY DEFINER, FOR UPDATE)
-- ============================================================

CREATE OR REPLACE FUNCTION credit_creator_wallet(
  p_creator_id UUID,
  p_amount_cents BIGINT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance BIGINT;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'credit_creator_wallet: amount must be positive, got %', p_amount_cents;
  END IF;

  UPDATE profiles
  SET wallet_balance_cents = wallet_balance_cents + p_amount_cents,
      total_earned_cents = total_earned_cents + p_amount_cents
  WHERE id = p_creator_id
  RETURNING wallet_balance_cents INTO new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_creator_wallet: creator not found %', p_creator_id;
  END IF;

  RETURN new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION debit_creator_wallet(
  p_creator_id UUID,
  p_amount_cents BIGINT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance BIGINT;
  new_balance BIGINT;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'debit_creator_wallet: amount must be positive, got %', p_amount_cents;
  END IF;

  -- Lock the row to prevent concurrent updates
  SELECT wallet_balance_cents INTO current_balance
  FROM profiles WHERE id = p_creator_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'debit_creator_wallet: creator not found %', p_creator_id;
  END IF;

  IF current_balance < p_amount_cents THEN
    RAISE EXCEPTION 'debit_creator_wallet: insufficient balance % < %', current_balance, p_amount_cents;
  END IF;

  UPDATE profiles
  SET wallet_balance_cents = wallet_balance_cents - p_amount_cents,
      total_withdrawn_cents = total_withdrawn_cents + p_amount_cents
  WHERE id = p_creator_id
  RETURNING wallet_balance_cents INTO new_balance;

  RETURN new_balance;
END;
$$;
