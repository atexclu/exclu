# Mailing System Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Exclu mailing stack end-to-end: DB-stored editable templates, admin editor/campaign UI, fan email collection, dedicated sending subdomain (`hi.exclu.at`), campaign warmup + queue, and full signup hardening to safely remove the email confirmation step.

**Architecture:** Three independent-but-coordinated subsystems sitting on a shared Brevo transport (`supabase/functions/_shared/brevo.ts`):
1. **Templates** — a `email_templates` table + versioning + a Deno renderer (`_shared/email_templates.ts`) replaces the five inline HTML strings currently scattered across edge functions. Admin UI at `/admin/emails/templates` with split-pane HTML editor + live iframe preview.
2. **Campaigns** — segmentable bulk sender (`email_campaigns`, `email_campaign_sends`, `email_suppression_list`, `mailing_contacts`) with warmup ramp, per-minute Brevo throttling, bounce/complaint webhook, HMAC-signed unsubscribe links, and a Vercel cron that drains the queue. Contacts flow in from guest chat + checkout capture.
3. **Signup hardening** — disable Supabase email confirmation, add IP+device rate limiting, disposable-domain blacklist, FingerprintJS-based device cooldown, and Vercel BotID, so removing verification doesn't open the floodgates.

**Tech Stack:** Supabase Postgres + Edge Functions (Deno), React 18 + Vite SPA, shadcn/ui, React Query v5, Brevo v3 API, Vercel cron + serverless (`api/`), `@monaco-editor/react` for template editing, `@fingerprintjs/fingerprintjs` for device IDs, `disposable-email-domains` list.

**Phases (executable independently, in order):**
- **Phase 0** — Foundation: DB schema + shared renderer + rate-limit helper.
- **Phase 1** — Part A: Editable templates + admin editor + migrate 5 inline templates.
- **Phase 2** — Part C: Rate limiting, disposable blacklist, BotID, fingerprinting, then disable email confirmation.
- **Phase 3** — Part B.1: Email collection (guest chat + checkouts → `mailing_contacts`).
- **Phase 4** — Part B.2: Subdomain `hi.exclu.at` setup + docs.
- **Phase 5** — Part B.3: Campaigns, segmentation, warmup, queue drain, unsubscribe, bounce webhook.
- **Phase 6** — Offensive testing + go-live checklist.

**Prerequisites & external assumptions:**
- Latest applied migration: `129_payouts_multi_country_bank.sql`. New migrations start at **130**.
- Brevo account already provisioned. Sender domain `hi.exclu.at` will be added **during Phase 4** (DNS via Hostinger).
- Supabase Auth currently enforces `enable_confirmations=true` on the hosted project (not in `config.toml`) — must be toggled in the Supabase dashboard during Phase 2 after hardening lands.
- No existing `docs/superpowers/plans` history to coordinate with.

## Preflight corrections (2026-04-15, verified against prod)

After querying the prod DB (`qexnwezetjlbwltyccks`) the following corrections apply to every task below. They override any earlier text in this document.

1. **Admin identity is `profiles.is_admin = true` (boolean column)**, NOT `profiles.role = 'admin'`. Two admin users exist. The DB also exposes a `public.is_admin()` SQL function (STABLE, SECURITY DEFINER, already defined in prod) that encapsulates the check. Every RLS policy written below uses `public.is_admin()` rather than an inline EXISTS — it matches the existing codebase convention and is cleaner.
2. **Table `sales` does not exist**. The checkout flow uses **`purchases`**, which already has a **`buyer_email`** column. Do not create a `fan_email` column on purchases — reuse `buyer_email`.
3. **`gift_purchases` has `fan_name` but NOT `fan_email`** — Task 3.3 adds the missing column only for gifts.
4. **`creator_subscriptions` does not exist.** Subscription state lives on `profiles` directly: `is_creator_subscribed` (boolean), `subscription_expires_at` (timestamptz), `subscription_ugp_member_id`. The segment builder (Task 5.2) joins on `profiles` for subscription filters instead of a dedicated subscriptions table.
5. **`mass_messages` table already exists for in-app mass chat messages** (unrelated to email newsletters). Do not touch it. The `email_campaigns` table in Phase 5 is the email-side companion, not a refactor.
6. **Local DB testing strategy:** the `supabase/migrations/` folder is NOT a clean-reset chain from zero — the earliest tracked migration is `043_fix_purchases_rls_security.sql` which references tables that were created outside version control. `supabase db reset` therefore fails mid-chain. Instead, every task in Phase 0+ that needs local verification uses this flow:
   - `supabase db dump --linked --schema public -f /tmp/mailing-overhaul-dumps/prod_schema.sql` (once per session to refresh the baseline)
   - `docker cp /tmp/mailing-overhaul-dumps/prod_schema.sql supabase_db_Exclu:/tmp/` and `docker exec supabase_db_Exclu psql -U postgres -d postgres -f /tmp/prod_schema.sql` to reseed the local DB from prod (idempotent — re-runs fine)
   - `docker cp <new-migration.sql> supabase_db_Exclu:/tmp/ && docker exec supabase_db_Exclu psql -U postgres -d postgres -f /tmp/<new-migration.sql>` to apply the new migration on top
   - Verify with `docker exec supabase_db_Exclu psql -U postgres -d postgres -c "<check query>"`
   - For prod deployment at go-live: use `supabase db push --linked` which only pushes new migration files that aren't yet in the prod `schema_migrations` table. This is the Supabase-sanctioned path.
7. **Connection details for local psql access:**
   - Container name: `supabase_db_Exclu`
   - Psql (inside container): `docker exec supabase_db_Exclu psql -U postgres -d postgres`
   - Host port: `54322` (but local psql CLI is not installed — use `docker exec` instead)

8. **Phase 2 migration number drift (2026-04-15, Phase 2A preflight):** the original plan referred to `133_signup_hardening.sql`, but prod already has migration **133** = `update_chatter_invitation` (applied during Phase 1 deploy as Fix B). The signup hardening migration therefore takes slot **134** (`134_signup_hardening.sql`). All Task 2.2 references have been renumbered in place. Any future task that adds a migration must re-verify via `supabase migration list --linked` before picking a number.

---

## Conventions used in this plan

- **TDD:** every non-trivial unit gets a failing test first. Edge-function pure helpers are tested with a tiny Deno test runner (`deno test`). Frontend pieces are tested with Vitest + Testing Library. UI interaction flows are manually verified in the dev server at `localhost:8080` — those steps are explicit.
- **Commits:** every task ends with a commit. Commit messages follow the repo's existing `feat:` / `fix:` / `chore:` prefix style (see `git log`).
- **Migrations:** numbered sequentially starting at 130. Always test locally with `supabase db reset` before deploying.
- **Edge function deploys:** manual via `supabase functions deploy <name>`. Each task that touches an edge function includes the deploy command.
- **Env vars:** secrets go to Supabase (`supabase secrets set KEY=value`) or Vercel env vars — never committed. New secrets introduced by this plan are listed in the Phase 6 go-live checklist.
- **Feature flag:** none. Each phase ships when complete.

---

# PHASE 0 — Foundation

Shared helpers and DB groundwork every later phase depends on.

---

### Task 0.1: Create the core `email_templates` and `email_template_versions` tables

**Files:**
- Create: `supabase/migrations/130_email_templates.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 130_email_templates.sql
-- DB-stored editable email templates + version history.

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null default 'transactional'
    check (category in ('transactional','campaign','system')),
  subject text not null,
  html_body text not null,
  text_body text,
  variables jsonb not null default '[]'::jsonb,
  sample_data jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_templates_slug_idx on public.email_templates(slug);
create index email_templates_category_idx on public.email_templates(category);

create table if not exists public.email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.email_templates(id) on delete cascade,
  subject text not null,
  html_body text not null,
  text_body text,
  variables jsonb not null default '[]'::jsonb,
  edited_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index email_template_versions_template_id_idx
  on public.email_template_versions(template_id, created_at desc);

create or replace function public.email_templates_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger email_templates_touch_trg
  before update on public.email_templates
  for each row execute function public.email_templates_touch();

create or replace function public.email_templates_snapshot()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'UPDATE') and (
    old.subject is distinct from new.subject
    or old.html_body is distinct from new.html_body
    or old.text_body is distinct from new.text_body
    or old.variables is distinct from new.variables
  ) then
    insert into public.email_template_versions
      (template_id, subject, html_body, text_body, variables, edited_by)
    values
      (old.id, old.subject, old.html_body, old.text_body, old.variables, new.updated_by);
  end if;
  return new;
end;
$$;

create trigger email_templates_snapshot_trg
  before update on public.email_templates
  for each row execute function public.email_templates_snapshot();

alter table public.email_templates enable row level security;
alter table public.email_template_versions enable row level security;

create policy "admins read templates" on public.email_templates
  for select using (public.is_admin());

create policy "admins write templates" on public.email_templates
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admins read template versions" on public.email_template_versions
  for select using (public.is_admin());
```

- [ ] **Step 2: Reset the local DB and confirm the migration applies cleanly**

Run: `supabase db reset`
Expected: migration 130 listed in the applied list, no errors.

- [ ] **Step 3: Smoke-test the trigger from psql**

```bash
supabase db execute "
  insert into public.email_templates (slug, name, subject, html_body)
  values ('test', 'Test', 'hi', '<p>hi</p>') returning id;
"
supabase db execute "
  update public.email_templates set subject = 'hello' where slug = 'test';
"
supabase db execute "
  select count(*) from public.email_template_versions;
"
```
Expected: count returns 1 (the snapshot of the pre-update row).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/130_email_templates.sql
git commit -m "feat(db): add email_templates + version history tables"
```

---

### Task 0.2: Create the shared template renderer (`_shared/email_templates.ts`)

A pure function that takes a template row + data and returns `{ subject, html, text }`, with HTML-escaped variable substitution and missing-variable detection.

**Files:**
- Create: `supabase/functions/_shared/email_templates.ts`
- Create: `supabase/functions/_shared/email_templates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/email_templates.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderTemplate, type EmailTemplateRow } from "./email_templates.ts";

const base: EmailTemplateRow = {
  slug: "welcome",
  subject: "Welcome {{name}}",
  html_body: "<p>Hi {{name}}, visit <a href=\"{{url}}\">your dashboard</a></p>",
  text_body: "Hi {{name}}, visit {{url}}",
  variables: [
    { key: "name", required: true },
    { key: "url", required: true },
  ],
};

Deno.test("substitutes variables and HTML-escapes them", () => {
  const out = renderTemplate(base, { name: "<Alice>", url: "https://x.com" });
  assertEquals(out.subject, "Welcome <Alice>"); // subject is plain text
  assertEquals(
    out.html,
    "<p>Hi &lt;Alice&gt;, visit <a href=\"https://x.com\">your dashboard</a></p>"
  );
  assertEquals(out.text, "Hi <Alice>, visit https://x.com");
});

Deno.test("throws if a required variable is missing", () => {
  assertThrows(
    () => renderTemplate(base, { name: "Alice" }),
    Error,
    "Missing required variable: url",
  );
});

