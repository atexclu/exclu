-- Migration 126: Guest Chat System
-- ============================================================================
-- Enables anonymous (guest) visitors on creator public pages to chat
-- without creating an account. Guest sessions are tracked via a dedicated
-- table and a session_token stored in the visitor's localStorage.
--
-- KEY DESIGN DECISIONS:
--   - conversations.fan_id becomes NULLABLE (guests have no auth user)
--   - messages.sender_id becomes NULLABLE (guests have no auth user)
--   - All guest operations go through edge functions (service_role)
--   - Existing RLS policies on conversations/messages remain intact
--     because they reference auth.uid() which is non-null for real users
--   - A CHECK constraint ensures either fan_id OR guest_session_id is set
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════
-- 0. ENSURE PGCRYPTO EXTENSION (required for gen_random_bytes)
-- ══════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ══════════════════════════════════════════════════════════════════════
-- 1. GUEST SESSIONS TABLE
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS guest_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token   TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  display_name    TEXT DEFAULT 'Guest',
  email           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_token ON guest_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_last_active ON guest_sessions(last_active_at DESC);

-- RLS enabled here; policies added at the end (after guest_session_id column exists on conversations)
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════
-- 2. ALTER CONVERSATIONS — support guest participants
-- ══════════════════════════════════════════════════════════════════════

-- 2a. Make fan_id nullable
ALTER TABLE conversations ALTER COLUMN fan_id DROP NOT NULL;

-- 2b. Add guest_session_id column
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE SET NULL;

-- 2c. Drop the old UNIQUE constraint (fan_id, profile_id)
--     and replace with partial unique indexes
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_fan_id_profile_id_key;

-- Unique: one conversation per authenticated fan per profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_fan_profile
  ON conversations(fan_id, profile_id) WHERE fan_id IS NOT NULL;

-- Unique: one conversation per guest session per profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_guest_profile
  ON conversations(guest_session_id, profile_id) WHERE guest_session_id IS NOT NULL;

-- 2d. CHECK: either fan_id or guest_session_id must be present
ALTER TABLE conversations
  ADD CONSTRAINT conversations_has_participant
  CHECK (fan_id IS NOT NULL OR guest_session_id IS NOT NULL);

-- 2e. Index for guest conversations
CREATE INDEX IF NOT EXISTS idx_conversations_guest
  ON conversations(guest_session_id) WHERE guest_session_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 3. ALTER MESSAGES — support guest senders
-- ══════════════════════════════════════════════════════════════════════

-- 3a. Make sender_id nullable
ALTER TABLE messages ALTER COLUMN sender_id DROP NOT NULL;

-- 3b. Drop the FK constraint on sender_id (it references auth.users,
--     which prevents null or non-user values)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;

-- 3c. Add guest_session_id to identify guest message senders
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS guest_session_id UUID REFERENCES guest_sessions(id) ON DELETE SET NULL;

-- 3d. CHECK: either sender_id or guest_session_id must be present
ALTER TABLE messages
  ADD CONSTRAINT messages_has_sender
  CHECK (sender_id IS NOT NULL OR guest_session_id IS NOT NULL);

-- 3e. Index for guest messages
CREATE INDEX IF NOT EXISTS idx_messages_guest
  ON messages(guest_session_id) WHERE guest_session_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 4. Add custom_request content_type support for messages if missing
--    (already added in previous migration, this is a safety net)
-- ══════════════════════════════════════════════════════════════════════
-- Update the content_type CHECK constraint to include 'custom_request'
-- if it wasn't already added
DO $$
BEGIN
  -- Try to drop and recreate the check constraint with all content types
  ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_type_check;
  ALTER TABLE messages ADD CONSTRAINT messages_content_type_check
    CHECK (content_type IN ('text', 'paid_content', 'tip_link', 'wishlist_link', 'image', 'system', 'custom_request'));
EXCEPTION WHEN OTHERS THEN
  -- Constraint might not exist or have a different name, ignore
  NULL;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 5. RLS POLICIES FOR GUEST_SESSIONS
--    (must come after conversations.guest_session_id is added)
-- ══════════════════════════════════════════════════════════════════════

-- Creators can read guest sessions linked to conversations on their profiles
CREATE POLICY "creator_read_guest_sessions"
  ON guest_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN creator_profiles cp ON cp.id = c.profile_id
      WHERE c.guest_session_id = guest_sessions.id
        AND cp.user_id = auth.uid()
    )
  );

-- Chatters can read guest sessions linked to conversations they have access to
CREATE POLICY "chatter_read_guest_sessions"
  ON guest_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      JOIN chatter_invitations ci ON ci.profile_id = c.profile_id
      WHERE c.guest_session_id = guest_sessions.id
        AND ci.chatter_id = auth.uid()
        AND ci.status = 'accepted'
    )
  );
