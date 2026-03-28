# Migration Paiements : Stripe → UG Payments QuickPay

> **Date** : 25 mars 2026
> **Statut** : Audit complet + Plan d'implementation

---

## PARTIE 1 — AUDIT COMPLET DES DEPENDANCES STRIPE

### 1.1 Edge Functions (Backend — Supabase)

| # | Fonction | Fichier | Role | APIs Stripe utilisees |
|---|----------|---------|------|----------------------|
| 1 | `create-link-checkout-session` | `supabase/functions/create-link-checkout-session/index.ts` | Checkout pour achat de liens/drops | `stripe.checkout.sessions.create()` avec `transfer_data` (Connect) |
| 2 | `create-tip-checkout` | `supabase/functions/create-tip-checkout/index.ts` | Checkout pour tips | `stripe.checkout.sessions.create()` avec `transfer_data` |
| 3 | `create-gift-checkout` | `supabase/functions/create-gift-checkout/index.ts` | Checkout pour cadeaux wishlist | `stripe.checkout.sessions.create()` avec `transfer_data` |
| 4 | `create-request-checkout` | `supabase/functions/create-request-checkout/index.ts` | Checkout custom requests (capture manuelle) | `stripe.checkout.sessions.create()` avec `capture_method: 'manual'` |
| 5 | `create-creator-subscription` | `supabase/functions/create-creator-subscription/index.ts` | Abonnement Premium createur ($39/mois) | `stripe.checkout.sessions.create({ mode: 'subscription' })`, `stripe.billingPortal.sessions.create()` |
| 6 | `stripe-webhook` | `supabase/functions/stripe-webhook/index.ts` | Handler webhook central | `stripe.webhooks.constructEventAsync()`, traitement de `checkout.session.completed`, `account.updated` |
| 7 | `stripe-connect-onboard` | `supabase/functions/stripe-connect-onboard/index.ts` | Onboarding payout createur | `stripe.accounts.create()`, `stripe.accountLinks.create()` |
| 8 | `stripe-connect-status` | `supabase/functions/stripe-connect-status/index.ts` | Verification statut Connect | `stripe.accounts.retrieve()` |
| 9 | `verify-checkout-session` | `supabase/functions/verify-checkout-session/index.ts` | Verification post-paiement (fallback) | `stripe.checkout.sessions.retrieve()` |
| 10 | `manage-request` | `supabase/functions/manage-request/index.ts` | Capture/annulation custom request | `stripe.paymentIntents.capture()`, `stripe.paymentIntents.cancel()` |
| 11 | `request-affiliate-payout` | `supabase/functions/request-affiliate-payout/index.ts` | Demande retrait affilies | Pas d'API Stripe directe (email admin) |
| 12 | `claim-tip` | `supabase/functions/claim-tip/index.ts` | Reclamation tip anonyme | Pas d'API Stripe directe |

---

### 1.2 Pages Frontend (src/pages/)

| # | Page | Fichier | Dependances paiement |
|---|------|---------|---------------------|
| 1 | **AppDashboard** | `src/pages/AppDashboard.tsx` | Affiche revenue, wallet balance, sales, tips, payouts. Bouton "Connect Stripe" → `stripe-connect-onboard`. Commission 10%/0% |
| 2 | **Profile** | `src/pages/Profile.tsx` | Section "Payment Account" avec statut Stripe Connect. Appel `stripe-connect-status`. Gestion abonnement Premium → `create-creator-subscription`. Hash `#payments` |
| 3 | **CreatorPublic** | `src/pages/CreatorPublic.tsx` | Achat liens payants, tips (presets $5-$50), custom requests. Appels `create-tip-checkout`, `create-request-checkout`. Affichage "5% processing fee" |
| 4 | **PublicLink** | `src/pages/PublicLink.tsx` | Deverrouillage contenu payant. Appels `create-link-checkout-session`, `verify-checkout-session`. Polling verification |
| 5 | **CreatorTipsRequests** | `src/pages/CreatorTipsRequests.tsx` | Gestion tips/requests recu(e)s. Capture paiement via `manage-request` action:'capture'. Release paiement via 'cancel' |
| 6 | **FanDashboard** | `src/pages/FanDashboard.tsx` | Historique achats, tips envoyes, custom requests |
| 7 | **AgencyDashboard** | `src/pages/AgencyDashboard.tsx` | Revenue agrege multi-profils, calcul commission |
| 8 | **ReferralDashboard** | `src/pages/ReferralDashboard.tsx` | Commission referral (% du premium), earnings recurrents |
| 9 | **TipSuccess** | `src/pages/TipSuccess.tsx` | Page succes tip. Montant depuis URL `?amount=`. Claim tip guest → `claim-tip` |
| 10 | **RequestSuccess** | `src/pages/RequestSuccess.tsx` | Page succes custom request. Affiche "montant on hold" |
| 11 | **GiftSuccess** | `src/pages/GiftSuccess.tsx` | Page succes cadeau wishlist |
| 12 | **HelpPayoutsPricing** | `src/pages/HelpPayoutsPricing.tsx` | Documentation commission, payouts, frais |
| 13 | **StripeValidation** | `src/pages/StripeValidation.tsx` | Callback retour onboarding Stripe. Parametre `?stripe_onboarding=` |

