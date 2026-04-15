# Phase 1 — Editable Email Templates: Deploy & Verify Runbook

## What changed since the first draft

This runbook has been revised to incorporate Fixes A, B, C, and D applied on top of the initial Phase 1 branch:

- **Fix A** — `send-auth-email` now verifies the Supabase Auth webhook HMAC via `standardwebhooks`. Requires the new `SEND_EMAIL_HOOK_SECRET` to be configured (see Step 0 below).
- **Fix B** — `send-chatter-invitation` restored the `custom_message` block and the "view profile" link via migration `133_update_chatter_invitation.sql`.
- **Fix C** — A dedicated deploy script `scripts/deploy-phase-1-mailing.sh` runs the full sequence in order, plus an end-to-end integration test at `supabase/functions/_shared/email_templates.integration.test.ts`.
- **Fix D** — `admin-email-templates` now returns proper HTTP status codes (400/401/403/404/500) with `{error, detail}` shapes instead of everything-is-500.

**Scope:** ships everything built under `feature/mailing-overhaul` commits `59ffe54..HEAD`. This is Phases 0 + 1 of the mailing system overhaul plan (`docs/superpowers/plans/2026-04-15-mailing-system-overhaul.md`).

**What this ships:**
- New DB tables: `email_templates`, `email_template_versions`, `rate_limit_buckets`
- 8 transactional templates seeded from the existing inline edge-function HTML
- 5 transactional edge functions (`send-auth-email`, `send-link-content-email`, `send-chatter-invitation`, `send-referral-invite`, `send-agency-contact`) refactored to load their templates from the DB
- Admin-only edge function `admin-email-templates` for CRUD + version history
- Admin UI at `/admin/emails/templates` with Monaco-based HTML editor + live preview

**What this does NOT ship** (deferred to later phases):
- Campaigns / newsletter
- Hi.exclu.at sending subdomain
- Fan email collection
- Signup hardening / removal of email confirmation
- Unsubscribe flow
- Bounce webhook

---

## Pre-deploy checklist

Before touching prod, verify locally:

- [ ] `git status` on the feature branch is clean
- [ ] `npm run build` succeeds
- [ ] `deno test --allow-all supabase/functions/_shared/` reports all Deno tests passing (24 tests: email_templates 4 + rate_limit 1 + standardwebhooks 10 + integration 9)
- [ ] `npm run test -- renderEmailTemplate` reports 3/3 passing
- [ ] Latest commit on branch reflects the Fix D HTTP error code hygiene pass
- [ ] Prod migration state is at `129` (no 130+): `supabase migration list --linked`

---

## Pre-deploy verification

Run the end-to-end integration test against a **local** Supabase stack (`supabase start` first). This exercises the full template load + render path for every seeded template and catches slug / variable drift before anything ships to prod.

Before running the integration test, export local credentials (the test reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment — the local service role key regenerates per `supabase start` and is not portable, so it is **not** hardcoded in the test file).

On **Supabase CLI ≥ 2.90**, `status -o env` exports the correctly prefixed vars directly:

```bash
eval "$(supabase status -o env)"
```

On **older CLIs (≤ 2.67)**, `status -o env` emits unprefixed names (`API_URL`, `SERVICE_ROLE_KEY`). Set the vars manually instead:

```bash
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY=$(supabase status 2>/dev/null | awk '/service_role key/ {print $NF}')
```

Then run the test:

```bash
deno test --allow-all supabase/functions/_shared/email_templates.integration.test.ts
```

Expected: all 9 integration cases pass. Requires the local DB to have migrations 130–133 applied (`supabase db reset` if unsure).

---

## Deploy sequence

**Order matters.** Do not skip steps. Each step is individually reversible.

### Recommended path — use the deploy script

A wrapper script runs Steps 1–5 below in the correct order, checks preconditions, and halts on any failure:

```bash
./scripts/deploy-phase-1-mailing.sh
```

This is the preferred path. The **Manual fallback** steps below document what the script does, and are the source of truth if you need to run a single step in isolation or recover from a partial failure.

---

### Step 0 — Configure `SEND_EMAIL_HOOK_SECRET` (Fix A)

**CRITICAL.** `send-auth-email` now verifies the Supabase Auth webhook signature using `standardwebhooks` HMAC. If this secret is missing when you deploy the function, **every password reset, magic link, and email confirmation will fail closed with HTTP 500** until the secret lands. Do this step BEFORE Step 2.

