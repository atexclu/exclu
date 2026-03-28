# Audit Externe — Plan de Migration Stripe → UG Payments QuickPay

> **Date** : 25 mars 2026
> **Auditeur** : Claude (revue independante du plan `PAYMENT_MIGRATION_STRIPE_TO_UGPAYMENTS.md`)
> **Scope** : Validation technique, exhaustivite, compatibilite des donnees, fiabilite

---

## 1. ERREURS ET CORRECTIONS DU PLAN

### 1.1 Erreur : Migration DB — Types incorrects pour `wallet_balance_cents`

**Probleme** : Le plan propose `INTEGER NOT NULL DEFAULT 0` pour `wallet_balance_cents`, `total_earned_cents`, `total_withdrawn_cents`. Or la table `profile_analytics` utilise `BIGINT` pour `revenue_cents`, et `affiliates.total_earnings_cents` est aussi `BIGINT`.

**Risque** : Un createur tres actif pourrait depasser `2,147,483,647` cents (= $21.4M). Peu probable a court terme, mais incoherent avec le reste du schema.

**Correction** : Utiliser `BIGINT` pour coherence avec les autres colonnes financieres.

```sql
ALTER TABLE profiles ADD COLUMN wallet_balance_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN total_earned_cents BIGINT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN total_withdrawn_cents BIGINT NOT NULL DEFAULT 0;
```

### 1.2 Erreur : Le plan ignore le champ `buyer_email` sur `purchases`

**Probleme** : La table `purchases` n'a PAS de colonne `buyer_email` directement — le webhook Stripe extrait l'email de `session.customer_details.email`. Avec QuickPay, l'email arrive dans le ConfirmURL POST via `[CustomerEmail]`.

**Correction** : Verifier que la colonne `buyer_email` existe bien dans `purchases`. D'apres le schema dump, elle existe mais n'est pas listee dans les colonnes visibles du schema. A verifier via Supabase.

**Action** : Confirmer la presence de `buyer_email` dans `purchases` avant l'implementation.

### 1.3 Erreur : Le plan ne mentionne pas `access_token` dans les achats de liens

**Probleme** : A chaque achat de lien, le webhook genere un `access_token = crypto.randomUUID()` stocke dans `purchases`. Ce token est ensuite utilise pour generer les signed URLs. Le plan `ugp-confirm` doit absolument reproduire cette logique.

**Correction** : Ajouter explicitement dans la spec de `ugp-confirm` :
```typescript
// Pour les achats de liens :
access_token: crypto.randomUUID()
```

### 1.4 Erreur : Omission de la logique `chatter_earnings` dans ugp-confirm

**Probleme** : Le plan mentionne "crediter wallet createur" mais omet completement le split 60/25/15 pour les achats de liens attribues a un chatter. C'est un flux financier complexe :
- 60% createur
- 25% chatter (incremente `profiles.chatter_earnings_cents` via RPC)
- 15% plateforme + 5% processing fee

**Correction** : Le `ugp-confirm` doit reproduire toute cette logique. Le `MerchantReference` doit encoder le `chatter_id` et les montants de split, ou les retrouver depuis le record pre-cree.

### 1.5 Erreur : Le plan ne gere pas `customer.subscription.updated` et `customer.subscription.deleted`

**Probleme** : Le webhook Stripe gere 3 evenements d'abonnement :
1. `checkout.session.completed` (mode=subscription) → activation
2. `customer.subscription.updated` → renouvellement, changement de statut
3. `customer.subscription.deleted` → annulation

Le plan ne couvre que l'activation via `ugp-membership-confirm` (Action=Add/Cancel/Inactive). Mais il manque :
- La detection de **renouvellement** (le membership postback est-il envoye a chaque cycle ?)
- La gestion de la **date d'expiration** (`subscription_expires_at`)
- La **commission recurrente du referrer** (35% de $39 a chaque renouvellement via `invoice.paid`)

**Correction** : Ajouter dans les questions a UGPayments : "Le postback membership est-il envoye a chaque renouvellement, ou uniquement a la creation ?" Si non, il faut un cron job qui verifie les expirations.

### 1.6 Erreur : Commission referral recurrente non couverte

**Probleme** : Actuellement, le webhook `invoice.paid` credite 35% de chaque renouvellement au referrer. Ce flux n'a aucun equivalent dans le plan UGPayments.

**Correction** : Options :
- Si le postback membership est envoye a chaque renouvellement → traiter la commission dans `ugp-membership-confirm`
- Sinon → cron job mensuel qui credite la commission pour les createurs encore abonnes

