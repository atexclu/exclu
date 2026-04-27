-- Migration 177: enrich claim_guest_custom_requests
--
-- When a guest signs up after submitting a paid custom request, we now do
-- three things atomically per claimed row:
--   1. Reattach the request to the new auth user (fan_id = caller_id).
--   2. Auto-favorite the creator (fan_favorites upsert) — the user paid
--      them, so they belong in the dashboard's favorites by default.
--   3. Ensure a conversation exists between the new fan and the creator's
--      profile, so the chat tab on /fan is immediately populated.
--
-- The RPC is still SECURITY DEFINER and still gated on the caller's email
-- matching the requested email — it cannot be used to claim other people's
-- guest data.

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
  r RECORD;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO caller_email FROM auth.users WHERE id = caller_id;
  IF caller_email IS NULL OR lower(caller_email) <> lower(p_email) THEN
    RAISE EXCEPTION 'Email mismatch';
  END IF;

  FOR r IN
    SELECT id, creator_id, profile_id
    FROM custom_requests
    WHERE fan_id IS NULL
      AND lower(fan_email) = lower(p_email)
  LOOP
    UPDATE custom_requests SET fan_id = caller_id WHERE id = r.id;

    -- Auto-favorite the creator. fan_favorites has a (fan_id, creator_id)
    -- unique constraint already, so ON CONFLICT DO NOTHING is safe.
    INSERT INTO fan_favorites (fan_id, creator_id)
    VALUES (caller_id, r.creator_id)
    ON CONFLICT (fan_id, creator_id) DO NOTHING;

    -- Ensure a conversation row exists for this (fan, profile) pair. The
    -- unique index `idx_conversations_fan_profile` is partial so we use a
    -- conditional insert rather than ON CONFLICT.
    IF r.profile_id IS NOT NULL THEN
      INSERT INTO conversations (fan_id, profile_id, status, last_message_at, last_message_preview)
      SELECT caller_id, r.profile_id, 'active', NOW(), 'Custom request'
      WHERE NOT EXISTS (
        SELECT 1 FROM conversations
        WHERE fan_id = caller_id AND profile_id = r.profile_id
      );
    END IF;

    claimed_count := claimed_count + 1;
  END LOOP;

  RETURN claimed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_guest_custom_requests(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_guest_custom_requests(TEXT) TO authenticated;

COMMENT ON FUNCTION public.claim_guest_custom_requests IS
  'Reattach unclaimed custom_requests for the caller email, auto-favorite the creator, and ensure a conversation exists. Idempotent.';