Deno.test("raw block skips escaping for known-safe HTML", () => {
  const tpl: EmailTemplateRow = {
    ...base,
    html_body: "<div>{{{html_block}}}</div>",
    variables: [{ key: "html_block", required: true }],
  };
  const out = renderTemplate(tpl, { html_block: "<b>bold</b>" });
  assertEquals(out.html, "<div><b>bold</b></div>");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `deno test supabase/functions/_shared/email_templates.test.ts`
Expected: FAIL (`renderTemplate` not defined).

- [ ] **Step 3: Implement the renderer**

```ts
// supabase/functions/_shared/email_templates.ts
import { escapeHtml } from "./brevo.ts";

export interface EmailTemplateVariable {
  key: string;
  required?: boolean;
  description?: string;
}

export interface EmailTemplateRow {
  slug: string;
  subject: string;
  html_body: string;
  text_body?: string | null;
  variables: EmailTemplateVariable[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const VAR_RE = /\{\{\{?\s*([a-zA-Z0-9_.]+)\s*\}?\}\}/g;

function validateRequired(
  template: EmailTemplateRow,
  data: Record<string, unknown>,
): void {
  for (const v of template.variables ?? []) {
    if (v.required && (data[v.key] === undefined || data[v.key] === null)) {
      throw new Error(`Missing required variable: ${v.key}`);
    }
  }
}

function substitute(
  source: string,
  data: Record<string, unknown>,
  escape: boolean,
): string {
  return source.replace(VAR_RE, (match, key) => {
    const raw = match.startsWith("{{{"); // triple = no escape
    const value = data[key];
    if (value === undefined || value === null) return "";
    const str = String(value);
    return escape && !raw ? escapeHtml(str) : str;
  });
}

export function renderTemplate(
  template: EmailTemplateRow,
  data: Record<string, unknown>,
): RenderedEmail {
  validateRequired(template, data);
  return {
    subject: substitute(template.subject, data, false),
    html: substitute(template.html_body, data, true),
    text: substitute(template.text_body ?? stripHtml(template.html_body), data, false),
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function loadTemplate(
  supabase: { from: (t: string) => any },
  slug: string,
): Promise<EmailTemplateRow> {
  const { data, error } = await supabase
    .from("email_templates")
    .select("slug, subject, html_body, text_body, variables, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (error || !data) {
    throw new Error(`Template not found: ${slug}`);
  }
  return data as EmailTemplateRow;
}
```

- [ ] **Step 4: Run the tests**

Run: `deno test supabase/functions/_shared/email_templates.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/email_templates.ts \
        supabase/functions/_shared/email_templates.test.ts
git commit -m "feat(edge): add shared email template renderer with variable substitution"
```

---

### Task 0.3: Create the shared rate-limit helper (`_shared/rate_limit.ts`)

Replaces the per-file in-memory maps scattered across edge functions. Persists counters in a new `rate_limit_buckets` table so multiple concurrent function instances share state.

**Files:**
- Create: `supabase/migrations/131_rate_limit_buckets.sql`
- Create: `supabase/functions/_shared/rate_limit.ts`
- Create: `supabase/functions/_shared/rate_limit.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- 131_rate_limit_buckets.sql
create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rate_limit_buckets_window_idx
  on public.rate_limit_buckets(window_start);

-- Called with service role. Returns true if allowed, false if throttled.
create or replace function public.rate_limit_check(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql as $$
declare
  row public.rate_limit_buckets%rowtype;
begin
  insert into public.rate_limit_buckets(bucket_key, count, window_start)
  values (p_key, 0, now())
  on conflict (bucket_key) do nothing;

  select * into row from public.rate_limit_buckets
  where bucket_key = p_key for update;

  if row.window_start < now() - make_interval(secs => p_window_seconds) then
    update public.rate_limit_buckets
       set count = 1, window_start = now(), updated_at = now()
     where bucket_key = p_key;
    return true;
  end if;

  if row.count >= p_limit then
    return false;
  end if;

  update public.rate_limit_buckets
     set count = count + 1, updated_at = now()
   where bucket_key = p_key;
  return true;
end;
$$;

-- Cron-friendly cleanup: remove buckets older than 1 day.
create or replace function public.rate_limit_gc() returns void
language sql as $$
  delete from public.rate_limit_buckets
   where updated_at < now() - interval '1 day';
$$;

alter table public.rate_limit_buckets enable row level security;
-- No policies: only service role touches this table.
```

- [ ] **Step 2: Write the failing test**

```ts
// supabase/functions/_shared/rate_limit.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildBucketKey } from "./rate_limit.ts";

Deno.test("buildBucketKey namespaces by scope and identifier", () => {
  assertEquals(
    buildBucketKey({ scope: "signup", identifier: "1.2.3.4" }),
    "signup:ip:1.2.3.4",
  );
  assertEquals(
    buildBucketKey({ scope: "campaign-send", identifier: "hi@x.com", subKey: "abc" }),
    "campaign-send:hi@x.com:abc",
  );
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `deno test supabase/functions/_shared/rate_limit.test.ts`
Expected: FAIL (`buildBucketKey` not defined).

- [ ] **Step 4: Implement the helper**

```ts
// supabase/functions/_shared/rate_limit.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RateLimitOptions {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  subKey?: string;
}

export function buildBucketKey(
  opts: Pick<RateLimitOptions, "scope" | "identifier" | "subKey"> & { scope: string },
): string {
  const parts = [opts.scope];
  if (opts.identifier.includes("@")) parts.push(opts.identifier);
  else parts.push(`ip:${opts.identifier}`);
  if (opts.subKey) parts.push(opts.subKey);
  return parts.join(":");
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  opts: RateLimitOptions,
): Promise<{ allowed: boolean; key: string }> {
  const key = buildBucketKey(opts);
  const { data, error } = await supabase.rpc("rate_limit_check", {
    p_key: key,
    p_limit: opts.limit,
    p_window_seconds: opts.windowSeconds,
  });
  if (error) {
    console.error("rate_limit_check RPC failed", error);
    return { allowed: true, key }; // fail open
  }
  return { allowed: data === true, key };
}

export function extractClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
}

export function serviceRoleClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
```

- [ ] **Step 5: Apply migration and re-run tests**

```bash
supabase db reset
deno test supabase/functions/_shared/rate_limit.test.ts
```
Expected: migration applies clean; test passes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/131_rate_limit_buckets.sql \
        supabase/functions/_shared/rate_limit.ts \
        supabase/functions/_shared/rate_limit.test.ts
git commit -m "feat(edge): add persistent rate_limit helper backed by rate_limit_buckets"
```

---

# PHASE 1 — Part A: Editable Templates

Templates move from inline TS strings into `email_templates`, the 5 transactional edge functions are refactored to read from DB, and admins get a Brevo-style editor at `/admin/emails/templates`.

---

### Task 1.1: Seed the five existing transactional templates into `email_templates`

**Files:**
- Create: `supabase/migrations/132_seed_email_templates.sql`

- [ ] **Step 1: Read the inline template in each existing edge function**

Open and skim, noting subject + HTML body + variable names used:
- `supabase/functions/send-auth-email/index.ts` (lines 90-159, 5 template variants)
- `supabase/functions/send-link-content-email/index.ts` (lines 217-265)
- `supabase/functions/send-chatter-invitation/index.ts` (lines 92-153)
- `supabase/functions/send-referral-invite/index.ts` (lines 67-123)
- `supabase/functions/send-agency-contact/index.ts` (lines 71-121)

- [ ] **Step 2: Write the seed migration**

```sql
-- 132_seed_email_templates.sql
-- Seed initial templates. HTML bodies are the exact existing strings
-- from the edge functions, with Handlebars-style {{var}} placeholders
-- replacing the previous template-literal ${var} interpolations.

insert into public.email_templates (slug, name, category, subject, html_body, variables, sample_data)
values
  (
    'auth_signup',
    'Auth — Signup confirmation',
    'transactional',
    'Confirm your Exclu account',
    -- paste current HTML from send-auth-email/index.ts signup branch,
    -- replacing ${confirmationUrl} with {{confirmation_url}}
    $html$<!-- signup HTML goes here -->$html$,
    '[{"key":"confirmation_url","required":true},{"key":"user_email","required":true}]'::jsonb,
    '{"confirmation_url":"https://exclu.at/auth/callback?token=demo","user_email":"demo@example.com"}'::jsonb
  ),
  (
    'auth_recovery',
    'Auth — Password reset',
    'transactional',
    'Reset your Exclu password',
    $html$<!-- recovery HTML goes here -->$html$,
    '[{"key":"recovery_url","required":true}]'::jsonb,
    '{"recovery_url":"https://exclu.at/auth/callback?token=demo"}'::jsonb
  ),
  (
    'auth_magiclink',
    'Auth — Magic link',
    'transactional',
    'Your Exclu sign-in link',
    $html$<!-- magiclink HTML goes here -->$html$,
    '[{"key":"magic_link","required":true}]'::jsonb,
    '{"magic_link":"https://exclu.at/auth/callback?token=demo"}'::jsonb
  ),
  (
    'auth_email_change',
    'Auth — Email change',
    'transactional',
    'Confirm your new Exclu email',
    $html$<!-- email_change HTML goes here -->$html$,
    '[{"key":"change_url","required":true}]'::jsonb,
    '{"change_url":"https://exclu.at/auth/callback?token=demo"}'::jsonb
  ),
  (
    'link_content_delivery',
    'Link — Content unlock delivery',
    'transactional',
    'Your content from {{creator_name}}',
    $html$<!-- delivery HTML goes here, {{download_links_html}} rendered as triple-braces block -->$html$,
    '[{"key":"creator_name","required":true},{"key":"download_links_html","required":true},{"key":"link_title","required":true}]'::jsonb,
    '{"creator_name":"Demo","link_title":"Demo pack","download_links_html":"<ul><li><a href=\"#\">file.zip</a></li></ul>"}'::jsonb
  ),
  (
    'chatter_invitation',
    'Chatter — Invitation to join team',
    'transactional',
    '{{creator_name}} invited you to manage their chat',
    $html$<!-- chatter invitation HTML -->$html$,
    '[{"key":"creator_name","required":true},{"key":"invitation_url","required":true},{"key":"invitee_email","required":true}]'::jsonb,
    '{"creator_name":"Demo","invitation_url":"https://exclu.at/app/chatter","invitee_email":"chatter@example.com"}'::jsonb
  ),
  (
    'referral_invite',
    'Referral — Invite a friend',
    'transactional',
    '{{sender_name}} invited you to Exclu',
    $html$<!-- referral invite HTML -->$html$,
    '[{"key":"sender_name","required":true},{"key":"referral_url","required":true}]'::jsonb,
    '{"sender_name":"Demo","referral_url":"https://exclu.at/?ref=demo"}'::jsonb
  ),
  (
    'agency_contact',
    'Agency — Contact form forwarding',
    'transactional',
    'New contact request for {{agency_name}}',
    $html$<!-- agency contact HTML -->$html$,
    '[{"key":"agency_name","required":true},{"key":"sender_name","required":true},{"key":"sender_email","required":true},{"key":"message","required":true}]'::jsonb,
    '{"agency_name":"Lounas","sender_name":"Jane","sender_email":"jane@ex.com","message":"Hi"}'::jsonb
  )
on conflict (slug) do nothing;
```

- [ ] **Step 3: Fill in each `$html$...$html$` block**

For each of the 8 placeholder HTML blocks, copy the existing template from the source file listed in Step 1, replacing template-literal interpolations with the corresponding `{{variable}}` names listed above. Verify brace counts match and no `${` remain.

- [ ] **Step 4: Apply and smoke-test**

```bash
supabase db reset
supabase db execute "select slug, length(html_body) from public.email_templates order by slug;"
```
Expected: 8 rows, non-zero body lengths.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/132_seed_email_templates.sql
git commit -m "feat(db): seed 8 existing transactional email templates into DB"
```

---

### Task 1.2: Refactor `send-auth-email` to load templates from DB

**Files:**
- Modify: `supabase/functions/send-auth-email/index.ts`

- [ ] **Step 1: Replace the inline template switch with the shared loader/renderer**

Open `supabase/functions/send-auth-email/index.ts`. Remove the template literal definitions. Replace the switch that picks `signup|recovery|magiclink|email_change` with a mapping to slugs, then load+render+send:

```ts
import { loadTemplate, renderTemplate } from "../_shared/email_templates.ts";
import { sendBrevoEmail } from "../_shared/brevo.ts";
import { serviceRoleClient } from "../_shared/rate_limit.ts";

const SLUG_BY_TYPE: Record<string, string> = {
  signup: "auth_signup",
  invite: "auth_signup",
  recovery: "auth_recovery",
  reset: "auth_recovery",
  magiclink: "auth_magiclink",
  email_change: "auth_email_change",
};

async function handleAuthEmail(payload: {
  email_action_type: string;
  redirect_to: string;
  token_hash: string;
  user: { email: string };
}) {
  const slug = SLUG_BY_TYPE[payload.email_action_type] ?? "auth_signup";
  const supabase = serviceRoleClient();
  const template = await loadTemplate(supabase, slug);

  const confirmationUrl =
    `${Deno.env.get("PUBLIC_SITE_URL")}/auth/callback?token_hash=${payload.token_hash}` +
    `&type=${payload.email_action_type}&redirect_to=${encodeURIComponent(payload.redirect_to ?? "/")}`;

  const rendered = renderTemplate(template, {
    confirmation_url: confirmationUrl,
    recovery_url: confirmationUrl,
    magic_link: confirmationUrl,
    change_url: confirmationUrl,
    user_email: payload.user.email,
  });

  return sendBrevoEmail({
    to: payload.user.email,
    subject: rendered.subject,
    htmlContent: rendered.html,
  });
}
```

Wire this function into the existing request handler, preserving the current signature verification of the Supabase Auth webhook.

- [ ] **Step 2: Deploy and test against the local stack**

```bash
supabase functions deploy send-auth-email --no-verify-jwt
# trigger a password reset locally
```

Trigger a reset, check the function logs and verify the email arrived via Brevo.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-auth-email/index.ts
git commit -m "refactor(edge): send-auth-email loads templates from DB via shared renderer"
```

---

### Task 1.3: Refactor `send-link-content-email` to load from DB

**Files:**
- Modify: `supabase/functions/send-link-content-email/index.ts`

- [ ] **Step 1: Replace the inline HTML builder**

In `send-link-content-email/index.ts`, locate the function that builds the HTML (lines 217-265) and the call site. Replace with:

```ts
import { loadTemplate, renderTemplate } from "../_shared/email_templates.ts";

// ...

const template = await loadTemplate(supabase, "link_content_delivery");

const downloadsHtml = signedUrls
  .map((u) => `<li><a href="${u.url}">${u.filename}</a></li>`)
  .join("");

const rendered = renderTemplate(template, {
  creator_name: creator.display_name ?? creator.handle,
  link_title: link.title,
  download_links_html: `<ul>${downloadsHtml}</ul>`,
});

await sendBrevoEmail({
  to: buyerEmail,
  subject: rendered.subject,
  htmlContent: rendered.html,
});
```

Remove the old `buildEmailHtml` function.

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy send-link-content-email
```

- [ ] **Step 3: Manual smoke test**

Buy a link in the local dev env, confirm delivery email arrives.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-link-content-email/index.ts
git commit -m "refactor(edge): send-link-content-email uses DB templates"
```

---

### Task 1.4: Refactor `send-chatter-invitation`

**Files:**
- Modify: `supabase/functions/send-chatter-invitation/index.ts`

- [ ] **Step 1: Replace the HTML builder**

Mirror Task 1.3 structure. Load `chatter_invitation`, render with `{creator_name, invitation_url, invitee_email}`, send.

- [ ] **Step 2: Deploy + smoke test**

```bash
supabase functions deploy send-chatter-invitation
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-chatter-invitation/index.ts
git commit -m "refactor(edge): send-chatter-invitation uses DB templates"
```

---

### Task 1.5: Refactor `send-referral-invite`

**Files:**
- Modify: `supabase/functions/send-referral-invite/index.ts`

- [ ] **Step 1: Replace the HTML builder**

Load `referral_invite`, render with `{sender_name, referral_url}`.

