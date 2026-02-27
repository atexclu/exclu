# Plan de Développement — Section 10: Custom Requests & Tips

> Document de spécification technique pour l'implémentation de la feature "Custom Requests & Tips" du Cahier des Charges V2.

---

## Contexte & Analyse de l'existant

### Ce qui existe déjà en DB

| Élément | État | Notes |
|---------|------|-------|
| `user_role` ENUM | ✅ Existe | Valeurs: `fan`, `creator`, `agency`, `chatter`, `affiliate`, `admin` |
| `profiles.role` | ✅ Existe | `DEFAULT 'fan'`, `NOT NULL` |
| `user_has_role()` | ✅ Existe | Vérifie rôle dans `profiles` + `user_roles` |
| Table `tips` | ❌ N'existe pas | À créer |
| Table `custom_requests` | ❌ N'existe pas | À créer |
| Table `fan_favorites` | ❌ N'existe pas | À créer |

### Problèmes identifiés

1. **`handle_new_user()` force `is_creator = true`** pour tout nouvel utilisateur → un fan sera traité comme un créateur
2. **`ProtectedRoute`** redirige vers `/onboarding` (créateur) si `handle`, `avatar_url`, ou `social_links` manquent → bloque les fans
3. **`Auth.tsx`** demande un username `exclu.at/` à l'inscription → orientation créateur uniquement
4. **Pas de flux d'inscription fan** séparé
5. **Pas de dashboard fan** existant

---

## Architecture cible

```
Fan Flow:
  Profil créateur public (/:handle)
    └─ CTA "Send a Tip" / "Custom Request"
        └─ Si non connecté → /fan/signup?creator={handle}
        └─ Si connecté (fan) → Modal tip / formulaire request
  
  Dashboard Fan (/fan):
    ├─ Mes créateurs favoris
    ├─ Historique tips envoyés
    ├─ Mes demandes custom (statuts)
    └─ Paramètres compte (supprimer)

Creator Flow:
  Dashboard créateur (/app):
    └─ Nouvelle section "Requests & Tips"
        ├─ Tips reçus (liste)
        ├─ Demandes custom (accept/refuse/respond)
        └─ Statistiques tips
```

---

## PHASE 1 — Base de données

### Migration 049: Adapter `handle_new_user()` pour supporter les fans

Le trigger actuel :
```sql
INSERT INTO public.profiles (id, display_name, is_creator)
VALUES (NEW.id, ..., true)
```

Doit devenir :
```sql
INSERT INTO public.profiles (id, display_name, is_creator, role)
VALUES (
  NEW.id,
  COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
  COALESCE((NEW.raw_user_meta_data->>'is_creator')::boolean, true),
  CASE 
    WHEN (NEW.raw_user_meta_data->>'is_creator')::boolean = false THEN 'fan'::user_role
    ELSE 'creator'::user_role
  END
)
```

**Logique** : À l'inscription fan, on passe `is_creator: false` dans `raw_user_meta_data` via `supabase.auth.signUp({ options: { data: { is_creator: false } } })`.

### Migration 050: Table `fan_favorites`

```sql
CREATE TABLE fan_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_fan_creator UNIQUE (fan_id, creator_id)
);
```

- **RLS** : fan peut lire/écrire ses propres favoris
- **Index** : `fan_id`, `creator_id`

### Migration 051: Table `tips`

```sql
CREATE TABLE tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Parties
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Paiement
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100),
  currency TEXT NOT NULL DEFAULT 'USD',
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  
  -- Contenu
  message TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  
  -- Statut
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  
  -- Commission
  platform_fee_cents INTEGER DEFAULT 0,
  creator_net_cents INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  
  -- Lecture créateur
  read_at TIMESTAMPTZ
);
```

- **RLS** : fan lit ses propres tips, créateur lit les tips reçus
- **Index** : `fan_id`, `creator_id`, `status`, `created_at DESC`

### Migration 052: Table `custom_requests`

