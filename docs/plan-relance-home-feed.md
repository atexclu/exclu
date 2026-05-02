# Plan — Bouton relance contenu (admin) + Onglet Home/feed (créateur)

Cible : 1 j de dev. Document à valider avant implémentation.

---

## Partie A — Bouton de relance contenu depuis l'admin

### UX

Sur `/admin/users/:id/overview`, à côté de la section "Settings" (ou en header de la fiche), un bouton **"Send content reminder"** :

- Affiche, sous le bouton, la durée écoulée depuis le dernier ajout de contenu :
  - Lecture : `MAX(created_at)` parmi `links` (tout statut sauf `deleted`) + `assets` du créateur, comparé à `now()`.
  - Affichage : `Last upload: 12 days ago` (couleur graduée — vert <7 j, ambre 7–30 j, rouge >30 j).
- Disabled pendant 7 jours après le dernier envoi pour éviter le spam (lecture ligne `content_reminder_log`).
- Au clic : ouvre un modal de confirmation montrant un aperçu rendu du template avant envoi.

### Backend

**Migration 192** — `content_reminder_log` (anti-spam + traçabilité) :

```sql
CREATE TABLE public.content_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sent_by uuid NOT NULL REFERENCES profiles(id),  -- admin who fired the email
  template_slug text NOT NULL DEFAULT 'creator_content_reminder',
  template_version int NOT NULL,                  -- snapshot of admin_email_templates.version at send-time
  rendered_subject text NOT NULL,
  rendered_body text NOT NULL,
  days_since_last_upload int NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_reminder_log_creator_recent
  ON content_reminder_log (creator_id, sent_at DESC);

ALTER TABLE content_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_read_content_reminder_log
  ON content_reminder_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
-- writes are service-role only.
```

**Edge function** — `admin-send-content-reminder` (Deno) :

- Auth admin requis.
- Body : `{ creator_id }`.
- Pré-checks (idempotence) :
  1. Profile existe, `deleted_at IS NULL`, `is_creator = true`.
  2. Aucun `content_reminder_log` pour ce `creator_id` dans les 7 derniers jours → sinon `429`.
- Charge le template `creator_content_reminder` depuis `admin_email_templates` (déjà géré par admin > mailing > templates).
- Render variables : `{display_name}`, `{handle}`, `{days_since_last_upload}`, `{profile_url}`, `{login_url}`.
- Envoi via Resend (même provider que `send-auth-email`).
- Insert ligne `content_reminder_log` après envoi réussi.

### Template par défaut (créé en migration)

Inséré une seule fois dans `admin_email_templates` avec slug `creator_content_reminder` :

- **Subject** : `{display_name}, your fans miss you on Exclu 💚`
- **Body (HTML)** : ton chaleureux et engageant. Mentionne :
  - Que c'est plus engageant pour leurs fans s'ils publient régulièrement
  - Que les profils actifs remontent dans le directory
  - Plus de contenu = plus de ventes
  - CTA → bouton "Add new content" vers `/app/links/new`
- **Body (text)** : version texte plain pour les clients qui ne supportent pas HTML.

### UI Admin

```
[ Send content reminder ]
  Last upload: 12 days ago
  ⓘ Last reminder sent on Apr 27, 2026 (4 days ago)  ← if any
```

Modal de confirmation : rendu du template avec les variables substituées + bouton "Send" / "Cancel".

---

## Partie B — Onglet Home / feed côté créateur

### Principe

L'onglet "Home" affiche **directement** le profil public du créateur (preview live) tel qu'il apparaît au public, mais avec :

- **Web** : volet (sidebar) toujours visible à gauche, profil au centre comme version web publique du `/:handle`.
- **Mobile** : topbar visible, profil en plein écran comme la version mobile publique du `/:handle`.

Le créateur connecté arrive sur cette page **par défaut** au login (route `/app` redirect → `/app/home`).

### Architecture — comment garantir que les modifs futures s'appliquent partout

**Refacto** : extraire le rendu du profil public en un composant réutilisable `<CreatorPublicProfile>` qui prend en props :

```tsx
interface CreatorPublicProfileProps {
  handle: string;                          // ou creator_id
  mode: 'public' | 'creator-home';         // contrôle l'affichage des CTAs admin
  layout: 'web' | 'mobile';                // forcé par le parent ; le composant ne se ré-adapte pas
  onCreatePost?: () => void;               // fourni en mode creator-home
}
```