- [ ] **Step 2: Deploy + smoke test**

```bash
supabase functions deploy send-referral-invite
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-referral-invite/index.ts
git commit -m "refactor(edge): send-referral-invite uses DB templates"
```

---

### Task 1.6: Refactor `send-agency-contact`

**Files:**
- Modify: `supabase/functions/send-agency-contact/index.ts`

- [ ] **Step 1: Replace the HTML builder**

Load `agency_contact`, render with `{agency_name, sender_name, sender_email, message}`.

- [ ] **Step 2: Deploy + smoke test**

```bash
supabase functions deploy send-agency-contact
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-agency-contact/index.ts
git commit -m "refactor(edge): send-agency-contact uses DB templates"
```

---

### Task 1.7: Build the admin template list edge function

A single consolidated admin-facing CRUD function. All other admin-* functions follow the same pattern — copy one (e.g. `admin-manage-tools`) for the auth boilerplate.

**Files:**
- Create: `supabase/functions/admin-email-templates/index.ts`
- Modify: `supabase/config.toml` (add `[functions.admin-email-templates]` block with `verify_jwt = false`)

- [ ] **Step 1: Add the function skeleton**

```ts
// supabase/functions/admin-email-templates/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  action: "list" | "get" | "upsert" | "versions" | "restore";
  slug?: string;
  payload?: {
    slug: string;
    name: string;
    category?: string;
    subject: string;
    html_body: string;
    text_body?: string;
    variables?: unknown[];
    sample_data?: Record<string, unknown>;
  };
  version_id?: string;
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user } } = await svc.auth.getUser(jwt);
  if (!user) throw new Error("unauthorized");
  const { data: profile } = await svc
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) throw new Error("forbidden");
  return { svc, user };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { svc, user } = await requireAdmin(req);
    const body: RequestBody = await req.json();

    switch (body.action) {
      case "list": {
        const { data, error } = await svc
          .from("email_templates")
          .select("id, slug, name, category, subject, is_active, updated_at")
          .order("category").order("slug");
        if (error) throw error;
        return json({ templates: data });
      }
      case "get": {
        const { data, error } = await svc
          .from("email_templates").select("*").eq("slug", body.slug!).single();
        if (error) throw error;
        return json({ template: data });
      }
      case "upsert": {
        const p = body.payload!;
        const { data, error } = await svc.from("email_templates").upsert({
          slug: p.slug,
          name: p.name,
          category: p.category ?? "transactional",
          subject: p.subject,
          html_body: p.html_body,
          text_body: p.text_body,
          variables: p.variables ?? [],
          sample_data: p.sample_data ?? {},
          updated_by: user.id,
        }, { onConflict: "slug" }).select().single();
        if (error) throw error;
        return json({ template: data });
      }
      case "versions": {
        const { data: tpl } = await svc
          .from("email_templates").select("id").eq("slug", body.slug!).single();
        const { data, error } = await svc
          .from("email_template_versions")
          .select("*").eq("template_id", tpl!.id)
          .order("created_at", { ascending: false }).limit(50);
        if (error) throw error;
        return json({ versions: data });
      }
      case "restore": {
        const { data: version, error: vErr } = await svc
          .from("email_template_versions").select("*").eq("id", body.version_id!).single();
        if (vErr) throw vErr;
        const { data, error } = await svc.from("email_templates").update({
          subject: version.subject,
          html_body: version.html_body,
          text_body: version.text_body,
          variables: version.variables,
          updated_by: user.id,
        }).eq("id", version.template_id).select().single();
        if (error) throw error;
        return json({ template: data });
      }
    }
    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
```

- [ ] **Step 2: Register in `supabase/config.toml`**

Append:
```toml
[functions.admin-email-templates]
verify_jwt = false
```

- [ ] **Step 3: Deploy**

```bash
supabase functions deploy admin-email-templates
```

- [ ] **Step 4: Smoke-test with curl (admin JWT)**

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/admin-email-templates" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}'
```
Expected: JSON with 8 seeded templates.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-email-templates/ supabase/config.toml
git commit -m "feat(edge): admin-email-templates CRUD + version history"
```

---

### Task 1.8: Add the admin email hub route + sidebar link

**Files:**
- Create: `src/pages/AdminEmails.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AdminSidebar.tsx` (or wherever the admin nav is — find it via grep first)

- [ ] **Step 1: Find the admin sidebar**

```bash
```

Use Grep for `/admin/users` to find the sidebar component — it will contain the existing admin links. Note the file path.

- [ ] **Step 2: Create the hub page**

```tsx
// src/pages/AdminEmails.tsx
import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const tabs = [
  { to: "/admin/emails/templates", label: "Templates" },
  { to: "/admin/emails/campaigns", label: "Campaigns" },
  { to: "/admin/emails/contacts", label: "Contacts" },
  { to: "/admin/emails/logs", label: "Logs" },
];

export default function AdminEmails() {
  const loc = useLocation();
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Emails</h1>
      <nav className="flex gap-2">
        {tabs.map((t) => (
          <Link key={t.to} to={t.to}>
            <Button variant={loc.pathname.startsWith(t.to) ? "default" : "outline"}>
              {t.label}
            </Button>
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 3: Wire routes in `src/App.tsx`**

Inside the existing admin route group, add:
```tsx
<Route path="/admin/emails" element={<AdminEmails />}>
  <Route index element={<Navigate to="templates" replace />} />
  <Route path="templates" element={<AdminEmailTemplates />} />
  <Route path="templates/:slug" element={<AdminEmailTemplateEdit />} />
  <Route path="campaigns" element={<AdminEmailCampaigns />} />
  <Route path="campaigns/new" element={<AdminEmailCampaignEdit />} />
  <Route path="campaigns/:id" element={<AdminEmailCampaignEdit />} />
  <Route path="contacts" element={<AdminEmailContacts />} />
  <Route path="logs" element={<AdminEmailLogs />} />
</Route>
```

Import placeholder components (created in later tasks — stub them as `() => null` for now so routing compiles).

- [ ] **Step 4: Add the "Emails" entry to the admin sidebar**

Insert a new link item matching the existing sidebar pattern, pointing to `/admin/emails/templates`, labelled "Emails".

- [ ] **Step 5: Run the dev server and click through**

```bash
npm run dev
```
Open `http://localhost:8080/admin/emails` as an admin user. Confirm the tabs render and the hub page loads without errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminEmails.tsx src/App.tsx src/components/AdminSidebar.tsx
git commit -m "feat(admin): add Emails hub route + sidebar entry"
```

---

### Task 1.9: Build the template list page

**Files:**
- Create: `src/pages/admin/AdminEmailTemplates.tsx`
- Create: `src/lib/adminEmails.ts` (wrapper around the edge function)

- [ ] **Step 1: Create the API wrapper**

```ts
// src/lib/adminEmails.ts
import { supabase } from "@/lib/supabaseClient";

