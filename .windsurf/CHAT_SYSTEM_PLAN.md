# Plan de Développement — Chatting System (Feature 13)
## Centre de Vente Humain — Exclu.at

> **Statut** : Plan complet pré-développement  
> **Dernière mise à jour** : Mars 2026  
> **Auteur** : Lead Dev (Cascade)

---

## 0. État des Lieux — Inventaire Complet

### ✅ DB déjà en place (migrations locales 073-076)

| Migration | Contenu |
|-----------|---------|
| `073` | Tables `conversations`, `messages`, `fan_tags`, `chatter_invitations` + REPLICA IDENTITY FULL |
| `074` | Colonnes chat sur `creator_profiles` : `chat_mode`, `chatter_persona`, `chat_enabled`, `chatter_commission_bps` |
| `075` | Toutes les RLS policies pour conversations, messages, fan_tags, chatter_invitations |
| `076` | RPCs : `claim_conversation`, `accept_chatter_invitation`, `get_chatter_profiles`, `revoke_chatter_access`, `get_profile_chatters`, `auto_archive_inactive_conversations` |

> ⚠️ **Ces 4 migrations n'ont pas encore été poussées en production.** À déployer avant tout développement frontend.

### ✅ Frontend déjà en place

- Route `/app/chat` dans `App.tsx` → pointe actuellement vers `CreatorTipsRequests` (**à remplacer**)
- Item "Chat" dans la nav `AppShell.tsx` avec `MessageSquare` icon
- `agency_members` table existante en prod (ancienne structure, voir conflit §1.3)

### ❌ Rien encore de construit côté frontend chat

---

## 1. Gap Analysis & Problèmes Bloquants

### 1.1 Migrations à pousser en prod

```bash
supabase db push
```

Vérifier que les migrations `073` à `076` sont bien appliquées.

### 1.2 Migrations supplémentaires nécessaires

Deux nouvelles migrations doivent être créées **avant** de commencer le frontend :

**Migration 077 — Fix `agency_members` pour les chatters**

La migration 076 (`accept_chatter_invitation`) fait un `INSERT INTO agency_members (profile_id, user_id, role, permissions)` mais la table en prod a pour colonnes `agency_user_id` et `chatter_user_id` (ancienne structure).

→ **Conflit bloquant** : la RPC `accept_chatter_invitation` échouera en prod tel quel.

Solution : Ajouter les colonnes `profile_id`, `user_id`, `role`, `permissions` à `agency_members` ou créer un trigger de compatibilité. Recommandation = réécrire l'INSERT dans la RPC pour utiliser les vraies colonnes (plus propre que modifier le schéma de `agency_members`).

**Migration 078 — Table `mass_messages`**

Nécessaire pour tracker les broadcasts envoyés (audit, stats).

```sql
CREATE TABLE mass_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  sent_by         UUID NOT NULL REFERENCES auth.users(id),
  target_filter   JSONB NOT NULL DEFAULT '{}',
  content         TEXT NOT NULL CHECK (char_length(content) <= 4000),
  content_type    TEXT NOT NULL DEFAULT 'text',
  paid_content_id UUID REFERENCES links(id) ON DELETE SET NULL,
  paid_amount_cents INTEGER,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS : créateur et chatters autorisés avec permission can_mass_message
```

### 1.3 Conflit `agency_members` — Plan de résolution détaillé

La RPC `accept_chatter_invitation` (migration 076) doit être modifiée pour utiliser les vraies colonnes :

```sql
-- Remplacement dans la RPC accept_chatter_invitation :
INSERT INTO agency_members (agency_user_id, chatter_user_id, role, permissions, accessible_profile_ids)
SELECT cp.user_id, v_user_id, 'chatter', v_inv.permissions, ARRAY[v_inv.profile_id]
FROM creator_profiles cp WHERE cp.id = v_inv.profile_id
ON CONFLICT (agency_user_id, chatter_user_id)
DO UPDATE SET
  permissions = EXCLUDED.permissions,
  accessible_profile_ids = array_append(
    COALESCE(agency_members.accessible_profile_ids, '{}'), 
    v_inv.profile_id
  );
```

La RPC `revoke_chatter_access` doit aussi être mise à jour en conséquence.

→ **Migration 077** corrige ce conflit proprement.

---

## 2. Architecture Globale

### 2.1 Modèle des acteurs

