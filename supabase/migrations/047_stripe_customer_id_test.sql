-- Migration 047: Add stripe_customer_id_test column to profiles
-- Stores the Stripe test-mode customer ID separately from the live one.
-- Used by create-creator-subscription to generate a real Customer Portal
-- link in local/test mode without overwriting the live customer ID.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id_test text;
