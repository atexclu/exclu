# Profile Health gamification — design spec

**Date** : 2026-05-01
**Origine** : Demandes client 2026-04-30 — gamification de l'onboarding (extension du doc, inspiration Fanspicy).

## Objectif

Afficher en haut du sidebar AppShell une "Profile Health card" persistante avec une barre de progression et un compteur d'étapes. Au clic, une popup détaille les 8 étapes (cf. mapping ci-dessous), chacune redirigeant vers l'onglet exact du Link-in-Bio editor (`/app/profile`). Quand le créateur complète une étape, la popup s'auto-ouvre, l'étape s'anime en "completed", la barre se met à jour.

Inspirations UI : section Earnings (`AppDashboard.tsx`), aurora lime gradient.

## Mapping des 8 étapes

| # | Label affiché | Critère "done" | Tab cible (`?focus=…`) |
|---|---|---|---|
| 1 | Username added | `creator_profiles.username` non-vide | `info` |
| 2 | Add a profile picture | `creator_profiles.avatar_url` non-null | `photo` |
| 3 | Write your bio | `creator_profiles.bio` ≥ 10 caractères (trim) | `info` |
| 4 | Add your website link | `social_links.linktree` non-vide | `social` |
| 5 | Add socials to your profile | ≥ 1 entrée non-vide dans `social_links` ≠ `linktree` | `social` |
| 6 | Set your subscription price | `fan_subscription_enabled = true` AND `fan_subscription_price_cents > 0` | `content` |
| 7 | Create your first paid link | `links` count ≥ 1 (status `published`, profil actif) | `links` |
| 8 | Add 30 posts to your feed | `assets` count `is_public = true` ≥ 30 (profil actif) | `content` |

Le filtre multi-profil suit le pattern existant : `eq('profile_id', activeProfile.id)` avec fallback `eq('creator_id', userId)` quand `profile_id` est null (legacy).

## Architecture

```
src/
├── hooks/
│   └── useProfileHealth.ts        ← NEW : fetch + realtime + diff
├── components/
│   ├── ProfileHealthCard.tsx      ← NEW : card sidebar
│   └── ProfileHealthDialog.tsx    ← NEW : popup
│   └── AppShell.tsx               ← EDIT : insertion card
│   └── ActivationChecklist.tsx    ← DELETE : dead code
└── pages/
    └── LinkInBioEditor.tsx        ← EDIT : lecture `?focus=<tab>`
```

### `useProfileHealth(activeProfile)`

Retourne :
```ts
{
  steps: Step[],            // 8 entries with id, label, done, targetTab
  completedCount: number,
  totalCount: 8,
  percent: number,          // 0..100
  justCompletedStepId: StepId | null,  // briefly set when a step crosses pending → done
  acknowledgeJustCompleted: () => void, // reset after popup auto-open
  refetch: () => void,
}
```

Implémentation :
1. Fetch initial : 1 SELECT sur `creator_profiles`, 1 count head sur `links`, 1 count head sur `assets`. Le tout en parallèle via `Promise.all`.
2. Realtime : `supabase.channel('profile_health:<profileId>')` avec 3 souscriptions Postgres CDC :
   - `UPDATE` sur `creator_profiles` filtrée par `id=eq.<profileId>`
   - `INSERT/UPDATE/DELETE` sur `links` filtrée par `profile_id=eq.<profileId>` (ou `creator_id=eq.<userId>` en fallback)
   - `INSERT/UPDATE/DELETE` sur `assets` filtrée par `profile_id=eq.<profileId>` (ou `creator_id=eq.<userId>`)
3. Sur événement → `refetch()` debounced 300 ms (évite rafale lors de batch updates).
4. Diff `prevSteps` vs `nextSteps` : si une step passe `done=false → done=true`, set `justCompletedStepId`. Persiste dans `localStorage` les ids déjà acquittés (clé `profileHealth.seenSteps:<profileId>`) pour ne pas réouvrir la popup au refresh page.
5. Hook gate : si pas de `userId` ou pas de `activeProfile`, retourne `{ percent: 0, steps: [], completedCount: 0, ... }` et ne crée aucun channel.

### `ProfileHealthCard`

Rendu uniquement si `activeProfile` existe (toutes les routes `/app/*` sont créateur-side donc la card a du sens partout).

