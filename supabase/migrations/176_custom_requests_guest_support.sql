-- Migration 176: Custom requests — guest support (no auto-account)
--
-- Until now, every fan that submitted a custom request had an auth.users row
-- created on the fly (with a random password if they didn't supply one).
-- Going forward we let pure guests pay with just an email; the row exists
-- with `fan_id IS NULL` and we deliver the content via email + signed access
-- URL. If the same email signs up later, a reconciliation step (handled in
-- the FanSignup flow) attaches the historical requests to the new account.
--
-- Payment model also pivots: QuickPay produces a Sale (not Authorize), so
-- "creator declines" → API refund of the Sale; no more Void/Capture path.
-- See manage-request for the implementation.

-- 1. Make fan_id nullable. Drop the existing FK and recreate it with
--    ON DELETE SET NULL — a guest who later deletes their account (after
--    signing up + claiming) should still leave the historical request
--    intact for the creator's records.
ALTER TABLE custom_requests
  ALTER COLUMN fan_id DROP NOT NULL;

ALTER TABLE custom_requests
  DROP CONSTRAINT IF EXISTS custom_requests_fan_id_fkey;

ALTER TABLE custom_requests
  ADD CONSTRAINT custom_requests_fan_id_fkey
  FOREIGN KEY (fan_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Guarantee we always have a way to reach the fan: at least fan_email
--    must be set when fan_id is NULL.
ALTER TABLE custom_requests
  DROP CONSTRAINT IF EXISTS custom_requests_fan_identity_present;

ALTER TABLE custom_requests
  ADD CONSTRAINT custom_requests_fan_identity_present
  CHECK (fan_id IS NOT NULL OR fan_email IS NOT NULL);

-- 3. Index used by the post-signup reconciliation step to find unclaimed
--    requests by email cheaply.
CREATE INDEX IF NOT EXISTS idx_custom_requests_fan_email_unclaimed
  ON custom_requests(fan_email)
  WHERE fan_id IS NULL;

-- 4. Composite index used by the expiry sweep cron (reconcile-payments)
--    to find requests that need refunding.
CREATE INDEX IF NOT EXISTS idx_custom_requests_pending_expires
  ON custom_requests(expires_at)
  WHERE status = 'pending';

-- 5. RPC used at fan signup to attach historical guest requests to the new
--    account. SECURITY DEFINER because the row's fan_id is NULL — no RLS
--    policy lets the new fan UPDATE-it themselves. We restrict the match
--    to the email of the calling user.
CREATE OR REPLACE FUNCTION public.claim_guest_custom_requests(p_email TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  caller_email TEXT;
  claimed_count INTEGER := 0;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- The email passed in must match the caller's email — prevents one user
  -- from claiming another user's guest requests.
  SELECT email INTO caller_email FROM auth.users WHERE id = caller_id;
  IF caller_email IS NULL OR lower(caller_email) <> lower(p_email) THEN
    RAISE EXCEPTION 'Email mismatch';
  END IF;

  UPDATE custom_requests
  SET fan_id = caller_id
  WHERE fan_id IS NULL
    AND lower(fan_email) = lower(p_email);

  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  RETURN claimed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_guest_custom_requests(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_guest_custom_requests(TEXT) TO authenticated;

COMMENT ON FUNCTION public.claim_guest_custom_requests IS
  'Attach unclaimed (fan_id IS NULL) custom_requests with matching fan_email to the calling auth user. Called from FanSignup after a successful signup.';
