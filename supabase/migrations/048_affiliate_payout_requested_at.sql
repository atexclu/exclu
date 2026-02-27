-- Add payout_requested_at to profiles to persist affiliate payout pending state
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS affiliate_payout_requested_at timestamptz DEFAULT NULL;
