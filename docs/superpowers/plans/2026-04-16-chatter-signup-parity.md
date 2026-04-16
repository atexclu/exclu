# Chatter signup parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `/auth/chatter` signup flow with `/auth` — auto-login when Supabase returns a session (email-confirm OFF), Phase 2 anti-bot preflight, 18+ consent checkbox, client-side email validation, show/hide password toggle.

**Architecture:** Single-file edit to [src/pages/ChatterAuth.tsx](../../../src/pages/ChatterAuth.tsx). Copy the exact patterns already in [src/pages/Auth.tsx](../../../src/pages/Auth.tsx) — same imports, same state names, same JSX markup, same strings — so the two pages stay visually and behaviourally identical. No new files, no DB changes, no env vars, no edge functions.

**Tech Stack:** React 18 + TypeScript, React Router v6, Supabase JS, `@/lib/deviceFingerprint` (preflight helper), lucide-react, Tailwind + shadcn/ui, sonner (toasts).

**Testing note:** This codebase has no frontend unit tests for auth pages (Auth.tsx and FanSignup.tsx are untested). Verification is **typecheck + manual browser smoke** against a running dev server, per the spec's "Tests manuels" section. Keep the whole change on a single commit — intermediate states leave the UI broken.

**Spec:** [docs/superpowers/specs/2026-04-16-chatter-signup-parity-design.md](../specs/2026-04-16-chatter-signup-parity-design.md)

---

### Task 1: Apply the full parity change

**Files:**
- Modify: `src/pages/ChatterAuth.tsx`
- Reference (do NOT edit): `src/pages/Auth.tsx` — source of truth for the patterns

---

- [ ] **Step 1: Add the missing imports**