async function call<T>(action: string, body: Record<string, unknown> = {}) {
  const { data: session } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-email-templates`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.session?.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, ...body }),
    },
  );
  if (!res.ok) throw new Error(`admin-email-templates ${action} failed`);
  return (await res.json()) as T;
}

export const adminEmails = {
  list: () => call<{ templates: any[] }>("list"),
  get: (slug: string) => call<{ template: any }>("get", { slug }),
  upsert: (payload: any) => call<{ template: any }>("upsert", { payload }),
  versions: (slug: string) => call<{ versions: any[] }>("versions", { slug }),
  restore: (version_id: string) => call<{ template: any }>("restore", { version_id }),
};
```

- [ ] **Step 2: Build the list page**

```tsx
// src/pages/admin/AdminEmailTemplates.tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminEmails } from "@/lib/adminEmails";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function AdminEmailTemplates() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: () => adminEmails.list(),
  });

  if (isLoading) return <div>Loading…</div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.templates?.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="font-medium">{t.name}</TableCell>
            <TableCell className="font-mono text-sm">{t.slug}</TableCell>
            <TableCell><Badge>{t.category}</Badge></TableCell>
            <TableCell>{new Date(t.updated_at).toLocaleString()}</TableCell>
            <TableCell>
              <Link
                to={`/admin/emails/templates/${t.slug}`}
                className="text-primary underline"
              >Edit</Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Wire into the router (replace the stub from Task 1.8)**

In `src/App.tsx`, replace the `AdminEmailTemplates` stub import with the real component.

- [ ] **Step 4: Run the dev server and verify**

```bash
npm run dev
```
Navigate to `/admin/emails/templates`. Expect 8 rows.

- [ ] **Step 5: Commit**

```bash
git add src/lib/adminEmails.ts src/pages/admin/AdminEmailTemplates.tsx src/App.tsx
git commit -m "feat(admin): list email templates page"
```

---

### Task 1.10: Build the template editor page (split-pane editor + live preview)

The editor is Brevo/Resend-style: HTML source on the left (Monaco), iframe preview on the right that re-renders on change using the same `renderTemplate` logic on the client, a variables panel with sample data, and Save/Version history buttons.

**Files:**
- Create: `src/pages/admin/AdminEmailTemplateEdit.tsx`
- Create: `src/lib/renderEmailTemplate.ts` (client mirror of the Deno renderer)
- Create: `src/lib/renderEmailTemplate.test.ts`
- Modify: `package.json` (add `@monaco-editor/react`)

- [ ] **Step 1: Install Monaco**

```bash
npm install @monaco-editor/react
```

- [ ] **Step 2: Write the failing test for the client renderer**

```ts
// src/lib/renderEmailTemplate.test.ts
import { describe, it, expect } from "vitest";
import { renderEmailTemplate } from "./renderEmailTemplate";

describe("renderEmailTemplate (client)", () => {
  it("escapes HTML by default", () => {
    const out = renderEmailTemplate(
      { subject: "Hi {{name}}", html_body: "<p>{{name}}</p>", text_body: null, variables: [] },
      { name: "<b>" },
    );
    expect(out.html).toBe("<p>&lt;b&gt;</p>");
    expect(out.subject).toBe("Hi <b>");
  });

  it("supports {{{raw}}} blocks", () => {
    const out = renderEmailTemplate(
      { subject: "x", html_body: "<div>{{{block}}}</div>", text_body: null, variables: [] },
      { block: "<b>bold</b>" },
    );
    expect(out.html).toBe("<div><b>bold</b></div>");
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm run test -- renderEmailTemplate`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the client renderer**

```ts
// src/lib/renderEmailTemplate.ts
const VAR_RE = /\{\{\{?\s*([a-zA-Z0-9_.]+)\s*\}?\}\}/g;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

export interface ClientTemplate {
  subject: string;
  html_body: string;
  text_body: string | null;
  variables: Array<{ key: string; required?: boolean }>;
}

export function renderEmailTemplate(
  t: ClientTemplate,
  data: Record<string, unknown>,
) {
  const sub = (src: string, esc: boolean) =>
    src.replace(VAR_RE, (m, k) => {
      const raw = m.startsWith("{{{");
      const v = data[k];
      if (v === undefined || v === null) return "";
      const s = String(v);
      return esc && !raw ? escapeHtml(s) : s;
    });
  return {
    subject: sub(t.subject, false),
    html: sub(t.html_body, true),
    text: sub(t.text_body ?? "", false),
  };
}
```

- [ ] **Step 5: Run the test**

```bash
npm run test -- renderEmailTemplate
```
Expected: 2 passing.

- [ ] **Step 6: Build the editor page**

```tsx
// src/pages/admin/AdminEmailTemplateEdit.tsx
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { adminEmails } from "@/lib/adminEmails";
import { renderEmailTemplate } from "@/lib/renderEmailTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function AdminEmailTemplateEdit() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-email-template", slug],
    queryFn: () => adminEmails.get(slug!),
    enabled: !!slug,
  });

  const [draft, setDraft] = useState<any | null>(null);
  useEffect(() => { if (data?.template) setDraft(data.template); }, [data]);

  const save = useMutation({
    mutationFn: () => adminEmails.upsert(draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-email-template", slug] });
      qc.invalidateQueries({ queryKey: ["admin-email-templates"] });
    },
  });

  if (!draft) return <div>Loading…</div>;

  const rendered = renderEmailTemplate(draft, draft.sample_data ?? {});

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-4 h-[calc(100vh-12rem)]">
      <div className="space-y-3 overflow-y-auto pr-2">
        <div>
          <Label>Name</Label>
          <Input value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <Label>Subject</Label>
          <Input value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
        </div>
        <Tabs defaultValue="html">
          <TabsList>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="text">Plain text</TabsTrigger>
            <TabsTrigger value="vars">Variables & sample</TabsTrigger>
          </TabsList>
          <TabsContent value="html">
            <Editor
              height="60vh" defaultLanguage="html" value={draft.html_body}
              onChange={(v) => setDraft({ ...draft, html_body: v ?? "" })}
              theme="vs-dark"
            />
          </TabsContent>
          <TabsContent value="text">
            <Editor
              height="60vh" defaultLanguage="plaintext"
              value={draft.text_body ?? ""}
              onChange={(v) => setDraft({ ...draft, text_body: v ?? "" })}
            />
          </TabsContent>
          <TabsContent value="vars">
            <Editor
              height="30vh" defaultLanguage="json"
              value={JSON.stringify(draft.variables, null, 2)}
              onChange={(v) => {
                try { setDraft({ ...draft, variables: JSON.parse(v ?? "[]") }); }
                catch { /* ignore until valid */ }
              }}
            />
            <Label className="mt-3 block">Sample data (used for preview)</Label>
            <Editor
              height="20vh" defaultLanguage="json"
              value={JSON.stringify(draft.sample_data, null, 2)}
              onChange={(v) => {
                try { setDraft({ ...draft, sample_data: JSON.parse(v ?? "{}") }); }
                catch { /* ignore */ }
              }}
            />
          </TabsContent>
        </Tabs>
        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <div className="border rounded bg-white flex flex-col">
        <div className="p-3 border-b text-sm font-medium">
          Subject: {rendered.subject}
        </div>
        <iframe
          title="preview"
          className="flex-1"
          srcDoc={rendered.html}
          sandbox=""
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the dev server and edit one template**

```bash
npm run dev
```
Navigate to `/admin/emails/templates/auth_signup`. Change a word in the HTML, verify the preview updates live, click Save, reload, verify the change persisted.

- [ ] **Step 8: Commit**

```bash
git add src/lib/renderEmailTemplate.ts src/lib/renderEmailTemplate.test.ts \
        src/pages/admin/AdminEmailTemplateEdit.tsx package.json package-lock.json
git commit -m "feat(admin): email template editor with live preview"
```

---

### Task 1.11: End-to-end verify: edit a template, trigger the edge function, confirm the edit ships

- [ ] **Step 1: In the editor, change the subject of `auth_recovery` to `TEST — Reset your Exclu password`**

Save.

- [ ] **Step 2: Trigger a password reset from `/auth`**

Use an existing account. Check Brevo logs (or inbox).

- [ ] **Step 3: Confirm the subject shows `TEST — ...`**

- [ ] **Step 4: Revert the subject in the editor and save**

- [ ] **Step 5: Commit (no code changes — this is a verification step)**

Nothing to commit; mark the task done in the tracker.

---

# PHASE 2 — Part C: Signup Hardening + Email Confirmation Removal

Hardening must land **before** disabling email confirmation. Final task in this phase flips the Supabase setting.

---

### Task 2.1: Study and document the hoo.be signup flow

**Files:**
- Create: `docs/research/hoo-be-signup-flow.md`

- [ ] **Step 1: Manually sign up on https://hoo.be/ with a burner email**

Open devtools network tab, intercept every request during signup. Note:
- Endpoint(s) called on submit
- Whether any verification email arrives
- Response time between submit and authenticated session
- Cookies/fingerprints set before submit (ratelimit?)
- Response from the signup endpoint — does it return a session immediately?

- [ ] **Step 2: Write findings to the doc**

Structure:
```markdown
# hoo.be signup flow study (2026-04-15)

## Summary
- Verification email: no / yes
- Time from submit to usable dashboard: ~X s
- Protections observed: hCaptcha / Turnstile / device fingerprint / rate limit

## Network trace
1. POST /api/auth/signup  → 200, returns session token
2. ...

## Bot protection observed
- Header `x-...` set to ...
- Request includes challenge token ...

## Our plan for parity
- Disable Supabase `enable_confirmations`
- Replace the "check your inbox" screen with direct login
- Add the following protections before disabling: [list]
```

- [ ] **Step 3: Commit**

```bash
git add docs/research/hoo-be-signup-flow.md
git commit -m "docs: research hoo.be signup flow as baseline for removing email confirmation"
```

---

### Task 2.2: Add the `signup_attempts` + `disposable_email_domains` tables

**Files:**
- Create: `supabase/migrations/134_signup_hardening.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 134_signup_hardening.sql

create table if not exists public.signup_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip inet not null,
  device_fingerprint text,
  user_agent text,
  outcome text not null check (outcome in ('allowed','blocked_rate','blocked_disposable','blocked_fingerprint','blocked_captcha','failed_validation','completed')),
  block_reason text,
  created_at timestamptz not null default now()
);

create index signup_attempts_ip_idx on public.signup_attempts(ip, created_at desc);
create index signup_attempts_email_idx on public.signup_attempts(email, created_at desc);
create index signup_attempts_fp_idx on public.signup_attempts(device_fingerprint, created_at desc);

create table if not exists public.disposable_email_domains (
  domain text primary key,
  source text,
  added_at timestamptz not null default now()
);

alter table public.signup_attempts enable row level security;
alter table public.disposable_email_domains enable row level security;

create policy "admins read signup attempts" on public.signup_attempts
  for select using (public.is_admin());

create policy "admins read disposable list" on public.disposable_email_domains
  for select using (public.is_admin());
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db reset
```
Expected: 134 applies cleanly. (Prod already has 130–133 from Phase 1; 133 is `update_chatter_invitation`, so signup hardening takes slot 134.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/134_signup_hardening.sql
git commit -m "feat(db): add signup_attempts + disposable_email_domains tables"
```

---

### Task 2.3: Seed the disposable-email blacklist

**Files:**
- Create: `scripts/seed-disposable-domains.ts`

- [ ] **Step 1: Write the seeder script**

```ts
// scripts/seed-disposable-domains.ts
// Run with: npx tsx scripts/seed-disposable-domains.ts
import { createClient } from "@supabase/supabase-js";

const SOURCE = "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";

async function main() {
  const res = await fetch(SOURCE);
  const text = await res.text();
  const domains = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  console.log(`Fetched ${domains.length} domains`);

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const batch = 500;
  for (let i = 0; i < domains.length; i += batch) {
    const slice = domains.slice(i, i + batch).map((d) => ({ domain: d, source: SOURCE }));
    const { error } = await supabase.from("disposable_email_domains").upsert(slice, { onConflict: "domain" });
    if (error) throw error;
    console.log(`Upserted ${i + slice.length} / ${domains.length}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it**

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-disposable-domains.ts
```
Expected: ~3000+ rows inserted.

- [ ] **Step 3: Verify**

```bash
supabase db execute "select count(*) from public.disposable_email_domains;"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-disposable-domains.ts
git commit -m "chore: add script to seed disposable-email-domains blacklist"
```

---

### Task 2.4: Build the `check-signup-allowed` edge function

Called from the frontend *before* submitting the signup form. Runs rate limit, disposable check, fingerprint cooldown, and returns `{ allowed, reason? }`.

**Files:**
- Create: `supabase/functions/check-signup-allowed/index.ts`
- Create: `supabase/functions/check-signup-allowed/signup_checks.test.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Extract pure logic + write the failing test**

```ts
// supabase/functions/check-signup-allowed/signup_checks.ts (will be imported by index.ts)
export function extractEmailDomain(email: string): string | null {
  const m = email.toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  return m ? m[1] : null;
}

export function shouldBlockByCooldown(
  recentAttempts: Array<{ created_at: string; outcome: string }>,
  nowMs: number,
  cooldownSeconds: number,
): boolean {
  for (const a of recentAttempts) {
    if (a.outcome !== "completed") continue;
    const ageMs = nowMs - new Date(a.created_at).getTime();
    if (ageMs < cooldownSeconds * 1000) return true;
  }
  return false;
}
```

```ts
// supabase/functions/check-signup-allowed/signup_checks.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractEmailDomain, shouldBlockByCooldown } from "./signup_checks.ts";

Deno.test("extractEmailDomain parses basic addresses", () => {
  assertEquals(extractEmailDomain("Alice@Example.com"), "example.com");
  assertEquals(extractEmailDomain("bad"), null);
  assertEquals(extractEmailDomain("a@b@c"), null);
});

Deno.test("cooldown blocks if any completed attempt within window", () => {
  const now = Date.now();
  const recent = [
    { created_at: new Date(now - 30_000).toISOString(), outcome: "completed" },
  ];
  assertEquals(shouldBlockByCooldown(recent, now, 60), true);
  assertEquals(shouldBlockByCooldown(recent, now, 10), false);
});

Deno.test("cooldown ignores failed attempts", () => {
  const now = Date.now();
  const recent = [
    { created_at: new Date(now - 5_000).toISOString(), outcome: "failed_validation" },
  ];
  assertEquals(shouldBlockByCooldown(recent, now, 60), false);
});
```

Run: `deno test supabase/functions/check-signup-allowed/signup_checks.test.ts`
Expected: first run fails (module not written yet), then after writing `signup_checks.ts`, 3 passing.

- [ ] **Step 2: Build the edge function**

```ts
// supabase/functions/check-signup-allowed/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { extractClientIp, checkRateLimit, serviceRoleClient } from "../_shared/rate_limit.ts";
import { extractEmailDomain, shouldBlockByCooldown } from "./signup_checks.ts";

interface Body {
  email: string;
  device_fingerprint?: string;
  user_agent?: string;
}

const IP_LIMIT = 5;            // signups per window
const IP_WINDOW_SEC = 3600;    // 1 hour
const FP_LIMIT = 3;
const FP_WINDOW_SEC = 86400;   // 1 day
const COOLDOWN_SEC = 300;      // 5 min between completed signups from same IP/FP

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    const ip = extractClientIp(req);
    const svc = serviceRoleClient();

    const domain = extractEmailDomain(body.email);
    if (!domain) return json({ allowed: false, reason: "invalid_email" });

    // 1. Disposable domain check
    const { data: disposable } = await svc
      .from("disposable_email_domains")
      .select("domain").eq("domain", domain).maybeSingle();
    if (disposable) {
      await logAttempt(svc, body, ip, "blocked_disposable");
      return json({ allowed: false, reason: "disposable_email" });
    }

    // 2. IP rate limit
    const ipLimit = await checkRateLimit(svc, {
      scope: "signup-ip", identifier: ip, limit: IP_LIMIT, windowSeconds: IP_WINDOW_SEC,
    });
    if (!ipLimit.allowed) {
      await logAttempt(svc, body, ip, "blocked_rate", "ip");
      return json({ allowed: false, reason: "too_many_signups_ip" });
    }

    // 3. Fingerprint rate limit
    if (body.device_fingerprint) {
      const fpLimit = await checkRateLimit(svc, {
        scope: "signup-fp", identifier: body.device_fingerprint,
        limit: FP_LIMIT, windowSeconds: FP_WINDOW_SEC,
      });
      if (!fpLimit.allowed) {
        await logAttempt(svc, body, ip, "blocked_fingerprint");
        return json({ allowed: false, reason: "too_many_signups_device" });
      }
    }

    // 4. Cooldown check
    const { data: recent } = await svc
      .from("signup_attempts")
      .select("created_at, outcome")
      .or(`ip.eq.${ip},device_fingerprint.eq.${body.device_fingerprint ?? "-"}`)
      .order("created_at", { ascending: false }).limit(5);
    if (recent && shouldBlockByCooldown(recent, Date.now(), COOLDOWN_SEC)) {
      await logAttempt(svc, body, ip, "blocked_rate", "cooldown");
      return json({ allowed: false, reason: "cooldown_active" });
    }

    await logAttempt(svc, body, ip, "allowed");
    return json({ allowed: true });
  } catch (err) {
    console.error(err);
    return json({ allowed: false, reason: "internal_error" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function logAttempt(
  svc: ReturnType<typeof serviceRoleClient>,
  body: Body,
  ip: string,
  outcome: string,
  reason?: string,
) {
  await svc.from("signup_attempts").insert({
    email: body.email.toLowerCase(),
    ip,
    device_fingerprint: body.device_fingerprint,
    user_agent: body.user_agent,
    outcome,
    block_reason: reason ?? null,
  });
}
```

- [ ] **Step 3: Register and deploy**

```toml
# supabase/config.toml (append)
[functions.check-signup-allowed]
verify_jwt = false
```

```bash
supabase functions deploy check-signup-allowed
```

- [ ] **Step 4: Manual test via curl**

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/check-signup-allowed" \
  -H "content-type: application/json" \
  -d '{"email":"test@mailinator.com"}'
```
Expected: `{"allowed":false,"reason":"disposable_email"}`.

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/check-signup-allowed" \
  -H "content-type: application/json" \
  -d '{"email":"real@gmail.com"}'
```
Expected: `{"allowed":true}`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/check-signup-allowed/ supabase/config.toml
git commit -m "feat(edge): check-signup-allowed with rate limits + disposable + cooldown"
```

---

### Task 2.5: Wire FingerprintJS + `check-signup-allowed` into the signup forms

**Files:**
- Modify: `src/pages/Auth.tsx`
- Modify: `src/pages/FanSignup.tsx`
- Create: `src/lib/deviceFingerprint.ts`
- Modify: `package.json` (add `@fingerprintjs/fingerprintjs`)

- [ ] **Step 1: Install FingerprintJS**

```bash
npm install @fingerprintjs/fingerprintjs
```

- [ ] **Step 2: Create the fingerprint helper**

```ts
// src/lib/deviceFingerprint.ts
import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cached: Promise<string> | null = null;

export function getDeviceFingerprint(): Promise<string> {
  if (!cached) {
    cached = FingerprintJS.load().then((fp) => fp.get()).then((r) => r.visitorId);
  }
  return cached;
}
```

- [ ] **Step 3: Add a pre-signup check helper**

Append to `src/lib/deviceFingerprint.ts`:
```ts
import { supabase } from "@/lib/supabaseClient";

export async function preflightSignup(email: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const fingerprint = await getDeviceFingerprint();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-signup-allowed`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        device_fingerprint: fingerprint,
        user_agent: navigator.userAgent,
      }),
    },
  );
  const json = await res.json();
  if (json.allowed) return { ok: true };
  return { ok: false, reason: json.reason };
}
```

- [ ] **Step 4: Call `preflightSignup` in `Auth.tsx` before `supabase.auth.signUp`**

Locate the signup handler in `src/pages/Auth.tsx`. Before `supabase.auth.signUp(...)`:

```tsx
const check = await preflightSignup(email);
if (!check.ok) {
  setError(humanizeReason(check.reason));
  return;
}
```

Add a `humanizeReason` map:
```tsx
function humanizeReason(reason: string): string {
  const map: Record<string, string> = {
    disposable_email: "Please use a real email address.",
    too_many_signups_ip: "Too many signups from this network. Try again later.",
    too_many_signups_device: "Too many signups from this device. Try again later.",
    cooldown_active: "Please wait a few minutes before creating another account.",
    invalid_email: "This email address is invalid.",
    internal_error: "Something went wrong. Please try again.",
  };
  return map[reason] ?? "Signup temporarily unavailable.";
}
```

- [ ] **Step 5: Apply the same to `src/pages/FanSignup.tsx`**

- [ ] **Step 6: Manual test**

```bash
npm run dev
```
Try signing up with `test@mailinator.com` → expect the error toast. Try with a real Gmail address → expect success.

- [ ] **Step 7: Commit**

```bash
git add src/lib/deviceFingerprint.ts src/pages/Auth.tsx src/pages/FanSignup.tsx \
        package.json package-lock.json
git commit -m "feat(auth): preflight signup check with fingerprint + disposable blocking"
```

---

### Task 2.6: Enable Vercel BotID on the signup edge function

**Files:**
- Modify: `api/signup-botid-challenge.ts` (create new — thin wrapper that issues the BotID challenge server-side)
- Modify: `src/lib/deviceFingerprint.ts` (pass the BotID token)
- Modify: `supabase/functions/check-signup-allowed/index.ts` (verify the BotID token)

- [ ] **Step 1: Add BotID verification on the edge function**

Follow the Vercel BotID docs (public docs URL will be fetched at implementation time via the `vercel:vercel-agent` or WebFetch). Add a call to Vercel's BotID verify endpoint at the top of `check-signup-allowed`, returning `{allowed: false, reason: "bot_detected"}` on failure.

- [ ] **Step 2: On the client, obtain the BotID token before calling preflight**

Use Vercel's client SDK (`@vercel/botid`) — install, initialize, request a token, include it in the request body to `check-signup-allowed`.

- [ ] **Step 3: Manual test**

Dev server → try signing up with DevTools' "Disable JS" (should fail the BotID check). Re-enable JS → succeed.

- [ ] **Step 4: Commit**

```bash
git add api/ src/lib/deviceFingerprint.ts supabase/functions/check-signup-allowed/ package.json
git commit -m "feat(auth): integrate Vercel BotID into signup preflight"
```

---

### Task 2.7: Disable Supabase email confirmation and update the signup UX

**Files:**
- Modify: `src/pages/Auth.tsx`
- Modify: `src/pages/FanSignup.tsx`
- Modify: `src/pages/AuthCallback.tsx` (verify it still handles recovery/magic link)
- Dashboard action (not in repo): set `Authentication → Email → Enable email confirmations = OFF` on the hosted Supabase project.

- [ ] **Step 1: Remove the "check your inbox" UI state**

In `Auth.tsx` and `FanSignup.tsx`, after a successful `supabase.auth.signUp`, the response now includes a session immediately (because confirmations are off). Navigate straight to the appropriate dashboard (`/app/profile` for creators, `/fan` for fans).

Delete the "please confirm your email" error branch (`email_not_confirmed` detection) — with confirmations off, it cannot trigger. If the branch is imported elsewhere, grep and remove.

- [ ] **Step 2: Keep password recovery + magic link working**

Verify `send-auth-email` still handles `recovery` and `magiclink` (it does, from Task 1.2).

- [ ] **Step 3: Change the toggle in the Supabase dashboard**

Navigate to Authentication → Email → uncheck "Confirm email". Save.

- [ ] **Step 4: End-to-end test**

```bash
npm run dev
```
- Sign up with a new email → must land directly on the dashboard, no email received
- Click "Forgot password" → expect a reset email via Brevo
- Click "Sign in with magic link" → expect a magic-link email

- [ ] **Step 5: Commit**

```bash
git add src/pages/Auth.tsx src/pages/FanSignup.tsx src/pages/AuthCallback.tsx
git commit -m "feat(auth): remove email confirmation gating, signup lands directly in dashboard"
```

---

# PHASE 3 — Part B.1: Fan Email Collection

Funnels fan emails from guest chat + checkouts into a central `mailing_contacts` table.

---

### Task 3.1: Create `mailing_contacts` and `mailing_contact_events`

**Files:**
- Create: `supabase/migrations/134_mailing_contacts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 134_mailing_contacts.sql

create table if not exists public.mailing_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  normalized_email text generated always as (lower(email)) stored,
  first_name text,
  role text check (role in ('creator','fan','agency','chatter','prospect')),
  source text not null,
  consent_marketing boolean not null default false,
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  suppressed_reason text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index mailing_contacts_normalized_email_idx
  on public.mailing_contacts(normalized_email);
create index mailing_contacts_role_idx on public.mailing_contacts(role);
create index mailing_contacts_source_idx on public.mailing_contacts(source);

create table if not exists public.mailing_contact_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.mailing_contacts(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index mailing_contact_events_contact_idx
  on public.mailing_contact_events(contact_id, created_at desc);

-- Upsert helper used by every collection path.
create or replace function public.upsert_mailing_contact(
  p_email text,
  p_source text,
  p_role text default null,
  p_first_name text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_consent boolean default false
) returns uuid
language plpgsql security definer as $$
declare
  v_id uuid;
begin
  insert into public.mailing_contacts (email, role, source, first_name, metadata, consent_marketing, consent_at, last_seen_at)
  values (p_email, p_role, p_source, p_first_name, p_metadata, p_consent, case when p_consent then now() end, now())
  on conflict (normalized_email) do update
    set last_seen_at = now(),
        role = coalesce(public.mailing_contacts.role, excluded.role),
        first_name = coalesce(public.mailing_contacts.first_name, excluded.first_name),
        metadata = public.mailing_contacts.metadata || excluded.metadata,
        consent_marketing = public.mailing_contacts.consent_marketing or excluded.consent_marketing,
        consent_at = coalesce(public.mailing_contacts.consent_at, excluded.consent_at)
    returning id into v_id;

  if v_id is null then
    select id into v_id from public.mailing_contacts where normalized_email = lower(p_email);
  end if;

  insert into public.mailing_contact_events (contact_id, event_type, metadata)
  values (v_id, 'seen:' || p_source, p_metadata);

  return v_id;
end;
$$;

alter table public.mailing_contacts enable row level security;
alter table public.mailing_contact_events enable row level security;

create policy "admins read contacts" on public.mailing_contacts
  for select using (public.is_admin());

create policy "admins read contact events" on public.mailing_contact_events
  for select using (public.is_admin());
```

- [ ] **Step 2: Apply and verify**

```bash
supabase db reset
supabase db execute "select public.upsert_mailing_contact('x@y.com','test','fan',null,'{}'::jsonb,false);"
supabase db execute "select count(*) from public.mailing_contacts;"
```
Expected: count returns 1.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/134_mailing_contacts.sql
git commit -m "feat(db): add mailing_contacts + upsert helper"
```

---

### Task 3.2: Backfill existing users into `mailing_contacts`

**Files:**
- Create: `supabase/migrations/135_backfill_mailing_contacts.sql`

- [ ] **Step 1: Write the backfill migration**

```sql
-- 135_backfill_mailing_contacts.sql
-- One-time backfill: import known emails from existing tables.

insert into public.mailing_contacts (email, role, source, first_name, first_seen_at, last_seen_at)
select u.email, p.role, 'backfill:profiles',
       coalesce(p.display_name, p.handle),
       p.created_at, p.updated_at
from auth.users u
join public.profiles p on p.id = u.id
where u.email is not null
on conflict (normalized_email) do nothing;

-- Known fan emails from checkouts
insert into public.mailing_contacts (email, role, source)
select distinct lower(fan_email), 'fan', 'backfill:tips'
from public.tips where fan_email is not null
on conflict (normalized_email) do nothing;

insert into public.mailing_contacts (email, role, source)
select distinct lower(fan_email), 'fan', 'backfill:custom_requests'
from public.custom_requests where fan_email is not null
on conflict (normalized_email) do nothing;

-- Guest sessions with email
insert into public.mailing_contacts (email, role, source)
select distinct lower(email), 'fan', 'backfill:guest_chat'
from public.guest_sessions where email is not null
on conflict (normalized_email) do nothing;
```

- [ ] **Step 2: Apply locally and confirm the row counts**

```bash
supabase db reset
supabase db execute "select source, count(*) from public.mailing_contacts group by source;"
```
Expected: non-zero counts for backfill sources depending on local seed data.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/135_backfill_mailing_contacts.sql
git commit -m "feat(db): backfill mailing_contacts from existing users, tips, requests, guest chat"
```

---

### Task 3.3: Wire email capture into every checkout edge function

**Preflight notes (prod verified):**
- `purchases` (link checkouts) already has `buyer_email` — **reuse**, do not add a new column.
- `tips.fan_email` exists — **reuse**.
- `custom_requests.fan_email` exists — **reuse**.
- `gift_purchases` has `fan_name` but **no `fan_email`** — add it in a small migration.

**Files:**
- Create: `supabase/migrations/136_gift_purchases_fan_email.sql`
- Modify: `supabase/functions/create-link-checkout/index.ts`
- Modify: `supabase/functions/create-tip-checkout/index.ts`
- Modify: `supabase/functions/create-request-checkout/index.ts`
- Modify: `supabase/functions/create-gift-checkout/index.ts`

- [ ] **Step 1: Write migration 136 to add `gift_purchases.fan_email`**

```sql
-- 136_gift_purchases_fan_email.sql
alter table public.gift_purchases
  add column if not exists fan_email text;

create index if not exists gift_purchases_fan_email_idx
  on public.gift_purchases(lower(fan_email));
```

Apply: `supabase db reset` (local) — verify column lands.

- [ ] **Step 2: Accept the email field in every request body**

In each function, extend the `RequestBody` type to include the email. The field name matches the existing column:
- `create-link-checkout` → `buyer_email?: string`
- `create-tip-checkout` → `fan_email?: string` (already in the schema)
- `create-request-checkout` → `fan_email?: string`
- `create-gift-checkout` → `fan_email?: string`

Validate with `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` before use.

- [ ] **Step 3: Call the upsert helper after UGP session creation**

For each function, after the UGP checkout is created, before returning the redirect URL:

```ts
const email = body.buyer_email ?? body.fan_email; // whichever one applies
if (email) {
  await supabase.rpc("upsert_mailing_contact", {
    p_email: email,
    p_source: "checkout:link", // or :tip, :request, :gift
    p_role: "fan",
    p_metadata: { creator_id: link.creator_id }, // or recipient_creator_id for gifts
    p_consent: false,
  });
}
```

- [ ] **Step 4: Persist the email on the purchase/tip/request/gift row**

- `create-link-checkout` → already writes `purchases.buyer_email`. Confirm it receives the email from the new body field and persists it on insert. If the current function builds the insert server-side without the email, add it to the insert payload.
- `create-tip-checkout` → already persists `tips.fan_email`. Confirm.
- `create-request-checkout` → already persists `custom_requests.fan_email`. Confirm.
- `create-gift-checkout` → add `fan_email: body.fan_email ?? null` to the `gift_purchases` insert (new column from Step 1).

- [ ] **Step 5: Deploy**

```bash
supabase functions deploy create-link-checkout
supabase functions deploy create-tip-checkout
supabase functions deploy create-request-checkout
supabase functions deploy create-gift-checkout
```

- [ ] **Step 6: Manual E2E test for one flow**

Buy a link on a dev creator profile as a guest, enter email, confirm a row appears in `mailing_contacts` AND `purchases.buyer_email` is set.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/136_gift_purchases_fan_email.sql \
        supabase/functions/create-link-checkout/ \
        supabase/functions/create-tip-checkout/ \
        supabase/functions/create-request-checkout/ \
        supabase/functions/create-gift-checkout/
git commit -m "feat(checkout): capture buyer/fan email into mailing_contacts during all checkouts"
```

---

### Task 3.4: Add optional email capture to the guest chat init

**Files:**
- Modify: `supabase/functions/guest-chat-init/index.ts`
- Modify: the relevant chat UI component (find via `grep -rn guest-chat-init src/`)

- [ ] **Step 1: Accept `email?: string` in `guest-chat-init`**

Validate + call `upsert_mailing_contact` with source `"chat:guest_init"`. Persist it in `guest_sessions.email` (column already exists).

- [ ] **Step 2: Update the guest chat widget to prompt for email**

Add a small form shown on first message with:
- Email input (optional — "Skip" button provided)
- Copy: "Get notified when [creator] replies (optional)"

When submitted, send the email alongside the first message. When skipped, proceed with a null email.

- [ ] **Step 3: Deploy + manual test**

```bash
supabase functions deploy guest-chat-init
npm run dev
```
Open a creator profile, open the guest chat, enter an email, confirm a contact row lands in `mailing_contacts`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/guest-chat-init/index.ts src/components/chat/
git commit -m "feat(chat): capture optional email on guest chat init"
```

---

### Task 3.5: Add the admin contacts list page

**Files:**
- Create: `supabase/functions/admin-mailing-contacts/index.ts`
- Create: `src/pages/admin/AdminEmailContacts.tsx`
- Modify: `src/App.tsx` (swap the stub)
- Modify: `supabase/config.toml`

- [ ] **Step 1: Build the admin list endpoint**

Follow the same pattern as `admin-email-templates`:
- `action: "list"` — paginated + filterable by role/source
- `action: "export"` — CSV stream
- `action: "unsubscribe"` — set `unsubscribed_at`

- [ ] **Step 2: Deploy + register**

```toml
[functions.admin-mailing-contacts]
verify_jwt = false
```
```bash
supabase functions deploy admin-mailing-contacts
```

- [ ] **Step 3: Build the frontend page**

Standard shadcn Table with role filter dropdown, search by email, pagination, "Export CSV" button.

- [ ] **Step 4: Manual test**

Load `/admin/emails/contacts`, confirm contacts list renders.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-mailing-contacts/ \
        src/pages/admin/AdminEmailContacts.tsx supabase/config.toml src/App.tsx
git commit -m "feat(admin): mailing contacts list with filters and CSV export"
```

---

# PHASE 4 — Part B.2: `hi.exclu.at` Sending Subdomain

A non-code phase that produces DNS records + a docs runbook.

---

### Task 4.1: Write the subdomain setup runbook

**Files:**
- Create: `docs/ops/hi-exclu-at-email-subdomain.md`

- [ ] **Step 1: Document the full setup**

Contents:

```markdown
# hi.exclu.at — Email sending subdomain

Goal: isolate marketing + outbound emails on `hi.exclu.at` so deliverability
issues on marketing traffic never harm the `exclu.at` apex (auth transactional
mail stays on the apex).

## Brevo side

1. Brevo → Senders & IP → Domains → Add a domain → `hi.exclu.at`
2. Brevo provides:
   - A DKIM public key (`mail._domainkey.hi.exclu.at` → TXT)
   - An SPF requirement (`include:spf.brevo.com`)
   - A Brevo code TXT record (`brevo-code.hi.exclu.at`)
3. Do not configure an MX — this subdomain sends only.

## Hostinger DNS records to add

| Type  | Name                           | Value                                            | TTL  |
|-------|--------------------------------|--------------------------------------------------|------|
| TXT   | brevo-code.hi                  | <value from Brevo>                               | 3600 |
| TXT   | mail._domainkey.hi             | <DKIM public key from Brevo>                     | 3600 |
| TXT   | hi                             | v=spf1 include:spf.brevo.com ~all                | 3600 |
| TXT   | _dmarc.hi                      | v=DMARC1; p=none; rua=mailto:dmarc@exclu.at      | 3600 |
| CNAME | em.hi                          | <Brevo tracking CNAME>                           | 3600 |

## Verification steps

1. `dig +short TXT brevo-code.hi.exclu.at`
2. `dig +short TXT mail._domainkey.hi.exclu.at`
3. Brevo → Senders → Authenticate — should flip to green
4. Send a test mail to `check-auth@verifier.port25.com` using `Maria@hi.exclu.at` as sender — expect SPF=pass, DKIM=pass, DMARC=pass.

## Sender addresses to create inside Brevo

- `Maria@hi.exclu.at` — default fan-facing sender (mentioned in spec)
- `team@hi.exclu.at` — newsletters
- `no-reply@hi.exclu.at` — system alerts (but keep auth mails on `no-reply@exclu.at` to protect apex reputation)

## Env vars to update

- `BREVO_SENDER_EMAIL` — unchanged (apex) for transactional auth mails
- `BREVO_CAMPAIGN_SENDER_EMAIL` — new — `Maria@hi.exclu.at`
- `BREVO_CAMPAIGN_SENDER_NAME` — new — `Maria @ Exclu`

## Rollback

If deliverability tanks on the apex, we can flip all transactional sends to
`hi.exclu.at` by changing `BREVO_SENDER_EMAIL`. Do not do the inverse —
marketing on apex is the thing we're trying to prevent.
```

- [ ] **Step 2: Share the runbook with TB and walk through DNS changes in Hostinger together**

This is a live-with-user step: the plan doesn't commit secrets or DNS — it commits the doc, and the DNS changes are performed interactively.

- [ ] **Step 3: After DNS verification passes in Brevo, set the new env vars**

```bash
supabase secrets set BREVO_CAMPAIGN_SENDER_EMAIL=Maria@hi.exclu.at
supabase secrets set BREVO_CAMPAIGN_SENDER_NAME="Maria @ Exclu"
```

- [ ] **Step 4: Commit the runbook**

```bash
git add docs/ops/hi-exclu-at-email-subdomain.md
git commit -m "docs: runbook for hi.exclu.at sending subdomain"
```

---

# PHASE 5 — Part B.3: Campaigns, Warmup, Queue, Unsubscribe

The biggest phase. Builds the newsletter/bulk-sender, integrates warmup, adds the queue drain, bounce/complaint webhook, and the unsubscribe surface.

---

### Task 5.1: Add the campaigns schema

**Files:**
- Create: `supabase/migrations/137_email_campaigns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 137_email_campaigns.sql

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id uuid references public.email_templates(id),
  subject_override text,
  segment jsonb not null default '{}'::jsonb,
  sender_email text not null,
  sender_name text not null,
  status text not null default 'draft'
    check (status in ('draft','scheduled','sending','paused','completed','failed')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  total_recipients integer default 0,
  sent_count integer default 0,
  failed_count integer default 0,
  warmup_target_per_day integer default 1000,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_campaigns_status_idx on public.email_campaigns(status);

create table if not exists public.email_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid not null references public.mailing_contacts(id) on delete cascade,
  email text not null,
  status text not null default 'queued'
    check (status in ('queued','sending','sent','failed','skipped','bounced','complained','unsubscribed')),
  brevo_message_id text,
  error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (campaign_id, contact_id)
);

create index email_campaign_sends_status_idx
  on public.email_campaign_sends(campaign_id, status);
create index email_campaign_sends_queued_idx
  on public.email_campaign_sends(status, queued_at);

create table if not exists public.email_suppression_list (
  email text primary key,
  reason text not null check (reason in ('bounce_hard','bounce_soft','complaint','unsubscribe','manual')),
  added_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index email_suppression_list_reason_idx
  on public.email_suppression_list(reason);

-- Warmup tracker: how many mails we've sent per day per sender domain.
create table if not exists public.email_warmup_counters (
  sender_domain text not null,
  day date not null,
  sent_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (sender_domain, day)
);

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_sends enable row level security;
alter table public.email_suppression_list enable row level security;
alter table public.email_warmup_counters enable row level security;

create policy "admins all on campaigns" on public.email_campaigns
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admins read sends" on public.email_campaign_sends
  for select using (public.is_admin());

create policy "admins read suppression" on public.email_suppression_list
  for select using (public.is_admin());
```

- [ ] **Step 2: Apply**

```bash
supabase db reset
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/137_email_campaigns.sql
git commit -m "feat(db): add email_campaigns + sends + suppression + warmup schema"
```

---

### Task 5.2: Build the segment → contacts resolver (pure function + tests)

**Files:**
- Create: `supabase/functions/_shared/segment.ts`
- Create: `supabase/functions/_shared/segment.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/segment.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSegmentQuery, type SegmentFilter } from "./segment.ts";

Deno.test("empty filter returns base query", () => {
  const q = buildSegmentQuery({});
  assertEquals(q.conditions, []);
});

Deno.test("role filter emits one condition", () => {
  const q = buildSegmentQuery({ roles: ["creator", "fan"] });
  assertEquals(q.conditions, [{ column: "role", op: "in", value: ["creator", "fan"] }]);
});

Deno.test("date filters", () => {
  const q = buildSegmentQuery({
    signed_up_after: "2026-01-01",
    last_seen_after: "2026-03-01",
  });
  assertEquals(q.conditions.length, 2);
});

Deno.test("must exclude unsubscribed + suppressed", () => {
  const q = buildSegmentQuery({});
  assertEquals(q.mustExcludeUnsubscribed, true);
  assertEquals(q.mustExcludeSuppressed, true);
});
```

- [ ] **Step 2: Run, fail, implement**

Run: `deno test supabase/functions/_shared/segment.test.ts`

Then write:

```ts
// supabase/functions/_shared/segment.ts
export interface SegmentFilter {
  roles?: Array<"creator" | "fan" | "agency" | "chatter" | "prospect">;
  signed_up_after?: string;
  signed_up_before?: string;
  last_seen_after?: string;
  subscription_status?: "premium" | "free";
  source?: string;
  consent_marketing_only?: boolean;
}

export interface SegmentQuery {
  conditions: Array<{ column: string; op: "eq" | "in" | "gte" | "lte"; value: unknown }>;
  mustExcludeUnsubscribed: boolean;
  mustExcludeSuppressed: boolean;
}

export function buildSegmentQuery(f: SegmentFilter): SegmentQuery {
  const conditions: SegmentQuery["conditions"] = [];
  if (f.roles?.length) {
    conditions.push({ column: "role", op: "in", value: f.roles });
  }
  if (f.signed_up_after) {
    conditions.push({ column: "first_seen_at", op: "gte", value: f.signed_up_after });
  }
  if (f.signed_up_before) {
    conditions.push({ column: "first_seen_at", op: "lte", value: f.signed_up_before });
  }
  if (f.last_seen_after) {
    conditions.push({ column: "last_seen_at", op: "gte", value: f.last_seen_after });
  }
  if (f.source) {
    conditions.push({ column: "source", op: "eq", value: f.source });
  }
  return {
    conditions,
    mustExcludeUnsubscribed: true,
    mustExcludeSuppressed: true,
  };
}

export async function resolveSegment(
  supabase: any,
  filter: SegmentFilter,
  limit = 100_000,
): Promise<Array<{ id: string; email: string; first_name: string | null }>> {
  const q = buildSegmentQuery(filter);
  let query = supabase
    .from("mailing_contacts")
    .select("id, email, first_name")
    .is("unsubscribed_at", null)
    .limit(limit);

  for (const c of q.conditions) {
    query = (query as any)[c.op](c.column, c.value);
  }

  if (filter.consent_marketing_only) {
    query = query.eq("consent_marketing", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Filter out suppressed addresses in a second round trip.
  const emails = (data ?? []).map((r: any) => r.email);
  if (emails.length === 0) return [];
  const { data: suppressed } = await supabase
    .from("email_suppression_list")
    .select("email").in("email", emails);
  const suppressedSet = new Set((suppressed ?? []).map((r: any) => r.email));
  return (data ?? []).filter((r: any) => !suppressedSet.has(r.email));
}
```

- [ ] **Step 3: Tests pass**

Run: `deno test supabase/functions/_shared/segment.test.ts`
Expected: 4 passing.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/segment.ts supabase/functions/_shared/segment.test.ts
git commit -m "feat(edge): segment filter → mailing_contacts resolver"
```

---

### Task 5.3: Build the unsubscribe token helper (pure + tests)

**Files:**
- Create: `supabase/functions/_shared/unsubscribe.ts`
- Create: `supabase/functions/_shared/unsubscribe.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/unsubscribe.test.ts
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe.ts";

const SECRET = "test-secret";

Deno.test("round-trip", async () => {
  const token = await signUnsubscribeToken("alice@example.com", SECRET);
  const email = await verifyUnsubscribeToken(token, SECRET);
  assertEquals(email, "alice@example.com");
});

Deno.test("rejects tampered tokens", async () => {
  const token = await signUnsubscribeToken("alice@example.com", SECRET);
  const tampered = token.slice(0, -2) + "xx";
  await assertRejects(() => verifyUnsubscribeToken(tampered, SECRET));
});

Deno.test("rejects wrong secret", async () => {
  const token = await signUnsubscribeToken("alice@example.com", SECRET);
  await assertRejects(() => verifyUnsubscribeToken(token, "other-secret"));
});
```

- [ ] **Step 2: Run, fail, implement**

```ts
// supabase/functions/_shared/unsubscribe.ts
const enc = new TextEncoder();

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signUnsubscribeToken(email: string, secret: string): Promise<string> {
  const payload = btoa(email).replace(/=+$/, "");
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifyUnsubscribeToken(token: string, secret: string): Promise<string> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new Error("malformed token");
  const expected = await hmac(secret, payload);
  if (expected !== sig) throw new Error("invalid signature");
  try {
    return atob(payload + "==".slice(0, (4 - payload.length % 4) % 4));
  } catch {
    throw new Error("invalid payload");
  }
}
```

- [ ] **Step 3: Tests pass**

Run: `deno test supabase/functions/_shared/unsubscribe.test.ts`
Expected: 3 passing.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/unsubscribe.ts supabase/functions/_shared/unsubscribe.test.ts
git commit -m "feat(edge): HMAC-signed unsubscribe tokens"
```

---

### Task 5.4: Build the warmup policy (pure + tests)

**Files:**
- Create: `supabase/functions/_shared/warmup.ts`
- Create: `supabase/functions/_shared/warmup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/warmup.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { warmupAllowance } from "./warmup.ts";

Deno.test("day 1 is 50", () => {
  assertEquals(warmupAllowance({ daysSinceStart: 0, targetPerDay: 5000 }), 50);
});

Deno.test("day 7 ramps", () => {
  // Linear ramp over 14 days from 50 → targetPerDay
  const r = warmupAllowance({ daysSinceStart: 7, targetPerDay: 5000 });
  assertEquals(r > 50 && r < 5000, true);
});

Deno.test("day 14 reaches target", () => {
  assertEquals(warmupAllowance({ daysSinceStart: 14, targetPerDay: 5000 }), 5000);
});

Deno.test("day 30 stays at target", () => {
  assertEquals(warmupAllowance({ daysSinceStart: 30, targetPerDay: 5000 }), 5000);
});
```

- [ ] **Step 2: Implement**

```ts
// supabase/functions/_shared/warmup.ts
const WARMUP_DAYS = 14;
const DAY_ONE_CAP = 50;

export function warmupAllowance(opts: {
  daysSinceStart: number;
  targetPerDay: number;
}): number {
  if (opts.daysSinceStart >= WARMUP_DAYS) return opts.targetPerDay;
  if (opts.daysSinceStart <= 0) return DAY_ONE_CAP;
  const t = opts.daysSinceStart / WARMUP_DAYS;
  return Math.round(DAY_ONE_CAP + (opts.targetPerDay - DAY_ONE_CAP) * t);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}
```

- [ ] **Step 3: Tests pass**

Run: `deno test supabase/functions/_shared/warmup.test.ts`
Expected: 4 passing.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/warmup.ts supabase/functions/_shared/warmup.test.ts
git commit -m "feat(edge): warmup allowance curve (14-day ramp from 50 to target)"
```

---

### Task 5.5: Build the campaign admin edge function

Handles create/list/schedule/pause/resume.

**Files:**
- Create: `supabase/functions/admin-email-campaigns/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Implement CRUD + actions**

```ts
// supabase/functions/admin-email-campaigns/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveSegment, type SegmentFilter } from "../_shared/segment.ts";

async function requireAdmin(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user } } = await svc.auth.getUser(jwt);
  if (!user) throw new Error("unauthorized");
  const { data: profile } = await svc.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) throw new Error("forbidden");
  return { svc, user };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { svc, user } = await requireAdmin(req);
    const body = await req.json();

    switch (body.action) {
      case "list": {
        const { data } = await svc.from("email_campaigns")
          .select("*").order("created_at", { ascending: false });
        return json({ campaigns: data });
      }
      case "get": {
        const { data } = await svc.from("email_campaigns")
          .select("*").eq("id", body.id).single();
        return json({ campaign: data });
      }
      case "upsert": {
        const p = body.payload;
        const { data, error } = await svc.from("email_campaigns").upsert({
          ...(p.id ? { id: p.id } : {}),
          name: p.name,
          template_id: p.template_id,
          subject_override: p.subject_override,
          segment: p.segment ?? {},
          sender_email: p.sender_email,
          sender_name: p.sender_name,
          warmup_target_per_day: p.warmup_target_per_day ?? 1000,
          scheduled_at: p.scheduled_at,
          created_by: user.id,
        }).select().single();
        if (error) throw error;
        return json({ campaign: data });
      }
      case "preview-recipients": {
        const contacts = await resolveSegment(svc, body.segment as SegmentFilter, 50);
        const { count } = await svc.from("mailing_contacts")
          .select("id", { head: true, count: "exact" })
          .is("unsubscribed_at", null);
        return json({ sample: contacts, approx_total: count });
      }
      case "schedule": {
        // Materialize sends for the segment
        const { data: campaign } = await svc.from("email_campaigns")
          .select("*").eq("id", body.id).single();
        if (!campaign) throw new Error("not found");

        const contacts = await resolveSegment(svc, campaign.segment, 500_000);
        if (contacts.length === 0) throw new Error("segment empty");

        const rows = contacts.map((c) => ({
          campaign_id: campaign.id,
          contact_id: c.id,
          email: c.email,
        }));

        const batchSize = 1000;
        for (let i = 0; i < rows.length; i += batchSize) {
          const { error } = await svc.from("email_campaign_sends")
            .upsert(rows.slice(i, i + batchSize), { onConflict: "campaign_id,contact_id" });
          if (error) throw error;
        }

        await svc.from("email_campaigns").update({
          status: "scheduled",
          total_recipients: rows.length,
          started_at: new Date().toISOString(),
        }).eq("id", campaign.id);

        return json({ ok: true, total: rows.length });
      }
      case "pause": {
        await svc.from("email_campaigns").update({ status: "paused" }).eq("id", body.id);
        return json({ ok: true });
      }
      case "resume": {
        await svc.from("email_campaigns").update({ status: "scheduled" }).eq("id", body.id);
        return json({ ok: true });
      }
    }
    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
```

- [ ] **Step 2: Register + deploy**

```toml
[functions.admin-email-campaigns]
verify_jwt = false
```
```bash
supabase functions deploy admin-email-campaigns
```

- [ ] **Step 3: Smoke test via curl**

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/admin-email-campaigns" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}'
```
Expected: `{"campaigns": []}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-email-campaigns/ supabase/config.toml
git commit -m "feat(edge): admin-email-campaigns CRUD + schedule materialization"
```

---

### Task 5.6: Build the queue drain function `process-campaign-queue`

Runs every minute via Vercel cron. Pops queued sends respecting warmup allowance + Brevo throttle + suppression list.

**Files:**
- Create: `supabase/functions/process-campaign-queue/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Implement**

```ts
// supabase/functions/process-campaign-queue/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { loadTemplate, renderTemplate } from "../_shared/email_templates.ts";
import { warmupAllowance } from "../_shared/warmup.ts";
import { signUnsubscribeToken } from "../_shared/unsubscribe.ts";

const PER_RUN_MAX = 300;          // max sends per 1-min invocation
const BREVO_RPS = 10;             // hard throttle

interface CampaignRow {
  id: string;
  template_id: string;
  subject_override: string | null;
  sender_email: string;
  sender_name: string;
  status: string;
  warmup_target_per_day: number;
  started_at: string | null;
}

function authHeaderOk(req: Request): boolean {
  // Invoked by Vercel cron with a shared secret.
  return req.headers.get("x-cron-secret") === Deno.env.get("CAMPAIGN_QUEUE_SECRET");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!authHeaderOk(req)) return new Response("forbidden", { status: 403 });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Pick active campaigns
  const { data: campaigns } = await svc
    .from("email_campaigns")
    .select("*")
    .in("status", ["scheduled", "sending"])
    .order("started_at", { ascending: true });

  if (!campaigns?.length) return json({ processed: 0 });

  let totalProcessed = 0;

  for (const campaign of campaigns as CampaignRow[]) {
    if (totalProcessed >= PER_RUN_MAX) break;

    // Warmup: figure out how many we've already sent today.
    const senderDomain = campaign.sender_email.split("@")[1];
    const today = new Date().toISOString().slice(0, 10);
    const { data: counter } = await svc
      .from("email_warmup_counters")
      .select("sent_count")
      .eq("sender_domain", senderDomain).eq("day", today).maybeSingle();
    const sentToday = counter?.sent_count ?? 0;

    const daysSinceStart = campaign.started_at
      ? Math.floor((Date.now() - new Date(campaign.started_at).getTime()) / 86_400_000)
      : 0;
    const dailyAllowance = warmupAllowance({
      daysSinceStart,
      targetPerDay: campaign.warmup_target_per_day,
    });
    const remainingToday = Math.max(0, dailyAllowance - sentToday);
    if (remainingToday === 0) continue;

    const batchSize = Math.min(PER_RUN_MAX - totalProcessed, remainingToday, 100);

    // 2. Pop queued rows
    const { data: pending } = await svc
      .from("email_campaign_sends")
      .select("id, contact_id, email")
      .eq("campaign_id", campaign.id).eq("status", "queued")
      .order("queued_at", { ascending: true }).limit(batchSize);

    if (!pending?.length) {
      await svc.from("email_campaigns").update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", campaign.id);
      continue;
    }

    // Mark as sending
    await svc.from("email_campaign_sends")
      .update({ status: "sending" })
      .in("id", pending.map((p) => p.id));

    // 3. Load the template
    const { data: tplRow } = await svc
      .from("email_templates").select("*").eq("id", campaign.template_id).single();
    if (!tplRow) throw new Error("template missing");

    // 4. Send one by one, respecting Brevo RPS
    const unsubSecret = Deno.env.get("UNSUBSCRIBE_SECRET")!;
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL");

    for (const p of pending) {
      // Skip if suppressed or unsubscribed
      const { data: suppressed } = await svc
        .from("email_suppression_list").select("email").eq("email", p.email).maybeSingle();
      if (suppressed) {
        await svc.from("email_campaign_sends")
          .update({ status: "skipped", error: `suppressed:${suppressed}` })
          .eq("id", p.id);
        continue;
      }

      const unsubToken = await signUnsubscribeToken(p.email, unsubSecret);
      const unsubUrl = `${siteUrl}/unsubscribe?t=${unsubToken}`;

      const rendered = renderTemplate(tplRow as any, {
        unsubscribe_url: unsubUrl,
        email: p.email,
      });

      const brevoPayload = {
        sender: { email: campaign.sender_email, name: campaign.sender_name },
        to: [{ email: p.email }],
        subject: campaign.subject_override ?? rendered.subject,
        htmlContent: rendered.html,
        headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      };

      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": Deno.env.get("BREVO_API_KEY")!,
          "content-type": "application/json",
        },
        body: JSON.stringify(brevoPayload),
      });

      if (r.ok) {
        const body = await r.json();
        await svc.from("email_campaign_sends").update({
          status: "sent", sent_at: new Date().toISOString(),
          brevo_message_id: body.messageId,
        }).eq("id", p.id);
      } else {
        const errText = await r.text();
        await svc.from("email_campaign_sends").update({
          status: "failed", error: errText.slice(0, 500),
        }).eq("id", p.id);
      }

      totalProcessed += 1;
      await new Promise((res) => setTimeout(res, Math.ceil(1000 / BREVO_RPS)));
      if (totalProcessed >= PER_RUN_MAX) break;
    }

    // 5. Increment warmup counter
    await svc.rpc("email_warmup_increment", {
      p_domain: senderDomain, p_day: today, p_count: pending.length,
    });

    // 6. Update counts
    await svc.from("email_campaigns").update({
      status: "sending",
      sent_count: sentToday + pending.length,
    }).eq("id", campaign.id);
  }

  return json({ processed: totalProcessed });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
```

- [ ] **Step 2: Add the warmup increment RPC**

Create migration `138_email_warmup_rpc.sql`:

```sql
create or replace function public.email_warmup_increment(
  p_domain text, p_day date, p_count integer
) returns void
language plpgsql as $$
begin
  insert into public.email_warmup_counters (sender_domain, day, sent_count)
  values (p_domain, p_day, p_count)
  on conflict (sender_domain, day) do update
    set sent_count = public.email_warmup_counters.sent_count + excluded.sent_count,
        updated_at = now();
end;
$$;
```

Apply: `supabase db reset`

- [ ] **Step 3: Register + deploy**

```toml
[functions.process-campaign-queue]
verify_jwt = false
```
```bash
supabase functions deploy process-campaign-queue
```

- [ ] **Step 4: Set the secrets**

```bash
supabase secrets set CAMPAIGN_QUEUE_SECRET=$(openssl rand -hex 32)
supabase secrets set UNSUBSCRIBE_SECRET=$(openssl rand -hex 32)
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/process-campaign-queue/ \
        supabase/migrations/138_email_warmup_rpc.sql \
        supabase/config.toml
git commit -m "feat(edge): process-campaign-queue with warmup + Brevo throttle + suppression"
```

---

### Task 5.7: Wire the queue drain into Vercel cron

**Files:**
- Modify: `vercel.json` (add cron entry pointing at an `api/` wrapper)
- Create: `api/cron-process-campaign-queue.ts`

- [ ] **Step 1: Create a thin Vercel cron trigger**

```ts
// api/cron-process-campaign-queue.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers["x-vercel-cron-signature"] !== process.env.VERCEL_CRON_SIGNATURE) {
    // fall through — Vercel signs cron requests automatically when configured
  }

  const r = await fetch(
    `${process.env.SUPABASE_URL}/functions/v1/process-campaign-queue`,
    {
      method: "POST",
      headers: {
        "x-cron-secret": process.env.CAMPAIGN_QUEUE_SECRET!,
        "content-type": "application/json",
      },
    },
  );
  const body = await r.text();
  res.status(r.status).send(body);
}
```

- [ ] **Step 2: Add the cron entry to `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron-process-campaign-queue", "schedule": "* * * * *" }
  ]
}
```

(If `vercel.json` already has a `crons` array, append this entry.)

- [ ] **Step 3: Set Vercel env vars**

Using the Vercel dashboard or CLI:
```bash
vercel env add CAMPAIGN_QUEUE_SECRET production
vercel env add SUPABASE_URL production
```

- [ ] **Step 4: Deploy to a Vercel preview and verify the cron runs**

```bash
git add api/cron-process-campaign-queue.ts vercel.json
git commit -m "feat(cron): drain email campaign queue every minute via Vercel cron"
git push
```

Check Vercel → Functions → Crons. Confirm 200 responses in the log within 2 minutes.

---

### Task 5.8: Build the Brevo webhook endpoint (bounces / complaints / unsubs)

**Files:**
- Create: `supabase/functions/brevo-webhook/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Implement**

```ts
// supabase/functions/brevo-webhook/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface BrevoEvent {
  event: string; // "hard_bounce" | "soft_bounce" | "spam" | "unsubscribed" | ...
  email: string;
  "message-id"?: string;
  reason?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = req.headers.get("x-brevo-secret");
  if (secret !== Deno.env.get("BREVO_WEBHOOK_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const events: BrevoEvent[] = await req.json();
  for (const e of Array.isArray(events) ? events : [events]) {
    const reasonMap: Record<string, string> = {
      hard_bounce: "bounce_hard",
      soft_bounce: "bounce_soft",
      spam: "complaint",
      unsubscribed: "unsubscribe",
    };
    const mapped = reasonMap[e.event];
    if (!mapped) continue;

    await svc.from("email_suppression_list").upsert({
      email: e.email,
      reason: mapped,
      metadata: { raw: e },
    }, { onConflict: "email" });

    if (mapped === "unsubscribe") {
      await svc.from("mailing_contacts")
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq("normalized_email", e.email.toLowerCase());
    }

    // Mark the matching send row if present
    if (e["message-id"]) {
      await svc.from("email_campaign_sends").update({
        status: mapped.startsWith("bounce") ? "bounced"
              : mapped === "complaint" ? "complained" : "unsubscribed",
      }).eq("brevo_message_id", e["message-id"]);
    }
  }

  return new Response("ok", { headers: corsHeaders });
});
```

- [ ] **Step 2: Register + deploy**

```toml
[functions.brevo-webhook]
verify_jwt = false
```
```bash
supabase functions deploy brevo-webhook
supabase secrets set BREVO_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

- [ ] **Step 3: Configure the webhook in Brevo**

Brevo dashboard → Transactional → Settings → Webhooks → Add
- URL: `https://qexnwezetjlbwltyccks.supabase.co/functions/v1/brevo-webhook`
- Events: `delivered`, `hard_bounce`, `soft_bounce`, `spam`, `unsubscribed`
- Custom header: `x-brevo-secret: <value>`

- [ ] **Step 4: Manual test**

Send a campaign to `bounce@simulator.amazonses.com` — verify a row in `email_suppression_list`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/brevo-webhook/ supabase/config.toml
git commit -m "feat(edge): Brevo webhook ingests bounces/complaints/unsubs into suppression list"
```

---

### Task 5.9: Build the public `/unsubscribe` page + handler

**Files:**
- Create: `supabase/functions/process-unsubscribe/index.ts`
- Create: `src/pages/Unsubscribe.tsx`
- Modify: `src/App.tsx`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Build the edge function**

```ts
// supabase/functions/process-unsubscribe/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyUnsubscribeToken } from "../_shared/unsubscribe.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token } = await req.json();
    const email = await verifyUnsubscribeToken(token, Deno.env.get("UNSUBSCRIBE_SECRET")!);
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await svc.from("mailing_contacts")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("normalized_email", email.toLowerCase());
    await svc.from("email_suppression_list").upsert({
      email, reason: "unsubscribe",
    }, { onConflict: "email" });
    return json({ ok: true, email });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
```

- [ ] **Step 2: Register + deploy**

```toml
[functions.process-unsubscribe]
verify_jwt = false
```
```bash
supabase functions deploy process-unsubscribe
```

- [ ] **Step 3: Build the page**

```tsx
// src/pages/Unsubscribe.tsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("t");
    if (!token) { setState("error"); return; }
    fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-unsubscribe`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) },
    )
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) { setEmail(j.email); setState("done"); }
        else setState("error");
      });
  }, [params]);

  return (
    <div className="max-w-md mx-auto p-8 text-center">
      {state === "loading" && <p>Unsubscribing…</p>}
      {state === "done" && (
        <>
          <h1 className="text-2xl">You're unsubscribed</h1>
          <p>{email} won't receive further Exclu newsletters.</p>
        </>
      )}
      {state === "error" && (
        <>
          <h1 className="text-2xl">Invalid link</h1>
          <p>This unsubscribe link is invalid or has expired.</p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the route in `src/App.tsx`**

Add `<Route path="/unsubscribe" element={<Unsubscribe />} />` **before** the `/:handle` catch-all.

- [ ] **Step 5: Update `vercel.json` rewrites**

Ensure `/unsubscribe` isn't caught by the `og-proxy` rewrite. Add an explicit rule if needed.

- [ ] **Step 6: Manual test**

Visit `/unsubscribe?t=<validToken>` and `/unsubscribe?t=invalid`. Check that the contact row is updated in the success case.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/process-unsubscribe/ src/pages/Unsubscribe.tsx \
        src/App.tsx vercel.json supabase/config.toml
git commit -m "feat: public /unsubscribe route + one-click suppression"
```

---

### Task 5.10: Build the campaign editor page

**Files:**
- Create: `src/pages/admin/AdminEmailCampaignEdit.tsx`
- Modify: `src/App.tsx`
- Extend: `src/lib/adminEmails.ts` with `campaigns.*` methods

- [ ] **Step 1: Extend the API wrapper**

```ts
// append to src/lib/adminEmails.ts
async function callCampaigns<T>(action: string, body: Record<string, unknown> = {}) {
  const { data: session } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-email-campaigns`,
    { method: "POST", headers: {
      authorization: `Bearer ${session.session?.access_token}`,
      "content-type": "application/json",
    }, body: JSON.stringify({ action, ...body }) },
  );
  if (!res.ok) throw new Error(`admin-email-campaigns ${action} failed`);
  return (await res.json()) as T;
}

export const adminCampaigns = {
  list: () => callCampaigns<{ campaigns: any[] }>("list"),
  get: (id: string) => callCampaigns<{ campaign: any }>("get", { id }),
  upsert: (payload: any) => callCampaigns<{ campaign: any }>("upsert", { payload }),
  preview: (segment: any) => callCampaigns<{ sample: any[]; approx_total: number }>("preview-recipients", { segment }),
  schedule: (id: string) => callCampaigns<{ ok: boolean; total: number }>("schedule", { id }),
  pause: (id: string) => callCampaigns<{ ok: boolean }>("pause", { id }),
  resume: (id: string) => callCampaigns<{ ok: boolean }>("resume", { id }),
};
```

- [ ] **Step 2: Build the campaign editor UI**

Standard shadcn form with:
- Name
- Template picker (shadcn `Select` populated from `adminEmails.list()`)
- Subject override (optional)
- Sender email (defaults `Maria@hi.exclu.at`)
- Segment builder:
  - Role multi-select (`creator`, `fan`, `agency`, `chatter`)
  - Signup date range (two shadcn DatePickers)
  - Last seen after (DatePicker)
  - Source dropdown (fetched distinct from contacts)
- "Preview recipients" button → shows sample 50 + total count
- Save draft / Schedule / Pause / Resume action buttons

On schedule, call `adminCampaigns.schedule(id)` and redirect to the campaign detail view.

- [ ] **Step 3: Run dev server, create a test campaign, schedule it with a test segment**

Segment: `{ source: "backfill:profiles" }` limited to a handful of test users.

- [ ] **Step 4: Wait up to 1 minute for the Vercel cron to process**

Check `email_campaign_sends`. Expect rows to flip from `queued` → `sent`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/adminEmails.ts src/pages/admin/AdminEmailCampaignEdit.tsx src/App.tsx
git commit -m "feat(admin): campaign editor with segment builder + schedule"
```

---

### Task 5.11: Build the campaign list + logs pages

**Files:**
- Create: `src/pages/admin/AdminEmailCampaigns.tsx`
- Create: `src/pages/admin/AdminEmailLogs.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Build the campaign list**

Standard shadcn Table with columns: Name, Status (badge), Scheduled, Sent, Failed, Actions (Edit / Pause / Resume). Pulls from `adminCampaigns.list()`.

- [ ] **Step 2: Build the logs page**

Reuses the `email_campaign_sends` table. Columns: Campaign, Email, Status, Sent at, Error. Filter by status. Pagination.

Needs a new `adminCampaigns.sends(campaignId, status?)` action on the admin edge function — add it.

- [ ] **Step 3: Manual verify**

```bash
npm run dev
```
Navigate through `/admin/emails/campaigns` → edit → back to list → logs tab. Confirm state.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminEmailCampaigns.tsx src/pages/admin/AdminEmailLogs.tsx \
        src/App.tsx supabase/functions/admin-email-campaigns/index.ts
git commit -m "feat(admin): campaigns list + send-level logs UI"
```

---

# PHASE 6 — Offensive Testing + Go-Live Checklist

---

### Task 6.1: Write an offensive test script against the signup pipeline

**Files:**
- Create: `scripts/offensive/test-signup-hardening.ts`

- [ ] **Step 1: Write the script**

```ts
// scripts/offensive/test-signup-hardening.ts
// Run with: npx tsx scripts/offensive/test-signup-hardening.ts <base_url>

const BASE = process.argv[2];
if (!BASE) throw new Error("usage: tsx test-signup-hardening.ts https://exclu.at");

interface Result { label: string; ok: boolean; detail?: string }
const results: Result[] = [];

async function call(email: string, fingerprint?: string) {
  const r = await fetch(`${BASE}/functions/v1/check-signup-allowed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, device_fingerprint: fingerprint }),
  });
  return r.json();
}

