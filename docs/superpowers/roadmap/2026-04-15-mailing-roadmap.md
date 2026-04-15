# Mailing System Overhaul — Roadmap & Current State

**Last updated:** 2026-04-15 (end of Phase 1 backend deploy session)
**Master plan:** [`docs/superpowers/plans/2026-04-15-mailing-system-overhaul.md`](../plans/2026-04-15-mailing-system-overhaul.md)

This document is the **entry point for any new session** picking up this feature. It gives the current state of prod + worktree and the recommended execution order for the remaining work.

---

## What is currently LIVE in production

Deployed on `qexnwezetjlbwltyccks` (Supabase West EU Ireland) on 2026-04-15:

### Database
- Migration **130** — `email_templates` + `email_template_versions` tables with `SECURITY DEFINER` snapshot trigger + RLS via `public.is_admin()`
- Migration **131** — `rate_limit_buckets` table + atomic `rate_limit_check(key, limit, window_seconds)` RPC
- Migration **132** — 8 transactional templates seeded: `auth_signup`, `auth_recovery`, `auth_magiclink`, `auth_email_change`, `link_content_delivery`, `chatter_invitation`, `referral_invite`, `agency_contact`
- Migration **133** — `chatter_invitation` restored with `custom_message_html` + `profile_link_html` raw variables

### Edge functions (all deployed)
- `send-auth-email` — DB-backed templates + **HMAC signature verification** via `_shared/standardwebhooks.ts` (Fix A). Fails closed 401 if signature invalid or `SEND_EMAIL_HOOK_SECRET` missing
- `send-link-content-email` — DB-backed + creator name lookup
- `send-chatter-invitation` — DB-backed + conditional HTML blocks for custom message and profile link
- `send-referral-invite` — DB-backed
- `send-agency-contact` — DB-backed (preserves direct Brevo fetch for `replyTo`)
- `admin-email-templates` — CRUD + version history + restore, proper HTTP codes 400/401/403/404/500 with `{error, detail}` shapes

### Supabase secrets (all verified set)
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`
- `PUBLIC_SITE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `SEND_EMAIL_HOOK_SECRET` — **validated live** (password reset flow works end-to-end)

### Shared helpers on the feature branch
- `_shared/email_templates.ts` — `renderTemplate` + `loadTemplate`, Handlebars-style `{{var}}` / `{{{raw}}}` substitution with HTML escaping
- `_shared/standardwebhooks.ts` — Standard Webhooks HMAC-SHA256 verifier, constant-time signature comparison, 5-min timestamp tolerance
- `_shared/rate_limit.ts` — `buildBucketKey`, `checkRateLimit`, `extractClientIp`, `serviceRoleClient`

---

## What is NOT YET in production

### Phase 1 frontend (still on `feature/mailing-overhaul`, NOT merged to main)

These files are committed on the feature branch but Vercel hasn't deployed them:
- `src/pages/AdminEmails.tsx` — admin hub with 5-tab top bar + Templates/Campaigns/Contacts/Logs sub-tabs
- `src/pages/admin/AdminEmailTemplates.tsx` — template list with React Query
- `src/pages/admin/AdminEmailTemplateEdit.tsx` — Monaco split-pane editor (lazy-loaded) + live iframe preview
- Route wiring in `src/App.tsx`
- "Mailing" tab in `src/pages/AdminUsers.tsx` + "Emails" sidebar entry in `src/components/AppShell.tsx`
- `src/lib/adminEmails.ts` — API wrapper
- `src/lib/renderEmailTemplate.ts` — client-side mirror of the Deno renderer

**Consequence**: admins cannot visually edit templates in prod yet. They can still edit via direct DB UPDATE. Shipping the frontend is **Task #0** of the next session.

---

## Worktree state (as of 2026-04-15)

- Path: `/Users/tb/Documents/TB Dev/Exclu.at/Exclu/.worktrees/mailing-overhaul`
- Branch: `feature/mailing-overhaul`
- HEAD: `010da20` — `feat(admin): Mailing tab in AdminUsers + lazy Monaco + storageUtils fix + runbook clarification`
- 23 commits ahead of `main`
- Clean working tree (no uncommitted changes)
- **Supabase CLI linked** to `qexnwezetjlbwltyccks` from within the worktree
- Tests: 24 Deno passing (integration + unit) + 3 Vitest passing
- Build: clean (no storageUtils warning; 500 kB chunk warning is pre-existing, unrelated)