```sql
CREATE TABLE custom_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Parties
  fan_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Demande
  description TEXT NOT NULL,
  proposed_amount_cents INTEGER NOT NULL CHECK (proposed_amount_cents >= 2000),
  final_amount_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Réponse créateur
  creator_response TEXT,
  
  -- Paiement (après acceptation)
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  
  -- Commission
  platform_fee_cents INTEGER DEFAULT 0,
  creator_net_cents INTEGER DEFAULT 0,
  
  -- Livraison
  delivery_link_id UUID REFERENCES links(id),
  delivered_at TIMESTAMPTZ,
  
  -- Statut workflow
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',      -- Fan a soumis, créateur n'a pas répondu
      'accepted',     -- Créateur a accepté, en attente de paiement
      'paid',         -- Fan a payé
      'in_progress',  -- Créateur prépare le contenu
      'delivered',    -- Contenu livré
      'completed',    -- Fan a confirmé réception (ou auto-complete après 7j)
      'refused',      -- Créateur a refusé
      'expired',      -- Auto-refus après 7 jours
      'cancelled'     -- Fan a annulé avant paiement
    )),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),
  
  -- Lecture créateur
  read_at TIMESTAMPTZ
);
```

- **RLS** : fan lit ses propres demandes, créateur lit les demandes reçues
- **Index** : `fan_id`, `creator_id`, `status`, `expires_at`, `created_at DESC`

### Migration 053: Activer les features tips sur le profil créateur

```sql
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS tips_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_requests_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_tip_amount_cents INTEGER DEFAULT 500,
  ADD COLUMN IF NOT EXISTS min_custom_request_cents INTEGER DEFAULT 2000;
```

---

## PHASE 2 — Inscription Fan

### 2.1 Page `/fan/signup`

**Route** : `/fan/signup?creator={handle}`

**Flux** :
1. Fan arrive depuis le profil créateur (CTA tip/request)
2. Page d'inscription légère : email + password (pas de username)
3. Passe `is_creator: false` dans les metadata Supabase Auth
4. Email de confirmation avec template fan spécifique
5. Après confirmation → redirection vers `/fan?creator={handle}`

