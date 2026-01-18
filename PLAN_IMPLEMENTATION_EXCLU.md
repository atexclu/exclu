# Plan d’implémentation Exclu (App produit)

Ce document décrit le plan d’implémentation de l’application Exclu (côté produit, au‑delà de la landing page).
Il est mis à jour au fur et à mesure du développement : chaque tâche est marquée comme **faite** ou **à faire**.

## Légende

- [ ] Non commencé
- [x] Terminé

---

## 0. Pré‑existant (déjà en place)

- [x] Landing page marketing (SPA React + Vite + Tailwind + shadcn/ui)
- [x] Routing de base avec React Router (`/`, `*`)
- [x] Page `/auth` avec intégration Supabase (login / signup + reset password)
- [x] Déploiement Vercel de la landing + routing SPA via `vercel.json`
- [x] Carrousel "10,000+ creators" alimenté par 18 vraies photos dans `public/creators/*`.

Ce plan se concentre sur **l’app produit** (dashboard créateur, liens payants, accès fan), en s’appuyant sur ces briques.

---

## Invariants de sécurité (à respecter partout)

- **Aucun contenu payant dans un bucket public** :
  - Tous les fichiers vendus sont stockés dans un **bucket privé** Supabase Storage.
  - Le client n’a jamais accès au chemin réel (`storage_path`) ni au bucket name.

- **Jamais de décision d’autorisation dans le frontend** :
  - Le frontend n’affiche que ce que les **Edge Functions** ou Supabase (via RLS) lui renvoient.
  - Toute décision “ce fan a le droit d’accéder à ce contenu” est prise **côté backend** (Edge Function), jamais dans le code React seul.

- **Accès au fichier uniquement via URL signée courte durée** :
  - L’accès au contenu protégé se fait via des **URLs signées** générées côté serveur avec un TTL court (ex. 5–15 minutes).
  - Aucune URL permanente, aucune utilisation de `publicURL()` pour les contenus payants.
  - La **durée de vie de l’URL signée** est indépendante de la **durée du droit d’accès** pour le fan :
    - le droit d’accès peut être illimité ou limité dans le temps,
    - mais chaque visite régénère une nouvelle URL signée courte durée.

- **Tokens d’accès forts et non devinables** :
  - `access_token` = jeton aléatoire cryptographiquement sûr (≥ 128 bits), généré côté Edge Function.
  - Ne jamais utiliser d’ID séquentiel ou de slug devinable comme secret.

- **Webhooks sécurisés** :
  - Vérification stricte de la **signature** des webhooks du PSP (fournisseur de paiement).
  - Protection contre le **replay** (stockage des `event_id` et refus des doublons).

- **RLS stricte sur toutes les tables sensibles** :
  - RLS obligatoire sur `profiles`, `links`, `purchases`.
  - Les Edge Functions utilisent la **service_role key** (côté serveur uniquement) pour bypass RLS quand nécessaire.

---

## 1. Phase 0 – Clarification du MVP

### 1.1. Décisions produit

- [ ] Valider que le MVP se limite à :
  - [ ] Créateur : créer des liens payants, uploader du contenu, fixer un prix, voir ses ventes.
  - [ ] Fan : accès sans compte, simple flux “payer → accéder au contenu → email de confirmation”.
- [ ] Confirmer que :
  - [ ] Le modèle de monétisation comprend **deux briques** à préparer :
    - [ ] un **abonnement hard paywall** donnant accès au profil / feed du créateur ;
    - [ ] des **paiements à l’acte** pour des contenus individuels (unlock par contenu).
  - [ ] Le **prestataire de paiement** et l’implémentation technique concrète (Stripe ou autre, produits, plans, etc.)
        seront définis et implémentés **uniquement dans la phase Paiement**.
  - [ ] Payouts au créateur seront gérés **manuellement** au début (tableau de bord informatif).
- [ ] Choisir quelques créateurs pilotes pour tester le MVP (optionnel mais recommandé).

---

