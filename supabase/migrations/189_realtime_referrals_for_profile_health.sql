-- supabase/migrations/189_realtime_referrals_for_profile_health.sql
--
-- Adds the `referrals` table to the supabase_realtime publication so the
-- Profile Health card lights up the "Refer a friend" step the moment the
-- `link-referral` edge function INSERTs a row (when someone signs up via
-- the creator's referral code).
--
-- Replica identity FULL is required because the channel subscription
-- filters on `referrer_id` (not the primary key) — without FULL, the old
-- row image won't carry referrer_id and the filter can't match on
-- UPDATE/DELETE. INSERT-only filtering still benefits because it gives
-- Postgres the columns needed to evaluate the filter.

ALTER PUBLICATION supabase_realtime ADD TABLE public.referrals;
ALTER TABLE public.referrals REPLICA IDENTITY FULL;
