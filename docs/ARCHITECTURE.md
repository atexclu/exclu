# Architecture Exclu

## Vue d'ensemble

Exclu est une plateforme SaaS de monétisation de contenu pour créateurs, construite avec une architecture moderne et scalable.

## Stack Technique

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **Routing**: React Router DOM v6
- **Styling**: Tailwind CSS 3
- **UI Components**: shadcn/ui + Radix UI
- **Animations**: Framer Motion
- **State Management**: TanStack React Query
- **Forms**: React Hook Form + Zod

### Backend & Infrastructure
- **BaaS**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Payments**: Stripe Connect
- **Hosting**: Vercel
- **CDN**: Vercel Edge Network

### Edge Functions (Supabase)
- `create-link-checkout-session`: Gestion des sessions de paiement Stripe
- `stripe-webhook`: Traitement des webhooks Stripe
- `stripe-connect-onboard`: Onboarding Stripe Connect
- `stripe-connect-status`: Vérification du statut Stripe Connect
- `send-link-content-email`: Envoi d'emails avec contenu débloqué
- `increment-link-click`: Compteur de clics sur les liens
- `increment-profile-view`: Compteur de vues de profil
- `admin-get-users`: Récupération des utilisateurs pour l'admin
- `admin-get-user-overview`: Vue détaillée d'un utilisateur admin
- `admin-impersonate-user`: Impersonation utilisateur (admin)
- `og-preview`: Génération de previews Open Graph pour réseaux sociaux

## Architecture des Données

### Base de données (Supabase PostgreSQL)

**Tables principales** :
- `profiles`: Profils utilisateurs et créateurs
- `links`: Liens payants créés par les créateurs
- `assets`: Contenus (images, vidéos) attachés aux liens
- `sales`: Historique des ventes
- `creator_subscriptions`: Abonnements Premium des créateurs

### Storage (Supabase Storage)
- `avatars/`: Photos de profil
- `assets/`: Contenus vendus (images, vidéos)
- `public/`: Assets publics (OG images, etc.)

## Flux de Paiement

1. **Fan clique sur un lien payant** → Page publique avec preview
2. **Fan clique "Unlock"** → Appel à `create-link-checkout-session`
3. **Redirection vers Stripe Checkout** → Paiement
4. **Webhook Stripe** → `stripe-webhook` traite l'événement
5. **Création de la vente** → Enregistrement dans la table `sales`
6. **Email envoyé** → `send-link-content-email` envoie le contenu
7. **Redirection** → Page de succès avec contenu débloqué

## Sécurité

### Row Level Security (RLS)
Toutes les tables utilisent RLS pour garantir que :
- Les créateurs ne voient que leurs propres données
- Les fans ne peuvent accéder qu'aux contenus achetés
- Les admins ont accès complet

### Authentification
- Supabase Auth (email/password)
- JWT tokens pour les sessions
- Refresh tokens automatiques

### Paiements
- Stripe Connect pour la séparation des fonds
- Webhooks signés pour la sécurité
- Pas de stockage de données de carte

## Performance

### Optimisations Frontend
- Code splitting par route (React.lazy)
- Images optimisées (WebP, lazy loading)
- Animations GPU-accelerated (Framer Motion)
- Caching agressif (TanStack Query)

### Optimisations Backend
- Index sur les colonnes fréquemment requêtées
- Edge Functions pour la latence minimale
- CDN Vercel pour les assets statiques
- Cache HTTP (1h) pour les previews OG

## Monitoring & Analytics

### Métriques Créateur
- Vues de profil (compteur temps réel)
- Clics sur liens (compteur temps réel)
- Ventes et revenus (Stripe + base de données)
- Taux de conversion

### Métriques Admin
- Nombre total d'utilisateurs
- Revenus par créateur
- Meilleurs vendeurs
- Profils les plus vus

## Scalabilité

### Horizontal Scaling
- Edge Functions Supabase (auto-scaling)
- Vercel Edge Network (global)
- PostgreSQL connection pooling

### Vertical Scaling
- Supabase Pro (si nécessaire)
- Optimisation des requêtes SQL
- Indexes sur colonnes critiques

## CI/CD

### Déploiement
1. Push sur GitHub (branche `main`)
2. Vercel détecte le push
3. Build automatique (Vite)
4. Déploiement sur Vercel Edge
5. Invalidation du cache CDN

### Tests
- Unit tests (Vitest)
- Component tests (@testing-library/react)
- E2E tests (à implémenter)

## Environnements

### Development
- Local: `npm run dev` (Vite dev server)
- Supabase local: `supabase start`

### Production
- Frontend: Vercel
- Backend: Supabase Cloud
- Stripe: Mode production

## Roadmap Technique

### Court terme
- [ ] Génération d'images OG dynamiques
- [ ] Cache Redis pour les previews
- [ ] Webhooks Stripe retry logic

### Moyen terme
- [ ] Migration vers Next.js (SSR)
- [ ] API GraphQL (Apollo)
- [ ] Tests E2E (Playwright)

### Long terme
- [ ] Multi-région (Supabase)
- [ ] CDN personnalisé
- [ ] Analytics avancés (Mixpanel/Amplitude)