### 1.7 Erreur : Le plan propose `payment_setup_status` mais ne traite pas le CHECK existant

**Probleme** : `profiles.stripe_connect_status` a un CHECK constraint :
```sql
CHECK (stripe_connect_status IN ('pending', 'complete', 'restricted', 'disabled'))
```
Et `creator_profiles.stripe_connect_status` a un CHECK DIFFERENT :
```sql
CHECK (stripe_connect_status IN ('not_started', 'pending', 'active', 'complete', 'restricted', 'blocked'))
```

On ne peut pas simplement ajouter une nouvelle colonne `payment_setup_status` sans gerer ces contraintes existantes. Et le frontend lit ces colonnes partout.

**Correction** : Ne PAS creer `payment_setup_status`. Reutiliser les colonnes existantes :
- `stripe_connect_status` sur `profiles` → reutiliser avec les valeurs 'not_started' (pas d'IBAN) et 'complete' (IBAN renseigne)
- OU : Ajouter les nouvelles valeurs au CHECK constraint avant la migration
- **Recommandation** : Creer une nouvelle colonne `payout_status` TEXT avec CHECK ('not_started', 'complete') et laisser les colonnes `stripe_*` en place pour l'historique

---

## 2. ELEMENTS MANQUANTS DANS LE PLAN

### 2.1 MANQUANT : Logique de pre-creation des records

**Constat** : Le systeme actuel pre-cree des enregistrements en base AVANT le checkout :
- `tips` : INSERT avec `status='pending'` → puis UPDATE `stripe_session_id` → webhook met `status='succeeded'`
- `gift_purchases` : Idem
- `custom_requests` : INSERT avec `status='pending_payment'` → idem
- `purchases` : PAS de pre-creation (cree par le webhook)

**Impact** : Avec QuickPay, le `MerchantReference` est le seul lien entre le formulaire POST et le ConfirmURL callback. Il DOIT contenir l'ID du record pre-cree.

**Recommandation** : Garder le pattern de pre-creation. Le flux devient :
1. Edge function cree le record (status='pending') et genere un UUID
2. Edge function retourne les champs du formulaire avec `MerchantReference = type_uuid`
3. Frontend soumet le formulaire QuickPay
4. Fan paie sur QuickPay
5. QuickPay POST au ConfirmURL avec `MerchantReference = type_uuid`
6. `ugp-confirm` parse le MerchantReference, retrouve le record, le met a jour

### 2.2 MANQUANT : Gestion des paiements echoues et abandonnes

**Constat** : Si un fan commence un checkout mais ne paie pas (abandonne la page QuickPay), le record pre-cree reste en `status='pending'` indefiniment.

**Solutions** :
1. **Cron job de nettoyage** : Supprimer les records `pending` de plus de 24h (deja partiellement fait pour les custom requests avec `expires_at`)
2. **DeclinedURL** : QuickPay redirige vers une URL en cas de refus — mettre a jour le record en `status='failed'`
3. **TTL sur les records** : Ajouter `expires_at` sur les tips et gifts pending

### 2.3 MANQUANT : Email d'acces au contenu pour les achats de liens

**Constat** : Le webhook Stripe envoie un email Brevo avec le lien d'acces au contenu (URL avec `access_token`). Le plan mentionne "envoyer email acces" dans `ugp-confirm` mais ne detaille pas la logique.

**Correction** : `ugp-confirm` pour les achats de liens doit :
1. Generer `access_token = crypto.randomUUID()`
2. Construire l'URL : `${PUBLIC_SITE_URL}/l/${link.slug}?session_id=${purchase.id}`
3. Envoyer l'email via Brevo API (meme template que l'actuel)
4. Mettre a jour `purchases.email_sent = true`

### 2.4 MANQUANT : Gestion des conversations (chat) post-paiement

**Constat** : Le webhook Stripe cree/met a jour des conversations dans les cas suivants :
- Tip (non-anonyme) : `ensureConversationAndNotify()` → cree un message systeme dans la conversation
- Custom request : Message systeme dans la conversation
- Achat de lien via chat : `increment_conversation_revenue()` RPC

Le plan ne mentionne pas cette logique.

**Correction** : Reproduire toute la logique de conversation dans `ugp-confirm`.

### 2.5 MANQUANT : Bonus referral $100 pour le createur refere

**Constat** : Le webhook Stripe verifie si un createur refere a atteint $1,000 de revenus nets dans les 90 jours. Si oui, il credite $100 au createur refere. Cette logique n'est pas dans le plan.

