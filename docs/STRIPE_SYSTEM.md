# Système de Vérification Stripe - Documentation Technique

## Vue d'ensemble

Le système de vérification Stripe est conçu pour être **scalable**, **sécurisé** et **automatisé**. Il garantit que seuls les créateurs avec un compte Stripe validé peuvent recevoir des paiements et afficher des liens payants sur leur profil public.

---

## Architecture

### 1. **Synchronisation du Statut Stripe**

Le statut `stripe_connect_status` dans la table `profiles` peut avoir 3 valeurs :

- **`pending`** : Compte Stripe créé mais onboarding incomplet
- **`restricted`** : Compte Stripe avec des restrictions (documents manquants, etc.)
- **`complete`** : Compte Stripe entièrement validé et prêt à recevoir des paiements

### 2. **Sources de Synchronisation**

Le statut est synchronisé via **3 mécanismes** :

#### A. **Webhooks Stripe** (Principal - Temps réel)
- **Fichier** : `supabase/functions/stripe-webhook/index.ts`
- **Event** : `account.updated`
- **Logique** :
  ```typescript
  if (account.charges_enabled && account.payouts_enabled) {
    connectStatus = 'complete';
  } else if (account.requirements?.disabled_reason) {
    connectStatus = 'restricted';
  } else {
    connectStatus = 'pending';
  }
  ```
- **Sécurité** : Vérification de signature Stripe obligatoire
- **Idempotence** : Mise à jour uniquement si le statut a changé

#### B. **Edge Function `stripe-connect-status`** (Self-healing)
- **Fichier** : `supabase/functions/stripe-connect-status/index.ts`
- **Appel** : Depuis le frontend (page Profile, Dashboard)
- **Logique** :
  - Récupère le statut en temps réel depuis l'API Stripe
  - **Auto-synchronise** la base de données si le statut diffère
  - Retourne les exigences manquantes (documents, infos bancaires, etc.)
- **Rate Limiting** : 60 requêtes/minute/IP
- **CORS** : Restreint aux domaines autorisés

#### C. **Edge Function `stripe-connect-onboard`** (Création)
- **Fichier** : `supabase/functions/stripe-connect-onboard/index.ts`
- **Appel** : Lors de la première connexion Stripe
- **Logique** :
  - Crée un compte Stripe Express si inexistant
  - Initialise `stripe_connect_status = 'pending'`
  - Génère un lien d'onboarding Stripe

---

## Règles de Sécurité et Scalabilité

### 1. **Blocage de l'Accès aux Liens Payants**

#### A. **Frontend - Profil Public** (`CreatorPublic.tsx`)
```typescript
const isStripeComplete = profileData.stripe_connect_status === 'complete';

if (isStripeComplete) {
  // Charger et afficher les liens payants
} else {
  // Ne pas afficher les liens payants
  setLinks([]);
}
```

#### B. **Frontend - Configurateur** (`LinkInBioEditor.tsx`)
```typescript
const hasStripeAccount = Boolean(profile.stripe_account_id);
const isStripeComplete = profile.stripe_connect_status === 'complete';
setStripeConnected(hasStripeAccount && isStripeComplete);

// Affiche le message "Connect Stripe" si !stripeConnected
```

#### C. **Frontend - Espace Links** (`CreatorLinks.tsx`)
```typescript
const canCreate = hasStripeAccount && isConnectComplete;
setCanCreateLinks(canCreate);

// Affiche un message de blocage si !canCreateLinks
```

#### D. **Backend - Création de Checkout** (`create-link-checkout-session`)
```typescript
if (!creatorProfile.stripe_account_id) {
  return error('Creator is not ready to receive payouts yet');
}

if (creatorProfile.stripe_connect_status !== 'complete') {
  return error('Creator is still finishing payout setup');
}
```

### 2. **Row Level Security (RLS)**

**Note** : Les RLS policies actuelles permettent aux créateurs de créer des liens même sans Stripe validé. C'est **intentionnel** pour permettre la préparation de contenu avant validation Stripe.

**Sécurité** : Le blocage se fait au niveau du **checkout** (impossible de vendre sans Stripe validé).

---

## Flux Utilisateur

### Scénario 1 : Nouveau Créateur

1. **Inscription** → `stripe_connect_status = null`
2. **Onboarding Stripe** → Appel `stripe-connect-onboard` → `stripe_connect_status = 'pending'`
3. **Complétion Stripe** → Webhook `account.updated` → `stripe_connect_status = 'complete'`
4. **Création de liens** → Autorisé partout
5. **Vente de liens** → Autorisé (checkout fonctionne)

### Scénario 2 : Créateur avec Compte Incomplet