1. Open the Supabase Dashboard → **Authentication** → **Hooks** → **Send Email**.
2. Toggle the hook **enabled**.
3. Set the URL to:
   ```
   https://qexnwezetjlbwltyccks.supabase.co/functions/v1/send-auth-email
   ```
4. Supabase auto-generates a secret of the form `v1,whsec_...`. Copy it.
5. On your deploy machine:
   ```bash
   supabase secrets set SEND_EMAIL_HOOK_SECRET="v1,whsec_..."
   ```
6. Verify it lands:
   ```bash
   supabase secrets list | grep SEND_EMAIL_HOOK_SECRET
   ```

**Do not skip this step.** There is no graceful fallback — the function refuses to send any email without a valid signature.

---

### Step 1 — Apply migrations to prod

```bash
cd /Users/tb/Documents/TB\ Dev/Exclu.at/Exclu
git checkout feature/mailing-overhaul
supabase db push --linked
```

This pushes migrations `130_email_templates.sql`, `131_rate_limit_buckets.sql`, `132_seed_email_templates.sql`, and `133_update_chatter_invitation.sql` in order. Expect Supabase CLI to print the list of migrations being applied and exit 0.

Migration 133 (Fix B) restores the `custom_message` and `profile_link` placeholders on the `chatter_invitation` template that were dropped in the initial refactor.

**Verify:**
```bash
supabase migration list --linked | tail -10
```
Expected: rows for 130, 131, 132, 133 all present in the `Remote` column.

**Rollback if something goes wrong:** these migrations only CREATE new tables — they do not touch any existing table. To roll back:
```sql
drop table if exists public.email_template_versions cascade;
drop table if exists public.email_templates cascade;
drop table if exists public.rate_limit_buckets cascade;
drop function if exists public.email_templates_touch();
drop function if exists public.email_templates_snapshot();
drop function if exists public.rate_limit_check(text, integer, integer);
drop function if exists public.rate_limit_gc();
```
Then `delete from supabase_migrations.schema_migrations where version in ('130','131','132','133');` if you want the CLI to forget they were applied.

---

### Step 2 — Deploy the 5 refactored edge functions

**CRITICAL:** these functions now REQUIRE migration 132 to be applied (they load templates from `email_templates` by slug). If you deploy them before migration 132, every email send will fail with `Template not found`. Do Step 1 first.

```bash
supabase functions deploy send-auth-email
supabase functions deploy send-link-content-email
supabase functions deploy send-chatter-invitation
supabase functions deploy send-referral-invite
supabase functions deploy send-agency-contact
```

**Verify each deploy with a live send:**

1. **`send-auth-email`** — Trigger a password reset from the production `/auth` page with a test account. Confirm the email arrives in your inbox with the subject `Reset your Exclu password` (unchanged from before). Body should be visually identical to the previous template.

2. **`send-link-content-email`** — Make a test purchase of a cheap link with a test fan account (or directly hit the edge function endpoint with a valid `purchase_id`). Confirm the delivery email arrives with the subject `Your content from <creator>` and the download links visible.

3. **`send-chatter-invitation`** — Send a chatter invitation from a test creator account. The invitee should receive the email. The `custom_message` block and the "view profile" link are **both present** (restored by migration 133 / Fix B).

4. **`send-referral-invite`** — Send a referral from `/app/referral`. Confirm the invite arrives.

5. **`send-agency-contact`** — Submit the contact form on any agency directory page. Confirm the forwarding email arrives at the agency destination.

**Rollback if a function breaks:** redeploy the previous version from `main` branch. The old functions inline their HTML and don't depend on the new tables, so they'll work regardless of whether the migration was rolled back.

```bash
git checkout main -- supabase/functions/send-auth-email/index.ts
supabase functions deploy send-auth-email
# repeat for any broken function
git checkout feature/mailing-overhaul -- supabase/functions/send-auth-email/index.ts  # restore the feature branch state
```

---

### Step 3 — Deploy the new admin-email-templates edge function

```bash
supabase functions deploy admin-email-templates
```

Verify with a curl call from a machine where you can get an admin JWT:

```bash
ADMIN_JWT="<paste admin session access token>"
curl -s -X POST "https://qexnwezetjlbwltyccks.supabase.co/functions/v1/admin-email-templates" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}' | jq
```
Expected: JSON `{"templates": [...8 rows...]}` including `auth_signup`, `auth_recovery`, `auth_magiclink`, `auth_email_change`, `link_content_delivery`, `chatter_invitation`, `referral_invite`, `agency_contact`.