## 2. Phase 1 – Fondations techniques

Objectif : avoir les **modèles de données**, l’**auth** stabilisée et le **squelette des routes** de l’app (sans paiement).

### 2.1. Modèle de données Supabase (avec RLS)

Créer / ajuster les tables suivantes :

- [x] `profiles`
  - [x] Colonnes : `id` (UUID, PK = user id Supabase), `display_name`, `avatar_url`, `bio`, `is_creator`, `is_admin`, `stripe_account_id`.
  - [ ] Trigger ou script pour initialiser un profil à la création d’un user (à faire plus tard).
  - [x] **RLS** :
    - [x] Policies owner existantes (`id = auth.uid()`).
    - [ ] Policy supplémentaire permettant aux super‑admins (`is_admin = true`) de lire tous les profils.

- [x] `links`
  - [ ] Colonnes : `id` (UUID, PK), `creator_id` (FK → profiles.id), `slug` (unique, non trivial), `title`, `description`,
        `price_cents`, `currency`, `status` (`draft` / `published` / `archived`), `storage_path`, `created_at`, `updated_at`.
  - [x] Index unique sur `slug`.
  - [x] **Règles de sécurité** :
    - [x] Le champ `storage_path` ne doit jamais être renvoyé dans les réponses publiques (côté Edge Functions / requêtes frontend) – à respecter côté Edge Functions.
  - [x] **RLS** :
    - [x] Policies existantes pour limiter SELECT/INSERT/UPDATE/DELETE au `creator_id = auth.uid()`.
    - [x] Policy supplémentaire pour permettre aux super‑admins de lire tous les liens.

- [x] `purchases`
  - [x] Colonnes : `id` (UUID, PK), `link_id` (FK → links.id), `buyer_email`, `amount_cents`, `currency`,
        `status` (`pending` / `succeeded` / `refunded`), `access_token`, `access_expires_at` (nullable), `created_at`.
  - [ ] `access_token` sera généré côté Edge Function, long et aléatoire (à implémenter avec les Edge Functions).
  - [x] `access_expires_at` définit la **durée du droit d’accès** :
    - [x] `NULL` = accès illimité (lifetime) au contenu acheté.
    - [x] valeur non nulle = accès autorisé tant que `now() < access_expires_at`.
  - [x] **RLS** :
    - [x] Policy pour que le créateur ne lise que les achats de ses liens.
    - [x] Policy pour que les super‑admins puissent lire toutes les lignes.

- [ ] (Optionnel MVP+) `link_access_logs`
  - [ ] Colonnes minimales : `id`, `purchase_id`, `ip_hash`, `user_agent`, `opened_at`.
  - [ ] RLS restrictive (lecture uniquement par le créateur propriétaire via join).

- [x] Buckets Storage
  - [x] Créer un bucket **privé** `paid-content` (lecture publique désactivée).
  - [x] Vérifier qu’aucun code n’utilise `publicURL()` pour ce bucket.
  - [x] Définir une **organisation par créateur / par lien** dans le bucket, par exemple :
    - [x] `paid-content/{creator_id}/{link_id}/original` pour le fichier source (photo/vidéo haute qualité).
    - [x] `paid-content/{creator_id}/{link_id}/derived/*` pour d’éventuelles variantes (thumbnails floutés, previews basse def).
  - [ ] Configurer les policies Storage pour que :
    - [ ] Aucun accès anonyme / public ne soit autorisé sur `paid-content` (par défaut déjà le cas, à vérifier au moment des Edge Functions).
    - [ ] Seules les Edge Functions avec `service_role` puissent lire les objets originaux et générer des URLs signées.
    - [ ] Les créateurs ne puissent supprimer / lister que leurs propres objets (optionnel pour V1, mais à cadrer).

### 2.2 bis. Rôles et permissions (fan / creator / super-admin)