1. **Statut** : `stripe_connect_status = 'pending'`
2. **Profil Public** : Liens payants **cachés**
3. **Configurateur** : Message "Connect Stripe to manage paid links"
4. **Espace Links** : Message "Connect Stripe to start selling"
5. **Checkout** : **Bloqué** avec erreur 400

### Scénario 3 : Créateur avec Compte Validé

1. **Statut** : `stripe_connect_status = 'complete'`
2. **Profil Public** : Liens payants **affichés**
3. **Configurateur** : Accès complet à la gestion des liens
4. **Espace Links** : Création et gestion autorisées
5. **Checkout** : **Autorisé** (paiements fonctionnent)

---

## Optimisations Performances

### 1. **Index Base de Données**
```sql
-- Migration 016
CREATE INDEX idx_profiles_stripe_connect_status 
ON profiles(stripe_connect_status) 
WHERE stripe_connect_status IS NOT NULL;
```

### 2. **Caching Frontend**
- Le statut Stripe est chargé **une seule fois** au chargement de la page
- Pas de polling continu (économie de requêtes)
- Rafraîchissement uniquement sur action utilisateur (retour onboarding, refresh manuel)

### 3. **Rate Limiting**
- `stripe-connect-status` : 60 req/min/IP
- `stripe-connect-onboard` : 20 req/min/IP
- Protection contre les abus et les attaques DDoS

---

## Monitoring et Debugging

### Logs Importants

#### Webhook
```
Received Stripe event: account.updated
Connect status updated for user: <user_id> status: complete
```

#### Self-Healing
```
Syncing Stripe status for user <user_id> from pending to complete
```

### Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `Creator is not ready to receive payouts yet` | `stripe_account_id` manquant | Compléter l'onboarding Stripe |
| `Creator is still finishing payout setup` | `stripe_connect_status != 'complete'` | Compléter les exigences Stripe |
| `Missing stripe-signature header` | Webhook sans signature | Vérifier la configuration Stripe |
| `Webhook signature verification failed` | Mauvais secret webhook | Vérifier `STRIPE_WEBHOOK_SECRET` |

---

## Sécurité

### 1. **Validation des Webhooks**
- ✅ Signature Stripe vérifiée avec `stripe.webhooks.constructEventAsync()`
- ✅ Rejet immédiat si signature invalide (400)
- ✅ Pas d'accès DB sans signature valide

### 2. **CORS Restreint**
- ✅ Origines autorisées : `PUBLIC_SITE_URL` + localhost dev
- ✅ Pas de `Access-Control-Allow-Origin: *`

### 3. **Authentification**
- ✅ Token Supabase requis pour `stripe-connect-status` et `stripe-connect-onboard`
- ✅ Validation du token avant toute opération

### 4. **Rate Limiting**
- ✅ Protection contre les abus (in-memory, best-effort)
- ✅ Limites adaptées par fonction

---

## Scalabilité

### Points Forts

1. **Webhooks Stripe** : Synchronisation temps réel sans polling
2. **Self-Healing** : Auto-correction si webhook manqué
3. **Index DB** : Requêtes optimisées sur `stripe_connect_status`
4. **Stateless** : Edge Functions sans état persistant
5. **Idempotence** : Webhooks rejouables sans duplication

### Limites Actuelles

1. **Rate Limiting** : In-memory (reset au redémarrage de la fonction)
   - **Solution future** : Redis ou Upstash pour rate limiting distribué
2. **Pas de retry automatique** : Si webhook échoue, pas de retry
   - **Solution actuelle** : Self-healing via `stripe-connect-status`

---

## Maintenance

### Ajout d'un Nouveau Pays

1. Ajouter le code pays dans `SUPPORTED_STRIPE_CONNECT_COUNTRIES` (`stripe-connect-onboard/index.ts`)
2. Tester l'onboarding avec un compte test du nouveau pays
3. Vérifier les exigences spécifiques au pays dans Stripe Dashboard

### Modification du Statut

Si besoin de changer manuellement le statut d'un créateur :

```sql
UPDATE profiles 
SET stripe_connect_status = 'complete' 
WHERE id = '<user_id>';
```

**⚠️ Attention** : Le webhook Stripe écrasera cette valeur lors du prochain `account.updated`.

---

## Résumé

Le système Stripe est **production-ready** avec :

- ✅ Synchronisation automatique via webhooks
- ✅ Self-healing en cas de webhook manqué
- ✅ Blocage sécurisé des paiements si compte non validé
- ✅ UX claire pour les créateurs (messages explicites)
- ✅ Performance optimisée (index, caching, rate limiting)
- ✅ Sécurité renforcée (CORS, auth, signature webhooks)

**Aucune action manuelle requise** : Le système se synchronise automatiquement.