**Correction** : Ajouter cette verification dans `ugp-confirm` pour les achats de liens.

### 2.6 MANQUANT : Flags de premiere souscription Premium

**Constat** : Quand un createur s'abonne pour la premiere fois, le webhook met a jour :
```typescript
show_join_banner: false,
show_certification: true,
show_deeplinks: true,
show_available_now: true
```
Et desactive ces flags quand l'abonnement expire.

**Correction** : Reproduire dans `ugp-membership-confirm`.

### 2.7 MANQUANT : Email de verification Stripe Connect → equivalent pour IBAN

**Constat** : Quand le compte Stripe Connect est verifie, un email est envoye au createur (`sendStripeVerifiedEmail`). Il faut un equivalent quand le createur renseigne son IBAN.

### 2.8 MANQUANT : `verify-checkout-session` equivalent

**Constat** : `PublicLink.tsx` a un mecanisme de verification apres retour du checkout :
1. Lit `?session_id=` dans l'URL
2. Verifie en DB si l'achat existe
3. Si non, appelle `verify-checkout-session` (3 retries avec backoff)
4. Si toujours non, polling 10x a 3s

Avec QuickPay, le `ApprovedURL` recoit `?TransactionID=&MerchantReference=`. Mais le ConfirmURL (callback serveur) peut arriver APRES le redirect du fan.

**Correction** : Il faut un mecanisme de polling/verification cote frontend :
1. Fan revient sur `ApprovedURL` avec `?ref=link_uuid`
2. Frontend verifie en DB si `purchases` avec cet ID a `status='succeeded'`
3. Si non, poll toutes les 2s pendant 30s maximum
4. Si toujours non, afficher un message "Votre paiement est en cours de verification"

### 2.9 MANQUANT : Route frontend pour le retour de paiement

**Constat** : Le plan ne definit pas clairement les URLs de retour. Actuellement :
- Liens : `/l/{slug}?session_id=...`
- Tips : `/tip-success?creator=...&amount=...&tip_id=...`
- Gifts : `/gift-success?item=...&creator=...`
- Requests : `/request-success?status=...&creator=...&amount=...`
- Subscription : `/app?subscription=success`

Avec QuickPay, l'`ApprovedURL` recoit `?TransactionID=X&MerchantReference=Y` en plus. Il faut s'assurer que les pages de retour lisent ces parametres.

**Correction** : Adapter chaque `ApprovedURL` :
```
Liens :     /l/{slug}?payment_success=true&ref=link_{uuid}
Tips :      /tip-success?creator={handle}&amount={cents}&tip_id={uuid}
Gifts :     /gift-success?item={name}&creator={handle}
Requests :  /request-success?status=success&creator={handle}&amount={cents}
Subscription: /app?subscription=success
```
Et adapter les pages pour lire `ref` au lieu de `session_id`.

### 2.10 MANQUANT : `manage-request` sans Stripe

**Constat** : Le plan mentionne l'adaptation de `manage-request` mais ne detaille pas le nouveau flux. Actuellement :
- **Capture** : `stripe.paymentIntents.capture(pi_id)` → capture le paiement en hold
- **Cancel** : `stripe.paymentIntents.cancel(pi_id)` → relache le hold

Avec QuickPay (paiement immediat), le flux devient :
- **Capture** : Le paiement est deja encaisse. `manage-request` ne fait que mettre a jour le statut en 'delivered' et calculer la commission. Plus besoin d'API Stripe.
- **Cancel** : Le paiement est deja encaisse. Il faut rembourser. 2 options :
  a) Debiter le wallet du createur (si deja credite)
  b) Appeler une API de remboursement UGPayments (si disponible)
  c) Crediter un "credit" au fan (wallet fan interne)

**Recommandation** : Option (a) est la plus simple. Le wallet du createur est debite, et le fan est rembourse via un credit interne ou virement. Mais cela necessite que le wallet createur ait suffisamment de fonds.

**Risque** : Si le createur a deja retire ses fonds et refuse ensuite → wallet negatif.

**Solution** : Ne crediter le wallet du createur qu'apres acceptation (pas apres paiement). Le paiement va dans un "escrow" interne :
1. Fan paie → `custom_requests.status = 'paid'`, montant en "escrow" (pas dans le wallet createur)
2. Createur accepte → wallet credite, status='delivered'
3. Createur refuse → fan rembourse (credit wallet fan ou virement)

