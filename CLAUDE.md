# Exclu — Contexte projet pour Claude

## Qu'est-ce qu'Exclu ?
Plateforme SaaS de monétisation de contenu pour créateurs (photos, vidéos, fichiers, accès exclusifs).
Modèle : Free (10% commission) / Premium ($39/mois, 0% commission).
Les fans débloquent le contenu en un clic sans créer de compte.

## Stack technique
- **Frontend** : React 18 + TypeScript, Vite 5, React Router v6
- **UI** : Tailwind CSS 3 + shadcn/ui + Radix UI, Framer Motion
- **Data** : TanStack React Query, React Hook Form + Zod
- **Backend** : Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Paiements** : Stripe Connect (paiements directs aux créateurs)
- **Hosting** : Vercel (SPA statique)

## Lancer le projet
```bash
npm run dev        # Vite dev server sur :8080
supabase start     # Backend local (si besoin)
```

## Structure clé
```
src/
  pages/           # ~30 pages (AppDashboard, Profile, AdminBlog, DirectoryCreators...)
  components/      # UI components + shadcn/ui dans components/ui/
  hooks/           # Custom hooks React
  lib/             # Supabase client, utils
  contexts/        # React contexts

supabase/
  functions/       # ~30 Edge Functions (Deno/TypeScript)
  migrations/      # SQL migrations numérotées (1xx_nom.sql)
  config.toml      # Config fonctions (verify_jwt)

docs/              # Architecture, sécurité, plans détaillés
```

## Conventions de code
- Noms explicites, fonctions courtes (Single Responsibility)
- Logique métier dans `/lib` ou services dédiés, jamais dans les composants UI
- Pas de code dupliqué, pas de hacks temporaires non documentés
- TypeScript strict côté Edge Functions ; front plus souple (noImplicitAny désactivé)
- Composants shadcn/ui existants : toujours réutiliser avant d'en créer de nouveaux
- Animations : Framer Motion pour les pages, CSS pour les micro-interactions

## Base de données (Supabase)
- **Project ref** : `qexnwezetjlbwltyccks` (West EU - Ireland)
- **URL** : `https://qexnwezetjlbwltyccks.supabase.co`
- Tables principales : `profiles`, `links`, `assets`, `sales`, `creator_subscriptions`
- RLS activé sur toutes les tables — toujours vérifier les policies avant d'écrire des requêtes
- Nouvelles migrations : numéroter en `1xx_nom.sql` en continuité des existantes

## Edge Functions
- Runtime : Deno (TypeScript)
- Stripe webhooks : `verify_jwt = false` + vérification signature Stripe
- Fonctions publiques (checkout, previews) : `verify_jwt = false`
- Fonctions admin : `verify_jwt = true`
- Variables d'env injectées via Supabase Secrets (pas dans le code)

## Flux de paiement Stripe
Fan → `create-link-checkout-session` → Stripe Checkout → `stripe-webhook` → `sales` table → `send-link-content-email`

## Règles importantes
- Ne jamais stocker de secrets dans le code ou dans CLAUDE.md
- Toujours utiliser les variables d'environnement (`.env.local` en dev, Supabase Secrets en prod)
- Les migrations SQL sont irréversibles en prod — bien les tester en local d'abord
- Les Edge Functions sont déployées manuellement via `supabase functions deploy <nom>`

## Fichiers de référence
- `docs/ARCHITECTURE.md` — architecture complète et flux de données
- `docs/SKILLS.md` — standards de code et conventions
- `docs/SECURITY.md` — RLS, auth, sécurité paiements
- `.env.local` — variables d'environnement locales (ne pas committer)
