# Exclu — Contexte projet pour Claude

## Qu'est-ce qu'Exclu ?
Plateforme SaaS de monétisation de contenu pour créateurs (photos, vidéos, fichiers, accès exclusifs, tips, custom requests, wishlist/gifts, link-in-bio).
Modèle : Free (10% commission) / Premium ($39/mois, 0% commission).
Les fans peuvent débloquer du contenu en un clic sans créer de compte, et discuter via le guest chat sans inscription.

## Rôles & types de compte
- **Creator** — crée des liens, vend du contenu, reçoit tips et requests, gère son link-in-bio.
- **Fan** — suit ses créateurs favoris, achète, envoie tips/gifts, messages.
- **Agency** — gère plusieurs profils créateurs (multi-profil via `ProfileContext`).
- **Chatter** — employé d'agence avec accès limité aux conversations de certains profils.
- **Admin** — modération, gestion utilisateurs/paiements/blog/directory.

Un même utilisateur peut avoir plusieurs profils (multi-profil piloté par `src/contexts/ProfileContext.tsx`).

## Stack technique
- **Frontend** : React 18 + TypeScript, Vite 7, React Router v6 (SPA)
- **UI** : Tailwind CSS 3 + shadcn/ui + Radix UI, Framer Motion, GSAP, OGL (Aurora background)
- **Éditeur** : TipTap 3 (blog editor)
- **Data** : TanStack React Query v5, React Hook Form + Zod
- **Backend** : Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Serverless SSR** : Vercel Functions dans `api/` (TypeScript, `@vercel/node`) pour le SEO (og-proxy, blog-ssr, directory-ssr, sitemap, rss)
- **Paiements** : UG Payments QuickPay (checkout hébergé) + wallet interne + payouts IBAN multi-pays (retraits sur demande au-delà du seuil)
- **Hosting** : Vercel (Vite SPA + serverless `api/`)
- **Tests** : Vitest + Testing Library

## Lancer le projet
```bash
npm run dev        # Vite dev server sur :8080
npm run build      # Build production
npm run test       # Vitest (watch: npm run test:watch)
supabase start     # Backend local (si besoin)
```

## Structure du repo
```
api/                           # Vercel serverless functions (SSR + proxies SEO)
  og-proxy.ts                  # Injection OG pour /:handle et /l/:slug
  blog-ssr.ts, directory-ssr.ts
  sitemap.ts, rss.ts

src/
  pages/                       # ~58 pages (routes dans App.tsx)
  components/
    ui/                        # shadcn/ui
    linkinbio/                 # éditeur link-in-bio par sections
    chat/                      # UI du chat (ChatWindow, ConversationListItem…)
    dashboard/                 # sections du dashboard créateur
  hooks/                       # hooks custom (useConversations, etc.)
  lib/                         # supabaseClient, utils
  contexts/                    # ThemeContext, ProfileContext (multi-profil)
  types/                       # types partagés (chat, etc.)

supabase/
  functions/                   # ~46 Edge Functions (Deno/TypeScript)
  migrations/                  # SQL migrations numérotées (1xx_nom.sql, dernière : 129)
  config.toml                  # verify_jwt par fonction (toutes à false)

docs/                          # Architecture, sécurité, plans
```

## Routes principales (src/App.tsx)
- `/` — landing
- `/auth`, `/auth/chatter`, `/auth/callback` — authentification
- `/fan/signup` — inscription fan (avec `?creator=handle` pour auto-favorite)
- `/fan` — dashboard fan (protected)
- `/app/*` — dashboard créateur (protected, AppShell layout)
  - `/app/profile` — éditeur link-in-bio (route par défaut)
  - `/app/dashboard`, `/app/links`, `/app/content`, `/app/settings`
  - `/app/chat`, `/app/wishlist`, `/app/earnings`, `/app/referral`
  - `/app/agency` — dashboard agence
  - `/app/chatter`, `/app/chatter/contracts`, `/app/chatter/select`
  - `/app/profiles/new` — créer un nouveau profil (multi-profil)
- `/admin/users`, `/admin/users/:id/overview`, `/admin/payments`, `/admin/blog/*` — admin
- `/directory`, `/directory/creators|agencies|tools`, `/directory/agencies/:slug`
- `/blog`, `/blog/:slug`, `/blog/category/:slug`
- `/l/:slug` — lien payant public
- `/:handle` — profil public créateur (**doit rester juste avant le catch-all `*`**)
- `/tip-success`, `/gift-success`, `/request-success` — pages de succès paiement
- `/help-center/*`, `/contact`, `/privacy`, `/terms`, `/cookies`, `/dmca`

