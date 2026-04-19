# Incident 2026-04-19 — UG Payments : pollution du wallet + migration 2D/3D requise

> **Statut** : hotfix déployé en prod, réconciliation en attente de validation admin, migration DirectSale à spécifier.

---

## 1. Ce qui s'est passé

### 1.1 Le signal
Une créatrice (`@bellabad`) affichait **$1 500 "pending"** sur son espace, sans aucune transaction correspondante sur le dashboard UnicornGroup (MID `103799`). Le MID a été activé le **2026-04-14** (email Unicorn).

### 1.2 Le vrai bug (trouvé en investiguant)
La fonction `supabase/functions/ugp-confirm/index.ts` **ne filtrait pas sur `TransactionState`**. Elle routait uniquement sur le préfixe `MerchantReference` (`link_` / `tip_` / `gift_` / `req_` / `sub_` / `fsub_`) et exécutait systématiquement le handler « succès » :

- `purchases/tips/gifts` → `status='succeeded'` + `credit_creator_wallet` + email « content unlocked » au fan + email « new sale » au créateur
- `custom_requests` → `status='pending'` (même si le state n'était pas `Authorize`)
- `subscriptions` → `is_creator_subscribed=true`

### 1.3 Pourquoi c'est grave
UnicornGroup **POSTe le ConfirmURL pour plusieurs TransactionState** (cf. Appendix A de la doc QuickPay + doc DirectSale v1.14) :

> `Sale | Authorize | Capture | Void | Refund | Chargeback | Credit | CBK1 | Verify | Recurring`

Notamment pour `Verify` (vérification 3DS/AVS, **avant** capture), **y compris quand la Verify est Declined**. Avant le hotfix, chacun de ces callbacks :
1. Créditait le wallet créateur
2. Marquait la vente `succeeded`
3. Envoyait l'email de déblocage au fan (qui recevait donc le contenu même si sa carte a été refusée)

---

## 2. Quantification des dégâts (audit read-only, script `scripts/audit-ugp-pollution.ts`)

### 2.1 payment_events (ConfirmURL uniquement, hors listener_*)

| state / processed | count |
|---|---|
| `(null) / processed=false` | 1 |
| `Sale / processed=false` | 27 |
| `Sale / processed=true` | 55 ✅ (légitimes) |
| **`Verify / processed=true`** | **102 ❌** |

### 2.2 Rows applicatives polluées

| Table | Source | # | Crédit indu |
|---|---|---|---|
| `purchases` | `state=Verify` | 75 | **$2 305.80** |
| `tips` | `state=Verify` | 7 | $522.00 |
| `gift_purchases` | `state=Verify` | 5 | $1 129.49 |
| `custom_requests` | `state=Verify` (bloqué en `pending`) | 11 | $1 069.00 *non crédité mais fan a reçu « payé »* |
| purchases/tips/gifts | `ugp_transaction_id` orphelin | 10 | $246.20 |
| subs | Test card `4242…` | 2 | — vérifier `is_creator_subscribed` |

**Total wallet surévalué** : ~$4 203 répartis sur **32 créatrices**.

### 2.3 Top créatrices impactées

| Handle | Wallet actuel | Crédit indu |
|---|---|---|
| `@sen08` | $468.00 | **$1 377.00** → wallet négatif après correction |
| `@analiciacabrera` | $450.00 | $900.00 → négatif |
| `@fawl` | $373.49 | $395.99 → légèrement négatif |
| `@lunaparkerss-08` | $291.60 | $291.60 → **100% du wallet est fantôme** |
| `@tbtbtb` | $249.20 | $241.70 (compte dev probable) |
| `@misa` | $0.00 | $171.00 *(déjà à 0, pas de retrait à rattraper)* |
| `@sukizyra` | $0.00 | $165.60 |
| `@sexyboy` | $130.50 | $162.00 → négatif |
| `@sabbiesins` | $189.00 | $135.00 → $54 restant |

Total ~24 autres créatrices avec impact < $50.

### 2.4 Le cas bellabad — **pas** la pollution Verify

- `wallet_balance_cents = 0`, `total_earned_cents = 0`, aucune tip/gift/custom_request
- 12 `purchases` toutes en `status='pending'` avec `ugp_transaction_id = NULL`
- 3× $1 575 (net $1 500) les 18 et 19 avril
- 9× $15.75 le 8 avril
- Ce sont des **checkouts abandonnés** : le fan a cliqué « Buy », la purchase a été pré-créée (`create-link-checkout`), puis aucun ConfirmURL n'est arrivé (quitté la page avant de payer, carte refusée au Verify lui-même avant ConfirmURL, etc.)
- Ce qu'elle « voit » = UI qui affiche les purchases `pending` comme des ventes en attente. Elles ne le sont pas — il faut les passer en `abandoned`.

---

## 3. Hotfix déployé (commit à venir)

Fichier : `supabase/functions/ugp-confirm/index.ts`.

Ajout d'un filtre `TransactionState` avant le dispatch :

```ts
const actionableStatesByType: Record<string, ReadonlySet<string>> = {
  link: new Set(['Sale']),
  tip: new Set(['Sale']),
  gift: new Set(['Sale']),
  req: new Set(['Authorize']),
  sub: new Set(['Sale', 'Recurring']),
  fsub: new Set(['Sale', 'Recurring']),
};
if (allowedStates && !allowedStates.has(transactionState)) {
  // log + mark payment_events.processed=true avec processing_result="Skipped: …"
  return new Response('OK', { status: 200 });
}
```

- Les `Verify`, `Void`, `Refund`, `Chargeback`, `CBK1`, `Credit`, `Capture` sont loggés mais ignorés côté `ConfirmURL`
- `Refund`, `Chargeback`, `Void`, `Capture` restent gérés par `ugp-listener` (inchangé)
- Déployé sur `qexnwezetjlbwltyccks` le 2026-04-19

---

## 4. Plan de réconciliation (attente validation)

### Étape 1 — Migration `130_wallet_adjustments.sql`

```sql
create table wallet_adjustments (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id),
  amount_cents int not null, -- négatif = débit, positif = crédit
  reason text not null,
  source_table text,
  source_id uuid,
  source_txn_id text,
  source_state text,
  created_by uuid,
  created_at timestamptz default now()
);
```

### Étape 2 — Re-traiter les rows polluées (dry-run d'abord)

Pour chaque `purchases/tips/gift_purchases` dont `ugp_transaction_id` pointe sur un `payment_events.transaction_state` hors whitelist :
- `update <table> set status='failed', admin_reconciled=true, admin_reason='verify-event-not-sale'`
- `insert into wallet_adjustments (creator_id, amount_cents, reason, …) values (…, -creator_net_cents, 'verify-not-sale', …)`
- `update profiles set wallet_balance_cents = wallet_balance_cents - creator_net_cents, total_earned_cents = total_earned_cents - creator_net_cents where id = creator_id`

Pour les `custom_requests` : `status='expired'` (aucun debit — jamais crédité).

Pour les 2 subs test-card : `is_creator_subscribed=false` si le profil n'est pas un compte TB/admin.

### Étape 3 — Purger les abandoned checkouts

```sql
update purchases set status='abandoned'
  where status='pending' and ugp_transaction_id is null
  and created_at < now() - interval '24 hours';
-- même chose pour tips, gift_purchases, custom_requests (status='pending_payment')
```

→ nettoie automatiquement le cas bellabad.

### Étape 4 — Communication créatrices

Template email à rédiger (via Brevo) pour les 32 impactées. Cas individuel pour `@sen08`, `@analicia`, `@fawl`, `@lunaparkerss-08` (gros écarts).

### Étape 5 — Hardening (Phase 4)

- [ ] Test d'intégration `ugp-confirm.test.ts` qui POST un `Verify` et vérifie no-op
- [ ] Cron journalier qui compare `sum(creator_net_cents) purchases.succeeded` vs UG dashboard via `UGP_API_BEARER_TOKEN` — alerte si divergence > $10
- [ ] Renommer `purchases.status='pending'` → `'checkout_initiated'` pour distinguer pré-création vs pre-auth
- [ ] Ajouter colonne `purchases.ugp_transaction_state` + index pour audits futurs

---

## 5. Décisions en attente utilisateur

1. Feu vert pour migration 130 + SQL réconciliation (j'envoie un dry-run d'abord)
2. Stratégie wallet négatif : absorber ou remettre à zéro ? *(ex: @sen08 passe à -$909 après correction)*
3. Contenu débloqué à tort : invalider les `access_token` des purchases passées en `failed` ?
4. Communication créatrices : qui rédige, qui envoie
5. bellabad : comment gérer l'attente — elle croit avoir vendu $1 500

---

## 6. Demande connexe — migration QuickPay → DirectSale (2D/3D cascade)

### 6.1 Contexte (email Derek Baehr / Unicorn du 2026-04-17)
Trop de cartes US sont **Declined** au Verify (3DS). Les US n'ont pas 3DS obligatoire. Unicorn a **ajouté la cascade 2D** côté merchant, mais :

> « Since this account is quickpay, you will have to update the integration to direct. […] You will have to integrate both 2d and 3d endpoints and route accordingly on your side. »

### 6.2 Ce que ça implique
- **Migrer de QuickPay (redirect) → DirectSale (API JSON on-site)**, endpoint `https://api.ugpayments.ch/merchants/[MerchantId]/saletransactions` + `authorizetransactions` + `capturetransactions` + `voidtransactions` + `refundtransactions`
- Auth : `Authorization: Bearer <OAuth Bearer Token>` (token fourni dans l'email)
- Routage applicatif : USD hors EEA/UK → endpoint 2D ; EEA/UK → endpoint 3D (3DS obligatoire SCA)
- Le JSON Request inclut **le PAN en clair** (`cardNumber`, `cvvCode`, `expirationMonth/Year`) → **scope PCI-DSS passe de SAQ A à SAQ D**

### 6.3 Problèmes bloquants avant de coder
1. **PCI-DSS** : accepter des PAN sur notre front React + edge function Supabase = compliance lourde (attestation SAQ D, audit annuel, segmentation réseau, journalisation). Question à Derek : **UG propose-t-il des hosted fields / iframe / tokenization** pour rester en SAQ A ? La doc v1.14 n'en parle pas mais ça existe souvent en annexe.
2. **Routage 2D vs 3D** : sur quoi baser la décision ?
   - Billing country du form ? (facilement spoofable)
   - BIN lookup sur les 6 premiers chiffres (identifie le pays émetteur de la carte) ?
   - IP geo du fan ?
   - Réponse : **BIN lookup** est le standard. À confirmer avec Derek.
3. **Subscriptions** : QuickPay gérait les rebills. Avec DirectSale il y a deux options :
   - (a) Laisser UG gérer via `SubscriptionPlanId` côté initial Sale
   - (b) On gère nos propres rebills via endpoint `/recurringtransactions` + `referenceTransactionId`
4. **Doc 3D manquante** : Derek parle d'un « 3d integration document » en pièce jointe. Nous avons reçu **seulement** le DirectSale v1.14 (2D). **Il nous faut la doc 3D** pour commencer.
5. **Parallel run** : il faut garder QuickPay fonctionnel pendant que Direct est testé (feature flag ou routage par créatrice beta).

### 6.4 Plan proposé (à spec'er proprement — n'est pas un hotfix)

**Phase 0 — Questions bloquantes à Derek (1 jour)**
- [ ] Demander la doc 3D integration
- [ ] Hosted fields / tokenization possibles pour éviter SAQ D ?
- [ ] Recommandation sur le routage 2D/3D (BIN vs country vs cascade auto)
- [ ] La cascade 2D déjà activée côté merchant fonctionne-t-elle pour les transactions QuickPay existantes ? *(si oui, les declines US devraient déjà diminuer sans migration)*

**Phase 1 — Spec** (brainstorming + writing-plans skill)
- Architecture cible (où vivent les formulaires de carte, comment on tokenize, quel routage)
- Migration incrémentale (link → tip → gift → request → subscriptions)
- Impact PCI + audit nécessaire

**Phase 2 — Implémentation** (5-10 jours)
- Nouveau composant `CardInputForm` (si hosted fields) OU page de capture carte sécurisée
- Nouvelles edge functions `create-link-checkout-direct`, idem tip/gift/request/sub
- Middleware de routage 2D vs 3D (BIN lookup — on peut utiliser une librairie comme `credit-card-type` ou la BINList API)
- `ugp-confirm` déjà patché — reste valable car DirectSale a aussi un ConfirmURL (cf. doc v1.14 §Confirm Page — même NVP format + nouveau champ `TransactionStatus`)
- Adapter `manage-request` pour utiliser `/capturetransactions`, `/voidtransactions`

**Phase 3 — Feature flag rollout**
- Flag `use_direct_checkout` par créatrice
- Activer sur 1–2 créatrices test pendant 24h
- Monitoring : decline rate 2D vs 3D, comparaison UG dashboard vs DB

**Phase 4 — Cutover**
- Toutes les checkouts en Direct
- Désactiver QuickPay côté frontend
- Deprecate edge functions QuickPay

### 6.5 Ma recommandation

**Ne pas coder en urgence ce week-end.** Étapes concrètes :
1. Envoyer ce soir à Derek les 4 questions bloquantes Phase 0
2. Demander à Unicorn s'ils peuvent **temporairement désactiver 3DS** pour les US **via QuickPay** en attendant la migration — ce serait un patch immédiat qui débloque les declines sans réarchitecturer
3. Spec'er la migration DirectSale sur la semaine prochaine (skill `superpowers:brainstorming` + `writing-plans`)
4. Implémenter sur 1-2 semaines, parallel run, cutover

**Ce qu'il ne faut pas faire** : improviser une migration un dimanche soir sur une stack PCI-sensible. Le risque > bénéfice.

---

## 7. Fichiers touchés

- `supabase/functions/ugp-confirm/index.ts` — hotfix TransactionState filter *(déployé)*
- `scripts/audit-ugp-pollution.ts` — audit read-only *(ajouté, à committer)*
- `docs/sales/sales.md` — export UG dashboard utilisé pour l'audit *(fourni par user)*
- `docs/incidents/2026-04-19-ugp-payment-integration.md` — ce document

## 8. Chronologie

- **2026-04-14** (mardi) — MID 103799 activé par Unicorn
- **2026-04-14 → 2026-04-19** — 102 `Verify` events traités comme des Sales → wallets pollués
- **2026-04-17** (jeudi) — Paybuddy signale à Derek les declines US 3DS, demande désactivation 3DS
- **2026-04-17** (jeudi) — Derek répond : cascade 2D ajoutée côté UG, mais nécessite migration QuickPay → Direct
- **2026-04-19** (dimanche) — `@bellabad` signale $1 500 pending sans trace UG → investigation → bug identifié → hotfix déployé → audit run