Cela necessite un champ supplementaire ou une logique claire pour distinguer l'argent en escrow de l'argent disponible.

### 2.11 MANQUANT : Gestion multi-profil (creator_profiles)

**Constat** : Le systeme supporte les multi-profils (`creator_profiles`). Les colonnes `stripe_account_id` et `stripe_connect_status` existent aussi sur `creator_profiles` (pas seulement `profiles`).

Le plan ne mentionne pas comment gerer les coordonnees bancaires au niveau profil vs compte.

**Recommandation** : Les coordonnees bancaires (`bank_iban`, etc.) doivent etre au niveau `profiles` (compte), pas `creator_profiles`. Un createur a un seul IBAN quel que soit le nombre de profils.

---

## 3. INCOMPATIBILITES DE DONNEES

### 3.1 Format du MerchantReference (100 chars max)

**Contrainte UGPayments** : `MerchantReference` est limite a 100 caracteres.
**Format propose** : `type_uuid` (ex: `link_550e8400-e29b-41d4-a716-446655440000`) = 41 chars → OK.

Mais si on doit encoder des informations supplementaires (chatter_id, conversation_id), ca depasse vite.

**Recommandation** : Stocker toutes les metadonnees dans le record pre-cree en DB. Le `MerchantReference` ne contient que `type_uuid`. Le callback `ugp-confirm` retrouve tout depuis la DB.

### 3.2 Montants : UGPayments utilise des decimaux, la DB utilise des cents (entiers)

**UGPayments** : `AmountTotal` = `"20.00"` (string decimal)
**DB** : `amount_cents` = `2000` (integer)

**Conversion** : Toujours diviser par 100 pour l'envoi a QuickPay, et multiplier par 100 au retour.

```typescript
// Envoi : cents → decimal string
const amountDecimal = (amountCents / 100).toFixed(2);

// Retour : decimal string → cents
const amountCents = Math.round(parseFloat(amount) * 100);
```

**Attention** : Le `Amount` retourne dans le ConfirmURL est un decimal. Verifier les arrondis pour eviter des ecarts de 1 cent.

### 3.3 Devise : Incoherence EUR vs USD

**Constat du schema** :
- `purchases.currency` DEFAULT `'EUR'`
- `tips.currency` DEFAULT `'USD'`
- `gift_purchases.currency` DEFAULT `'USD'`
- `custom_requests.currency` DEFAULT `'USD'`
- `wishlist_items.currency` DEFAULT `'USD'`
- `links.currency` DEFAULT `'USD'`

**QuickPay** : `CurrencyID` = code 3 lettres.

**Probleme** : Incoherence entre EUR et USD dans le schema. Les achats de liens sont en EUR par defaut, tout le reste en USD.

**Recommandation** : Harmoniser sur une devise unique (probablement EUR puisque UGPayments est base en Suisse/Europe). Ou respecter la devise du createur. A clarifier dans la migration.

### 3.4 Status mapping : QuickPay → DB

**QuickPay TransactionState** (Appendix A) :
```
Sale, Authorize, Capture, Void, Refund, Chargeback, Credit, CBK1, Verify, Recurring
```

**QuickPay TransactionStatus** (Appendix B) :
```
Successful, Error, Declined, Pending, Scrubbed, Fraud, Unconfirmed
```

**Mapping necessaire** :

| QuickPay State | QuickPay Status | DB Status | Action |
|---------------|----------------|-----------|--------|
| Sale | Successful | 'succeeded' | Crediter wallet |
| Sale | Declined | 'failed' | Notifier le fan |
| Sale | Error | 'failed' | Logger + notifier |
| Sale | Pending | 'pending' | Attendre confirmation |
| Refund | Successful | 'refunded' | Debiter wallet |
| Chargeback | * | 'refunded' | Debiter wallet + notifier admin |
| Void | * | 'failed' | Annuler le record |
| Recurring | Successful | (subscription) | Renouveler abonnement |
| Fraud | * | 'failed' | Bloquer + notifier admin |

**Attention** : Le ConfirmURL pourrait etre appele plusieurs fois pour la meme transaction (changement de statut). L'idempotence est CRITIQUE.

### 3.5 Champs recus dans le ConfirmURL vs donnees necessaires

**Ce que QuickPay envoie au ConfirmURL** :
```
MerchantReference, Amount, TransactionID, CardMask, TransactionState,
ShippingFirstName, ShippingLastName, ShippingAddress1, ShippingAddress2,
ShippingCity, ShippingState, ShippingCountry, ShippingPostalCode,
CustomerEmail, CustomerFirstName, CustomerLastName, CustomerAddress1,
CustomerAddress2, CustomerCity, CustomerState, CustomerCountry,
CustomerPostalCode, CustomerPhone, SiteID
```

