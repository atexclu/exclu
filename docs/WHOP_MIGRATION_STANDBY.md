# Whop Migration — Standby / Handoff / Cleanup

> Objectif : comme l’utilisation de Whop n’est plus certaine, ce document sert à :
> 1) permettre à une IA (ou un dev) de **reprendre l’implémentation** plus tard sans perdre le contexte,
> 2) fournir une checklist pour **tout supprimer proprement** (zéro code mort) si la migration est abandonnée.

---

## 1) État actuel

- Aucun déploiement Whop en production n’est acté.
- Le document de plan existant est : `docs/PLAN_STRIPE_TO_WHOP_MIGRATION.md`.
- Contexte important : Whop ne fournit pas forcément un environnement “test mode” équivalent Stripe. Il faut éviter de supposer une séparation test/prod automatique.

---

## 2) Décisions et hypothèses (à re-valider si reprise)

### Paiements / commissions (règles métier à conserver)

- **Fan processing fee** : +5% payé par le fan (en plus du prix de base).
- **Commission Exclu** :
  - Créateur **Premium** : 0%
  - Créateur **Free** : 10%
- Ces règles s’appliquent à :
  - Links
  - Requests
  - Tips
  - Gifts

### Redirections checkout (invariant UX)

Toutes les règles existantes doivent être conservées à l’identique :
- connecté / non connecté
- email fourni / non fourni
- pages success/cancel existantes
- comportements actuels post-checkout pour links/requests/tips/gifts

### Modèle Whop envisagé (à confirmer)

Le plan propose une approche « Whop for Platforms / connected accounts » :
- 1 “platform company” Exclu
- 1 “connected company” (sub-merchant) par créateur
- KYC au moment du retrait via `account_links` / `use_case: account_onboarding`

⚠️ Point bloquant à re-valider : si Whop ne permet pas un vrai “test mode”, prévoir un mode “mock” local, ou des produits Whop dédiés tests.

---

## 3) Ce qui est nécessaire pour reprendre l’implémentation

### 3.1 Pré-requis Whop à récupérer

- **Company ID** Exclu : `biz_...` (format `biz_XXXXXXXX`)
  - Ex : `biz_iG2o1JKD3P1n2y` (à confirmer)
- **App ID** : `app_...`
- **API Key** : `apik_...`
- Webhook secret (si Whop en fournit un) : `whsec_...`
- IDs des produits/plans (si on choisit de pré-créer) : `prod_...`, `plan_...`

### 3.2 Variables d’environnement (guidelines)

- Ne jamais hardcoder des secrets.
- Backend (Supabase Edge Functions) : variables côté Supabase Secrets.
- Frontend : uniquement valeurs publiques.

#### Vite vs Next
Le repo actuel est côté frontend en **Vite** (donc `VITE_*`), pas `NEXT_PUBLIC_*`.

Exemples (à adapter)
- Frontend : `VITE_WHOP_APP_ID=app_...`
- Backend : `WHOP_API_KEY=apik_...`, `WHOP_COMPANY_ID=biz_...`, `WHOP_WEBHOOK_SECRET=...`

---

## 4) Plan de reprise (high-level)

Si reprise, exécuter dans cet ordre :

1. **Décider la stratégie “dev local”** :
   - mode mock en local (recommandé si Whop n’a pas de sandbox)
   - ou produits Whop “TEST” dédiés (risque de micro-paiements réels)

2. **DB migrations** :
   - supprimer/renommer toutes les colonnes qui mentionnent “stripe” → `payment_provider_*` ou `whop_*`

3. **Edge Functions** :
   - remplacer les fonctions Stripe checkout par Whop checkout
   - remplacer `stripe-webhook` par `whop-webhook`

4. **Frontend** :
   - remplacer les appels checkout vers les nouvelles Edge Functions
   - conserver les redirections existantes

5. **Premium migration** :
   - backup des créateurs Premium actuels avant bascule
   - stratégie de re-subscribe/grace period

---

## 5) Checklist “Cleanup” — supprimer Whop proprement (zéro code mort)

À utiliser si décision finale : **on n’utilise pas Whop**.

### 5.1 Docs
- [ ] Supprimer `docs/PLAN_STRIPE_TO_WHOP_MIGRATION.md` si non pertinent
- [ ] Supprimer `docs/WHOP_MIGRATION_STANDBY.md` (ce fichier) une fois archivé ailleurs

### 5.2 Frontend
- [ ] Supprimer toute mention de Whop dans le code (`WHOP`, `whop`, `VITE_WHOP_*`, `NEXT_PUBLIC_WHOP_*`)
- [ ] Retirer toute UI liée Whop (boutons, pages, toasts, redirects)

### 5.3 Supabase Edge Functions
- [ ] Supprimer toute Edge Function liée à Whop (si elles ont été créées)
- [ ] Retirer toute logique de webhook Whop (endpoints, signature checks)

### 5.4 Base de données
- [ ] Supprimer toutes colonnes/table ajoutées uniquement pour Whop (si ajoutées)
- [ ] Vérifier que les anciennes colonnes Stripe restent cohérentes

### 5.5 Environnements / Secrets
- [ ] Retirer les secrets Whop de :
  - Vercel env
  - Supabase secrets
  - `.env.local`

### 5.6 Vérification “zéro code mort”
- [ ] `grep -R "whop"` → doit retourner 0 résultat (ou uniquement dans des docs archivés)
- [ ] `grep -R "WHOP_"` → 0 résultat
- [ ] L’app build sans variables Whop

---

## 6) Notes opérationnelles (sécurité)

- Les clés `apik_...` ne doivent jamais être commitées.
- Éviter de recoller des clés complètes dans les tickets, commits, ou logs.

---

## 7) Référence

- Plan détaillé (si reprise) : `docs/PLAN_STRIPE_TO_WHOP_MIGRATION.md`
