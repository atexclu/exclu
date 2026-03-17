# Plan de Développement — Chatting System (§13)
## Centre de Vente Humain — Exclu.at

> **Référence** : CAHIER_DES_CHARGES_V2_FINAL.md §13 | **Version** : 2.0 Post-Audit Complet | **Mars 2026**
> **⚠️ Stripe split chatter** : NON implémenté maintenant — système de paiement en refonte. Architecture préparée pour pluguer sans refactoring futur.

---

## 0. Audit Complet — État des Lieux

### 0.1 DB déjà écrite localement (migrations 073–076, NON poussées en prod)

| Migration | Contenu |
|-----------|---------|
| `073` | Tables `conversations`, `messages`, `fan_tags`, `chatter_invitations` + REPLICA IDENTITY FULL |
| `074` | Colonnes sur `creator_profiles` : `chat_mode`, `chatter_persona`, `chat_enabled`, `chatter_commission_bps` |
| `075` | Toutes les RLS policies |
| `076` | RPCs : `claim_conversation`, `accept_chatter_invitation`, `get_chatter_profiles`, `revoke_chatter_access`, `get_profile_chatters`, `auto_archive_inactive_conversations` |

### 0.2 Tables existantes en prod (à ne pas casser)

- `agency_members` — colonnes : `agency_user_id`, `chatter_user_id`, `role`, `permissions`, `accessible_profile_ids`, `is_active`
- `profiles` — `id` (= auth.users.id), `display_name`, `avatar_url`, `stripe_account_id`
- `creator_profiles` — `id`, `user_id`, `username`, `avatar_url`
- `links`, `assets`, `tips`, `gift_purchases`, `custom_requests`, `wishlist_items` — toutes filtrent par `profile_id`

### 0.3 Frontend existant — Fichiers Impactés

| Fichier | Route | Action requise |
|---------|-------|----------------|
| `App.tsx` | — | Ajouter routes `/chatter`, `/chatter/accept`, changer `/app/chat` |
| `AppShell.tsx` | — | Ajouter badge unread sur item "Chat" |
| `Profile.tsx` | `/app/settings` | Ajouter onglet "Chat" |
| `FanDashboard.tsx` | `/fan` | Ajouter onglet "Messages" |
| `CreatorPublic.tsx` | `/:handle` | Ajouter bouton Message + nav mobile |
| `FanSignup.tsx` | `/fan/signup` | Gérer param `action=chat` |
| `stripe-webhook` | Edge Function | Tracking chat-originated (pas split) |
| `create-link-checkout-session` | Edge Function | Accepter metadata chat |

### 0.4 ⛔ Conflits Bloquants Identifiés

**Conflit 1 — `agency_members` schema mismatch (BLOQUANT)**

La RPC `accept_chatter_invitation` (migration 076) fait :
```sql
INSERT INTO agency_members (profile_id, user_id, role, permissions)
```
Mais la table prod a les colonnes `agency_user_id`, `chatter_user_id`. Cette RPC **planterait en prod**.

→ **Fix migration 077** : Supprimer cette dépendance. `chatter_invitations` devient la seule source de vérité pour l'accès chatter. `agency_members` reste intact pour le panel agence.

**Conflit 2 — Incohérence CDC commission chatter**

- §13.2 UI text : "Commission chatting : 40% sur les ventes chat"
- §13.3 tableau : Chatter 25%, Créateur 45%, Exclu 15%, Stripe ~5%

Les deux sont contradictoires. **À trancher avec le client avant le split payment.** Pour l'instant on stocke `chatter_commission_bps = 2500` (25%).

**Non-problème — Route `/app/chat`**

`/app/tips-requests` existe déjà comme alias → on change `/app/chat` vers `CreatorChat` sans casser l'accès aux tips/requests.

---

## 1. Architecture Globale

### 1.1 Acteurs & Interfaces

```
CRÉATEUR (is_creator = true)
  ├── Interface : /app/chat  (toutes convs, mode solo = répond lui-même)
  ├── Settings : /app/settings onglet "Chat"
  └── Surveillance : voit tout ce que chaque chatter a fait (convs + revenus générés)

CHATTER (compte Supabase standard)
  ├── Interface : /chatter  (workspace dédié, SÉPARÉ de /app/*)
  ├── Accès : uniquement profils avec invitation acceptée
  ├── Multi-profils : peut gérer plusieurs créateurs simultanément
  └── Dual-role : si aussi créateur, utilise les 2 interfaces séparément (même JWT)

FAN (is_fan = true)
  ├── Initie : bouton "Message" sur /:handle
  ├── Suit : onglet "Messages" dans /fan
  └── Voit : l'identité du créateur uniquement (jamais celle du chatter)
```