**Différences avec Auth.tsx créateur** :
- Pas de champ username (les fans n'ont pas de page publique)
- Pas d'onboarding créateur
- UI adaptée : messaging orienté "Rejoignez {creator_name} sur Exclu"
- Query param `creator` pour auto-follow après inscription

### 2.2 Email de confirmation fan

Template HTML reprenant le design system existant (dark, gradient vert), mais avec contenu adapté :
- "Welcome to Exclu" → "Your Exclu account is ready"
- Contenu orienté fan : "Send tips, request custom content, support your favorite creators"
- Pas de mention des features créateur

### 2.3 Adapter `handle_new_user()` (trigger)

Voir migration 049 ci-dessus. Le trigger regarde `raw_user_meta_data->>'is_creator'` pour déterminer le rôle.

### 2.4 Adapter `ProtectedRoute` / nouveau `FanProtectedRoute`

Créer un composant `FanProtectedRoute` qui :
- Vérifie la session
- Vérifie que `role = 'fan'`
- Ne redirige PAS vers `/onboarding` créateur
- Redirige vers `/fan/signup` si non connecté

---

## PHASE 3 — Dashboard Fan

### 3.1 Routes

| Route | Composant | Description |
|-------|-----------|-------------|
| `/fan` | `FanDashboard` | Page principale avec favoris + activité récente |
| `/fan/settings` | `FanSettings` | Paramètres compte + suppression |
| `/fan/signup` | `FanSignup` | Inscription dédiée fan |
| `/fan/login` | Redirige `/auth?mode=login&type=fan` | Login unifié |

### 3.2 `FanDashboard`

Layout similaire au dashboard créateur (même design system) :

**Section "My Creators"** :
- Grille de cartes avec avatar, nom, badge vérifié
- Boutons rapides : "Send Tip", "Request"
- Lien vers le profil public

**Section "Activity"** :
- Liste chronologique des tips envoyés et demandes
- Statuts colorés pour les custom requests

### 3.3 `FanSettings`

- Modifier email/password
- **Bouton "Delete my account"** (requis par le CDC) :
  - Confirmation modale
  - Appel Edge Function `delete-fan-account` (supprime user + cascade DB)
  - Déconnexion + redirection home

---

## PHASE 4 — Dashboard Créateur : Section "Requests & Tips"

### 4.1 Nouvelle section dans `AppDashboard.tsx`

Ajouter un onglet/section "Requests & Tips" avec :

**Sous-section Tips reçus** :
- Liste des tips avec montant, fan (ou "Anonymous"), message, date
- Badge "New" pour les non-lus
- Bouton "Mark all as read"

**Sous-section Custom Requests** :
- Cartes par demande avec :
  - Avatar fan + nom
  - Description de la demande
  - Montant proposé
  - Statut (badge coloré)
  - Actions : Accept / Refuse / Respond
- Tri par date ou statut

### 4.2 Toggle dans les settings créateur

Dans `Profile.tsx` (settings), ajouter :
- Toggle "Accept tips" (`tips_enabled`)
- Toggle "Accept custom requests" (`custom_requests_enabled`)
- Input "Minimum tip amount" (défaut $5)
- Input "Minimum custom request" (défaut $20)

---

## PHASE 5 — Edge Functions

### 5.1 `create-tip-checkout`

**Input** : `{ creator_id, amount_cents, message?, is_anonymous?, fan_id }`

**Flow** :
1. Vérifie que `tips_enabled = true` sur le profil créateur
2. Vérifie `amount_cents >= min_tip_amount_cents`
3. Crée une entrée `tips` avec `status = 'pending'`
4. Crée une Stripe Checkout Session (paiement vers le Stripe Connect du créateur)
5. Commission EXCLU : 10% free / 0% premium + 5% processing
6. Retourne l'URL Checkout

### 5.2 `handle-tip-webhook` (dans `stripe-webhook` existant)

Ajouter un handler dans le webhook existant pour le cas `checkout.session.completed` avec metadata `type: 'tip'` :
1. Met à jour `tips.status = 'succeeded'`
2. Met à jour `tips.paid_at`, `tips.stripe_payment_intent_id`
3. Calcule et enregistre `platform_fee_cents` et `creator_net_cents`

### 5.3 `respond-custom-request`

**Input** : `{ request_id, action: 'accept' | 'refuse', response?, final_amount_cents? }`

**Flow** :
- `accept` : met à jour `status = 'accepted'`, `accepted_at`, `final_amount_cents`
- `refuse` : met à jour `status = 'refused'`, `creator_response`

### 5.4 `create-request-checkout`

Similaire à `create-tip-checkout` mais pour une custom request acceptée :
1. Vérifie `status = 'accepted'`
2. Crée Stripe Checkout avec `final_amount_cents`
3. Met à jour `status = 'paid'` via webhook

### 5.5 `deliver-custom-request`

**Input** : `{ request_id, link_id }`

Le créateur associe un lien existant (ou en crée un nouveau) comme livraison :
1. Met à jour `delivery_link_id`, `delivered_at`, `status = 'delivered'`
2. Envoie notification/email au fan

### 5.6 `expire-pending-requests` (CRON ou Edge Function)

Job planifié pour auto-expirer les demandes :
```sql
UPDATE custom_requests 
SET status = 'expired' 
WHERE status = 'pending' AND expires_at < now();
```

Options : Supabase pg_cron extension ou Edge Function invoquée par un cron externe.

### 5.7 `delete-fan-account`

**Input** : `{ user_id }` (vérifié via JWT)

1. Vérifie que `role = 'fan'`
2. `DELETE FROM auth.users WHERE id = user_id` (cascade les tables)
3. Confirme la suppression

---

## PHASE 6 — Profil public créateur : Boutons CTA

### 6.1 Modifications de `CreatorPublic.tsx`

Ajouter sous les liens/contenu (et visible uniquement si le créateur a activé) :

**Bouton "Send a Tip"** :
- Style : bouton pill avec gradient du créateur
- Si fan non connecté → redirige `/fan/signup?creator={handle}`
- Si fan connecté → ouvre modal tip

**Bouton "Custom Request"** :
- Style : bouton pill outline
- Même logique de redirection

### 6.2 Modal Tip (fan connecté)

Design cohérent avec PublicLink (Aurora background, glassmorphism) :
- Montants prédéfinis : $5, $10, $25, $50
- Input custom amount
- Textarea message (optionnel)
- Checkbox "Stay anonymous"
- Bouton "Send Tip — ${amount}"

### 6.3 Modal Custom Request (fan connecté)

- Textarea "Describe your request"
- Input montant proposé (min $20)
- Bouton "Send Request"

---

## PHASE 7 — Support Links (Liens de soutien)

### 7.1 Extension du système de liens existant

Les "support links" sont des liens avec `price_cents > 0` mais **sans contenu attaché**. 

Option : ajouter une colonne `is_support_link BOOLEAN DEFAULT false` à `links`, ou utiliser le fait que `storage_path IS NULL AND link_media count = 0`.

### 7.2 UI Créateur

Dans `CreateLink.tsx`, ajouter une option :
- Toggle "This is a support link (no content attached)"
- Génère un lien type `exclu.at/l/{slug}` mais avec UI adaptée (pas de PixelCard, message de remerciement)

### 7.3 UI Publique (support link)

Dans `PublicLink.tsx`, si `is_support_link` :
- Pas de card contenu verrouillé
- Message : "Support {creator_name}"
- Input montant libre (ou fixe)
- Bouton "Support for ${amount}"

---

## PHASE 8 — Tests & Edge Cases

### Cas à couvrir

| Cas | Comportement attendu |
|-----|---------------------|
| Fan non connecté clique "Tip" | Redirige inscription fan avec retour |
| Fan connecté clique "Tip" sur créateur sans tips_enabled | Bouton caché |
| Tip < min_tip_amount_cents | Erreur validation |
| Custom request expire après 7j | Auto-status 'expired' |
| Créateur accepte puis fan ne paie pas | Request reste en 'accepted' (timeout à prévoir) |
| Fan supprime son compte | Cascade: tips restent (fan_id NULL?), ou anonymisés |
| Créateur désactive les tips après avoir reçu | Tips existants restent, nouveaux bloqués |
| Double-paiement Stripe | Idempotency key sur la session |

### Sécurité

- **RLS stricte** sur `tips`, `custom_requests`, `fan_favorites`
- **Validation serveur** de tous les montants (Edge Functions)
- **Rate limiting** sur les demandes custom (1 par créateur par 24h ?)
- **Sanitization** des messages (XSS, longueur max)

---

## Ordre d'exécution recommandé

```
Phase 1 → Phase 2 → Phase 6 → Phase 3 → Phase 5 → Phase 4 → Phase 7 → Phase 8
  DB        Auth      CTA        Fan UI    Backend   Creator   Support   Tests
```

**Justification** : On commence par la DB et l'auth car tout en dépend. Ensuite les CTA sur le profil public (point d'entrée fan), puis le dashboard fan, le backend stripe, et enfin le dashboard créateur.

---

## Estimations

| Phase | Complexité | Estimation |
|-------|-----------|------------|
| Phase 1 (DB) | Moyenne | ~2h |
| Phase 2 (Auth Fan) | Haute | ~4h |
| Phase 3 (Dashboard Fan) | Haute | ~6h |
| Phase 4 (Dashboard Creator) | Haute | ~5h |
| Phase 5 (Edge Functions) | Très haute | ~8h |
| Phase 6 (CTA profil public) | Moyenne | ~3h |
| Phase 7 (Support Links) | Faible | ~2h |
| Phase 8 (Tests) | Moyenne | ~3h |
| **Total** | | **~33h** |

---

## Dépendances externes

- **Stripe Connect** : déjà en place, les tips utilisent le même mécanisme que les achats de liens
- **Supabase Auth** : la metadata `raw_user_meta_data` est le mécanisme clé pour distinguer fan/creator
- **Supabase pg_cron** : à vérifier si disponible, sinon utiliser un cron externe pour expirer les requests
- **Brevo/email** : template fan à configurer dans le dashboard Supabase Auth