---

## Critical preflight facts for the next session (learned the hard way)

These corrections were discovered during Phase 1 preflight and are baked into the master plan, but the next session should double-check them before touching production:

1. **Admin check is `profiles.is_admin` (boolean) + `public.is_admin()` SQL function** — NOT `profiles.role = 'admin'`. Every new RLS policy must use `public.is_admin()` for consistency with existing migrations 122/123.

2. **Broken migration chain** — `supabase db reset` fails on `043_fix_purchases_rls_security.sql` because the `purchases` table is not created by any tracked migration (it was made via the dashboard before migrations were tracked). The workaround for local testing is:
   ```bash
   supabase db dump --linked --schema public -f /tmp/prod_schema.sql
   docker cp /tmp/prod_schema.sql supabase_db_Exclu:/tmp/
   docker exec supabase_db_Exclu psql -U postgres -d postgres -f /tmp/prod_schema.sql
   # Then apply new migrations one at a time via docker cp + psql -f
   ```
   The master plan documents this in the "Preflight corrections" section.

3. **Local Supabase stack container is named `supabase_db_Exclu`** (from the main repo), not `supabase_db_mailing-overhaul`. From the worktree, `supabase status` fails because it looks for the worktree-named container. Solution: export env vars from main repo before running tests from worktree:
   ```bash
   pushd /Users/tb/Documents/TB\ Dev/Exclu.at/Exclu
   export SUPABASE_URL="http://127.0.0.1:54321"
   export SUPABASE_SERVICE_ROLE_KEY="$(supabase status 2>&1 | awk '/Secret/ {print $NF}')"
   popd
   # Now run tests from the worktree
   ```

4. **Table names that exist vs don't**: `purchases` (with `buyer_email`), `tips` (with `fan_email`), `custom_requests` (with `fan_email`), `guest_sessions` (with `email`), `gift_purchases` (with `fan_name`, **needs** `fan_email` added in Phase 3). No `sales` or `creator_subscriptions` tables — subscription state is on `profiles.is_creator_subscribed` + `subscription_expires_at`.

5. **`mass_messages` table already exists** for in-app chat mass messaging (creator → fans). Do not confuse with the upcoming `email_campaigns` table for newsletters.

6. **Docker / OrbStack must be running** before any local DB verification. On macOS: `open -a OrbStack`.

---

## Remaining work — 5 phases (28 tasks)

### Priority order

**🚨 Task 0 (10 min, next session)** — Ship Phase 1 frontend
- Merge `feature/mailing-overhaul` → `main` (or open a GitHub PR for Vercel preview first)
- Push to origin → Vercel auto-deploy
- Smoke test: as admin, visit `/admin/emails/templates`, edit a test template, verify save works
- See [`docs/ops/phase-1-mailing-templates-deploy.md`](../../ops/phase-1-mailing-templates-deploy.md) → "Frontend deploy" section

**Phase 2** (HIGH priority, next session after Task 0) — Signup hardening + remove email confirm (**12 tasks**)
- User's explicit top priority per spec #15
- Critical security: must land all hardening pieces BEFORE flipping `enable_confirmations = false`
- Touches Supabase Auth dashboard config → no way to fully automate, needs human intervention
- Risk: breaks signup flow if not done right. Offensive tests (Task 6.1) must pass before go-live
- **This phase deserves its own dedicated session with a fresh preflight.**

**Phase 3** (MEDIUM priority) — Fan email collection (**5 tasks**)
- Independent of Phase 2, can be done in parallel or before
- Adds `mailing_contacts` + `mailing_contact_events` + `upsert_mailing_contact` RPC
- Instruments the 4 checkout flows + guest chat to capture fan emails
- Backfills existing users
- Low risk, no auth changes. Can be done in a session that's not Phase 2.

