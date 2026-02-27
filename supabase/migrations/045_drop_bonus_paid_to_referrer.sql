-- Migration 045: Remove erroneous bonus_paid_to_referrer column
-- The $100 bonus goes to the REFERRED creator (not the referrer).
-- The correct column is bonus_paid_to_referred (already existed before migration 044).
-- Migration 044 added bonus_paid_to_referrer by mistake — drop it.

ALTER TABLE referrals
  DROP COLUMN IF EXISTS bonus_paid_to_referrer;