**Ce dont on a besoin** :
- `MerchantReference` → pour identifier la transaction (type + uuid)
- `Amount` → pour verifier le montant
- `TransactionID` → pour stocker comme reference UGPayments
- `CustomerEmail` → pour `buyer_email` / `fan_email`
- `TransactionState` → pour determiner le statut

**Ce qu'on n'a PAS** (vs Stripe) :
- Pas de `payment_intent_id` → remplace par `TransactionID`
- Pas de metadonnees custom → tout doit etre dans le `MerchantReference` ou pre-stocke en DB
- Pas de `customer_details.name` separe → `CustomerFirstName` + `CustomerLastName`

### 3.6 `PayReferenceID` dans le ConfirmURL

**Constat** : La doc QuickPay montre un champ `PayReferenceID` dans l'exemple de ConfirmURL :
```
Amount=17.99&MerchantReference=abc123&PayReferenceID=b9ab260b-...&TransactionID=4cfdefc3-...
```

Ce champ n'est pas dans la spec formelle mais apparait dans l'exemple. Il faut le parser aussi comme reference de paiement alternative.

---

## 4. RECOMMANDATIONS POUR LA FIABILITE

### 4.1 Idempotence du ConfirmURL (CRITIQUE)

**Risque** : QuickPay pourrait envoyer le meme POST ConfirmURL plusieurs fois (retry, changement de statut).

**Solution** :
```typescript
// Dans ugp-confirm, toujours verifier avant de traiter :
const existing = await supabase.from('tips').select('status').eq('id', tipId).single();
if (existing.status === 'succeeded') {
  return new Response('OK', { status: 200 }); // Deja traite, ignorer
}
```

Appliquer ce pattern a CHAQUE type de transaction.

### 4.2 Verification bidirectionnelle des montants (CRITIQUE)

**Risque** : Le formulaire QuickPay est soumis cote client. Un attaquant pourrait modifier le montant dans le formulaire avant soumission.

**Solution** : Dans `ugp-confirm`, TOUJOURS comparer le montant recu avec le montant stocke en DB :
```typescript
const expectedCents = record.amount_cents; // Pre-stocke lors de la creation
const receivedCents = Math.round(parseFloat(body.Amount) * 100);
const expectedTotalCents = expectedCents + Math.round(expectedCents * 0.05); // +5% fee

// Tolerer 1 cent d'ecart pour les arrondis
if (Math.abs(receivedCents - expectedTotalCents) > 1) {
  console.error(`Amount mismatch: expected ${expectedTotalCents}, received ${receivedCents}`);
  // Logger mais NE PAS rejeter (le paiement est deja effectue)
  // Ajuster la commission en consequence
}
```

### 4.3 Securisation du ConfirmURL

**Risque** : N'importe qui pourrait POST au ConfirmURL pour simuler un paiement.

**Solutions (cumulatives)** :
1. **Verification du TransactionID** : Stocker le `ugp_transaction_id` et verifier qu'il est unique (pas de double-credit)
2. **Secret partage (Key)** : Configurer dans le merchant portal UGPayments
3. **IP whitelist** : Restreindre les IPs autorisees (demander a UGPayments)
4. **Montant verifie** : Comme decrit en 4.2
5. **HTTPS obligatoire** : Le ConfirmURL doit etre en HTTPS

### 4.4 Pattern d'escrow pour les custom requests

**Recommandation detaillee** :

```
NOUVEAU FLUX CUSTOM REQUESTS :

1. Fan soumet + paie → status = 'pending_payment' → ugp-confirm → status = 'paid'
   (Montant dans une "zone tampon", PAS credite au wallet createur)

2. Createur accepte → manage-request (capture) :
   - status = 'delivered'
   - wallet_balance_cents += creator_net_cents
   - total_earned_cents += creator_net_cents

3. Createur refuse → manage-request (cancel) :
   - status = 'refused'
   - Fan notifie par email
   - Montant ajoute a une table `fan_credits` ou rembourse via admin

4. Expiration (6 jours) → cron job :
   - status = 'expired'
   - Meme logique que refuse
```

Pour implementer cela proprement, ajouter un champ `wallet_credited` boolean sur `custom_requests` pour tracker si le wallet a deja ete credite.

### 4.5 Atomicite des operations wallet