```
CREATOR (auth.users, is_creator = true)
  └── possède N creator_profiles
        └── configure chat_mode (solo | team)
        └── invite N chatters via chatter_invitations

CHATTER (auth.users)
  └── compte Supabase standard (pas creator, pas fan)
  └── accède via invitation token → interface /app/chatter
  └── peut gérer plusieurs profils simultanément
  └── permissions granulaires par profil

FAN (auth.users, is_fan = true)
  └── initie conversations depuis la page publique
  └── voit son chat dans /fan (onglet Messages)
```

### 2.2 Flux de données

```
FAN envoie 1er message
  → INSERT conversations (status = 'unclaimed')
  → INSERT messages (sender_type = 'fan')
  → Realtime NOTIFY → tous les chatters du profil
  → Premier chatter claim → claim_conversation() RPC
  → conversation.status = 'active', assigned_chatter_id = chatter

CHATTER répond
  → INSERT messages (sender_type = 'chatter')
  → UPDATE conversations.last_message_at, last_message_preview
  → Realtime NOTIFY → fan

CHATTER envoie contenu payant
  → INSERT messages (content_type = 'paid_content', paid_content_id = X)
  → Fan voit le message avec bouton "Acheter $X"
  → Fan clique → Stripe Checkout avec chatter_id dans metadata
  → stripe-webhook → répartit : 45% créateur, 25% chatter, 15% Exclu, ~5% Stripe

CRÉATEUR (mode solo)
  → Même interface simplifiée, sans claim, réponse directe
```

### 2.3 Répartition des revenus chat

| Partie | % | Mécanisme |
|--------|---|-----------|
| Créateur | 45% | Stripe Connect transfer |
| Chatter/Agence | 25% | Stripe Connect transfer (compte séparé) |
| EXCLU | 15% | Platform fee retenue |
| Stripe processing | ~5% | Déduit auto par Stripe |

> **Implémentation** : Le chatter doit avoir son propre `stripe_account_id` dans `profiles`. Lors du checkout via chat, le `chatter_id` est passé en metadata Stripe → webhook fait 2 transfers séparés.

> **Prérequis** : Chatter doit onboarder Stripe Connect pour recevoir sa part. Si pas encore onboardé → sa part est retenue (créateur reçoit 70% dans ce cas).

---

## 3. Modèle de Sécurité

### 3.1 Isolation des données

| Acteur | Peut voir | Ne peut PAS voir |
|--------|-----------|-----------------|
| Fan | Ses conversations uniquement | Conversations d'autres fans, stats creator |
| Chatter | Conversations de ses profils assignés | Données financières du créateur, autres chatters' convs |
| Créateur | Toutes conversations de son profil | Conversations des autres créateurs |
| Admin | Tout (via service_role) | — |

### 3.2 Permissions Chatter (JSONB)

```json
{
  "can_send_paid_content": true,
  "can_send_tip_links": true,
  "can_mass_message": false,
  "can_tag_fans": true
}
```

Toutes les opérations sensibles vérifient `ci.permissions` avant d'autoriser. La granularité est par invitation (= par profil).

### 3.3 Révocation Immédiate

`revoke_chatter_access(p_chatter_id, p_profile_id)` :
1. Status invitation → `revoked`
2. Suppression `agency_members`
3. Toutes ses conversations actives → `unclaimed` (pas perdues, remises en queue)

### 3.4 Rate Limiting Messages

À implémenter via une RPC ou un check dans `participants_insert_messages` :

```sql
-- Refuser si > 10 messages en 60 secondes pour un sender
AND (
  SELECT COUNT(*) FROM messages
  WHERE sender_id = auth.uid()
    AND created_at > now() - INTERVAL '60 seconds'
) < 10
```

### 3.5 Isolation Chatter ↔ Données Financières

Le chatter n'a accès qu'aux tables : `conversations`, `messages`, `fan_tags`, `creator_profiles` (lecture seule), `chatter_invitations` (lecture de ses propres). Il n'a **jamais** accès à : `purchases`, `tips`, `gift_purchases`, `profiles.stripe_*`.

---

## 4. Stratégie Realtime

### 4.1 Channels Supabase

