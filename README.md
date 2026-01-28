# Exclu

Exclu permet aux créateurs de vendre leurs contenus digitaux (photos, vidéos, fichiers, accès exclusifs…) via des liens payants débloquables en un clic, sans création de compte côté fan.

**Modèle de commission :**
- **Premium** ($39/mois) : 0% de commission
- **Free** : 10% de commission par vente

Ce dépôt contient l'application complète Exclu :
- **Landing page marketing** 
- **Dashboard créateur** (gestion des liens, analytics, earnings)
- **Pages publiques** (profil créateur, liens payants avec paywall)
- **Intégration Stripe Connect** pour les paiements

---

## Tech stack

- **Build & bundler**
  - Vite 5 (mode SPA, point d’entrée `index.html` → `src/main.tsx`)
- **Langage & framework UI**
  - React 18
  - TypeScript
  - React Router DOM (routing côté client)
- **UI & design system**
  - Tailwind CSS 3 (`tailwind.config.ts`, `src/index.css`)
  - shadcn/ui + Radix UI (boutons, tooltips, toasts, etc. dans `src/components/ui`)
  - framer-motion (animations d’apparition, carrousel créateurs, scroll effects)
- **State / data**
  - TanStack React Query (configuré dans `App.tsx` pour les futurs appels API)
- **Qualité & tests**
  - TypeScript strict
  - ESLint 9
  - Vitest + @testing-library/react + jsdom (`src/test`)

---

## Project structure

Vue d’ensemble des dossiers importants :

```txt
.
├─ index.html              # Point d'entrée HTML, meta SEO, injection de root React
├─ vite.config.ts          # Config Vite (React SWC, alias @, port 8080)
├─ tailwind.config.ts      # Config Tailwind + couleurs de marque Exclu
├─ tsconfig*.json          # Config TypeScript (app / node / base)
└─ src/
   ├─ main.tsx             # Bootstrap ReactDOM, montage de <App />
   ├─ App.tsx              # Providers globaux + routing
   ├─ pages/
   │  ├─ Index.tsx         # Landing page principale Exclu
   │  └─ NotFound.tsx      # Page 404 catch-all
   ├─ components/
   │  ├─ Navbar.tsx
   │  ├─ HeroSection.tsx
   │  ├─ TeaserVideoGrid.tsx
   │  ├─ CreatorsCarousel.tsx
   │  ├─ WhyExcluSection.tsx
   │  ├─ HowItWorksSection.tsx
   │  ├─ VideoShowcase.tsx
   │  ├─ LinkInBioSection.tsx
   │  ├─ ChatSection.tsx
   │  ├─ PricingSection.tsx
   │  ├─ SocialProofSection.tsx
   │  ├─ FAQSection.tsx
   │  ├─ FinalCTASection.tsx
   │  ├─ Footer.tsx
   │  ├─ CursorGlow.tsx     # Effet glow sous le curseur
   │  └─ ui/                # Composants shadcn/ui + primitives Radix
   ├─ hooks/
   │  ├─ use-mobile.tsx     # Hooks utilitaires (détection mobile, etc.)
   │  └─ use-toast.ts       # Gestion des toasts shadcn
   ├─ lib/
   │  └─ utils.ts           # Helpers génériques
   ├─ test/
   │  ├─ example.test.ts    # Exemple de test Vitest + RTL
   │  └─ setup.ts           # Setup de l’environnement de test
   └─ index.css             # Styles globaux + thèmes + utilitaires Tailwind custom
```

---

## Application architecture

### Entrée & routing

- `index.html`
  - définit les meta SEO / OpenGraph / Twitter
  - injecte le bundle dans `<div id="root"></div>` via `<script type="module" src="/src/main.tsx">`.

- `src/main.tsx`
  - crée la racine React avec `createRoot(document.getElementById("root"))`
  - rend le composant `App`.

- `src/App.tsx`
  - instancie un `QueryClient` React Query
  - englobe l’application avec :
    - `QueryClientProvider`
    - `TooltipProvider`
    - `Toaster` (shadcn/ui)
    - `Sonner` (lib de toasts)
    - `BrowserRouter` (React Router DOM)
  - définit les routes :
    - `/` → `Index` (landing principale)
    - `*` → `NotFound` (404 avec lien retour home)

