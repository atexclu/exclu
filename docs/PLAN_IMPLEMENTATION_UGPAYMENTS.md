# Plan d'Implementation Detaille — UG Payments QuickPay

> **Date** : 27 mars 2026 (v3 — toutes les docs recues, plan complet)
> **Statut** : PRET POUR IMPLEMENTATION — toutes les informations disponibles
> **Derniere info recue** : API Refund/Capture/Void doc, SubscriptionPlanId=11027, pre-auth auto-configuree par UGP

---

## TABLE DES MATIERES

1. [Architecture generale](#1-architecture-generale)
2. [Phase 0 — Migration DB et fondations](#2-phase-0)
3. [Phase 1 — Systeme de cagnotte (Wallet)](#3-phase-1)
4. [Phase 2 — Checkout et callbacks (Backend)](#4-phase-2)
5. [Phase 3 — Custom Requests (nouveau flux)](#5-phase-3)
6. [Phase 4 — Abonnement Premium et gestion](#6-phase-4)
7. [Phase 5 — Onboarding paiement (IBAN) et retraits](#7-phase-5)
8. [Phase 6 — Frontend (pages, composants, dashboards)](#8-phase-6)
9. [Phase 7 — Dashboard cards et metriques](#9-phase-7)
10. [Phase 8 — Nettoyage code mort](#10-phase-8)
11. [Checklist finale](#11-checklist)
12. [Devise — Tout en USD](#12-devise)
13. [Carte des rappels Stripe a remplacer](#13-stripe-reminders)
14. [Instructions d'implementation pour le developpeur](#14-instructions)
15. [Informations confirmees par UGPayments](#15-ugpayments-confirmed)

---

<a id="15-ugpayments-confirmed"></a>
## 15. INFORMATIONS CONFIRMEES PAR UGPAYMENTS (27 mars 2026)

### 15.1 Credentials et configuration

| Element | Valeur |
|---------|--------|
| **SiteID** | `98845` |
| **QuickPayToken** | En variable d'env `QUICKPAY_TOKEN` (JAMAIS dans le code) |
| **ConfirmURL Key** | `GSibxqsSpjOXMDYMuBxxenYkCfKOIOKC` → en variable d'env `QUICKPAY_CONFIRM_KEY` |
| **IP Whitelist** | https://quickpay.ugpayments.ch/iplist |
| **Endpoint** | `https://quickpay.ugpayments.ch/` |
| **Cancel Endpoint** | `https://quickpay.ugpayments.ch/Cancel` |

### 15.2 Sandbox / Mode test

Carte de test : `4242 4242 4242 4242`, expiry `12/29`, CVV `123`
Pour simuler un refus : CVV `555`

### 15.3 Pre-auth (capture manuelle) — DISPONIBLE

**CHANGEMENT MAJEUR** : UGPayments supporte la pre-authorisation avec capture/void manuelle.
Cela signifie que le flux actuel des custom requests (hold → capture/void) peut etre CONSERVE.

- On peut mettre une transaction en pre-auth
- Auto-capture ou auto-void apres un delai configurable
- Capture ou void manuelle avant l'auto-update
- **En attente** : le champ exact du formulaire QuickPay pour activer la pre-auth, et le delai configurable

### 15.4 API de remboursement — DISPONIBLE

UGPayments fournit une API de remboursement. La documentation a ete demandee (pas encore recue).

### 15.5 Securite ConfirmURL — CONFIRME

- Le champ `Key` est envoye dans le POST avec la valeur `GSibxqsSpjOXMDYMuBxxenYkCfKOIOKC`
- IP whitelist disponible a https://quickpay.ugpayments.ch/iplist
- **Dans ugp-confirm** : verifier `body.Key === QUICKPAY_CONFIRM_KEY` ET optionnellement whitelist IP

### 15.6 Timing et retry ConfirmURL

- Le POST ConfirmURL arrive **AVANT** le redirect vers ApprovedURL → excellent, le polling sera rarement necessaire
- **Pas de retry automatique** si erreur 500. Ils peuvent re-envoyer manuellement sur demande.
- → Notre code DOIT etre robuste (pas de 500). Ajouter try/catch global dans ugp-confirm.

### 15.7 Listener URL pour refunds/chargebacks

- Le ConfirmURL n'est appele qu'UNE FOIS par transaction (au paiement initial)
- Pour les changements de statut (refund, chargeback, fraud) : UGPayments configure un **Listener URL** separe
- **A configurer** : `https://qexnwezetjlbwltyccks.supabase.co/functions/v1/ugp-listener`
- Ce listener recevra les POST pour : refunds, chargebacks, etc.

### 15.8 Abonnements — Postbacks

- A chaque renouvellement : POST envoye au **Member Postback URL** ET au **ConfirmURL** (si configure dans le systeme)
- → La commission referral recurrente (35% de $39) sera traitee a chaque postback

### 15.9 Annulation abonnement

- **Le Cancel form NE peut PAS etre soumis server-to-server**
- Il faut un formulaire HTML cote client (dans le navigateur)
- → Le bouton "Cancel subscription" dans Profile.tsx doit soumettre un formulaire HTML invisible vers `https://quickpay.ugpayments.ch/Cancel`

### 15.10 Montant dans ConfirmURL

- Le champ `Amount` = le montant total charge au client = `AmountTotal` qu'on a envoye
- C'est le prix de base + 5% processing fee (puisqu'on les inclut dans AmountTotal)

### 15.11 Pre-remplissage email

- Le champ `Email` pre-remplit la page de paiement → TOUJOURS l'envoyer quand on connait l'email du fan

### 15.12 HTTPS obligatoire

ConfirmURL et ApprovedURL doivent etre en HTTPS (OK pour Supabase Edge Functions et exclu.at)

### 15.13 Pre-auth — Configuration par UGPayments

UGPayments a configure la pre-auth cote serveur pour notre compte. On n'a PAS besoin d'ajouter un champ dans le formulaire — c'est gere automatiquement. L'auto-void est configure a 6 jours.

Le ConfirmURL recevra `TransactionState = 'Authorize'` pour une pre-auth (au lieu de `Sale`).

### 15.14 Renouvellement abonnement

Les renouvellements sont envoyes au **Member Postback URL** avec `Action = 'Rebill'` (pas 'Add').

**IMPORTANT** : Le plan doit gerer `Action = 'Rebill'` en plus de 'Add', 'Cancel', 'Inactive'.

### 15.15 SubscriptionPlanId

Le plan Premium $39/mois a l'ID : `11027`

### 15.16 API REST — Refund / Capture / Void (doc recue)

**Base URL** : `https://api.ugpayments.ch/merchants/[MerchantId]`
**Auth** : OAuth Bearer Token (a obtenir de UGPayments → env var `UGP_API_BEARER_TOKEN`)
**Format** : JSON request/response

**IMPORTANT** : L'API necessite un **MerchantId** et un **OAuth Bearer Token** (differents du QuickPayToken et du SiteID). Il faut demander ces credentials a UGPayments si on ne les a pas encore.

→ **Variable d'env a ajouter** : `UGP_MERCHANT_ID` et `UGP_API_BEARER_TOKEN`

#### CAPTURE (pre-auth → debit effectif)

```
POST https://api.ugpayments.ch/merchants/{MerchantId}/capturetransactions
Content-Type: application/json
Authorization: Bearer {UGP_API_BEARER_TOKEN}

Request:
{
  "authorizeTransactionId": "123456",  // TransactionID recu dans le ConfirmURL
  "amount": 123.45                     // Montant a capturer (decimal)
}

Response (succes):
{
  "id": "123456",
  "message": "Success",
  "state": "Capture",
  "status": "Successful",
  "reasoncode": "00-approved"
}
```

**Regles** : Seules les transactions `Authorize` non-voidees peuvent etre capturees.
**Erreurs possibles** :
- `"Not able to capture. The transaction might be voided or already captured."`
- `"Capture amount is greater than the remaining authorization amount to be captured."`
- `"Time period to capture this transaction has expired."`
- `"This transaction has already been captured."`

#### VOID (annuler une pre-auth)

```
POST https://api.ugpayments.ch/merchants/{MerchantId}/voidtransactions
Content-Type: application/json
Authorization: Bearer {UGP_API_BEARER_TOKEN}

Request:
{
  "authorizeTransactionId": "123456"  // TransactionID de la pre-auth
}

Response (succes):
{
  "id": "123457",
  "message": "Success",
  "state": "Void",
  "status": "Successful",
  "reasoncode": "00-approved"
}
```

**Regles** : Seules les transactions `Authorize` peuvent etre voidees.
**Erreurs possibles** :
- `"The specified transaction is not valid for Void."`
- `"This transaction is already been voided."`

#### REFUND (rembourser une vente ou capture)

```
POST https://api.ugpayments.ch/merchants/{MerchantId}/refundtransactions
Content-Type: application/json
Authorization: Bearer {UGP_API_BEARER_TOKEN}

Request:
{
  "referenceTransactionId": "123456",  // TransactionID de la Sale ou Capture
  "amount": 123.45                     // Montant a rembourser (partiel ou total)
}

Response (succes):
{
  "id": "123456",
  "message": "Success",
  "state": "Refund",
  "status": "Successful",
  "reasoncode": "00-approved"
}
```

**Regles** : Seules les transactions `Sale` et `Capture` peuvent etre remboursees.
**Remboursement partiel** : possible (montant < original).
**Erreurs possibles** :
- `"Not able to refund. The transaction might have CBK1 record or is already refunded."`
- `"Partial refund amount is greater than the remaining amount to be refunded."`
- `"Cannot do a full refund for this transaction. Only partial refund is allowed."`
- `"This transaction is already been refunded."`

### 15.17 Helper function pour les appels API UGPayments

```typescript
// A creer dans une lib partagee pour les edge functions
// supabase/functions/_shared/ugp-api.ts

const UGP_API_BASE = 'https://api.ugpayments.ch/merchants';

interface UgpApiResponse {
  id: string;
  message: string;
  state: string;
  status: string;
  reasoncode?: string;
  trackingId?: string;
}

async function ugpCapture(transactionId: string, amountDecimal: number): Promise<UgpApiResponse> {
  const merchantId = Deno.env.get('UGP_MERCHANT_ID');
  const bearerToken = Deno.env.get('UGP_API_BEARER_TOKEN');

  const res = await fetch(`${UGP_API_BASE}/${merchantId}/capturetransactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      authorizeTransactionId: transactionId,
      amount: amountDecimal,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UGP capture failed (${res.status}): ${text}`);
  }

  const data = await res.json() as UgpApiResponse;

  if (data.status !== 'Successful') {
    throw new Error(`UGP capture not successful: ${data.message} (state=${data.state}, status=${data.status})`);
  }

  return data;
}

async function ugpVoid(transactionId: string): Promise<UgpApiResponse> {
  const merchantId = Deno.env.get('UGP_MERCHANT_ID');
  const bearerToken = Deno.env.get('UGP_API_BEARER_TOKEN');

  const res = await fetch(`${UGP_API_BASE}/${merchantId}/voidtransactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      authorizeTransactionId: transactionId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UGP void failed (${res.status}): ${text}`);
  }

  const data = await res.json() as UgpApiResponse;

  if (data.status !== 'Successful') {
    throw new Error(`UGP void not successful: ${data.message} (state=${data.state}, status=${data.status})`);
  }

  return data;
}

async function ugpRefund(transactionId: string, amountDecimal: number): Promise<UgpApiResponse> {
  const merchantId = Deno.env.get('UGP_MERCHANT_ID');
  const bearerToken = Deno.env.get('UGP_API_BEARER_TOKEN');

  const res = await fetch(`${UGP_API_BASE}/${merchantId}/refundtransactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({
      referenceTransactionId: transactionId,
      amount: amountDecimal,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UGP refund failed (${res.status}): ${text}`);
  }

  const data = await res.json() as UgpApiResponse;

  if (data.status !== 'Successful') {
    throw new Error(`UGP refund not successful: ${data.message} (state=${data.state}, status=${data.status})`);
  }

  return data;
}

export { ugpCapture, ugpVoid, ugpRefund };
export type { UgpApiResponse };
```

### 15.18 Toutes les informations sont maintenant disponibles

| Element | Valeur | Statut |
|---------|--------|--------|
| SiteID | `98845` | CONFIRME |
| QuickPayToken | En env var | CONFIRME |
| ConfirmURL Key | `GSibxqsSpjOXMDYMuBxxenYkCfKOIOKC` | CONFIRME |
| SubscriptionPlanId | `11027` | CONFIRME |
| MerchantId | **A DEMANDER** (pour l'API REST) | EN ATTENTE |
| OAuth Bearer Token | **A DEMANDER** (pour l'API REST) | EN ATTENTE |
| Pre-auth | Auto-configuree par UGP, auto-void 6 jours | CONFIRME |
| Listener URL | A configurer par UGP | A DEMANDER |
| Member Postback URL | A configurer par UGP | A DEMANDER |
| Renouvellement Action | `'Rebill'` | CONFIRME |
| API Refund endpoint | `POST /merchants/{id}/refundtransactions` | CONFIRME |
| API Capture endpoint | `POST /merchants/{id}/capturetransactions` | CONFIRME |
| API Void endpoint | `POST /merchants/{id}/voidtransactions` | CONFIRME |
| Carte test | `4242424242424242`, exp `12/29`, CVV `123` | CONFIRME |
| Carte decline | CVV `555` | CONFIRME |

---

<a id="1-architecture-generale"></a>
## 1. ARCHITECTURE GENERALE

### 1.1 Avant (Stripe) vs Apres (UGPayments)

```
AVANT :
  Fan paie → Stripe Checkout → webhook → transfer_data vers Stripe Connect createur → payout auto banque
  Createur : 0 action, l'argent arrive sur son compte bancaire automatiquement

APRES :
  Fan paie → QuickPay (formulaire POST) → ConfirmURL callback → wallet createur credite en DB
  Createur : demande retrait → admin Exclu valide → virement SEPA vers IBAN du createur
```

### 1.2 Flux de donnees global

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React SPA)                                               │
│                                                                     │
│  1. Fan clique "Unlock" / "Send tip" / "Gift" / etc.              │
│  2. Appel Edge Function → recoit les champs du formulaire          │
│  3. Cree un <form> invisible, POST vers QuickPay                   │
│  4. Fan redirige sur QuickPay, paie                                │
│  5. Fan redirige vers ApprovedURL avec ?TransactionID&ref=type_uuid│
│  6. Frontend poll la DB pour verifier le statut                    │
└────────────────────┬────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────────┐
│  EDGE FUNCTIONS (Supabase/Deno)                                     │
│                                                                     │
│  create-link-checkout    → genere les champs formulaire QuickPay   │
│  create-tip-checkout     → idem pour tips                          │
│  create-gift-checkout    → idem pour gifts                         │
│  create-request-checkout → idem pour custom requests               │
│  create-creator-subscription → idem pour abo premium               │
│  ugp-confirm             → recoit POST de QuickPay (ConfirmURL)    │
│  ugp-membership-confirm  → recoit POST membership de QuickPay      │
│  request-withdrawal      → createur demande un retrait             │
│  save-bank-details       → createur enregistre son IBAN            │
│  manage-request          → createur accepte/refuse (sans Stripe)   │
└────────────────────┬────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────────┐
│  BASE DE DONNEES (Supabase PostgreSQL)                              │
│                                                                     │
│  profiles.wallet_balance_cents  → cagnotte disponible              │
│  profiles.total_earned_cents    → total gagne historique           │
│  profiles.total_withdrawn_cents → total retire historique          │
│  profiles.bank_iban / bank_bic / bank_holder_name → coordonnees   │
│  profiles.payout_setup_complete → IBAN renseigne ?                 │
│  payouts (table existante)      → historique des retraits          │
│  payment_events                 → log brut de chaque callback UGP  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 Securite du QuickPayToken

Le token `AAEAABRZXxY7ya...` fourni par UGPayments est expose dans le formulaire HTML cote client (c'est le fonctionnement prevu par QuickPay). La securite repose sur :
- Le `ConfirmURL` (callback serveur) qui valide et credite
- La verification du montant (compare DB vs montant recu)
- Le `TransactionID` unique (idempotence)
- Le secret/Key partage (a configurer avec UGPayments)

**REGLE** : Le token ne doit JAMAIS etre dans le code source. Toujours en variable d'environnement `QUICKPAY_TOKEN`.

---

<a id="2-phase-0"></a>
## 2. PHASE 0 — Migration DB et Fondations

### 2.1 Migration SQL principale

**Fichier** : `supabase/migrations/1XX_ugpayments_migration.sql`

```sql
-- ============================================================
-- PARTIE A : Colonnes wallet sur profiles
-- ============================================================

-- Wallet interne (BIGINT pour coherence avec profile_analytics.revenue_cents)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_balance_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_earned_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_withdrawn_cents BIGINT NOT NULL DEFAULT 0;

-- Coordonnees bancaires
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_iban TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_bic TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_holder_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_country TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payout_setup_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- Abonnement UGPayments
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_ugp_member_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_ugp_username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- ============================================================
-- PARTIE B : Colonnes UGP sur les tables de transactions
-- ============================================================

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS ugp_transaction_id TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS ugp_merchant_reference TEXT;

ALTER TABLE tips ADD COLUMN IF NOT EXISTS ugp_transaction_id TEXT;
ALTER TABLE tips ADD COLUMN IF NOT EXISTS ugp_merchant_reference TEXT;

ALTER TABLE gift_purchases ADD COLUMN IF NOT EXISTS ugp_transaction_id TEXT;
ALTER TABLE gift_purchases ADD COLUMN IF NOT EXISTS ugp_merchant_reference TEXT;

ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS ugp_transaction_id TEXT;
ALTER TABLE custom_requests ADD COLUMN IF NOT EXISTS ugp_merchant_reference TEXT;

-- ============================================================
-- PARTIE C : Etendre la table payouts existante pour les retraits manuels
-- ============================================================

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS bank_iban TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS bank_holder_name TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Etendre le CHECK constraint de status pour ajouter 'approved' et 'rejected'
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check
  CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'rejected'));

-- ============================================================
-- PARTIE D : Table d'audit des callbacks UGPayments
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL,
  merchant_reference TEXT NOT NULL,
  amount_decimal TEXT NOT NULL,
  transaction_state TEXT,
  customer_email TEXT,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processing_result TEXT,
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_txn_id ON payment_events(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_ref ON payment_events(merchant_reference);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_txn_unique ON payment_events(transaction_id);

-- ============================================================
-- PARTIE E : Index pour le wallet
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_wallet_positive
  ON profiles(wallet_balance_cents) WHERE wallet_balance_cents > 0;

CREATE INDEX IF NOT EXISTS idx_profiles_payout_setup
  ON profiles(payout_setup_complete) WHERE payout_setup_complete = TRUE;

-- ============================================================
-- PARTIE F : RPC atomiques pour credit/debit wallet
-- ============================================================

CREATE OR REPLACE FUNCTION credit_creator_wallet(
  p_creator_id UUID,
  p_amount_cents BIGINT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance BIGINT;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive: %', p_amount_cents;
  END IF;

  UPDATE profiles
  SET wallet_balance_cents = wallet_balance_cents + p_amount_cents,
      total_earned_cents = total_earned_cents + p_amount_cents
  WHERE id = p_creator_id
  RETURNING wallet_balance_cents INTO new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator not found: %', p_creator_id;
  END IF;

  RETURN new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION debit_creator_wallet(
  p_creator_id UUID,
  p_amount_cents BIGINT
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance BIGINT;
  new_balance BIGINT;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive: %', p_amount_cents;
  END IF;

  SELECT wallet_balance_cents INTO current_balance
  FROM profiles WHERE id = p_creator_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator not found: %', p_creator_id;
  END IF;

  IF current_balance < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient balance: % < %', current_balance, p_amount_cents;
  END IF;

  UPDATE profiles
  SET wallet_balance_cents = wallet_balance_cents - p_amount_cents,
      total_withdrawn_cents = total_withdrawn_cents + p_amount_cents
  WHERE id = p_creator_id
  RETURNING wallet_balance_cents INTO new_balance;

  RETURN new_balance;
END;
$$;
```

### 2.2 RLS pour les nouvelles structures

```sql
-- payment_events : lecture seule pour les admins (service_role)
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- payouts : les createurs voient leurs propres retraits
-- (les policies existantes couvrent deja cela, verifier)

-- profiles : wallet_balance_cents visible uniquement par le proprietaire
-- (deja couvert par les policies existantes sur profiles)
```

### 2.3 Fichier de configuration paiement

**Creer** : `src/lib/payment-config.ts`

```typescript
export const PAYMENT_CONFIG = {
  QUICKPAY_URL: 'https://quickpay.ugpayments.ch/',
  QUICKPAY_CANCEL_URL: 'https://quickpay.ugpayments.ch/Cancel',
  PROCESSING_FEE_RATE: 0.05,
  COMMISSION_RATE_FREE: 0.10,
  COMMISSION_RATE_PREMIUM: 0,
  PREMIUM_PRICE_CENTS: 3900,
  PREMIUM_PRICE_USD: 39,
  MIN_WITHDRAWAL_CENTS: 5000,
  TIP_MIN_CENTS: 500,
  TIP_MAX_CENTS: 50000,
  CUSTOM_REQUEST_MIN_CENTS: 2000,
  CUSTOM_REQUEST_MAX_CENTS: 100000,
} as const;
```

### 2.4 Variables d'environnement (Supabase Secrets)

```
QUICKPAY_TOKEN=AAEAABRZXxY7ya...              (le token fourni — NE PAS COMMITTER)
QUICKPAY_SITE_ID=98845                         (confirme par UGPayments)
QUICKPAY_CONFIRM_KEY=GSibxqsSpjOXMDYMuBxxenYkCfKOIOKC  (cle de verification ConfirmURL)
QUICKPAY_SUB_PLAN_ID=11027                     (plan Premium $39/mois)
UGP_MERCHANT_ID=<A DEMANDER a UGPayments>      (pour l'API REST capture/void/refund)
UGP_API_BEARER_TOKEN=<A DEMANDER a UGPayments> (OAuth Bearer pour l'API REST)
```

**Variables Vite (frontend — .env.local)** :
```
VITE_QUICKPAY_TOKEN=AAEAABRZXxY7ya...         (expose cote client, necessaire pour formulaires + cancel)
VITE_QUICKPAY_SITE_ID=98845
```

**Note** : Le token QuickPay est expose cote client dans les formulaires HTML (comme une cle publique Stripe). La securite repose sur le ConfirmURL (Key + montant verifie) et non sur le secret du token.

---

<a id="3-phase-1"></a>
## 3. PHASE 1 — Systeme de Cagnotte (Wallet)

### 3.1 Comment ca fonctionne

Chaque paiement recu par Exclu via QuickPay credite le `wallet_balance_cents` du createur concerne (via la RPC `credit_creator_wallet`). Le createur peut ensuite demander un retrait qui sera traite manuellement par l'admin.

### 3.2 Formule du wallet (coherente avec le dashboard actuel)

Le dashboard actuel calcule deja un "wallet balance" cote frontend :
```typescript
// AppDashboard.tsx actuel (lignes 168)
const walletBalance = revenueSum + tipsSum - totalPayoutsCents;
```

Avec le nouveau systeme, ce calcul se fait en DB :
```
wallet_balance_cents = total_earned_cents - total_withdrawn_cents
```

**IMPORTANT** : Les deux doivent rester coherents. Le champ `wallet_balance_cents` est la source de verite.

### 3.3 Quand le wallet est credite

| Evenement | Montant credite | Condition |
|-----------|----------------|-----------|
| Achat de lien (sans chatter) | `creator_net_cents` | ConfirmURL recu avec TransactionState=Sale + Successful |
| Achat de lien (avec chatter, split 60/25/15) | `creator_net_cents` (60%) | Idem |
| Tip | `creator_net_cents` | Idem |
| Gift wishlist | `creator_net_cents` | Idem |
| Custom request (livree) | `creator_net_cents` | Createur accepte et livre (PAS a la reception du paiement) |

### 3.4 Calcul du creator_net_cents (identique a l'actuel)

```typescript
// Le fan paie : base_price + 5% processing fee
// QuickPay recoit : totalFanPays = base_price * 1.05

// Cote serveur (ugp-confirm) :
const baseCents = record.amount_cents; // prix de base stocke a la creation du record
const fanProcessingFeeCents = Math.round(baseCents * 0.05);
const commissionRate = creatorIsSubscribed ? 0 : 0.10;
const platformCommissionCents = Math.round(baseCents * commissionRate);
const creatorNetCents = baseCents - platformCommissionCents;
const totalPlatformFee = platformCommissionCents + fanProcessingFeeCents;
```

### 3.5 Split chatter (60/25/15) — pour les achats de liens attribues

Quand un achat de lien est attribue a un chatter (via `chtref`), le split est different :

```typescript
// Prix de base du lien (hors 5% fee)
const baseCents = link.price_cents;
const fanFee = Math.round(baseCents * 0.05);

// Split INDEPENDANT du statut premium (toujours 60/25/15)
const creatorShare = Math.round(baseCents * 0.60);
const chatterShare = Math.round(baseCents * 0.25);
const platformShare = baseCents - creatorShare - chatterShare; // ~15%
const totalPlatformFee = platformShare + fanFee;

// Credits :
// → credit_creator_wallet(creator_id, creatorShare)
// → increment profiles.chatter_earnings_cents pour le chatter (via RPC existante)
```

Les donnees du chatter sont pre-stockees dans le record `purchases` a la creation (avant le checkout), donc `ugp-confirm` les retrouve depuis la DB.

### 3.6 Retrait (withdrawal)

**Flux detaille** :

1. **Createur** accede a son dashboard → onglet "Wallet" → bouton "Withdraw"
2. **Modal** : montant (pre-rempli avec le solde), confirmation IBAN affiche
3. **Frontend** appelle `request-withdrawal` edge function
4. **Edge function** :
   - Verifie auth
   - Verifie `payout_setup_complete = true` (IBAN renseigne)
   - Verifie `wallet_balance_cents >= amount_cents`
   - Verifie `amount_cents >= MIN_WITHDRAWAL_CENTS` (5000 = $50)
   - Verifie qu'il n'y a pas de retrait `pending` ou `approved` en cours
   - Appelle `debit_creator_wallet(creator_id, amount_cents)` (atomique, FOR UPDATE)
   - Insere dans `payouts` : status='pending', bank_iban, bank_holder_name, requested_at=NOW()
   - Envoie email admin (notification nouveau retrait, doit utiliser la même manière et même templates que comment sont envoyés les mails sur la plateforme actuellement sinon ça ne marche pas)
   - Envoie email createur (confirmation demande)
   - Retourne `{ success: true, payout_id, new_balance }`
5. **Admin** voit le retrait dans son dashboard admin
6. **Admin** effectue le virement SEPA manuellement
7. **Admin** marque le retrait comme `completed` (via admin edge function ou direct DB)

### 3.7 Table payouts — structure finale apres migration

| Colonne | Type | Utilisation |
|---------|------|-------------|
| `id` | UUID PK | Identifiant |
| `creator_id` | UUID FK → profiles | Le createur |
| `amount_cents` | INTEGER | Montant du retrait |
| `currency` | TEXT DEFAULT 'EUR' | Devise |
| `status` | TEXT CHECK | 'pending' → 'approved' → 'processing' → 'completed' ou 'rejected' |
| `stripe_payout_id` | TEXT | **LEGACY** — garder pour historique Stripe, NULL pour les nouveaux |
| `bank_iban` | TEXT | IBAN snapshot au moment de la demande |
| `bank_holder_name` | TEXT | Nom du titulaire snapshot |
| `admin_notes` | TEXT | Notes internes admin |
| `requested_at` | TIMESTAMPTZ | Date de la demande |
| `processed_at` | TIMESTAMPTZ | Date du traitement admin |
| `rejection_reason` | TEXT | Raison si rejete |
| `created_at` | TIMESTAMPTZ | Date creation |
| `paid_at` | TIMESTAMPTZ | Date du virement effectif |

---

<a id="4-phase-2"></a>
## 4. PHASE 2 — Checkout et Callbacks (Backend)

### 4.1 Composant frontend `QuickPayForm`

**Creer** : `src/components/payment/QuickPayForm.tsx`

```typescript
// Ce composant recoit les champs du formulaire QuickPay et les soumet automatiquement
// Il cree un <form> invisible avec des <input type="hidden"> et appelle form.submit()

interface QuickPayFormProps {
  fields: Record<string, string>;
  // Optionnel : ouvrir dans une nouvelle fenetre (pour le chat)
  openInNewWindow?: boolean;
}

// Usage :
// 1. Edge function retourne { fields: { QuickPayToken: '...', SiteID: '...', ... } }
// 2. Frontend passe ces champs a <QuickPayForm fields={data.fields} />
// 3. Le composant cree et soumet le formulaire automatiquement
```

**Pour le chat** (`window.open` pattern) :
```typescript
// ChatTipForm et ChatCustomRequest utilisent window.open pour ne pas quitter le chat
// Avec un formulaire POST, on cree le form dans une popup :
const win = window.open('about:blank', '_blank');
if (win) {
  const doc = win.document;
  const form = doc.createElement('form');
  form.method = 'POST';
  form.action = 'https://quickpay.ugpayments.ch/';
  Object.entries(fields).forEach(([name, value]) => {
    const input = doc.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  doc.body.appendChild(form);
  form.submit();
}
```

### 4.2 Edge Function : `create-link-checkout` (remplace `create-link-checkout-session`)

**Fichier** : `supabase/functions/create-link-checkout/index.ts`

**Request body** (inchange) :
```json
{ "slug": "xxx", "buyerEmail": "fan@email.com", "conversation_id": "...", "chtref": "..." }
```

**Response** (CHANGE : plus d'URL Stripe, mais les champs du formulaire) :
```json
{
  "fields": {
    "QuickPayToken": "...",
    "SiteID": "123",
    "AmountTotal": "21.00",
    "CurrencyID": "USD",
    "ItemName[0]": "Unlock: Mon contenu exclusif",
    "ItemQuantity[0]": "1",
    "ItemAmount[0]": "21.00",
    "ItemDesc[0]": "One-time access to exclusive content on Exclu",
    "AmountShipping": "0.00",
    "ShippingRequired": "false",
    "MembershipRequired": "false",
    "ApprovedURL": "https://exclu.at/l/slug?payment_success=true&ref=link_uuid",
    "ConfirmURL": "https://qexnwezetjlbwltyccks.supabase.co/functions/v1/ugp-confirm",
    "DeclinedURL": "https://exclu.at/l/slug?payment_failed=true",
    "MerchantReference": "link_<purchase_uuid>",
    "Email": "fan@email.com"
  }
}
```

**Logique interne** :
1. Valider le lien (existe, publie, prix > 0)
2. Verifier que le createur a `payout_setup_complete = true` (remplace `stripe_connect_status === 'complete'`)
3. Calculer le montant total fan : `(price_cents * 1.05) / 100` arrondi a 2 decimales
4. Si `chtref` present : resoudre le chatter via RPC `resolve_chatter_ref`
5. **Pre-creer le record `purchases`** avec status='pending', toutes les metadonnees (chatter_id, conversation_id, amounts)
6. Retourner les champs du formulaire avec `MerchantReference = link_<purchase.id>`

### 4.3 Edge Function : `create-tip-checkout` (adapter)

**Meme pattern** : pre-creer le record `tips` (status='pending'), retourner les champs du formulaire.

`MerchantReference = tip_<tip.id>`

Le record `tips` stocke deja toutes les metadonnees necessaires (fan_id, creator_id, amount_cents, message, is_anonymous).

### 4.4 Edge Function : `create-gift-checkout` (adapter)

`MerchantReference = gift_<gift_purchase.id>`

Pre-creer `gift_purchases` (status='pending').

### 4.5 Edge Function : `ugp-confirm` (NOUVEAU — remplace `stripe-webhook`)

**Fichier** : `supabase/functions/ugp-confirm/index.ts`
**Config** : `verify_jwt = false`

C'est la piece maitresse. Il recoit le POST de QuickPay apres chaque paiement.

**Parsing du body** (application/x-www-form-urlencoded) :
```typescript
const body = Object.fromEntries(new URLSearchParams(await req.text()));
// body.MerchantReference, body.Amount, body.TransactionID, body.CustomerEmail,
// body.Key, body.TransactionState, body.CardMask, body.SiteID, ...
```

**Logique principale** :

```
1. Logger dans payment_events (raw_payload = body en JSON)
2. Verifier la securite : body.Key === 'GSibxqsSpjOXMDYMuBxxenYkCfKOIOKC' (env var QUICKPAY_CONFIRM_KEY)
   → Si mismatch : log + return 401
3. Verifier l'idempotence : TransactionID deja traite dans payment_events ? → return 200
4. Parser MerchantReference : "type_uuid" → { type, recordId }
5. Detecter le TransactionState :
   - 'Sale' → paiement direct (liens, tips, gifts, subscription)
   - 'Authorize' → pre-auth (custom requests) — NE PAS crediter le wallet, juste passer en 'pending'
   - Autre (Capture, Void, Refund) → ignore ici (traite par ugp-listener)

6. Router selon le type :

   TYPE = "link" (TransactionState attendu : 'Sale') :
     a. Charger le record purchases WHERE id = recordId
     b. Verifier status = 'pending' (sinon deja traite)
     c. Verifier le montant (Amount * 100 ≈ purchases.amount_cents * 1.05)
     d. Calculer la commission (free 10% / premium 0%) + 5% processing fee
     e. Si chatter attribue :
        - Calculer split 60/25/15
        - RPC increment_chatter_earnings(chatter_id, chatter_share)
        - Si conversation_id : RPC increment_conversation_revenue(conversation_id, total)
     f. UPDATE purchases SET status='succeeded', ugp_transaction_id, creator_net_cents, platform_fee_cents, access_token=crypto.randomUUID()
     g. RPC credit_creator_wallet(creator_id, creator_net_cents)
     h. Envoyer email Brevo avec le lien d'acces (access_token)
     i. UPDATE purchases SET email_sent=true
     j. Verifier bonus referral $100 (si createur refere et net > $1000 en 90 jours)
     k. UPDATE payment_events SET processed=true

   TYPE = "tip" :
     a. Charger tips WHERE id = recordId
     b. Verifier status = 'pending'
     c. Calculer commission
     d. UPDATE tips SET status='succeeded', ugp_transaction_id, paid_at, platform_fee_cents, creator_net_cents, fan_email=body.CustomerEmail
     e. RPC credit_creator_wallet(creator_id, creator_net_cents)
     f. Envoyer email Brevo notification createur
     g. Si !is_anonymous && fan_id : creer/mettre a jour conversation

   TYPE = "gift" :
     a. Charger gift_purchases WHERE id = recordId
     b. Verifier status = 'pending'
     c. Calculer commission
     d. UPDATE gift_purchases SET status='succeeded', ugp_transaction_id, paid_at, platform_fee_cents, creator_net_cents
     e. UPDATE wishlist_items SET gifted_count = gifted_count + 1
     f. RPC credit_creator_wallet(creator_id, creator_net_cents)
     g. Envoyer email Brevo notification createur

   TYPE = "sub" :
     a. Parser le user_id depuis le MerchantReference (sub_<user_id>)
     b. UPDATE profiles SET is_creator_subscribed=true, subscription_ugp_member_id, subscription_expires_at
     c. Si premiere souscription :
        - show_join_banner=false, show_certification=true, show_deeplinks=true, show_available_now=true
     d. Si referral existe : crediter 35% de 3900 = 1365 cents au referrer
     e. UPDATE referrals SET status='converted', commission_earned_cents += 1365

   TYPE = "req" (TransactionState attendu : 'Authorize') :
     a. Charger custom_requests WHERE id = recordId
     b. Verifier status = 'pending_payment'
     c. Verifier le montant
     d. UPDATE custom_requests SET status='pending', ugp_transaction_id=body.TransactionID, ugp_merchant_reference=body.MerchantReference
     e. NE PAS crediter le wallet (fonds seulement bloques, pas debites)
     f. Envoyer email Brevo au createur : "New paid request — $X on hold"
     g. Creer/mettre a jour conversation + message systeme
     h. Si is_new_account : envoyer email de confirmation fan

7. Retourner HTTP 200
```

### 4.6 Edge Function : `ugp-listener` (NOUVEAU — refunds, chargebacks)

**Fichier** : `supabase/functions/ugp-listener/index.ts`
**Config** : `verify_jwt = false`

URL configuree par UGPayments : `https://qexnwezetjlbwltyccks.supabase.co/functions/v1/ugp-listener`

Ce endpoint recoit les POST pour les changements de statut APRES le paiement initial : refunds, chargebacks, fraud.

```typescript
// Parsing identique a ugp-confirm
const body = Object.fromEntries(new URLSearchParams(await req.text()));

// Verifier Key
if (body.Key !== QUICKPAY_CONFIRM_KEY) return new Response('Unauthorized', { status: 401 });

// Logger dans payment_events
await logPaymentEvent(body);

// Selon TransactionState :
switch (body.TransactionState) {
  case 'Refund':
    // Trouver la transaction originale via TransactionID ou MerchantReference
    // Debiter le wallet du createur si deja credite
    // Mettre a jour le statut du record en 'refunded'
    break;

  case 'Chargeback':
  case 'CBK1':
    // Debiter le wallet du createur
    // Alerter admin par email
    // Mettre a jour le statut du record
    break;

  case 'Void':
    // Pour les pre-auth auto-voidees
    // Mettre a jour custom_requests.status = 'expired'
    break;

  case 'Capture':
    // Pour les pre-auth auto-capturees (si configurees)
    // Crediter le wallet du createur
    break;
}

return new Response('OK', { status: 200 });
```

**IMPORTANT** : Pour les refunds et chargebacks, il faut debiter le wallet du createur. Si le wallet est a 0 (le createur a deja retire), le wallet peut devenir negatif — a gerer dans les retraits (bloquer si wallet < min_withdrawal).

### 4.7 Verification du montant (securite anti-tamper)

```typescript
const receivedAmountCents = Math.round(parseFloat(body.Amount) * 100);
const expectedAmountCents = record.amount_cents;
const expectedTotalCents = expectedAmountCents + Math.round(expectedAmountCents * 0.05);

// Tolerer 2 cents d'ecart pour les arrondis
if (Math.abs(receivedAmountCents - expectedTotalCents) > 2) {
  console.error(`AMOUNT MISMATCH: expected ~${expectedTotalCents}, received ${receivedAmountCents}`);
  // Logger mais continuer (le paiement a bien eu lieu)
  // Ajuster les calculs en consequence
}
```

### 4.7 Polling de verification cote frontend (ApprovedURL)

Quand le fan revient sur l'app apres avoir paye, le ConfirmURL peut ne pas avoir encore ete traite.

**Pattern pour PublicLink.tsx** :
```typescript
// URL de retour : /l/{slug}?payment_success=true&ref=link_<uuid>
const ref = searchParams.get('ref');
if (ref && searchParams.get('payment_success')) {
  const [type, recordId] = ref.split('_', 2);

  const pollPayment = async (attempts = 0) => {
    const { data } = await supabase
      .from('purchases')
      .select('status, access_token')
      .eq('id', recordId)
      .single();

    if (data?.status === 'succeeded') {
      // Succes ! Charger le contenu
      return;
    }
    if (attempts < 15) {
      setTimeout(() => pollPayment(attempts + 1), 2000); // 2s interval, max 30s
    } else {
      // Afficher : "Votre paiement est en cours de verification, la page va se rafraichir"
    }
  };
  pollPayment();
}
```

---

<a id="5-phase-3"></a>
## 5. PHASE 3 — Custom Requests (Pre-auth conservee)

### 5.1 BONNE NOUVELLE : Pre-auth disponible sur QuickPay

UGPayments confirme le support de la pre-authorisation (hold + capture/void). Le flux actuel des custom requests est donc **CONSERVE quasi a l'identique**.

**Avant (Stripe)** : `capture_method: 'manual'` → hold 6 jours → `stripe.paymentIntents.capture()` / `.cancel()`
**Apres (QuickPay)** : Pre-auth via champ formulaire (a confirmer) → hold X jours → API capture / void

### 5.2 Flux conserve (quasi identique a l'actuel)

```
1. FAN SOUMET ET PAIE (pre-auth, fonds bloques mais pas debites)
   ├── CreatorPublic.tsx ou ChatCustomRequest.tsx
   ├── Appel create-request-checkout edge function
   ├── INSERT custom_requests (status='pending_payment', expires_at=NOW()+6 jours)
   ├── Retourne champs formulaire QuickPay avec pre-auth active
   ├── Fan redirige sur QuickPay, paie (fonds bloques sur sa carte)
   ├── ConfirmURL → ugp-confirm → status passe a 'pending'
   ├── Email notification au createur "New paid request — $X on hold"
   └── Message dans la conversation

2. CREATEUR REPOND (dans les 6 jours)
   ├── CreatorTipsRequests.tsx → onglet "Requests"
   │
   ├── OPTION A : ACCEPTER & LIVRER
   │   ├── Createur cree un lien de livraison (link draft, upload fichiers)
   │   ├── Appel manage-request action='capture'
   │   ├── API UGPayments : capture la pre-auth → fonds debites
   │   ├── UPDATE custom_requests SET status='delivered', delivery_link_id
   │   ├── RPC credit_creator_wallet(creator_id, creator_net_cents)
   │   ├── Email Brevo au fan avec lien d'acces
   │   └── Toast : "Request accepted — payment captured and content delivered!"
   │
   ├── OPTION B : REFUSER
   │   ├── Appel manage-request action='cancel'
   │   ├── API UGPayments : void la pre-auth → fonds liberes
   │   ├── UPDATE custom_requests SET status='refused'
   │   ├── Fan notifie (fonds relaches, pas de debit)
   │   └── Toast : "Request declined — payment hold released"
   │
   └── PAS DE REPONSE (6 jours)
       ├── Auto-void par UGPayments (si configure) OU cron job Exclu
       ├── UPDATE custom_requests SET status='expired'
       └── Fan notifie (fonds relaches)

3. FAN ACCEDE AU CONTENU
   ├── Lien de livraison accessible (delivery_link_id → links.slug)
   └── Contenu debloqu
```

### 5.3 Avantages de conserver la pre-auth

- **Flux identique a l'actuel** : minimum de changements dans le frontend
- **Le fan s'engage** : ses fonds sont bloques, il ne peut pas disparaitre
- **Pas de remboursement necessaire** : void = liberation immediate, pas de frais
- **UX familiere** : "Your card will only be charged if the creator accepts"

### 5.4 Changements dans `manage-request` (Edge Function)

**Remplacer** les appels Stripe par les appels API UGPayments (refund/capture).

```typescript
// ACTION = 'capture' (createur accepte)
if (action === 'capture') {
  const linkId = deliveryLinkId || request.delivery_link_id;
  if (!linkId) return error('You must upload content before accepting');

  // Verifier contenu (meme logique existante)
  const hasContent = /* check storage_path ou link_media */;
  if (!hasContent) return error('The content link must have at least one photo or video');

  // CAPTURE via API UGPayments (remplace stripe.paymentIntents.capture)
  const { ugpCapture } = await import('../_shared/ugp-api.ts');

  const totalFanPays = amountCents + Math.round(amountCents * 0.05); // base + 5% fee
  const captureAmountDecimal = totalFanPays / 100;

  try {
    const captureResult = await ugpCapture(request.ugp_transaction_id, captureAmountDecimal);
    console.log('UGP capture success:', captureResult.id, captureResult.state);
  } catch (captureErr: any) {
    console.error('UGP capture error:', captureErr.message);
    // Gerer les cas specifiques :
    if (captureErr.message.includes('already been captured')) {
      // Deja capture (idempotent) → continuer
    } else if (captureErr.message.includes('voided')) {
      return jsonError('Payment has been voided — the authorization may have expired.', 400, corsHeaders);
    } else if (captureErr.message.includes('expired')) {
      return jsonError('Payment authorization has expired (6-day limit).', 400, corsHeaders);
    } else {
      return jsonError('Failed to capture payment. Please try again or contact support.', 500, corsHeaders);
    }
  }

  // Calculer commission (identique a l'actuel)
  const commissionRate = creatorProfile.is_creator_subscribed ? 0 : 0.10;
  const platformCommissionCents = Math.round(amountCents * commissionRate);
  const fanProcessingFeeCents = Math.round(amountCents * 0.05);
  const creatorNetCents = amountCents - platformCommissionCents;
  const totalPlatformFee = platformCommissionCents + fanProcessingFeeCents;

  // Crediter le wallet du createur
  await supabase.rpc('credit_creator_wallet', {
    p_creator_id: request.creator_id,
    p_amount_cents: creatorNetCents,
  });

  // Update request
  await supabase.from('custom_requests').update({
    status: 'delivered',
    delivered_at: new Date().toISOString(),
    delivery_link_id: linkId,
    creator_response: creatorResponse,
    platform_fee_cents: totalPlatformFee,
    creator_net_cents: creatorNetCents,
    read_at: new Date().toISOString(),
  }).eq('id', requestId);

  return jsonOk({ success: true, status: 'delivered', creator_net_cents: creatorNetCents });
}

// ACTION = 'cancel' (createur refuse)
if (action === 'cancel') {
  // VOID via API UGPayments (remplace stripe.paymentIntents.cancel)
  const { ugpVoid } = await import('../_shared/ugp-api.ts');

  try {
    await ugpVoid(request.ugp_transaction_id);
    console.log('UGP void success for request:', requestId);
  } catch (voidErr: any) {
    console.error('UGP void error:', voidErr.message);
    // Si deja void ou capture, continuer avec le changement de statut
    if (!voidErr.message.includes('already been voided') &&
        !voidErr.message.includes('already been captured')) {
      return jsonError('Failed to cancel payment authorization.', 500, corsHeaders);
    }
  }

  const newStatus = body.reason === 'expired' ? 'expired' : 'refused';
  await supabase.from('custom_requests').update({
    status: newStatus,
    creator_response: creatorResponse,
    read_at: new Date().toISOString(),
  }).eq('id', requestId);

  return jsonOk({ success: true, status: newStatus });
}
```

### 5.5 `create-request-checkout` — Meme comportement qu'avant, adapte a QuickPay

Le fan paie AU MOMENT DE LA SOUMISSION (comme actuellement).

```typescript
// Generer les champs du formulaire QuickPay avec PRE-AUTH
const fields = {
  QuickPayToken: QUICKPAY_TOKEN,
  SiteID: '98845',
  AmountTotal: totalWithFee.toFixed(2),
  CurrencyID: 'USD',
  // ... items, URLs ...
  MerchantReference: `req_${requestId}`,
  Email: fanEmail,
  // CHAMP PRE-AUTH : a confirmer avec UGPayments
  // Possiblement un champ type "PreAuth" ou "CaptureMethod"
};
```

### 5.6 Status transitions (CONSERVEES comme l'actuel)

```
pending_payment → (ConfirmURL callback) → pending → (capture) → delivered
                                                   → (void/cancel) → refused
                                                   → (auto-void 6j) → expired
```

### 5.7 Points d'attention pour l'implementation

- **ugp-confirm type='req'** : quand le ConfirmURL est appele, le status passe de `pending_payment` a `pending` (fonds bloques). NE PAS crediter le wallet a ce stade.
- **manage-request capture** : APRES capture, crediter le wallet. C'est le seul moment ou l'argent entre dans la cagnotte.
- **ugp_transaction_id** : stocke par ugp-confirm, utilise par manage-request pour capture/void via l'API UGPayments.
- **Auto-void** : si UGPayments supporte un delai configurable d'auto-void (ex: 6 jours), l'activer. Sinon, creer un cron job ou une verification cote frontend.

---

<a id="6-phase-4"></a>
## 6. PHASE 4 — Abonnement Premium et Gestion

### 6.1 Souscription via QuickPay

**Edge function** : `create-creator-subscription` (adapter)

```typescript
// Si le createur N'EST PAS abonne :
// Generer un formulaire QuickPay subscription
const fields = {
  QuickPayToken: QUICKPAY_TOKEN,
  SiteID: QUICKPAY_SITE_ID,
  AmountTotal: '39.00',
  CurrencyID: 'USD',
  AmountShipping: '0.00',
  ShippingRequired: 'false',
  MembershipRequired: 'true',
  ShowUserNamePassword: 'false',
  MembershipUsername: user.id, // UUID Supabase comme username
  SubscriptionPlanId: '11027',  // Plan Premium $39/mois (env var QUICKPAY_SUB_PLAN_ID)
  ItemName0: 'Exclu Premium Creator Plan',
  ItemQuantity0: '1',
  ItemAmount0: '39.00',
  ItemDesc0: 'Monthly subscription - 0% commission on all sales',
  ApprovedURL: `${PUBLIC_SITE_URL}/app?subscription=success`,
  ConfirmURL: `${PROJECT_URL}/functions/v1/ugp-confirm`,
  DeclinedURL: `${PUBLIC_SITE_URL}/app?subscription=failed`,
  MerchantReference: `sub_${user.id}`,
  Email: user.email,
};

return { fields };
```

### 6.2 Membership Postback (renouvellement, annulation)

**Edge function** : `ugp-membership-confirm` (NOUVEAU)
**Fichier** : `supabase/functions/ugp-membership-confirm/index.ts`
**Config** : `verify_jwt = false`

URL configuree dans le merchant portal UGPayments (Member Postback URL).

```typescript
const body = Object.fromEntries(new URLSearchParams(await req.text()));
// body.Action, body.Key, body.Username, body.MemberId, body.SubscriptionPlanId, ...

// Verifier le Key
if (body.Key !== QUICKPAY_CONFIRM_KEY) {
  return new Response('Unauthorized', { status: 401 });
}

const userId = body.Username; // On a utilise user.id comme MembershipUsername
const action = body.Action; // 'Add' | 'Cancel' | 'Inactive'

switch (action) {
  case 'Add':
  case 'Rebill':  // Rebill = renouvellement mensuel automatique
    // Activation ou renouvellement
    const { data: profile } = await supabase.from('profiles')
      .select('is_creator_subscribed, referred_by')
      .eq('id', userId).single();

    const wasSubscribed = profile?.is_creator_subscribed;

    const updatePayload: any = {
      is_creator_subscribed: true,
      subscription_ugp_member_id: body.MemberId,
      subscription_ugp_username: body.Username,
    };

    // Premiere souscription : activer les flags premium
    if (!wasSubscribed) {
      updatePayload.show_join_banner = false;
      updatePayload.show_certification = true;
      updatePayload.show_deeplinks = true;
      updatePayload.show_available_now = true;
    }

    await supabase.from('profiles').update(updatePayload).eq('id', userId);

    // Commission referral (35% de $39 = 1365 cents)
    // A chaque Add (creation + renouvellement)
    const { data: referral } = await supabase.from('referrals')
      .select('id, referrer_id, status')
      .eq('referred_id', userId)
      .neq('status', 'inactive')
      .single();

    if (referral) {
      const commissionCents = Math.round(3900 * 0.35); // 1365
      await supabase.from('referrals').update({
        commission_earned_cents: supabase.rpc('increment', { x: commissionCents }),
        status: 'converted',
        converted_at: new Date().toISOString(),
      }).eq('id', referral.id);

      // Crediter le referrer
      await supabase.from('profiles').update({
        affiliate_earnings_cents: supabase.rpc('increment', { x: commissionCents }),
      }).eq('id', referral.referrer_id);
    }
    break;

  case 'Cancel':
  case 'Inactive':
    await supabase.from('profiles').update({
      is_creator_subscribed: false,
      show_join_banner: true,
      show_certification: false,
      show_deeplinks: false,
      show_available_now: false,
      subscription_expires_at: new Date().toISOString(),
    }).eq('id', userId);
    break;
}

return new Response('OK', { status: 200 });
```

### 6.3 Remplacement du Billing Portal Stripe

Stripe offrait un portail self-service pour gerer l'abonnement. Il faut le reconstruire dans l'app.

**Nouvelle section dans Profile.tsx → onglet "Subscription"** :

```
SI ABONNE PREMIUM :
  ┌──────────────────────────────────────────────┐
  │  ⚡ Premium Plan                    Active   │
  │                                              │
  │  0% commission on all your sales.            │
  │  You keep 100% of your revenue.              │
  │                                              │
  │  $39/month • Billed monthly                  │
  │                                              │
  │  [Cancel subscription]                       │
  └──────────────────────────────────────────────┘

SI NON ABONNE :
  ┌──────────────────────────────────────────────┐
  │  Free Plan                                   │
  │                                              │
  │  10% commission on sales.                    │
  │  Upgrade to keep 100%.                       │
  │                                              │
  │  [Upgrade to Premium – $39/mo]               │
  └──────────────────────────────────────────────┘
```
-> Doit être ultra esthétique, même ui que les cards de la landing page. L'ui sur cette partie est très très importante, elle soit être soignée, moderne, pixel perfect, responsive.

**Annulation** :
UGPayments confirme que le Cancel **NE peut PAS etre soumis server-to-server**. Il faut un formulaire HTML dans le navigateur.

Le bouton "Cancel subscription" dans Profile.tsx soumet un formulaire HTML invisible :

```typescript
// Dans Profile.tsx, handleCancelSubscription() :
const handleCancelSubscription = () => {
  // Confirmation dialog avant annulation
  if (!confirm('Are you sure you want to cancel your Premium subscription?')) return;

  // Creer et soumettre un formulaire HTML vers QuickPay Cancel
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://quickpay.ugpayments.ch/Cancel';

  const fields = {
    QuickpayToken: import.meta.env.VITE_QUICKPAY_TOKEN, // Token public (comme Stripe publishable key)
    username: profile.subscription_ugp_username,         // user.id stocke lors de la souscription
    SiteID: '98845',
  };

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
};
```

**NOTE** : Le QuickPayToken doit etre accessible cote client pour le cancel. Ajouter `VITE_QUICKPAY_TOKEN` dans les variables d'env Vite (le token est deja expose dans les formulaires de paiement, c'est une "cle publique" par design).

**UX** : Le bouton Cancel devrait d'abord ouvrir un AlertDialog (composant shadcn existant) pour confirmer, puis soumettre le formulaire.

```
  ┌──────────────────────────────────────────────┐
  │  Cancel Premium Subscription?                │
  │                                              │
  │  You will lose:                              │
  │  • 0% commission (back to 10%)               │
  │  • Certification badge                       │
  │  • Priority support                          │
  │                                              │
  │  Your current earnings are safe.             │
  │                                              │
  │  [Keep Premium]     [Cancel subscription]    │
  └──────────────────────────────────────────────┘
```

Style : AlertDialog avec `variant="destructive"` sur le bouton de confirmation.

---

<a id="7-phase-5"></a>
## 7. PHASE 5 — Onboarding Paiement (IBAN) et Retraits

### 7.1 Remplacement de Stripe Connect par la saisie IBAN

**Avant** : Le createur passait par Stripe Connect Express (KYC, verification d'identite, etc.)
**Apres** : Le createur saisit simplement son IBAN et le nom du titulaire

**Edge function** : `save-bank-details` (NOUVEAU)

```typescript
// POST { iban, bic, holder_name, country }
// Validation IBAN cote serveur (format, longueur par pays)
// UPDATE profiles SET bank_iban, bank_bic, bank_holder_name, bank_country, payout_setup_complete=true
// Retourner { success: true }
```

### 7.2 Validation IBAN

```typescript
function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) return false;

  // Verification modulo 97 (norme ISO 13616)
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = '';
  for (const digit of numeric) {
    remainder = String(Number(remainder + digit) % 97);
  }
  return Number(remainder) === 1;
}
```

### 7.3 UI d'onboarding paiement

**Remplacer** le flow Stripe Connect dans `Profile.tsx` par :

```
SI IBAN NON RENSEIGNE :
  ┌──────────────────────────────────────────────┐
  │  🏦 Payout Account                          │
  │                                              │
  │  Set up your bank details to receive payouts │
  │                                              │
  │  IBAN: [________________________]            │
  │  Account holder: [________________]          │
  │  BIC (optional): [___________]               │
  │                                              │
  │  [Save bank details]                         │
  └──────────────────────────────────────────────┘

SI IBAN RENSEIGNE :
  ┌──────────────────────────────────────────────┐
  │  🏦 Payout Account          ✓ Complete       │
  │                                              │
  │  IBAN: FR76 •••• •••• •••• 1234              │
  │  Holder: Jean Dupont                         │
  │                                              │
  │  [Edit bank details]                         │
  └──────────────────────────────────────────────┘
```

### 7.4 Gating : ou `payout_setup_complete` remplace `stripe_connect_status`

Tous les endroits qui verifient `stripe_connect_status === 'complete'` doivent verifier `payout_setup_complete === true` :

| Fichier | Verification actuelle | Nouvelle verification |
|---------|----------------------|----------------------|
| `create-link-checkout` (backend) | `stripe_connect_status !== 'complete'` | `payout_setup_complete !== true` |
| `create-tip-checkout` (backend) | `stripe_account_id` + `stripe_connect_status` | `payout_setup_complete` |
| `create-gift-checkout` (backend) | `stripe_account_id` + `stripe_connect_status` | `payout_setup_complete` |
| `CreatorPublic.tsx` (frontend) | `isStripeReady` | `isPayoutReady` (= `profile.payout_setup_complete`) |
| `AppDashboard.tsx` (frontend) | Modal Stripe Connect | Modal "Setup bank details" |
| `ProfileContext.tsx` | `stripe_connect_status`, `stripe_account_id` | `payout_setup_complete`, `bank_iban` |
| `Profile.tsx` | Section "Payment Account" | Section "Payout Account" |

### 7.5 Suppression de StripeValidation.tsx

La page `/app/stripe-validation` et sa route dans `App.tsx` doivent etre supprimees. Plus besoin de polling pour verifier l'onboarding — la saisie IBAN est instantanee.

---

<a id="8-phase-6"></a>
## 8. PHASE 6 — Frontend (Pages, Composants, Dashboards)

### 8.1 Pages a modifier

| Page | Modifications |
|------|--------------|
| **PublicLink.tsx** | Remplacer `supabase.functions.invoke('create-link-checkout-session')` par `create-link-checkout` + QuickPayForm. Remplacer `?session_id=` par `?ref=link_uuid`. Adapter le polling. |
| **CreatorPublic.tsx** | Adapter tip checkout, custom request soumission (gratuite), gift checkout. Remplacer `window.location.href = data.url` par soumission formulaire QuickPay. Remplacer `isStripeReady` par `isPayoutReady`. |
| **ChatTipForm.tsx** | Adapter pour `window.open` + formulaire QuickPay (pas de `window.location.href`). |
| **ChatCustomRequest.tsx** | Adapter pour soumission gratuite (pas de checkout). L'edge function retourne juste `{ success: true }`. |
| **CreatorTipsRequests.tsx** | Supprimer appels Stripe dans manage-request. Ajouter le bouton "Content ready, notify fan" au lieu de "Accept & capture". |
| **FanDashboard.tsx** | Ajouter bouton "Pay & unlock" pour les requests status='accepted'. |
| **TipSuccess.tsx** | Remplacer `?session_id=` par `?ref=tip_uuid`. Adapter le claim-tip. |
| **RequestSuccess.tsx** | Adapter pour le nouveau flux (pas de paiement a la soumission). Afficher "Request submitted, waiting for creator". |
| **GiftSuccess.tsx** | Adapter parametres URL. |
| **Profile.tsx** | Section IBAN au lieu de Stripe Connect. Section abonnement avec Cancel intégré. |
| **AppDashboard.tsx** | Wallet display avec nouveau calcul. Bouton retrait. Modal IBAN au lieu de Stripe Connect. |
| **HelpPayoutsPricing.tsx** | Mettre a jour la doc (wallet + retrait manuel au lieu de payout auto). |
| **StripeValidation.tsx** | **SUPPRIMER** |

### 8.2 Composants a creer

| Composant | Role |
|-----------|------|
| `src/components/payment/QuickPayForm.tsx` | Formulaire invisible pour soumettre a QuickPay |
| `src/components/payment/BankDetailsForm.tsx` | Formulaire saisie IBAN/BIC/titulaire |
| `src/components/payment/WalletCard.tsx` | Card affichant le solde wallet + bouton retrait |
| `src/components/payment/WithdrawalModal.tsx` | Modal de demande de retrait |
| `src/components/payment/WithdrawalHistory.tsx` | Historique des retraits (table payouts) |
| `src/components/payment/PayUnlockButton.tsx` | Bouton "Pay & unlock" pour custom requests acceptees |

### 8.3 ProfileContext.tsx — Champs a charger

**Supprimer du contexte** :
- `stripe_account_id`
- `stripe_connect_status`

**Ajouter au contexte** :
- `payout_setup_complete`
- `bank_iban` (masque : `FR76 •••• •••• 1234`)
- `wallet_balance_cents`

---

<a id="9-phase-7"></a>
## 9. PHASE 7 — Dashboard Cards et Metriques

### 9.1 Ce qui NE change PAS dans les calculs

Les formules de commission et de revenue restent identiques :

```typescript
// Achats de liens : strip 5% fee puis commission
revenueSum = purchases.reduce((sum, p) =>
  sum + Math.round((p.amount_cents / 1.05) * (1 - rate)), 0);

// Tips : commission directe (pas de 5% fee cote tips)
tipsSum = tips.reduce((sum, t) =>
  sum + Math.round(t.amount_cents * (1 - rate)), 0);
```

**MAIS** : avec le wallet, le `walletBalance` vient directement de la DB au lieu d'etre calcule cote frontend.

### 9.2 AppDashboard.tsx — Modifications

**AVANT** :
```typescript
const walletBalance = revenueSum + tipsSum - totalPayoutsCents;
```

**APRES** :
```typescript
// Charger directement depuis profiles
const { data: profile } = await supabase
  .from('profiles')
  .select('wallet_balance_cents, total_earned_cents, total_withdrawn_cents, ...')
  .eq('id', user.id)
  .single();

// Le wallet_balance_cents EST la source de verite
const walletBalance = profile.wallet_balance_cents;
```

**Cards a afficher** :

| Card | Source | Formule |
|------|--------|---------|
| Profile Views | `profiles.profile_view_count` | Inchange |
| Total Sales | `purchases.count WHERE status='succeeded'` | Inchange |
| Revenue | `profiles.total_earned_cents` | **CHANGE** : vient de la DB, plus de calcul frontend |
| Wallet Balance | `profiles.wallet_balance_cents` | **NOUVEAU** : affiche le solde retirable |
| Tips Revenue | `tips SUM(amount_cents) WHERE status='succeeded'` | Inchange (calcul frontend pour le detail) |

**Bouton Stripe Connect → Bouton IBAN** :
Le modal/banner qui invite a connecter Stripe est remplace par une invitation a renseigner l'IBAN si `payout_setup_complete = false`.

### 9.3 ReferralDashboard.tsx — Pas de changement

Les referrals sont stockes en DB et les commissions sont creditees par `ugp-membership-confirm`. Les cards affichent :
- `affiliate_earnings_cents` (inchange)
- `referrals.commission_earned_cents` (inchange)
- Le bouton "Request payout" appelle `request-affiliate-payout` (inchange, email admin)

### 9.4 CreatorTipsRequests.tsx — Modifications mineures

**Tips** : Aucun changement dans l'affichage. La query reste `tips WHERE status='succeeded'`.

**Custom Requests** : Ajouter les statuts du nouveau flux dans le filtre et l'affichage :
- `pending` → "Waiting for your response" (bouton Accept/Decline)
- `accepted` → "Waiting for fan payment" (nouveau statut visible)
- `delivered` → "Completed" (fan a paye)
- `refused` → "Declined"
- `expired` → "Expired"

Le bouton "Accept" ne capture plus le paiement. Il met juste le status a 'accepted' et notifie le fan.

### 9.5 FanDashboard.tsx — Modifications

**Custom Requests** : Ajouter le bouton "Pay & unlock" quand `status='accepted'` :

```tsx
{request.status === 'accepted' && request.delivery_link_id && (
  <PayUnlockButton
    requestId={request.id}
    amount={request.proposed_amount_cents}
    creatorId={request.creator_id}
    deliveryLinkSlug={request.delivery_link?.slug}
  />
)}
```

### 9.6 AgencyDashboard.tsx — Modifications

Le calcul de revenue par profil utilise le meme pattern. Avec le wallet :
- Afficher `total_earned_cents` depuis la DB au lieu de recalculer
- Le split par profil necessite de sommer les `creator_net_cents` par profil depuis les tables de transactions

---

<a id="10-phase-8"></a>
## 10. PHASE 8 — Nettoyage Code Mort

### 10.1 Edge Functions a SUPPRIMER

| Fonction | Raison |
|----------|--------|
| `stripe-webhook/` | Remplacee par `ugp-confirm` et `ugp-membership-confirm` |
| `stripe-connect-onboard/` | Remplacee par `save-bank-details` |
| `stripe-connect-status/` | Plus necessaire (IBAN = instantane) |
| `verify-checkout-session/` | Remplacee par polling DB cote frontend |

### 10.2 Pages a SUPPRIMER

| Page | Raison |
|------|--------|
| `src/pages/StripeValidation.tsx` | Plus de callback Stripe Connect |

### 10.3 Route a SUPPRIMER dans App.tsx

```
/app/stripe-validation → SUPPRIMER
```

### 10.4 Imports Stripe a SUPPRIMER dans chaque Edge Function restante

Dans chaque fichier modifie :
- `import Stripe from 'npm:stripe'` → SUPPRIMER
- Toute reference a `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, etc. → SUPPRIMER
- Logique test/live Stripe (`cs_test_*` prefix) → SUPPRIMER
- `stripe.checkout.sessions.create()` → SUPPRIMER
- `stripe.accounts.*` → SUPPRIMER
- `stripe.paymentIntents.*` → SUPPRIMER
- `stripe.billingPortal.*` → SUPPRIMER

### 10.5 Variables d'environnement a SUPPRIMER (Supabase Secrets)

```
STRIPE_SECRET_KEY
STRIPE_SECRET_KEY_TEST
STRIPE_WEBHOOK_SECRET
STRIPE_WEBHOOK_SECRET_TEST
STRIPE_CREATOR_PRICE_ID
STRIPE_CREATOR_PRICE_ID_TEST
```

### 10.6 Colonnes DB : NE PAS supprimer

Les colonnes `stripe_*` doivent rester pour l'historique des transactions passees. Ne pas les supprimer dans cette migration.

### 10.7 Fichiers de documentation a SUPPRIMER/METTRE A JOUR

| Fichier | Action |
|---------|--------|
| `docs/STRIPE_SYSTEM.md` | SUPPRIMER ou archiver |
| `docs/PLAN_STRIPE_TO_WHOP_MIGRATION.md` | SUPPRIMER (plan precedent obsolete) |
| `CLAUDE.md` | Mettre a jour la section "Flux de paiement Stripe" |

---

<a id="11-checklist"></a>
## 11. CHECKLIST FINALE

### 11.1 Backend (Edge Functions)

- [ ] `create-link-checkout` → retourne champs formulaire QuickPay
- [ ] `create-tip-checkout` → retourne champs formulaire QuickPay
- [ ] `create-gift-checkout` → retourne champs formulaire QuickPay
- [ ] `create-request-checkout` → retourne champs formulaire QuickPay (apres acceptation uniquement)
- [ ] `create-custom-request` → soumission gratuite, notification createur
- [ ] `create-creator-subscription` → formulaire QuickPay subscription
- [ ] `cancel-creator-subscription` → POST vers QuickPay Cancel
- [ ] `ugp-confirm` → callback principal (liens, tips, gifts, requests pre-auth, subscriptions)
- [ ] `ugp-listener` → callback refunds, chargebacks, voids, captures (configure par UGPayments)
- [ ] `ugp-membership-confirm` → callback membership (Add/Cancel/Inactive)
- [ ] `manage-request` → capture/void via API UGPayments (remplace Stripe)
- [ ] `save-bank-details` → saisie IBAN
- [ ] `request-withdrawal` → demande retrait wallet
- [ ] RPC `credit_creator_wallet` → credit atomique
- [ ] RPC `debit_creator_wallet` → debit atomique

### 11.2 Frontend

- [ ] `QuickPayForm` composant
- [ ] `BankDetailsForm` composant
- [ ] `WalletCard` composant
- [ ] `WithdrawalModal` composant
- [ ] `PayUnlockButton` composant
- [ ] `PublicLink.tsx` → nouveau checkout + polling
- [ ] `CreatorPublic.tsx` → tips, gifts, requests adaptes
- [ ] `ChatTipForm.tsx` → window.open + formulaire
- [ ] `ChatCustomRequest.tsx` → soumission gratuite
- [ ] `CreatorTipsRequests.tsx` → accept sans capture
- [ ] `FanDashboard.tsx` → bouton Pay & unlock
- [ ] `Profile.tsx` → IBAN + subscription management
- [ ] `AppDashboard.tsx` → wallet, modal IBAN, metriques
- [ ] `TipSuccess.tsx` → nouveaux params URL
- [ ] `RequestSuccess.tsx` → nouveau messaging (pas de paiement)
- [ ] `GiftSuccess.tsx` → nouveaux params URL
- [ ] `ProfileContext.tsx` → `payout_setup_complete` au lieu de Stripe
- [ ] `HelpPayoutsPricing.tsx` → documentation a jour

### 11.3 Dashboard Cards et Metriques

- [ ] AppDashboard : wallet_balance_cents depuis DB
- [ ] AppDashboard : total_earned_cents depuis DB
- [ ] AppDashboard : modal IBAN au lieu de Stripe Connect
- [ ] CreatorTipsRequests : status 'accepted' visible + messaging
- [ ] FanDashboard : bouton Pay pour requests acceptees
- [ ] AgencyDashboard : revenue depuis DB
- [ ] ReferralDashboard : inchange (commissions en DB)

### 11.4 Nettoyage

- [ ] Supprimer `stripe-webhook/`
- [ ] Supprimer `stripe-connect-onboard/`
- [ ] Supprimer `stripe-connect-status/`
- [ ] Supprimer `verify-checkout-session/`
- [ ] Supprimer `StripeValidation.tsx` + route
- [ ] Supprimer tous les `import Stripe` restants
- [ ] Supprimer les env vars Stripe
- [ ] Mettre a jour `CLAUDE.md`
- [ ] Supprimer `docs/STRIPE_SYSTEM.md`
- [ ] Supprimer `docs/PLAN_STRIPE_TO_WHOP_MIGRATION.md`

### 11.5 Securite

- [ ] QuickPayToken en env var backend + VITE_ env var frontend
- [ ] Verification `body.Key === QUICKPAY_CONFIRM_KEY` dans ugp-confirm et ugp-listener
- [ ] Verification montant dans ugp-confirm (comparer DB vs Amount recu)
- [ ] Idempotence via TransactionID unique (index UNIQUE sur payment_events.transaction_id)
- [ ] IBAN stocke avec RLS strict
- [ ] Table payment_events pour audit
- [ ] ugp-listener configure chez UGPayments pour refunds/chargebacks

### 11.6 Informations confirmees par UGPayments

- [x] SiteID = 98845
- [x] Key ConfirmURL = GSibxqsSpjOXMDYMuBxxenYkCfKOIOKC
- [x] Sandbox test card = 4242424242424242, 12/29, CVV 123 (decline: 555)
- [x] Pre-auth disponible (capture/void manuelle)
- [x] API de remboursement disponible
- [x] ConfirmURL arrive AVANT redirect
- [x] Listener URL pour refunds/chargebacks (a configurer)
- [x] Postback membership a chaque renouvellement
- [x] Cancel form = HTML client uniquement
- [x] Email pre-rempli sur la page de paiement
- [x] HTTPS obligatoire

### 11.7 Informations encore en attente (2 items)

- [x] ~~Documentation API refund~~ → RECU (Refund/Capture/Void doc v1.0)
- [x] ~~Champ formulaire pour pre-auth~~ → Configure automatiquement par UGP
- [x] ~~Delai auto-void~~ → 6 jours, configure par UGP
- [x] ~~ConfirmURL renouvellements~~ → Va au Member Postback URL avec Action='Rebill'
- [x] ~~SubscriptionPlanId~~ → 11027
- [ ] **MerchantId** pour l'API REST (capture/void/refund) → **A DEMANDER**
- [ ] **OAuth Bearer Token** pour l'API REST → **A DEMANDER**
- [ ] Listener URL a configurer par UGP → **A DEMANDER** (`https://qexnwezetjlbwltyccks.supabase.co/functions/v1/ugp-listener`)
- [ ] Member Postback URL a configurer par UGP → **A DEMANDER** (`https://qexnwezetjlbwltyccks.supabase.co/functions/v1/ugp-membership-confirm`)

---

## 16. MULTI-PROFIL : GESTION DU PRICING EVOLUTIF

### 16.1 Modele de pricing actuel

| Profils | Prix/mois | Formule |
|---------|-----------|---------|
| 1-2 | $39 | Base |
| 3 | $49 | $39 + 1 × $10 |
| 4 | $59 | $39 + 2 × $10 |
| 5 | $69 | $39 + 3 × $10 |
| N | $39 + (N-2)×$10 | Pas de limite |

Code existant :
- `src/pages/CreateProfile.tsx:13-20` — constantes + `calculateMonthlyTotal()`
- `src/pages/Profile.tsx:1026-1032` — affichage du prix
- SQL function `calculate_subscription_price(p_user_id)` dans la DB

### 16.2 Approche recommandee : Plan de base UGPayments + surcharge interne

Puisque QuickPay ne permet pas facilement de modifier le montant d'un abonnement, on utilise une approche hybride :

```
1. Un seul plan UGPayments a $39/mois (base, gere le renouvellement automatique)
2. Les $10/profil supplementaire sont geres EN INTERNE par Exclu
3. Un cron job mensuel debite le supplement du wallet du createur
4. Si le wallet n'a pas assez → notification + grace period
```

### 16.3 Flux detaille pour l'ajout de profils

```
CREATEUR VEUT AJOUTER DES PROFILS :

1. CreateProfile.tsx affiche le prix supplementaire :
   "Adding a 3rd profile will increase your monthly cost by $10/mo"
   "New monthly total: $49/mo ($39 subscription + $10 profile addon)"

2. Le createur confirme → profil cree immediatement
   (pas de nouveau paiement a ce stade)

3. Le cron job mensuel (ou a chaque renouvellement) :
   a. Calcule le supplement : (active_profiles - 2) × 1000 cents
   b. Si supplement > 0 :
      - Debite wallet_balance_cents du supplement
      - Insert dans une table addon_charges (historique)
      - Si wallet insuffisant → email warning + 7 jours de grace
      - Si toujours insuffisant apres 7 jours → desactiver les profils excedentaires

4. Le dashboard affiche :
   "Monthly plan: $39/mo (subscription) + $20/mo (2 extra profiles) = $59/mo"
```

### 16.4 Table `addon_charges` (nouvelle)

```sql
CREATE TABLE IF NOT EXISTS addon_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  amount_cents INTEGER NOT NULL,
  profile_count INTEGER NOT NULL,
  extra_profiles INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'charged', 'failed', 'waived')),
  charged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_addon_charges_creator ON addon_charges(creator_id);
```

### 16.5 Traitement au renouvellement (dans `ugp-membership-confirm` ou `ugp-confirm`)

```typescript
// Quand on recoit un postback de renouvellement (Action='Add' recurrent) :
case 'Add':
  // 1. Activer/maintenir l'abonnement
  await supabase.from('profiles').update({ is_creator_subscribed: true }).eq('id', userId);

  // 2. Calculer et debiter le supplement profils
  const { data: profiles } = await supabase
    .from('creator_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true);

  const profileCount = profiles?.length || 1;
  const extraProfiles = Math.max(0, profileCount - 2);
  const addonCents = extraProfiles * 1000; // $10 par profil supplementaire

  if (addonCents > 0) {
    try {
      await supabase.rpc('debit_creator_wallet', {
        p_creator_id: userId,
        p_amount_cents: addonCents,
      });
      // Logger la charge
      await supabase.from('addon_charges').insert({
        creator_id: userId,
        amount_cents: addonCents,
        profile_count: profileCount,
        extra_profiles: extraProfiles,
        period_start: new Date(),
        period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'charged',
        charged_at: new Date().toISOString(),
      });
    } catch (err) {
      // Wallet insuffisant → envoyer email warning
      await sendAddonChargeFailedEmail(userId, addonCents);
      await supabase.from('addon_charges').insert({
        creator_id: userId,
        amount_cents: addonCents,
        profile_count: profileCount,
        extra_profiles: extraProfiles,
        period_start: new Date(),
        period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'failed',
      });
    }
  }

  // 3. Commission referral (35% de $39 seulement, pas du supplement)
  // ...
```

### 16.6 UI dans Profile.tsx — Section abonnement avec profils

```
SI ABONNE PREMIUM AVEC 3+ PROFILS :
  ┌──────────────────────────────────────────────┐
  │  ⚡ Premium Plan                    Active   │
  │                                              │
  │  Base subscription         $39.00/mo         │
  │  2 additional profiles     $20.00/mo         │
  │  ─────────────────────────────────────        │
  │  Total                     $59.00/mo         │
  │                                              │
  │  Profile addon ($10/profile) is deducted     │
  │  from your wallet at each renewal.           │
  │                                              │
  │  [Cancel subscription]                       │
  └──────────────────────────────────────────────┘
```

Style : meme conteneur que la section abonnement actuelle, utiliser les composants `div` + `text-white/40` pour les labels, `text-white font-semibold` pour les montants.

### 16.7 Cas de souscription directe avec N profils

Quand un createur/agence s'abonne et veut directement X profils :

1. Le createur s'abonne a $39/mois (plan de base UGPayments)
2. Apres paiement, il peut creer jusqu'a 2 profils (inclus)
3. Pour chaque profil supplementaire :
   - `CreateProfile.tsx` affiche le cout additionnel
   - Le profil est cree immediatement
   - Le supplement sera debite au prochain renouvellement
4. Le createur voit le recapitulatif complet dans Profile.tsx

---

## 17. SECURITE DES PAIEMENTS

### 17.1 Validation ConfirmURL (backend)

```typescript
// Dans ugp-confirm et ugp-listener :

// 1. Verifier le Key partage
if (body.Key !== Deno.env.get('QUICKPAY_CONFIRM_KEY')) {
  console.error('Invalid Key in ConfirmURL callback');
  return new Response('Unauthorized', { status: 401 });
}

// 2. Verifier l'IP source (optionnel mais recommande)
// Charger la whitelist depuis https://quickpay.ugpayments.ch/iplist
// et comparer avec req.headers.get('x-forwarded-for') ou req.headers.get('cf-connecting-ip')

// 3. Verifier le montant (anti-tamper)
const receivedCents = Math.round(parseFloat(body.Amount) * 100);
const expectedCents = record.amount_cents + Math.round(record.amount_cents * 0.05);
if (Math.abs(receivedCents - expectedCents) > 2) {
  console.error(`Amount mismatch: expected ~${expectedCents}, got ${receivedCents}`);
  // Logger l'anomalie mais traiter quand meme (le paiement a eu lieu)
}

// 4. Idempotence : TransactionID unique
// L'index UNIQUE sur payment_events.transaction_id empeche le double-traitement
```

### 17.2 Protection contre la manipulation des formulaires client

Le formulaire QuickPay est soumis cote client → un attaquant pourrait modifier les montants.

**Mesures** :
1. **Montant pre-stocke en DB** : Le record (tip, purchase, etc.) est cree AVANT le checkout avec le montant correct. Le ConfirmURL compare le montant recu avec le montant en DB.
2. **MerchantReference lie au record** : Seuls les records pre-crees sont traites. Un MerchantReference invente sera ignore.
3. **Le QuickPayToken n'est pas un secret** : Il est public par design (comme une cle publishable Stripe). Il ne permet que d'initier un paiement, pas de debiter sans le consentement du payeur.

### 17.3 Protection des donnees bancaires (IBAN)

```
1. Stockage : colonnes bank_iban, bank_bic, bank_holder_name sur profiles
2. RLS : seul le proprietaire peut lire/ecrire ses propres donnees bancaires
3. Affichage masque : "FR76 •••• •••• •••• 7890" (4 derniers chars seulement)
4. Pas de stockage dans les logs ou payment_events
5. Validation IBAN cote serveur (modulo 97) pour eviter les erreurs de saisie
```

### 17.4 Protection wallet (race conditions)

```
1. RPCs credit_creator_wallet / debit_creator_wallet utilisent FOR UPDATE (verrouillage ligne)
2. Pas de calcul cote frontend : le wallet_balance_cents est la source de verite en DB
3. Verification de solde suffisant dans la RPC debit (pas de wallet negatif)
4. Exception : chargebacks peuvent rendre le wallet negatif → bloquer les retraits si wallet < 0
```

### 17.5 Protection contre les doubles paiements

```
1. Index UNIQUE sur payment_events.transaction_id → empeche le double-credit
2. Verification du status du record avant mise a jour (ex: tips.status === 'pending' → 'succeeded')
3. Si le record est deja 'succeeded', retourner 200 sans rien faire (idempotent)
```

### 17.6 Rate limiting (conserver l'existant)

Chaque edge function de checkout conserve son rate limiting actuel :
- `create-link-checkout` : 20 req/min/IP
- `create-tip-checkout` : 10 req/min/IP
- `create-gift-checkout` : 10 req/min/IP
- `create-request-checkout` : 5 req/min/IP
- `request-withdrawal` : 3 req/min/IP (nouveau, plus strict)
- `save-bank-details` : 5 req/min/IP (nouveau)

### 17.7 Logging et audit trail

```
Table payment_events :
  - Chaque callback UGPayments est logue AVANT traitement
  - raw_payload JSONB contient tout le body
  - processed = true/false pour tracer les succes/echecs
  - processing_error pour debugger les problemes
  → Permet la reconciliation financiere et le debugging
```

---

## 18. CHATTER REVENUE ATTRIBUTION — PRESERVATION COMPLETE

### 18.1 Flux actuel (a preserver identiquement)

```
Chatter envoie un lien paye dans le chat
  → chatter_ref genere (12-char hex, crypto.getRandomValues)
  → stocke dans messages.chatter_ref
  → lien affiche avec ?chtref={chatterRef}

Fan clique et achete
  → PublicLink.tsx lit ?chtref depuis l'URL (ligne 216)
  → Passe chtref dans le body de create-link-checkout (ligne 408)
  → Edge function resout chtref → chatter_id via RPC resolve_chatter_ref
  → Calcule split 60/25/15
  → Stocke chatter_id + montants dans le record pre-cree (purchases)

ConfirmURL (ugp-confirm)
  → Retrouve le record purchases avec le MerchantReference
  → Le record contient deja : chat_chatter_id, chatter_earnings_cents, creator_net_cents, platform_fee_cents
  → Credit wallet createur : creator_net_cents (60%)
  → Credit chatter : RPC increment_chatter_earnings(chatter_id, chatter_earnings_cents) (25%)
  → Increment conversation revenue : RPC increment_conversation_revenue(conversation_id, amount)
```

### 18.2 Ce qui change avec UGPayments

**RIEN dans le flux de donnees.** Les metadata qui etaient dans Stripe (chatter_id, montants) sont maintenant pre-stockees dans le record `purchases` en DB. Le `ugp-confirm` les lit directement depuis la DB au lieu de les extraire des metadata Stripe.

**Avantage** : Plus simple et plus fiable car les donnees sont en DB, pas dans des metadata tierces.

### 18.3 Implementation dans ugp-confirm (type='link')

```typescript
// Le record purchases a ete pre-cree par create-link-checkout avec :
// - chat_chatter_id (si chtref resolu)
// - chatter_earnings_cents (si chatter attribue)
// - creator_net_cents
// - platform_fee_cents
// - chat_conversation_id

const purchase = await supabase.from('purchases')
  .select('*, link:links!inner(slug, title, creator_id)')
  .eq('id', recordId).single();

// 1. Mettre a jour le statut
await supabase.from('purchases').update({
  status: 'succeeded',
  ugp_transaction_id: body.TransactionID,
  access_token: crypto.randomUUID(),
}).eq('id', recordId);

// 2. Crediter le wallet createur
await supabase.rpc('credit_creator_wallet', {
  p_creator_id: purchase.link.creator_id,
  p_amount_cents: purchase.creator_net_cents,
});

// 3. Si chatter attribue → crediter le chatter
if (purchase.chat_chatter_id && purchase.chatter_earnings_cents > 0) {
  await supabase.rpc('increment_chatter_earnings', {
    p_chatter_id: purchase.chat_chatter_id,
    p_amount_cents: purchase.chatter_earnings_cents,
  });
}

// 4. Si conversation → incrementer le revenue de la conversation
if (purchase.chat_conversation_id) {
  await supabase.rpc('increment_conversation_revenue', {
    p_conversation_id: purchase.chat_conversation_id,
    p_amount_cents: purchase.amount_cents,
  });
}

// 5. Envoyer email Brevo avec le lien d'acces
await sendContentAccessEmail(purchase.buyer_email, purchase.link.title, accessUrl);

// 6. Verifier bonus referral $100
await checkReferralBonus(purchase.link.creator_id);
```

### 18.4 Points de verification post-implementation

- [ ] Un chatter envoie un lien paye dans le chat → le lien contient `?chtref=xxx`
- [ ] Le fan achete via ce lien → `purchases.chat_chatter_id` est renseigne
- [ ] `purchases.chatter_earnings_cents` = 25% du prix de base
- [ ] `profiles.chatter_earnings_cents` du chatter est incremente
- [ ] `conversations.total_revenue_cents` est incremente
- [ ] Le createur recoit 60% dans son wallet
- [ ] La plateforme retient 15% + 5% processing fee
- [ ] `LinkDetail.tsx` affiche les colonnes chatter correctement

---

## 19. ENDPOINTS EXHAUSTIFS — VERIFICATION FINALE

### 19.1 Tous les edge function calls depuis le frontend

| Frontend | Ligne | Edge Function | Couvert dans le plan ? |
|----------|-------|---------------|----------------------|
| PublicLink.tsx | 407 | `create-link-checkout-session` | OUI → renomme `create-link-checkout` |
| PublicLink.tsx | 155 | `verify-checkout-session` | OUI → remplace par polling DB |
| CreatorPublic.tsx | 581 | `create-tip-checkout` | OUI |
| CreatorPublic.tsx | 463 | `create-gift-checkout` | OUI |
| CreatorPublic.tsx | 648 | `create-request-checkout` | OUI (pre-auth conservee) |
| CreatorPublic.tsx | 534 | `check-fan-email` | PAS LIE AU PAIEMENT — inchange |
| ChatTipForm.tsx | 62 | `create-tip-checkout` | OUI |
| ChatCustomRequest.tsx | 59 | `create-request-checkout` | OUI |
| CreatorTipsRequests.tsx | 254 | `manage-request` (capture) | OUI |
| CreatorTipsRequests.tsx | 578 | `manage-request` (cancel) | OUI |
| TipSuccess.tsx | 233 | `claim-tip` | OUI — inchange (pas de Stripe) |
| Profile.tsx | 414 | `stripe-connect-onboard` | OUI → remplace par `save-bank-details` |
| Profile.tsx | 239 | `stripe-connect-status` | OUI → SUPPRIME |
| Profile.tsx | 449 | `create-creator-subscription` | OUI |
| AppDashboard.tsx | 296 | `stripe-connect-onboard` | OUI → remplace par modal IBAN |
| AppDashboard.tsx | 241 | `stripe-connect-status` | OUI → SUPPRIME |
| AppDashboard.tsx | 976 | `request-affiliate-payout` | INCHANGE (pas de Stripe) |
| AdminUserOverview.tsx | 228 | `stripe-connect-onboard` | OUI → SUPPRIME (admin n'a plus besoin) |
| StripeValidation.tsx | 34 | `stripe-connect-status` | OUI → PAGE SUPPRIMEE |

### 19.2 Endpoints backend-only (webhooks/callbacks)

| Edge Function | Couvert ? |
|---------------|-----------|
| `stripe-webhook` (tous les event types) | OUI → remplace par `ugp-confirm` + `ugp-listener` + `ugp-membership-confirm` |
| `send-link-content-email` | INCHANGE — appele par ugp-confirm apres achat de lien |

### 19.3 Flux financiers a preserver

| Flux | Couvert ? | Details |
|------|-----------|---------|
| Achat lien standard | OUI | `create-link-checkout` → QuickPay → `ugp-confirm` |
| Achat lien via chat (chtref) | OUI | Meme flux + attribution chatter 60/25/15 |
| Tip depuis profil public | OUI | `create-tip-checkout` → QuickPay → `ugp-confirm` |
| Tip depuis le chat | OUI | Idem via `ChatTipForm.tsx` (window.open) |
| Gift wishlist | OUI | `create-gift-checkout` → QuickPay → `ugp-confirm` |
| Custom request (pre-auth) | OUI | `create-request-checkout` → pre-auth → capture/void |
| Custom request depuis chat | OUI | Meme flux via `ChatCustomRequest.tsx` |
| Abonnement Premium | OUI | `create-creator-subscription` → QuickPay subscription |
| Renouvellement abo | OUI | `ugp-membership-confirm` (Action=Add) |
| Annulation abo | OUI | Formulaire HTML Cancel client-side |
| Commission referral initiale | OUI | Dans `ugp-membership-confirm` (35% de $39) |
| Commission referral recurrente | OUI | Dans `ugp-membership-confirm` a chaque Add |
| Bonus referral $100 | OUI | Dans `ugp-confirm` (verif net > $1000 en 90j) |
| Retrait createur | OUI | `request-withdrawal` → wallet debit → admin virement |
| Retrait affilie | INCHANGE | `request-affiliate-payout` → email admin |
| Supplement profils | OUI | Debit wallet au renouvellement (section 16) |
| Chatter earnings | OUI | Pre-stocke dans purchases, credite via RPC (section 18) |
| Chatter payout | INCHANGE | Email admin (meme pattern que affilies) |
| Refund | OUI | `ugp-listener` (section 4.6) |
| Chargeback | OUI | `ugp-listener` (section 4.6) |
| Wallet credit (toutes sources) | OUI | RPC `credit_creator_wallet` |
| Wallet debit (retrait + addon) | OUI | RPC `debit_creator_wallet` |

### 19.4 Donnees de dashboard a rebrancher

| Dashboard | Donnee | Source actuelle | Source apres migration |
|-----------|--------|----------------|----------------------|
| AppDashboard | Wallet balance | Calcul frontend `revenue + tips - payouts` | `profiles.wallet_balance_cents` (DB) |
| AppDashboard | Total revenue | Calcul frontend (purchases + tips) | `profiles.total_earned_cents` (DB) |
| AppDashboard | Sales count | `purchases.count(succeeded)` | Inchange |
| AppDashboard | Tips revenue | `tips SUM(amount_cents)` | Inchange |
| AppDashboard | Affiliate earnings | `profiles.affiliate_earnings_cents` | Inchange |
| ReferralDashboard | Commission earned | `referrals.commission_earned_cents` | Inchange |
| ReferralDashboard | Total referred | `referrals.count` | Inchange |
| CreatorTipsRequests | Tips list | `tips WHERE succeeded` | Inchange |
| CreatorTipsRequests | Requests list | `custom_requests WHERE != pending_payment` | Inchange |
| FanDashboard | Tips sent | `tips WHERE fan_id` | Inchange |
| FanDashboard | Requests made | `custom_requests WHERE fan_id` | Inchange |
| AgencyDashboard | Revenue per profile | `RPC get_user_profiles` | Adapter pour utiliser `total_earned_cents` |
| LinkDetail | Purchase breakdown | `purchases` avec chatter columns | Inchange (colonnes deja la) |

---

## 12. DEVISE — TOUT EN USD

Toutes les transactions sont en USD. Le champ `CurrencyID` dans chaque formulaire QuickPay est toujours `"USD"`.

**Colonnes DB a harmoniser** : La table `purchases` a `currency DEFAULT 'EUR'`. Tous les nouveaux records doivent explicitement passer `currency: 'USD'`. Les anciennes transactions Stripe en EUR restent telles quelles (historique).

**Dans chaque edge function de checkout** : toujours envoyer `CurrencyID: 'USD'` et stocker `currency: 'USD'` dans le record DB.

---

## 13. CARTE DES RAPPELS STRIPE A REMPLACER

Voici CHAQUE endroit de l'app qui affiche un rappel, banner, modal, ou conditionnel lie a Stripe, avec l'action exacte a effectuer.

### 13.1 Modal "Connect Stripe to get paid" — AppDashboard.tsx

**Localisation** : `src/pages/AppDashboard.tsx` lignes 418-512
**Type** : Modal plein ecran avec backdrop blur, affiché une fois par session si `stripe_connect_status !== 'complete'`

**Remplacement** : Modal "Set up your bank details to get paid"
- Garder le meme pattern UI : `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm` + `motion.div`
- Condition d'affichage : `payout_setup_complete !== true` au lieu de `stripe_connect_status !== 'complete'`
- Contenu :
  - Icone : `Landmark` (lucide-react, icone banque) au lieu du gradient Stripe
  - Titre : "Set up your bank details to get paid"
  - Description : "Add your bank account (IBAN) to receive payouts. Money from fans goes into your Exclu wallet, and you can withdraw anytime."
  - Checklist (3 items, meme style green checkmarks) :
    - "Withdraw to your bank account anytime"
    - "Secure & encrypted storage"
    - "Takes only 1 minute"
  - Bouton principal : `variant="hero"` "Set up bank details" → navigate vers `#payments` sur la page Profile (ou ouvrir la section inline)
  - Bouton secondaire : "I'll do this later" → dismiss (sessionStorage `bankModalDismissed`)
- **Supprimer** : Les messages phases rotatifs ("Preparing a secure connection with Stripe…") — plus necessaire, la saisie IBAN est instantanee

### 13.2 Banner d'avertissement (desactive) — AppDashboard.tsx

**Localisation** : `src/pages/AppDashboard.tsx` lignes 579-614 (wrappé dans `{false && ...}`)
**Type** : Banner amber, actuellement desactive

**Action** : Supprimer entierement ce bloc. S'il faut un avertissement similaire, le remplacer par :
- Condition : `totalLinks > 0 && !payout_setup_complete`
- Message : "Add your bank details so fans can purchase your content."
- Bouton : "Set up now" → navigate `#payments`
- Style : meme pattern amber border/background que l'existant

### 13.3 Card "Payment Account" — Profile.tsx

**Localisation** : `src/pages/Profile.tsx` lignes 1065-1206
**Type** : Card complete avec statut Stripe Connect, email, pays, infos manquantes, boutons

**Remplacement complet** : Card "Payout Account" avec formulaire IBAN

**UI detaillee (utiliser les composants existants)** :

```
SI payout_setup_complete = false :
  <div> (meme conteneur que l'actuel, padding/rounded identiques)
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl bg-exclu-phantom/30 flex items-center justify-center">
        <Landmark className="w-5 h-5 text-white/40" />
      </div>
      <div>
        <h3 className="text-white font-semibold">Payout Account</h3>
        <p className="text-white/40 text-sm">Add your bank details to receive payouts</p>
      </div>
    </div>

    <div className="space-y-3">
      <div>
        <label className="text-white/60 text-sm mb-1 block">IBAN</label>
        <Input
          value={iban}
          onChange={e => setIban(e.target.value.toUpperCase())}
          placeholder="FR76 1234 5678 9012 3456 7890 123"
          className="bg-exclu-phantom/30 border-white/10 text-white"
        />
      </div>
      <div>
        <label className="text-white/60 text-sm mb-1 block">Account holder name</label>
        <Input
          value={holderName}
          onChange={e => setHolderName(e.target.value)}
          placeholder="Jean Dupont"
          className="bg-exclu-phantom/30 border-white/10 text-white"
        />
      </div>
      <div>
        <label className="text-white/60 text-sm mb-1 block">BIC / SWIFT (optional)</label>
        <Input
          value={bic}
          onChange={e => setBic(e.target.value.toUpperCase())}
          placeholder="BNPAFRPP"
          className="bg-exclu-phantom/30 border-white/10 text-white"
        />
      </div>
    </div>

    <Button
      variant="hero"
      className="w-full mt-4"
      onClick={handleSaveBankDetails}
      disabled={!iban || !holderName || isSaving}
    >
      {isSaving ? <Loader2 className="animate-spin" /> : <Landmark className="w-4 h-4 mr-2" />}
      Save bank details
    </Button>
  </div>

SI payout_setup_complete = true :
  <div> (meme conteneur)
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Landmark className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">Payout Account</h3>
          <p className="text-emerald-400 text-sm">Connected</p>
        </div>
      </div>
      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
        <Check className="w-3 h-3 mr-1" /> Active
      </Badge>
    </div>

    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-white/40">IBAN</span>
        <span className="text-white font-mono">{maskedIban}</span>  // ex: "FR76 •••• •••• 7890"
      </div>
      <div className="flex justify-between">
        <span className="text-white/40">Holder</span>
        <span className="text-white">{holderName}</span>
      </div>
    </div>

    <Button variant="outline" className="w-full mt-4" onClick={() => setIsEditingBank(true)}>
      Edit bank details
    </Button>
  </div>
```

### 13.4 Page StripeValidation.tsx

**Localisation** : `src/pages/StripeValidation.tsx` — page entiere
**Action** : SUPPRIMER le fichier + supprimer la route `/app/stripe-validation` dans `App.tsx`

### 13.5 Admin — Payment Account section — AdminUserOverview.tsx

**Localisation** : `src/pages/AdminUserOverview.tsx` lignes 1010-1047 + lignes 205-272
**Type** : Section admin pour voir le statut Stripe d'un createur + bouton pour declencher l'onboarding

**Remplacement** :
- Afficher les infos bancaires du createur (IBAN masque, holder name, payout_setup_complete)
- Remplacer `formatStripeStatus()` par un simple badge "Bank connected" / "Not set up"
- Supprimer le bouton admin "Connect Stripe for this user" — plus necessaire
- Ajouter l'affichage du wallet balance du createur

### 13.6 Overlay "Opening Stripe..." — Profile.tsx

**Localisation** : `src/pages/Profile.tsx` lignes 1571-1591
**Type** : Overlay plein ecran pendant le chargement de Stripe

**Action** : SUPPRIMER entierement. La saisie IBAN est un formulaire inline, pas de redirection externe.

### 13.7 Logique conditionnelle — CreatorPublic.tsx

**Localisation** : `src/pages/CreatorPublic.tsx` lignes 672-673
```typescript
const isStripeReady = profile?.stripe_connect_status === 'complete';
const showTipsCta = profile?.tips_enabled === true && isStripeReady;
```

**Remplacement** :
```typescript
const isPayoutReady = profile?.payout_setup_complete === true;
const showTipsCta = profile?.tips_enabled === true && isPayoutReady;
```

Meme logique pour les custom requests et les liens payants.

### 13.8 Self-healing check — AppDashboard.tsx

**Localisation** : `src/pages/AppDashboard.tsx` lignes 237-246
**Type** : Appel background a `stripe-connect-status` pour synchroniser le statut

**Action** : SUPPRIMER entierement. Plus de synchronisation Stripe necessaire. Le `payout_setup_complete` est mis a jour instantanement lors de la saisie IBAN.

### 13.9 ProfileContext.tsx — Types et champs

**Localisation** : `src/contexts/ProfileContext.tsx`
**Champs Stripe dans l'interface** : `stripe_account_id`, `stripe_connect_status`

**Remplacement** :
```typescript
// Supprimer :
stripe_account_id: string | null;
stripe_connect_status: string;

// Ajouter :
payout_setup_complete: boolean;
wallet_balance_cents: number;
```

**Dans la query de chargement des profils** : remplacer les champs selectionnes.

### 13.10 HelpPayoutsPricing.tsx et HelpCenter.tsx

**Localisation** :
- `src/pages/HelpPayoutsPricing.tsx` — page complete
- `src/pages/HelpCenter.tsx` lignes 91-103, 191-217

**Remplacement** : Mettre a jour le contenu texte :
- "Stripe" → "your bank account"
- "Stripe Connect" → "bank details"
- "payouts are sent directly to your Stripe account" → "earnings go into your Exclu wallet, withdraw to your bank anytime"
- Ajouter une section expliquant le systeme de wallet + retrait

### 13.11 Landing page mentions — HeroSection.tsx

**Localisation** : `src/components/HeroSection.tsx` ligne 115
**Type** : Icone CreditCard dans la section hero

**Action** : Verifier si le texte mentionne Stripe. Si oui, remplacer par un messaging generique.

---

## 14. INSTRUCTIONS D'IMPLEMENTATION POUR LE DEVELOPPEUR

### 14.1 Regles generales

1. **Toujours lire le fichier AVANT de le modifier.** Ne jamais supposer le contenu.
2. **Toujours verifier que les imports sont a jour** apres modification (pas d'import Stripe orphelin).
3. **Toujours tester avec `npm run dev`** apres chaque modification frontend.
4. **Edge functions** : deployer localement avec `supabase functions serve <nom>` pour tester.
5. **Devise** : TOUJOURS `'USD'` dans `CurrencyID` et `currency`. Jamais 'EUR' pour les nouvelles transactions.

### 14.2 Ordre d'implementation strict

```
ETAPE 1 : Migration DB (Phase 0)
  → Fichier : supabase/migrations/1XX_ugpayments_migration.sql
  → Appliquer localement : supabase db reset ou supabase migration up
  → VERIFIER : Les colonnes existent (wallet_balance_cents, bank_iban, etc.)
  → VERIFIER : Les RPCs fonctionnent (SELECT credit_creator_wallet(...))
  → VERIFIER : payment_events table existe avec les index

ETAPE 2 : payment-config.ts (Phase 0)
  → Creer src/lib/payment-config.ts
  → VERIFIER : Import fonctionne depuis un autre fichier

ETAPE 3 : QuickPayForm composant (Phase 2)
  → Creer src/components/payment/QuickPayForm.tsx
  → TESTER : Render un formulaire de test, verifier qu'il soumet correctement
  → VERIFIER : Le pattern window.open fonctionne pour le chat

ETAPE 4 : ugp-confirm edge function (Phase 2)
  → Creer supabase/functions/ugp-confirm/index.ts
  → Creer supabase/functions/ugp-confirm/config.toml avec verify_jwt = false
  → TESTER : curl POST avec des donnees simulees
  → VERIFIER : Idempotence (envoyer 2x le meme TransactionID)
  → VERIFIER : payment_events est peuple
  → VERIFIER : credit_creator_wallet est appele et wallet_balance_cents augmente

ETAPE 5 : Adapter create-link-checkout (Phase 2)
  → Modifier supabase/functions/create-link-checkout-session/index.ts
  → Renommer le dossier en create-link-checkout/
  → SUPPRIMER tout le code Stripe
  → RETOURNER les champs du formulaire QuickPay
  → VERIFIER : Pre-creation du record purchases fonctionne
  → VERIFIER : Le MerchantReference est bien formate (link_uuid)

ETAPE 6 : Adapter PublicLink.tsx (Phase 6)
  → Modifier src/pages/PublicLink.tsx
  → Remplacer l'appel a create-link-checkout-session par create-link-checkout
  → Integrer QuickPayForm pour la soumission
  → Adapter le retour (polling sur ?ref= au lieu de ?session_id=)
  → TESTER : Le flow complet fonctionne (cliquer Unlock → QuickPay → retour → contenu debloqu)

ETAPE 7 : Repeter pour tips, gifts (Phases 2 + 6)
  → Meme pattern que les liens pour create-tip-checkout et create-gift-checkout
  → Adapter CreatorPublic.tsx, ChatTipForm.tsx, TipSuccess.tsx, GiftSuccess.tsx
  → TESTER chaque flow end-to-end

ETAPE 8 : Custom requests (Phase 3)
  → Adapter create-custom-request pour etre le point d'entree (soumission gratuite)
  → Adapter manage-request (supprimer Stripe, ajouter status 'accepted')
  → Creer create-request-checkout (paiement apres acceptation)
  → Adapter CreatorTipsRequests.tsx, FanDashboard.tsx, ChatCustomRequest.tsx, RequestSuccess.tsx
  → Creer PayUnlockButton composant
  → TESTER : Soumission → Acceptation createur → Paiement fan → Contenu debloqu

ETAPE 9 : Abonnement Premium (Phase 4)
  → Adapter create-creator-subscription
  → Creer ugp-membership-confirm
  → Creer cancel-creator-subscription
  → Adapter Profile.tsx section subscription
  → TESTER : Souscription → Activation → Annulation

ETAPE 10 : Onboarding IBAN + Wallet + Retraits (Phase 5)
  → Creer save-bank-details
  → Creer request-withdrawal
  → Creer BankDetailsForm, WalletCard, WithdrawalModal composants
  → Adapter Profile.tsx, AppDashboard.tsx
  → TESTER : Saisie IBAN → Retrait → Verification wallet

ETAPE 11 : Nettoyage (Phase 8)
  → Supprimer les edge functions Stripe
  → Supprimer StripeValidation.tsx + route
  → Supprimer overlay "Opening Stripe..."
  → Supprimer les imports Stripe orphelins
  → Supprimer les env vars Stripe
  → Mettre a jour CLAUDE.md
  → VERIFIER : `grep -r "stripe" src/` ne retourne que des references historiques dans les types DB
  → VERIFIER : `grep -r "stripe" supabase/functions/` ne retourne rien
```

### 14.3 Points de verification apres implementation

**Apres chaque edge function modifiee** :
- [ ] Le CORS est correct (allowedOrigins inclut localhost + exclu.at)
- [ ] Le rate limiting est en place
- [ ] Les erreurs retournent un JSON avec `{ error: "message" }`
- [ ] Les succes retournent un JSON avec les donnees attendues
- [ ] `verify_jwt` est configure correctement dans config.toml
- [ ] Pas d'import Stripe residuel

**Apres chaque page frontend modifiee** :
- [ ] Pas de mention "Stripe" visible a l'ecran
- [ ] Les boutons de paiement fonctionnent (pas de console error)
- [ ] Le toast d'erreur s'affiche si le backend echoue
- [ ] Le loading state fonctionne (spinner pendant l'appel)
- [ ] Le composant se nettoie correctement (pas de memory leak, pas de polling infini)

**Apres la migration complete** :
- [ ] Un fan peut acheter un lien → contenu debloqu
- [ ] Un fan peut envoyer un tip → wallet createur credite
- [ ] Un fan peut offrir un cadeau wishlist → wallet createur credite
- [ ] Un fan peut soumettre une custom request → createur notifie
- [ ] Un createur peut accepter une custom request → fan notifie pour payer
- [ ] Un fan peut payer la custom request acceptee → contenu debloqu
- [ ] Un createur peut s'abonner Premium → commission 0%
- [ ] Un createur peut annuler Premium → retour commission 10%
- [ ] Un createur peut saisir son IBAN → payout_setup_complete = true
- [ ] Un createur peut demander un retrait → wallet debite, payout cree
- [ ] Le dashboard affiche le bon wallet balance
- [ ] Le dashboard affiche le bon revenue
- [ ] Le dashboard affiche le bon nombre de ventes
- [ ] Les referral commissions sont creditees a chaque renouvellement
- [ ] Aucune mention de "Stripe" visible nulle part dans l'app
- [ ] Les pages admin affichent les bonnes infos bancaires