**Phase 4** (LOW effort, MEDIUM dependency) — `hi.exclu.at` subdomain setup (**1 task**)
- Produces a runbook only, no code
- User must execute DNS changes in Hostinger + Brevo dashboard actions
- Prerequisite for Phase 5 (campaigns use `Maria@hi.exclu.at` as sender)
- Can be done in parallel with Phase 3

**Phase 5** (BIG, depends on 3 + 4) — Campaigns + warmup + queue + bounce webhook + unsubscribe (**11 tasks**)
- Biggest phase. 4 new tables (`email_campaigns`, `email_campaign_sends`, `email_suppression_list`, `email_warmup_counters`)
- Warmup ramp (50/day → target over 14 days), Vercel cron drain every minute, Brevo bounce webhook, HMAC-signed unsubscribe tokens
- Dedicated session required. Senior review sweep at the end.

**Phase 6** (FINAL) — Offensive tests + go-live checklist (**2 tasks**)
- Offensive script that verifies signup hardening from Phase 2 is uncircumventable
- Master go-live checklist covering all phases
- Quick (~30 min) once Phase 2 + 3 + 5 are in place

### Recommended session structure

| Session | Scope | Duration estimate |
|---|---|---|
| **Session 1** (next) | Task 0 (ship Phase 1 frontend) + Phase 2 (hardening + remove confirm) | 2–4h |
| **Session 2** | Phase 3 (email collection) + Phase 4 (subdomain runbook) | 1–2h |
| **Session 3** | Phase 5 campaigns core (schema + segment + renderer + admin edge fn) | 2–3h |
| **Session 4** | Phase 5 queue drain + warmup + Brevo webhook + unsubscribe page | 2–3h |
| **Session 5** | Phase 6 offensive tests + final go-live | 1h |

Total: ~10h across 5 sessions. Each session produces independently shippable backend increments.

---

## Execution methodology (validated in Phase 1)

The next session should use the same approach:

1. **Preflight first** — verify schema assumptions against live prod DB via Supabase CLI + PostgREST queries. Correct the plan inline if drift is detected. Document corrections in a "Preflight corrections" block at the top of the plan or in this roadmap.

2. **Worktree isolation** — all code goes in the worktree, never touch the main repo directory for editing. The worktree is already linked to the Supabase project and has Docker-based local stack access via `supabase_db_Exclu`.

3. **TDD** for every unit of logic (Deno tests for edge helpers, Vitest for client code). Integration tests for DB-dependent flows.

4. **Subagent-driven development** — one implementer subagent per task with the `implementer-prompt.md` template, followed by **code review** and a **senior review sweep** at the end of each phase. This caught 4 critical + 8 important bugs in Phase 1 that would have shipped otherwise.

5. **Code review + senior sweep** — at minimum:
   - Spec compliance review after implementer (cheap, catches missed requirements)
   - Code quality review for any file touching security, auth, or RLS
   - Senior sweep at phase boundary looking for: timing leaks, error code leaks, rate-limit bypass, replay attacks, injection vectors, credential handling

6. **Fail closed by default** — any new auth check, verification, or security boundary should refuse to run without its required config. No silent fallbacks to "insecure but working".

7. **Human approval gates** — any action on shared state (git push to origin, Supabase secrets, production DB, production edge function deploy) requires explicit user authorization in the session. Preflight verifications are fine to do autonomously.

---

## File & path quick reference

| Thing | Path |
|---|---|
| Master plan | `docs/superpowers/plans/2026-04-15-mailing-system-overhaul.md` |
| This roadmap | `docs/superpowers/roadmap/2026-04-15-mailing-roadmap.md` |
| Phase 1 deploy runbook | `docs/ops/phase-1-mailing-templates-deploy.md` |
| Phase 1 deploy script | `scripts/deploy-phase-1-mailing.sh` |
| Worktree | `/Users/tb/Documents/TB Dev/Exclu.at/Exclu/.worktrees/mailing-overhaul` |
| Feature branch | `feature/mailing-overhaul` |
| CLAUDE.md | `CLAUDE.md` at repo root |
| Shared edge helpers | `supabase/functions/_shared/` |
| Supabase project ref | `qexnwezetjlbwltyccks` |
| Supabase URL | `https://qexnwezetjlbwltyccks.supabase.co` |
| Site URL | `https://exclu.at` |
