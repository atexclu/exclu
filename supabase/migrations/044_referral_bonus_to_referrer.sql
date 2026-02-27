-- Migration 044: Add bonus_paid_to_referrer column to referrals table
-- The $100 bonus goes to the REFERRER when the referred creator reaches $1k in 90 days.
-- Previously, the code used bonus_paid_to_referred (wrong direction). This adds the correct column.

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS bonus_paid_to_referrer boolean NOT NULL DEFAULT false;