---

### 1.3 Composants (src/components/)

| # | Composant | Fichier | Dependances paiement |
|---|-----------|---------|---------------------|
| 1 | **ChatTipForm** | `src/components/chat/ChatTipForm.tsx` | Tip depuis le chat → `create-tip-checkout` |
| 2 | **ChatCustomRequest** | `src/components/chat/ChatCustomRequest.tsx` | Custom request depuis le chat → `create-request-checkout` |
| 3 | **WhyExcluSection** | `src/components/WhyExcluSection.tsx` | Marketing "80% conversion", messaging checkout |

---

### 1.4 Contextes et State

| # | Fichier | Dependances |
|---|---------|------------|
| 1 | `src/contexts/ProfileContext.tsx` | Stocke `stripe_account_id`, `stripe_connect_status` dans le contexte global |

---

### 1.5 Routes (App.tsx)

| Route | Composant | Usage |
|-------|-----------|-------|
| `/app/stripe-validation` | `StripeValidation` | Callback retour onboarding Stripe |

---

### 1.6 Tables Base de Donnees

#### Tables directement liees aux paiements :

| Table | Colonnes Stripe | Role |
|-------|----------------|------|
| **profiles** | `stripe_account_id`, `stripe_connect_status`, `stripe_customer_id`, `stripe_customer_id_test`, `stripe_verified_email_sent_at`, `is_creator_subscribed` | Compte payout + abonnement createur |
| **creator_profiles** | `stripe_account_id`, `stripe_connect_status` | Duplication pour multi-profil |
| **purchases** | `stripe_session_id`, `chatter_earnings_cents`, `creator_net_cents`, `platform_fee_cents` | Ventes de liens |
| **tips** | `stripe_session_id`, `stripe_payment_intent_id`, `platform_fee_cents`, `creator_net_cents` | Tips |
| **custom_requests** | `stripe_session_id`, `stripe_payment_intent_id`, `platform_fee_cents`, `creator_net_cents` | Custom requests |
| **gift_purchases** | `stripe_session_id`, `stripe_payment_intent_id`, `platform_fee_cents`, `creator_net_cents` | Cadeaux wishlist |
| **payouts** | `stripe_payout_id` | Historique retraits |

#### Tables indirectement liees :

| Table | Colonnes | Role |
|-------|----------|------|
| **referrals** | `commission_earned_cents`, `bonus_paid_to_referrer`, `status` | Tracking referrals et commissions |
| **affiliates** | `total_earnings_cents`, `payout_method`, `payout_details` | Programme affilie |
| **affiliate_payouts** | `amount_cents`, `status`, `payment_method` | Retraits affilies |
| **profile_analytics** | `sales_count`, `revenue_cents` | Metriques quotidiennes |
| **wishlist_items** | `price_cents`, `currency`, `gifted_count` | Prix et suivi des cadeaux |

---

### 1.7 Variables d'Environnement Stripe

```
STRIPE_SECRET_KEY              (cle live)
STRIPE_SECRET_KEY_TEST         (cle test, localhost)
STRIPE_WEBHOOK_SECRET          (signature webhook live)
STRIPE_WEBHOOK_SECRET_TEST     (signature webhook test)
STRIPE_CREATOR_PRICE_ID        (ID prix abonnement $39/mois live)
STRIPE_CREATOR_PRICE_ID_TEST   (ID prix abonnement test)
```

---

### 1.8 Flux de Paiement Actuels (resume)

```
ACHAT LIEN (fan → createur)
  Frontend → create-link-checkout-session → Stripe Checkout → stripe-webhook → purchases + email

TIP (fan → createur)
  Frontend → create-tip-checkout → Stripe Checkout → stripe-webhook → tips + notification

CADEAU WISHLIST (fan → createur)
  Frontend → create-gift-checkout → Stripe Checkout → stripe-webhook → gift_purchases + notification

CUSTOM REQUEST (fan → createur, capture manuelle)
  Frontend → create-request-checkout → Stripe Checkout (manual capture) → stripe-webhook → pending
  Createur accepte → manage-request (capture) → delivered
  Createur refuse → manage-request (cancel) → refused/expired

ABONNEMENT PREMIUM (createur → Exclu)
  Frontend → create-creator-subscription → Stripe Checkout (subscription) → stripe-webhook → is_creator_subscribed=true

ONBOARDING PAYOUT (createur)
  Frontend → stripe-connect-onboard → Stripe Connect Express → webhook account.updated → stripe_connect_status
  Frontend → stripe-connect-status (polling) → self-healing sync

RETRAIT CREATEUR
  Automatique via Stripe Connect (payouts directs vers le compte bancaire du createur)

RETRAIT AFFILIE
  Manuel → request-affiliate-payout → email admin → virement manuel
```

