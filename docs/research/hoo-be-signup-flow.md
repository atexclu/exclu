# hoo.be signup flow — findings & our parity plan (2026-04-15)

**Status:** product-decision captured. This is **not** a research task — the product owner manually tested the hoo.be signup flow on 2026-04-15 and the decisions below are final. The doc exists so future sessions can see why Phase 2 removes email confirmation and what the accepted trade-offs are.

## Summary

hoo.be ships a **one-step signup**: email + password → immediate redirect to onboarding. No verification email. No "check your inbox" screen. The new user is authenticated as soon as the form is submitted.

We are mirroring this flow exactly for Exclu. The explicit product decision is to prioritize signup conversion speed over signup identity assurance, and to accept the impersonation risk that comes with it.

## Observed behavior (product owner, browser-based test)

- **Verification email:** none
- **Time from submit → usable dashboard:** ~immediate (single round-trip)
- **Dashboard confirmation flow:** absent — the signed-in session starts on the first API call
- **Password requirements enforced client-side:** yes, but product decision is to match them in Supabase Auth config (min 10, lower/upper/digit/symbol, HIBP)

Network trace and bot-protection details were not captured beyond the above — the plan's original "Task 2.1 = research" framing has been superseded by the roadmap's 2026-04-15 product decisions block.

## Impersonation risk (accepted)

Without email verification, an attacker can create an Exclu account using an email address they do not control. For example, they could sign up `victim@gmail.com` without ever holding the inbox.

**Consequences we accept:**

1. The attacker's account exists but is useless to them as an identity — the real owner of `victim@gmail.com` can always use "Forgot password", which still requires access to the real inbox to complete the reset. So impersonation cannot be weaponized to lock a legitimate user out.
2. The attacker can squat a handle they don't own (e.g., `@realname`). This is mitigated by:
   - Cooldown window (5 min between completed signups from same IP/fingerprint)
   - IP-based rate limit (5 signups/hour)
   - Device fingerprint rate limit (3 signups/day)
   - Disposable-email blacklist (blocks throwaway-inbox farms)
   - Vercel BotID (blocks headless automation entirely)
3. An attacker cannot use the impersonated account to *authenticate* as anyone beyond themselves — there is no OAuth-based identity inheritance. The account is sandboxed from day one.

**Mitigations still in place post-Phase 2:**

- Password reset email (`auth_recovery` template) still requires control of the real inbox.
- Magic link email (`auth_magiclink` template) still requires control of the real inbox.
- Email-change flow (`auth_email_change` template) still requires control of both inboxes.
- Suspicious signups are logged to `signup_attempts` with IP, fingerprint, UA, outcome — admins can audit after-the-fact and soft-ban.

The trade-off is a deliberate one made by the product owner on 2026-04-15.

## Our parity plan (Phase 2)

1. **Disable Supabase `enable_confirmations`** in the hosted dashboard (Authentication → Providers → Email → Confirm email = OFF). This is the very last action of Phase 2 and is flipped manually by the product owner while Claude watches the logs.
2. **Replace the "check your inbox" UI state** in `src/pages/Auth.tsx` and `src/pages/FanSignup.tsx` with an immediate navigate to the post-signup destination (`/app/profile` for creators, `/fan` for fans). Remove the `email_not_confirmed` error branch entirely.
3. **Add the following hardening BEFORE flipping the toggle:**
   - Migration `134_signup_hardening.sql` — `signup_attempts` + `disposable_email_domains` tables, RLS via `public.is_admin()`
   - Seed `disposable_email_domains` from the `disposable-email-domains` open-source list (~3000 domains)
   - New edge function `check-signup-allowed` — IP rate limit, fingerprint rate limit, disposable blacklist, cooldown check, attempt logging, **fail-closed** on any infra error
   - Vercel BotID via a thin wrapper `api/check-signup-allowed.ts` (Vercel Function) that verifies the BotID token server-side and forwards to the Supabase edge function with a shared-secret header (`x-internal-secret` → `SIGNUP_CHECK_INTERNAL_SECRET`)
   - FingerprintJS on the client, passed as `device_fingerprint` in the preflight request
   - Supabase Auth config tightened: min password 10, lowercase+uppercase+digits+symbols, HIBP leaked-password check ON, OTP 6 chars / 900s expiration
4. **Offensive tests** (`scripts/offensive/test-signup-hardening.ts`) run against the LOCAL stack **before** any prod deploy, confirming: disposable blocked, IP rate limit kicks in, fingerprint rate limit kicks in, cooldown active, rate-limit helper fails closed when the DB is unreachable.

## Architecture decision — BotID wrapper

Vercel BotID can only be verified inside a Vercel Function runtime (via `@vercel/functions`), not inside a Supabase edge function. The signup preflight therefore has a **two-hop architecture**:

```
Client browser
  │
  │ POST https://exclu.at/api/check-signup-allowed
  │   body: { email, device_fingerprint, user_agent }
  │   (Vercel BotID token attached automatically by @vercel/botid client SDK)
  ▼
Vercel Function  api/check-signup-allowed.ts
  │ 1. Verify BotID token (fail-closed on any error)
  │ 2. Forward body to Supabase edge fn
  │    with header: x-internal-secret: $SIGNUP_CHECK_INTERNAL_SECRET
  ▼
Supabase edge fn  check-signup-allowed
  │ 1. Verify x-internal-secret header (fail-closed 401 if missing/wrong)
  │ 2. Extract IP, apply: disposable check, IP rate limit, FP rate limit, cooldown
  │ 3. Log attempt to signup_attempts
  │ 4. Return { allowed, reason? }
  ▼
Vercel Function passes the result back to the client
```

Why this shape:

- **Why not call BotID from inside Supabase edge fn?** Because BotID's token verification API is Vercel-runtime-specific — it reads request headers that only exist inside a Vercel Function. There is no stable public HTTPS `verify` endpoint that an external service can call.
- **Why not do everything in a Vercel Function?** Because the rate-limit / disposable / cooldown logic needs low-latency access to the Supabase DB, and we already have the helpers, migrations, and observability for Supabase edge functions. Duplicating that in Vercel Functions would be a maintenance burden.
- **Why the shared-secret header?** Without it, an attacker who discovers the Supabase edge fn URL could bypass BotID entirely by calling it directly. The shared secret, rotated via `supabase secrets set SIGNUP_CHECK_INTERNAL_SECRET=...`, makes the Supabase edge fn refuse any request that did not come from the Vercel wrapper. Not a silver bullet (anyone with read access to Vercel env vars has the secret) but raises the bar from "publicly callable" to "needs exfiltration first".

## Acknowledgments / open questions

- **Vercel BotID API version:** the implementation in Phase 2B will use the `@vercel/botid` client SDK and the Vercel Function-side verification API as documented at implementation time (via `vercel:vercel-agent` skill or Context7). If the API has evolved since 2026-04-15, the wrapper implementation adapts — the architecture stays.
- **Shared-secret rotation:** there is currently no scheduled rotation policy. If the secret is ever suspected compromised, rotate by running `supabase secrets set SIGNUP_CHECK_INTERNAL_SECRET=<new>` and updating `SIGNUP_CHECK_INTERNAL_SECRET` in Vercel env vars. Deploy in either order; a brief window where the two disagree will return 401s to signup attempts, which is fail-closed and therefore safe.