### 1.2 Flux de Données Principal

```
[FAN] clique "Message" sur /:handle
  → UPSERT conversations (fan_id, profile_id, status='unclaimed')
  → INSERT messages (sender_type='fan')
  → Realtime NOTIFY → tous chatters du profil voient la nouvelle conv

[CHATTER] voit la conversation dans la queue "Unclaimed"
  → claim_conversation() RPC [FOR UPDATE SKIP LOCKED — anti race condition]
  → conversations.status = 'active', assigned_chatter_id = chatter
  → Autres chatters ne voient plus cette conv

[CHATTER] répond
  → INSERT messages (sender_type='chatter', sender_id=chatter_id)
  → UPDATE conversations.last_message_at, last_message_preview
  → Realtime NOTIFY → fan voit le nouveau message

[CHATTER] envoie contenu payant
  → INSERT messages (content_type='paid_content', paid_content_id=X)
  → Fan voit carte "Acheter $Y" dans le chat
  → Fan clique → create-link-checkout-session (metadata: source='chat', conversation_id, chatter_id)
  → stripe-webhook → UPDATE conversations.total_revenue_cents += amount
  → [FUTUR] système de paiement → lit chatter_id → calcule split 45/25/15/~5
```

### 1.3 Stratégie Realtime

| Channel | Filtre | Qui s'abonne | Événements |
|---------|--------|-------------|------------|
| `conversations:{profile_id}` | `profile_id=eq.{id}` | Créateur, Chatters du profil | INSERT, UPDATE |
| `conversations:{fan_id}` | `fan_id=eq.{id}` | Fan | UPDATE |
| `messages:{conversation_id}` | `conversation_id=eq.{id}` | Tous participants | INSERT |
| Presence `conv:{conversation_id}` | Supabase Presence | Chatter | Online/offline fan |

> REPLICA IDENTITY FULL déjà activé sur `conversations` et `messages` (migration 073) ✅

---

## 2. Sécurité — Modèle Complet

### 2.1 Isolation des Données (RLS existante migration 075)

| Acteur | Peut voir | Ne peut PAS voir |
|--------|-----------|-----------------|
| Fan | Ses conversations uniquement | Conversations d'autres fans |
| Chatter | Convs de ses profils assignés + unclaimed | Données financières créateur, convs autres chatters |
| Créateur | Toutes convs de son profil | Convs d'autres créateurs |

### 2.2 Permissions Chatter (JSONB dans `chatter_invitations.permissions`)

```typescript
interface ChatterPermissions {
  can_send_paid_content: boolean; // Envoyer des liens contenu payant
  can_send_tip_links: boolean;    // Envoyer des liens de tip
  can_mass_message: boolean;      // Broadcast (Premium only)
  can_tag_fans: boolean;          // Créer/modifier des tags fans
}
```

Vérification côté RLS ET côté frontend avant d'afficher les boutons.

### 2.3 Révocation Instantanée

`revoke_chatter_access(chatter_id, profile_id)` fait atomiquement :
1. `chatter_invitations.status → 'revoked'`
2. Conversations actives → `status = 'unclaimed'` (remises en queue, **non perdues**)
3. Le chatter perd accès immédiatement via RLS (0 délai)

### 2.4 Rate Limiting Messages

```sql
-- Dans la RLS participants_insert_messages, ajouter :
AND (
  SELECT COUNT(*) FROM messages
  WHERE sender_id = auth.uid()
    AND created_at > now() - INTERVAL '60 seconds'
) < 10  -- Max 10 messages par minute par sender
```

### 2.5 Sessions Mixtes (Chatter + Créateur)

Si un user est à la fois créateur ET chatter :
- `/app` pour l'interface créateur (AppShell normal)
- `/chatter` pour l'interface chatter (layout distinct)
- Même JWT Supabase — pas de conflit. `ChatterRoute` vérifie `get_chatter_profiles() > 0 rows`.