- [ ] Définir les rôles applicatifs suivants :
  - [ ] **Fan** (anonyme ou identifié par email) :
    - [ ] Peut consulter les pages publiques créateur (`/c/:handle`) et contenus (`/l/:slug`).
    - [ ] Peut déclencher un paiement (abonnement ou contenu à l’acte) et accéder aux contenus débloqués via token.
  - [ ] **Creator** :
    - [ ] Utilisateur authentifié Supabase, associé à une ligne `profiles` avec `is_creator = true`.
    - [ ] Peut gérer uniquement ses propres liens, contenus et stats.
  - [ ] **Super-admin** :
    - [ ] Utilisateur interne à la plateforme, identifié par un flag dédié (ex. `is_admin` dans `profiles` ou table `admins`).
    - [ ] Peut superviser la plateforme : voir tous les créateurs, liens, achats, et éventuellement désactiver un lien ou un profil.

- [ ] Adapter les RLS pour ces rôles :
  - [ ] `profiles` :
    - [ ] Règle standard : chaque user ne voit que son profil.
    - [ ] Règle super-admin : accès lecture à tous les profils (ex. via `EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())`).
  - [ ] `links` / `purchases` :
    - [ ] Créateur : accès limité à ses propres lignes.
    - [ ] Super-admin : accès lecture globale pour pouvoir auditer et supporter les utilisateurs.


### 2.2. Auth & routes protégées

- [x] Mettre en place un **provider Supabase** global (déjà en place via `supabaseClient.ts`).
- [x] Créer un composant `ProtectedRoute` ou équivalent :
  - [x] Vérifie la session Supabase côté client (`supabase.auth.getSession` + `onAuthStateChange`).
  - [x] Redirige vers `/auth` si aucun utilisateur connecté.
- [x] Ajouter les premières routes app :
  - [x] `/app` → layout dashboard créateur de base (`AppDashboard`), accessible uniquement via `ProtectedRoute`.
  - [x] `/app/links` → liste des liens du créateur (tableau responsive avec titre, prix, statut, date, bouton "New link").
  - [x] `/app/links/new` → création de lien avec formulaire moderne (titre, description, prix, statut) et upload média.
  - [x] `/app/links/:id/edit` → édition de lien.
  - [x] `/l/:slug` → page publique d’un lien (paywall + accès après achat).
- [x] Protéger toutes les routes `/app/**` avec `ProtectedRoute` (actuellement `/app`, à étendre aux futures routes app).

### 2.2 ter. UX auth créateur

- [x] Après signup, afficher un message clair demandant de **confirmer l’email** puis de se connecter, sans rediriger automatiquement vers `/app`.
- [x] Après login réussi, rediriger l’utilisateur vers `/app` (dashboard créateur).
- [x] Ajouter un bouton/icône de **logout** dans le dashboard (`AppDashboard`) qui appelle `supabase.auth.signOut()` et renvoie vers `/`.

### 2.3. Structure frontend

- [x] Créer un layout `AppLayout` (topbar créateur dédiée, `AppShell`) distinct de la Navbar marketing.
- [x] Mettre en place un design cohérent et moderne pour les pages app (dashboard, liste de liens, création de lien), avec focus sur une bonne expérience desktop **et mobile**.
- [ ] Vérifier qu’aucune donnée sensible (clés, chemins Storage, tokens) n’est jamais affichée dans l’UI ou les logs.

---

## 3. Phase 2 – Flux créateur (sans paiement)

Objectif : un créateur peut **préparer** ses liens (contenu + prix + slug) dans l’interface, mais le paiement réel n’est pas encore branché.

### 3.1. Dashboard créateur (`/app`)

- [x] Créer une page d’accueil de dashboard avec :
  - [x] Résumé simple : nombre de liens, nombre de ventes (mock au début), revenus estimés (mock ou partiel selon `purchases`).
  - [ ] Lien rapide vers “Create link”.
  - [x] Note : les metrics seront affinés dans la phase Analytics.
  - [x] Affichage du profil créateur (avatar rond) et édition de la bio qui apparaît sur la page publique `/c/:handle`.

### 3.2. Gestion des liens (`/app/links`)