### Landing page Exclu (`src/pages/Index.tsx`)

La landing assemble les différentes sections marketing dans l’ordre :

- **Layout global**
  - fond sombre `bg-background` + texte `text-foreground`
  - texture de bruit légère + `grid-pattern` (grille) définies dans `index.css`
  - composant `CursorGlow` pour l’effet lumineux qui suit le curseur.

- **Navbar (`Navbar.tsx`)**
  - logo Exclu
  - navigation interne par ancres vers les sections (`#features`, `#how-it-works`, `#pricing`)
  - CTA « Get started » / « Log in » scrollant vers la section pricing.

- **Hero (`HeroSection.tsx`)**
  - headline : *Your content. Your revenue. No middleman.*
  - sous-titre : explication du modèle (liens payants, 0 % commission, no-account pour les fans)
  - CTA principaux :
    - "Start selling in minutes" (vers pricing)
    - "See how it works" (vers la vidéo de démo)
  - mockup vidéo vertical (`/videos/exclu-teaser.mp4`) + cartes flottantes (chat, paiement) animées avec framer-motion.

- **Sections de contenu** (toutes animées avec `framer-motion` + hooks `useInView` / `useScroll`) :
  - `TeaserVideoGrid` : grille de teasers (aperçus de contenu)
  - `CreatorsCarousel` : carrousel horizontal infini de créateurs fictifs avec stats (followers, etc.)
  - `WhyExcluSection` (`id="features"`) : cartes de features (0 % commission, 1‑click unlock, no account, etc.)
  - `HowItWorksSection` (`id="how-it-works"`) : steps 01 → 05 (upload, set price, share, unlock, get paid)
  - `VideoShowcase` (`id="video-showcase"`) : vidéo de démo `/videos/exclu-demo.mp4` en player plein écran (controls)
  - `LinkInBioSection` : focus sur l’usage en "link in bio" multi-plateforme
  - `ChatSection` : mockup de chat créateur ↔ fan + stats (engagement, revenu/fan…)
  - `PricingSection` (`id="pricing"`) : carte de pricing "Premium" unique, 0 % commission, features listées
  - `SocialProofSection` : stats globales (nb créateurs, payout total, pays, temps d’unlock)
  - `FAQSection` : FAQ interactive avec accordéons (animations framer-motion)
  - `FinalCTASection` : dernier gros CTA orienté conversion vers pricing.

- **Footer (`Footer.tsx`)**
  - rappel du slogan *Your content. Your revenue. No middleman.*
  - liens de navigation (Product, Company, Legal, Support)
  - icônes sociales (Twitter, Instagram, Discord).

### Styles & thème

- **`tailwind.config.ts`**
  - active `darkMode: ["class"]` mais le design est centré sur un thème sombre permanent.
  - déclare les couleurs de marque Exclu via des variables CSS (`--exclu-black`, `--exclu-cloud`, etc.).
  - ajoute des keyframes / animations utilitaires (`fade-in`, `slide-in-*`, `blur-in`, etc.).

- **`src/index.css`**
  - définit les variables CSS de thème (`--background`, `--primary`, `--exclu-*`, `--gradient-*`, `--glow-*`).
  - ajoute des utilitaires custom (via `@layer utilities`) :
    - `gradient-text`, `glass`, `glass-card`, `shadow-glow`, `grid-pattern`, `radial-gradient`, `cursor-glow`, etc.
  - gère la scrollbar custom, les keyframes `float`, `pulse-glow`, `shimmer`, `gradient-shift`.

---

## Scripts npm

Scripts définis dans `package.json` :

- **`npm run dev`**
  - démarre le serveur Vite de développement.
  - par défaut, l’app tourne sur le port **8080** (voir `vite.config.ts`).

- **`npm run build`**
  - build de production (`dist/`) optimisé.

- **`npm run build:dev`**
  - build en mode développement (utile pour prévisualiser un build non minifié).

- **`npm run preview`**
  - lance un serveur de prévisualisation sur le build `dist/`.

- **`npm run lint`**
  - exécute ESLint sur le projet.