**Risque** : Conditions de concurrence sur `wallet_balance_cents` si deux paiements arrivent simultanement.

**Solution** : Utiliser une RPC PostgreSQL avec `FOR UPDATE` :
```sql
CREATE OR REPLACE FUNCTION credit_creator_wallet(
  p_creator_id UUID,
  p_amount_cents BIGINT
) RETURNS BIGINT AS $$
DECLARE
  new_balance BIGINT;
BEGIN
  UPDATE profiles
  SET wallet_balance_cents = wallet_balance_cents + p_amount_cents,
      total_earned_cents = total_earned_cents + p_amount_cents
  WHERE id = p_creator_id
  RETURNING wallet_balance_cents INTO new_balance;

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;
```

Et pour les debits (retraits) :
```sql
CREATE OR REPLACE FUNCTION debit_creator_wallet(
  p_creator_id UUID,
  p_amount_cents BIGINT
) RETURNS BIGINT AS $$
DECLARE
  current_balance BIGINT;
  new_balance BIGINT;
BEGIN
  SELECT wallet_balance_cents INTO current_balance
  FROM profiles WHERE id = p_creator_id FOR UPDATE;

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
$$ LANGUAGE plpgsql;
```

### 4.6 Logging et auditabilite

**Recommandation** : Creer une table `payment_events` pour logger chaque callback UGPayments :

```sql
CREATE TABLE payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL,
  merchant_reference TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  transaction_state TEXT,
  transaction_status TEXT,
  customer_email TEXT,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processing_result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_payment_events_txn ON payment_events(transaction_id);
CREATE INDEX idx_payment_events_ref ON payment_events(merchant_reference);
```

Chaque appel au ConfirmURL est d'abord logue dans cette table, puis traite. Cela permet :
- Le debugging en cas de probleme
- La detection de doublons
- L'audit financier
- La reconciliation

### 4.7 Gestion du timeout entre ApprovedURL et ConfirmURL

**Probleme** : Le fan est redirige vers l'ApprovedURL immediatement apres paiement, mais le POST au ConfirmURL peut arriver AVANT ou APRES.

**Pattern recommande** pour `PublicLink.tsx` :
```typescript
// 1. Lire le MerchantReference depuis l'URL (ex: ?ref=link_uuid)
const ref = searchParams.get('ref');
if (!ref) return;

const [type, recordId] = ref.split('_', 2);

// 2. Polling: verifier en DB si le paiement a ete confirme
const MAX_POLLS = 15;
const POLL_INTERVAL = 2000; // 2s
let polls = 0;

const checkPayment = async () => {
  const { data } = await supabase
    .from('purchases')
    .select('status, access_token')
    .eq('id', recordId)
    .single();

  if (data?.status === 'succeeded') {
    // OK, afficher le contenu
    return;
  }

  polls++;
  if (polls < MAX_POLLS) {
    setTimeout(checkPayment, POLL_INTERVAL);
  } else {
    // Afficher message "verification en cours, rafraichissez dans quelques instants"
  }
};
```

---

## 5. ELEMENTS SUPPLEMENTAIRES IDENTIFIES

### 5.1 Le champ `Email` dans le formulaire QuickPay

**Constat** : QuickPay a un champ `Email` optionnel dans le formulaire. Il faut TOUJOURS le remplir avec l'email du fan (si connu) pour :
1. Pre-remplir le formulaire de paiement
2. Recevoir l'email dans le ConfirmURL (`CustomerEmail`)
3. Envoyer le lien d'acces au contenu

### 5.2 Le formulaire QuickPay est un POST HTML, pas un API call

**Impact majeur sur l'architecture frontend** :

Actuellement, le frontend fait :
```javascript
const { data } = await supabase.functions.invoke('create-link-checkout-session', { body: {...} });
window.location.href = data.url; // Redirect vers Stripe
```

Avec QuickPay, le flux devient :
```javascript
const { data } = await supabase.functions.invoke('create-link-checkout', { body: {...} });
// data.fields contient les champs du formulaire
// Il faut creer un <form> et le soumettre
```

Le composant `QuickPayForm` doit :
1. Recevoir les champs
2. Creer un `<form method="POST" action="https://quickpay.ugpayments.ch/">`
3. Ajouter des `<input type="hidden">` pour chaque champ
4. Soumettre le formulaire automatiquement (`form.submit()`)

**Alternative** : Faire le POST cote serveur (edge function) et recuperer la redirection. Mais la doc QuickPay semble prevoir un formulaire client-side.