- Aujourd'hui [CreatorPublic.tsx](src/pages/CreatorPublic.tsx) contient ~tout le code de rendu. On le déplace tel quel dans `src/components/creator-public/CreatorPublicProfile.tsx`, et `CreatorPublic.tsx` devient un mince wrapper qui le rend en `mode='public'` + détecte le layout via media query.
- La nouvelle page `CreatorHome.tsx` rend le même composant en `mode='creator-home'`, avec une zone interactive "+ New post" superposée sur le feed.
- **Toute modification future du profil public modifie le composant unique** → l'onglet Home reste synchronisé, sans duplication.

### Mode `creator-home` : différences vs `public`

- Au-dessus du feed : zone cliquable "+ Create post" (style OnlyFans → ouvre l'éditeur de création).
- Sur chaque post : icône `…` discret en haut à droite → menu (Edit, Delete, Visibility).
- Pas de CTA "Subscribe" / "Tip" / "Send a request" (pas de sens pour soi-même).
- Pas de bouton "Share my profile" (déjà dans le volet ailleurs).

### Création de post

L'éditeur réutilise le pattern existant de `ChatCreateLink.tsx` mais avec un statut `is_public` configurable :

- Champ titre + description optionnelle.
- Upload image/vidéo via `assets` + `link_media` (même flow que les liens payants).
- Toggle "Public post" vs "Subscribers only".
- Pas de prix → c'est un post de feed, pas un lien payant. La table `links` a déjà `price_cents = 0` autorisé par la CHECK constraint après migration 191.
- Pas de like ni commentaire (logique actuelle inchangée).

### Routing

Ajouter dans `src/App.tsx`, **avant** le wildcard `/:handle` :

```tsx
<Route path="/app/home" element={<ProtectedRoute><AppShell><CreatorHome /></AppShell></ProtectedRoute>} />
```

Et changer la default redirect côté `Auth.tsx` / `AuthCallback.tsx` pour les créateurs : `/app` → `/app/home` (au lieu de `/app/profile`).

### Pas de migration DB

Le feed utilise déjà `links` avec `is_public + show_on_profile`. Aucune nouvelle table.

---

## Ordre d'implémentation suggéré

1. **Refacto CreatorPublic → composant réutilisable** (1–2 h, risque zéro car copy-paste avec wrapping).
2. **Page CreatorHome + route + redirect** (2 h).
3. **Migration 192 + edge function admin-send-content-reminder + template par défaut** (2–3 h).
4. **Bouton admin + UI confirm** (1 h).
5. **Zone "+ New post" + éditeur** (2–3 h).

Total : ~1 j de dev, conforme à l'estimation initiale du doc client.

---

## Questions ouvertes avant de coder

1. **Login redirect** : les créateurs vont sur `/app/home`. Et les agences/chatters/fans ? Probablement on garde leurs landings actuelles 
MES RÉPONSES :
Agence en soit on lui demande de choisir un profil à la connexion (une agence est un compte créateur avec plusieurs profils sous gestion), donc uand il choisit le profile ça le redirige vers le bon onglet home.
Pour les chatters et fans ils ne sont pas concernés ils n'ont pas de profile publique, on change rien au fonctionement acctuel.

£(`/app/agency`, `/app/chatter`, `/fan`).
2. **Posts du feed** : si la créatrice supprime un post, on hard-delete ou soft-delete ? (Cohérence avec ses fans qui ont peut-être déjà unlock).
-> la gestion se fait que par profile, là dans home on fait que display ce qu'il y a sur la page "http://localhost:8080/tbdevpro" mais dans un onglet interne pour que le créateur puisse avoir directement une view acguelle de son profil!!

3. **Délai mini entre 2 reminders** : 7 j semble raisonnable, à confirmer.
Sur les relances elles sont manuelles, c'est l'admin qui choisit. On peut efentuellement mettre un détail sur la date e dernière relance (qui doit s'afficher direct une fois le bouton cliqué, et le mail part après pour que ce soit fluide). Ui jolie moderne par contre


4. **Cohérence `creator_content_reminder` template variables** avec ce que vous mettez dans admin > mailing > templates : on définit la liste fermée des variables disponibles dès la création du template ?

non, ça doit dépendre du template html ou que on puisse créer des variables facilement intuitivement
