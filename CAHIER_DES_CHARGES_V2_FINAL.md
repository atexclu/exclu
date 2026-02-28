# EXCLU V2 — Cahier des Charges Final

> **Document de spécifications fonctionnelles et techniques**  
> Version 2.0 | Février 2026

---

## Table des Matières

1. [Vision & Contexte](#1-vision--contexte)
2. [Mode Jour / Nuit](#2-mode-jour--nuit)
3. [Link in Bio — Onboarding & Prévisualisation](#3-link-in-bio--onboarding--prévisualisation)
4. [Customisation Visuelle du Link in Bio](#4-customisation-visuelle-du-link-in-bio)
5. [Multi-Profils Premium](#5-multi-profils-premium)
6. [Structure des URLs & Navigation Mobile](#6-structure-des-urls--navigation-mobile)
7. [Stripe International & Relance Onboarding](#7-stripe-international--relance-onboarding)
8. [Programme d'Affiliation](#8-programme-daffiliation)
9. [Directory & Blog (Pôle SEO)](#9-directory--blog-pôle-seo)
10. [Custom Requests & Tips](#10-custom-requests--tips)
11. [Wishlist & Gifting](#11-wishlist--gifting)
12. [Panel Agence](#12-panel-agence)
13. [Chatting System — Centre de Vente Humain](#13-chatting-system--centre-de-vente-humain)

---

## 1. Vision & Contexte

### 1.1 Évolution Stratégique

EXCLU passe d'une **plateforme de monétisation de liens** à un **écosystème complet** pour créateurs, agences et équipes de vente humaines.

**Objectifs stratégiques :**
- Augmenter la personnalisation créateur pour renforcer l'attachement à la plateforme
- Maximiser la conversion fan via une UX optimisée mobile-first
- Structurer les rôles professionnels (agences, chatters, affiliés)
- Positionner EXCLU comme leader SEO du marché via contenu éditorial

### 1.2 Rôles Utilisateurs

| Rôle | Description | Accès |
|------|-------------|-------|
| **Fan** | Visiteur/acheteur de contenu | Pages publiques, paiement, chat (avec compte) |
| **Créateur Individuel** | Modèle indépendant | Dashboard créateur, Link in Bio, analytics |
| **Agence** | Gestionnaire multi-profils | Panel agence, chatting, analytics consolidés |
| **Chatter** | Opérateur de vente | Interface chat dédiée, accès multi-profils |
| **Affilié** | Partenaire de recrutement | Dashboard affiliation, tracking, commissions |
| **Admin EXCLU** | Équipe interne | CMS, modération, configuration globale |

#### ✅ Statut d'Implémentation (Février 2026)

**Base de données: 100% Complète**

**Migrations déployées:**
- `005_multi_profiles_simplified.sql` - Multi-profils, programme affiliation
- `006_chatters_analytics_optimization.sql` - Support chatters, analytics automatiques, facturation

**Tables créées:**
- `creator_profiles` - Profils créateurs (577 profils migrés)
- `profile_analytics` - Métriques quotidiennes par profil (77 entrées)
- `agency_members` - Chatters et managers d'agence
- `affiliates` - Comptes affiliés (auto-créés pour tous les users)
- `referrals` - Tracking parrainages
- `affiliate_payouts` - Paiements commissions

**Fonctionnalités implémentées:**
- ✅ Multi-profils: Plan Free (1 profil), Premium (2 inclus + $10/profil supplémentaire)
- ✅ Support chatters avec permissions granulaires
- ✅ Analytics automatiques (triggers sur views, clicks, sales)
- ✅ Programme affiliation (35% créateurs, 5% fans)
- ✅ Facturation dynamique (calcul automatique du prix)

**Frontend: À développer**
- ⏳ ProfileSwitcher et création de profil
- ⏳ Dashboard consolidé et par profil
- ⏳ Interface gestion chatters
- ⏳ Dashboard affiliation

---

## 2. Mode Jour / Nuit

### 2.1 Description Fonctionnelle

Système de thème global permettant de basculer entre **mode sombre** (identité principale) et **mode clair** (lisibilité éditorial).

### 2.2 Spécifications UI/UX

#### Comportement par Défaut
- **Première visite** : Détection automatique des préférences OS (`prefers-color-scheme`)
- **Pages par défaut** :
  - Landing, Dashboard, Link in Bio → **Mode Sombre**
  - Blog, Pages informatives → **Mode Clair**

#### Toggle de Thème
- **Position** : Header (icône soleil/lune)
- **Animation** : Transition fluide 300ms avec fade sur les couleurs
- **Persistance** : 
  - Utilisateur connecté → Sauvegarde en base (profil)
  - Visiteur → LocalStorage navigateur

#### Palette de Couleurs

**Mode Sombre (Principal)**
```
Background:     #0A0A0F (noir profond)
Surface:        #141420 (cartes, modales)
Border:         #2A2A40 (séparateurs)
Text Primary:   #FFFFFF
Text Secondary: #A0A0B0
Accent:         #9B59B6 → #E91E63 (gradient violet-rose)
Success:        #10B981
Warning:        #F59E0B
Error:          #EF4444
```

**Mode Clair (Éditorial)**
```
Background:     #FAFAFA
Surface:        #FFFFFF
Border:         #E5E5E5
Text Primary:   #1A1A2E
Text Secondary: #6B7280
Accent:         #7C3AED → #DB2777 (gradient violet-rose)
```

#### ✅ Statut d'Implémentation (Février 2026)

**Frontend: 100% Complète**

**Migration déployée:**
- `007_add_theme_preference.sql` - Colonne theme_preference ajoutée à profiles

**Fichiers créés:**
- `src/contexts/ThemeContext.tsx` - Provider React pour gestion du thème
- `src/components/ThemeToggle.tsx` - Bouton animé de basculement
- `src/index.css` - Variables CSS pour les deux modes (dark/light)
- `THEME_IMPLEMENTATION_GUIDE.md` - Guide d'intégration complet

**Fonctionnalités implémentées:**
- ✅ Sauvegarde en base de données (utilisateurs connectés)
- ✅ Sauvegarde en localStorage (visiteurs)
- ✅ Détection automatique préférence OS (`prefers-color-scheme`)
- ✅ Transitions fluides 300ms avec fade
- ✅ Palette complète dark/light selon spécifications
- ✅ ThemeProvider intégré dans App.tsx
- ✅ Composant ThemeToggle avec animations (Sun/Moon icons)

**À faire:**
- ⏳ Intégrer ThemeToggle dans Navbar/AppShell
- ⏳ Tester sur toutes les pages
- ⏳ Ajuster les couleurs si nécessaire

### 2.3 Zones d'Application

| Zone | Comportement |
|------|--------------|
| Landing Page | Respecte préférence utilisateur |
| Dashboard Créateur | Respecte préférence utilisateur |
| Link in Bio Public | Suit le thème défini par le créateur pour sa page |
| Interface Chatter/Agence | Respecte préférence utilisateur |
| Blog & Directory | Force mode clair par défaut |

### 2.4 Implications Techniques

- Refactoring CSS → **CSS Variables** pour toutes les couleurs
- Composant `ThemeProvider` global avec Context React
- Hook `useTheme()` pour accès dans tous les composants
- Synchronisation Supabase pour utilisateurs connectés

---

## 3. Link in Bio — Onboarding & Prévisualisation

### 3.1 Description Fonctionnelle

Éditeur visuel permettant aux créateurs de configurer leur page publique avec **prévisualisation temps réel** simulant l'expérience mobile.

### 3.2 Spécifications UI/UX

#### Placement dans le Parcours
```
Onboarding Flow:
1. Création compte (email/password)
2. Vérification email
3. Informations de base (nom, @username)
4. Connexion Stripe
5. ⭐ Configuration Link in Bio (NOUVELLE ÉTAPE)
6. Publication du profil
```

#### Layout de l'Éditeur

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: "Customize your page"           [Save Draft] [Publish]
├─────────────────────────────┬───────────────────────────────┤
│                             │                               │
│   PANNEAU DE CONFIGURATION  │     PREVIEW MOBILE            │
│   (60% largeur)             │     (40% largeur)             │
│                             │                               │
│   ┌─────────────────────┐   │     ┌─────────────────┐       │
│   │ 📷 Photo de profil  │   │     │   ╭─────────╮   │       │
│   │ 📝 Bio             │   │     │   │ IPHONE  │   │       │
│   │ 🎨 Couleurs        │   │     │   │ FRAME   │   │       │
│   │ 🔗 Réseaux sociaux │   │     │   │         │   │       │
│   │ 📦 Contenus        │   │     │   │ LIVE    │   │       │
│   │ ⚙️ Options         │   │     │   │ PREVIEW │   │       │
│   └─────────────────────┘   │     │   │         │   │       │
│                             │     │   ╰─────────╯   │       │
│                             │                               │
└─────────────────────────────┴───────────────────────────────┘
```

#### Sections de Configuration

**1. Photo de Profil**
- Upload drag & drop (max 5MB, JPG/PNG/WebP)
- Crop circulaire intégré
- Animation de halo configurable (on/off)

**2. Informations**
- Display name (max 50 caractères)
- @username (auto-généré, modifiable)
- Bio (max 300 caractères, compteur live)
- Localisation (ville, pays — optionnel)

**3. Réseaux Sociaux**
- Liste d'icônes en bulles comme c'est dans le profil avec le logo des réseaux sociaux : Instagram, Twitter/X, TikTok, OnlyFans, Fansly, YouTube
- Champ URL pour chaque réseau activé
- Drag & drop pour réordonner

**4. Contenus à Afficher**
- Toggle pour afficher/masquer chaque lien payant
- Ordre personnalisable (drag & drop)
- Preview du contenu flouté

**5. Options Avancées**
- Bouton "Join Now" : visible/masqué
- Badge "Verified" : visible si éligible (premium)
- Branding EXCLU : visible/masqué (premium only)

#### Preview Mobile

- **Frame** : Simulation iPhone 14 Pro (notch + safe areas)
- **Interactivité** : Scroll fonctionnel, hovers simulés
- **Synchronisation** : Mise à jour instantanée à chaque modification
- **Responsive** : Sur mobile, preview passe en mode fullscreen avec toggle

### 3.3 États de Sauvegarde

| État | Description | Comportement |
|------|-------------|--------------|
| **Draft** | Modifications non publiées | Visible uniquement dans l'éditeur |
| **Published** | Version live | Visible sur `exclu.at/username` |
| **Pending** | En cours de sauvegarde | Spinner + désactivation boutons |

### 3.4 Implications Techniques

- **Composant partagé** : `LinkInBioRenderer` utilisé pour preview ET page publique
- **État local** : React state pour modifications temps réel
- **Debounce** : Auto-save draft toutes les 10 secondes
- **Validation** : Vérification @username unique côté serveur

---

## 4. Customisation Visuelle du Link in Bio

### 4.1 Description Fonctionnelle

Système de personnalisation avancé permettant une identité visuelle unique par créateur, tout en maintenant la cohérence avec la marque EXCLU.

### 4.2 Spécifications UI/UX

#### Options de Personnalisation

**Thème de Page**
```
Presets disponibles :
├── 🌙 Midnight (défaut) — Noir profond + violet/rose
├── 🔥 Flame — Noir + orange/rouge
├── 💎 Diamond — Noir + bleu/cyan
├── 🌸 Blossom — Noir + rose/magenta
├── 🌿 Forest — Noir + vert/émeraude
└── ✨ Custom — Couleurs personnalisées
```

**Couleurs Personnalisées (Mode Custom)**
- Couleur principale (accent)
- Couleur secondaire (gradient)
- Color picker avec prévisualisation

**Style de Boutons**
```
Formes :
├── Rounded (coins arrondis 12px)
├── Pill (coins full rounded)
└── Square (coins 4px)

Animations :
├── Pulse — Effet de pulsation subtile
├── Glow — Halo lumineux au hover
├── Slide — Glissement de gradient
└── None — Statique
```

**Layout de Grille**
- 2 colonnes (défaut)
- 3 colonnes (plus compact)
- Liste (1 colonne, titres visibles)

#### Restrictions de Personnalisation

| Option | Free | Premium |
|--------|------|---------|
| Presets de thème | ✅ | ✅ |
| Couleurs custom | ❌ | ✅ |
| Animations avancées | ❌ | ✅ |
| Masquer branding EXCLU | ❌ | ✅ |
| Badge "Verified" | ❌ | ✅ |
| Deep Link personnalisé | ❌ | ✅ |

> **💡 DÉCISION REQUISE : Deep Link**
> 
> Le "Deep Link" mentionné pour les comptes premium nécessite clarification :
> - **Option A** : URL personnalisée type `exclu.at/custom-slug` (au lieu de @username)
> - **Option B** : Domaine personnalisé type `monsite.com` pointant vers le profil EXCLU
> - **Option C** : Lien de partage raccourci avec analytics avancés
> 
> **Recommandation** : Option A pour simplicité d'implémentation

### 4.3 Garde-Fous UX

- **Contraste minimum** : Validation automatique que le texte reste lisible
- **Preview obligatoire** : Impossible de publier sans visualiser le rendu
- **Reset** : Bouton "Réinitialiser aux valeurs par défaut"

### 4.4 Stockage des Configurations

```typescript
interface ProfileThemeConfig {
  preset: 'midnight' | 'flame' | 'diamond' | 'blossom' | 'forest' | 'custom';
  customColors?: {
    primary: string;    // HEX
    secondary: string;  // HEX
  };
  buttonStyle: 'rounded' | 'pill' | 'square';
  buttonAnimation: 'pulse' | 'glow' | 'slide' | 'none';
  gridLayout: '2-col' | '3-col' | 'list';
  showExcluBranding: boolean;
  showVerifiedBadge: boolean;
}
```

---

## 5. Multi-Profils Premium

### 5.1 Description Fonctionnelle

Les comptes premium peuvent gérer plusieurs identités publiques distinctes depuis un seul compte utilisateur, chacune avec son propre @username, contenus et revenus séparés.

**Principe clé** : Un compte devient automatiquement "multi-profils" dès qu'il gère 2+ profils. Pas de rôle "agence" distinct.

### 5.2 Spécifications UI/UX

#### Architecture Conceptuelle

```
COMPTE UTILISATEUR (auth)
└── PROFIL 1 (@username1)
    ├── Link in Bio indépendant
    ├── Contenus payants propres
    ├── Statistiques séparées (views, clicks, sales)
    ├── Revenus propres (Stripe Connect dédié)
    └── Configuration visuelle unique
└── PROFIL 2 (@username2)
    ├── Link in Bio indépendant
    ├── Contenus payants propres
    ├── Statistiques séparées (views, clicks, sales)
    ├── Revenus propres (Stripe Connect dédié)
    └── Configuration visuelle unique
└── ... (illimité pour Premium)
```

**Cas d'usage** :
- Agences gérant plusieurs modèles
- Créateurs avec plusieurs personas (fitness + lifestyle)
- Modèles segmentant leur audience

#### Sélecteur de Profil (Profile Switcher)

**Position** : Header du dashboard, à gauche du nom d'utilisateur

**Design** :
```
┌────────────────────────────┐
│ 🔽 @currentprofile         │  ← Dropdown trigger
├────────────────────────────┤
│ ✓ @profile1    (active)    │
│   @profile2                │
│   @profile3                │
├────────────────────────────┤
│ ➕ Créer un nouveau profil │
└────────────────────────────┘
```

**Comportement** :
- Changement instantané sans rechargement de page
- Indicateur visuel du profil actif dans tout le dashboard
- Badge de notifications par profil
- Contexte complet bascule (contenus, stats, revenus)

#### Création d'un Nouveau Profil

**Flow** :
1. Clic sur "+ Créer un nouveau profil"
2. Vérification du quota (Free: 1 max, Premium: illimité)
3. Saisie du nouveau @username
4. Configuration minimale (photo, bio)
5. Connexion Stripe Connect (optionnel)
6. Activation du profil

**Message de Blocage (Free Plan)** :

```
┌─────────────────────────────────────────────┐
│  ⚠️ Limite atteinte                         │
│                                             │
│  Les comptes gratuits sont limités à        │
│  1 profil. Passez à Premium pour gérer      │
│  plusieurs identités créateurs.             │
│                                             │
│  Premium: $39/mois                          │
│  • 2 profils inclus                         │
│  • +$10/mois par profil supplémentaire      │
│                                             │
│  [Passer à Premium]  [En savoir plus]       │
└─────────────────────────────────────────────┘
```

### 5.3 Modèle de Tarification Multi-Profils

| Situation | Coût | Détails |
|-----------|------|---------|
| Plan Free, 1 profil | Gratuit | Fonctionnalités de base |
| Plan Free, tentative 2ème profil | Blocage | Message upgrade obligatoire |
| Plan Premium, 1-2 profils | $39/mois | 2 profils inclus dans l'abonnement |
| Plan Premium, 3 profils | $49/mois | $39 + $10 (1 profil supplémentaire) |
| Plan Premium, 4 profils | $59/mois | $39 + $20 (2 profils supplémentaires) |
| Plan Premium, 5 profils | $69/mois | $39 + $30 (3 profils supplémentaires) |

**Formule de calcul** :
```
Prix = $39 + max(0, (nombre_profils - 2) × $10)
```

**Exemples concrets** :
- Créateur solo avec 1 profil → $39/mois (ou gratuit en Free)
- Créateur avec 2 personas → $39/mois
- Agence avec 5 modèles → $69/mois
- Grande agence avec 10 modèles → $119/mois

### 5.4 Dashboard Consolidé vs Par Profil

#### Vue Consolidée (Multi-Profils)

Accessible via un toggle "Vue d'ensemble" dans le header.

```
┌─────────────────────────────────────────────┐
│  📊 Vue d'ensemble — Tous les profils       │
├─────────────────────────────────────────────┤
│  Revenus totaux ce mois : $4,250            │
│  Ventes totales : 342                       │
│  Visites totales : 12,500                   │
│  Clicks totaux : 8,400                      │
├─────────────────────────────────────────────┤
│  Performance par profil :                   │
│  ┌──────────┬─────────┬────────┬─────────┬────────┐
│  │ Profil   │ Revenus │ Ventes │ Visites │ Clicks │
│  ├──────────┼─────────┼────────┼─────────┼────────┤
│  │ @girl1   │ $2,100  │ 180    │ 5,200   │ 3,800  │
│  │ @girl2   │ $1,500  │ 120    │ 4,800   │ 3,200  │
│  │ @girl3   │ $650    │ 42     │ 2,500   │ 1,400  │
│  └──────────┴─────────┴────────┴─────────┴────────┘
│                                                     │
│  [Voir les détails par profil]                     │
└─────────────────────────────────────────────────────┘
```

**Métriques agrégées** :
- Revenus totaux (somme de tous les profils)
- Ventes totales
- Visites totales
- Clicks totaux
- Graphiques de performance comparée

#### Vue Par Profil

Accessible via le profile switcher. Affiche uniquement les données du profil sélectionné.

```
┌─────────────────────────────────────────────┐
│  📊 Dashboard — @girl1                      │
├─────────────────────────────────────────────┤
│  Revenus ce mois : $2,100                   │
│  Ventes : 180                               │
│  Visites : 5,200                            │
│  Clicks : 3,800                             │
│  Taux de conversion : 3.46%                 │
├─────────────────────────────────────────────┤
│  Liens actifs (12)                          │
│  • Exclusive Set #1 - $15 (45 ventes)       │
│  • Behind the Scenes - $10 (38 ventes)      │
│  • ...                                      │
└─────────────────────────────────────────────┘
```

**Fonctionnalités** :
- Interface identique au dashboard créateur individuel
- Toutes les actions (créer lien, voir stats, etc.) s'appliquent au profil actif
- Isolation complète des données entre profils

### 5.5 Implications Techniques

#### Schéma de Base de Données

**Table principale : `creator_profiles`**

```sql
CREATE TABLE creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),  -- Propriétaire
  
  -- Identité publique
  username TEXT UNIQUE,  -- @username (peut être NULL si handle manquant)
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  
  -- Configuration visuelle (Link in Bio)
  theme_config JSONB DEFAULT '{
    "preset": "midnight",
    "buttonStyle": "rounded",
    "buttonAnimation": "pulse",
    "gridLayout": "2-col",
    "showExcluBranding": true,
    "showVerifiedBadge": false
  }',
  
  -- Réseaux sociaux
  social_links JSONB DEFAULT '{}',
  
  -- Stripe Connect (un par profil)
  stripe_account_id TEXT UNIQUE,
  stripe_connect_status TEXT DEFAULT 'not_started',
  
  -- Statut
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Table analytics : `profile_analytics`**

```sql
CREATE TABLE profile_analytics (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES creator_profiles(id),
  date DATE NOT NULL,
  
  -- Métriques quotidiennes par profil
  profile_views INTEGER DEFAULT 0,
  link_clicks INTEGER DEFAULT 0,
  sales_count INTEGER DEFAULT 0,
  revenue_cents BIGINT DEFAULT 0,
  
  UNIQUE(profile_id, date)
);
```

**Relations avec tables existantes**

```sql
-- Les liens sont liés à un profil spécifique
ALTER TABLE links 
  ADD COLUMN profile_id UUID REFERENCES creator_profiles(id);

-- Les assets sont liés à un profil spécifique  
ALTER TABLE assets
  ADD COLUMN profile_id UUID REFERENCES creator_profiles(id);
```

#### Logique de Quota

**Fonction de vérification du quota** :

```sql
CREATE FUNCTION check_profile_creation_quota()
RETURNS TRIGGER AS $$
DECLARE
    v_current_count INTEGER;
    v_is_premium BOOLEAN;
BEGIN
    -- Compter les profils actifs
    SELECT COUNT(*) INTO v_current_count
    FROM creator_profiles
    WHERE user_id = NEW.user_id AND is_active = true;
    
    -- Vérifier le statut premium
    SELECT is_creator_subscribed INTO v_is_premium
    FROM profiles WHERE id = NEW.user_id;
    
    -- Plan Free: 1 profil max
    IF NOT v_is_premium AND v_current_count >= 1 THEN
        RAISE EXCEPTION 'FREE_PLAN_LIMIT';
    END IF;
    
    -- Plan Premium: illimité (facturation Stripe)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Calcul du prix d'abonnement** :

```typescript
function calculateSubscriptionPrice(profileCount: number): number {
  const basePrice = 3900; // $39 en cents
  const includedProfiles = 2;
  const additionalProfilePrice = 1000; // $10 en cents
  
  if (profileCount <= includedProfiles) {
    return basePrice;
  }
  
  const additionalProfiles = profileCount - includedProfiles;
  return basePrice + (additionalProfiles * additionalProfilePrice);
}
```

#### Migration des Données Existantes

**Automatique et sans rupture** :
- Chaque créateur existant obtient automatiquement un `creator_profile`
- Le `username` est copié depuis `profiles.handle` (peut être NULL)
- Tous les `links` et `assets` sont automatiquement associés au profil
- Les colonnes existantes (`creator_id`, `is_creator`) sont conservées
- **Aucune action requise des utilisateurs**

---

## 6. Structure des URLs & Navigation Mobile

### 6.1 Structure des URLs

#### URLs Publiques Simplifiées

| Type | Format | Exemple |
|------|--------|---------|
| Profil créateur | `exclu.at/{username}` | `exclu.at/emma` |
| Contenu individuel | `exclu.at/{username}/{slug}` | `exclu.at/emma/exclusive-set` |
| Blog | `exclu.at/blog/{article-slug}` | `exclu.at/blog/best-tips-2026` |
| Directory | `exclu.at/directory/{category}` | `exclu.at/directory/models` |

#### Redirections Legacy

| Ancienne URL | Nouvelle URL | HTTP Code |
|--------------|--------------|-----------|
| `exclu.at/u/username` | `exclu.at/username` | 301 |
| `exclu.at/l/slug` | `exclu.at/{creator}/slug` | 301 |
| `exclu.at/c/handle` | `exclu.at/handle` | 301 |

### 6.2 Navigation Mobile (Barre Basse)

#### Design de la Navigation

```
┌─────────────────────────────────────────┐
│              PAGE CONTENU               │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  🏠      📷      💬      🎁      ℹ️     │
│  Home   Content  Chat   Gifts   Info    │
└─────────────────────────────────────────┘
```

#### Spécifications

| Icône | Label | Action |
|-------|-------|--------|
| 🏠 Home | Retour haut de page | Scroll to top |
| 📷 Content | Contenus payants | Scroll to feed section |
| 💬 Chat | Messagerie | Ouvre chat (si compte fan) |
| 🎁 Gifts | Wishlist | Scroll to wishlist section |
| ℹ️ Info | À propos | Scroll to bio/socials |

#### Comportement

- **Apparition** : Visible uniquement sur mobile (<768px)
- **Sticky** : Fixée en bas de l'écran
- **Animation** : Slide up au scroll down, réapparaît au scroll up
- **Safe Area** : Padding bottom pour iPhone (notch)

### 6.3 Bouton "Join Now"

#### Comportement du CTA

**Destination selon le contexte** :
```
Page d'inscription : exclu.at/signup?invitedby={referral_code}

Options présentées :
┌─────────────────────────────────────────┐
│  🎯 Join EXCLU                          │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 👑 I'm a Creator               │    │
│  │    Start monetizing my content  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 🏢 I'm an Agency               │    │
│  │    Manage multiple creators     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ 👤 I'm just browsing           │    │
│  │    (optional email signup)      │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Pour "Just Browsing"** :
- Email optionnel pour newsletter
- Redirection vers le Directory des modèles
- Pas de compte créé si email non fourni

---

## 7. Stripe International & Relance Onboarding

### 7.1 Extension Pays Stripe Connect

#### Pays Prioritaires à Ajouter

| Région | Pays | Priorité |
|--------|------|----------|
| Asie | 🇯🇵 Japon, 🇭🇰 Hong Kong, 🇸🇬 Singapour | Haute |
| Europe | 🇵🇱 Pologne, 🇨🇿 Tchéquie, 🇷🇴 Roumanie | Moyenne |
| Amérique | 🇧🇷 Brésil, 🇲🇽 Mexique | Moyenne |

### 7.2 Gestion des Pays Non Supportés

#### Flow pour Créateurs en Pays Non Supporté

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ Stripe n'est pas disponible dans votre pays            │
│                                                             │
│  Vous pouvez tout de même créer votre profil et            │
│  configurer vos contenus. Pour recevoir vos paiements :    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🤝 Partenariat avec une Agence                      │   │
│  │                                                     │   │
│  │ Une agence partenaire peut recevoir les paiements   │   │
│  │ à votre place et vous reverser vos gains.          │   │
│  │                                                     │   │
│  │ [Voir les agences disponibles]                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Continuer sans paiement]  [Me notifier quand disponible] │
└─────────────────────────────────────────────────────────────┘
```

#### Page "Modèles en Attente d'Agence"

**Accès** : Réservé aux agences partenaires EXCLU

**Contenu** :
- Liste des créateurs en pays non supporté
- Profil preview (bio, contenus, stats)
- Bouton "Proposer un partenariat"

### 7.3 Relance Automatique Onboarding

#### Séquence d'Emails

| Délai | Email | Objet |
|-------|-------|-------|
| J+1 | Rappel doux | "Finalisez votre compte en 2 minutes 🚀" |
| J+3 | Urgence modérée | "Vos fans attendent — activez les paiements" |
| J+7 | Dernier rappel | "Dernière chance : votre compte sera désactivé" |

#### Tracking d'État Onboarding

```typescript
enum OnboardingStatus {
  EMAIL_VERIFIED = 'email_verified',
  PROFILE_CREATED = 'profile_created',
  STRIPE_STARTED = 'stripe_started',
  STRIPE_PENDING = 'stripe_pending',      // En cours chez Stripe
  STRIPE_COMPLETED = 'stripe_completed',  // Prêt à recevoir
  STRIPE_BLOCKED = 'stripe_blocked'       // Pays non supporté
}
```

---

## 8. Programme d'Affiliation

### 8.1 Description Fonctionnelle

Système permettant à tout utilisateur de recruter de nouveaux créateurs et de toucher une commission récurrente sur leur activité.

### 8.2 Modèle de Commission

| Type | Bénéficiaire | Montant | Récurrence |
|------|-------------|---------|------------|
| Commission abonnement premium | Parrain (referrer) | 35% de l'abonnement premium (~$13.65/mois) | Récurrente tant que le créateur reste premium |
| Bonus de bienvenue | Créateur recruté (referred) | $100 crédité sur sa cagnotte | Une fois, si $1 000 de ventes dans les 90 jours suivant la création du compte |

**Exemple commission** :
- Parrain recrute un créateur qui souscrit Premium ($39/mois)
- Le parrain touche $13.65/mois tant que le créateur reste premium

**Exemple bonus** :
- Le créateur recruté génère $1 000 de ventes dans les 90 jours → $100 crédités sur sa cagnotte affilié

### 8.3 Dashboard Affilié (à faire en anglais biensûr, voir description détaillée ci-dessous pour plus de détails)

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Mon Programme d'Affiliation                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  💰 Revenus : $245.50                              │
│  👥 Créateurs recrutés : 12                                │
│  📈 Taux de conversion : 8.5%                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  🔗 Votre lien d'affiliation                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ exclu.at/signup?ref=abc123xyz                       │ 📋│
│  └─────────────────────────────────────────────────────┘   │
│     Envoyer par email                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Entrez l'adresse email du créateur            │ │
│  └─────────────────────────────────────────────────────┘   │
│  réseaux sociaux à ajouter                                  │
├─────────────────────────────────────────────────────────────┤
│  📋 Historique des recrutements                            │
│  ┌──────────┬─────────────┬────────────┬──────────────┐   │
│  │ Date     │ Créateur    │ Status     │ Commission   │   │
│  ├──────────┼─────────────┼────────────┼──────────────┤   │
│  │ 02/01    │ @newgirl    │ Premium ✅ │ $13.65/mois  │   │
│  │ 01/28    │ @model2     │ Free       │ —            │   │
│  └──────────┴─────────────┴────────────┴──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 8.4 Accès au Programme

- **Ouvert** : Créateurs seulement
- **Activation** : Automatique à la création de compte
- **Cagnotte** : Les commissions s'accumulent dans `affiliate_earnings_cents` sur le profil du parrain. Le bonus $100 s'accumule dans la même cagnotte pour le créateur recruté.
- **Seuil de retrait** : $100 minimum
- **Demande de retrait** : Bouton "Request payout" dans le dashboard referral → envoie automatiquement un email de notification à l'équipe Exclu (atexclu@gmail.com) via Brevo, avec nom, handle, email du créateur et montant à virer. Le bouton passe en état "Pending" (persisté en DB via `affiliate_payout_requested_at`) et disparaît jusqu'au paiement manuel.
- **Paiement** : Manuel par l'équipe Exclu. Une fois payé, remettre `affiliate_payout_requested_at = NULL` et `affiliate_earnings_cents = 0` dans la DB pour réinitialiser l'état.
- **Pas de virement automatique Stripe** : Tout est traité manuellement.

### 8.5 Dashboard Affilié — État Implémenté

**Onglet Referral dans AppDashboard (tab inline) :**
- **Cards stat** : 3 cards pour les non-recrutés (Affiliate earnings, Creators recruited, Conversion rate), 4 cards pour les recrutés (+ Welcome bonus $100 avec état unlocked/eligible/expired)
- **Bouton Request payout** : Visible centré sous les cards quand `affiliate_earnings_cents >= 10 000` (=$100) ET `affiliate_payout_requested_at` est null. Style identique au bouton "New link" (hero/jaune #CFFF16).
- **Badge Pending** : S'affiche à côté du montant sur la card "Affiliate earnings" quand une demande est en cours.
- **Lien de parrainage** : Copie, envoi par email (Edge Function `send-referral-invite` via Brevo), partage sur X, Telegram, Instagram, Snapchat.
- **Tableau historique** : Date, créateur, statut (Free/Premium/Inactive), commission.

**Page dédiée `/app/referral` (ReferralDashboard.tsx) :** version standalone également disponible.

### 8.6 Flux Technique Implémenté

```
1. Créateur A partage son lien → exclu.at/auth?mode=signup&ref=CODE
2. Créateur B s'inscrit → row insérée dans table `referrals` (referrer_id=A, referred_id=B, status=pending)
3. Créateur B souscrit Premium → stripe-webhook crédite 35% dans affiliate_earnings_cents de A + status=converted
4. Créateur B atteint $1 000 de ventes en 90j → stripe-webhook crédite $100 dans affiliate_earnings_cents de B + bonus_paid_to_referred=true
5. Créateur A/B clique Request payout → Edge Function `request-affiliate-payout` → mail Brevo à atexclu@gmail.com + affiliate_payout_requested_at écrit en DB
6. Équipe paie manuellement → remet affiliate_payout_requested_at=NULL + affiliate_earnings_cents=0
```

**Edge Functions concernées :** `stripe-webhook`, `request-affiliate-payout`, `send-referral-invite`

**Colonnes DB `profiles` :** `referral_code`, `affiliate_earnings_cents`, `affiliate_payout_requested_at`

**Table `referrals` :** `referrer_id`, `referred_id`, `status`, `commission_earned_cents`, `bonus_paid_to_referred`, `created_at`, `converted_at`

### 8.7 Notes pour l'interface

Description initiale de l'interface du programme d'affiliation et expérience utilisateur (implémenté, voir 8.5 pour l'état réel) :

J'aimerais que côté créateur, on puisse facilement partager son lien de parrainage. Pour cela, dans le dashboard, en plus de "Metrics" & "Earnings" dans le menu sous le titre Welcome back, j'aimerais qu'on puisse avoir un bouton "Referral" qui mène à une page où on peut partager son lien de parrainage. Je précise, pour accéder à cette page il faut s'être connecté à stripe, pas forcément besoin d'avoir un abonnement premium.

Sur cette page, on retrouve :

3 Cards comme celles dans "Metrics", mais affichant :
Revenus: $245.50
Créateurs recrutés : 12
Taux de conversion : 8.5% -> Ce taux c'est le nombre de créateurs qui ont pris un abonnement premium sur le total de créateurs recrutés.

Dessous un encadré qui prends toute la largeur avec dedans :

- Le lien de parrainage que on peut copier dans un input, en dessous 
- Un input mail et un bouton "envoyer" à droite en ligne permettant de l'envoyer par email directement.
Pour l'envoi par email, il faut que le mail soit grâce à un template html que tu doit créer, pour l'aspect tu doit reprendre ceux existants qui sont déjà dans le projet. Pour le code sur l'envoi etc c'est déjà fonctionnel ceux qui sont déjà dans le projet donc regarde comment on les renvoi via supabase auth / brevo et adapte pour ce nouveau mail. Pour le contenu de ce mail en anglais, il faut que ça soit un texte simple qui dit en gros : 

"Username createur" vous invite à le rejoindre sur Exclu

[Accepter l'invitation]

Explication courte de ce qu'est exclu en anglais.

Et en dessous, 
- Des boutons pour partager le lien de parrainage sur les réseaux sociaux (Twitter, Insta, Tiktok, etc.). Ces boutons doivent ouvrir une fenêtre de partage du réseau social concerné avec le lien de parrainage pré-rempli du message suivant :

"Still giving away 20% to OnlyFans ? 😅

Smart 🔞 creators are moving to Exclu.

0% commission 💸
Get paid fast 💵
Sell from your bio, anywhere 🔗

Every day you wait = money lost.

Switch now 📲 exclu.at

(Limited FREE access link)"

En dessous un tableau dans un encadré avec l'historique des recrutements, avec les colonnes : Date, Créateur, Status, Commission.

Pour la preview du lien d'affiliation, l'image de preview du lien quand on le partage doit être "og_invit.png" rangée dans "public".
Le text preview du lien doit être : «  Mystery invite 👀 »
Avant d'implémpenter regarde bien comment c'est codé quand on partage un lien de profil, et fait en sorte que ça soit le même style et code pour le affiliate link.

Une fois que le créateur a cliqué sur le lien d'affiliation, il doit être redirigé vers la page d'inscription de exclu.at avec le code de parrainage pré-rempli. Une fois son compte validé, il apparait dans les créateurs recrutés du créateur qui l'a parrainé. Il faut que si un créateur passe en premium, seulement tant que son abonnement est actif, 35% soit reversé au créateur qui l'a parrainé chaque mois au moment où l'on reçoit le paiement de l'abonnement du créateur parrainé. Il faut que ce revenu s'actualise en temps réel dans le dashboard du créateur qui l'a parrainé dans la partie referal. On ne paye pas ces montants réellement, juste on crédite les gains sur la cagnotte et dès que l'user atteint 100$ il peut demander un virement sur son compte stripe. (Paiement effectué manuellement par nous, pas de versement automatique).

Il faut que l'ui soit soignée, qu'elle s'adapte bien comme le reste de la plateforme au mode sobre et jour, qu'elle soit responsive mobile et desktop.

```

---

## 9. Directory & Blog (Pôle SEO)

### 9.1 Vue d'Ensemble

Le pôle SEO d'EXCLU comprend 4 sections distinctes :

1. **Directory Modèles** — Liste des créateurs par niche/localisation
2. **Directory Agences** — Liste des agences par pays/services
3. **Directory Outils** — Comparatifs d'alternatives à EXCLU
4. **Blog** — Guides, tutoriels et actualités

### 9.2 Directory Modèles

#### Affichage Principal

**Inspiration** : https://www.instagram.com/reel/DTsQ7wejE-i/

```
┌─────────────────────────────────────────────────────────────┐
│  🔍 [Recherche...]        📍 Pays ▼    🏷️ Niche ▼          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⭐ MODÈLES PREMIUM (mise en avant)                        │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                  │
│  │     │ │     │ │     │ │     │ │     │                  │
│  │ 👤  │ │ 👤  │ │ 👤  │ │ 👤  │ │ 👤  │                  │
│  │Emma │ │Léa  │ │Clara│ │Julie│ │Sarah│                  │
│  │ ✓   │ │ ✓   │ │ ✓   │ │ ✓   │ │ ✓   │                  │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                  │
│                                                             │
│  TOUS LES MODÈLES                                          │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐          │
│  │     │ │     │ │     │ │     │ │     │ │     │          │
│  │ 👤  │ │ 👤  │ │ 👤  │ │ 👤  │ │ 👤  │ │ 👤  │          │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘          │
│                                                             │
│  [Charger plus...]                                          │
└─────────────────────────────────────────────────────────────┘
```

#### Filtres Disponibles

| Filtre | Options |
|--------|---------|
| Pays | Liste des pays avec créateurs |
| Ville | Villes principales |
| Niche | Fitness, Lifestyle, Cosplay, NSFW, etc. |
| Statut | Tous, En ligne maintenant |

#### Règles d'Affichage

- **Premium** : Apparaissent en premier, badge "✓ Verified"
- **Free** : Apparaissent après les premium
- **Automatique** : Tout utilisateur est listé par défaut
- **Opt-out** : Option pour se retirer du directory

### 9.3 Directory Agences

#### Contenu

- Liste des agences partenaires
- Filtres par pays, services proposés
- Page dédiée par agence avec :
  - Présentation
  - Créateurs gérés
  - Contact

#### Gestion

- Upload des agences via interface admin EXCLU
- Possibilité de lister ou non chaque agence

### 9.4 Blog

#### Structure

```
/blog
├── /category/guides          — Tutoriels pour créateurs
├── /category/industry-news   — Actualités du marché
├── /category/comparisons     — Exclu vs concurrents
└── /article/{slug}           — Article individuel
```

#### CMS Admin

**Interface de rédaction** :
- Éditeur WYSIWYG (type Notion-like)
- Upload d'images
- SEO fields : title, meta description, canonical
- Catégorisation
- Programmation de publication

### 9.5 Implications Techniques

- **SSR/SSG** : Rendu côté serveur obligatoire pour SEO
- **Sitemap dynamique** : Génération automatique
- **Schema.org** : Markup structuré pour rich snippets
- **URLs propres** : Slugs lisibles, sans IDs

> **💡 DÉCISION REQUISE : Architecture Blog**
> 
> Pour le blog, plusieurs options sont possibles :
> - **Option A** : CMS headless externe (Contentful, Sanity) + intégration
> - **Option B** : CMS intégré dans Supabase + interface admin custom
> - **Option C** : Fichiers Markdown dans le repo + génération statique
> 
> **Recommandation** : Option B pour garder tout centralisé, avec interface admin dédiée

---

## 10. Custom Requests & Tips

### 10.1 Description Fonctionnelle

Système permettant aux fans d'envoyer :
- **Tips** : Pourboires avec message optionnel
- **Custom Requests** : Demandes de contenu personnalisé avec prix proposé

### 10.2 Interface Fan

#### Bouton Tip

```
┌─────────────────────────────────────────┐
│  🎁 Envoyer un Tip                      │
├─────────────────────────────────────────┤
│  Montant :                              │
│  [$5] [$10] [$25] [$50] [Custom]        │
│                                         │
│  Message (optionnel) :                  │
│  ┌─────────────────────────────────┐    │
│  │ Tu es incroyable ! 💕           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ☐ Rester anonyme                       │
│                                         │
│  [Envoyer le Tip - $10]                 │
└─────────────────────────────────────────┘
```

#### Demande Custom

```
┌─────────────────────────────────────────┐
│  📝 Demande de Contenu Custom           │
├─────────────────────────────────────────┤
│  Décrivez votre demande :               │
│  ┌─────────────────────────────────┐    │
│  │ J'aimerais une photo en...      │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Votre proposition : $___               │
│  (minimum $20)                          │
│                                         │
│  [Envoyer la demande]                   │
└─────────────────────────────────────────┘
```

### 10.3 Interface Créateur (Dashboard)

#### Section "Demandes & Tips"

```
┌─────────────────────────────────────────────────────────────┐
│  📬 Demandes & Tips                    [Tout marquer lu]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🎁 TIPS REÇUS                                             │
│  ┌──────────┬───────────┬────────────────────────────────┐ │
│  │ $25      │ @fan123   │ "Merci pour tout ! 💖"        │ │
│  │ $10      │ Anonyme   │ —                              │ │
│  └──────────┴───────────┴────────────────────────────────┘ │
│                                                             │
│  📝 DEMANDES CUSTOM                                        │
│  ┌────────────────────────────────────────────────────────┐│
│  │ @fan456 propose $50                         [En attente]││
│  │ "Une photo en tenue de sport"                          ││
│  │                                                        ││
│  │ [✓ Accepter] [✗ Refuser] [💬 Répondre]                ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 10.4 Workflow des Demandes

```
FAN                           CRÉATEUR
 │                                │
 │──── Soumet demande + prix ────▶│
 │                                │
 │                                ├── Visualise dans dashboard
 │                                │
 │◀─── Réponse (accepte/refuse) ──│
 │                                │
 │    Si accepté :                │
 │──── Paiement (montant fixé) ──▶│
 │                                │
 │◀─── Livraison contenu ─────────│
 │     (via plateforme)           │
```

### 10.5 Règles Business

| Action | Comportement |
|--------|--------------|
| Tip envoyé | Transaction immédiate, montant crédité au créateur |
| Demande acceptée | Fan paie le montant, créateur doit livrer |
| Demande refusée | Aucun paiement |
| Demande expirée | Auto-refus après 7 jours sans réponse |

**Commission EXCLU** : Identique aux autres ventes (10% Free, 0% Premium + 5% processing)

### 10.6 Liens de Paiement Directs (Support Links)

Les créateurs peuvent générer des **liens de paiement sans contenu associé**, utilisés comme moyen de soutien direct :

```
┌─────────────────────────────────────────┐
│  💸 Créer un lien de soutien            │
├─────────────────────────────────────────┤
│  Titre : [Support my content ✨]        │
│  Montant : [$__] ou [Libre]             │
│                                         │
│  Lien généré :                          │
│  exclu.at/emma/support/abc123    [📋]  │
│                                         │
│  [Créer le lien]                        │
└─────────────────────────────────────────┘
```

**Usage** :
- Partage sur réseaux sociaux
- Bio Instagram/TikTok
- Remerciements live streams

### 10.7 Création de Compte Fan Obligatoire

Pour envoyer un tip ou une demande :
- Le fan **doit créer un compte**
- Inscription rapide (email + password)
- Option "Supprimer mon compte" accessible facilement

---

## 11. Wishlist & Gifting

### 11.1 Description Fonctionnelle

Les créateurs affichent une liste de souhaits. Les fans peuvent "offrir" un article, ce qui génère un **transfert d'argent** (pas d'achat physique).

### 11.2 Items Prédéfinis (Onboarding)

Durant l'onboarding, le créateur peut cocher des items par défaut en cliquant sur les images des lots prédéfinis pour les sélectionner, il faut que l'on ai un affichage en galerie très visuels avec les prix et les descriptions ex :

| Item | Montant affiché |
|------|-----------------|
| 💻 MacBook | $1,299 |
| 👠 Louboutin | $695 |
| 🛍️ Victoria's Secret Gift Card | $125 |
| 🛒 Amazon Gift Card | $50 |
| 🍽️ Dinner | $200 |

**Note affichée** : "Vous pourrez ajouter des items personnalisés ou modifier les prix des lots prédéfinis plus tard"

-> Il faut faire en sorte d'avoir créé une base de lots prédéfinis pour les créateurs qu'ils peuvent facilement sélectionner et modifier, sans que cela modifie les prix des lots prédéfinis pour les autres créateurs, juste pour eux. J'aimerais également que les prix des lots prédéfinis soient modifiables par les créateurs. Il doivent pouvoir créer leurs lots personnalisés et les modifier, en ajoutant une image et une description. Pour les lots prédéfinis, il faudra me guider pour m'indiauer où je doit te passer les images des lots.


### 11.3 Interface Créateur

#### Gestion Wishlist

```
┌─────────────────────────────────────────────────────────────┐
│  🎁 Ma Wishlist                              [+ Ajouter]    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 💻 MacBook        │ $1,299 │ 0/1 offert │ [✏️] [🗑️]   ││
│  │ 👠 Louboutin      │ $695   │ 1/1 offert │ [✏️] [🗑️]   ││
│  │ 🍽️ Dinner         │ $200   │ 2/∞ offert │ [✏️] [🗑️]   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

#### Ajout d'Item Custom

```
┌─────────────────────────────────────────┐
│  ➕ Nouvel Article                      │
├─────────────────────────────────────────┤
│  Nom : [Voyage à Bali        ]          │
│  Montant : [$2,500           ]          │
│  Image : [Upload] ou [URL]              │
│  Quantité max : [1]  ☐ Illimité         │
│                                         │
│  [Ajouter à ma wishlist]                │
└─────────────────────────────────────────┘
```

### 11.4 Interface Fan (Page Publique du créateur, dans un nouveau menu à côté de "Links" "Content" "Wishlist" )
                                │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐     │
│  │    [IMG]      │ │    [IMG]      │ │    [IMG]      │     │
│  │   MacBook     │ │  Louboutin    │ │   Dinner      │     │
│  │   $1,299      │ │    $695       │ │    $200       │     │
│  │  [Offrir 🎁]  │ │  [Offert ✓]   │ │  [Offrir 🎁]  │     │
│  └───────────────┘ └───────────────┘ └───────────────┘     │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐     │
│  │    [IMG]      │ │    [IMG]      │ │    [IMG]      │     │
│  │   MacBook     │ │  Louboutin    │ │   Dinner      │     │
│  │   $1,299      │ │    $695       │ │    $200       │     │
│  │  [Offrir 🎁]  │ │  [Offert ✓]   │ │  [Offrir 🎁]  │     │
│  └───────────────┘ └───────────────┘ └───────────────┘     │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐     │
│  │    [IMG]      │ │    [IMG]      │ │    [IMG]      │     │
│  │   MacBook     │ │  Louboutin    │ │   Dinner      │     │
│  │   $1,299      │ │    $695       │ │    $200       │     │
│  │  [Offrir 🎁]  │ │  [Offert ✓]   │ │  [Offrir 🎁]  │     │
│  └───────────────┘ └───────────────┘ └───────────────┘     │
└─────────────────────────────────────────────────────────────┘

Les cards doivent en 2 colonnes comme celles de "content".
```

### 11.5 Flux de Paiement

1. Fan clique "Offrir"
2. Redirection vers Stripe Checkout (montant de l'ite + 5% exclu processing fee)
3. Paiement validé → **Transfert d'argent** au créateur
4. Notification par mail au créateur ("🎁 @fan vous a offert un MacBook!")
5. Item marqué comme "Offert" si quantité max atteinte

**Aucune logistique** : Pas d'adresse de livraison, c'est un transfert pur.

### 11.6 Commission

- Commission EXCLU identique aux autres ventes
- Le créateur reçoit le montant moins les frais habituels


l'ui générale doit être simple et facile d'utilisation, très visuelle et imagée, un peut gamifiée. Cela doit correspondre à l'identité de la marque, comme sur le reste que la plateforme.

---

## 12. Panel Agence

### 12.1 Description Fonctionnelle

Interface dédiée pour les agences gérant plusieurs créateurs. Accès aux performances, profils et équipe de chatters.

### 12.2 Définition d'une Agence

> Un compte devient une **agence** dès qu'il gère **plus d'un profil créateur**.

Pas de statut "agence" à activer : c'est automatique.

### 12.3 Tarification Agence

| Situation | Coût mensuel |
|-----------|--------------|
| 1 profil | Plan Free ou Premium standard |
| 2 profils | Premium ($39) |
| 3+ profils | Premium + $10 par profil supplémentaire |

### 12.4 Dashboard Agence

```
┌─────────────────────────────────────────────────────────────┐
│  🏢 Panel Agence                    [@agency_name]          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 VUE D'ENSEMBLE                                         │
│  ┌────────────┬────────────┬────────────┬────────────┐     │
│  │ Revenus    │ Ventes     │ Visites    │ Conversion │     │
│  │ $12,450    │ 892        │ 45,200     │ 1.97%      │     │
│  │ +15% ▲     │ +23% ▲     │ +8% ▲      │ +0.2% ▲    │     │
│  └────────────┴────────────┴────────────┴────────────┘     │
│                                                             │
│  👥 MES PROFILS (5)                     [+ Nouveau profil]  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [Pic] @girl1  │ $4,200 │ 180 ventes │ [Gérer] [Chat]│  │
│  │ [Pic] @girl2  │ $3,100 │ 142 ventes │ [Gérer] [Chat]│  │
│  │ [Pic] @girl3  │ $2,500 │ 98 ventes  │ [Gérer] [Chat]│  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  👨‍💼 ÉQUIPE CHATTERS                     [+ Inviter]        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Marie   │ 5 profils │ En ligne │ 12 convos actives  │  │
│  │ Pierre  │ 3 profils │ Hors ligne │ —                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 12.5 Fonctionnalités Clés

| Fonction | Description |
|----------|-------------|
| Vue consolidée | Revenus/stats de tous les profils |
| Vue par profil | Détail individuel par profil |
| Gestion équipe | Inviter/révoquer des chatters |
| Branding agence | Logo agence sur les profils (premium) |
| Notifications | Alertes temps réel de tous les profils |

### 12.6 Branding Agence (Premium)

Les agences premium peuvent personnaliser l'apparence des profils qu'elles gèrent :

**Options disponibles** :
- Logo agence en footer de la page publique
- Mention "Managed by [Agency Name]"
- Couleur d'accent agence (optionnelle)
- Lien vers la page agence dans le directory

**Affichage** :
```
┌─────────────────────────────────────────┐
│           [Page du créateur]            │
│              ...                        │
├─────────────────────────────────────────┤
│  Managed by 🏢 TopModels Agency         │
│  [Logo]                                 │
└─────────────────────────────────────────┘
```

**Contrôle** : Le créateur peut désactiver l'affichage du branding agence sur sa page

---

## 13. Chatting System — Centre de Vente Humain

### 13.1 Description Fonctionnelle

Le chat devient un **canal de vente** géré par des chatters (humains). Les chatters peuvent gérer plusieurs profils et plusieurs conversations simultanément.

### 13.2 Flow d'Onboarding Chatter

#### Option Créateur : Activer le Chatting Externe

Durant l'onboarding ou dans les settings :

```
┌─────────────────────────────────────────────────────────────┐
│  💬 Gestion du Chat                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ○ Je gère moi-même mes conversations                       │
│                                                             │
│  ● Laisser une équipe de chatters gérer mes conversations   │
│    → Décrivez-vous pour aider les chatters :               │
│    ┌─────────────────────────────────────────────────────┐ │
│    │ Je suis Emma, 25 ans, fitness model basée à Miami.  │ │
│    │ Mon style est plutôt friendly et taquin...          │ │
│    └─────────────────────────────────────────────────────┘ │
│                                                             │
│    ⚠️ Commission chatting : 40% sur les ventes chat       │
│    (Vous gardez 45%, EXCLU 15%)                            │
│                                                             │
│  [Sauvegarder]                                              │
└─────────────────────────────────────────────────────────────┘
```

### 13.3 Répartition des Revenus (Vente via Chat)

| Partie | Pourcentage |
|--------|-------------|
| Créateur | 45% |
| Agence/Chatter | 25% |
| EXCLU | 15% |
| Processing (Stripe) | ~5% |

**Versement** : Directement sur les comptes Stripe respectifs via Split Payment.

### 13.4 Interface Chatter

#### Layout Principal

```
┌─────────────────────────────────────────────────────────────────────┐
│  💬 Centre de Chat              [@chatter_name] │ 12 actives │ 🔔 3│
├──────────────────────┬──────────────────────────────────────────────┤
│                      │                                              │
│  CONVERSATIONS       │  CONVERSATION ACTIVE                         │
│  ┌────────────────┐  │  ┌────────────────────────────────────────┐ │
│  │ 📍 @girl1      │  │  │  Fan: @john_doe                       │ │
│  │ ┌────────────┐ │  │  │  Profil: @girl1                       │ │
│  │ │🔴 John     │ │  │  ├────────────────────────────────────────┤ │
│  │ │ Hey babe   │ │  │  │                                        │ │
│  │ │────────────│ │  │  │  John: Hey babe, I love your content   │ │
│  │ │ Mike       │ │  │  │                                        │ │
│  │ │ Thanks!    │ │  │  │  You: Thank you! 💕                    │ │
│  │ └────────────┘ │  │  │                                        │ │
│  │                │  │  │  John: Do you have anything special?   │ │
│  │ 📍 @girl2      │  │  │                                        │ │
│  │ ┌────────────┐ │  │  ├────────────────────────────────────────┤ │
│  │ │ Sarah      │ │  │  │ [Message...               ] [📎] [💰] │ │
│  │ └────────────┘ │  │  └────────────────────────────────────────┘ │
│  └────────────────┘  │                                              │
├──────────────────────┴──────────────────────────────────────────────┤
│  ⚡ ACTIONS RAPIDES                                                 │
│  [Envoyer contenu payant $__] [Envoyer tip link] [Classer ce fan]  │
└─────────────────────────────────────────────────────────────────────┘
```

### 13.5 Fonctionnalités Chatter

#### Messages Enrichis

```
Insérer dans le chat :
├── 📷 Contenu payant (avec prix)
├── 💰 Lien de tip
├── 🎁 Lien wishlist
└── 📎 Fichier/Image gratuit
```

#### Classification des Fans

```
Tags disponibles :
├── 🔥 High spender
├── 💎 VIP
├── 🆕 Nouveau
├── ⏳ À relancer
├── 🚫 Bloqué
└── [Custom tags...]
```

#### Message de Masse

```
┌─────────────────────────────────────────────────────────────┐
│  📢 Message de Masse                                        │
├─────────────────────────────────────────────────────────────┤
│  Destinataires :                                            │
│  ○ Tous mes fans                                            │
│  ○ Fans avec tag : [High spender ▼]                         │
│  ○ Fans actifs dans les [7] derniers jours                  │
│                                                             │
│  Message :                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Hey babe! 💕 New exclusive content just dropped...  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ☐ Inclure un contenu payant [$__]                         │
│                                                             │
│  [Prévisualiser] [Envoyer à 342 fans]                      │
└─────────────────────────────────────────────────────────────┘
```

### 13.6 Système de Claim (Attribution des Conversations)

Lorsqu'un fan initie une conversation, le système fonctionne ainsi :

```
FAN envoie message → Notification à TOUS les chatters disponibles
                          ↓
                    Premier chatter qui clique "Prendre en charge"
                          ↓
                    Conversation assignée à CE chatter
                          ↓
                    Autres chatters ne voient plus cette conversation
```

**Interface de Claim** :
```
┌─────────────────────────────────────────────────────────────┐
│  🔔 NOUVELLES CONVERSATIONS (3)              [Actualiser]   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │ @girl1 — Nouveau fan                      [⏱️ 2 min]   ││
│  │ "Hey, I love your content!"                            ││
│  │                           [Prendre en charge 🙋]       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 13.7 Gestion des Conversations (Statuts & Organisation)

**Indicateurs de Statut** :
| Indicateur | Signification |
|------------|---------------|
| 🔴 Non lu | Message(s) non lu(s) |
| ⚪ Lu | Tous messages lus |
| 🟢 En ligne | Fan actuellement connecté |
| 📌 Épinglé | Conversation prioritaire |
| ⏳ En attente | Réponse attendue du fan |

**Actions sur les Conversations** :
- **Pin/Unpin** : Épingler en haut de la liste
- **Marquer lu/non-lu** : Gestion du statut manuellement
- **Archiver** : Retirer de la liste active
- **Transférer** : Passer à un autre chatter

### 13.8 Règles Automatiques

| Règle | Action |
|-------|--------|
| Inactivité 24h | Notification au chatter |
| Inactivité 72h | Conversation archivée automatiquement |
| Fan en ligne | Badge vert + notification optionnelle |
| Nouveau message | Notification push |

### 13.9 Historique & Audit

- Toutes les conversations sont **conservées** indéfiniment
- Accessibles par le créateur ET l'agence
- Export possible (compliance/litige)

### 13.8 Implications Techniques

- **Supabase Realtime** : WebSockets pour le temps réel
- **Notifications Push** : Service worker + push API
- **Split Payment Stripe** : Distribution automatique des revenus
- **Tables** :

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  fan_id UUID REFERENCES auth.users(id),
  profile_id UUID REFERENCES creator_profiles(id),
  assigned_chatter_id UUID,
  status TEXT DEFAULT 'active',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  sender_type TEXT CHECK (sender_type IN ('fan', 'chatter')),
  sender_id UUID,
  content TEXT,
  content_type TEXT DEFAULT 'text', -- text, paid_content, tip_link, etc.
  paid_content_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fan_tags (
  id UUID PRIMARY KEY,
  fan_id UUID REFERENCES auth.users(id),
  profile_id UUID REFERENCES creator_profiles(id),
  tag TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Annexes

### A. Récapitulatif des Décisions Requises

| # | Sujet | Options | Recommandation |
|---|-------|---------|----------------|
| 1 | Deep Link Premium | A: Custom slug / B: Domaine custom / C: Lien raccourci | Option A |
| 2 | Architecture Blog | A: CMS externe / B: Supabase custom / C: Markdown files | Option B |
| 3 | Limite multi-profils agence | Nombre max de profils par agence | Pas de limite (facturation par profil) |

### B. Stack Technique Recommandée

| Composant | Technologie |
|-----------|-------------|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS + CSS Variables (thèmes) |
| Backend | Supabase (Auth, DB, Storage, Realtime, Edge Functions) |
| Paiement | Stripe Connect (Express) |
| Emails | Resend ou Postmark |
| SEO/SSR | Next.js ou Remix (pour pages SEO) |
| Hosting | Vercel |

### C. Priorité d'Implémentation Suggérée

1. **Phase 1** : Mode Jour/Nuit + Link in Bio Éditeur
2. **Phase 2** : Multi-Profils + URLs simplifiées
3. **Phase 3** : Wishlist & Tips + Custom Requests
4. **Phase 4** : Panel Agence + Chatting System
5. **Phase 5** : Directory & Blog (SEO)
6. **Phase 6** : Programme Affiliation + Stripe International

---

*Document généré le 3 février 2026*
*Version 2.0 — Cahier des Charges Final EXCLU*
