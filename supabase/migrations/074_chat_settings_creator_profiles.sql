-- Migration 074: Chat Settings on creator_profiles
-- Adds chat configuration columns to creator_profiles table.

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS chat_mode TEXT NOT NULL DEFAULT 'solo'
    CHECK (chat_mode IN ('solo', 'team')),
  ADD COLUMN IF NOT EXISTS chatter_persona TEXT
    CHECK (char_length(chatter_persona) <= 2000),
  ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Commission chatter en basis points (2500 = 25%)
  -- Répartition : créateur 45%, chatter 25%, Exclu 15%, Stripe ~5%
  ADD COLUMN IF NOT EXISTS chatter_commission_bps INTEGER NOT NULL DEFAULT 2500
    CHECK (chatter_commission_bps >= 0 AND chatter_commission_bps <= 5000);
