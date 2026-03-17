-- Migration 082: Fix chatter_see_own_invitation RLS policy
--
-- Problem: The policy used `SELECT email FROM auth.users WHERE id = auth.uid()`
-- which fails with "permission denied for table users" because the authenticated
-- role cannot read auth.users. This cascades through conversation queries because
-- chatter_see_conversations sub-queries chatter_invitations, triggering this policy.
--
-- Fix: Use auth.jwt() ->> 'email' instead, which reads from the JWT token
-- directly without needing table access.

DROP POLICY IF EXISTS "chatter_see_own_invitation" ON chatter_invitations;
CREATE POLICY "chatter_see_own_invitation"
  ON chatter_invitations FOR SELECT
  USING (
    chatter_id = auth.uid()
    OR (
      status = 'pending'
      AND email = (auth.jwt() ->> 'email')
    )
  );