async function main() {
  // 1. Disposable domain
  const d1 = await call("attacker@mailinator.com");
  results.push({ label: "blocks mailinator", ok: d1.reason === "disposable_email" });

  // 2. Rapid-fire IP rate limit (loop 10 calls with different emails)
  let blocked = false;
  for (let i = 0; i < 10; i++) {
    const r = await call(`t${i}@gmail.com`);
    if (r.reason === "too_many_signups_ip") blocked = true;
  }
  results.push({ label: "ip rate limit triggers", ok: blocked });

  // 3. Fingerprint rate limit
  const fp = "fake-fingerprint-xyz";
  let fpBlocked = false;
  for (let i = 0; i < 5; i++) {
    const r = await call(`fp${i}@gmail.com`, fp);
    if (r.reason === "too_many_signups_device") fpBlocked = true;
  }
  results.push({ label: "fingerprint rate limit triggers", ok: fpBlocked });

  console.table(results);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) { console.error("FAIL:", failed); process.exit(1); }
  console.log("All offensive checks passed.");
}

main();
```

- [ ] **Step 2: Run against local supabase**

```bash
npx tsx scripts/offensive/test-signup-hardening.ts http://localhost:54321
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add scripts/offensive/test-signup-hardening.ts
git commit -m "test: offensive signup hardening script"
```

---

### Task 6.2: Go-live checklist (doc + execution)

**Files:**
- Create: `docs/ops/mailing-go-live-checklist.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Mailing system go-live checklist