### 5.3 Le QuickPayToken est expose cote client

**Constat** : Le token est visible dans le HTML du formulaire. C'est le fonctionnement prevu par QuickPay (comme une cle publique Stripe).

**Mais** : Contrairement a Stripe ou la cle publique ne permet que de creer des sessions, le QuickPayToken pourrait permettre de soumettre des paiements directement. La securite repose ENTIEREMENT sur le ConfirmURL.

**Recommandation** : Confirmer avec UGPayments que le token seul ne suffit pas pour debiter un compte sans que le client saisisse ses coordonnees bancaires sur la page QuickPay.

### 5.4 Pattern `window.open` vs `window.location.href`

**Constat** : Les composants chat (`ChatTipForm`, `ChatCustomRequest`) utilisent `window.open(url, '_blank')` pour ne pas quitter la page de chat. Les autres utilisent `window.location.href`.

Avec un formulaire POST, `window.open` ne fonctionne pas directement. Il faut :
- Soit creer le form dans un `<iframe>` ou nouvelle fenetre
- Soit accepter la redirection (et la perte du contexte chat)

**Recommandation** : Pour les modales chat, creer un formulaire dans une popup :
```typescript
const win = window.open('', '_blank');
const form = win.document.createElement('form');
form.method = 'POST';
form.action = actionUrl;
// ... ajouter les inputs
form.submit();
```

### 5.5 `DeclinedURL` : page d'echec manquante

**Constat** : Le plan ne definit pas de page pour les paiements refuses. Actuellement, Stripe redirige vers la page d'origine (`cancel_url`).

**Recommandation** : Utiliser les memes URLs de retour avec un parametre d'erreur :
```
Liens :    /l/{slug}?payment_failed=true
Tips :     /{handle}?tip_failed=true
Gifts :    /{handle}?gift_failed=true
Requests : /request-success?status=cancelled&creator={handle}
```

Et gerer ces parametres dans les pages pour afficher un toast d'erreur.

### 5.6 Table `payouts` existante vs `withdrawals` proposee

**Constat** : La table `payouts` existe deja avec les colonnes :
```sql
id, creator_id, amount_cents, currency, status, stripe_payout_id, created_at, paid_at
```

**Recommandation** : NE PAS creer une nouvelle table `withdrawals`. Reutiliser `payouts` en ajoutant les colonnes necessaires :
```sql
ALTER TABLE payouts ADD COLUMN bank_iban TEXT;
ALTER TABLE payouts ADD COLUMN bank_holder_name TEXT;
ALTER TABLE payouts ADD COLUMN admin_notes TEXT;
ALTER TABLE payouts ADD COLUMN requested_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN processed_at TIMESTAMPTZ;
-- Ajouter 'approved', 'rejected' au CHECK constraint de status
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check
  CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'rejected'));
```

Cela evite de dupliquer la logique et garde l'historique des anciens payouts Stripe.

### 5.7 Subscription Premium : Username UGPayments

**Constat** : Le formulaire subscription QuickPay utilise un `MembershipUsername`. Ce username est utilise pour le Cancel form aussi.

**Recommandation** : Utiliser le `user.id` (UUID Supabase) comme `MembershipUsername`. C'est unique et permanent. Le stocker aussi dans `profiles.subscription_username` pour le cancel.

### 5.8 Dashboard admin pour les retraits : manque dans le plan

**Constat** : Le plan mentionne une "interface admin pour les retraits" mais ne precise pas les pages admin existantes.

**Action** : Verifier quelles pages admin existent et ou ajouter la gestion des retraits.

---

## 6. CHECKLIST DE COMPLETUDE

### 6.1 Tous les points de contact payment identifies ?

