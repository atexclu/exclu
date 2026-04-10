-- Add multi-country bank fields to payouts table (snapshot at withdrawal time)
ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS bank_account_type text DEFAULT 'iban',
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_routing_number text,
  ADD COLUMN IF NOT EXISTS bank_bsb text,
  ADD COLUMN IF NOT EXISTS bank_bic text,
  ADD COLUMN IF NOT EXISTS bank_country text;
