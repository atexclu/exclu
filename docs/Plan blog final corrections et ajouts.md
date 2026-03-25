Sur la page blog "They sell with Exclu
Creators who monetize their content on their own terms."
-> Remonte le un peu plus haut
-> L'espace au dessus du titre "guides" sur cette même page aussi réduit le, remonte le tout



Pour le directory :
	•	Possibilité d'ajouter ou de retirer des modèles / agences selon certains critères
	•	Critère (à respecter exactement, n'en oublier aucun) :

OnlyFans Agency Classification Categories

Pricing Structure :
- High Commission (50%+)
- Mid Commission (30–50%)
- Low Commission (<30%)
- Fixed commission (Flat Fee)
Target Market
- Beginner Models
- Mid-Tier Creators
- Top Creators / Celebrities
- Niche Models (e.g. fetish, cosplay)
- AI / Virtual Models

Services Offered :

Full management
Chatting
Marketing

Platform Focus :

Onlyfans
Multi-Platform
Exclu

Geography (localisation)

Growth Strategy
Paid Traffic Focus
Reddit
Twitter
Snapchat
Organic Growth Focus
AI
 Viral Insta / TikTok Strategy
Adult Traffic Sources
 SFS (Shoutouts)

--

Model directory Categories (Updated)
New In

- New models coming from the past 10 days
Trending Now
- 18 Years Old
- College Student
- Teen
- Petite
- Goth
- Alt
- Cosplay
- Pornstar

Type & Look
- Latina
- Asian
- Ebony / Black
- Indian
- Arab
- Hijab
- BBW / Chubby
- MILF / Mature
- Redhead
- Blonde
- Brunette
- Natural
- Skinny
- Girl Next Door
- Amateur

Niche & Kinks
- JOI
- ASMR
- Fetish
- Femdom
- Hairy
- Squirting
- Anal
- Trans
- Femboy
- Feet
- Domination
- Latex / Leather

Features
- Big Tits
- Big Ass
- Tattooed / Inked
- Fitness / Gym
- Pregnant
- Lesbian
- Couple

Experience & Monetization
- Girlfriend Experience
- AI Girlfriend

-> Réaffiche dans la partie admin la partie "users", notamment le menu toggle à côté de blog où il était.

	•	Ajoute la Possibilité de délister ou de catégoriser manuellement un modèle ou une agence affichée dans le directory, depuis l'interface user overview. Utilise les dropdown/input du configurateur en terme d'ui pour que ce soit homogène.

	•	Possibilité de créer manuellement des profils agences de manière à attirer ces vraies agences existantes et qu'ils puissent claim le profil agence. Il faut imaginer un fonctionnement smooth et robuste où depuis la partie admin, nouvel onglet agence, l'admin peut cfréer des comptes d'agence que les vraies agences pourront claim en cliquand sur l'agence depuis le directory (avec mail de notification implémenté exactement comme les mails de la plateforme et même template) pour notifier l'admin qu'il a des demandes de claims. Sur ça fait preuve d'une grande intelligence pour trouver un processus simple, robuste, smooth pour les deux parties (admin et agence qui veut claim le compte), avec le minimum de friction possible.

   - Ajouter les informations de base pour chaque agence (ceux que on rajoute) + ajouter le bouton claim sur la page détail agence + possibilité d'ajouter une agence manuellement (exemple : https://www.supercreator.app/agency/bunny-agency , description avec catégories)

	•	Possibilité de planifier les posts SEO, pour cette demande il faudrait utiliser probablement les crons jobs dans vercel non? Ou on peut le planifier facilement via le backend/railway juste avec du code?

Questions posées à ma cliente et ses réponses :


La partie « agence » cela représente un compte créateur premium avec plusieurs profiles actuellement sur la plateforme (voir cdc). Quand tu demandes de pouvoir ajouter une agence manuellement, ça veut dire créer un compte user passé directement premium et remplir les infos (photo nom etc) pour cet user ? Pourquoi faire créer des agences manuellement ? Si tu m'expliques un peu plus je peux mieux m'adapter Comment doit fonctionner le système de claim ? Juste un bouton sur la page agences qui redirige vers ce tally ?

*Oui tu as raison, ce qu'on peut faire c'est ajouter des profils fictifs d'agences que les agences qui ne sont pas encore sur la plateforme peuvent claim et modifier la description en vérifiant et en s'inscrivant à exclu. Je dois pouvoir créer ces profils d'agences manuellement pour pouvoir les contacter ou pour qu'elles se sentent concerner en consultant exclu. On oublie tally et je valide / modifie tout via le profil admin.*



•⁠  ⁠Sur les filtres critères, c'est un peu hors scope vis à vis du cdc de cette partie est c'est assez lourd comme demande, peut on prévoir 1j en plus dans le devis pour intégrer ça + une vue admin « users » avec système des gestion comptes, des filtres sur tous les users, avec + récent, + anciens, + de ventes, + de vues, + de links, type comptes.. et une visualisation pour chaque user pour la modération de contenu (contenus publiques/liens), gestion visibilité des profils sur la partie blog dans cette partie de l'app. Qu'en penses-tu?

* oui c'est nécessaire d'ajouter un aspect modération au niveau du dashboard admin pour les agences et profils modèles. J'ai vu par ex que certaines modèles mettaient du contenu explicit directement visible en bio et il faudrait que je puisse modérer cet aspect là avec mes équipes. Également il faudrait un bouton support redirigeant vers un contact telegram afin d'aider les users en difficultés.*


•⁠  ⁠Sur les filtres, si je comprends bien on doit pouvoir filtrer les agences par les critères « OnlyFans Agency Classification Categories » dans l'affichage, et côté compte agence pouvoir renseigner ces infos quand on passe premium et qu'on commence à gérer plusieurs profils ?

Concernant les catégories « 	1	Model directory Categories (Updated) », c'est des informations que l'on a pas sur les +3000 comptes créés car pas demandé dans le cdc, je peux pas appliquer des filtres sur des infos que j'ai pas sur les comptes. Souhaites-tu les intégrées dans l'onboarding du profil / configurateur pour les futurs comptes ? Comment faire pour les 3000 comptes déjà créées ? Juste rajouter ces champs dans le profile pour qu'ils remplissent un jour si ils passent dessus?


*Je comprends, oui on peut ajouter une catégorie que les modèles peuvent sélectionner directement via leur compte et via l'onboarding pour les nouvelles concernées. *

-> Dans l'onboarding, ajouter une section pour sélectionner les catégories du modèle, sans que ce soit trop lourd si possible. Magnifique UI, ça doit bien s'enregistrer.

-> Dans le profil agence partie mon compte, il doit pouvoir sélectionner les catégories de son agence, sans que ce soit trop lourd si possible. Magnifique UI, ça doit bien s'enregistrer.

---

# 📊 BILAN D'AVANCEMENT — 24/03/2026 (mis à jour)

---

## ✅ IMPLÉMENTÉ ET FONCTIONNEL

### UI/UX — Blog & Admin
- ✅ **Boutons "Add Agency" et "New Article"** : Style unifié `variant="hero"` avec icônes Plus, alignement horizontal correct
- ✅ **Blog Status Filters** : Filtres "All/Published/Draft/Scheduled/Archived" en ligne avec recherche sur desktop
- ✅ **Dropdown Background** : Fond noir dans le dropdown catégories de modèles (UserOverview)
- ✅ **Agency Information Layout** : Logo à gauche, infos (nom, pays) à droite sur desktop, vertical sur mobile
- ✅ **Admin toggle Users** : Onglet "Users" réaffiché avec toggle dans la nav admin

### UserOverview — Agency Section
- ✅ **Agency Details Display** : Section complète avec logo, nom, pays pour les users agence
- ✅ **Managed Profiles Bubbles** : Affichage en bulles modernes avec photos réelles, liens vers pages publiques
- ✅ **Profile Photos** : Photos des profils gérés affichées (plus de placeholders)
- ✅ **Active/Inactive Status** : Points colorés (vert/rouge) pour statut des profils
- ✅ **Directory Visibility Toggle** : Bouton fonctionnel dans UserOverview (`is_directory_visible`)
- ✅ **Model Categories Dropdown** : Multi-select fonctionnel avec tous les groupes (AdminUserOverview ligne 569+)
- ✅ **"(Select a profile above to edit)"** : Couleur corrigée — `text-exclu-space/50` (plus en rouge) ✅ FAIT

### Architecture Technique
- ✅ **Multi-Profile System** : Structure `profiles.id` (user) + `creator_profiles.id` (profile) fonctionnelle
- ✅ **Agency Branding** : Colonnes `agency_name`, `agency_logo_url` dans table `profiles`
- ✅ **Directory Visibility Field** : Champ `is_directory_visible` dans `creator_profiles` + index GIN
- ✅ **Model Categories DB** : Champ `model_categories text[]` dans `creator_profiles` (migration 105)
- ✅ **Agency Categories DB** : Champs `pricing_structure`, `target_market`, `services_offered`, `platform_focus`, `geography`, `growth_strategy` dans `directory_agencies` (migration 104)
- ✅ **Agency Claim Requests DB** : Table `agency_claim_requests` (migration 106)
- ✅ **Edge Functions déployées** : `admin-update-user-visibility`, `admin-get-user-overview`, `submit-agency-claim`

### Directory Creators (`/directory/creators`)
- ✅ **Filtres catégories complets** : `CategoryFilterDropdown` avec recherche intégrée, tous les groupes :
  - Trending Now (18yo, college, teen, petite, goth, alt, cosplay, pornstar)
  - Type & Look (latina, asian, ebony, indian, arab, hijab, bbw, milf, redhead, blonde, brunette, natural, skinny, girl_next_door, amateur)
  - Niche & Kinks (joi, asmr, fetish, femdom, hairy, squirting, anal, trans, femboy, feet, domination, latex)
  - Features (big_tits, big_ass, tattooed, fitness, pregnant, lesbian, couple)
  - Experience (girlfriend_experience, ai_girlfriend)
- ✅ **Filtrage côté client** : Par catégories (overlap), pays, niche, recherche texte
- ✅ **Infinite scroll** : Batches de 20, sentinel observer
- ✅ **Tri** : Premium first → has paid links → profile views desc

### Directory Agencies (`/directory/agencies`)
- ✅ **Filtres catégories agences complets** : Pricing, Target Market, Services, Platform Focus, Growth Strategy
- ✅ **Filter Dropdown component** : Multi-select, style homogène avec DirectoryCreators
- ✅ **Toggle "Show Filters"** : Accordéon avec badge count filtres actifs
- ✅ **Clear All** : Bouton reset tous les filtres
- ✅ **Double source** : Agences `directory_agencies` + agences basées sur `profiles.agency_name`
- ✅ **Filtrage** : Tous les filtres agences appliqués côté client

### Agency Creation & Claim System
- ✅ **Admin Create Agency** : Formulaire complet dans `AdminUsers.tsx` (onglet agencies) — name, logo, description, website, email, country, city, + toutes catégories
- ✅ **Bouton "Claim this agency"** : Sur page `AgencyDetail.tsx`
- ✅ **Formulaire claim** : Email + nom, soumis via edge function `submit-agency-claim`
- ✅ **Interface admin claims** : Validation/rejet dans `AdminUsers.tsx`
- ✅ **Notifications email** : Template intégré dans le système email existant

### Settings — Profile.tsx (`/app/settings`)
- ✅ **Agency Categories Section** : Section "Agency Classification Categories" dans onglet "Profiles & Agency" (lignes 1428-1462)
  - Pricing Structure, Target Market, Services Offered, Platform Focus, Geography, Growth Strategy
  - Sauvegarde via `handleSaveAgencyCategories`
  - **Note** : UI en pill-buttons (à harmoniser, voir section ⚠️ ci-dessous)

---

## ⚠️ PARTIELLEMENT IMPLÉMENTÉ — CORRECTIONS REQUISES

### 1. Onboarding — Model Categories (Étape 1 `profile`)
**Fichier** : `src/pages/Onboarding.tsx` lignes 955–985

**État actuel** :
- Section "Categories" existe dans le formulaire step 1
- Sauvegarde bien dans `creator_profiles.model_categories` (lignes 559 et 577)
- **Problème 1 — Liste incomplète** : `MODEL_CATEGORY_OPTIONS` local (ligne 160) n'utilise que 3 groupes simplifiés ("Type & Look", "Niche & Features", "Experience") avec des items manquants :
  - Absent : `hijab`, `hairy`, `squirting`, `anal`, `domination`, `latex`, `pregnant`
  - Groupes manquants : "Trending Now" séparé, "Niche & Kinks" complet, "Features" complet
- **Problème 2 — UI incorrecte** : Affiche des pill-buttons statiques inline, alors que la demande est d'utiliser le **même dropdown multi-tag input** que dans AdminUserOverview (composant `CategoryFilterDropdown` ou équivalent)
- **Problème 3 — Incohérence** : La liste dans Onboarding diffère de celle dans DirectoryCreators et AdminUserOverview, ce qui crée des catégories "orphelines" non filtrables

**À faire** :
- Extraire `MODEL_CATEGORY_GROUPS` en constante partagée (`src/lib/categories.ts`) utilisée par Onboarding, DirectoryCreators, AdminUserOverview
- Remplacer l'UI pill-statique par un dropdown multi-tag identique à AdminUserOverview
- S'assurer que toutes les catégories du document original sont présentes

---

### 2. Configurateur — Onglet "Info" (InfoSection)
**Fichier** : `src/components/linkinbio/sections/InfoSection.tsx`
**Appelé depuis** : `src/pages/LinkInBioEditor.tsx` (tab "Info", ligne 510)

**État actuel** :
- L'onglet "Info" existe dans le configurateur (`LinkInBioEditor.tsx`)
- `InfoSection.tsx` ne contient **aucune gestion des `model_categories`**
- Aucun champ catégorie n'est passé en prop ni sauvegardé

**À faire** :
- Ajouter dans `InfoSection.tsx` un **dropdown multi-tag input** pour les catégories modèle
- Identique à l'UI de AdminUserOverview (même composant partagé)
- Sauvegarder dans `creator_profiles.model_categories` via la logique existante de LinkInBioEditor
- S'appuyer sur la constante partagée `MODEL_CATEGORY_GROUPS` (à créer)

---

### 3. Settings Profiles & Agency — Agency Classification Categories
**Fichier** : `src/pages/Profile.tsx` section `activeSection === 'profiles'` (ligne 1206+)

**État actuel** :
- Section "Agency Classification Categories" existe (~lignes 1428–1560)
- Pricing Structure, Target Market, Services Offered, Platform Focus, Geography, Growth Strategy
- **Problème — UI incohérente** : Utilise des pill-buttons toggle (style différent d'AdminUsers)
- La demande : UI identique à la création d'agence dans AdminUsers (FilterDropdown avec multi-select)

**À faire** :
- Harmoniser l'UI avec le composant `FilterDropdown` utilisé dans AdminUsers et DirectoryAgencies
- Garantir que les valeurs sauvegardées correspondent exactement aux clés des filtres dans DirectoryAgencies (ex : `high_commission`, `beginner_models`, etc.)
- Vérifier que le save (`handleSaveAgencyCategories`) poste bien dans la bonne table (`directory_agencies` ou `profiles`) selon la source de l'agence

---

### 4. Blog Layout — Espacements (cosmétique, faible priorité)
**Fichier** : `src/pages/BlogIndex.tsx` lignes 359–366

**État actuel** : Espacements au-dessus du titre "They sell with Exclu" et du titre "Guides" pas encore réduits

---

## ❌ NON IMPLÉMENTÉ

### 1. Directory Visibility Bug — À vérifier
**Problème déclaré** : `is_directory_visible = false` dans UserOverview, mais le profil reste visible dans `/directory/creators`

**Analyse** :
- `DirectoryCreators.tsx` ligne 226 filtre bien `.eq('is_directory_visible', true)`
- L'edge function `admin-update-user-visibility` semble correcte
- **Hypothèses à investiguer** :
  - La fonction update cible-t-elle `creator_profiles` ou `profiles` ? (il faut cibler `creator_profiles`)
  - Y a-t-il un cache React Query non invalidé côté client ?
  - La fonction reçoit-elle bien le `profile_id` (creator_profiles) et non le `user_id` ?
- **Debug requis** : Logger les appels dans l'edge function, vérifier en base la valeur réelle après toggle

### 2. "New In" — Filtre créateurs récents (≤ 10 jours)
**Demande** : Filtre "New In" dans DirectoryCreators pour les profils créés dans les 10 derniers jours

**État actuel** :
- `DirectoryCreators.tsx` : pas de filtre "New In" dans l'UI ni dans les constants
- La migration 105 prévoit le filtre via `created_at` (index créé) mais la logique frontend est absente
- `MODEL_CATEGORY_GROUPS` ne contient pas "New In" car c'est un filtre temporel, pas une catégorie stockée

**À faire** :
- Ajouter un bouton/toggle "New In" séparé dans les filtres de DirectoryCreators
- Côté query : filtrer `created_at > now() - interval '10 days'` (côté Supabase, pas côté client car on charge tout)
- Ou : passer en mode hybrid (charger avec filtre Supabase quand "New In" actif)

### 3. Agency Panel — Icône Settings
**Demande** : Icône settings à côté de "New Profile" dans l'Agency Panel de l'app

**État actuel** : Pas d'icône settings trouvée dans le panel agence

**À faire** :
- Ajouter un bouton settings dans l'Agency Panel (AppDashboard ou Profile.tsx selon où est affiché le panel)
- Rediriger vers `Profile.tsx → activeSection='profiles'` ou ouvrir un modal d'édition agence

### 4. Planification des Posts SEO (Blog Scheduling)
**Demande** : Pouvoir planifier la publication de posts SEO

**État actuel** :
- `AdminBlogEditor.tsx` : probablement un champ `published_at` mais pas de cron pour publier automatiquement
- Aucun système de scheduling actif

**Architecture recommandée** :
- Option A (Vercel) : Cron Job Vercel (`vercel.json` schedule) → Edge Function qui publie les posts dont `published_at <= now()` et `status = 'scheduled'`
- Option B (Supabase) : `pg_cron` extension sur Supabase (plus simple, zero infra)
- Le champ `status = 'scheduled'` existe déjà dans le blog (blog status filters implémentés)

---

## 📋 PLAN D'ACTION PAR PRIORITÉ

### 🔴 CRITIQUE — À traiter en premier

#### A. Fix Directory Visibility Bug
**Fichiers** : `supabase/functions/admin-update-user-visibility/index.ts` + `AdminUserOverview.tsx`
- Vérifier que l'edge function update `creator_profiles.is_directory_visible` (pas `profiles`)
- Vérifier que le `profile_id` passé est bien l'UUID `creator_profiles.id`
- Ajouter un `toast` de confirmation avec la valeur retournée par la DB pour debug
- **Test** : Toggle OFF → recharger DirectoryCreators → vérifier absence

#### B. Unifier les constantes catégories dans un fichier partagé
**Nouveau fichier** : `src/lib/categories.ts`
```
export const MODEL_CATEGORY_GROUPS = { ... }  // Source unique de vérité
export const AGENCY_CATEGORY_OPTIONS = { ... } // Source unique de vérité
```
- Importer depuis : Onboarding, DirectoryCreators, AdminUserOverview, InfoSection, Profile
- Évite les divergences actuelles entre les 3 versions incompatibles

---

### 🟠 HAUTE PRIORITÉ

#### C. Onboarding Step 1 — Dropdown multi-tag catégories (complet)
**Fichier** : `src/pages/Onboarding.tsx`
- Remplacer `MODEL_CATEGORY_OPTIONS` local par `MODEL_CATEGORY_GROUPS` partagé
- Remplacer l'UI pill-statique par le **dropdown multi-tag** (composant identique à AdminUserOverview)
- Le dropdown doit s'ouvrir au clic, avoir une recherche intégrée, afficher les groupes
- Sauvegarder exactement les mêmes valeurs que dans AdminUserOverview → DirectoryCreators
- **UX** : Le rendre optionnel et non-bloquant dans le flow onboarding (ne pas surcharger)

#### D. Configurateur InfoSection — Dropdown multi-tag catégories
**Fichiers** : `src/components/linkinbio/sections/InfoSection.tsx` + `src/pages/LinkInBioEditor.tsx`
- Ajouter prop `modelCategories: string[]` + `onModelCategoriesChange: (v: string[]) => void`
- Intégrer le dropdown multi-tag (même composant partagé)
- Wirer la sauvegarde dans `LinkInBioEditor.tsx` avec le save existant du profil
- **Attention** : `LinkInBioEditor` opère sur `creator_profiles`, s'assurer que le field `model_categories` est bien dans la query de chargement initiale

#### E. Settings Profiles & Agency — Harmoniser UI catégories agence
**Fichier** : `src/pages/Profile.tsx` (section `activeSection === 'profiles'`)
- Remplacer les pill-buttons actuels par le même composant `FilterDropdown` que dans DirectoryAgencies/AdminUsers
- Vérifier que les valeurs correspondent aux keys exactes des filtres directory (mapping)
- **Cas particulier** : L'agence peut être soit dans `directory_agencies` (créée par admin) soit basée sur `profiles.agency_name`. Déterminer quelle table mettre à jour dans `handleSaveAgencyCategories`

---

### 🟡 MOYENNE PRIORITÉ

#### F. Filtre "New In" — DirectoryCreators
**Fichier** : `src/pages/DirectoryCreators.tsx`
- Ajouter un filtre toggle "New In (last 10 days)"
- Modifier la query Supabase pour filtrer côté serveur quand activé (pas côté client car le batch est trop petit)
- Distinction : "New In" n'est pas stocké dans `model_categories`, c'est un filtre dynamique sur `created_at`

#### G. Agency Panel — Icône Settings
**À localiser** : Dans AgencyDashboard.tsx ou le panel agence dans AppDashboard.tsx
- Ajouter bouton gear/settings → route vers `/app/settings#profiles` ou modal

---

### 🟢 BASSE PRIORITÉ

#### H. Blog Layout — Réduire espacements
**Fichier** : `src/pages/BlogIndex.tsx` lignes 359–366
- Réduire padding-top au-dessus de "They sell with Exclu"
- Réduire espace au-dessus du titre "Guides"

#### I. Planification SEO Posts
**Architecture** : `pg_cron` Supabase (recommandé) ou Vercel Cron Job
- SQL cron : `UPDATE blog_posts SET status='published' WHERE status='scheduled' AND published_at <= now()`
- Ou edge function schedulée toutes les heures

---

## 🔍 POINTS DE VIGILANCE TECHNIQUES (pour le dev)

### Cohérence des valeurs de catégories
**Risque critique** : Les valeurs stockées en base (`model_categories` array) doivent être identiques dans TOUS les endroits :
- AdminUserOverview : `'18yo'`, `'latina'`, `'joi'`...
- DirectoryCreators filters : mêmes valeurs
- Onboarding : **actuellement différent** (`MODEL_CATEGORY_OPTIONS` local utilise les mêmes strings mais liste incomplète)
- InfoSection : rien pour l'instant

**Solution** : Fichier `src/lib/categories.ts` centralisé (point B ci-dessus) — **faire ça avant tout le reste**

### Onboarding : Ne pas casser le flow existant
L'onboarding a 6 étapes : `profile → design → link → content → chatting → instagram`
- Le step `profile` fait une soumission avec `handleSubmit` (créé le profil en base)
- Les categories doivent être dans le payload de cette soumission (lignes 559 et 577)
- **Ne pas ajouter d'étape supplémentaire** — intégrer dans le formulaire existant du step 1

### LinkInBioEditor : Architecture des données
`LinkInBioEditor.tsx` gère un état `editorData` qui est une représentation du `creator_profile`
- Vérifier que `model_categories` est inclus dans la query de chargement initiale du profil dans l'éditeur
- Passer la valeur initiale chargée dans `InfoSection` comme controlled prop
- La sauvegarde doit faire partie du flow de save existant (bouton save de l'éditeur)

### Profile.tsx — Agences "profile-based" vs "directory"
Il y a deux types d'agences :
1. **Agences créées admin** → dans table `directory_agencies` (ont leurs propres champs catégories)
2. **Créateurs premium avec agency_name** → dans table `profiles` (les catégories vont dans `profiles`)

Dans les settings `/app/settings → Profiles & Agency`, on est dans le contexte d'un utilisateur connecté → on met à jour `profiles` ou `directory_agencies` selon le cas. Vérifier la logique de `handleSaveAgencyCategories` pour s'assurer qu'elle cible la bonne table.

### Tests à effectuer après chaque implémentation
1. **Categories Onboarding** : Créer un nouveau compte → passer l'étape 1 → sélectionner des catégories → vérifier dans Supabase que `creator_profiles.model_categories` contient les bonnes valeurs → vérifier que le profil apparaît bien dans les filtres de `/directory/creators`
2. **InfoSection** : Modifier les catégories dans le configurateur → save → recharger la page → vérifier persistance → vérifier filtres directory
3. **Agency Settings** : Modifier catégories dans `/app/settings → Profiles & Agency` → save → vérifier dans `/directory/agencies` que les filtres fonctionnent sur ce profil
4. **Directory Visibility** : Toggle OFF → recharger `/directory/creators` → profil absent ; Toggle ON → profil présent