Current imports at top of [src/pages/ChatterAuth.tsx:10-21](../../../src/pages/ChatterAuth.tsx#L10-L21):

```tsx
import { Mail, Lock, Sparkles, User } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
```

Replace the lucide import and add the deviceFingerprint import so we get `Eye`, `EyeOff`, `preflightSignup`, and `humanizeReason`:

```tsx
import { Mail, Lock, Sparkles, User, Eye, EyeOff } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { preflightSignup, humanizeReason } from '@/lib/deviceFingerprint';
```

---

- [ ] **Step 2: Add the `isValidEmail` helper above the component**

Just after the imports and before `const ChatterAuth = () => {`, add:

```tsx
const isValidEmail = (email: string) =>
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
```

This is byte-for-byte identical to [Auth.tsx:15-16](../../../src/pages/Auth.tsx#L15-L16).

---

- [ ] **Step 3: Add the two new state hooks**

Find the state block at the top of the component:

```tsx
const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
const [isLoading, setIsLoading] = useState(false);
const navigate = useNavigate();
const [searchParams] = useSearchParams();
```

Add `showPassword` and `ageConfirmed` right after `isLoading`:

```tsx
const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
const [isLoading, setIsLoading] = useState(false);
const [showPassword, setShowPassword] = useState(false);
const [ageConfirmed, setAgeConfirmed] = useState(false);
const navigate = useNavigate();
const [searchParams] = useSearchParams();
```

---

- [ ] **Step 4: Rewrite the signup branch of `handleSubmit`**

Current code at [ChatterAuth.tsx:56-105](../../../src/pages/ChatterAuth.tsx#L56-L105):

```tsx
if (!email) {
  toast.error('Please fill in your email');
  return;
}

setIsLoading(true);
try {
  if (mode === 'reset') {
    // ... unchanged ...
  } else if (mode === 'signup') {
    if (!password) {
      toast.error('Please fill in all fields');
      return;
    }
    if (!displayName) {
      toast.error('Please enter your name');
      return;
    }

    const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
        data: {
          is_creator: false,
          full_name: displayName,
          is_chatter: true,
        },
      },
    });

    if (error) {
      const message = (error.message || '').toLowerCase();
      if (message.includes('already registered') || message.includes('user already registered')) {
        toast.info('An account already exists with this email. Please log in.');
        setMode('login');
        return;
      }
      throw error;
    }

    toast.success('Check your inbox to confirm your account, then log in.');
    setMode('login');
  } else {
```

Replace the `if (!email)` check and the **entire `mode === 'signup'` branch** with:

```tsx
if (!email) {
  toast.error('Please fill in your email');
  return;
}

if (!isValidEmail(email)) {
  toast.error('Please enter a valid email address');
  return;
}

setIsLoading(true);
try {
  if (mode === 'reset') {
    // ... unchanged ...
  } else if (mode === 'signup') {
    if (!password) {
      toast.error('Please fill in all fields');
      return;
    }
    if (!displayName) {
      toast.error('Please enter your name');
      return;
    }

    if (!ageConfirmed) {
      toast.error('You must confirm that you are at least 18 years old');
      return;
    }

    // Phase 2 signup preflight: rate limit / disposable / BotID check.
    // No-op unless VITE_SIGNUP_PREFLIGHT_ENABLED === 'true'.
    const preflight = await preflightSignup(email);
    if (!preflight.ok) {
      toast.error(humanizeReason(preflight.reason));
      return;
    }

    const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
        data: {
          is_creator: false,
          full_name: displayName,
          is_chatter: true,
        },
      },
    });

    if (error) {
      const message = (error.message || '').toLowerCase();
      if (message.includes('already registered') || message.includes('user already registered')) {
        toast.info('An account already exists with this email. Please log in.');
        setMode('login');
        return;
      }
      throw error;
    }

    // Phase 2B: if Supabase Auth returned a session, the chatter is
    // logged in immediately (Confirm email = OFF). Navigate straight to
    // the chatter dashboard. Otherwise (legacy Confirm email = ON path,
    // backward compat) fall back to the "check inbox" message.
    if (signUpData?.session) {
      toast.success('Welcome to Exclu!');
      navigate('/app/chatter', { replace: true });
      return;
    }
    toast.success('Check your inbox to confirm your account, then log in.');
    setMode('login');
  } else {
```

Changes made, in order: added `isValidEmail` check after `!email`, added `ageConfirmed` check after the `displayName` check, added `preflightSignup` call before `signUp()`, captured `data: signUpData` from the `signUp()` destructure, added the `signUpData?.session` direct-navigation block before the fallback `toast.success`.

The `is_chatter: true` metadata stays — it's the flag that provisions a chatter profile server-side.

---

- [ ] **Step 5: Wrap the password input with the show/hide toggle**

Current password field at [ChatterAuth.tsx:263-280](../../../src/pages/ChatterAuth.tsx#L263-L280):

```tsx
{mode !== 'reset' && (
  <div className="space-y-1.5">
    <label htmlFor="password" className="flex items-center gap-2 text-xs font-medium text-exclu-space">
      <Lock className="h-3.5 w-3.5 text-exclu-space/80" />
      Password
    </label>
    <Input
      id="password"
      name="password"
      type="password"
      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
      placeholder={mode === 'signup' ? 'Create a strong password' : 'Your password'}
      className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
      minLength={6}
      required
    />
  </div>
)}
```

Replace with (wrap the `Input` in a `relative` div, add `pr-10` padding, add the eye button — mirrors [Auth.tsx:496-517](../../../src/pages/Auth.tsx#L496-L517)):

```tsx
{mode !== 'reset' && (
  <div className="space-y-1.5">
    <label htmlFor="password" className="flex items-center gap-2 text-xs font-medium text-exclu-space">
      <Lock className="h-3.5 w-3.5 text-exclu-space/80" />
      Password
    </label>
    <div className="relative">
      <Input
        id="password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        placeholder={mode === 'signup' ? 'Create a strong password' : 'Your password'}
        className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm pr-10"
        minLength={6}
        required
      />
      <button
        type="button"
        onClick={() => setShowPassword((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
        tabIndex={-1}
      >
        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  </div>
)}
```

---

- [ ] **Step 6: Insert the 18+ / consent checkbox above the submit button**

Find the submit Button at [ChatterAuth.tsx:282-296](../../../src/pages/ChatterAuth.tsx#L282-L296):

```tsx
<Button
  type="submit"
  variant="hero"
  size="lg"
  className="w-full mt-1 inline-flex items-center justify-center gap-2"
  disabled={isLoading}
>
  {isLoading
    ? 'Please wait...'
    : mode === 'signup'
      ? 'Sign up'
      : mode === 'login'
        ? 'Log in'
        : 'Send reset link'}
</Button>
```

Insert the checkbox right above this Button, and change the `disabled` prop to block signup when not confirmed:

```tsx
{mode === 'signup' && (
  <label className="flex items-start gap-3 cursor-pointer group">
    <input
      type="checkbox"
      checked={ageConfirmed}
      onChange={(e) => setAgeConfirmed(e.target.checked)}
      className="mt-0.5 h-4 w-4 rounded border-white/30 bg-black/40 text-primary focus:ring-primary/50 accent-[#CFFF16]"
    />
    <span className="text-[11px] text-exclu-space/80 leading-relaxed group-hover:text-exclu-space transition-colors">
      I confirm that I am at least <strong className="text-exclu-cloud">18 years old</strong> and agree to the{' '}
      <a href="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</a> and{' '}
      <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>, including receiving transactional and marketing emails from Exclu (unsubscribe anytime).
    </span>
  </label>
)}

<Button
  type="submit"
  variant="hero"
  size="lg"
  className="w-full mt-1 inline-flex items-center justify-center gap-2"
  disabled={isLoading || (mode === 'signup' && !ageConfirmed)}
>
  {isLoading
    ? 'Please wait...'
    : mode === 'signup'
      ? 'Sign up'
      : mode === 'login'
        ? 'Log in'
        : 'Send reset link'}
</Button>
```

The only line changed on the Button itself is the `disabled` attribute.

---

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors. If TypeScript complains about `signUpData` being possibly undefined, the `signUpData?.session` optional chain handles it — no fix needed.

If there are errors referencing `ChatterAuth.tsx`, re-read steps 1-6 and make sure no identifier was mistyped (`showPassword`, `setShowPassword`, `ageConfirmed`, `setAgeConfirmed`, `preflightSignup`, `humanizeReason`, `isValidEmail`, `Eye`, `EyeOff`).

---

- [ ] **Step 8: Start the dev server and manually verify**

Run: `npm run dev`

Then in a browser at `http://localhost:8080/auth/chatter?mode=signup`:

1. **Checkbox gates submit:** load the page, fill email + password + display name, leave the 18+ checkbox unchecked → the "Sign up" button is disabled.
2. **Invalid email blocked:** type `foo` in the email field, check the box, submit → toast "Please enter a valid email address", no network request.
3. **Password toggle:** click the eye icon in the password field → characters become visible; click again → hidden.
4. **Nominal signup (email confirm OFF):** submit with a fresh email → toast "Welcome to Exclu!" and redirect to `/app/chatter`. If it says "Check your inbox" instead, confirm that the linked Supabase project has **Confirm email = OFF** in Auth settings (it does in prod today).
5. **Existing account:** submit with an already-registered email → toast "An account already exists…" + auto-switch to login tab.
6. **Login path (regression check):** switch to Log in tab, sign in with an existing chatter account → redirect to `/app/chatter`.
7. **Reset path (regression check):** switch to reset, submit an email → toast "Check your inbox to reset your password".

If any of (1)-(7) behaves differently from the list, go back to the step that introduced that piece and compare diff vs `src/pages/Auth.tsx` for the matching block.

---

- [ ] **Step 9: Commit**

Run:

```bash
git add src/pages/ChatterAuth.tsx
git commit -m "$(cat <<'EOF'
feat(auth): chatter signup parity with /auth

- Auto-login + redirect to /app/chatter when Supabase returns a
  session (matches email-confirm-OFF behavior from 313008c).
- Phase 2 anti-bot preflight (rate-limit/disposable/BotID), no-op
  unless VITE_SIGNUP_PREFLIGHT_ENABLED=true.
- 18+ / ToS / marketing consent checkbox, gates submit button.
- Client-side email regex validation.
- Show/hide password toggle.

Spec: docs/superpowers/specs/2026-04-16-chatter-signup-parity-design.md
EOF
)"
```

---

## Self-Review

- **Spec coverage:** (1) auto-login session path ✅ step 4; (2) preflight ✅ steps 1 + 4; (3) isValidEmail ✅ steps 2 + 4; (4) 18+ checkbox ✅ steps 3 + 6; (5) password toggle ✅ steps 1 + 3 + 5. Hors périmètre items confirmed untouched (no account-type picker, no handle, no referral, no update-password mode, no creator preview).
- **Placeholder scan:** No TBDs, every code block is final text.
- **Type consistency:** `signUpData` used only as `signUpData?.session` — optional chain covers undefined. `ageConfirmed` / `setAgeConfirmed` / `showPassword` / `setShowPassword` spelled consistently across steps 3, 5, 6. `preflightSignup` / `humanizeReason` imports match step 4's call sites.
