# Parité `/auth/chatter` ↔ `/auth` (signup sans vérification email)

**Date :** 2026-04-16
**Auteur :** Claude (brainstorming session)
**Statut :** Design validé, prêt pour planification

## Contexte

La page `/auth/chatter` ([src/pages/ChatterAuth.tsx](../../../src/pages/ChatterAuth.tsx)) est la page d'inscription dédiée aux chatters d'agence. Elle a été créée en parallèle de `/auth` mais n'a pas reçu deux évolutions récentes :

- Commit `313008c` — `feat(auth): navigate straight to dashboard on signup when session is returned`. Depuis que **Confirm email = OFF** côté Supabase Auth, `signUp()` renvoie directement une session. La page doit détecter cette session et rediriger au lieu d'afficher « Check your inbox ».
- Commits `9ef6bad` / `dac0e09` — Phase 2 signup hardening (`check-signup-allowed` preflight : rate-limit IP + disposable email + BotID). Toutes les pages d'inscription doivent l'appeler pour éviter que les bots contournent la protection via `/auth/chatter`.

`FanSignup.tsx` a déjà les deux. Seul `ChatterAuth.tsx` est en retard.

## Objectif

Rendre le signup de `/auth/chatter` fonctionnellement identique à celui de `/auth` mode signup — auto-login quand la session est renvoyée, preflight anti-bot, checkbox 18+/consent, toggle password. Le reste du fichier (login, reset, redirects) reste intact.

## Changements — `src/pages/ChatterAuth.tsx`

Périmètre : **branche `mode === 'signup'` uniquement**. Les branches `login` et `reset` ne bougent pas.

### 1. Récupérer la session retournée par `signUp()`

Actuellement :
```ts
const { error } = await supabase.auth.signUp({ ... });
// ...
toast.success('Check your inbox to confirm your account, then log in.');
setMode('login');
```

Cible (aligné sur [Auth.tsx:139-193](../../../src/pages/Auth.tsx#L139-L193)) :
```ts
const { data: signUpData, error } = await supabase.auth.signUp({ ... });
// ... gestion "already registered" inchangée ...

if (signUpData?.session) {
  toast.success('Welcome to Exclu!');
  navigate('/app/chatter', { replace: true });
  return;
}
// Fallback legacy (email confirm ON) :
toast.success('Check your inbox to confirm your account, then log in.');
setMode('login');
```

### 2. Preflight anti-bot

Ajouter l'import :
```ts
import { preflightSignup, humanizeReason } from '@/lib/deviceFingerprint';
```

Entre la validation locale et l'appel `signUp()` :
```ts
const preflight = await preflightSignup(email);
if (!preflight.ok) {
  toast.error(humanizeReason(preflight.reason));
  return;
}
```

Le preflight est un **no-op** tant que `VITE_SIGNUP_PREFLIGHT_ENABLED !== 'true'` — donc aucun risque de régression en dev local. Comportement production identique à `/auth`.

### 3. Validation d'email côté client

Ajouter en haut du fichier :
```ts
const isValidEmail = (email: string) =>
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
```

Dans `handleSubmit`, après la vérification `if (!email)` :
```ts
if (!isValidEmail(email)) {
  toast.error('Please enter a valid email address');
  return;
}
```

### 4. Checkbox 18+ / ToS / consentement marketing

- State : `const [ageConfirmed, setAgeConfirmed] = useState(false);`
- Vérification bloquante dans `handleSubmit` (mode signup), avant le preflight :
  ```ts
  if (!ageConfirmed) {
    toast.error('You must confirm that you are at least 18 years old');
    return;
  }
  ```
- Markup identique à [Auth.tsx:520-534](../../../src/pages/Auth.tsx#L520-L534) : checkbox + libellé avec liens `/terms` et `/privacy`.
- Bouton submit : `disabled={isLoading || (mode === 'signup' && !ageConfirmed)}`.

### 5. Toggle show/hide password

- State : `const [showPassword, setShowPassword] = useState(false);`
- Imports lucide : `Eye`, `EyeOff` (ajouter à la liste existante).
- Markup du champ password en mode signup/login : `type={showPassword ? 'text' : 'password'}`, wrapper `relative`, bouton icône à droite avec `pr-10` sur l'input. Copié depuis [Auth.tsx:497-517](../../../src/pages/Auth.tsx#L497-L517).

## Métadonnées `signUp()` — inchangées

```ts
data: {
  is_creator: false,
  full_name: displayName,
  is_chatter: true,
},
```

Le flag `is_chatter: true` reste — c'est ce qui déclenche le provisioning côté DB (profil avec `role = 'chatter'`) et il n'est pas présent dans `/auth`.

## Hors périmètre

- **Account-type picker** — `/auth/chatter` est une page dédiée, pas de toggle creator/fan.
- **Username / handle** — les chatters n'en ont pas.
- **Referral code** — pas de programme referral B2B côté chatter.
- **Mode `update-password`** — non présent sur `/auth/chatter` aujourd'hui ; les resets passent par le callback commun `/auth/callback` → `/auth?mode=update-password`. Aucune raison de changer ce flux dans le cadre de cette parité.
- **Creator preview card / `creatorHandle` param** — spécifique à `/fan/signup`, pas applicable aux chatters.

## Tests manuels (post-implémentation)

1. **Signup nominal (email confirm OFF)** : créer un compte chatter via `/auth/chatter?mode=signup`, sans invitation → toast « Welcome to Exclu! » + redirect immédiat vers `/app/chatter`.
2. **Checkbox décochée** : bouton submit reste grisé, pas de requête envoyée.
3. **Email invalide** : toast d'erreur, pas d'appel réseau.
4. **Preflight (prod uniquement avec `VITE_SIGNUP_PREFLIGHT_ENABLED=true`)** : rate-limit en burst de 6 requêtes depuis la même IP → 6ᵉ bloquée avec message humanisé.
5. **Login chatter existant** : comportement inchangé, redirect vers `/app/chatter`.
6. **Reset password** : comportement inchangé.
7. **Account déjà existant** : toast « An account already exists … » + switch vers login.

## Fichiers modifiés

- `src/pages/ChatterAuth.tsx` — seul fichier touché.
- Aucune migration DB, aucune edge function, aucun env var, aucun test automatisé (ces chemins ne sont pas couverts par des tests unitaires aujourd'hui).
