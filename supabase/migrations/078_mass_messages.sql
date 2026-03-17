-- Migration 078: Table mass_messages
-- ============================================================================
--
-- Permet aux créateurs et chatters autorisés d'envoyer un message broadcast
-- à un groupe de fans filtrés (tous, par tag, ou actifs récemment).
--
-- Accès : créateur du profil OU chatter avec permission can_mass_message.
-- Sécurité : RLS + vérification de permission dans l'Edge Function.
-- ============================================================================

CREATE TABLE IF NOT EXISTS mass_messages (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Profil source du broadcast
  profile_id      UUID    NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,

  -- Qui a envoyé le message (créateur ou chatter)
  sent_by         UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Filtre appliqué au moment de l'envoi.
  -- {} = tous les fans avec une conversation
  -- {"tag": "VIP"} = fans tagués VIP
  -- {"active_days": 7} = fans actifs dans les 7 derniers jours
  target_filter   JSONB   NOT NULL DEFAULT '{}',

  -- Contenu du message
  content         TEXT    NOT NULL CHECK (char_length(content) <= 4000),
  content_type    TEXT    NOT NULL DEFAULT 'text'
                    CHECK (content_type IN ('text', 'paid_content')),

  -- Si content_type = 'paid_content', référence au lien payant
  paid_content_id UUID    REFERENCES links(id) ON DELETE SET NULL,
  paid_amount_cents INTEGER,

  -- Stats post-envoi
  recipient_count INTEGER NOT NULL DEFAULT 0,

  -- Cycle de vie : pending → sending → sent (ou failed)
  status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════
-- RLS
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE mass_messages ENABLE ROW LEVEL SECURITY;

-- Créateur propriétaire du profil : accès complet
CREATE POLICY "creator_manage_mass_messages"
  ON mass_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM creator_profiles cp
      WHERE cp.id = mass_messages.profile_id
        AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM creator_profiles cp
      WHERE cp.id = mass_messages.profile_id
        AND cp.user_id = auth.uid()
    )
  );

-- Chatter autorisé avec permission can_mass_message : lecture uniquement
CREATE POLICY "chatter_read_mass_messages"
  ON mass_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.profile_id   = mass_messages.profile_id
        AND ci.chatter_id   = auth.uid()
        AND ci.status       = 'accepted'
        AND (ci.permissions->>'can_mass_message')::boolean = true
    )
  );

-- Chatter autorisé avec permission can_mass_message : insertion uniquement
CREATE POLICY "chatter_insert_mass_messages"
  ON mass_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.profile_id   = mass_messages.profile_id
        AND ci.chatter_id   = auth.uid()
        AND ci.status       = 'accepted'
        AND (ci.permissions->>'can_mass_message')::boolean = true
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- Index
-- ══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_mass_messages_profile_id
  ON mass_messages(profile_id);

CREATE INDEX IF NOT EXISTS idx_mass_messages_sent_by
  ON mass_messages(sent_by);

CREATE INDEX IF NOT EXISTS idx_mass_messages_status
  ON mass_messages(status) WHERE status IN ('pending', 'sending');