---

## PARTIE 2 — ANALYSE UG PAYMENTS QUICKPAY

### 2.1 Ce que QuickPay propose

| Fonctionnalite | Disponible | Details |
|----------------|------------|---------|
| Paiement unique (one-time) | **OUI** | POST vers `https://quickpay.ugpayments.ch/` avec formulaire |
| Abonnement recurrent | **OUI** | Via `SubscriptionPlanId` + `MembershipRequired=true` |
| Page de paiement hebergee | **OUI** | QuickPay heberge la page de paiement |
| Callback de confirmation (ConfirmURL) | **OUI** | HTTP POST avec details transaction (equivalent webhook) |
| Page de retour (ApprovedURL) | **OUI** | Redirect avec `?TransactionID=&MerchantReference=` |
| Page de refus (DeclinedURL) | **OUI** | Redirect en cas d'echec |
| Annulation abonnement | **OUI** | POST vers `https://quickpay.ugpayments.ch/Cancel` |
| Membership Postback | **OUI** | HTTP POST avec actions Add/Cancel/Inactive |
| Multi-devise | **OUI** | Champ `CurrencyID` (3 lettres) |

### 2.2 Ce que QuickPay NE propose PAS (vs Stripe)

| Fonctionnalite manquante | Impact | Solution proposee |
|--------------------------|--------|-------------------|
| **Stripe Connect (sous-comptes par createur)** | Pas de transfert automatique vers le compte du createur | **Cagnotte interne** : Exclu collecte tout, le createur retire manuellement |
| **Capture manuelle (manual capture)** | Custom requests ne peuvent plus "hold" un paiement | **Paiement immediat** a la soumission, remboursement si refuse/expire |
| **API programmatique (REST)** | Pas d'API pour creer des sessions cote serveur | **Formulaire HTML** : generer un formulaire POST cote frontend ou faire un redirect serveur |
| **Webhooks signature verification** | Pas de signature cryptographique sur les ConfirmURL | **Validation par IP + Key** + verification TransactionID |
| **Billing Portal** | Pas de portail self-service pour gerer l'abonnement | **Page custom** dans l'app pour gerer l'abonnement |
| **Remboursements API** | Non mentionne dans la doc | **A confirmer avec UG Payments** |
| **Test mode** | Non mentionne dans la doc | **A confirmer avec UG Payments** |

### 2.3 Questions a poser a UG Payments

> **IMPORTANT** : Avant de commencer l'implementation, il faut clarifier ces points avec UG Payments.