| Point de contact | Dans le plan ? | Complet ? |
|-----------------|----------------|-----------|
| Achat de lien (public) | Oui | Manque : access_token, email, conversation, chatter split |
| Achat de lien (chat) | Oui | Manque : window.open pattern |
| Tip (public) | Oui | OK |
| Tip (chat) | Oui | Manque : window.open pattern |
| Gift wishlist | Oui | OK |
| Custom request (public) | Oui | Manque : flux escrow detaille |
| Custom request (chat) | Oui | Manque : window.open pattern |
| Subscription Premium | Oui | Manque : renouvellement, commission referral recurrente |
| Annulation subscription | Oui | OK |
| Onboarding payout (IBAN) | Oui | OK |
| Retrait createur | Oui | Utiliser table `payouts` existante |
| Retrait affilie | Partiel | `request-affiliate-payout` inchange (email admin) |
| Webhook / ConfirmURL | Oui | Manque : detail des 6 sous-types |
| Verification post-paiement | Non | **A AJOUTER** (polling DB) |
| Dashboard revenus | Oui | Adapter le calcul wallet |
| Profile paiement | Oui | OK |
| Page succes tip | Oui | Adapter les params URL |
| Page succes request | Oui | Adapter les params URL |
| Page succes gift | Oui | Adapter les params URL |
| Page Stripe Validation | Oui (supprimer) | OK |
| Help/Pricing | Oui | OK |
| Referral commission | **NON** | **A AJOUTER** |
| Chatter revenue | **NON** | **A AJOUTER** (split 60/25/15) |
| Referral bonus $100 | **NON** | **A AJOUTER** |
| Flags premiere subscription | **NON** | **A AJOUTER** |
| Cron nettoyage pending | **NON** | **A AJOUTER** |
| Cron expiration requests | Partiel | Adapter sans Stripe |
| Email templates Brevo | **NON** | **A DETAILLER** |
| ProfileContext | Oui | OK |
| AppDashboard self-healing | Non applicable | Plus de Connect, simplifier |

### 6.2 Variables d'env completes ?

| Variable | Dans le plan ? |
|----------|---------------|
| `QUICKPAY_TOKEN` | Oui |
| `QUICKPAY_SITE_ID` | Oui |
| `QUICKPAY_CONFIRM_KEY` | Oui |
| `QUICKPAY_SUB_PLAN_ID` | Oui |
| `QUICKPAY_CANCEL_KEY` | **NON** — ajouter si different du confirm key |
| `PUBLIC_SITE_URL` | Deja present |
| `BREVO_API_KEY` | Deja present |

---

## 7. QUESTIONS SUPPLEMENTAIRES POUR UG PAYMENTS

En plus des 12 questions du plan, ajouter :

13. **ConfirmURL multiple posts** : Le ConfirmURL est-il appele une seule fois, ou peut-il etre appele a nouveau si le statut de la transaction change (refund, chargeback) ?
14. **PayReferenceID** : Ce champ apparait dans l'exemple mais pas dans la spec. Est-il toujours present ?
15. **Format du POST ConfirmURL** : Est-ce du `application/x-www-form-urlencoded` ou du `multipart/form-data` ?
16. **Timing du ConfirmURL** : Le POST arrive-t-il AVANT ou APRES le redirect vers ApprovedURL ? Quel est le delai moyen ?
17. **IP whitelist** : Depuis quelles IPs les POST ConfirmURL sont-ils envoyes ? (pour securiser l'endpoint)
18. **HTTPS requis** : Le ConfirmURL doit-il obligatoirement etre en HTTPS ?
19. **Retry** : Si le ConfirmURL retourne une erreur (500, timeout), UGPayments re-essaie-t-il ?
20. **Chargeback notification** : Comment etes-vous notifie d'un chargeback ? Y a-t-il un callback ?
21. **Montant dans ConfirmURL** : Le `Amount` inclut-il les frais de processing ou est-ce le montant net ?
22. **TransactionState et TransactionStatus** : Sont-ils toujours presents dans le ConfirmURL POST ? Ou seulement certains champs ?

---

## 8. RESUME DES PRIORITES

### Bloquants (a resoudre AVANT l'implementation)

1. **Questions 1-5 a UGPayments** : Remboursements, sandbox, securite ConfirmURL, renouvellement, annulation API
2. **Decision sur le flux custom requests** : Paiement immediat + escrow ou paiement differe ?
3. **Decision sur la devise** : EUR ou USD ?

### Corrections critiques du plan

4. Ajouter la logique `access_token` + email Brevo dans `ugp-confirm` pour les liens
5. Ajouter le split chatter 60/25/15 dans `ugp-confirm`
6. Ajouter la commission referral recurrente
7. Ajouter le bonus $100 referral
8. Utiliser `BIGINT` pour les colonnes wallet
9. Reutiliser la table `payouts` au lieu de creer `withdrawals`
10. Ajouter le mecanisme de polling/verification post-retour
11. RPC atomiques pour credit/debit wallet
12. Table `payment_events` pour l'audit

### Ameliorations recommandees

13. Pattern escrow pour custom requests
14. Cron jobs de nettoyage (pending expirees, requests expirees)
15. Pattern `window.open` pour les modales chat
16. DeclinedURL avec gestion d'erreur frontend
17. Flags premiere subscription dans `ugp-membership-confirm`