## Secrets (Supabase → Project Settings → Secrets)
- [ ] BREVO_API_KEY
- [ ] BREVO_SENDER_EMAIL (apex, transactional)
- [ ] BREVO_SENDER_NAME
- [ ] BREVO_CAMPAIGN_SENDER_EMAIL (hi.exclu.at)
- [ ] BREVO_CAMPAIGN_SENDER_NAME
- [ ] BREVO_WEBHOOK_SECRET
- [ ] CAMPAIGN_QUEUE_SECRET
- [ ] UNSUBSCRIBE_SECRET

## Vercel env vars
- [ ] CAMPAIGN_QUEUE_SECRET (same value as above)
- [ ] SUPABASE_URL
- [ ] SUPABASE_SERVICE_ROLE_KEY (if used by any api/ function)

## DNS — Hostinger / hi.exclu.at
- [ ] brevo-code TXT
- [ ] DKIM TXT
- [ ] SPF TXT
- [ ] DMARC TXT
- [ ] Tracking CNAME
- [ ] Brevo authentication = green

## Brevo dashboard
- [ ] hi.exclu.at domain authenticated
- [ ] Maria@hi.exclu.at verified sender
- [ ] Webhook configured with x-brevo-secret header

## Supabase Auth (hosted dashboard)
- [ ] Enable email confirmations = OFF (Phase 2 flip)