- **`npm run test`**
  - exécute la suite de tests Vitest en mode run unique.

- **`npm run test:watch`**
  - exécute Vitest en mode watch.

---

## Getting started (local dev)

Prérequis :

- Node.js & npm (recommandé : installation via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating))

Installation & lancement :

```sh
# 1. Cloner le dépôt
git clone <GIT_URL_DU_PROJET>

# 2. Aller dans le dossier
cd Exclu

# 3. Installer les dépendances
npm install

# 4. Lancer le serveur de dev (Vite)
npm run dev

# L’app sera accessible sur http://localhost:8080 (sauf conflit de port)
```

---

## Build & déploiement

1. **Build de production**

```sh
npm run build
```

Cela génère les fichiers statiques optimisés dans le dossier `dist/`.

2. **Prévisualisation locale du build**

```sh
npm run preview
```

3. **Déploiement**

Le build généré est une SPA statique classique et peut être déployé sur n’importe quel hébergeur de fichiers statiques :

-- Netlify, Vercel, Cloudflare Pages, GitHub Pages, OVH, etc.
-- Il suffit de pointer le service sur le dossier `dist/` en configurant le fallback HTML sur `index.html` (pour le routing client).

---

## Supabase & base de données (auth + créateurs)

L’app Exclu est connectée à un projet Supabase pour gérer :

- l’**authentification email / mot de passe** (créateurs uniquement),
- les **profils créateurs** (`profiles`),
- les futurs **liens payants** (`links`).

### Configuration Supabase côté front

Variables d’environnement (fichier `.env.local`, non commité) :

```sh
VITE_SUPABASE_URL=https://<PROJECT>.supabase.co
VITE_SUPABASE_ANON_KEY=<ANON_PUBLIC_KEY>
```

> ⚠️ La clé **service-role** ne doit **jamais** être utilisée côté front. Elle reste uniquement côté Supabase / backend sécurisé.

Client Supabase : `src/lib/supabaseClient.ts`

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
```

Page d’authentification : `src/pages/Auth.tsx`

- gère **login / signup** via `supabase.auth.signInWithPassword` et `supabase.auth.signUp`,
- gère la **récupération de compte** via `supabase.auth.resetPasswordForEmail`,
- UI : carte centrée avec toggle *Log in / Sign up*, gradient animé en arrière‑plan.

### Schéma BDD côté Supabase

Les tables vivent dans le schéma `public` et utilisent l’auth native Supabase (`auth.users`).

#### Extension UUID

```sql
create extension if not exists "pgcrypto";
```

Permet d’utiliser `gen_random_uuid()` pour les IDs.

#### Table `profiles`

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  handle text unique,
  external_url text,
  is_creator boolean default false,
  theme_color text,
  social_links jsonb,
  is_creator_subscribed boolean default false,
  show_join_banner boolean,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- The owner (authenticated user) can read their own profile
drop policy if exists "Profiles are viewable by owner" on public.profiles;

create policy "Profiles are viewable by owner"
on public.profiles
for select
to public
using (auth.uid() = id);

-- The owner can insert their own profile row
drop policy if exists "Profiles are insertable by owner" on public.profiles;

create policy "Profiles are insertable by owner"
on public.profiles
for insert
to public
with check (auth.uid() = id);

-- The owner can update their own profile row
drop policy if exists "Profiles are updatable by owner" on public.profiles;

create policy "Profiles are updatable by owner"
on public.profiles
for update
to public
using (auth.uid() = id)
with check (auth.uid() = id);

-- Public read access is limited to creator profiles with a handle
drop policy if exists "Public creator profiles" on public.profiles;

create policy "Public creator profiles"
on public.profiles
for select
to public
using (
  is_creator = true
  and handle is not null
);
```

- Chaque créateur a un profil lié à son `auth.users.id`.
- Un utilisateur authentifié ne peut voir / créer / modifier **que son propre profil** grâce aux policies RLS.
- Les visiteurs anonymes (fans) ne peuvent lire que les profils de créateurs (`is_creator = true`) avec un `handle` défini, pour l’affichage public, et n’ont pas accès aux autres comptes.

#### Table `links`