---

## 3. Base de Données — Gap Analysis & Nouvelles Migrations

### 3.1 Action immédiate : pousser les migrations locales

```bash
supabase db diff   # Vérifier ce qui est local mais pas en prod
supabase db push   # Pousser migrations 073-076
```

### 3.2 Migration 077 — Fix RPCs (BLOCKER)

**Fichier** : `supabase/migrations/077_fix_chat_rpc_agency_conflict.sql`

Supprime la dépendance à `agency_members` dans les RPCs chat. `chatter_invitations` devient la seule source de vérité.

```sql
-- Réécriture accept_chatter_invitation sans agency_members
CREATE OR REPLACE FUNCTION public.accept_chatter_invitation(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inv   chatter_invitations%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_profile_username TEXT;
BEGIN
  SELECT * INTO v_inv
  FROM chatter_invitations
  WHERE token = p_token AND status = 'pending' AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invitation_invalid_or_expired');
  END IF;

  UPDATE chatter_invitations
  SET status = 'accepted', chatter_id = v_user_id, accepted_at = now()
  WHERE id = v_inv.id;

  SELECT username INTO v_profile_username
  FROM creator_profiles WHERE id = v_inv.profile_id;

  RETURN json_build_object(
    'success', true,
    'profile_id', v_inv.profile_id,
    'profile_username', v_profile_username
  );
END;
$$;

-- Réécriture revoke_chatter_access sans agency_members
CREATE OR REPLACE FUNCTION public.revoke_chatter_access(
  p_chatter_id UUID, p_profile_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM creator_profiles
    WHERE id = p_profile_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE chatter_invitations
  SET status = 'revoked'
  WHERE chatter_id = p_chatter_id AND profile_id = p_profile_id;

  -- Remettre les conversations en queue sans les perdre
  UPDATE conversations
  SET assigned_chatter_id = NULL, status = 'unclaimed'
  WHERE profile_id = p_profile_id
    AND assigned_chatter_id = p_chatter_id
    AND status = 'active';
END;
$$;
```

### 3.3 Migration 078 — Table `mass_messages`

```sql
CREATE TABLE mass_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  sent_by         UUID NOT NULL REFERENCES auth.users(id),
  -- Filtre : {} = tous, {"tag":"VIP"} = par tag, {"active_days":7} = récents
  target_filter   JSONB NOT NULL DEFAULT '{}',
  content         TEXT NOT NULL CHECK (char_length(content) <= 4000),
  content_type    TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','paid_content')),
  paid_content_id UUID REFERENCES links(id) ON DELETE SET NULL,
  paid_amount_cents INTEGER,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sending','sent','failed')),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mass_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creator_chatter_manage_mass_messages" ON mass_messages FOR ALL
  USING (
    EXISTS (SELECT 1 FROM creator_profiles cp
            WHERE cp.id = mass_messages.profile_id AND cp.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM chatter_invitations ci
      WHERE ci.profile_id = mass_messages.profile_id
        AND ci.chatter_id = auth.uid() AND ci.status = 'accepted'
        AND (ci.permissions->>'can_mass_message')::boolean = true
    )
  );
```

### 3.4 Migration 079 — Attribution Achats Chat (Revenue Tracking sans split)

Prépare le futur split sans l'implémenter.

```sql
-- Ajouter chatter_id sur la table d'achat de liens (vérifier le vrai nom)
-- Quand le système de paiement sera refondu, ces colonnes seront déjà là
ALTER TABLE purchases  -- adapter au nom réel de la table
  ADD COLUMN IF NOT EXISTS chat_conversation_id UUID
    REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chat_chatter_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_chat_chatter
  ON purchases(chat_chatter_id) WHERE chat_chatter_id IS NOT NULL;

-- RPC pour incrémenter le revenu d'une conversation (appelé par stripe-webhook)
CREATE OR REPLACE FUNCTION public.increment_conversation_revenue(
  p_conversation_id UUID,
  p_amount_cents INTEGER
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE conversations
  SET total_revenue_cents = total_revenue_cents + p_amount_cents
  WHERE id = p_conversation_id;
END;
$$;
```

### 3.5 Cron Jobs