## Conventions de code
- Noms explicites, fonctions courtes (Single Responsibility)
- Logique métier dans `/lib`, hooks custom, ou services dédiés — jamais dans les composants UI
- Pas de code dupliqué, pas de hacks temporaires non documentés
- TypeScript strict côté Edge Functions ; front plus souple (`noImplicitAny` désactivé)
- Composants shadcn/ui existants : toujours réutiliser avant d'en créer de nouveaux
- Animations : Framer Motion pour les pages/layouts, CSS pour les micro-interactions
- Couleurs dérivées d'un seul `aurora_gradient` côté créateur — pas de `theme_color` séparé

## Base de données (Supabase)
- **Project ref** : `qexnwezetjlbwltyccks` (West EU - Ireland)
- **URL** : `https://qexnwezetjlbwltyccks.supabase.co`
- **RLS activé sur toutes les tables** — toujours vérifier les policies avant d'écrire des requêtes
- **Nouvelles migrations** : numéroter en continuité (dernière appliquée : `167_rebill_attempts.sql`)

### Tables principales (non exhaustif)
- **Profils / accès** : `profiles`, `fan_favorites`, `agencies`, `agency_claim_requests`, `chatter_invitations`
- **Contenu** : `links`, `assets`, `content_library`, `wishlist_items`
- **Paiements** : `sales`, `purchases`, `tips`, `gift_purchases`, `custom_requests`, `creator_subscriptions`, `wallets`, `payouts`, `bank_details`
- **Chat** : `conversations`, `messages` (guest chat inclus)
- **Contenu éditorial** : `blog_articles`, `blog_categories`, `directory_tools`
- **Analytics** : `link_clicks`, `profile_views`

## Edge Functions (supabase/functions)
- **Runtime** : Deno (TypeScript strict)
- **Auth** : toutes les fonctions ont `verify_jwt = false` dans `config.toml` — l'auth est vérifiée **manuellement** dans chaque fonction (via `supabase.auth.getUser(jwt)` ou la service role selon le cas)
- **Webhooks UG Payments** : `ugp-listener`, `ugp-confirm`, `ugp-membership-confirm`, `verify-payment` — signature et état vérifiés côté fonction
- **Secrets** : injectés via Supabase Secrets (`supabase secrets set …`), jamais dans le code
- **Déploiement** : manuel via `supabase functions deploy <nom>` (pas de CI/CD)

### UG Payments — Per-MID credentials

Routing 2D/3D par pays de facturation : `US`/`CA` → MID **US_2D** (MID 103817), tout le reste → MID **INTL_3D** (MID historique, SiteID 98845). Chaque MID a son propre jeu de credentials complet — aucun champ n'est partagé entre les deux.

Secrets requis côté Supabase (`supabase secrets set --linked <NAME>=<value>`) :

- **INTL_3D** : `QUICKPAY_TOKEN_INTL_3D`, `QUICKPAY_SITE_ID_INTL_3D`, `UGP_MID_INTL_3D`, `UGP_API_BEARER_TOKEN_INTL_3D`, `QUICKPAY_CONFIRM_KEY_INTL_3D`
- **US_2D** : `QUICKPAY_TOKEN_US_2D`, `QUICKPAY_SITE_ID_US_2D`, `UGP_MID_US_2D`, `UGP_API_BEARER_TOKEN_US_2D`, `QUICKPAY_CONFIRM_KEY_US_2D`

Pendant le rollout, les alias legacy `QUICKPAY_TOKEN`, `QUICKPAY_SITE_ID`, `UGP_MERCHANT_ID`, `UGP_API_BEARER_TOKEN`, `QUICKPAY_CONFIRM_KEY` restent lus par `_shared/ugRouting.ts#getMidConfirmKey` en fallback — tous pointent sur le MID INTL_3D. À retirer en Phase 7 (cleanup) une fois les deux MIDs en prod.