```typescript
// Créateur / Chatter : écoute les nouvelles conversations de ses profils
supabase.channel('conversations:{profile_id}')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'conversations',
    filter: `profile_id=eq.{profile_id}`
  }, handler)

// Dans une conversation ouverte : écoute les nouveaux messages
supabase.channel('messages:{conversation_id}')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `conversation_id=eq.{conversation_id}`
  }, handler)

// Fan : écoute ses propres conversations
supabase.channel('fan_conversations:{fan_id}')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'conversations',
    filter: `fan_id=eq.{fan_id}`
  }, handler)
```

> **Pré-requis** : REPLICA IDENTITY FULL est déjà activé sur `conversations` et `messages` (migration 073). ✅

### 4.2 Unread Badge Global

Un `ChatContext` dans `/src/contexts/ChatContext.tsx` maintient :
- `unreadCount: number` (conversations non lues pour le user courant)
- Se met à jour via Realtime + lors du montage
- Affiché dans `AppShell` nav item "Chat"

### 4.3 Présence Fan

Pour afficher le badge "🟢 En ligne", utiliser Supabase Presence :

```typescript
supabase.channel('presence:fan:{fan_id}')
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    setFanOnline(Object.keys(state).length > 0);
  })
  .track({ user_id: fanId, online_at: new Date().toISOString() })
```

---

## 5. Edge Functions à Créer

### 5.1 `send-chatter-invitation`

**Déclencheur** : Créateur clique "Inviter un chatter"  
**Logique** :
1. Vérifier que l'appelant est creator du profil
2. Vérifier que le créateur est Premium (team mode = premium only)
3. INSERT `chatter_invitations` (génère le token automatiquement via DB default)
4. Envoyer email via Brevo avec lien `https://exclu.at/chat/accept?token={token}`
5. Retourner l'invitation créée

**Payload** :
```typescript
{
  profile_id: string;
  email: string;
  permissions?: {
    can_send_paid_content: boolean;
    can_send_tip_links: boolean;
    can_mass_message: boolean;
    can_tag_fans: boolean;
  }
}
```

### 5.2 `send-mass-message`

**Déclencheur** : Chatter / Créateur valide un broadcast  
**Logique** :
1. Vérifier permissions (`can_mass_message`)
2. Résoudre la liste des fans selon le filtre (tous, tag, activité récente)
3. INSERT `mass_messages` avec status = 'sending'
4. Pour chaque conversation existante du profil → INSERT message
5. UPDATE `mass_messages.recipient_count` et status = 'sent'
6. Retourner les stats

> ⚠️ Potentiellement coûteux si beaucoup de fans. Implémenter avec pagination interne (chunks de 100).

### 5.3 Adaptation de `stripe-webhook`

Ajouter un handler pour les achats "chat-originated" :
- Si `metadata.chatter_id` présent dans la session checkout → calculer split 45/25/15
- Faire 2 transfers Stripe Connect : créateur + chatter
- UPDATE `conversations.total_revenue_cents` avec le montant

### 5.4 Cron — Auto-Archive

Utiliser `pg_cron` Supabase (ou un cron Vercel) pour appeler `auto_archive_inactive_conversations()` toutes les heures :

```sql
-- Dans Supabase Dashboard > Database > Extensions > pg_cron
SELECT cron.schedule('auto-archive-chats', '0 * * * *', 
  $$SELECT public.auto_archive_inactive_conversations()$$
);
```

---

## 6. Pages Frontend — Spec Détaillée

### 6.1 `/app/chat` → `CreatorChat.tsx` (NOUVEAU)

**Remplace** : Route actuelle qui pointe vers `CreatorTipsRequests`

**Layout** : 3 colonnes sur desktop, 1 colonne sur mobile

```
┌─────────────────────────────────────────────────────────┐
│  [Sidebar Conversations]  [ChatWindow]  [FanSidebar]    │
│  320px                    flex-1         320px           │
└─────────────────────────────────────────────────────────┘
```

**Sidebar Gauche** :
- Filtre : Toutes | Non lues | Épinglées | Archivées
- Search par nom de fan
- Liste `ConversationListItem` avec : avatar fan, nom, preview, timestamp, badge unread, indicateur online
- Bouton "Message de masse" (si premium)

**Zone centrale** :
- Header : avatar + nom fan, profil associé (@girl1), bouton actions (pin, archive, transférer)
- Thread de messages (scroll, infinite load vers le haut)
- `RichMessageComposer` en bas

**Sidebar Droite** (FanProfileDrawer) :
- Avatar + nom fan
- Tags (🔥 High spender, 💎 VIP, etc.) + bouton d'ajout
- Stats : total dépensé, nombre d'achats, 1ère/dernière activité
- Historique d'achats (tips, contenu, cadeaux)
- Liens rapides : envoyer contenu payant, envoyer tip link