Test 403 for non-admins:
```bash
NON_ADMIN_JWT="<paste a regular creator JWT>"
curl -s -X POST "https://qexnwezetjlbwltyccks.supabase.co/functions/v1/admin-email-templates" \
  -H "Authorization: Bearer $NON_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}' -o /dev/stdout -w "\nHTTP %{http_code}\n"
```
Expected (Fix D): `{"error":"forbidden"}` with HTTP **403** status. Missing JWT returns **401**, bad input **400**, unknown slug on `get` returns **404**, and only truly unexpected DB errors return **500** (with body `{"error":"internal"}` — no leaked DB details).

**Rollback:** `supabase functions delete admin-email-templates`. The table remains; admins can still use raw SQL to edit templates.

---

### Step 4 — Deploy the frontend (Vercel)

```bash
cd /Users/tb/Documents/TB\ Dev/Exclu.at/Exclu
git checkout feature/mailing-overhaul
vercel --prod
```

Or, if you merge the feature branch to `main` first:
```bash
git checkout main
git merge --no-ff feature/mailing-overhaul
git push origin main
# Vercel auto-deploys
```

**Verify:**

1. Log in as an admin on the production app.
2. Navigate to `/admin/emails` — expect redirect to `/admin/emails/templates`.
3. Expect a table with 8 rows.
4. Click `Edit` on any row — expect the Monaco editor to open with HTML on the left and a live preview iframe on the right. The preview should populate with the sample data.

---

## Task 1.11 — End-to-end verification (run AFTER Steps 1–4)

This is the final acceptance test: prove that a template edit in the admin UI actually changes the email users receive.

### Step 1 — Edit a template in the UI

1. Navigate to `/admin/emails/templates/auth_recovery`.
2. In the Subject field, change `Reset your Exclu password` to `TEST — Reset your Exclu password`.
3. Click **Save**. The button should flip to "Saving…" and back. Reload the page — the edit should persist.

### Step 2 — Trigger a real password reset

1. Open an incognito window.
2. Go to `/auth` and use "Forgot password" with a test email you control.
3. Wait for the email.

### Step 3 — Confirm the subject matches

The email subject must read `TEST — Reset your Exclu password`. If it reads the original (`Reset your Exclu password`), one of the following is wrong:
- Migration 132 didn't apply → slug mismatch → check `supabase db execute "select slug from public.email_templates"`
- `send-auth-email` wasn't redeployed → still runs the old inline HTML → check function version in Supabase dashboard
- Caching of templates somewhere → `loadTemplate` fetches on every call, so this should not happen; if it does, open an investigation

### Step 4 — Revert

1. In the admin editor, change the subject back to `Reset your Exclu password`.
2. Click Save.
3. Optionally: open the Versions panel (once it's built in a future task) and confirm the 2 intermediate versions are visible.

### Step 5 — Mark Task 1.11 complete

No code commit for this step — it's a manual acceptance test. Record the test date in your deployment journal.

---

## Post-deploy monitoring (first 24h)

- [ ] Supabase function logs for any `Template not found:` errors → signals a slug mismatch or missed deploy
- [ ] Brevo dashboard for any rise in bounces or rendering errors
- [ ] Admin editor usage (who's editing what) via `email_template_versions` row creation rate
- [ ] Any user reports of malformed emails (broken links, missing variables, unstyled HTML)

---

## Known regressions (accepted)

1. **`send-chatter-invitation` `custom_message` + profile link:** Restored in migration 133; previously dropped in the initial refactor. No longer a regression.

2. **`send-link-content-email` introduces a new DB lookup for creator display name.** If `link.creator_id` is null (legacy data), the rendered email falls back to `"Exclu"` as the creator name. Acceptable fallback.

3. **`send-agency-contact` still uses a direct Brevo fetch** (not the shared `sendBrevoEmail` helper) to preserve the `replyTo` header that agencies use to reply to senders. A future task will extend `sendBrevoEmail` to accept `replyTo`.

---

## Security note

`send-auth-email` HMAC verification is now enforced via `SEND_EMAIL_HOOK_SECRET` (see Step 0). The function rejects any request whose `standardwebhooks` signature does not match, closing the pre-existing vulnerability where unauthenticated callers could trigger arbitrary auth emails.