- [x] Page de liste :
  - [x] Récupérer les liens du créateur via Supabase (en respectant les RLS).
  - [x] Afficher : titre, statut, prix, date de création, compteur de clics (`click_count`).
  - [x] Action “Edit” par ligne.
  - [x] Bouton “Create link” / “New link”.
  - [ ] Implémenter la mise à jour réelle des clics / vues et des ventes (mock ou réel) quand la page `/l/:slug` et les analytics seront en place (Phase 3).

### 3.3. Création / édition de lien (`/app/links/new`, `/app/links/:id/edit`)

- [x] Formulaire lien :
  - [x] Champs : `title`, `description`, `price_cents`, `currency`, `status` (`draft`/`published`), upload du fichier.
  - [x] Gestion de l’upload vers le bucket privé Supabase Storage (`paid-content`) → `storage_path` stocké en DB.
  - [x] Génération automatique d’un `slug` unique et non trivial (ex. mélange de mots + hash).
  - [ ] Possibilité de modifier le slug (à ajouter si nécessaire).

- [x] Sauvegarde :
  - [x] Création en base via Supabase JS en respectant les RLS.
  - [x] Validation minimale (prix > 0, titre requis, fichier requis pour `published`).

- [x] UX :
  - [x] Toasts de succès / erreur.
  - [x] Redirection vers la liste des liens après création.
  - [x] UI moderne et animée (framer-motion) avec zone d’upload stylée et **preview visuelle** du média (image ou vidéo) avant création.

### 3.4. Page publique `/l/:slug` (version sans paiement)

- [x] Lecture du lien par `slug` côté frontend (via une requête Supabase qui ne sélectionne jamais `storage_path`).
- [x] Affichage : titre, description, prix.
- [x] Bouton “Unlock for X €” qui pour l’instant :
  - [x] Affiche un message/toast “Paiement à venir – en cours d’implémentation”.
  - [x] Ne retourne **aucun** lien ou chemin vers le fichier protégé.


---

## 4. Phase 3 – Expérience créateur & analytics (hors paiements)

Objectif : enrichir l’expérience créateur autour de ses liens et de ses stats, **sans** implémenter encore la brique paiement réelle.

### 4.1. Vue “Détail du lien” (créateur)

- [x] Page `/app/links/:id` (détail) :
  - [x] Infos du lien (titre, description, slug, statut, prix, clics, ventes, revenu estimé).
  - [x] Actions rapides :
    - [x] Copier l’URL publique `/l/:slug`.
    - [x] Accéder à la page publique.
    - [x] Changer le statut (`draft` ↔ `published` ↔ `archived`).
  - [x] UI futuriste / reveal‑like dans le dashboard créateur, avec carte de stats et carte visuelle floutée.
  - [x] Bouton “Chat (coming soon)” désactivé pour préparer la future messagerie.

### 4.2. Vue “Analytics simple”

- [x] Tableau ou cartes :
  - [x] Total de liens `published`.
  - [x] Ventes totales (une fois les paiements branchés).
  - [x] Revenus cumulés (une fois les paiements branchés).
- [x] Préparer les requêtes Supabase (les composants seront réutilisés quand les paiements seront réels).

---

## 5. Phase Paiement – À implémenter en dernier (PSP à définir)

> Cette phase ne sera attaquée qu’une fois la **solution de paiement choisie** par le client (Stripe / autre).
> L’objectif est de câbler à la fois : (1) un **abonnement hard paywall** par créateur, et (2) des **paiements à l’acte**
> pour des contenus individuels, sans figer à l’avance la manière dont le PSP gère produits/plans.

### 5.1. Choix du fournisseur de paiement

- [ ] Choisir le PSP (Stripe ou autre), avec :
  - [ ] Support des paiements one‑shot (contenus individuels) **et/ou** de l’abonnement récurrent.
  - [ ] Support de webhooks signés.
  - [ ] Frais acceptables pour le business model Exclu.