Layout (compact, sidebar 200px) :
```
┌──────────────────────────────┐
│ [avatar] Display name        │
│ Profile health         X / 8 │
│ ████████░░░░░░░░░░░░░░░  20% │
└──────────────────────────────┘
```
Clic → ouvre `ProfileHealthDialog`. Si 100% → la card disparaît du sidebar (mais la popup reste accessible via clic sur l'avatar dans la zone bottom).

Interaction écoutée :
- Au mount, lit `justCompletedStepId` du hook → ouvre la popup automatiquement après 400 ms (le temps que l'animation de save se termine côté section).
- Après ouverture, appelle `acknowledgeJustCompleted()` pour empêcher une réouverture sur le même id.

### `ProfileHealthDialog`

Dialog shadcn (`dialog.tsx`). Width `sm:max-w-lg`. Rounded-3xl. Body :
1. Header : titre "Profile health", `% large` à droite (5xl font-black, halo lime radial).
2. Barre de progression linéaire (gradient `from-primary to-lime-400`) avec spring animation à l'ouverture.
3. Liste des 8 étapes en `space-y-2`, chaque ligne :
   - Icône (lucide) à gauche dans un cercle (vert si done, muted sinon)
   - Label + microcopie (1 ligne)
   - Chevron à droite si pending, check spring animé si done
   - Click sur une ligne pending → `navigate('/app/profile?focus=<targetTab>')` + `onClose()`
4. Si 100% : confettis lite (Framer scale spring x3 emoji ✨) + message "Profile complete".

Animation auto-open (step crossed) : fait défiler l'étape concernée en focus + petit bounce + ping lime sur le check. Identifie l'étape par `data-step-id` pour scrollIntoView.

### `LinkInBioEditor` — deep-link

Au mount (et à chaque changement de search params), lecture de `?focus=` (`photo|info|social|links|content`). Si valide → `setActiveSection(value)`. Le param est ensuite cleared via `setSearchParams({}, { replace: true })` pour ne pas re-déclencher si l'utilisateur change de tab manuellement.

### `AppShell` — insertion

- Desktop : avant le `<nav>` (ligne ~218), wrapper `<div class="px-3 pt-3">` pour matcher le padding existant.
- Mobile drawer : même position au-dessus du nav (ligne ~261).
- La card est rendue conditionnellement : `activeProfile && !isAgency` (l'agency panel a son propre flow). En multi-profil créateur (1 user, n profils tous créateurs), la card reste affichée et reflète le `activeProfile` courant.

## Auto-popup — règles précises

- Déclenchée UNIQUEMENT quand une étape passe pending → done dans la même session navigateur (pas au reload de page).
- 1 seule popup à la fois. Si plusieurs étapes passent done dans la même mutation (cas rare), on prend la dernière.
- Mémorisation localStorage par `(profileId, stepId)` → pas de double-popup pour la même étape sur 2 sessions.
- Si la popup est déjà ouverte (clic manuel), un step crossing met juste à jour la liste avec animation, pas de re-trigger.

## Edge cases

- `creator_profiles` row absent → toutes étapes pending, percent 0%, **pas** d'auto-popup (c'est le state par défaut, pas un crossing).
- `social_links` est nullable (peut être JSONB `{}`) → on traite null comme `{}`.
- `links` ou `assets` queries failent (RLS) → on log et on conserve les valeurs précédentes (pas de saut visuel à 0).
- Switch de profil actif → on tear down le channel ancien et recompute pour le nouveau profil. Le `localStorage` est par-profile pour ne pas perdre l'état acquitté du profil précédent.
- 100% atteint → la card disparaît du sidebar via `AnimatePresence`, mais on garde le hook monté pour qu'un retour < 100% (ex : suppression d'un asset public) refasse apparaître la card.

## Cohabitation avec ActivationChecklist

`src/components/ActivationChecklist.tsx` est défini mais jamais importé/rendu dans le code. Il est supprimé dans la même PR pour réduire la dette.

## Migration SQL

**Aucune.** Toutes les colonnes utilisées existent déjà :
- `creator_profiles` : `username`, `display_name`, `avatar_url`, `bio`, `social_links`, `fan_subscription_enabled`, `fan_subscription_price_cents`
- `links` : `creator_id`, `profile_id`, `status`
- `assets` : `creator_id`, `profile_id`, `is_public`

## Tests à valider manuellement

1. Compte tout neuf, 0/8 → card affiche 0%, popup ouvrable, aucune étape done.
2. Upload avatar → popup s'auto-ouvre, étape "Add a profile picture" passe en check animé.
3. Ajout d'un lien Instagram → étape Socials passe done.
4. Refresh la page → la popup ne se ré-ouvre PAS (localStorage acquitté).
5. Clic sur une étape pending → redirige vers le bon onglet du LinkInBioEditor.
6. Switch de profil multi-profil → la card reflète le nouveau profil instantanément.
7. Compléter les 8 étapes → confettis, puis card disparaît du sidebar.
8. Supprimer un asset public pour repasser sous 30 → la card réapparaît.
