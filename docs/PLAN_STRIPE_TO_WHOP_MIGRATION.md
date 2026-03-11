# Plan de Migration : Stripe → Whop.com

> **Statut** : Plan validé — prêt pour implémentation.
> **Date** : Mars 2025

---

## 1. Résumé exécutif

### Changement fondamental

| Aspect | Avant (Stripe) | Après (Whop) |
|---|---|---|
| **Modèle** | Stripe Connect Express (1 compte par créateur) | Whop for Platforms — Connected Accounts (1 sub-company par créateur) |
| **Onboarding créateur** | Stripe Connect obligatoire **avant** de pouvoir vendre | Le créateur peut vendre immédiatement. KYC requis seulement **pour retirer** ses fonds |
| **Collecte paiements** | Stripe Checkout → `transfer_data` vers le compte Connect du créateur | Whop Checkout → paiement sur le connected account du créateur, `application_fee_amount` pour Exclu |
| **Reversement créateur** | Automatique via Stripe Connect | Automatique via Whop Ledger (solde sur le connected account) |
| **Retrait créateur** | Automatique par Stripe (payouts) | Via Whop Payouts Portal (KYC requis) — toutes les méthodes disponibles |
| **Abonnement Premium** | Stripe Checkout + Customer Portal ($39/mo) | Whop Plan récurrent ($39/mo) sur le compte Exclu principal |
| **Webhooks** | `checkout.session.completed`, `account.updated`, etc. | `payment.succeeded`, `payment.failed`, `membership.activated`, `membership.deactivated`, `verification.succeeded` |
| **Environnement test** | Clés Stripe test sur localhost | Clé Whop test sur localhost:8080, clé live sur exclu.at |

### Principe directeur

Exclu fonctionne comme une **plateforme Whop** (Whop for Platforms). Chaque créateur possède un **connected account** (sub-company) sous le compte principal Exclu. Les paiements des fans transitent par le connected account du créateur, et Exclu prélève sa commission via `application_fee_amount`. Le créateur peut retirer ses fonds via le Whop Payouts Portal après vérification KYC.

### Commission (inchangée dans la logique)

| Statut créateur | Fan processing fee | Commission Exclu | Créateur reçoit |
|---|---|---|---|
| **Free** | +5% (payé par le fan) | 10% du prix de base | 90% du prix de base |
| **Premium** ($39/mo) | +5% (payé par le fan) | 0% | 100% du prix de base |

---

## 2. Architecture Whop — Connected Accounts

### 2.1 Modèle Whop for Platforms

```
┌─────────────────────────────────────────────────┐
│  Exclu (Platform Company — biz_exclu)           │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Creator A    │  │ Creator B    │  ...        │
│  │ biz_aaa      │  │ biz_bbb      │             │
│  │ (connected)  │  │ (connected)  │             │
│  │              │  │              │             │
│  │ Ledger:      │  │ Ledger:      │             │
│  │  $1,250.00   │  │  $430.00     │             │
│  └──────────────┘  └──────────────┘             │
│                                                 │
│  Produits globaux :                             │
│  - Exclu Premium ($39/mo) — sur biz_exclu       │
│                                                 │
│  Produits par créateur (dynamiques) :           │
│  - Link Purchase — sur biz_aaa/biz_bbb         │
│  - Tip — sur biz_aaa/biz_bbb                   │
│  - Gift — sur biz_aaa/biz_bbb                  │
│  - Custom Request — sur biz_aaa/biz_bbb        │
└─────────────────────────────────────────────────┘
```

### 2.2 Création d'un Connected Account (remplace Stripe Connect Onboard)

Quand un créateur s'inscrit sur Exclu :

```
POST https://api.whop.com/api/v1/companies
Authorization: Bearer WHOP_API_KEY
{
  "title": "Exclu — @username",
  "parent_company_id": "biz_exclu_platform_id",
  "email": "creator@email.com",
  "send_customer_emails": false,
  "metadata": {
    "supabase_user_id": "uuid-xxx",
    "exclu_username": "username"
  }
}
→ Retourne { id: "biz_creatorxxx", ... }
→ Stocker biz_creatorxxx dans profiles.whop_company_id
```

