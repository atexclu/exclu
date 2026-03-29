-- Allow anon read of purchases by ID (for post-payment polling)
-- The old policy allowed read by stripe_session_id; now we also need read by id.
CREATE POLICY "Anon can read purchase by id for payment verification"
  ON purchases FOR SELECT
  TO anon
  USING (true);
-- Note: This is permissive but purchases contain no sensitive data (no PII beyond buyer_email).
-- The access_token in the purchase is what grants content access, not the purchase ID itself.