**Données chargées** :
```typescript
// Conversations du profil actif
supabase.from('conversations')
  .select(`*, fan:profiles!fan_id(id, display_name, avatar_url)`)
  .eq('profile_id', activeProfile.id)
  .neq('status', 'archived')
  .order('last_message_at', { ascending: false })
```

**Realtime** : Channel sur `conversations:{profile_id}` + `messages:{conversation_id}`

**Mode Solo vs Équipe** : Si `creator_profile.chat_mode === 'solo'`, pas de claim, le créateur répond directement. Si `team`, l'UI est read-only pour le créateur (observation) avec capacité de reprendre la main.

---

### 6.2 `/app/chatter` → `ChatterCenter.tsx` (NOUVEAU)

**Route nouvelle** : À ajouter dans `App.tsx`  
**Guard** : `ChatterRoute` — vérifie que l'user a au moins 1 `chatter_invitation` acceptée  
**Pas d'AppShell standard** : Layout custom sans la nav créateur

**Layout** :
```
┌──────────────────────────────────────────────────────────────┐
│  [Logo]               ChatterCenter          [@chatter_name]  │
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│  PROFILS     │  CONVERSATIONS                                │
│  ──────────  │  ─────────────────────────────────────────── │
│  @girl1 🔴3  │  [ClaimQueue: 3 non assignées]               │
│  @girl2 ⚪0  │  ┌──────────────────────────────────────┐    │
│              │  │ @girl1 — @john_doe    🕐 2min         │   │
│  ──────────  │  │ "Hey babe, I love..."  [Prendre 🙋]   │   │
│  [Logout]    │  └──────────────────────────────────────┘    │
│              │  ┌──────────────────────────────────────┐    │
│              │  │ @girl1 — @mike       Actif ●         │    │
│              │  │ "Thanks for the..."                  │    │
│              │  └──────────────────────────────────────┘    │
├──────────────┴───────────────────────────────────────────────┤
│  [CHATWINDOW ACTIF]                                          │
│  Messages du chat sélectionné...                             │
│  ────────────────────────────────────────────────────────── │
│  [Message... ] [📷 Contenu $] [💰 Tip] [🎁 Wishlist] [📎]  │
└──────────────────────────────────────────────────────────────┘
```

**Données chargées** : Via RPC `get_chatter_profiles()` → liste des profils accessibles avec compteurs.

**Fonctionnalités** :
- Sélection profil (multi-profil dans la sidebar)
- Queue des conversations unclaimed avec claim atomique (`claim_conversation()`)
- Liste conversations actives assignées à ce chatter
- ChatWindow avec `RichMessageComposer`
- FanProfileSidebar (même composant que créateur)
- Indicateur de conversations actives simultanées (badge "12 actives" dans le header)

**Gestion des race conditions** : Si deux chatters cliquent "Prendre en charge" simultanément → la RPC utilise `FOR UPDATE SKIP LOCKED` → seul l'un réussit, l'autre reçoit l'exception `conversation_already_claimed` → toast "Déjà prise par un autre chatter, choisissez-en une autre."

---

### 6.3 `/chat/accept` → `AcceptChatterInvitation.tsx` (NOUVEAU)

**Route** : Pas derrière `ProtectedRoute` — accessible sans être loggué  
**Query param** : `?token=xxx`

**Flux** :
1. Page charge → appel RPC `accept_chatter_invitation(token)` si l'user est déjà loggué
2. Si non loggué → afficher formulaire signup/login avec message "Créez votre compte chatter pour rejoindre @emma"
3. Après auth → appel RPC → success → redirect `/app/chatter`
4. Token expiré ou révoqué → message d'erreur clair

**UI** :
```
┌──────────────────────────────────────────────┐
│  [Logo Exclu]                                │
│                                              │
│  💬 Invitation Chatter                       │
│  ────────────────────────────────────────    │
│  [Avatar @emma]                              │
│  Vous avez été invité à rejoindre            │
│  l'équipe de @emma                           │
│                                              │
│  Commission : 25% sur les ventes             │
│                                              │
│  [Se connecter]  [Créer un compte]           │
└──────────────────────────────────────────────┘
```

---

### 6.4 `/fan` → Onglet "Messages" dans `FanDashboard.tsx` (MODIFICATION)

