-- Migration 046: Allow a referred creator to read their own referral row
-- Needed for the dashboard to fetch the $100 bonus status (bonus_paid_to_referred)
-- for a creator who was recruited via a referral link.
-- The existing policy only covers referrer_id = auth.uid() (the recruiter).

CREATE POLICY "Referred can view own referral row"
ON referrals
FOR SELECT
TO authenticated
USING (referred_id = auth.uid());