### 5.2. Conception du flux de paiement (sécurité, provider‑agnostique)

- [ ] Définir précisément, de façon **générique**, les flux suivants :
  - [ ] Flux "paiement à l’acte" pour un contenu individuel :
    - [ ] Depuis `/l/:slug` ou la modale d’un contenu dans la page créateur, seules des infos non sensibles (slug, id du lien) sont envoyées au backend.
    - [ ] Le montant et la currency sont **toujours** lus en base par l’Edge Function, jamais pris du client comme source de vérité.
  - [ ] Flux "abonnement hard paywall" pour un créateur :
    - [ ] Depuis la page créateur (`/c/:handle`), déclencher un flux d’abonnement qui donnera accès à certains contenus du feed.
    - [ ] Les droits d’accès abonnés sont décidés côté backend (via une future table `subscriptions` ou équivalent),
          sans dépendre de la façon dont le PSP représente les plans.
  - [ ] Définir les URLs de `success` / `cancel` communes, quelles que soient les mécaniques internes du PSP.

- [ ] Adapter le schéma `purchases` et, si nécessaire, prévoir une table `subscriptions` (sans figer la structure exacte)
      pour pouvoir stocker les états de paiement / abonnement une fois le PSP choisi.
  - [ ] Lors de la création d’un achat, calculer et renseigner `access_expires_at` selon le réglage choisi par le créateur :
    - [ ] accès illimité → `access_expires_at = NULL`.
    - [ ] accès limité (24h, 7 jours, 30 jours, etc.) → `access_expires_at = now() + interval`.

### 5.3. Intégration backend via Supabase Edge Functions

- [ ] Edge Function `create-payment-session` :
  - [ ] Input : `link_slug` (et éventuellement `buyer_email`).
  - [ ] Valider : lien existe, `status = published`, créateur actif.
  - [ ] Lire `price_cents` et `currency` depuis la DB (pas depuis le client).
  - [ ] Créer la session de paiement chez le PSP.
  - [ ] Retourner uniquement : l’URL de paiement (ou l’ID de session) au frontend.

- [ ] Edge Function `payment-webhook` :
  - [ ] Vérifier la **signature** du webhook PSP à l’aide du secret (env var).
  - [ ] Vérifier la cohérence : montant, currency, id du produit/lien.
  - [ ] Sur paiement réussi :
    - [ ] Créer / mettre à jour une ligne dans `purchases` avec `status = succeeded` et un `access_token` aléatoire.
    - [ ] Ne jamais renvoyer de signed URL dans la réponse du webhook.

### 5.4. Flux fan complet (paywall + accès contenu)

- [ ] Mettre à jour la page `/l/:slug` :
  - [ ] Le bouton “Unlock” appelle l’Edge Function `create-payment-session`.
  - [ ] Le frontend redirige vers la page de paiement PSP.

- [ ] Page de retour après paiement (success) :
  - [ ] Récupérer le contexte (par ex. `session_id` dans l’URL) et appeler une Edge Function sécurisée si nécessaire.
  - [ ] Rediriger ensuite vers une URL d’accès du type `/l/:slug/access/:token`.

- [ ] Edge Function `get-content-access` :
  - [ ] Input : `slug`, `access_token`.
  - [ ] Vérifier que :
    - [ ] Un `purchase` existe avec cet `access_token`, `status = succeeded` et le bon `link_id`.
    - [ ] Le droit d’accès est encore valide : `access_expires_at IS NULL` **ou** `now() < access_expires_at`.
  - [ ] Générer à chaque appel une **nouvelle URL signée** Supabase Storage (TTL court, ex. 5–15 minutes).
  - [ ] Retourner uniquement cette URL signée au frontend, ce qui permet au lien Exclu (`/l/:slug/access/:token`) de continuer à fonctionner au‑delà de 10–15 minutes tant que le droit d’accès est valide.