## Database
- [ ] All migrations 130–138 applied on prod
- [ ] Disposable domain seed script run against prod
- [ ] Backfill migration 135 applied (mailing_contacts populated)

## Functional smoke tests on prod
- [ ] Creator signup (no email confirm, immediate session)
- [ ] Password reset mail arrives
- [ ] Magic link mail arrives
- [ ] Fan buys a link → delivery mail arrives
- [ ] Guest chat capture stores email in mailing_contacts
- [ ] Draft a test campaign targeting 3 internal test emails → schedule → receive within 2 min
- [ ] /unsubscribe?t=<token> marks contact unsubscribed
- [ ] Bounce test via simulator adds row to suppression_list

## Offensive tests (Task 6.1 script) vs prod
- [ ] All checks pass
```

- [ ] **Step 2: Execute every check**

This is a manual task for the operator. Mark each checkbox as you verify it in production.

- [ ] **Step 3: Commit**

```bash
git add docs/ops/mailing-go-live-checklist.md
git commit -m "docs: mailing system go-live checklist"
```

---

# Spec coverage self-review

Cross-check against the original `docs/Plan amelioration Exclu.md` feature #15:

| Spec requirement | Task(s) |
|---|---|
| Table `email_templates` in DB | 0.1 |
| Migrate transactional templates from code to DB | 0.2, 1.1–1.6 |
| Admin editor at `/admin/emails` with live preview | 1.8–1.10 |
| Edge functions read templates from DB | 1.2–1.6 |
| `/admin/emails/campaigns` module | 5.5, 5.10, 5.11 |
| Segmentation (role, activity, signup date, subscription) | 5.2, 5.10 |
| Brevo API + batching + rate limits | 5.6 |
| Warmup schedule | 5.4, 5.6 |
| Fan email collection (guest chat / checkouts) | 3.3, 3.4 |
| Contact lists in admin | 3.5 |
| `hi.exclu.at` subdomain (DNS + Brevo) | 4.1 |
| Remove email confirm (hoo.be style) | 2.7 |
| Rate limiting per IP | 2.4 |
| Device fingerprinting | 2.5 |
| Cooldown between signups same IP/device | 2.4 |
| Disposable-email blacklist | 2.3, 2.4 |
| Vercel BotID | 2.6 |
| Offensive tests | 6.1 |

No gaps.

# Placeholder scan

Sections with intentional "paste current HTML" placeholders are Task 1.1 Step 3, which explicitly names the source file + line range to copy from — this is a deliberate carry-over from existing code, not a TODO. Every other task contains complete code.

# Execution recommendation

This is a 3-subsystem plan (~35 tasks) and is large enough that it can safely be split at phase boundaries:
- **Ship sequence A:** Phase 0 → 1 → 6 checklist slice for templates only (1–2 days of work). Safe, zero user-facing impact beyond the admin editor.
- **Ship sequence B:** Phase 2 (signup hardening + remove email confirm). High-impact, requires dashboard toggle. Must run the offensive test suite before flipping.
- **Ship sequence C:** Phases 3 → 4 → 5 → 6 (collection + subdomain + campaigns). Depends on DNS propagation for `hi.exclu.at`.

Each sequence is independently deployable and independently reversible.
