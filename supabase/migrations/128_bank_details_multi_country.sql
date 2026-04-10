-- Add columns for non-IBAN bank details (US, AU, and other countries)
-- Existing columns: bank_iban, bank_bic, bank_holder_name, bank_country, payout_setup_complete

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_routing_number text,
  ADD COLUMN IF NOT EXISTS bank_bsb text,
  ADD COLUMN IF NOT EXISTS bank_account_type text DEFAULT 'iban';

-- bank_account_type values:
--   'iban'    → EU/EEA countries: uses bank_iban + bank_bic
--   'us'      → US: uses bank_account_number + bank_routing_number
--   'au'      → Australia: uses bank_account_number + bank_bsb + bank_bic
--   'other'   → Other: uses bank_account_number + bank_bic

COMMENT ON COLUMN profiles.bank_account_type IS 'Bank account type: iban, us, au, other';
COMMENT ON COLUMN profiles.bank_account_number IS 'Account number for US/AU/other bank accounts';
COMMENT ON COLUMN profiles.bank_routing_number IS 'ABA routing number for US bank accounts';
COMMENT ON COLUMN profiles.bank_bsb IS 'BSB code for Australian bank accounts';