```sql
-- Auto-archive conversations inactives 72h (migration 076 existante)
SELECT cron.schedule('auto-archive-chats', '0 * * * *',
  $$SELECT public.auto_archive_inactive_conversations()$$);

-- Notification inactivité 24h (Edge Function send-inactivity-alerts)
SELECT cron.schedule('notify-inactive-chats', '0 */6 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_functions_url') || '/send-inactivity-alerts',
    headers := '{"Authorization": "Bearer " || current_setting("app.service_role_key")}',
    body := '{}'
  )$$);
```

---

## 4. Edge Functions à Créer

### 4.1 `send-chatter-invitation`

**Déclencheur** : Créateur clique "Inviter"
1. Vérifier propriétaire du profil + Premium (`is_creator_subscribed = true`)
2. INSERT `chatter_invitations` (token généré par DB default)
3. Email Brevo avec lien `https://exclu.at/chatter/accept?token={token}`

### 4.2 `send-mass-message`

1. Vérifier permission `can_mass_message`
2. Résoudre liste fans selon filtre
3. INSERT `mass_messages` (status='sending')
4. Par chunks de 100 : INSERT message dans chaque conversation existante du fan
5. UPDATE `mass_messages` → status='sent', recipient_count=N

### 4.3 Adaptation `stripe-webhook` (tracking seulement, pas de split)

```typescript
// Après traitement normal de l'achat :
const chatConversationId = session.metadata?.chat_conversation_id;
const chatChatterId = session.metadata?.chat_chatter_id;

if (chatConversationId) {
  // Incrémenter revenu de la conversation (stats créateur/chatter)
  await supabase.rpc('increment_conversation_revenue', {
    p_conversation_id: chatConversationId,
    p_amount_cents: amountCents
  });
  // Enregistrer attribution pour futur split
  if (chatChatterId) {
    await supabase.from('purchases')
      .update({ chat_conversation_id: chatConversationId, chat_chatter_id: chatChatterId })
      .eq('stripe_session_id', session.id);
  }
}
// FUTUR : quand nouveau système de paiement → lire chat_chatter_id → split
```

### 4.4 Adaptation `create-link-checkout-session`

```typescript
// Paramètres optionnels à accepter dans le body
const chatConversationId = body.chat_conversation_id ?? null;
const chatChatterId = body.chat_chatter_id ?? null;

// Dans les metadata Stripe
metadata: {
  // ...metadata existants...
  ...(chatConversationId && { chat_conversation_id: chatConversationId }),
  ...(chatChatterId && { chat_chatter_id: chatChatterId }),
  source: chatConversationId ? 'chat' : 'direct',
}
```

### 4.5 `send-inactivity-alerts` (nouveau)

Appelé par pg_cron toutes les 6h. Récupère les conversations actives inactives entre 24h et 48h (une seule alerte) et envoie un email Brevo au chatter assigné : "⏳ @fan attend votre réponse depuis 24h".

---

## 5. Pages Frontend — Spec Détaillée

### 5.1 `/app/chat` → `CreatorChat.tsx` (NOUVEAU)

**Remplace** la cible de `/app/chat`. `/app/tips-requests` reste intact.

**Layout 3 colonnes desktop, 1 colonne mobile** :
```
┌──────────────┬──────────────────────┬──────────────┐
│ Conversations│   Thread de messages  │ Profil fan   │
│   (320px)    │      (flex-1)         │   (300px)    │
└──────────────┴──────────────────────┴──────────────┘
```

Sidebar gauche : filtres [Toutes|Non lues|Actives|Archivées], search, `ConversationListItem` list.
Zone centrale : header (avatar fan, profil @handle, online badge, actions), thread `ChatWindow`, `RichMessageComposer`.
Sidebar droite : `FanProfileSidebar` (identité, tags, stats, historique, actions rapides).

**Mode solo** : créateur répond directement (sender_type='creator').
**Mode team** : lecture seule. Bouton "Reprendre la main" pour claim (passe de chatter à créateur).
**Monitoring** : chaque conversation indique quel chatter l'a traitée + revenus générés.

### 5.2 `/chatter` → `ChatterDashboard.tsx` (NOUVEAU)