```sql
create table public.links (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'EUR',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.links enable row level security;

create policy "Creators can view own links"
on public.links
for select
using (auth.uid() = creator_id);

create policy "Creators can manage own links"
on public.links
for all
using (auth.uid() = creator_id)
with check (auth.uid() = creator_id);
```

- `creator_id` référence l’ID de l’utilisateur dans `auth.users`.
- Les créateurs ne peuvent voir et gérer que **leurs propres liens**.
- Aucune policy publique n’est définie pour l’instant (à ouvrir plus tard pour l’expérience fan si besoin).

---

## Fonctionnalités implémentées

### Créateur
- ✅ Inscription / connexion avec email
- ✅ Onboarding avec choix de plan (Free 10% / Premium $39)
- ✅ Dashboard avec métriques et analytics
- ✅ Gestion des liens payants (création, édition, suppression)
- ✅ Bibliothèque de contenus (upload images/vidéos)
- ✅ Page profil publique (`/c/:handle`)
- ✅ Connexion Stripe Connect pour recevoir les paiements
- ✅ Vue Earnings avec historique des payouts

### Fan
- ✅ Accès aux liens payants sans création de compte
- ✅ Paiement Stripe sécurisé
- ✅ Déblocage instantané du contenu après paiement
- ✅ Téléchargement des contenus achetés

### Backend (Supabase Edge Functions)
- ✅ `create-link-checkout-session` : création de session Stripe pour achat de lien
- ✅ `stripe-webhook` : gestion des événements Stripe (achats, abonnements, Connect)
- ✅ `create-creator-subscription` : abonnement créateur Premium
- ✅ `stripe-connect-onboard` : onboarding Stripe Connect

### Flux Stripe & sécurité

#### Abonnement créateur Premium

- **Création de la session** :
  - Initié côté frontend depuis la page Profil (section abonnement) via l’Edge Function `create-creator-subscription`.
  - La function :
    - valide le JWT utilisateur en interne avec un client admin Supabase,
    - charge le profil (`profiles.id, stripe_customer_id, is_creator_subscribed`),
    - crée un `customer` Stripe si nécessaire et enregistre `stripe_customer_id` sur le profil,
    - crée une session Checkout Stripe en mode `subscription` avec :
      - `price: STRIPE_CREATOR_PRICE_ID` (prix mensuel Premium),
      - `metadata.supabase_user_id = user.id`,
      - `subscription_data.metadata.supabase_user_id = user.id`.

- **Activation de l’abonnement (webhook)** :
  - L’Edge Function `stripe-webhook` écoute notamment :
    - `checkout.session.completed` (mode `subscription`),
    - `customer.subscription.updated`,
    - `customer.subscription.deleted`.
  - À la fin du checkout (event `checkout.session.completed` mode `subscription` avec `metadata.supabase_user_id`), le webhook met `profiles.is_creator_subscribed = true` pour l’ID concerné.
  - Lors des mises à jour d’abonnement (event `customer.subscription.updated`), le webhook recalcule `is_creator_subscribed` en fonction du statut Stripe :
    - `true` si `status` ∈ {`active`, `trialing`},
    - `false` sinon.
  - Lors d’une résiliation (event `customer.subscription.deleted`), le webhook force `is_creator_subscribed = false`.

#### Achats de contenu (checkouts one‑shot)

- **Création de la session** :
  - Initiée côté frontend depuis la page publique d’un lien (`/l/:slug`) via l’Edge Function `create-link-checkout-session`.
  - La function :
    - charge le lien (`links`) par `slug` et vérifie qu’il est `published` avec un prix valide,
    - charge le profil créateur (`profiles`) pour récupérer `stripe_account_id`, `is_creator_subscribed`, `stripe_connect_status`,
    - bloque le checkout si le compte Connect n’est pas encore complètement onboardé,
    - calcule les montants :
      - prix créateur (base),
      - +5 % de frais fan,
      - commission plateforme de 10 % sur le prix créateur pour les comptes **Free**, 0 % pour les comptes **Premium**,
    - crée une session Checkout Stripe en mode `payment` avec :
      - `metadata.link_id`,
      - `metadata.creator_id`,
      - `metadata.slug`,
      - `payment_intent_data.application_fee_amount` (commission + frais fan),
      - `payment_intent_data.transfer_data.destination = stripe_account_id` du créateur.

