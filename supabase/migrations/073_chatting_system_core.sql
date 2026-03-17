-- Migration 073: Chatting System — Core Tables
-- Requires: pgcrypto extension (already enabled on Supabase by default)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Creates conversations, messages, fan_tags, chatter_invitations tables
-- with REPLICA IDENTITY FULL for Supabase Realtime filtering support.

-- ══════════════════════════════════════════════════════════════════════
-- 1. CHATTER INVITATIONS
--    Invitation envoyée par un créateur à un chatter pour accéder à son profil.
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS chatter_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  invited_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  token         TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  chatter_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  permissions   JSONB NOT NULL DEFAULT '{
    "can_send_paid_content": true,
    "can_send_tip_links": true,
    "can_mass_message": false,
    "can_tag_fans": true
  }'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_chatter_invitations_profile ON chatter_invitations(profile_id);
CREATE INDEX IF NOT EXISTS idx_chatter_invitations_token  ON chatter_invitations(token);
CREATE INDEX IF NOT EXISTS idx_chatter_invitations_email  ON chatter_invitations(email);
CREATE INDEX IF NOT EXISTS idx_chatter_invitations_chatter ON chatter_invitations(chatter_id);
CREATE INDEX IF NOT EXISTS idx_chatter_invitations_status ON chatter_invitations(status);

-- ══════════════════════════════════════════════════════════════════════
-- 2. CONVERSATIONS
--    Une conversation entre un fan et un profil créateur.
--    Contrainte UNIQUE (fan_id, profile_id) = une seule conv par fan/profil.
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conversations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id           UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  assigned_chatter_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'unclaimed'
                         CHECK (status IN ('unclaimed', 'active', 'archived', 'transferred')),
  is_pinned            BOOLEAN NOT NULL DEFAULT false,
  is_read              BOOLEAN NOT NULL DEFAULT false,
  last_message_at      TIMESTAMPTZ,
  last_message_preview TEXT,
  total_revenue_cents  INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at          TIMESTAMPTZ,
  UNIQUE (fan_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_profile     ON conversations(profile_id);
CREATE INDEX IF NOT EXISTS idx_conversations_chatter     ON conversations(assigned_chatter_id);
CREATE INDEX IF NOT EXISTS idx_conversations_fan         ON conversations(fan_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status      ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg    ON conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_profile_status ON conversations(profile_id, status);

-- Activer REPLICA IDENTITY FULL pour que Supabase Realtime puisse filtrer sur
-- des colonnes autres que la PK (ex: profile_id, assigned_chatter_id).
ALTER TABLE conversations REPLICA IDENTITY FULL;

-- ══════════════════════════════════════════════════════════════════════
-- 3. MESSAGES
--    Messages échangés dans une conversation.
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type      TEXT NOT NULL CHECK (sender_type IN ('fan', 'creator', 'chatter', 'system')),
  sender_id        UUID NOT NULL REFERENCES auth.users(id),
  content          TEXT CHECK (char_length(content) <= 4000),
  content_type     TEXT NOT NULL DEFAULT 'text'
                     CHECK (content_type IN ('text', 'paid_content', 'tip_link', 'wishlist_link', 'image', 'system')),
  -- Références optionnelles pour les messages enrichis
  paid_content_id   UUID REFERENCES links(id) ON DELETE SET NULL,
  paid_amount_cents INTEGER,
  tip_link_id       UUID REFERENCES links(id) ON DELETE SET NULL,
  wishlist_item_id  UUID REFERENCES wishlist_items(id) ON DELETE SET NULL,
  -- Lecture
  is_read           BOOLEAN NOT NULL DEFAULT false,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created      ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender       ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at ASC);

-- REPLICA IDENTITY FULL pour le Realtime sur messages
ALTER TABLE messages REPLICA IDENTITY FULL;

-- ══════════════════════════════════════════════════════════════════════
-- 4. FAN TAGS
--    Classification des fans par les chatters/créateurs.
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fan_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL CHECK (char_length(tag) <= 50),
  color       TEXT NOT NULL DEFAULT 'gray',
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fan_id, profile_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_fan_tags_fan_profile ON fan_tags(fan_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_fan_tags_profile     ON fan_tags(profile_id);