1. **Remboursements** : Y a-t-il une API ou un mecanisme pour rembourser une transaction ? (Essentiel pour les custom requests refusees et les litiges)
2. **Mode test / Sandbox** : Existe-t-il un environnement de test pour developper sans traiter de vrais paiements ?
3. **Securite ConfirmURL** : Comment securiser le callback ConfirmURL ? Y a-t-il un secret/key partage pour verifier l'authenticite du POST ? (La doc mentionne un `[Key]` dans le membership postback — est-ce disponible pour les transactions aussi ?)
4. **Notification de paiement recurrent** : Quand un abonnement est renouvele automatiquement, est-ce qu'un POST est envoye au ConfirmURL a chaque cycle de facturation ?
5. **Annulation d'abonnement par API** : Le formulaire Cancel peut-il etre soumis via un POST serveur-a-serveur (pas seulement HTML) ?
6. **Statuts de transaction** : Comment etre notifie si une transaction passe en `Chargeback`, `Refund`, ou `Fraud` apres coup ?
7. **Multiple SiteIDs** : Peut-on avoir plusieurs SiteID sur le meme compte merchant pour separer les types de transactions (liens, tips, subscriptions) ?
8. **Restriction de pays** : Y a-t-il des restrictions de pays pour les acheteurs ?
9. **Pre-remplissage email** : Le champ `Email` pre-remplit-il le formulaire de paiement pour le fan ?
10. **Devise EUR vs USD** : Peut-on mixer les devises (certains createurs en EUR, d'autres en USD) ?
11. **IsInitialForRecurring** : Peut-on utiliser ce champ pour faire un premier paiement qui declenche ensuite un abonnement ? Utile pour les custom requests ?
12. **ShowUserNamePassword** : A quoi sert exactement ce champ dans le contexte d'un achat simple (non-membership) ?

---

## PARTIE 3 — PLAN D'IMPLEMENTATION

### 3.0 Changement d'architecture fondamental

```
AVANT (Stripe Connect) :
  Fan paie → Stripe → transfert automatique vers compte Connect du createur → payout auto vers banque

APRES (UG Payments QuickPay) :
  Fan paie → UGPayments → argent sur le compte merchant Exclu
  → Cagnotte interne du createur creditee (DB)
  → Createur demande un retrait → Admin Exclu transfere manuellement (virement SEPA/autre)
```

**Consequence majeure** : Il n'y a plus de transfert automatique vers les createurs. Exclu doit gerer un **systeme de cagnotte (wallet)** interne et un **processus de retrait** (payout) semi-automatique ou manuel.

---

### 3.1 Phase 0 — Preparation et nettoyage

#### Etape 0.1 : Nouvelle migration DB — Colonnes UGPayments
```sql
-- Renommer/ajouter des colonnes pour UGPayments
ALTER TABLE purchases ADD COLUMN ugp_transaction_id TEXT;
ALTER TABLE purchases ADD COLUMN ugp_merchant_reference TEXT;
ALTER TABLE tips ADD COLUMN ugp_transaction_id TEXT;
ALTER TABLE tips ADD COLUMN ugp_merchant_reference TEXT;
ALTER TABLE gift_purchases ADD COLUMN ugp_transaction_id TEXT;
ALTER TABLE gift_purchases ADD COLUMN ugp_merchant_reference TEXT;
ALTER TABLE custom_requests ADD COLUMN ugp_transaction_id TEXT;
ALTER TABLE custom_requests ADD COLUMN ugp_merchant_reference TEXT;

-- Wallet interne createur (remplacement de Stripe Connect)
ALTER TABLE profiles ADD COLUMN wallet_balance_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN total_earned_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN total_withdrawn_cents INTEGER NOT NULL DEFAULT 0;

-- Table de retraits
CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'rejected')),
  bank_details JSONB, -- IBAN, BIC, titulaire
  admin_notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Abonnement Premium — tracking interne (plus de Stripe subscription)
ALTER TABLE profiles ADD COLUMN subscription_ugp_plan_id INTEGER;
ALTER TABLE profiles ADD COLUMN subscription_ugp_member_id TEXT;
ALTER TABLE profiles ADD COLUMN subscription_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN subscription_username TEXT;

-- Coordonnees bancaires du createur (pour les retraits)
ALTER TABLE profiles ADD COLUMN bank_iban TEXT;
ALTER TABLE profiles ADD COLUMN bank_bic TEXT;
ALTER TABLE profiles ADD COLUMN bank_holder_name TEXT;
ALTER TABLE profiles ADD COLUMN bank_country TEXT;

-- Index
CREATE INDEX idx_withdrawals_creator_id ON withdrawals(creator_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
CREATE INDEX idx_profiles_wallet ON profiles(wallet_balance_cents) WHERE wallet_balance_cents > 0;
```

#### Etape 0.2 : RLS pour la table withdrawals
```sql
-- Createur : voir ses propres retraits
CREATE POLICY "Creator can view own withdrawals"
  ON withdrawals FOR SELECT
  USING (creator_id = auth.uid());

-- Createur : creer un retrait
CREATE POLICY "Creator can request withdrawal"
  ON withdrawals FOR INSERT
  WITH CHECK (creator_id = auth.uid());

-- Service role : tout (admin)
```

#### Etape 0.3 : Constantes et configuration

Creer `src/lib/payment-config.ts` :
```typescript
export const PAYMENT_CONFIG = {
  QUICKPAY_URL: 'https://quickpay.ugpayments.ch/',
  QUICKPAY_CANCEL_URL: 'https://quickpay.ugpayments.ch/Cancel',
  SITE_ID: <A_OBTENIR_DE_UG_PAYMENTS>,
  CURRENCY: 'EUR', // ou 'USD' selon config
  PROCESSING_FEE_RATE: 0.05, // 5% fan processing fee
  COMMISSION_RATE_FREE: 0.10, // 10% commission plan gratuit
  COMMISSION_RATE_PREMIUM: 0, // 0% commission plan premium
  PREMIUM_PRICE_CENTS: 3900, // $39/mois
  MIN_WITHDRAWAL_CENTS: 5000, // $50 minimum retrait
  TIP_MIN_CENTS: 500,
  TIP_MAX_CENTS: 50000,
  CUSTOM_REQUEST_MIN_CENTS: 2000,
  CUSTOM_REQUEST_MAX_CENTS: 100000,
} as const;
```

---

### 3.2 Phase 1 — Edge Functions UGPayments (Backend)

#### Etape 1.1 : `ugp-confirm` (remplace `stripe-webhook`)

**Nouveau fichier** : `supabase/functions/ugp-confirm/index.ts`
**Config** : `verify_jwt = false` (appele par UGPayments serveur-a-serveur)

Cet endpoint recoit les HTTP POST de UGPayments (equivalent du webhook Stripe).

```
POST /ugp-confirm
Body (NVP) : MerchantReference, Amount, TransactionID, CardMask, TransactionState,
             CustomerEmail, CustomerFirstName, CustomerLastName, SiteID, ...
```

**Logique** :
1. Valider l'origine (IP whitelist UGPayments si disponible, sinon Key)
2. Parser le `MerchantReference` pour identifier le type de transaction :
   - Format : `{type}_{id}` ex: `link_uuid`, `tip_uuid`, `gift_uuid`, `req_uuid`, `sub_uuid`
3. Verifier `TransactionState === 'Sale'` et `TransactionStatus === 'Successful'` (si fournis)
4. Selon le type :
   - **link** : Creer `purchases`, crediter wallet createur, envoyer email acces
   - **tip** : Mettre a jour `tips.status = 'succeeded'`, crediter wallet, notifier
   - **gift** : Mettre a jour `gift_purchases.status = 'succeeded'`, crediter wallet, notifier
   - **req** : Mettre a jour `custom_requests.status = 'paid'`, crediter wallet (paiement immediat)
   - **sub** : Mettre a jour `is_creator_subscribed = true`, `subscription_expires_at`
5. Retourner HTTP 200

#### Etape 1.2 : `ugp-membership-confirm` (callback abonnements)

**Nouveau fichier** : `supabase/functions/ugp-membership-confirm/index.ts`
**Config** : `verify_jwt = false`

Recoit les postbacks membership de UGPayments.

```
POST /ugp-membership-confirm
Body (NVP) : Action (Add|Cancel|Inactive), Username, MemberId, SubscriptionPlanId,
             MerchantReference, Key, ...
```

**Logique** :
1. Valider le `Key` (partage avec UGPayments)
2. Selon `Action` :
   - **Add** : `is_creator_subscribed = true`, stocker `MemberId`, `SubscriptionPlanId`
   - **Cancel** : `is_creator_subscribed = false`, `subscription_expires_at = null`
   - **Inactive** : Idem Cancel

#### Etape 1.3 : `create-link-checkout` (remplace `create-link-checkout-session`)

**Refactoring** de `supabase/functions/create-link-checkout-session/index.ts`

Au lieu de creer une session Stripe, generer les donnees du formulaire QuickPay :

```typescript
// Retourner les champs du formulaire a soumettre
return jsonOk({
  action_url: 'https://quickpay.ugpayments.ch/',
  fields: {
    QuickPayToken: QUICKPAY_TOKEN,
    SiteID: SITE_ID,
    AmountTotal: totalWithFee.toFixed(2),
    CurrencyID: 'EUR',
    ItemName0: `Unlock: ${link.title}`,
    ItemQuantity0: '1',
    ItemAmount0: totalWithFee.toFixed(2),
    ItemDesc0: `Content unlock on Exclu`,
    AmountShipping: '0.00',
    ShippingRequired: 'false',
    MembershipRequired: 'false',
    ApprovedURL: `${PUBLIC_SITE_URL}/link/${link.slug}?payment_success=true&ref=${merchantRef}`,
    ConfirmURL: `${PROJECT_URL}/functions/v1/ugp-confirm`,
    DeclinedURL: `${PUBLIC_SITE_URL}/link/${link.slug}?payment_failed=true`,
    MerchantReference: `link_${purchaseId}`,
    Email: buyerEmail || '',
  }
}, corsHeaders);
```

Le frontend recoit ces champs et soumet un formulaire HTML POST vers QuickPay.

#### Etape 1.4 : `create-tip-checkout` (adapter)

Meme principe : retourner les champs du formulaire QuickPay.
`MerchantReference: tip_${tipId}`

#### Etape 1.5 : `create-gift-checkout` (adapter)

`MerchantReference: gift_${giftId}`

#### Etape 1.6 : `create-request-checkout` (adapter — CHANGEMENT MAJEUR)

**Changement** : Plus de capture manuelle possible.
- Le paiement est **immediat** a la soumission de la requete
- Si le createur refuse ou ne repond pas, il faut **rembourser** (via UGPayments admin ou API si dispo)
- Alternative : ne facturer le fan qu'une fois que le createur a accepte (le fan attend, paiement en 2 temps)

**Option recommandee (paiement immediat)** :
1. Fan paie immediatement via QuickPay
2. Argent credite au wallet du createur
3. Si le createur refuse dans les 6 jours → remboursement demande a UGPayments (ou debite du wallet createur)
4. Si le createur ne repond pas en 6 jours → meme chose

**Option alternative (paiement differe)** :
1. Fan soumet la requete (gratuit)
2. Createur accepte
3. Fan recoit un lien de paiement et paie
4. Createur livre le contenu

→ **A discuter avec UGPayments sur la faisabilite des remboursements avant de choisir.**

`MerchantReference: req_${requestId}`

#### Etape 1.7 : `create-creator-subscription` (adapter pour subscription QuickPay)

Generer un formulaire de souscription QuickPay :
```
MembershipRequired: 'true'
SubscriptionPlanId: <ID_PLAN_PREMIUM_UGP>
ShowUserNamePassword: 'true' ou 'false'
MembershipUsername: userId ou handle
```

Le createur est redirige vers la page de paiement UGPayments pour s'abonner.

#### Etape 1.8 : `cancel-creator-subscription` (nouveau)

Generer un formulaire POST vers `https://quickpay.ugpayments.ch/Cancel` :
```
QuickpayToken: TOKEN
username: creator.subscription_username
SiteID: SITE_ID
```

#### Etape 1.9 : `request-withdrawal` (nouveau — remplace payout auto Stripe)

**Nouveau fichier** : `supabase/functions/request-withdrawal/index.ts`

```
POST /request-withdrawal
Body : { amount_cents }
Auth : Required (creator)
```

**Logique** :
1. Verifier que le createur a des coordonnees bancaires renseignees
2. Verifier que `wallet_balance_cents >= amount_cents`
3. Verifier minimum de retrait (ex: $50)
4. Verifier qu'il n'y a pas de retrait pending en cours
5. Creer un enregistrement dans `withdrawals` (status: 'pending')
6. Debiter `wallet_balance_cents` du montant
7. Envoyer email admin (notification nouveau retrait a traiter)
8. Envoyer email createur (confirmation demande de retrait)

#### Etape 1.10 : `payment-account-setup` (remplace `stripe-connect-onboard`)

**Nouveau fichier** : `supabase/functions/payment-account-setup/index.ts`

Plus besoin d'onboarding Stripe Connect. Le createur renseigne simplement ses coordonnees bancaires :
- IBAN
- BIC (optionnel, derive de l'IBAN)
- Nom du titulaire
- Pays

Stocker dans `profiles.bank_iban`, `profiles.bank_bic`, etc.

**Statut paiement** : On remplace `stripe_connect_status` par un statut plus generique :
- `payment_setup_status` : 'not_started' | 'complete'
- Complete = IBAN renseigne et valide

---

### 3.3 Phase 2 — Frontend

#### Etape 2.1 : Composant `QuickPayForm` (nouveau)

Creer `src/components/payment/QuickPayForm.tsx` :

Un composant reutilisable qui :
1. Recoit les champs de formulaire du backend
2. Cree un `<form>` invisible avec des `<input type="hidden">`
3. Soumet automatiquement le formulaire (redirect vers QuickPay)

```tsx
interface QuickPayFormProps {
  actionUrl: string;
  fields: Record<string, string>;
  autoSubmit?: boolean;
}
```

#### Etape 2.2 : Adapter `PublicLink.tsx`

- Remplacer l'appel `create-link-checkout-session` par `create-link-checkout`
- Au lieu d'ouvrir une URL Stripe, soumettre le formulaire QuickPay
- Page de retour : lire `?payment_success=true&ref=` au lieu de `?session_id=`
- Adapter la verification post-paiement (plus de `verify-checkout-session` Stripe, utiliser le callback `ugp-confirm`)

#### Etape 2.3 : Adapter `CreatorPublic.tsx`

- Tips : adapter le checkout pour soumettre un formulaire QuickPay
- Custom requests : adapter pour le nouveau flux (paiement immediat ou differe)
- Gifts : adapter le checkout

#### Etape 2.4 : Adapter `ChatTipForm.tsx` et `ChatCustomRequest.tsx`

- Meme adaptation que CreatorPublic (formulaire QuickPay au lieu de URL Stripe)

#### Etape 2.5 : Refonte `Profile.tsx` — Section Paiement

**Remplacer la section Stripe Connect** par :
- Formulaire de saisie coordonnees bancaires (IBAN, BIC, titulaire)
- Statut : "Compte bancaire renseigne" / "Aucun compte bancaire"
- Validation IBAN cote client (format)
- Section abonnement Premium : bouton qui soumet le formulaire QuickPay subscription

#### Etape 2.6 : Refonte `AppDashboard.tsx` — Wallet & Retraits

**Nouvelle section "Wallet"** :
- Solde actuel : `wallet_balance_cents`
- Total gagne : `total_earned_cents`
- Total retire : `total_withdrawn_cents`
- Bouton "Retirer" → modal avec montant et confirmation
- Historique des retraits (table `withdrawals`)
- Statut des retraits (pending, processing, completed)

**Remplacer** le messaging Stripe ("Exclu does not hold a wallet for you") par le nouveau systeme de wallet interne.

#### Etape 2.7 : Page de retour `PaymentSuccess.tsx` (remplace/adapte les pages *Success)

Adapter les pages `TipSuccess`, `RequestSuccess`, `GiftSuccess` pour lire les parametres UGPayments :
- `?TransactionID=` et `?MerchantReference=`
- Au lieu de `?session_id=` Stripe

#### Etape 2.8 : Supprimer `StripeValidation.tsx`

Cette page n'a plus de raison d'etre. Supprimer la page et la route `/app/stripe-validation`.

#### Etape 2.9 : Nouveau `PaymentSetup.tsx` (remplace l'onboarding Stripe)

Page/modal de saisie des coordonnees bancaires, avec :
- Champ IBAN avec validation
- Champ nom du titulaire
- Detection automatique du BIC depuis l'IBAN (si possible)
- Bouton sauvegarder → `payment-account-setup`

#### Etape 2.10 : Adapter `ProfileContext.tsx`

- Remplacer `stripe_account_id` et `stripe_connect_status` par `bank_iban` (non-null = complete) et `payment_setup_status`
- Adapter la logique de blocage des liens payants

#### Etape 2.11 : Adapter `HelpPayoutsPricing.tsx`

- Mettre a jour la documentation avec le nouveau systeme de cagnotte + retrait
- Expliquer les delais de retrait

---

### 3.4 Phase 3 — Nettoyage code mort

#### Fichiers a SUPPRIMER :

| Fichier | Raison |
|---------|--------|
| `supabase/functions/stripe-webhook/index.ts` | Remplace par `ugp-confirm` et `ugp-membership-confirm` |
| `supabase/functions/stripe-connect-onboard/index.ts` | Remplace par `payment-account-setup` |
| `supabase/functions/stripe-connect-status/index.ts` | Plus necessaire (pas de compte tiers a verifier) |
| `supabase/functions/verify-checkout-session/index.ts` | Remplace par le callback ConfirmURL |
| `src/pages/StripeValidation.tsx` | Plus de callback Stripe |
| `docs/STRIPE_SYSTEM.md` | Obsolete |
| `docs/PLAN_STRIPE_TO_WHOP_MIGRATION.md` | Obsolete (plan precedent non abouti) |

#### Fichiers a RENOMMER / REFACTORER :

| Ancien | Nouveau | Raison |
|--------|---------|--------|
| `create-link-checkout-session` | `create-link-checkout` | Nom plus generique |
| `create-tip-checkout` | Garder le nom | Deja generique |
| `create-gift-checkout` | Garder le nom | Deja generique |
| `create-request-checkout` | Garder le nom | Deja generique |
| `create-creator-subscription` | Garder le nom | Deja generique |

#### Code mort a supprimer dans chaque fichier :

- Toutes les importations `import Stripe from 'npm:stripe'`
- Toutes les references a `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, etc.
- Logique de detection test/live Stripe (`cs_test_*` prefix checking)
- Logique `stripe.checkout.sessions.create()`
- Logique `stripe.accounts.create()` / `stripe.accountLinks.create()`
- Logique `stripe.paymentIntents.capture()` / `.cancel()` dans manage-request
- Variables `stripe_customer_id`, `stripe_customer_id_test`

#### Variables d'env a SUPPRIMER :

```
STRIPE_SECRET_KEY
STRIPE_SECRET_KEY_TEST
STRIPE_WEBHOOK_SECRET
STRIPE_WEBHOOK_SECRET_TEST
STRIPE_CREATOR_PRICE_ID
STRIPE_CREATOR_PRICE_ID_TEST
```

#### Variables d'env a AJOUTER :

```
QUICKPAY_TOKEN           (token QuickPay fourni)
QUICKPAY_SITE_ID         (a obtenir de UGPayments)
QUICKPAY_CONFIRM_KEY     (cle de verification postback, a configurer dans le merchant portal)
QUICKPAY_SUB_PLAN_ID     (ID du plan d'abonnement Premium dans UGPayments)
```

#### Colonnes DB a deprecier (migration future) :

Les colonnes `stripe_*` ne seront plus alimentees mais peuvent etre gardees pour l'historique des transactions passees. Ne pas les supprimer immediatement.

---

### 3.5 Phase 4 — Admin & Operations

#### Etape 4.1 : Interface admin pour les retraits

Ajouter une section dans l'admin dashboard pour :
- Lister les retraits en attente (`status = 'pending'`)
- Voir les coordonnees bancaires du createur
- Approuver / rejeter un retrait
- Marquer comme "processing" puis "completed"
- Notes admin pour le suivi

#### Etape 4.2 : Cron job ou process pour les custom requests expirees

Puisqu'il n'y a plus de capture manuelle, un job doit :
- Identifier les custom requests avec `status = 'paid'` et `expires_at < NOW()`
- Les passer en `status = 'expired'`
- Debiter le wallet du createur du montant
- Initier une demande de remboursement (si possible via UGPayments, sinon credit wallet fan)

---

### 3.6 Ordre d'implementation recommande

```
SPRINT 1 — Fondations (2-3 jours)
  ├── 0.1 Migration DB (nouvelles colonnes, table withdrawals)
  ├── 0.2 RLS policies
  ├── 0.3 payment-config.ts
  ├── 2.1 Composant QuickPayForm
  └── Poser les questions a UGPayments (partie 2.3)

SPRINT 2 — Achats de liens (flux principal) (2-3 jours)
  ├── 1.1 ugp-confirm (backend callback)
  ├── 1.3 create-link-checkout (adapter)
  ├── 2.2 PublicLink.tsx (adapter)
  └── Test end-to-end achat de lien

SPRINT 3 — Tips, Gifts, Custom Requests (3-4 jours)
  ├── 1.4 create-tip-checkout (adapter)
  ├── 1.5 create-gift-checkout (adapter)
  ├── 1.6 create-request-checkout (adapter — decision sur le flux)
  ├── 2.3 CreatorPublic.tsx (adapter)
  ├── 2.4 ChatTipForm + ChatCustomRequest (adapter)
  ├── 2.7 Pages Success (adapter)
  └── Tests tips, gifts, requests

SPRINT 4 — Abonnement Premium (2 jours)
  ├── 1.2 ugp-membership-confirm
  ├── 1.7 create-creator-subscription (adapter)
  ├── 1.8 cancel-creator-subscription (nouveau)
  ├── 2.5 Profile.tsx section abonnement
  └── Test abonnement

SPRINT 5 — Wallet, Retraits, Onboarding Paiement (3 jours)
  ├── 1.9 request-withdrawal (nouveau)
  ├── 1.10 payment-account-setup (nouveau)
  ├── 2.5 Profile.tsx section bancaire
  ├── 2.6 AppDashboard.tsx wallet + retraits
  ├── 2.9 PaymentSetup (saisie IBAN)
  └── 2.10 ProfileContext (adapter)

SPRINT 6 — Nettoyage & Admin (2 jours)
  ├── 3 (Phase 3 complete — suppression code mort)
  ├── 4.1 Interface admin retraits
  ├── 4.2 Job expiration custom requests
  ├── 2.8 Supprimer StripeValidation
  ├── 2.11 Adapter HelpPayoutsPricing
  └── Revue finale, tests complets
```

---

## PARTIE 4 — POINTS DE VIGILANCE

### 4.1 Securite

- **QuickPayToken** : JAMAIS dans le code source. Toujours en variable d'environnement (`QUICKPAY_TOKEN` dans Supabase Secrets)
- **ConfirmURL** : Valider l'authenticite des POST recus (IP whitelist + Key si disponible)
- **IBAN** : Stocker de maniere securisee (RLS strict, pas accessible aux autres utilisateurs)
- **Formulaire QuickPay** : Le token est expose dans le HTML du formulaire cote client — c'est normal et prevu par QuickPay (meme principe que les cles publiques Stripe), mais s'assurer que le `ConfirmURL` valide tout cote serveur

### 4.2 UX

- **Redirection externe** : Le fan quitte l'app pour payer sur QuickPay, puis revient. Prevoir une bonne page de retour
- **Delai de confirmation** : Le POST au ConfirmURL peut arriver avant ou apres le redirect du fan. Prevoir un polling ou un refresh
- **Wallet** : Les createurs doivent comprendre que l'argent est dans une cagnotte interne et non transfere automatiquement

### 4.3 Comptabilite

- Exclu collecte TOUS les paiements → obligations comptables et regulatoires (holding funds)
- Les retraits doivent etre traces pour la comptabilite
- Commission Exclu clairement separee dans chaque transaction

### 4.4 Donnees historiques

- Les transactions Stripe existantes restent dans la DB (colonnes `stripe_*`)
- Ne pas supprimer les colonnes Stripe — les laisser pour l'historique
- Les nouvelles transactions utilisent les colonnes `ugp_*`

---

## RESUME

| Aspect | Avant (Stripe) | Apres (UGPayments) |
|--------|----------------|-------------------|
| Checkout | Stripe Checkout (redirect) | QuickPay form POST (redirect) |
| Webhook | `stripe-webhook` (signature) | `ugp-confirm` (ConfirmURL POST) |
| Payout createur | Automatique (Stripe Connect) | **Cagnotte interne + retrait manuel** |
| Onboarding createur | Stripe Connect Express | **Saisie IBAN** |
| Abonnement | Stripe Billing | QuickPay Subscription + Membership postback |
| Capture manuelle | Oui (PaymentIntent manual) | **Non — paiement immediat + remboursement si besoin** |
| Gestion abonnement | Stripe Customer Portal | **Interface custom dans l'app** |
| Remboursement | Stripe API | **A confirmer avec UGPayments** |
