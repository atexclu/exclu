-- Migration 079: Attribution des achats au chat (Revenue Tracking)
-- ============================================================================
--
-- OBJECTIF :
--   Préparer l'architecture pour le futur split de paiement chatter,
--   SANS l'implémenter maintenant (système de paiement en refonte).
--
-- CE QUE CETTE MIGRATION FAIT :
--   1. Ajoute chat_conversation_id + chat_chatter_id sur la table `purchases`
--      (achats de liens via Stripe Checkout).
--   2. Crée la RPC increment_conversation_revenue appelée par stripe-webhook
--      pour mettre à jour conversations.total_revenue_cents après un achat.
--
-- FUTUR :
--   Quand le nouveau système de paiement sera prêt, ces colonnes seront déjà là.
--   Il suffira de lire chat_chatter_id pour calculer et distribuer le split.
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════
-- 1. Colonnes d'attribution sur la table purchases
-- ══════════════════════════════════════════════════════════════════════

-- Référence à la conversation dans laquelle l'achat a été initié
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS chat_conversation_id UUID
    REFERENCES conversations(id) ON DELETE SET NULL;

-- Chatter qui a envoyé le lien d'achat (pour futur split de paiement)
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS chat_chatter_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index pour les requêtes de stats par chatter et par conversation
CREATE INDEX IF NOT EXISTS idx_purchases_chat_conversation
  ON purchases(chat_conversation_id)
  WHERE chat_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_chat_chatter
  ON purchases(chat_chatter_id)
  WHERE chat_chatter_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- 2. RPC increment_conversation_revenue
--    Appelée par stripe-webhook après un achat initié via le chat.
--    Met à jour le total des ventes d'une conversation.
--    SECURITY DEFINER : peut être appelé par le service role du webhook.
-- ══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.increment_conversation_revenue(
  p_conversation_id UUID,
  p_amount_cents    INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Incrémenter le revenu total généré par cette conversation.
  -- total_revenue_cents est défini dans migration 073 sur la table conversations.
  UPDATE conversations
  SET total_revenue_cents = total_revenue_cents + p_amount_cents
  WHERE id = p_conversation_id;
END;
$$;