Le créateur **peut vendre immédiatement** après cette étape. L'argent s'accumule dans son Whop Ledger.

### 2.3 KYC / Vérification (remplace Stripe Connect Validation)

Le KYC est **requis uniquement pour retirer** les fonds, pas pour vendre. Whop gère le KYC selon les réglementations du pays du créateur.

```
POST https://api.whop.com/api/v1/account_links
Authorization: Bearer WHOP_API_KEY
{
  "company_id": "biz_creatorxxx",
  "use_case": "account_onboarding",
  "refresh_url": "https://exclu.at/app/profile?kyc=refresh",
  "return_url": "https://exclu.at/app/profile?kyc=complete"
}
→ Retourne { url: "https://whop.com/payouts/biz_xxx/verify", expires_at: "..." }
→ Rediriger le créateur vers cette URL
```

**Use cases disponibles** :
- `account_onboarding` — flux KYC complet (vérification d'identité, infos bancaires, etc.)
- `payouts_portal` — accès au portail de retrait (gérer ses méthodes de paiement et voir ses retraits)

**Webhook** : `verification.succeeded` → mettre à jour `profiles.whop_kyc_status = 'verified'`

### 2.4 Portail de retrait (automatique via Whop)

```
POST https://api.whop.com/api/v1/account_links
{
  "company_id": "biz_creatorxxx",
  "use_case": "payouts_portal",
  "refresh_url": "https://exclu.at/app/profile?payouts=refresh",
  "return_url": "https://exclu.at/app/profile?payouts=done"
}
→ Retourne l'URL du portail Whop Payouts
→ Le créateur gère ses retraits directement sur Whop
```

Toutes les méthodes de paiement supportées par Whop sont disponibles (virements bancaires, PayPal, etc. selon le pays). Montant minimum de retrait : **$50**.

---

## 3. Flux de paiement détaillés

### 3.1 Achat de lien (remplace `create-link-checkout-session`)

```
Fan clique "Buy" → Edge Function `create-link-checkout`
  1. Valide le lien, le créateur, le prix
  2. Récupère le whop_company_id du créateur et son statut premium
  3. Calcule les frais :
     - Prix de base : price_cents (ex: 1000 = $10)
     - Fan processing fee : +5% → 50 cents
     - Total fan paie : $10.50
     - Commission Exclu (application_fee) :
       - Premium : $0
       - Free : 10% de $10 = $1.00
  4. Crée un Checkout Configuration via Whop API :
     POST /checkout_configurations
     {
       plan: {
         company_id: "biz_creatorxxx",
         product_id: "prod_xxx",
         plan_type: "one_time",
         initial_price: 10.50,
         currency: "eur",
         description: "Exclusive content by @creator",
         visibility: "hidden"
       },
       application_fee_amount: 1.00,   // 0 si premium
       mode: "payment",
       redirect_url: "https://exclu.at/purchase-success?session={CHECKOUT_ID}&link_id={id}",
       metadata: {
         type: "link_purchase",
         link_id: "xxx",
         creator_id: "uuid-xxx",
         fan_id: "uuid-xxx",
         amount_base_cents: "1000",
         fan_fee_cents: "50",
         platform_fee_cents: "100",
         creator_net_cents: "900"
       }
     }
  5. Retourne l'URL de checkout Whop au frontend
  6. Fan paie → webhook payment.succeeded → traitement
```

### 3.2 Tip (remplace `create-tip-checkout`)

Même flux. metadata `type: "tip"`. Le produit est créé sur le connected account du créateur.

### 3.3 Gift wishlist (remplace `create-gift-checkout`)

Même flux. metadata `type: "gift"`. Inclut `wishlist_item_id` et `gift_message` dans metadata.

### 3.4 Custom Request (remplace `create-request-checkout`)

**Changement important** : Stripe utilisait `capture_method: 'manual'`. Whop ne supporte pas ce mode.

**Solution** : Charger immédiatement. Si le créateur refuse → **refund via Whop** (`POST /refunds`).

```
Fan soumet une request → Edge Function `create-request-checkout`
  1. Valide le créateur, les settings custom_requests
  2. Crée le record custom_requests (status: 'pending_payment')
  3. Crée un Checkout Configuration Whop (one_time, montant total)
     avec application_fee_amount pour la commission Exclu
  4. Fan paie → webhook payment.succeeded :
     - Met à jour custom_requests.status = 'pending'
     - L'argent est sur le Whop Ledger du créateur, refund possible
  5. Créateur accepte (manage-request action=capture) :
     - Met à jour custom_requests.status = 'delivered'
     - (L'argent est déjà sur le ledger, rien à faire côté paiement)
  6. Créateur refuse (manage-request action=cancel) :
     - POST /refunds → rembourse le fan
     - Met à jour custom_requests.status = 'refused'
```

### 3.5 Abonnement Premium créateur (remplace `create-creator-subscription`)

L'abonnement Premium est géré sur le **compte principal Exclu** (pas un connected account) :

```
Créateur clique "Go Premium" → Edge Function `create-creator-subscription`
  1. Vérifie le profil
  2. Crée un Checkout Configuration sur le compte principal Exclu :
     POST /checkout_configurations
     {
       plan_id: WHOP_PREMIUM_PLAN_ID,
       mode: "payment",
       redirect_url: "https://exclu.at/app?subscription=success",
       metadata: {
         type: "creator_subscription",
         supabase_user_id: "uuid-xxx"
       }
     }
  3. Retourne l'URL de checkout
  4. Webhooks :
     - membership.activated → is_creator_subscribed = true
     - membership.deactivated → is_creator_subscribed = false
     - payment.succeeded (renewal) → confirme le renouvellement
```

---

## 4. Environnement Test / Live

### 4.1 Détection de l'environnement

```typescript
function isTestMode(req: Request): boolean {
  const origin = req.headers.get('origin') || '';
  return origin.includes('localhost') || origin.includes('127.0.0.1');
}
```

### 4.2 Variables d'environnement

**Supabase Secrets (production — exclu.at)** :
```
WHOP_API_KEY=apik_pYNV...              # Clé live (ne JAMAIS hardcoder)
WHOP_COMPANY_ID=biz_xxxxxxxxxxxxx      # Company ID Exclu principale
WHOP_PREMIUM_PLAN_ID=plan_xxxxx        # Plan $39/mo pré-créé
WHOP_WEBHOOK_SECRET=whsec_xxx          # Secret webhook
WHOP_APP_ID=app_BXCzu3GODN8aHX
```

**Supabase Secrets (test — localhost:8080)** :
```
WHOP_API_KEY_TEST=apik_975T...         # Clé test (ne JAMAIS hardcoder)
WHOP_COMPANY_ID_TEST=biz_xxx           # Company ID Exclu test
WHOP_PREMIUM_PLAN_ID_TEST=plan_xxx     # Plan test
WHOP_APP_ID_TEST=app_BXCzu3GODN8aHX
```

**Frontend `.env.local`** (gitignored) :
```
VITE_WHOP_APP_ID=app_BXCzu3GODN8aHX
```

### 4.3 Logique de sélection dans les Edge Functions

```typescript
const isTest = isTestMode(req);
const whopApiKey = isTest
  ? Deno.env.get('WHOP_API_KEY_TEST')!
  : Deno.env.get('WHOP_API_KEY')!;
const whopCompanyId = isTest
  ? Deno.env.get('WHOP_COMPANY_ID_TEST')!
  : Deno.env.get('WHOP_COMPANY_ID')!;
```

Garantit que :
- **localhost:8080** → clés test, paiements test, connected accounts test
- **exclu.at** → clés live, vrais paiements

---

## 5. Inventaire Stripe existant & Impact migration

### 5.1 Edge Functions

| Fonction | Rôle Stripe | Impact |
|---|---|---|
| `stripe-connect-onboard` | Crée compte Express + lien onboarding | **REMPLACER** → `whop-create-connected-account` + `whop-create-account-link` |
| `stripe-connect-status` | Vérifie statut compte Connect | **REMPLACER** → `GET /companies/{id}` |
| `stripe-webhook` | Gère tous les événements Stripe | **REMPLACER** → `whop-webhook` |
| `create-link-checkout-session` | Stripe Checkout pour achat de lien | **RÉÉCRIRE** → Whop Checkout Configuration |
| `create-tip-checkout` | Stripe Checkout pour tip | **RÉÉCRIRE** → Whop |
| `create-gift-checkout` | Stripe Checkout pour gift | **RÉÉCRIRE** → Whop |
| `create-request-checkout` | Stripe Checkout (manual capture) | **RÉÉCRIRE** → Whop (charge immédiate + refund) |
| `create-creator-subscription` | Stripe Checkout pour abo $39/mo | **RÉÉCRIRE** → Whop Plan |
| `verify-checkout-session` | Vérifie session Stripe (fallback) | **RÉÉCRIRE** → Whop Payment API |
| `manage-request` | Capture/annule PaymentIntent | **ADAPTER** → Whop Refund API |

### 5.2 Pages Frontend

| Page | Usage Stripe | Impact |
|---|---|---|
| `Onboarding.tsx` | Étape "Connect Stripe" | **REMPLACER** → création auto du connected account Whop |
| `StripeValidation.tsx` | Polling statut Connect | **SUPPRIMER** |
| `Profile.tsx` | Statut Connect, infos manquantes | **REMPLACER** → statut KYC + lien Payouts Portal |
| `CreateLink.tsx` | Bloque si Stripe non connecté | **RETIRER** le blocage |
| `CreatorLinks.tsx` | Prompt Stripe Connect | **RETIRER** le blocage |
| `LinkInBioEditor.tsx` | Vérifie statut Stripe | **RETIRER** la vérification |
| `AppDashboard.tsx` | Revenus + statut Stripe | **ADAPTER** → solde Whop Ledger |
| `CreatorPublic.tsx` | Appels checkout Stripe | **ADAPTER** → Whop checkout |
| `App.tsx` | Route `/stripe-validation` | **SUPPRIMER** la route |
| `FAQSection.tsx` | Mentions Stripe | **METTRE À JOUR** |

### 5.3 Colonnes DB à migrer

**Règle** : aucune colonne ne doit mentionner "stripe". Utiliser `whop_*` ou `payment_provider_*`.

**Table `profiles`** :

| Ancienne | Nouvelle | Description |
|---|---|---|
| `stripe_account_id` | `whop_company_id` | ID connected account (biz_xxx) |
| `stripe_connect_status` | `whop_account_status` | 'pending' / 'active' / 'restricted' |
| `stripe_customer_id` | *(supprimer)* | Plus nécessaire |
| `stripe_customer_id_test` | *(supprimer)* | Plus nécessaire |
| `stripe_verified_email_sent_at` | *(supprimer)* | Plus nécessaire |
| *(nouveau)* | `whop_kyc_status` | 'not_started' / 'pending' / 'verified' / 'failed' |
| *(nouveau)* | `whop_membership_id` | ID membership Whop pour abo Premium |

**Tables de transactions** :

| Table | Ancienne | Nouvelle |
|---|---|---|
| `purchases` | `stripe_session_id` | `payment_provider_id` |
| `tips` | `stripe_session_id` | `payment_provider_id` |
| `gift_purchases` | `stripe_session_id` | `payment_provider_id` |
| `custom_requests` | `stripe_session_id` | `payment_provider_id` |
| `custom_requests` | `stripe_payment_intent_id` | `payment_provider_payment_id` |

### 5.4 Variables d'environnement

**Supprimer** :
```
STRIPE_SECRET_KEY / STRIPE_SECRET_KEY_TEST
STRIPE_WEBHOOK_SECRET
STRIPE_CREATOR_PRICE_ID / STRIPE_CREATOR_PRICE_ID_TEST
```

**Ajouter** :
```
WHOP_API_KEY / WHOP_API_KEY_TEST
WHOP_COMPANY_ID / WHOP_COMPANY_ID_TEST
WHOP_PREMIUM_PLAN_ID / WHOP_PREMIUM_PLAN_ID_TEST
WHOP_WEBHOOK_SECRET
WHOP_APP_ID / WHOP_APP_ID_TEST
```

---

## 6. Migration des utilisateurs Premium existants

### Stratégie

1. **Avant la migration** :
```sql
CREATE TABLE premium_migration_backup AS
SELECT id, email, username, stripe_customer_id, is_creator_subscribed, now() as backed_up_at
FROM profiles
WHERE is_creator_subscribed = true;
```

2. **Pendant la migration** : les Premium gardent `is_creator_subscribed = true`.

3. **Après la migration** :
   - Envoyer un email aux Premium pour les inviter à re-souscrire via Whop
   - Offrir 1 mois gratuit (trial) pour compenser la transition
   - Maintenir `is_creator_subscribed = true` pendant la période de grâce (30 jours)
   - Après 30 jours, `is_creator_subscribed = false` pour ceux qui n'ont pas re-souscrit

---

## 7. Conservation des règles de redirection checkout

Toutes les règles existantes **doivent être conservées** à l'identique :

1. **Achat de lien** :
   - Fan connecté → checkout → `/purchase-success?session={id}&link_id={id}`
   - Fan non connecté → saisie email → checkout → même page success
   - Fan guest → création compte Supabase + email bienvenue

2. **Tip** :
   - Connecté ou non → checkout → retour page créateur avec toast success
   - Email optionnel pour les non-connectés

3. **Gift wishlist** :
   - Connecté → checkout → `/gift-success?session={id}`
   - Non connecté → saisie email → même flow

4. **Custom Request** :
   - Connecté → checkout → retour page créateur
   - Non connecté → email obligatoire → création compte fan → checkout → retour

5. **Abonnement Premium** :
   - Toujours connecté (route protégée) → checkout → `/app?subscription=success`

Les `redirect_url` de Whop Checkout reprennent les mêmes URLs que Stripe.

---

## 8. Webhook Whop (remplace `stripe-webhook`)

### 8.1 Configuration via API

```typescript
POST https://api.whop.com/api/v1/webhooks
Authorization: Bearer WHOP_API_KEY
{
  "url": "https://xxx.supabase.co/functions/v1/whop-webhook",
  "events": [
    "payment.succeeded",
    "payment.failed",
    "membership.activated",
    "membership.deactivated",
    "verification.succeeded"
  ]
}
```

### 8.2 Handler

```
whop-webhook Edge Function :
  1. Vérifier la signature HMAC (WHOP_WEBHOOK_SECRET)
  2. Parser le payload, extraire metadata.type
  3. Switch sur event.type :

     "payment.succeeded" :
       - "link_purchase" → créer purchase record, envoyer email accès contenu
       - "tip" → mettre à jour tip status, envoyer email créateur
       - "gift" → mettre à jour gift status, incrémenter gifted_count, email
       - "request" → custom_request status = 'pending'

     "payment.failed" :
       - Logger l'échec

     "membership.activated" :
       - profiles.is_creator_subscribed = true
       - profiles.whop_membership_id = membership.id
       - Tracker referral affiliate (35% commission)

     "membership.deactivated" :
       - profiles.is_creator_subscribed = false
       - profiles.whop_membership_id = null

     "verification.succeeded" :
       - profiles.whop_kyc_status = 'verified'

  4. Retourner 200 OK
```

### 8.3 Idempotence

Utiliser `payment.id` (`pay_xxx`) comme clé. Vérifier si `payment_provider_id` existe déjà avant d'insérer.

---

## 9. Gestion des erreurs

### Retry policy API Whop

```typescript
async function whopFetch(
  path: string,
  options: RequestInit,
  apiKey: string,
  maxRetries = 3
): Promise<Response> {
  const baseUrl = 'https://api.whop.com/api/v1';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '2');
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (response.status >= 500 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
  throw new Error('Whop API: max retries exceeded');
}
```

### Cohérence des données

- Webhook idempotent (vérification `payment_provider_id` unique)
- Fallback `verify-checkout-session` si webhook lent
- Le solde réel est dans le Whop Ledger — pas de cagnotte locale à maintenir

---

## 10. Plan d'implémentation par phases

### Phase 0 : Pré-migration (0.5 jour)

1. Exporter les Premium actuels dans `premium_migration_backup`
2. Créer le Plan Premium $39/mo sur Whop (compte principal Exclu)
3. Configurer les variables d'environnement (test + live) dans Supabase Secrets
4. Créer le webhook via l'API Whop

### Phase 1 : Infrastructure DB & Shared Code (1 jour)

5. Migration DB :
   - Renommer colonnes Stripe → Whop/génériques
   - Ajouter `whop_company_id`, `whop_account_status`, `whop_kyc_status`, `whop_membership_id` sur `profiles`
   - Renommer `stripe_session_id` → `payment_provider_id` sur les tables de transactions
   - Supprimer les colonnes Stripe devenues inutiles
6. Créer `supabase/functions/_shared/whop.ts` :
   - `whopFetch()` — client API avec retry + auth
   - `isTestMode()` — détection env
   - `getWhopConfig()` — retourne clés/IDs selon env
   - `calculateFees()` — calcule 5% fan + 10%/0% commission

### Phase 2 : Connected Account & KYC (1 jour)

7. Créer `whop-create-connected-account` Edge Function :
   - `POST /companies` avec `parent_company_id`
   - Stocker `whop_company_id` dans profiles
8. Créer `whop-account-status` Edge Function :
   - `GET /companies/{id}` pour vérifier le statut
9. Créer `whop-create-account-link` Edge Function :
   - `POST /account_links` (use_case: `account_onboarding` ou `payouts_portal`)

### Phase 3 : Edge Functions — Checkout (2-3 jours)

10. Réécrire `create-link-checkout-session` → Whop Checkout Configuration
11. Réécrire `create-tip-checkout` → Whop
12. Réécrire `create-gift-checkout` → Whop
13. Réécrire `create-request-checkout` → Whop (charge immédiate)
14. Réécrire `create-creator-subscription` → Whop Plan
15. Réécrire `verify-checkout-session` → Whop Payment API

### Phase 4 : Webhook Whop (1-2 jours)

16. Créer `whop-webhook` Edge Function (section 8)
17. Adapter `manage-request` :
    - `capture` → rien (argent déjà sur ledger)
    - `cancel` → `POST /refunds` + update status

### Phase 5 : Frontend (2-3 jours)

18. **Supprimer** `StripeValidation.tsx`
19. **Modifier** `Onboarding.tsx` : création auto du connected account Whop (pas de blocage)
20. **Modifier** `Profile.tsx` : statut KYC + boutons "Vérifier identité" / "Portail paiements"
21. **Modifier** `CreateLink.tsx` : retirer blocage Stripe
22. **Modifier** `CreatorLinks.tsx` : retirer blocage
23. **Modifier** `LinkInBioEditor.tsx` : retirer vérification
24. **Modifier** `AppDashboard.tsx` : solde Whop Ledger
25. **Modifier** `CreatorPublic.tsx` : appels checkout → Whop
26. **Modifier** `App.tsx` : retirer route `/stripe-validation`
27. **Modifier** `FAQSection.tsx` : texte
28. **Conserver** toutes les règles de redirection post-checkout (section 7)

### Phase 6 : Nettoyage & Tests (1-2 jours)

29. Supprimer Edge Functions : `stripe-connect-onboard`, `stripe-connect-status`, `stripe-webhook`
30. Supprimer variables Stripe des secrets Supabase
31. Nettoyer imports Stripe
32. **Tests sur localhost:8080 (mode test)** :
    - Création connected account
    - KYC onboarding link
    - Achat de lien (connecté + non connecté)
    - Tip / Gift / Custom Request (accept + refuse/refund)
    - Abonnement Premium
    - Vérification webhook idempotence
    - Vérification commission : 10% (free) vs 0% (premium)
33. Re-activer les Premium migrés (section 6)

---

## 11. Risques et mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| Pas de `capture_method: manual` | Custom requests chargées immédiatement | Charge + refund si refusé |
| Plans dynamiques nombreux | Potentiel encombrement | Whop réutilise auto les plans identiques |
| KYC peut prendre du temps | Créateur impatient | Peut vendre immédiatement, KYC seulement pour retirer |
| Migration Premium | Perte temporaire abo | Table backup + période grâce 30j + 1 mois offert |
| Webhook manqué | Paiement non enregistré | Fallback verify-checkout + reconciliation |
| Renommage colonnes DB | Risque de casser les queries | Migration progressive : ajouter puis nettoyer |

---

## 12. Estimation totale

| Phase | Durée |
|---|---|
| Phase 0 : Pré-migration | 0.5 jour |
| Phase 1 : Infrastructure DB & Shared | 1 jour |
| Phase 2 : Connected Account & KYC | 1 jour |
| Phase 3 : Edge Functions Checkout | 2-3 jours |
| Phase 4 : Webhook Whop | 1-2 jours |
| Phase 5 : Frontend | 2-3 jours |
| Phase 6 : Nettoyage & Tests | 1-2 jours |
| **Total** | **8-12 jours** |

---

## 13. Checklist fichiers impactés

### Edge Functions à CRÉER
- [ ] `supabase/functions/_shared/whop.ts`
- [ ] `supabase/functions/whop-webhook/index.ts`
- [ ] `supabase/functions/whop-create-connected-account/index.ts`
- [ ] `supabase/functions/whop-create-account-link/index.ts`
- [ ] `supabase/functions/whop-account-status/index.ts`

### Edge Functions à RÉÉCRIRE
- [ ] `create-link-checkout-session` → Whop
- [ ] `create-tip-checkout` → Whop
- [ ] `create-gift-checkout` → Whop
- [ ] `create-request-checkout` → Whop
- [ ] `create-creator-subscription` → Whop
- [ ] `verify-checkout-session` → Whop
- [ ] `manage-request` → Whop Refund

### Edge Functions à SUPPRIMER
- [ ] `stripe-connect-onboard`
- [ ] `stripe-connect-status`
- [ ] `stripe-webhook`

### Pages Frontend à MODIFIER
- [ ] `Onboarding.tsx`
- [ ] `Profile.tsx`
- [ ] `CreateLink.tsx`
- [ ] `CreatorLinks.tsx`
- [ ] `LinkInBioEditor.tsx`
- [ ] `AppDashboard.tsx`
- [ ] `CreatorPublic.tsx`
- [ ] `App.tsx`
- [ ] `FAQSection.tsx`

### Pages Frontend à SUPPRIMER
- [ ] `StripeValidation.tsx`

### Migrations DB
- [ ] Renommer colonnes Stripe → Whop sur `profiles`
- [ ] Ajouter `whop_company_id`, `whop_account_status`, `whop_kyc_status`, `whop_membership_id`
- [ ] Renommer `stripe_session_id` → `payment_provider_id` (toutes tables transactions)
- [ ] Renommer `stripe_payment_intent_id` → `payment_provider_payment_id`
- [ ] Backup `premium_migration_backup`
- [ ] Supprimer colonnes Stripe obsolètes
