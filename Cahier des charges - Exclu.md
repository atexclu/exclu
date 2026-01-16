# Welcome to your Lovable project

# Exclu

Exclu permet aux créateurs de vendre leurs contenus digitaux (photos, vidéos, fichiers, accès exclusifs…) via des liens payants débloquables en un clic, sans création de compte côté fan, avec 0 % de commission pour les créateurs premium.

Ce dépôt contient la **landing page marketing Exclu**, construite comme une SPA moderne en React + Vite, animée avec framer-motion et stylée avec Tailwind + shadcn/ui.

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

- Netlify, Vercel, Cloudflare Pages, GitHub Pages, OVH, etc.
- Il suffit de pointer le service sur le dossier `dist/` en configurant le fallback HTML sur `index.html` (pour le routing client).

---

## Prochaines évolutions possibles

- Connexion à un backend Exclu réel (API pour créateurs, liens payants, paiements, analytics).
- Internationalisation (FR / EN) de la landing.
- Pages supplémentaires (dashboard, onboarding créateur, documentation publique, etc.).