Ajouter un onglet `messages` à côté de `favorites`, `tips`, `requests`.

**Liste des conversations fan** :
```typescript
supabase.from('conversations')
  .select(`
    id, status, last_message_at, last_message_preview, is_read,
    profile:creator_profiles!profile_id(username, display_name, avatar_url)
  `)
  .eq('fan_id', user.id)
  .neq('status', 'archived')
  .order('last_message_at', { ascending: false })
```

**Vue conversation** (modal ou page dédiée `/fan/chat/:id`) :
- Thread de messages simple
- Input texte uniquement (le fan ne peut pas envoyer de contenu payant)
- Réception des messages enrichis (voir le contenu payant avec bouton d'achat)
- Realtime sur `messages:{conversation_id}`

---

### 6.5 Page Publique Créateur → Bouton "Message" (MODIFICATION de `CreatorPublic.tsx`)

Si `creator_profile.chat_enabled = true` → afficher bouton "💬 Message" dans le header du profil.

Comportement :
- Si fan non loggué → redirect vers `/fan/signup?creator={handle}&action=chat`
- Si fan loggué → créer ou récupérer la conversation (UPSERT) → redirect vers `/fan` onglet Messages

```typescript
// UPSERT conversation (contrainte UNIQUE fan_id, profile_id)
const { data } = await supabase
  .from('conversations')
  .upsert({ fan_id: user.id, profile_id: profileId }, { onConflict: 'fan_id,profile_id' })
  .select('id')
  .single();
navigate(`/fan?tab=messages&conv=${data.id}`);
```

---

### 6.6 Chat Settings dans `Profile.tsx` (MODIFICATION)

Ajouter une section "Chat" dans la page Settings (`/app/settings`).

**Onglet "Chat"** (`activeSection === 'chat'`) :

**Bloc 1 — Mode de gestion** :
```
○ Je gère moi-même mes conversations
● Laisser une équipe de chatters gérer mes conversations
  → [Textarea] Décrivez-vous pour aider les chatters...
  ℹ️ Commission chatting : 25% sur les ventes générées via chat
     (Vous gardez 45%, EXCLU 15%, Stripe ~5%)
```

**Bloc 2 — Activer/Désactiver le chat** :
```
[Toggle] Permettre aux fans d'initier des conversations
```

**Bloc 3 — Mon équipe de chatters** (si mode `team`) :
```
┌─────────────────────────────────────────────────────────┐
│  Chatters actifs (2)              [+ Inviter un chatter] │
├─────────────────────────────────────────────────────────┤
│  [Avatar] alice@agency.com   💬 3 convs   [Gérer ✏️] [✕]│
│  [Avatar] bob@gmail.com      💬 7 convs   [Gérer ✏️] [✕]│
├─────────────────────────────────────────────────────────┤
│  Invitations en attente (1)                              │
│  [Avatar] charlie@x.com      ⏳ Expire dans 5j     [✕]  │
└─────────────────────────────────────────────────────────┘
```

Données via RPC `get_profile_chatters(profile_id)`.

**Modal d'invitation** :
```
Email : [____________________]
Permissions :
  ☑ Envoyer du contenu payant
  ☑ Envoyer des liens de tip
  ☐ Messages de masse
  ☑ Tagger les fans
[Envoyer l'invitation]
```

→ appel edge function `send-chatter-invitation`

---

## 7. Composants Réutilisables — Spec

### 7.1 `ConversationListItem`
Props : `conversation`, `isSelected`, `onClick`  
Affiche : avatar fan, nom, preview (tronqué 60 chars), timestamp relatif, badge unread (rouge si non lu), indicateur online (vert si présent), icône épingle si pinned.

### 7.2 `ChatWindow`
Props : `conversationId`, `profileId`, `senderType` (`creator` | `chatter`), `permissions`  
- Charge les messages : `messages` filtrés par `conversation_id`, triés ASC, pagination inverse (load more en scrollant vers le haut)
- Marque les messages comme lus au montage et quand ils arrivent via Realtime
- Realtime subscription sur `messages:{conversation_id}`

### 7.3 `MessageBubble`
Props : `message`, `isOwn`  
Rendu selon `content_type` :
- `text` → bubble classique
- `paid_content` → carte avec titre, prix, bouton "Acheter $X" → ouvre Stripe Checkout
- `tip_link` → carte "Envoyer un pourboire" → redirect vers page tip
- `wishlist_link` → carte item wishlist → redirect vers checkout cadeau
- `image` → miniature image (via Storage signed URL)
- `system` → message centré en italique (ex: "Conversation transférée")

### 7.4 `RichMessageComposer`
Props : `conversationId`, `profileId`, `senderType`, `permissions`  
- Input texte multiline (Enter = envoi, Shift+Enter = nouvelle ligne)
- Barre d'actions : 📷 Contenu payant | 💰 Tip link | 🎁 Wishlist | 📎 Image
- Chaque bouton ouvre un picker selon le type
- Vérification des permissions avant d'afficher les boutons
- Submit : INSERT message avec le bon `content_type` et références

### 7.5 `FanProfileSidebar`
Props : `fanId`, `profileId`  
Sections :
1. **Identité** : avatar (depuis `profiles`), nom, date d'inscription
2. **Tags** : chips éditables (ajout/suppression), preset tags + custom
3. **Stats** : total dépensé, nb achats, 1ère interaction, dernière activité
4. **Historique** : liste tips + achats contenu + cadeaux (depuis tables `tips`, `gift_purchases`, `purchases`)
5. **Actions rapides** : "Envoyer contenu payant", "Envoyer tip link"

### 7.6 `ClaimQueueCard`
Props : `conversation`, `onClaim`  
Affiche : profil (@girl1), nom fan, preview 1er message, délai depuis le message, bouton "Prendre en charge".  
État loading pendant le claim. Gère l'exception `conversation_already_claimed` avec toast.

### 7.7 `MassBroadcastModal`
Props : `profileId`, `permissions`, `onClose`  
Champs :
- Destinataires : Tous | Par tag | Actifs dans les N derniers jours
- Message texte
- Option contenu payant (avec prix)
- Prévisualisation count avant envoi
- Bouton "Envoyer à N fans" → appel edge function `send-mass-message`

### 7.8 `InviteChatterModal`
Props : `profileId`, `onSuccess`, `onClose`  
Formulaire + appel edge function `send-chatter-invitation`.

### 7.9 `UnreadChatBadge`
Composant inline dans `AppShell` nav item "Chat".  
Consomme `ChatContext.unreadCount`. Affiche un point rouge si > 0.

---

## 8. Hooks à Créer

### 8.1 `useConversations(profileId, filter)`
- Charge la liste initiale
- S'abonne aux changements Realtime
- Expose : `conversations`, `isLoading`, `refetch`
- Gère l'update optimiste lors du claim

### 8.2 `useMessages(conversationId)`
- Charge les messages (paginated)
- S'abonne aux INSERTs Realtime
- Marque automatiquement lu à la lecture
- Expose : `messages`, `isLoading`, `sendMessage`, `loadMore`

### 8.3 `useChatUnreadCount()`
- Compte les conversations non lues pour le créateur courant
- Mise à jour Realtime
- Utilisé par `ChatContext`

---

## 9. ChatContext — Contexte Global

Fichier : `src/contexts/ChatContext.tsx`

```typescript
interface ChatContextValue {
  unreadCount: number;        // Conversations non lues (badge nav)
  isChatter: boolean;         // User est un chatter (a des invitations acceptées)
  chatterProfiles: ChatterProfile[]; // Profils accessibles si chatter
  refreshUnread: () => void;
}
```

- Initialisé au montage dans `App.tsx` (wrappé dans `ChatProvider`)
- `isChatter` déterminé par `get_chatter_profiles()` → si retourne des lignes, user est chatter

---

## 10. Routing — Modifications App.tsx

```typescript
// Modifier la route /app/chat existante :
<Route path="/app/chat" element={<ProtectedRoute><CreatorChat /></ProtectedRoute>} />

// Ajouter :
<Route path="/app/chatter" element={<ChatterRoute><ChatterCenter /></ChatterRoute>} />
<Route path="/chat/accept" element={<AcceptChatterInvitation />} />

// Fan chat (dans FanDashboard, pas de route séparée nécessaire — géré via query params)
```

**Nouveau composant `ChatterRoute`** :  
Garde la route, vérifie que l'user a `isChatter === true` depuis `ChatContext`, sinon redirect `/app`.

---

## 11. Modifications AppShell.tsx

1. **Badge unread** sur l'item "Chat" :
```tsx
{ path: '/app/chat', label: 'Chat', icon: MessageSquare }
// → ajouter badge rouge si unreadCount > 0
```

2. **Accès chatter** : Si `isChatter === true`, ajouter item "Chatter" dans la nav pointant vers `/app/chatter` (ou modifier l'item Chat pour pointer vers `/app/chatter` quand l'user est chatter et pas créateur).

---

## 12. Onboarding des Chatters — Flow Complet

```
1. CRÉATEUR active mode "Équipe" dans Settings > Chat
2. CRÉATEUR entre l'email du chatter + permissions → clic "Envoyer l'invitation"
3. Edge function send-chatter-invitation :
   a. INSERT chatter_invitations → génère token + expires_at (7j)
   b. Email Brevo envoyé au chatter avec lien accept
4. CHATTER reçoit l'email, clique le lien → /chat/accept?token=xxx
5. Si pas de compte → formulaire signup (email pré-rempli)
6. Après auth → RPC accept_chatter_invitation(token)
7. chatter_invitations.status → 'accepted', chatter_id renseigné
8. agency_members upsert (compatibilité)
9. Redirect vers /app/chatter (nouvelle interface chatter)
10. CRÉATEUR voit le chatter comme "actif" dans ses settings
11. CRÉATEUR peut à tout moment :
    - Modifier les permissions → UPDATE chatter_invitations.permissions
    - Révoquer → revoke_chatter_access(chatter_id, profile_id)
```

---

## 13. Modifications de `CreatorPublic.tsx`

Section à ajouter dans l'en-tête de la page publique :

```tsx
{chatEnabled && (
  <Button variant="outline" onClick={handleStartChat}>
    <MessageSquare className="w-4 h-4 mr-2" />
    Message
  </Button>
)}
```

`handleStartChat` :
- Fan loggué : UPSERT conversation → navigate `/fan?tab=messages&conv=...`
- Fan non loggué : navigate `/fan/signup?creator=${handle}&action=chat`

Après signup, `AuthCallback` (ou `FanSignup`) doit déclencher la création de conversation automatiquement si `action=chat`.

---

## 14. Intégrations Existantes à Préserver

| Feature existante | Impact chat |
|-------------------|-------------|
| Stripe Connect | Adapter pour split 3 parties si chatter a stripe_account_id |
| Profile multi-profils | Chat filtré par `profile_id`, cohérent avec toute la plateforme |
| `agency_members` (ancien) | Adapté via migration 077 pour compatibility |
| Fan signup | Ajouter `action=chat` dans le flow redirect |
| AppShell nav | Badge unread + accès chatter si applicable |
| FanDashboard | Nouvel onglet "Messages" |
| ProfileContext | Inchangé |
| RLS existantes | Aucun changement, les nouvelles tables ont leur propre RLS |

---

## 15. Ordre d'Implémentation (Phases)

### Phase 1 — DB & Infrastructure (prérequis absolus)
1. Pousser migrations 073-076 en prod : `supabase db push`
2. Vérifier migration en prod avec `supabase db diff`
3. Créer et pousser migration 077 (fix `agency_members`)
4. Créer et pousser migration 078 (`mass_messages`)
5. Configurer pg_cron pour `auto_archive_inactive_conversations`
6. Déployer edge function `send-chatter-invitation`

### Phase 2 — Chat Créateur (mode solo, fondation)
1. Créer `ChatContext` + `useChatUnreadCount`
2. Créer composants : `ConversationListItem`, `ChatWindow`, `MessageBubble` (text only), `RichMessageComposer` (text only)
3. Créer `CreatorChat.tsx` (mode solo : créateur répond lui-même)
4. Modifier route `/app/chat` dans `App.tsx`
5. Ajouter badge unread dans `AppShell`
6. Realtime subscriptions pour conversations + messages

### Phase 3 — Fan Side
1. Ajouter bouton "Message" dans `CreatorPublic.tsx`
2. Ajouter onglet "Messages" dans `FanDashboard.tsx`
3. Composant vue conversation fan (simple, text only)
4. Gérer le flow `action=chat` dans `FanSignup.tsx` / `AuthCallback.tsx`
5. Realtime pour le fan

### Phase 4 — Chat Settings Créateur + Invitation Chatter
1. Ajouter section "Chat" dans `Profile.tsx`
2. `InviteChatterModal` + `ChatterManagementRow`
3. Edge function `send-chatter-invitation` (Brevo)
4. Page `AcceptChatterInvitation.tsx`
5. Route `/chat/accept` dans `App.tsx`
6. `ChatterRoute` guard

### Phase 5 — Interface Chatter
1. `ChatterCenter.tsx` (layout complet)
2. `ClaimQueueCard` + intégration RPC `claim_conversation`
3. `RichMessageComposer` étendu (contenu payant, tip links, wishlist)
4. `FanProfileSidebar` avec stats et tags
5. `ChatContext.isChatter` + accès chatter dans nav AppShell
6. Gestion multi-profils dans sidebar chatter

### Phase 6 — Features Avancées
1. `FanTagBadge` + gestion des tags
2. `MassBroadcastModal` + edge function `send-mass-message`
3. Revenue split chat dans `stripe-webhook`
4. Images dans les messages (via Supabase Storage)
5. Message de masse avec contenu payant
6. Pin/Unpin/Archive/Transfer conversations

---

## 16. Structure de Fichiers Finale

```
src/
├── pages/
│   ├── CreatorChat.tsx                  ← NEW (Phase 2)
│   ├── ChatterCenter.tsx                ← NEW (Phase 5)
│   ├── AcceptChatterInvitation.tsx      ← NEW (Phase 4)
│   ├── FanDashboard.tsx                 ← MODIFIED (Phase 3)
│   ├── Profile.tsx                      ← MODIFIED (Phase 4)
│   ├── CreatorPublic.tsx                ← MODIFIED (Phase 3)
│   └── App.tsx                          ← MODIFIED (Phase 2)
│
├── components/
│   ├── chat/
│   │   ├── ConversationList.tsx         ← NEW (Phase 2)
│   │   ├── ConversationListItem.tsx     ← NEW (Phase 2)
│   │   ├── ChatWindow.tsx               ← NEW (Phase 2)
│   │   ├── MessageBubble.tsx            ← NEW (Phase 2)
│   │   ├── RichMessageComposer.tsx      ← NEW (Phase 2, étendu Phase 5)
│   │   ├── FanProfileSidebar.tsx        ← NEW (Phase 5)
│   │   ├── FanTagBadge.tsx              ← NEW (Phase 6)
│   │   ├── ClaimQueueCard.tsx           ← NEW (Phase 5)
│   │   ├── MassBroadcastModal.tsx       ← NEW (Phase 6)
│   │   └── InviteChatterModal.tsx       ← NEW (Phase 4)
│   ├── AppShell.tsx                     ← MODIFIED (badge unread + chatter nav)
│   └── ChatterRoute.tsx                 ← NEW (Phase 4)
│
├── hooks/
│   ├── useConversations.ts              ← NEW (Phase 2)
│   ├── useMessages.ts                   ← NEW (Phase 2)
│   └── useChatUnreadCount.ts            ← NEW (Phase 2)
│
└── contexts/
    └── ChatContext.tsx                  ← NEW (Phase 2)

supabase/
├── migrations/
│   ├── 077_fix_agency_members_for_chatters.sql  ← NEW (Phase 1)
│   └── 078_mass_messages_table.sql              ← NEW (Phase 1)
│
└── functions/
    ├── send-chatter-invitation/                 ← NEW (Phase 1)
    └── send-mass-message/                       ← NEW (Phase 6)
```

---

## 17. Questions / Décisions Restantes

| # | Question | Recommandation |
|---|----------|---------------|
| 1 | Le chatter doit-il avoir son propre compte Stripe Connect pour recevoir sa part ? | Oui obligatoire pour le split. Si pas de compte → sa part reste chez le créateur en attendant (à documenter dans l'UI) |
| 2 | Mode "solo" : le créateur reçoit-il des notifications push sur mobile ? | OUI — via Supabase Realtime + optionnellement Web Push (Phase suivante) |
| 3 | Peut-on avoir des chatters sur un compte Free ? | NON — mode team = Premium only. Valider dans `send-chatter-invitation` |
| 4 | Le fan voit-il si c'est un chatter ou le vrai créateur qui répond ? | NON — le chatter répond sous l'identité du créateur. Cacher ce détail côté fan. |
| 5 | Limite max de chatters par profil ? | Suggéré : 10 chatters actifs par profil (à définir avec le client) |
| 6 | Les conversations archivées sont-elles exportables ? | Oui — feature Phase 6+, export CSV via edge function admin |

---

*Document vivant — à mettre à jour au fil de l'implémentation*