- **Enregistrement de l’achat (webhook)** :
  - L’Edge Function `stripe-webhook` traite `checkout.session.completed` en mode `payment` uniquement si `session.metadata.link_id` est présent.
  - Pour ces sessions (créées par `create-link-checkout-session`), le webhook :
    - vérifie d’abord si un achat existe déjà pour `stripe_session_id` (idempotence),
    - sinon, insère une ligne dans la table `purchases` avec :
      - `link_id`,
      - `creator_id`,
      - `amount_cents = session.amount_total` (montant réellement payé par le fan),
      - `currency`,
      - `stripe_session_id`,
      - `status = 'completed'`,
      - `fan_email` / `buyer_email` issus de `customer_details.email`.
  - Les checkouts historiques créés directement depuis le Dashboard Stripe (payment links sans metadata) ne sont pas enregistrés dans `purchases` car le webhook n’a pas d’`link_id` pour savoir quel contenu débloquer.

#### Validation Stripe Connect (créateurs)

- L’Edge Function `stripe-connect-onboard` crée ou met à jour le compte Connect Express du créateur.
- La liste des pays supportés est définie explicitement côté backend (`SUPPORTED_STRIPE_CONNECT_COUNTRIES`) et synchronisée avec l’UI d’onboarding.
- L’Edge Function `stripe-webhook` écoute également `account.updated` pour mettre à jour `profiles.stripe_connect_status` en fonction des capacités Stripe :
  - `complete` si `charges_enabled` + `payouts_enabled` sont vrais,
  - `restricted` si un `disabled_reason` est présent,
  - `pending` sinon.

#### Sécurité des intégrations Stripe

- **Signature des webhooks** :
  - `stripe-webhook` récupère l’en-tête `stripe-signature` et reconstruit l’événement avec
    `stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET)`.
  - Si la signature ne correspond pas au secret `whsec_...` configuré dans les variables d’environnement Supabase, la requête est rejetée avec `400 Webhook signature verification failed`.
  - Cela garantit que seuls les appels provenant réellement de Stripe peuvent créer des `purchases` ou modifier `is_creator_subscribed` / `stripe_connect_status`.

- **Séparation des secrets et du frontend** :
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SERVICE_ROLE_KEY`, `STRIPE_CREATOR_PRICE_ID`, `PUBLIC_SITE_URL` sont stockés dans les variables d’environnement du projet Supabase / Vite et **ne sont jamais exposés au code frontend compilé**.

- **Service Role & RLS** :
  - Les Edge Functions utilisent un client Supabase créé avec `SERVICE_ROLE_KEY` côté serveur.
  - Cela contourne les policies RLS **uniquement dans les fonctions backend**, jamais côté client.
  - Le webhook ne croit que les données provenant de Stripe + des metadata générées par nos propres fonctions (`create-creator-subscription`, `create-link-checkout-session`), jamais des données soumises par le navigateur.

- **verify_jwt et accès aux fonctions** :
  - Certaines functions (`create-creator-subscription`, `create-link-checkout-session`, `stripe-connect-onboard`) sont appelées depuis le frontend et valident elles-mêmes le JWT utilisateur si nécessaire.
  - La function `stripe-webhook` est appelée uniquement par Stripe : 
    - `verify_jwt = false` dans `supabase/config.toml` pour cette function afin que le gateway Supabase ne bloque pas les requêtes Stripe,
    - l’authentification est assurée par la **signature webhook** et non par un JWT.

- **Idempotence et résilience** :
  - Le webhook vérifie l’existence d’un achat par `stripe_session_id` avant d’insérer dans `purchases` pour éviter les doublons en cas de ré-envoi Stripe.
  - Les updates d’abonnement sont idempotents : chaque event `customer.subscription.updated` recalcule `is_creator_subscribed` à partir du statut Stripe.

## Prochaines évolutions possibles

- Internationalisation (FR / EN)
- Teasers images/vidéos floutés auto-générés
- Analytics avancés
- Messagerie créateur ↔ fan