**Layout custom sans AppShell** (séparé de /app/*).

```
┌──────────┬────────────────────┬──────────────────────────┐
│ PROFILS  │ CONVERSATIONS      │ THREAD ACTIF             │
│ @girl1🔴3│ [Unclaimed (3)]    │ Fan: @john_doe           │
│ @girl2⚪0│ ┌──────────────┐   │ Profil: @girl1           │
│──────────│ │@girl1—@john  │   │──────────────────────────│
│ [Logout] │ │"Hey babe"    │   │ [messages...]            │
│          │ │[🙋 Prendre]  │   │──────────────────────────│
│          │ └──────────────┘   │ [Message...][💰][🎁][📷] │
└──────────┴────────────────────┴──────────────────────────┘
```

**Persona display** : bandeau en haut du thread affichant `creator_profiles.chatter_persona`.
**Race condition** : exception `conversation_already_claimed` → toast "Déjà prise, choisissez-en une autre".
**Données** : `get_chatter_profiles()` RPC pour la sidebar profils.

### 5.3 `/chatter/accept` → `AcceptChatterInvite.tsx` (NOUVEAU)

Route accessible sans auth. Flux :
1. Charger infos invitation depuis le token
2. Non connecté → login/signup avec email pré-rempli
3. Après auth → `accept_chatter_invitation(token)` RPC
4. Succès → redirect `/chatter` | Erreur → message + lien support

### 5.4 `FanDashboard.tsx` — Onglet "Messages" (MODIFICATION)

Ajouter tab `messages`. Requête conversations du fan triées par `last_message_at`. Vue conversation : thread simple + RichComposer texte uniquement. Messages enrichis reçus affichent carte "Acheter $X" avec appel `create-link-checkout-session` + metadata chat.

### 5.5 `CreatorPublic.tsx` — Bouton Message (MODIFICATION)

Si `chat_enabled = true` :
- Bouton "Message" dans le header du profil
- Icône Chat dans la nav mobile bottom bar (§6.2 CDC)

```typescript
const handleStartChat = async () => {
  if (!fanUser) {
    navigate(`/fan/signup?creator=${handle}&action=chat&profile_id=${profileId}`);
    return;
  }
  const { data } = await supabase
    .from('conversations')
    .upsert({ fan_id: fanUser.id, profile_id: profileId },
             { onConflict: 'fan_id,profile_id' })
    .select('id').single();
  navigate(`/fan?tab=messages&conv=${data.id}`);
};
```

### 5.6 `Profile.tsx` — Section "Chat" (MODIFICATION)

Nouvel onglet `'chat'` dans `activeSection`. Composant `ChatSettingsPanel` :
- Toggle `chat_enabled`
- Radio solo/team
- Textarea `chatter_persona` (si team)
- Note commission (25% — système de versement à préciser lors refonte paiement)
- Liste chatters (`get_profile_chatters()` RPC)
- Bouton "Inviter" → `InviteChatterModal`
- Bouton "Révoquer" → `revoke_chatter_access()` RPC

### 5.7 `FanSignup.tsx` — Param `action=chat` (MODIFICATION)

```typescript
// Après auth réussie, si action=chat et profile_id
if (action === 'chat' && profileId) {
  const { data } = await supabase
    .from('conversations')
    .upsert({ fan_id: userId, profile_id: profileId },
             { onConflict: 'fan_id,profile_id' })
    .select('id').single();
  navigate(`/fan?tab=messages&conv=${data.id}`);
}
```

---

## 6. Composants — Catalogue

Tous dans `src/components/chat/`.

| Composant | Props clés | Description |
|-----------|-----------|-------------|
| `ConversationListItem` | conversation, isSelected | Avatar fan, nom, preview 60 chars, timestamp relatif, badge unread, point vert online, épingle |
| `ChatWindow` | conversationId, senderType, permissions | Thread messages, infinite scroll haut, mark as read auto, Realtime |
| `MessageBubble` | message, isOwn | text/paid_content/tip_link/wishlist_link/image/system |
| `RichMessageComposer` | conversationId, senderType, permissions | Input + barre actions (selon permissions), optimistic UI |
| `FanProfileSidebar` | fanId, profileId | Identité, tags éditables, stats, historique achats, actions rapides |
| `FanTagBadge` | tag, color, onRemove | Chip coloré selon presets (🔥=orange, 💎=bleu, 🆕=vert, ⏳=jaune, 🚫=rouge) |
| `ClaimConversationCard` | conversation, onClaim | Preview + bouton claim + gestion exception race condition |
| `MassBroadcastModal` | profileId, permissions | Filtre destinataires + message + count estimé + appel edge fn |
| `InviteChatterModal` | profileId, onSuccess | Email + permissions checkboxes + appel edge fn |
| `ChatterManagementRow` | invitation, onRevoke | Email, statut, convs actives, revenus générés, boutons modifier/révoquer |
| `ChatSettingsPanel` | profileId | Mode solo/team, persona, toggle, liste équipe (dans Profile.tsx) |

---

## 7. Hooks à Créer

### `useConversations(profileId, filter)` — `src/hooks/useConversations.ts`

```typescript
/**
 * useConversations — Gère la liste des conversations d'un profil.
 * 
 * Charge la liste initiale + maintient à jour via Supabase Realtime.
 * À chaque event Realtime, met à jour la liste localement sans refetch complet (perf).
 * 
 * RLS garantit que seul le créateur propriétaire et ses chatters voient ces données.
 */
```

### `useMessages(conversationId)` — `src/hooks/useMessages.ts`

```typescript
/**
 * useMessages — Gère le thread de messages d'une conversation.
 * 
 * - Charge les 20 derniers messages au montage (pagination inverse)
 * - loadMore() : charge les 20 précédents
 * - S'abonne aux nouveaux messages via Realtime (INSERT uniquement)
 * - Marque automatiquement les messages entrants comme lus
 */
```

### `useChatUnread()` — `src/hooks/useChatUnread.ts`

```typescript
/**
 * useChatUnread — Compte les conversations non lues pour le badge nav.
 * 
 * Utilisé par ChatContext. Requête légère sur conversations
 * où is_read = false pour le profil actif. Maintenu via Realtime.
 */
```

---

## 8. ChatContext — Contexte Global

**Fichier** : `src/contexts/ChatContext.tsx`

```typescript
/**
 * ChatContext — Contexte global pour le système de chat.
 * Monté dans App.tsx après ProfileProvider.
 * 
 * Fournit :
 *   - unreadCount : badge rouge sur nav item "Chat"
 *   - isChatter : true si l'user a des invitations chatter acceptées
 *   - chatterProfiles : profils accessibles (si isChatter)
 */
interface ChatContextValue {
  unreadCount: number;
  isChatter: boolean;
  chatterProfiles: ChatterProfile[];
  isChatterLoading: boolean;
  refreshUnread: () => void;
}
```

---

## 9. Règles Automatiques

| Règle | Implémentation |
|-------|---------------|
| Inactivité 24h → alerte chatter | Edge fn `send-inactivity-alerts` appelée par pg_cron toutes 6h |
| Inactivité 72h → auto-archive | `auto_archive_inactive_conversations()` RPC, pg_cron toutes les heures |
| Fan en ligne → badge vert | Supabase Presence channel `conv:{conv_id}` dans `ChatWindow` |
| Nouveau message → unread badge | Realtime channel `conversations:{profile_id}`, `useChatUnread` hook |
| Inactivité ⏳ dans liste | Statut "en attente" si dernière action était du chatter (logique client-side) |

---

## 10. Standards de Code (Junior Dev)

### En-tête obligatoire sur chaque fichier créé

```typescript
/**
 * [NomFichier].tsx
 *
 * [Une phrase décrivant la responsabilité unique de ce composant/hook.]
 *
 * Utilisé par   : [Liste des parents]
 * Dépend de     : [hooks, contexts, edge functions]
 * Sécurité      : [Note RLS/permissions si applicable]
 */
```

### Commentaires sur les appels Supabase

```typescript
// Charger les conversations du profil actif.
// RLS (migration 075) garantit isolation : seul le créateur et ses chatters voient ces données.
// REPLICA IDENTITY FULL activé (migration 073) → filtre Realtime par profile_id possible.
const { data } = await supabase
  .from('conversations')
  .select(`id, status, last_message_at, fan:profiles!fan_id(id, display_name, avatar_url)`)
  .eq('profile_id', profileId)
  .order('last_message_at', { ascending: false });
```

### Commentaires sur les subscriptions Realtime

```typescript
// S'abonner aux changements de conversations de ce profil.
// Filtre côté serveur (profile_id) → seuls les events de CE profil arrivent ici.
// Cleanup impératif dans le return du useEffect pour éviter les memory leaks.
const channel = supabase
  .channel(`conversations:${profileId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations',
      filter: `profile_id=eq.${profileId}` }, handleConversationChange)
  .subscribe();

return () => { supabase.removeChannel(channel); };
```

### Logique métier dans les hooks, jamais dans les composants UI

```
src/hooks/useConversations.ts   ← toute la logique
src/components/chat/ConversationList.tsx ← uniquement le rendu
```

---

## 11. Futur — Split de Paiement Chatter

Quand le système de paiement sera refondu, voici exactement où pluguer :

**Ce qui sera déjà en place grâce à ce plan :**
- `chatter_commission_bps` sur `creator_profiles` (modifiable sans migration)
- `chat_chatter_id` sur les achats (migration 079)
- `conversations.total_revenue_cents` renseigné par le webhook
- `chatter_id` dans les metadata Stripe de chaque checkout chat

**Ce qui sera à ajouter lors du refactoring paiement :**
1. Stripe Connect pour les chatters (onboarding dans `/chatter/settings`)
2. Dans `stripe-webhook` : si `metadata.chat_chatter_id` et chatter a `stripe_account_id` → 2 Stripe Transfers
3. Si chatter pas encore sur Stripe Connect → part en hold dans `chatter_pending_payouts`

**Taux confirmés (CDC §13.3) :**
- Fan paie : base_price + 5% frais de traitement (ajoutés côté fan, comme tips/gifts)
- Créateur : 45% du base_price
- Chatter : 25% du base_price (`chatter_commission_bps = 2500`)
- Exclu : 15% du base_price + encaisse les 5% frais fan (dont Exclu absorbe les frais Stripe réels)
- Note : Le "40% commission chatting" affiché au créateur (§13.2) = 25% chatter + 15% Exclu

---

## 12. Ordre d'Implémentation (Phases)

### Phase 1 — DB & Infrastructure (blocker absolu, rien ne peut démarrer sans)
1. `supabase db push` pour migrer 073–076 en prod
2. Créer + pousser migration 077 (fix RPCs agency_members conflict)
3. Créer + pousser migration 078 (`mass_messages`)
4. Créer + pousser migration 079 (attribution achats chat)
5. Déployer edge function `send-chatter-invitation`
6. Configurer pg_cron (auto-archive + inactivité 24h)

### Phase 2 — Chat Créateur Solo (fondation UI)
1. `ChatContext` + `useChatUnread` + `ChatProvider` dans `App.tsx`
2. Composants : `ConversationListItem`, `ChatWindow`, `MessageBubble` (text only), `RichMessageComposer` (text only)
3. `CreatorChat.tsx` (mode solo, liste convs + thread + FanProfileSidebar minimal)
4. Modifier route `/app/chat` + badge unread dans `AppShell`
5. Realtime : `useConversations` + `useMessages`

### Phase 3 — Fan Side
1. Bouton "Message" dans `CreatorPublic.tsx` (header + nav mobile §6.2 CDC)
2. Onglet "Messages" dans `FanDashboard.tsx` + vue conversation fan
3. Gérer `action=chat` dans `FanSignup.tsx`
4. Realtime côté fan

### Phase 4 — Onboarding Chatter
1. `ChatSettingsPanel` + `InviteChatterModal` + `ChatterManagementRow` dans `Profile.tsx`
2. Edge function `send-chatter-invitation` + email Brevo
3. `AcceptChatterInvite.tsx` + route `/chatter/accept`
4. `ChatterRoute` guard

### Phase 5 — Interface Chatter
1. `ChatterDashboard.tsx` (layout complet)
2. `ClaimConversationCard` + intégration RPC `claim_conversation`
3. `RichMessageComposer` étendu (paid content, tip links, wishlist)
4. `FanProfileSidebar` complet avec stats et tags
5. `useChatUnread` adapté pour isChatter + nav badge

### Phase 6 — Features Avancées
1. `FanTagBadge` + gestion des tags dans FanProfileSidebar
2. `MassBroadcastModal` + edge function `send-mass-message`
3. Adaptation `stripe-webhook` + `create-link-checkout-session` pour tracking chat
4. Présence Supabase (badge vert fan en ligne)
5. `send-inactivity-alerts` edge function + pg_cron

### Phase 7 — Export & Audit (§13.9 CDC)
1. Edge function `export-conversations` (CSV export pour compliance)
2. Vue audit dans `CreatorChat.tsx` (filtre par chatter, voir tout ce qu'il a fait)

### Phase 8 — Push Notifications (future)
1. Service Worker `public/sw.js`
2. Table `push_subscriptions`
3. Edge function `send-push-notification` + VAPID keys

---

## 13. Structure de Fichiers Finale

```
src/
├── pages/
│   ├── CreatorChat.tsx              ← NEW (Phase 2)
│   ├── ChatterDashboard.tsx         ← NEW (Phase 5)
│   ├── AcceptChatterInvite.tsx      ← NEW (Phase 4)
│   ├── FanDashboard.tsx             ← MODIFIED (Phase 3)
│   ├── Profile.tsx                  ← MODIFIED (Phase 4)
│   ├── CreatorPublic.tsx            ← MODIFIED (Phase 3)
│   ├── FanSignup.tsx                ← MODIFIED (Phase 3)
│   └── App.tsx                      ← MODIFIED (Phase 2)
│
├── components/
│   ├── chat/
│   │   ├── ConversationList.tsx     ← NEW (Phase 2)
│   │   ├── ConversationListItem.tsx ← NEW (Phase 2)
│   │   ├── ChatWindow.tsx           ← NEW (Phase 2)
│   │   ├── MessageBubble.tsx        ← NEW (Phase 2)
│   │   ├── RichMessageComposer.tsx  ← NEW (Phase 2, étendu Phase 5)
│   │   ├── FanProfileSidebar.tsx    ← NEW (Phase 5)
│   │   ├── FanTagBadge.tsx          ← NEW (Phase 6)
│   │   ├── ClaimConversationCard.tsx← NEW (Phase 5)
│   │   ├── MassBroadcastModal.tsx   ← NEW (Phase 6)
│   │   ├── InviteChatterModal.tsx   ← NEW (Phase 4)
│   │   ├── ChatterManagementRow.tsx ← NEW (Phase 4)
│   │   └── ChatSettingsPanel.tsx    ← NEW (Phase 4)
│   ├── AppShell.tsx                 ← MODIFIED (badge unread)
│   └── ChatterRoute.tsx             ← NEW (Phase 4)
│
├── hooks/
│   ├── useConversations.ts          ← NEW (Phase 2)
│   ├── useMessages.ts               ← NEW (Phase 2)
│   └── useChatUnread.ts             ← NEW (Phase 2)
│
└── contexts/
    └── ChatContext.tsx              ← NEW (Phase 2)

supabase/
├── migrations/
│   ├── 077_fix_chat_rpc_agency_conflict.sql ← NEW (Phase 1)
│   ├── 078_mass_messages.sql                ← NEW (Phase 1)
│   └── 079_chat_purchase_attribution.sql    ← NEW (Phase 1)
└── functions/
    ├── send-chatter-invitation/             ← NEW (Phase 1)
    ├── send-mass-message/                   ← NEW (Phase 6)
    └── send-inactivity-alerts/              ← NEW (Phase 6)
```

---

## 14. Questions Ouvertes (à trancher)

| # | Question | Recommandation |
|---|----------|---------------|
| 1 | ~~Commission chatter : 40% (§13.2) ou 25% (§13.3) ?~~ | ✅ RÉSOLU : Le 40% de §13.2 = chatter (25%) + Exclu (15%) = 40% total non-créateur. Le tableau §13.3 est la vérité. DB = 25% (`chatter_commission_bps = 2500`). |
| 2 | Mode team = Premium only ? | OUI — valider dans `send-chatter-invitation` edge fn |
| 3 | Max chatters actifs par profil ? | Suggéré : 10 (à configurer dans la validation de l'invitation) |
| 4 | Le fan voit-il si c'est un chatter ou le créateur ? | NON — toujours l'identité du créateur |
| 5 | Export conversations (§13.9) : format ? | CSV. Phase 7. |
| 6 | Push notifications : scope phase actuelle ? | Phase 8 uniquement. Hors scope immédiat. |

---

*Document vivant — à mettre à jour au fil de l'implémentation. Quand une phase est terminée, marquer ✅ devant la phase.*
