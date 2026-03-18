-- Migration 090: Chatter Revenue Sharing System
-- ============================================================================
--
-- OBJECTIF :
--   Implémenter le système de partage de revenus chatter (60/25/15).
--   Quand un chatter envoie un lien payant et qu'un fan l'achète :
--     - Créateur : 60% du prix de base
--     - Chatter  : 25% du prix de base (accumulé dans sa cagnotte)
--     - Exclu    : 15% du prix de base + 5% frais de traitement
--
-- TABLES MODIFIÉES :
--   1. messages        → chatter_ref (code de tracking unique par message paid_content)
--   2. purchases       → chatter_earnings_cents, creator_net_cents, platform_fee_cents
--   3. profiles        → chatter_earnings_cents (cagnotte), chatter_payout_requested_at
--   4. links           → created_by_chatter_id (liens créés par un chatter)
--
-- NOUVELLES FONCTIONS :
--   - resolve_chatter_ref    → résout un chatter_ref vers le chatter_id
--   - increment_chatter_earnings → incrémente la cagnotte du chatter
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════
-- 1. Tracking code sur les messages (paid_content envoyé par un chatter)
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS chatter_ref VARCHAR(16) DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_chatter_ref
  ON messages(chatter_ref)
  WHERE chatter_ref IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 2. Détails financiers sur les achats
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS chatter_earnings_cents INTEGER DEFAULT 0;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS creator_net_cents INTEGER DEFAULT 0;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER DEFAULT 0;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Cagnotte chatter sur profiles
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS chatter_earnings_cents INTEGER DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS chatter_payout_requested_at TIMESTAMPTZ DEFAULT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 4. Liens créés par un chatter (non visibles sur le profil public)
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE links
  ADD COLUMN IF NOT EXISTS created_by_chatter_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_links_created_by_chatter
  ON links(created_by_chatter_id)
  WHERE created_by_chatter_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 5. RPC resolve_chatter_ref
--    Résout un chatter_ref vers le sender_id (chatter user ID).
--    Appelée par create-link-checkout-session pour identifier le chatter.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_chatter_ref(p_chatter_ref VARCHAR)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chatter_id UUID;
BEGIN
  SELECT sender_id INTO v_chatter_id
  FROM messages
  WHERE chatter_ref = p_chatter_ref
    AND sender_type = 'chatter'
    AND content_type = 'paid_content'
  LIMIT 1;

  RETURN v_chatter_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 6. RPC increment_chatter_earnings
--    Incrémente la cagnotte du chatter après un achat attribué.
--    Appelée par stripe-webhook.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_chatter_earnings(
  p_chatter_id UUID,
  p_amount_cents INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET chatter_earnings_cents = COALESCE(chatter_earnings_cents, 0) + p_amount_cents
  WHERE id = p_chatter_id;
END;
$$;
