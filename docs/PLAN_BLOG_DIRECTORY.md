# Plan de Développement — Blog & Directory (Pôle SEO)

> **Version**: 1.0  
> **Date**: 2026-03-23  
> **Statut**: En attente de validation  
> **Scope**: Section 9 du Cahier des Charges V2

---

## Table des matières

1. [Analyse de l'architecture existante](#1-analyse-de-larchitecture-existante)
2. [Décision architecturale SEO](#2-décision-architecturale-seo)
3. [Structure des URLs](#3-structure-des-urls)
4. [Schéma de base de données](#4-schéma-de-base-de-données)
5. [API Routes Vercel (SSR / SEO)](#5-api-routes-vercel-ssr--seo)
6. [CMS Admin (Interface de gestion)](#6-cms-admin-interface-de-gestion)
7. [Pages publiques Blog](#7-pages-publiques-blog)
8. [Pages publiques Directory](#8-pages-publiques-directory)
9. [SEO Technique](#9-seo-technique)
10. [Performance & Lighthouse](#10-performance--lighthouse)
11. [Gestion des erreurs & edge cases](#11-gestion-des-erreurs--edge-cases)
12. [Plan d'exécution par phases](#12-plan-dexécution-par-phases)
13. [Dépendances & packages](#13-dépendances--packages)

---

## 1. Analyse de l'architecture existante

### Stack actuelle
- **Frontend**: Vite + React 18 + TypeScript (SPA)
- **Styling**: Tailwind CSS 3 + shadcn/ui + Framer Motion + GSAP
- **Routing**: react-router-dom v6 (client-side)
- **Hosting**: Vercel (avec serverless functions)
- **DB**: Supabase (PostgreSQL + RLS + Edge Functions)
- **SEO actuel**: `api/og-proxy.ts` — Vercel function qui injecte les meta OG dans `index.html` pour les crawlers et social sharing

### Contraintes identifiées
1. **SPA = pas de SSR natif** — Le contenu est rendu côté client après chargement du bundle JS
2. **`og-proxy.ts` existe déjà** — Pattern éprouvé pour injecter du contenu côté serveur dans le HTML
3. **Routes `/:handle`** — Catch-all en fin de router pour les profils créateurs → tout nouveau préfixe (`/blog`, `/directory`) doit être déclaré AVANT
4. **`vercel.json` rewrites** — Ordre séquentiel, les routes blog/directory doivent être ajoutées avant `/:handle`
5. **Admin existant** — `/admin/users` avec `AdminRoute` component et edge function `admin-get-users`

### Points forts exploitables
- `og-proxy.ts` peut être étendu pour injecter le contenu complet des articles (pas juste les meta tags)
- Le design system (glass effects, grid pattern, animations Framer Motion) est bien structuré et réutilisable
- L'admin panel a un pattern clair (AdminRoute + edge functions + AppShell)
- Supabase Storage est déjà utilisé pour les assets → réutilisable pour les images blog

---

## 2. Décision architecturale SEO

### Le problème fondamental
Un SPA ne sert que du HTML vide (`<div id="root">`) au premier chargement. Google peut rendre le JS, mais :
- L'indexation est **plus lente** (render queue)
- Le **LCP** (Largest Contentful Paint) est élevé (attente JS + API)
- Les **Core Web Vitals** en souffrent
- Les articles de blog ont besoin d'être indexés **immédiatement** et **de manière fiable**

### Solution retenue : SSR hybride via Vercel API Routes

```
┌─────────────────────────────────────────────────────────────┐
│                    REQUÊTE ENTRANTE                         │
│                   /blog/mon-article                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              vercel.json rewrite                            │
│         /blog/:slug → api/blog-ssr                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           api/blog-ssr.ts (Vercel Function)                 │
│                                                             │
│  1. Fetch article depuis Supabase (REST API)                │
│  2. Générer HTML complet :                                  │
│     - <head> : title, meta, OG, Twitter, canonical,         │
│       Schema.org JSON-LD                                    │
│     - <body> : contenu article intégral en HTML sémantique  │
│       + navigation + footer                                 │
│     - <link> vers CSS Tailwind (même bundle que le SPA)     │
│     - <script> minimal pour navigation interne              │
│  3. Cache-Control: public, s-maxage=3600                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  HTML COMPLET SERVI                          │
│                                                             │
│  ✅ Contenu visible sans JS (LCP instantané)                │
│  ✅ Meta tags SEO dans le HTML initial                      │
│  ✅ Schema.org pour rich snippets                           │
│  ✅ Indexation immédiate par Google                          │
│  ✅ UI cohérente avec la landing page (même CSS Tailwind)   │
│  ✅ Pas de bundle React à charger pour afficher le contenu  │
└─────────────────────────────────────────────────────────────┘
```

### Pourquoi PAS garder le SPA pour les pages blog publiques ?

| Critère | SPA (React) | SSR (Vercel Function) |
|---------|-------------|----------------------|
| LCP | ~2-4s (JS + API) | ~200-500ms |
| Indexation Google | Différée (render queue) | Immédiate |
| Core Web Vitals | Médiocre | Excellent |
| Taille du bundle | ~300KB+ JS | ~5KB HTML |
| Animations | Framer Motion | CSS animations natives |
| Interactivité | Complète | Minimale (liens, nav) |
| Maintenance | Même codebase | Template HTML séparé |

**Verdict** : Les pages articles individuelles (`/blog/:slug`) sont servies en **SSR pur** via Vercel Functions. Les pages de listing (`/blog`, `/blog/category/:slug`) sont aussi SSR pour un SEO maximal. L'admin CMS reste dans le SPA.

### Pour les pages Directory

Les pages directory (`/directory/creators`, etc.) nécessitent de l'interactivité (filtres, recherche, pagination). Deux approches :
- **Directory listing** → SSR avec les premiers résultats + lien vers SPA pour filtres avancés
- **Pages individuelles** (agence, outil) → SSR complet

**Décision** : Les pages directory listings sont servies en **SPA** (avec meta injection via og-proxy étendu) car l'interactivité est prioritaire. Les pages individuelles d'agences sont en **SSR**.

---

## 3. Structure des URLs

### Principes SEO appliqués
- URLs **courtes et lisibles** (pas d'IDs, pas de nesting inutile)
- **Flat structure** pour les articles (comme Ahrefs, HubSpot, Backlinko)
- **Préfixe clair** pour éviter les conflits avec `/:handle`
- **Slugs auto-générés** à partir du titre, éditables manuellement

### Routes Blog

| URL | Type | Rendu | Description |
|-----|------|-------|-------------|
| `/blog` | Listing | SSR | Page d'accueil blog (derniers articles, catégories) |
| `/blog/:slug` | Article | SSR | Article individuel |
| `/blog/category/:slug` | Listing | SSR | Articles d'une catégorie |

### Routes Directory

| URL | Type | Rendu | Description |
|-----|------|-------|-------------|
| `/directory` | Hub | SPA | Page hub directory (liens vers sous-sections) |
| `/directory/creators` | Listing | SPA | Annuaire créateurs (filtres interactifs) |
| `/directory/agencies` | Listing | SPA | Annuaire agences |
| `/directory/agencies/:slug` | Detail | SSR | Page agence individuelle |
| `/directory/tools` | Listing | SPA | Comparatifs outils |
| `/directory/tools/:slug` | Detail | SSR | Comparatif individuel |

### Routes Admin (CMS)

| URL | Type | Description |
|-----|------|-------------|
| `/admin/blog` | SPA | Liste des articles (draft, published, scheduled) |
| `/admin/blog/new` | SPA | Éditeur WYSIWYG — créer un article |
| `/admin/blog/:id/edit` | SPA | Éditeur WYSIWYG — modifier un article |
| `/admin/agencies` | SPA | Gestion des agences (lister/masquer) |
| `/admin/tools` | SPA | Gestion des comparatifs outils |

### Impact sur vercel.json

Les routes blog/directory SSR doivent être ajoutées **avant** le catch-all `/:handle` :

```jsonc
{
  "rewrites": [
    // ... routes existantes (auth, app, etc.) ...
    
    // Blog SSR routes (AVANT /:handle)
    { "source": "/blog", "destination": "/api/blog-ssr" },
    { "source": "/blog/category/:slug", "destination": "/api/blog-ssr" },
    { "source": "/blog/:slug", "destination": "/api/blog-ssr" },
    
    // Directory SSR routes
    { "source": "/directory/agencies/:slug", "destination": "/api/directory-ssr" },
    { "source": "/directory/tools/:slug", "destination": "/api/directory-ssr" },
    
    // Directory SPA routes
    { "source": "/directory", "destination": "/index.html" },
    { "source": "/directory/:path*", "destination": "/index.html" },
    
    // Admin CMS routes (SPA)
    { "source": "/admin/:path*", "destination": "/index.html" },
    
    // ⚠️ APRÈS — catch-all handle
    { "source": "/:handle", "destination": "/api/og-proxy" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Impact sur App.tsx (React Router)

Les routes SPA directory et admin doivent être ajoutées **avant** `/:handle` :

```tsx
// Blog routes → NOT in React Router (served by Vercel SSR)
// Directory SPA routes
<Route path="/directory" element={<DirectoryHub />} />
<Route path="/directory/creators" element={<DirectoryCreators />} />
<Route path="/directory/agencies" element={<DirectoryAgencies />} />
<Route path="/directory/tools" element={<DirectoryTools />} />

// Admin CMS routes
<Route path="/admin/blog" element={<AdminRoute><AdminBlog /></AdminRoute>} />
<Route path="/admin/blog/new" element={<AdminRoute><AdminBlogEditor /></AdminRoute>} />
<Route path="/admin/blog/:id/edit" element={<AdminRoute><AdminBlogEditor /></AdminRoute>} />
<Route path="/admin/agencies" element={<AdminRoute><AdminAgencies /></AdminRoute>} />
<Route path="/admin/tools" element={<AdminRoute><AdminTools /></AdminRoute>} />

// ⚠️ APRÈS — catch-all
<Route path="/:handle" element={<CreatorPublic />} />
```

---

## 4. Schéma de base de données

### Table `blog_categories`

```sql
CREATE TABLE blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,           -- 'guides', 'industry-news', 'comparisons'
  name text NOT NULL,                   -- 'Guides', 'Industry News', 'Comparisons'
  description text,                     -- Description pour la page catégorie
  meta_title text,                      -- SEO title override
  meta_description text,                -- SEO description override
  sort_order integer DEFAULT 0,         -- Ordre d'affichage
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Table `blog_articles`

```sql
CREATE TABLE blog_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Contenu
  slug text UNIQUE NOT NULL,            -- URL slug (auto-generated, editable)
  title text NOT NULL,                  -- Titre de l'article
  excerpt text,                         -- Résumé court (utilisé en listing + meta description fallback)
  content jsonb NOT NULL DEFAULT '{}',  -- Contenu Tiptap JSON (rich text)
  content_html text,                    -- HTML pré-rendu du contenu (pour SSR, généré à la sauvegarde)
  cover_image_url text,                 -- Image de couverture
  cover_image_alt text,                 -- Alt text de l'image de couverture
  
  -- Classification
  category_id uuid REFERENCES blog_categories(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',             -- Tags libres (array text)
  
  -- SEO
  meta_title text,                      -- Title tag override (< 60 chars)
  meta_description text,                -- Meta description override (< 160 chars)
  canonical_url text,                   -- Canonical URL override
  og_image_url text,                    -- OG image override (fallback → cover_image_url)
  focus_keyword text,                   -- Mot-clé principal ciblé
  
  -- Publication
  status text NOT NULL DEFAULT 'draft'  -- 'draft', 'published', 'scheduled', 'archived'
    CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  published_at timestamptz,             -- Date de publication effective
  scheduled_at timestamptz,             -- Date de publication programmée
  
  -- Metadata
  author_name text DEFAULT 'Exclu Team',-- Nom de l'auteur affiché
  reading_time_minutes integer,         -- Temps de lecture estimé (auto-calculé)
  view_count integer DEFAULT 0,         -- Compteur de vues
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_blog_articles_status ON blog_articles(status);
CREATE INDEX idx_blog_articles_slug ON blog_articles(slug);
CREATE INDEX idx_blog_articles_category ON blog_articles(category_id);
CREATE INDEX idx_blog_articles_published_at ON blog_articles(published_at DESC);
CREATE INDEX idx_blog_articles_status_published ON blog_articles(status, published_at DESC)
  WHERE status = 'published';
```

### Table `agencies`

```sql
CREATE TABLE agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,            -- URL slug
  name text NOT NULL,
  logo_url text,
  description text,                     -- Présentation
  website_url text,
  contact_email text,
  
  -- Classification
  country text NOT NULL,
  city text,
  services text[] DEFAULT '{}',         -- 'management', 'marketing', 'content-creation', etc.
  
  -- Relations
  creator_profile_ids uuid[] DEFAULT '{}', -- IDs des creator_profiles gérés
  
  -- SEO
  meta_title text,
  meta_description text,
  
  -- Gestion
  is_visible boolean DEFAULT true,      -- Masqué/visible par l'admin
  is_featured boolean DEFAULT false,    -- Mis en avant
  sort_order integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_agencies_visible ON agencies(is_visible) WHERE is_visible = true;
CREATE INDEX idx_agencies_country ON agencies(country);
CREATE INDEX idx_agencies_slug ON agencies(slug);
```

### Table `tool_comparisons`

```sql
CREATE TABLE tool_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,            -- 'exclu-vs-onlyfans'
  title text NOT NULL,                  -- 'Exclu vs OnlyFans'
  tool_name text NOT NULL,              -- 'OnlyFans'
  tool_logo_url text,
  tool_website text,
  
  -- Contenu du comparatif
  content jsonb NOT NULL DEFAULT '{}',  -- Tiptap JSON
  content_html text,                    -- HTML pré-rendu
  
  -- Données structurées du comparatif
  comparison_data jsonb DEFAULT '{}',   -- { features: [{name, exclu, competitor, winner}] }
  
  -- SEO
  meta_title text,
  meta_description text,
  focus_keyword text,
  
  -- Gestion
  is_visible boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tool_comparisons_visible ON tool_comparisons(is_visible) WHERE is_visible = true;
CREATE INDEX idx_tool_comparisons_slug ON tool_comparisons(slug);
```

### Table `blog_article_views` (Analytics)

```sql
CREATE TABLE blog_article_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now(),
  referrer text,                        -- D'où vient le visiteur
  country text,
  device_type text                      -- 'mobile', 'desktop', 'tablet'
);

CREATE INDEX idx_blog_views_article ON blog_article_views(article_id, viewed_at DESC);
```

### RLS Policies

```sql
-- blog_categories: lecture publique, écriture admin seulement
ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_categories_public_read" ON blog_categories
  FOR SELECT USING (true);

-- blog_articles: lecture publique pour published, écriture admin seulement
ALTER TABLE blog_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_articles_public_read" ON blog_articles
  FOR SELECT USING (status = 'published' AND published_at <= now());
-- Note: les opérations d'écriture passent par des Edge Functions admin
-- qui utilisent le service_role_key

-- agencies: lecture publique des visibles, écriture admin
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agencies_public_read" ON agencies
  FOR SELECT USING (is_visible = true);

-- tool_comparisons: lecture publique des visibles, écriture admin
ALTER TABLE tool_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tool_comparisons_public_read" ON tool_comparisons
  FOR SELECT USING (is_visible = true);

-- blog_article_views: insertion publique (anonyme), lecture admin
ALTER TABLE blog_article_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_views_insert" ON blog_article_views
  FOR INSERT WITH CHECK (true);
```

### Storage Bucket

```sql
-- Bucket pour les images du blog
INSERT INTO storage.buckets (id, name, public) VALUES ('blog-images', 'blog-images', true);

-- Policy: lecture publique
CREATE POLICY "blog_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'blog-images');

-- Policy: upload admin seulement (via Edge Function avec service_role_key)
```

### Modifications sur tables existantes

Ajouter sur `creator_profiles` pour le directory :

```sql
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS niche text;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS is_directory_visible boolean DEFAULT true;
-- Le directory utilise les colonnes existantes : username, display_name, avatar_url, bio, country, location
-- is_creator_subscribed (via profiles) détermine le statut premium
```

---

## 5. API Routes Vercel (SSR / SEO)

### `api/blog-ssr.ts` — Rendu SSR des pages blog

Cette Vercel Function est le cœur du SEO blog. Elle génère du HTML complet pour chaque page blog.

#### Fonctionnement

```
Requête → Détection du type de page → Fetch Supabase → Génération HTML → Réponse cachée
```

#### Types de pages gérés

1. **`/blog`** → Page d'accueil blog
   - Fetch derniers articles publiés (12 premiers)
   - Fetch catégories avec compteurs
   - Render listing avec cartes articles

2. **`/blog/category/:slug`** → Page catégorie
   - Fetch articles de la catégorie (pagination)
   - Render listing avec description catégorie

3. **`/blog/:slug`** → Article individuel
   - Fetch article complet (`content_html`)
   - Render article avec toutes les meta SEO
   - Schema.org Article + BreadcrumbList
   - Table des matières auto-générée
   - Articles liés en bas de page

#### Template HTML

Le template utilise :
- **CSS Tailwind inline** (les classes critiques sont incluses dans un `<style>` dans le `<head>`)
- **Police Manrope** (même que le SPA)
- **Palette Exclu** (variables CSS du SPA)
- **Grid pattern + glow effects** en CSS pur (pas de Framer Motion côté serveur)
- **Navigation** avec liens vers `/`, `/blog`, catégories, `/auth`
- **Footer** identique au SPA

#### Caching

```
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
```
- CDN cache de 1h
- Stale-while-revalidate de 24h (sert le cache pendant le refresh)
- Purge manuelle via l'admin lors de la modification d'un article

#### Animations CSS (pas de JS)

Pour maintenir l'esthétique Exclu sans bundle JS :
- `@keyframes fade-in` pour l'apparition des éléments
- `animation-delay` progressif pour l'effet de cascade
- `backdrop-filter: blur()` pour les effets glass
- `background-image` pour le grid pattern
- `:hover` transitions pour les cartes

### `api/directory-ssr.ts` — Rendu SSR des pages directory individuelles

Même pattern que blog-ssr, pour :
- `/directory/agencies/:slug` → Page agence
- `/directory/tools/:slug` → Page comparatif

### `api/sitemap.ts` — Sitemap XML dynamique

```
GET /sitemap.xml → api/sitemap.ts
```

Génère un sitemap XML incluant :
- Pages statiques (`/`, `/blog`, `/auth`, `/contact`, etc.)
- Tous les articles publiés (`/blog/:slug`) avec `lastmod`
- Toutes les catégories blog (`/blog/category/:slug`)
- Toutes les agences visibles (`/directory/agencies/:slug`)
- Tous les comparatifs visibles (`/directory/tools/:slug`)
- Tous les profils créateurs (`/:handle`) — les premium d'abord

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://exclu.at/blog</loc>
    <lastmod>2026-03-23</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://exclu.at/blog/how-to-sell-content-online</loc>
    <lastmod>2026-03-20</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  ...
</urlset>
```

Cache: `s-maxage=3600` (1h)

### `api/rss.ts` — Flux RSS

```
GET /rss.xml → api/rss.ts
```

Flux RSS 2.0 standard pour les agrégateurs.

### `api/blog-track-view.ts` — Tracking des vues articles

Endpoint POST appelé par le HTML SSR via un `<img>` pixel ou `navigator.sendBeacon` minimal :
- Incrémente `blog_articles.view_count`
- Insère dans `blog_article_views` avec referrer et device type
- Rate limiting basique (1 vue / IP / article / 30 min)

---

## 6. CMS Admin (Interface de gestion)

### Vue d'ensemble

L'admin CMS est intégré dans le SPA existant, sous le wrapper `AdminRoute` qui vérifie `profiles.is_admin = true`.

### Éditeur WYSIWYG — Tiptap

**Package choisi : `@tiptap/react`** (Notion-like, extensible, excellent avec React)

#### Extensions Tiptap

```
@tiptap/starter-kit          — Bold, italic, lists, headings, code, blockquote
@tiptap/extension-image       — Images inline
@tiptap/extension-link        — Liens
@tiptap/extension-placeholder — Placeholder text
@tiptap/extension-underline   — Underline
@tiptap/extension-text-align  — Alignement
@tiptap/extension-table       — Tableaux (utile pour comparatifs)
@tiptap/extension-youtube     — Embeds YouTube
@tiptap/extension-highlight   — Surlignage
@tiptap/extension-color       — Couleur de texte
```

#### Fonctionnalités de l'éditeur

1. **Barre d'outils flottante** (bubble menu) sur sélection de texte
2. **Slash commands** (`/` pour insérer des blocs : heading, image, quote, table, divider)
3. **Drag & drop** pour réorganiser les blocs
4. **Image upload** : drag & drop dans l'éditeur → upload Supabase Storage → URL insérée
5. **Preview mode** : toggle entre édition et preview rendu final
6. **Auto-save** : sauvegarde toutes les 30s en mode draft

#### Panneau SEO

À droite de l'éditeur (ou en bas sur mobile) :

```
┌─────────────────────────────────┐
│  SEO Settings                   │
├─────────────────────────────────┤
│  Meta Title                     │
│  ┌────────────────────────────┐ │
│  │ How to sell content...     │ │
│  └────────────────────────────┘ │
│  42/60 characters ✅            │
│                                 │
│  Meta Description               │
│  ┌────────────────────────────┐ │
│  │ Learn the best strategies  │ │
│  │ to sell exclusive...       │ │
│  └────────────────────────────┘ │
│  128/160 characters ✅          │
│                                 │
│  Focus Keyword                  │
│  ┌────────────────────────────┐ │
│  │ sell content online        │ │
│  └────────────────────────────┘ │
│                                 │
│  URL Slug                       │
│  /blog/                         │
│  ┌────────────────────────────┐ │
│  │ how-to-sell-content-online │ │
│  └────────────────────────────┘ │
│  ✅ Slug available              │
│                                 │
│  Canonical URL (optional)       │
│  ┌────────────────────────────┐ │
│  │                            │ │
│  └────────────────────────────┘ │
│                                 │
│  OG Image                       │
│  [📷 Upload] or use cover image│
│                                 │
│  ── SEO Score ──                │
│  ✅ Title has focus keyword     │
│  ✅ Description length OK       │
│  ⚠️ Add more internal links    │
│  ✅ Image has alt text          │
│  Score: 8/10                    │
└─────────────────────────────────┘
```

#### Page `/admin/blog` — Liste des articles

```
┌─────────────────────────────────────────────────────────────┐
│  📝 Blog Management                    [+ New Article]      │
├─────────────────────────────────────────────────────────────┤
│  [All] [Published] [Draft] [Scheduled] [Archived]           │
│                                                             │
│  🔍 Search...                                               │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 📄 How to Sell Content Online          [Published]      ││
│  │    /blog/how-to-sell-content-online                     ││
│  │    Guides • 1,234 views • Mar 15, 2026                  ││
│  │    [Edit] [View] [Archive] [⋯]                          ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ 📄 Exclu vs OnlyFans: Complete Guide   [Draft]          ││
│  │    /blog/exclu-vs-onlyfans                              ││
│  │    Comparisons • 0 views • Mar 20, 2026                 ││
│  │    [Edit] [Preview] [Publish] [⋯]                       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

#### Page `/admin/blog/new` et `/admin/blog/:id/edit` — Éditeur

Layout en 2 colonnes (desktop) :
- **Gauche** (70%) : Éditeur Tiptap + titre + excerpt + cover image + catégorie + tags
- **Droite** (30%) : Panel SEO + status + scheduling + actions (Save Draft / Publish / Schedule)

Mobile : stack vertical, panel SEO dans un drawer.

#### Page `/admin/agencies` — Gestion des agences

```
┌─────────────────────────────────────────────────────────────┐
│  🏢 Agencies Management                [+ Add Agency]       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐   │
│  │  🏢 Agency Name         France    [Visible ✅]       │   │
│  │     3 creators managed                               │   │
│  │     [Edit] [Toggle Visibility] [Delete]              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### Page `/admin/tools` — Gestion des comparatifs

Même pattern que les articles mais avec les champs spécifiques au comparatif (tool_name, comparison_data, etc.).

### Edge Functions Admin

#### `admin-blog-manage` — CRUD articles

Opérations :
- `list` — Liste les articles (all statuses pour admin)
- `get` — Récupère un article par ID (avec contenu complet)
- `create` — Crée un article (draft)
- `update` — Met à jour un article
- `publish` — Publie (set status='published', published_at=now())
- `schedule` — Programme (set status='scheduled', scheduled_at=X)
- `archive` — Archive
- `delete` — Supprime

Sécurité :
- Vérifie `is_admin` sur le JWT via `x-supabase-auth` (même pattern que `admin-get-users`)
- Utilise `service_role_key` pour bypasser RLS

Auto-calculs à la sauvegarde :
- `content_html` : conversion Tiptap JSON → HTML
- `reading_time_minutes` : calcul basé sur le word count (~200 mots/min)
- `slug` : auto-généré depuis le titre si non fourni

#### `admin-blog-upload-image` — Upload d'images

- Reçoit l'image en base64 ou multipart
- Optimise avec Sharp (resize, WebP conversion)
- Upload dans Supabase Storage bucket `blog-images`
- Retourne l'URL publique

#### `admin-manage-agencies` — CRUD agences

- `list`, `create`, `update`, `delete`, `toggle_visibility`

#### `admin-manage-tools` — CRUD comparatifs outils

- `list`, `create`, `update`, `delete`, `toggle_visibility`

#### `blog-publish-scheduled` — Cron job

Edge Function appelée périodiquement (via Supabase pg_cron ou Vercel Cron) :
```sql
UPDATE blog_articles 
SET status = 'published', published_at = now() 
WHERE status = 'scheduled' AND scheduled_at <= now();
```

---

## 7. Pages publiques Blog

### Design global

Les pages blog SSR reprennent l'esthétique de la landing page :
- **Background** : `#0A0A0F` (exclu-black) avec grid pattern semi-transparent
- **Polices** : Manrope (même que le SPA)
- **Couleurs** : Palette Exclu (cloud, space, arsenic, etc.)
- **Glass effects** : backdrop-blur via CSS
- **Animations** : CSS `@keyframes` (fade-in, slide-in) avec `animation-delay` pour l'effet cascade — pas de JS

### Page `/blog` — Accueil blog

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]           Blog    Creators    Contact     [Sign up] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✨ Exclu Blog                                              │
│  Resources, guides, and insights for content creators       │
│                                                             │
│  [Guides] [Industry News] [Comparisons]   🔍               │
│                                                             │
│  ── FEATURED ──                                             │
│  ┌──────────────────────────────────┐                       │
│  │  [Cover Image]                   │                       │
│  │  How to Sell Content Online      │                       │
│  │  in 2026: Complete Guide         │                       │
│  │  5 min read • Guides             │                       │
│  └──────────────────────────────────┘                       │
│                                                             │
│  ── LATEST ──                                               │
│  ┌────────┐ ┌────────┐ ┌────────┐                           │
│  │ Article│ │ Article│ │ Article│                           │
│  │ Card   │ │ Card   │ │ Card   │                           │
│  └────────┘ └────────┘ └────────┘                           │
│  ┌────────┐ ┌────────┐ ┌────────┐                           │
│  │ Article│ │ Article│ │ Article│                           │
│  │ Card   │ │ Card   │ │ Card   │                           │
│  └────────┘ └────────┘ └────────┘                           │
│                                                             │
│  [Load more]                                                │
│                                                             │
│  ── Footer ──                                               │
└─────────────────────────────────────────────────────────────┘
```

### Page `/blog/:slug` — Article

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]           Blog    Creators    Contact     [Sign up] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Blog > Guides > How to Sell Content Online    (breadcrumb) │
│                                                             │
│  ┌──────────────────────────────────────────────────┐       │
│  │          [Cover Image — full width]              │       │
│  └──────────────────────────────────────────────────┘       │
│                                                             │
│  How to Sell Content Online in 2026:                        │
│  The Complete Guide                                         │
│                                                             │
│  By Exclu Team • March 15, 2026 • 5 min read               │
│                                                             │
│  ┌──────────────────┐                                       │
│  │ TABLE OF CONTENTS│  (auto-generated from H2/H3)         │
│  │ 1. Introduction  │                                       │
│  │ 2. Choose your...│                                       │
│  │ 3. Set up your...│                                       │
│  └──────────────────┘                                       │
│                                                             │
│  [Article content rendered from content_html]               │
│  Rich typography: headings, lists, images, quotes,          │
│  code blocks, tables, embeds                                │
│                                                             │
│  ── Related Articles ──                                     │
│  ┌────────┐ ┌────────┐ ┌────────┐                           │
│  │ Related│ │ Related│ │ Related│                           │
│  └────────┘ └────────┘ └────────┘                           │
│                                                             │
│  ── CTA ──                                                  │
│  Ready to start selling? [Create your Exclu for free →]     │
│                                                             │
│  ── Footer ──                                               │
└─────────────────────────────────────────────────────────────┘
```

### Typographie article (prose)

Utilise `@tailwindcss/typography` (déjà en devDependencies) pour un rendu prose optimal :
- Headings : H1 exclu-cloud, H2 exclu-cloud 2xl, H3 xl
- Paragraphes : exclu-space, line-height 1.8
- Liens : underline, hover primary
- Images : rounded-2xl, full-width, lazy loading
- Blockquotes : left-border primary, italic
- Code blocks : bg exclu-phantom, rounded
- Tables : bordered, alternating rows

---

## 8. Pages publiques Directory

### Page `/directory/creators` — Annuaire créateurs (SPA)

Reprend les données de `creator_profiles` avec :
- **Section premium** : Carrousel défilant de cartes créateurs premium (même style que `CreatorsCarousel` de la landing page)
- **Filtres** : Pays, Ville, Niche (dropdown/combobox)
- **Recherche** : Par nom/username
- **Grille** : Cartes créateurs avec avatar, nom, bio courte, niche, localisation
- **Pagination** : Infinite scroll ou "Load more"

Ordre d'affichage :
1. Premium d'abord (badge ✓ Verified)
2. Puis Free par popularité (profile_view_count DESC)

Opt-out : créateurs avec `is_directory_visible = false` exclus.

#### Carte créateur

```
┌─────────────────────────┐
│     [Avatar]            │
│                         │
│   Luna Rose  ✓          │
│   @lunarose             │
│   📍 Paris, France      │
│   🏷️ Lifestyle          │
│                         │
│   [View Profile →]      │
└─────────────────────────┘
```

Au clic → redirige vers `/:handle` (profil public existant).

### Page `/directory/agencies` — Annuaire agences (SPA)

Filtres : Pays, Services proposés
Cartes agences avec logo, nom, pays, nombre de créateurs gérés
Au clic → page SSR `/directory/agencies/:slug`

### Page `/directory/agencies/:slug` — Détail agence (SSR)

- Présentation complète (logo, description, contact)
- Grille des créateurs gérés (cartes clickables vers leurs profils)
- UI similaire à `CreatorPublic.tsx` mais adaptée pour une agence
- Schema.org Organization

### Page `/directory/tools` — Comparatifs outils (SPA)

Grille de cartes comparatives :
```
┌──────────────────────────┐
│  [Exclu Logo] vs [Logo]  │
│  Exclu vs OnlyFans       │
│  See full comparison →   │
└──────────────────────────┘
```

### Page `/directory/tools/:slug` — Comparatif détaillé (SSR)

Tableau comparatif feature-by-feature + analyse éditoriale
Schema.org Product + ComparisonTable

---

## 9. SEO Technique

### Meta Tags (injectés par SSR)

Chaque page SSR inclut :

```html
<!-- Primary -->
<title>{meta_title || title} | Exclu Blog</title>
<meta name="description" content="{meta_description || excerpt}" />
<link rel="canonical" href="https://exclu.at/blog/{slug}" />

<!-- Open Graph -->
<meta property="og:type" content="article" />
<meta property="og:title" content="{title}" />
<meta property="og:description" content="{excerpt}" />
<meta property="og:image" content="{og_image_url || cover_image_url}" />
<meta property="og:url" content="https://exclu.at/blog/{slug}" />
<meta property="og:site_name" content="Exclu" />
<meta property="article:published_time" content="{published_at}" />
<meta property="article:modified_time" content="{updated_at}" />
<meta property="article:section" content="{category_name}" />
<meta property="article:tag" content="{tags.join(',')}" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@exclu_at" />
<meta name="twitter:title" content="{title}" />
<meta name="twitter:description" content="{excerpt}" />
<meta name="twitter:image" content="{og_image_url || cover_image_url}" />

<!-- Robots -->
<meta name="robots" content="index, follow, max-image-preview:large" />
```

### Schema.org JSON-LD

#### Article

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "How to Sell Content Online in 2026",
  "description": "Learn the best strategies...",
  "image": "https://exclu.at/blog-images/cover.webp",
  "author": {
    "@type": "Organization",
    "name": "Exclu",
    "url": "https://exclu.at"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Exclu",
    "logo": {
      "@type": "ImageObject",
      "url": "https://exclu.at/Logo-mini.svg"
    }
  },
  "datePublished": "2026-03-15T10:00:00Z",
  "dateModified": "2026-03-20T14:00:00Z",
  "mainEntityOfPage": "https://exclu.at/blog/how-to-sell-content-online"
}
```

#### BreadcrumbList

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Blog", "item": "https://exclu.at/blog" },
    { "@type": "ListItem", "position": 2, "name": "Guides", "item": "https://exclu.at/blog/category/guides" },
    { "@type": "ListItem", "position": 3, "name": "How to Sell Content Online" }
  ]
}
```

#### FAQ (si l'article contient une section FAQ)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How much does Exclu cost?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Exclu is free to use with a 10% commission..."
      }
    }
  ]
}
```

### Robots.txt

```
GET /robots.txt → static file in /public
```

```
User-agent: *
Allow: /
Disallow: /app/
Disallow: /admin/
Disallow: /auth
Disallow: /onboarding
Disallow: /fan/
Disallow: /api/

Sitemap: https://exclu.at/sitemap.xml
```

### Internal Linking Strategy

- Chaque article contient des liens vers d'autres articles pertinents
- Les articles de comparaison linkent vers `/auth` (CTA d'inscription)
- Les pages catégorie linkent vers les articles
- Le footer de chaque page blog contient des liens vers les catégories principales
- Les pages directory linkent vers les profils créateurs (SEO juice)

### Hreflang (futur)

Préparer la structure pour l'internationalisation :
```html
<link rel="alternate" hreflang="en" href="https://exclu.at/blog/{slug}" />
<link rel="alternate" hreflang="fr" href="https://exclu.at/fr/blog/{slug}" />
```
→ Pas implémenté maintenant mais l'architecture le permet.

---

## 10. Performance & Lighthouse

### Objectifs

| Métrique | Objectif | Stratégie |
|----------|----------|-----------|
| Performance | > 95 | SSR pur, pas de bundle JS lourd |
| Accessibility | > 95 | Sémantique HTML, contrastes, ARIA |
| Best Practices | > 95 | HTTPS, pas de JS vulnérable |
| SEO | 100 | Meta complètes, structured data |

### Optimisations spécifiques

#### LCP (Largest Contentful Paint) — cible < 1.5s
- Contenu HTML complet dans la réponse serveur (pas d'API call côté client)
- Cover image avec `fetchpriority="high"` et `loading="eager"`
- CSS critique inliné dans le `<head>`
- Polices avec `font-display: swap` et `<link rel="preconnect">`

#### CLS (Cumulative Layout Shift) — cible 0
- Dimensions explicites sur toutes les images (`width` + `height`)
- Pas de contenu injecté dynamiquement après le premier rendu
- Polices web avec fallback system font de même métrique

#### INP (Interaction to Next Paint) — cible < 100ms
- Minimal JS sur les pages SSR (juste navigation et tracking)
- Pas de React bundle sur les pages blog publiques
- Event handlers légers

#### Optimisation images
- Conversion WebP automatique à l'upload (via Sharp dans l'Edge Function)
- Responsive images avec `srcset` et `sizes`
- Lazy loading (`loading="lazy"`) pour toutes les images sauf le cover
- Alt text obligatoire (vérifié dans l'éditeur)

#### CSS
- Tailwind CSS : seules les classes utilisées dans les templates SSR sont incluses
- CSS critique inliné, le reste en fichier externe
- Pas de `@import` chains

#### Fonts
- `font-display: swap` pour éviter FOIT
- Preconnect vers Google Fonts
- Subset latin uniquement

---

## 11. Gestion des erreurs & edge cases

### Erreurs SSR

| Scénario | Comportement |
|----------|-------------|
| Article non trouvé (`/blog/slug-inexistant`) | HTML 404 avec message "Article not found" + liens vers blog home et articles populaires |
| Article en draft/archived | 404 (RLS bloque la lecture) |
| Catégorie vide | Page catégorie avec message "No articles yet" + CTA subscribe |
| Erreur Supabase (timeout, 500) | HTML 500 avec message générique + retry en 30s + fallback cache CDN |
| Slug avec caractères spéciaux | Sanitization → 404 si invalide |
| Article programmé (future date) | Non visible tant que `scheduled_at > now()` (RLS) |

### Erreurs CMS Admin

| Scénario | Comportement |
|----------|-------------|
| Slug déjà existant | Erreur inline "This slug is already taken" + suggestion auto |
| Image upload échoue | Toast error + retry button |
| Contenu vide à la publication | Validation bloquante "Article must have content" |
| Titre vide | Validation bloquante |
| Meta title > 60 chars | Warning (pas bloquant) avec indicateur visuel |
| Meta description > 160 chars | Warning avec indicateur visuel |
| Session expirée pendant l'édition | Auto-save draft + prompt re-login |
| Deux admins éditent le même article | Last-write-wins + `updated_at` timestamp check |
| Image trop grande (> 5MB) | Resize automatique côté Edge Function |
| Format image non supporté | Erreur "Supported formats: JPG, PNG, WebP, GIF" |

### Erreurs Directory

| Scénario | Comportement |
|----------|-------------|
| Aucun créateur dans un filtre | "No creators found" + suggestion de modifier les filtres |
| Agence sans créateurs | Affiche la page agence sans section créateurs |
| Agence masquée (`is_visible=false`) | 404 |
| Créateur qui opt-out du directory | Invisible dans les listings, profil public toujours accessible via `/:handle` |

### Edge cases critiques

| Scénario | Solution |
|----------|---------|
| Route `/blog/category` sans slug | Redirect 301 vers `/blog` |
| Route `/blog/` (trailing slash) | Redirect 301 vers `/blog` (pas de duplicate content) |
| Paramètres de pagination invalides | Default page=1, pageSize=12 |
| XSS dans le contenu article | Sanitization HTML lors de la conversion Tiptap → HTML |
| Article avec `content_html` null | Fallback : conversion Tiptap JSON → HTML à la volée dans le SSR |
| Très long article (> 10K mots) | Pagination SSR non nécessaire (HTML stream), lazy load images |

---

## 12. Plan d'exécution par phases

### Phase 1 — Fondations (Priorité: haute)
**Estimation : 2-3 jours**

1. **Migration DB** — Créer toutes les tables (`blog_categories`, `blog_articles`, `agencies`, `tool_comparisons`, `blog_article_views`) + RLS + indexes + seed des catégories par défaut
2. **Storage bucket** — Créer le bucket `blog-images` avec policies
3. **Colonnes creator_profiles** — Ajouter `niche`, `is_directory_visible`
4. **Packages** — Installer Tiptap et extensions
5. **`vercel.json`** — Ajouter les rewrites blog/directory avant `/:handle`
6. **`App.tsx`** — Ajouter les routes admin et directory avant `/:handle`
7. **`robots.txt`** — Mettre à jour dans `/public`
8. **`api/og-proxy.ts`** — Ajouter `/blog` et `/directory` dans `APP_ROUTES` set

### Phase 2 — CMS Admin (Priorité: haute)
**Estimation : 3-4 jours**

1. **Edge Function `admin-blog-manage`** — CRUD complet articles
2. **Edge Function `admin-blog-upload-image`** — Upload + optimization
3. **Page `AdminBlog.tsx`** — Liste des articles avec filtres status
4. **Page `AdminBlogEditor.tsx`** — Éditeur Tiptap + panel SEO + publication
5. **Edge Function `admin-manage-agencies`** — CRUD agences
6. **Page `AdminAgencies.tsx`** — Gestion agences
7. **Edge Function `admin-manage-tools`** — CRUD comparatifs
8. **Page `AdminTools.tsx`** — Gestion comparatifs
9. **Navigation admin** — Ajouter items Blog/Agencies/Tools dans AppShell admin nav

### Phase 3 — Pages Blog SSR (Priorité: haute)
**Estimation : 3-4 jours**

1. **Template HTML SSR** — Template de base avec nav, footer, styles Exclu, grid pattern
2. **`api/blog-ssr.ts`** — Logique SSR complète (home, category, article)
3. **Page article** — Rendu complet avec TOC, related articles, CTA, Schema.org
4. **Page listing** — Cartes articles, catégories, featured
5. **Page catégorie** — Listing filtré avec description
6. **`api/sitemap.ts`** — Sitemap XML dynamique
7. **`api/rss.ts`** — Flux RSS
8. **`api/blog-track-view.ts`** — Tracking des vues

### Phase 4 — Pages Directory SPA (Priorité: moyenne)
**Estimation : 3-4 jours**

1. **`DirectoryHub.tsx`** — Page hub directory
2. **`DirectoryCreators.tsx`** — Annuaire créateurs avec filtres + carrousel premium
3. **`DirectoryAgencies.tsx`** — Annuaire agences avec filtres
4. **`DirectoryTools.tsx`** — Grille comparatifs
5. **`api/directory-ssr.ts`** — SSR pour pages agences et outils individuelles
6. **Navbar mise à jour** — Ajout onglet "Blog" + "Directory" dans la topbar landing

### Phase 5 — Polish & SEO avancé (Priorité: moyenne)
**Estimation : 2 jours**

1. **Publication programmée** — Cron job via `pg_cron` ou Vercel Cron
2. **SEO score dans l'éditeur** — Indicateurs temps réel
3. **Images responsive** — `srcset` generation dans le template SSR
4. **Cache invalidation** — Purge CDN lors de la modification d'un article
5. **Analytics admin** — Dashboard vues articles dans le CMS
6. **Tests Lighthouse** — Vérification des scores, optimisations finales
7. **Footer landing** — Mettre à jour les liens "Blog" et "About" dans `Footer.tsx`

### Phase 6 — Contenu initial (Priorité: basse)
**Estimation : 1 jour (technique) + rédaction**

1. **Seed** — 3 catégories par défaut (Guides, Industry News, Comparisons)
2. **Articles templates** — Créer 2-3 articles modèles pour valider le rendu
3. **Comparatifs templates** — Exclu vs OnlyFans, Exclu vs Fanvue
4. **Agences templates** — 1-2 agences de test

---

## 13. Dépendances & packages

### Nouvelles dépendances à ajouter

```json
{
  "dependencies": {
    "@tiptap/react": "^2.x",
    "@tiptap/starter-kit": "^2.x",
    "@tiptap/extension-image": "^2.x",
    "@tiptap/extension-link": "^2.x",
    "@tiptap/extension-placeholder": "^2.x",
    "@tiptap/extension-underline": "^2.x",
    "@tiptap/extension-text-align": "^2.x",
    "@tiptap/extension-table": "^2.x",
    "@tiptap/extension-table-row": "^2.x",
    "@tiptap/extension-table-cell": "^2.x",
    "@tiptap/extension-table-header": "^2.x",
    "@tiptap/extension-youtube": "^2.x",
    "@tiptap/extension-highlight": "^2.x",
    "@tiptap/extension-color": "^2.x",
    "@tiptap/extension-text-style": "^2.x",
    "@tiptap/pm": "^2.x"
  }
}
```

### Pourquoi Tiptap ?
- **Notion-like UX** — Slash commands, drag & drop, floating toolbar
- **React natif** — Intégration parfaite avec l'écosystème existant
- **JSON output** — Stockage structuré en DB, conversion HTML côté serveur
- **Extensible** — Extensions pour tables, images, embeds, etc.
- **Bien maintenu** — 25K+ stars GitHub, releases régulières
- **Bundle raisonnable** — ~100KB gzipped (seulement chargé dans l'admin)

### Dépendances existantes réutilisées
- `@tailwindcss/typography` — Déjà installé, pour le rendu prose
- `framer-motion` — Pour les animations SPA (directory pages)
- `lucide-react` — Icônes
- `sonner` — Toasts
- `react-dropzone` — Upload d'images
- `sharp` — Déjà en devDependencies, pour l'optimisation d'images dans les Edge Functions

---

## Résumé des fichiers à créer/modifier

### Nouveaux fichiers

```
Migrations DB:
  supabase/migrations/102_blog_tables.sql

API Routes Vercel:
  api/blog-ssr.ts
  api/directory-ssr.ts
  api/sitemap.ts
  api/rss.ts
  api/blog-track-view.ts

Edge Functions Supabase:
  supabase/functions/admin-blog-manage/index.ts
  supabase/functions/admin-blog-upload-image/index.ts
  supabase/functions/admin-manage-agencies/index.ts
  supabase/functions/admin-manage-tools/index.ts
  supabase/functions/blog-publish-scheduled/index.ts

Pages SPA:
  src/pages/AdminBlog.tsx
  src/pages/AdminBlogEditor.tsx
  src/pages/AdminAgencies.tsx
  src/pages/AdminTools.tsx
  src/pages/DirectoryHub.tsx
  src/pages/DirectoryCreators.tsx
  src/pages/DirectoryAgencies.tsx
  src/pages/DirectoryTools.tsx

Components:
  src/components/blog/TiptapEditor.tsx
  src/components/blog/SEOPanel.tsx
  src/components/blog/ArticleCard.tsx
  src/components/blog/BlogNavbar.tsx        (navbar SSR — HTML template)
  src/components/blog/BlogFooter.tsx        (footer SSR — HTML template)
  src/components/directory/CreatorCard.tsx
  src/components/directory/AgencyCard.tsx
  src/components/directory/ToolCard.tsx
  src/components/directory/PremiumCarousel.tsx

Templates SSR:
  src/templates/blog-layout.ts              (functions generating HTML strings)
  src/templates/article-template.ts
  src/templates/listing-template.ts
  src/templates/directory-template.ts

Static:
  public/robots.txt                         (update)
```

### Fichiers existants modifiés

```
vercel.json                    — Ajout rewrites blog/directory
src/App.tsx                    — Ajout routes admin + directory
src/components/AppShell.tsx    — Ajout items nav admin (Blog, Agencies, Tools)
src/components/Navbar.tsx      — Ajout lien "Blog" dans la topbar landing
src/components/Footer.tsx      — Mise à jour liens Company section
api/og-proxy.ts                — Ajout 'blog', 'directory' dans APP_ROUTES
index.html                     — Aucun changement nécessaire
```

---

## Points de décision en attente

1. **Nom de domaine blog** : `/blog` sur exclu.at (recommandé pour SEO) ou `blog.exclu.at` (subdomain) ?  
   → **Recommandation** : `/blog` (même domaine = meilleur link equity)

2. **Auteur des articles** : "Exclu Team" par défaut, ou possibilité d'ajouter des auteurs nommés ?  
   → **Recommandation** : "Exclu Team" pour commencer, extensible plus tard

3. **Commentaires sur les articles** : Pas de système de commentaires prévu. À confirmer.  
   → **Recommandation** : Pas de commentaires (simplicité, pas de modération)

4. **Newsletter** : Formulaire d'abonnement email sur le blog ?  
   → **Recommandation** : Oui, via Brevo (existant), simple formulaire email

5. **Multi-langue** : Articles en français et anglais ?  
   → **Recommandation** : Anglais uniquement pour commencer, architecture prête pour le multi-langue