- [ ] Page `/l/:slug/access/:token` :
  - [ ] Appelle `get-content-access`.
  - [ ] Affiche le contenu (player vidéo/image ou bouton de téléchargement) en utilisant l’URL signée.
  - [ ] Ne stocke jamais l’URL signée en clair dans une base ou dans localStorage.
 
### 5.5. Page publique créateur / feed de contenus (inspirée de my.club)

Objectif : offrir au fan une page de **profil créateur** riche (type my.club) avec un feed de contenus verrouillés, tout en respectant strictement les contraintes de sécurité (aucun accès direct au fichier payant avant paiement + token valide).

- [x] Définir la route publique créateur (`/c/:handle`) distincte de `/l/:slug`.
- [x] Layout global (desktop, responsive mobile) :
  - [x] **Hero – Profil créateur** :
    - [x] Avatar/portrait du créateur avec halo/anneau gradient et effet de blur animé.
    - [x] Nom du créateur, handle (ex. `@creatorHandle`).
    - [x] CTA principal type bandeau gradient qui ouvre un lien externe (OnlyFans/Fansly ou autre) configuré dans le profil.
    - [x] Barre de stats (Posts, Gallery, More) avec compteurs, alignée sur l’exemple my.club.
  - [x] **Section droite – Feed de contenus** :
    - [x] Fond flouté / assombri avec gradients animés type "reveal".
    - [x] Grille de cartes de contenu (links `published`) avec preview floutée, titre et prix.
    - [x] Bouton "Unlock" par carte qui, pour l’instant, affiche seulement un toast “Paiement à venir – en cours d’implémentation”.

- [x] Interaction fan V1 :
  - [x] Pas d’abonnement direct sur la page, uniquement des liens unitaires floutés.
  - [x] Bouton vers plateforme externe (OnlyFans/Fansly) si `external_url` est renseigné.
  - [x] Bouton "Chat (coming soon)" désactivé.

- [ ] Itérer plus tard sur :
  - [ ] Modale centrale riche au clic sur une carte (une fois les paiements branchés).
  - [ ] Teasers d’images/vidéos générés comme variantes basse def/floutées distinctes du fichier payant.
  - [ ] Intégration complète avec les Edge Functions de paiement et d’accès sécurisé.

---

## 6. Phase 4 – Qualité, sécurité & déploiement

### 6.1. Sécurité & RLS avancées

- [ ] Auditer toutes les **policies RLS** pour `profiles`, `links`, `purchases`, `link_access_logs`.
- [ ] Vérifier qu’aucune requête frontend n’essaie de contourner RLS (utiliser uniquement le client Supabase avec anon key).
- [ ] Limiter la durée de validité des URLs signées Storage.
- [ ] Ajouter un minimum de **rate limiting** / protection sur les Edge Functions :
  - [ ] Option : stocker des compteurs d’appels par IP / par token pour détecter les abus.

### 6.2. Tests & monitoring

- [ ] Ajouter des tests unitaires sur les helpers critiques (génération de slug, validation des inputs, etc.).
- [ ] Ajouter des tests e2e de base sur les flux clés :
  - [ ] Auth créateur.
  - [ ] Création de lien.
  - [ ] Accès fan après paiement (une fois la phase Paiement branchée).
- [ ] Mettre en place un minimum de logs / monitoring :
  - [ ] Logs sur les Edge Functions (erreurs, tentatives d’accès invalide, etc.).

### 6.3. Déploiement & environnements

- [ ] Vérifier la configuration Vercel (branch, variables d’environnement).
- [ ] Vérifier la configuration Supabase (clés, RLS, policies).
- [ ] S’assurer que la prod utilise bien :
  - [ ] `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` de prod.
  - [ ] Les clés et secrets PSP de prod (dans Vercel, jamais en dur dans le code).

---

## 7. Suivi de l’avancement

Ce fichier doit être mis à jour à chaque itération :

- Quand une tâche est terminée → passer de `[ ]` à `[x]`.
- Ajouter des sous‑tâches si besoin, mais **sans casser la structure globale** (phases 0 → 4 + phase Paiement).