`ConfirmURL`, `ListenerURL` et `MembershipPostbackURL` sont configurés côté UG (portail Derek) — pas de wiring applicatif. Chaque callback entrant arrive avec son `SiteID` + `Key` ; `_shared/ugRouting.ts#midFromSiteId` résout le MID, et la `Key` est validée strictement par MID dans `ugp-confirm`, `ugp-membership-confirm`, et `ugp-listener` (pas de callback accepté sans `Key` valide — cf. migration 0.6b du refonte 2026-04-20).

### Fonctions clés
- **Checkouts UG Payments** : `create-link-checkout`, `create-tip-checkout`, `create-request-checkout`, `create-gift-checkout`, `create-creator-subscription`
- **Post-paiement** : `verify-payment`, `ugp-listener`, `ugp-confirm`, `send-link-content-email`
- **Wallet / payouts** : `request-withdrawal`, `process-payout`, `save-bank-details`
- **Custom requests** : `manage-request` (capture/cancel de l'autorisation upfront), `check-fan-email`
- **Chat guest** : `guest-chat-init`, `guest-chat-send`, `guest-chat-messages`, `guest-chat-claim`
- **Admin** : `admin-get-users`, `admin-get-user-overview`, `admin-delete-user`, `admin-impersonate-user`, `admin-manage-agencies`, `admin-manage-tools`, `admin-blog-manage`, `admin-update-user-visibility`, `admin-export-users-csv`
- **Agence / chatter** : `send-chatter-invitation`, `handle-chatter-request`, `remove-chatter-access`, `admin-approve-agency-contact`, `send-agency-contact`, `submit-agency-claim`
- **Referral** : `link-referral`, `send-referral-invite`, `request-affiliate-payout`
- **Tracking** : `increment-link-click`, `increment-profile-view`
- **Media** : `generate-signed-urls`
- **Auth** : `send-auth-email`

## Flux de paiement (UG Payments QuickPay)
### Achat d'un lien (fan → créateur)
Fan → `create-link-checkout` (génère un formulaire QuickPay) → page hébergée QuickPay → webhook `ugp-listener` → crédit du wallet créateur + `sales` row → `send-link-content-email` → redirection `/tip-success` ou page de déblocage.

### Custom request (capture manuelle)
Fan → `create-request-checkout` (autorisation, **pas** de capture immédiate) → le créateur accepte ou refuse → `manage-request` capture (accept) ou annule (decline) l'autorisation.

### Wallet & payouts
- Tous les paiements créditent un **wallet interne** au créateur (pas de payout direct comme Stripe Connect).
- Le créateur renseigne ses coordonnées bancaires via `save-bank-details` (IBAN multi-pays, migration 128/129).
- `request-withdrawal` → validation admin → `process-payout` effectue le virement. Seuil minimum de retrait configuré côté application.

## Serverless SSR (Vercel `api/`)
- **`og-proxy.ts`** — intercepte `/:handle` et `/l/:slug` côté serveur pour injecter les balises OG (SEO + previews réseaux sociaux) avant de renvoyer `index.html`. Wiré via rewrites dans `vercel.json`.
- **`blog-ssr.ts`, `directory-ssr.ts`** — SSR pour les pages blog et directory tools (indexation + previews).
- **`sitemap.ts`, `rss.ts`** — génération dynamique du sitemap et flux RSS.
- Runtime Node (`@vercel/node`), TypeScript, variables via Vercel env vars.

## Règles importantes
- Ne jamais stocker de secrets (API keys, tokens, webhooks) dans le code ou dans `CLAUDE.md`
- Toujours utiliser les variables d'environnement (`.env.local` en dev, Supabase Secrets pour les Edge Functions, Vercel env vars pour `api/`)
- Les migrations SQL sont irréversibles en prod — bien les tester en local (`supabase db reset`) d'abord
- Les Edge Functions sont déployées **manuellement** (`supabase functions deploy <nom>`) — pas de CI/CD
- La route `/:handle` est un wildcard catch-all côté client : toute nouvelle route statique doit être déclarée **avant** dans `App.tsx`
- Les rewrites `vercel.json` doivent refléter chaque nouvelle route côté client pour supporter le deep-linking direct

## Fichiers de référence
- `docs/ARCHITECTURE.md` — architecture complète et flux de données
- `docs/SKILLS.md` — standards de code et conventions
- `docs/SECURITY.md` — RLS, auth, sécurité paiements
- `vercel.json` — rewrites, routes SSR, config build
- `.env.local` — variables d'environnement locales (ne pas committer)
