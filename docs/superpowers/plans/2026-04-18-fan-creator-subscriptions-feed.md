# Fan→Creator Subscriptions + Public Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship parts 3 + 4 of [docs/Plan amelioration Exclu.md](../../../docs/Plan%20amelioration%20Exclu.md) — a recurring fan-to-creator subscription, a vertical post feed that replaces the public "Content" tab, and an in-app fan feed tab with a discovery carousel.

**Architecture:**
- New `fan_creator_subscriptions` table (N:N fan↔creator). UGP QuickPay recurring with variable price drives the checkout; webhooks (`ugp-confirm` initial + `ugp-membership-confirm` renewals/cancel) maintain `status` + `period_end`. Frontend gates feed access through a single `has_active_fan_subscription(fan_id, creator_profile_id)` RPC.
- Assets grow two feed-specific columns (`feed_caption`, `is_feed_preview`). A partial-unique index enforces the "1 free preview per creator" rule. All other public assets + published paid links render as blurred feed posts on `/:handle`.
- Fan dashboard adds a new "Feed" tab with a `DiscoveryCarousel` that ranks Pro creators first, filters by `gender` (default `female`).

**Tech stack:** React 18 + TypeScript + Vite SPA (TanStack Query v5, Framer Motion, Tailwind, shadcn/ui), Supabase Postgres/Auth + Deno Edge Functions, UGP QuickPay (hosted checkout + MembershipPostback). No new third-party dependencies.

**External dependency:** UGP needs a new `SubscriptionPlanId` that lets us override `AmountTotal` per checkout (variable price). The plan owner (Thomas / "TB") validates this with Derek and sets `QUICKPAY_FAN_SUB_PLAN_ID` in Supabase secrets + Vercel env vars. **Do not start Phase B task 5 until this plan ID is available.** Until then, the frontend can be wired but checkout will fail at QuickPay.

**Out of scope for this plan** (separate plans already referenced in Plan amelioration Exclu):
- Part 2 (pricing refonte to 15% fan fee / 5% creator) — only touch here to keep `create-link-checkout` pricing untouched
- Part 1 (+18 KYC), Part 5 (guest custom request), Part 6 (bulk link from ContentLibrary), and parts 7–15

---

## File Structure

### New files

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/147_fan_creator_subscriptions.sql` | DB schema: fan_creator_subscriptions table, RLS, indexes, `has_active_fan_subscription` RPC, new columns on `creator_profiles` (fan sub price/enabled, gender) and `assets` (feed_caption, is_feed_preview), partial-unique preview index |
| `supabase/functions/create-fan-subscription-checkout/index.ts` | Issue a UGP recurring checkout at the creator's price. Pre-creates a pending `fan_creator_subscriptions` row, returns QuickPay form fields. |
| `supabase/functions/create-fan-subscription-checkout/config.toml` | `verify_jwt = false` (auth done manually) |
| `supabase/functions/cancel-fan-subscription/index.ts` | Return QuickPay Cancel form fields. Flips `cancel_at_period_end=true` so access persists until `period_end`. |
| `supabase/functions/cancel-fan-subscription/config.toml` | `verify_jwt = false` |
| `src/components/feed/FeedPost.tsx` | Renders one feed card (asset or paid link) with optional blur overlay + CTA |
| `src/components/feed/SubscriptionPopup.tsx` | "Discover all [Name]'s exclusive contents" modal with price + Subscribe CTA |
| `src/components/feed/DiscoveryCarousel.tsx` | Horizontal carousel of recommended creators, Pro-first sorting, gender filter |
| `src/hooks/useFanSubscription.ts` | Hook: `{ isSubscribed, isLoading, refetch }` for a given `creator_profile_id`; wraps the `has_active_fan_subscription` RPC. |
| `src/components/linkinbio/sections/FanSubscriptionSection.tsx` | Creator editor section: toggle, price input (min $5), gender select |

### Modified files

| Path | Change |
| --- | --- |
| `src/App.tsx` | No new routes — Feed is an in-app tab of `/fan` (no new route needed). |
| `vercel.json` | No change (the in-app feed is a tab inside `/fan`, already wired). |
| `src/pages/CreatorPublic.tsx` | Replace `activeTab === 'content'` grid with vertical `FeedPost` list. Mix public links as blurred posts. Wire subscribe popup. |
| `src/pages/FanDashboard.tsx` | Add `'feed'` tab between `messages` and `tips`. Renders posts + DiscoveryCarousel. |
| `src/pages/LinkInBioEditor.tsx` | Load/save `fan_subscription_price_cents`, `fan_subscription_enabled`, `gender`. Render `FanSubscriptionSection`. |
| `src/components/linkinbio/sections/PublicContentSection.tsx` | Add "Feed caption" textarea and "Free preview" radio per asset. Enforce single preview client-side before hitting DB constraint. |
| `src/pages/ContentLibrary.tsx` | Surface feed caption + preview flag when uploading (kept light — full editing in PublicContentSection). |
| `supabase/functions/ugp-confirm/index.ts` | Add `case 'fsub':` → activate fan subscription row (status active, period_end = now + 30d). |
| `supabase/functions/ugp-membership-confirm/index.ts` | Disambiguate postbacks by `SubscriptionPlanId`: route to fan-sub handler when it matches `QUICKPAY_FAN_SUB_PLAN_ID`; else fall through to creator-sub logic (existing). |
| `src/components/chat/ChatWindow.tsx` | Add "View feed" CTA in chat header linking to the creator's public profile feed. |

---

## Task List

### Task 1: DB migration — fan subscription columns + gender on `creator_profiles`

**Files:**
- Create: `supabase/migrations/147_fan_creator_subscriptions.sql` (this task writes the first stanza; later tasks append stanzas to the same file)

- [ ] **Step 1: Create migration file with the first stanza**

```sql
-- supabase/migrations/147_fan_creator_subscriptions.sql
--
-- Parts 3 + 4 of "Plan amelioration Exclu.md":
--   - Fan → creator recurring subscription
--   - Public feed of posts (assets + blurred links)
--   - In-app fan feed + discovery carousel
--
-- This migration is idempotent (safe to re-run) and splits into three stanzas:
--   A) Columns on creator_profiles (fan sub price, enabled, gender)
--   B) Columns on assets (feed_caption, is_feed_preview) + one-preview unique index
--   C) fan_creator_subscriptions table, RLS, indexes, has_active_fan_subscription RPC

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  STANZA A — creator_profiles: fan subscription config + gender        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE "public"."creator_profiles"
  ADD COLUMN IF NOT EXISTS "fan_subscription_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "fan_subscription_price_cents" integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS "gender" text;

ALTER TABLE "public"."creator_profiles"
  DROP CONSTRAINT IF EXISTS "creator_profiles_fan_sub_price_check";
ALTER TABLE "public"."creator_profiles"
  ADD CONSTRAINT "creator_profiles_fan_sub_price_check"
  CHECK ("fan_subscription_price_cents" >= 500 AND "fan_subscription_price_cents" <= 10000);

ALTER TABLE "public"."creator_profiles"
  DROP CONSTRAINT IF EXISTS "creator_profiles_gender_check";
ALTER TABLE "public"."creator_profiles"
  ADD CONSTRAINT "creator_profiles_gender_check"
  CHECK ("gender" IS NULL OR "gender" IN ('female', 'male', 'other'));

COMMENT ON COLUMN "public"."creator_profiles"."fan_subscription_enabled"
  IS 'Whether fans can subscribe to this profile to unlock the feed. Default true on creation.';
COMMENT ON COLUMN "public"."creator_profiles"."fan_subscription_price_cents"
  IS 'Monthly fan subscription price in cents. Default $5, min $5, max $100.';
COMMENT ON COLUMN "public"."creator_profiles"."gender"
  IS 'Creator gender for discovery filter: female | male | other. NULL = unspecified.';

-- Backfill gender = 'female' for visible creators so the default discovery filter returns results.
UPDATE "public"."creator_profiles"
   SET "gender" = 'female'
 WHERE "gender" IS NULL
   AND "is_active" = true
   AND "is_directory_visible" = true;
```

- [ ] **Step 2: Reset local DB and verify**

Run:
```bash
supabase db reset
```
Expected: command succeeds, no error about `creator_profiles`.

Then verify columns exist:
```bash
supabase db execute --linked --sql "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='creator_profiles' AND column_name IN ('fan_subscription_enabled','fan_subscription_price_cents','gender') ORDER BY column_name;"
```
Expected: 3 rows listing the new columns with correct types.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/147_fan_creator_subscriptions.sql
git commit -m "feat(db): add fan subscription config + gender to creator_profiles"
```

---

### Task 2: DB migration — feed caption + single-preview on `assets`

**Files:**
- Modify: `supabase/migrations/147_fan_creator_subscriptions.sql` (append stanza B)

- [ ] **Step 1: Append stanza B to the migration file**

Append this block at the bottom of `supabase/migrations/147_fan_creator_subscriptions.sql`:

```sql

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  STANZA B — assets: feed_caption + is_feed_preview                    ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE "public"."assets"
  ADD COLUMN IF NOT EXISTS "feed_caption" text,
  ADD COLUMN IF NOT EXISTS "is_feed_preview" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."assets"
  DROP CONSTRAINT IF EXISTS "assets_feed_caption_length_check";
ALTER TABLE "public"."assets"
  ADD CONSTRAINT "assets_feed_caption_length_check"
  CHECK ("feed_caption" IS NULL OR char_length("feed_caption") <= 500);

COMMENT ON COLUMN "public"."assets"."feed_caption"
  IS 'Optional legend displayed above the post in the public feed (max 500 chars).';
COMMENT ON COLUMN "public"."assets"."is_feed_preview"
  IS 'Marks this asset as the ONE unblurred preview visible to non-subscribers. At most 1 per creator_profile (enforced by partial unique index).';

-- Enforce: at most one preview per profile_id (the multi-profile tenant key).
-- We use two partial indexes to cover rows pre-multi-profile (profile_id IS NULL, creator_id is key).
DROP INDEX IF EXISTS "public"."uniq_feed_preview_per_profile";
CREATE UNIQUE INDEX "uniq_feed_preview_per_profile"
  ON "public"."assets" ("profile_id")
  WHERE "is_feed_preview" = true AND "profile_id" IS NOT NULL;

DROP INDEX IF EXISTS "public"."uniq_feed_preview_per_creator_legacy";
CREATE UNIQUE INDEX "uniq_feed_preview_per_creator_legacy"
  ON "public"."assets" ("creator_id")
  WHERE "is_feed_preview" = true AND "profile_id" IS NULL;

-- Helper index for feed ordering on the public profile
DROP INDEX IF EXISTS "public"."idx_assets_profile_feed";
CREATE INDEX "idx_assets_profile_feed"
  ON "public"."assets" ("profile_id", "is_public", "created_at" DESC);
```

- [ ] **Step 2: Reset local DB**

Run:
```bash
supabase db reset
```
Expected: success.

- [ ] **Step 3: Verify the partial unique preview constraint**

Run:
```bash
supabase db execute --linked --sql "INSERT INTO creator_profiles (id, user_id, username) VALUES ('00000000-0000-0000-0000-000000000aaa', (SELECT id FROM auth.users LIMIT 1), 'test_preview_uniq') ON CONFLICT DO NOTHING; INSERT INTO assets (creator_id, profile_id, storage_path, is_public, is_feed_preview) VALUES ((SELECT user_id FROM creator_profiles WHERE username='test_preview_uniq'), '00000000-0000-0000-0000-000000000aaa', 'dummy/1', true, true); INSERT INTO assets (creator_id, profile_id, storage_path, is_public, is_feed_preview) VALUES ((SELECT user_id FROM creator_profiles WHERE username='test_preview_uniq'), '00000000-0000-0000-0000-000000000aaa', 'dummy/2', true, true);"
```
Expected: second INSERT fails with `duplicate key value violates unique constraint "uniq_feed_preview_per_profile"`.

Cleanup:
```bash
supabase db execute --linked --sql "DELETE FROM assets WHERE storage_path IN ('dummy/1','dummy/2'); DELETE FROM creator_profiles WHERE username='test_preview_uniq';"
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/147_fan_creator_subscriptions.sql
git commit -m "feat(db): add feed caption + one-preview constraint on assets"
```

---

### Task 3: DB migration — `fan_creator_subscriptions` table + RLS

**Files:**
- Modify: `supabase/migrations/147_fan_creator_subscriptions.sql` (append stanza C)

- [ ] **Step 1: Append stanza C**

Append this block at the bottom of `supabase/migrations/147_fan_creator_subscriptions.sql`:

```sql

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  STANZA C — fan_creator_subscriptions table, RLS, RPC                 ║
-- ╚══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS "public"."fan_creator_subscriptions" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fan_id"                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "creator_profile_id"      uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  "creator_user_id"         uuid NOT NULL, -- denormalized so we can join without going through creator_profiles
  "status"                  text NOT NULL DEFAULT 'pending',
  "price_cents"             integer NOT NULL,
  "currency"                text NOT NULL DEFAULT 'USD',
  "ugp_member_id"           text,
  "ugp_membership_username" text,        -- what we pass as MembershipUsername to QuickPay (= this row's id)
  "ugp_merchant_reference"  text,
  "ugp_transaction_id"      text,        -- initial Sale transaction id
  "period_start"            timestamptz,
  "period_end"              timestamptz,
  "started_at"              timestamptz,
  "cancelled_at"            timestamptz,
  "cancel_at_period_end"    boolean NOT NULL DEFAULT false,
  "created_at"              timestamptz NOT NULL DEFAULT now(),
  "updated_at"              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "fan_creator_subscriptions_status_check"
    CHECK ("status" IN ('pending', 'active', 'cancelled', 'expired', 'past_due')),
  CONSTRAINT "fan_creator_subscriptions_price_check"
    CHECK ("price_cents" >= 500)
);

COMMENT ON TABLE "public"."fan_creator_subscriptions" IS
  'Recurring monthly subscription of a fan to a specific creator profile (N:N). Payment via UGP QuickPay (variable price). period_end is the access boundary regardless of status.';

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_fan_subs_fan_active"
  ON "public"."fan_creator_subscriptions" ("fan_id", "status")
  WHERE "status" IN ('active', 'cancelled');

CREATE INDEX IF NOT EXISTS "idx_fan_subs_creator_profile"
  ON "public"."fan_creator_subscriptions" ("creator_profile_id", "status");

CREATE INDEX IF NOT EXISTS "idx_fan_subs_ugp_username"
  ON "public"."fan_creator_subscriptions" ("ugp_membership_username")
  WHERE "ugp_membership_username" IS NOT NULL;

-- A fan can have multiple historical rows per creator, but only one that is not terminal.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fan_sub_live_per_creator"
  ON "public"."fan_creator_subscriptions" ("fan_id", "creator_profile_id")
  WHERE "status" IN ('pending', 'active', 'cancelled', 'past_due');

-- updated_at trigger (pattern reused from other tables)
CREATE OR REPLACE FUNCTION "public"."fan_creator_subscriptions_touch_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_fan_subs_updated_at" ON "public"."fan_creator_subscriptions";
CREATE TRIGGER "trg_fan_subs_updated_at"
  BEFORE UPDATE ON "public"."fan_creator_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "public"."fan_creator_subscriptions_touch_updated_at"();

-- RLS
ALTER TABLE "public"."fan_creator_subscriptions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fans_read_own_subscriptions" ON "public"."fan_creator_subscriptions";
CREATE POLICY "fans_read_own_subscriptions"
  ON "public"."fan_creator_subscriptions"
  FOR SELECT
  USING (auth.uid() = "fan_id");

DROP POLICY IF EXISTS "creators_read_their_subscribers" ON "public"."fan_creator_subscriptions";
CREATE POLICY "creators_read_their_subscribers"
  ON "public"."fan_creator_subscriptions"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.creator_profiles cp
       WHERE cp.id = fan_creator_subscriptions.creator_profile_id
         AND cp.user_id = auth.uid()
    )
  );

-- All writes go through edge functions using the service role — no INSERT/UPDATE/DELETE
-- policies for regular users (this matches the chatter_invitations / purchases pattern).

GRANT SELECT ON "public"."fan_creator_subscriptions" TO "authenticated";
-- Anonymous users never read subscriptions directly; feed access check goes through the RPC below.
```

- [ ] **Step 2: Reset local DB**

Run:
```bash
supabase db reset
```
Expected: success.

- [ ] **Step 3: Verify table + RLS**

Run:
```bash
supabase db execute --linked --sql "SELECT COUNT(*) AS policies FROM pg_policies WHERE tablename='fan_creator_subscriptions';"
```
Expected: `policies = 2`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/147_fan_creator_subscriptions.sql
git commit -m "feat(db): add fan_creator_subscriptions table with RLS"
```

---

### Task 4: DB migration — `has_active_fan_subscription` RPC

**Files:**
- Modify: `supabase/migrations/147_fan_creator_subscriptions.sql` (append stanza D)

- [ ] **Step 1: Append stanza D**

Append at the bottom of the migration:

```sql

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  STANZA D — has_active_fan_subscription RPC                           ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- SECURITY DEFINER so it bypasses RLS, but the function only returns a boolean
-- (never row data) and takes the fan_id explicitly — the frontend must pass
-- the current user. Anonymous callers can ask "is user X subscribed to creator Y"
-- which is fine since the answer is boolean and guessing a UUID is infeasible.
CREATE OR REPLACE FUNCTION "public"."has_active_fan_subscription"(
  p_fan_id uuid,
  p_creator_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.fan_creator_subscriptions
     WHERE fan_id = p_fan_id
       AND creator_profile_id = p_creator_profile_id
       AND status IN ('active', 'cancelled')
       AND period_end IS NOT NULL
       AND period_end > now()
  );
$$;

COMMENT ON FUNCTION "public"."has_active_fan_subscription"(uuid, uuid) IS
  'Returns true iff fan has an active paid period on that creator profile. Cancelled subs retain access until period_end.';

GRANT EXECUTE ON FUNCTION "public"."has_active_fan_subscription"(uuid, uuid) TO "anon", "authenticated";
```

- [ ] **Step 2: Reset local DB and verify RPC**

Run:
```bash
supabase db reset
supabase db execute --linked --sql "SELECT has_active_fan_subscription('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid);"
```
Expected: returns `false` (no rows match — sanity check).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/147_fan_creator_subscriptions.sql
git commit -m "feat(db): add has_active_fan_subscription RPC"
```

---

### Task 5: Edge Function — `create-fan-subscription-checkout`

**Files:**
- Create: `supabase/functions/create-fan-subscription-checkout/index.ts`
- Create: `supabase/functions/create-fan-subscription-checkout/config.toml`

**Context:** Fan is authenticated. Input: `creator_profile_id`. We pre-create a pending `fan_creator_subscriptions` row, pass its id as `MembershipUsername` to QuickPay so we can match on cancel/postbacks, and set `AmountTotal` = creator's chosen price. `SubscriptionPlanId` comes from the new env var `QUICKPAY_FAN_SUB_PLAN_ID` (variable-price plan set up with Derek).

- [ ] **Step 1: Create config.toml**

```toml
verify_jwt = false
```

- [ ] **Step 2: Create index.ts**

```ts
// supabase/functions/create-fan-subscription-checkout/index.ts
//
// Creates a UGP QuickPay recurring subscription checkout for a fan → creator
// subscription. Variable price (from creator_profiles.fan_subscription_price_cents).
//
// Auth: required (fan must be logged in).
// Returns: { fields } to POST to QuickPay, OR { alreadySubscribed: true } if a
// live subscription exists.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');
const quickPayToken = Deno.env.get('QUICKPAY_TOKEN');
const siteId = Deno.env.get('QUICKPAY_SITE_ID') || '98845';
const fanSubPlanId = Deno.env.get('QUICKPAY_FAN_SUB_PLAN_ID'); // variable-price plan, set up with Derek

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
if (!quickPayToken) throw new Error('Missing QUICKPAY_TOKEN');
if (!fanSubPlanId) throw new Error('Missing QUICKPAY_FAN_SUB_PLAN_ID');

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const allowedOrigins = [
  siteUrl,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins.includes(origin) ? origin : siteUrl;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonOk(data: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Auth required ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Missing authorization header', 401, corsHeaders);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return jsonError('Invalid or expired token', 401, corsHeaders);

    // ── Parse body ──
    const body = await req.json().catch(() => ({}));
    const creatorProfileId = typeof body?.creator_profile_id === 'string' ? body.creator_profile_id : null;
    if (!creatorProfileId) return jsonError('Missing creator_profile_id', 400, corsHeaders);

    // ── Fetch creator profile ──
    const { data: creatorProfile, error: cpErr } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, user_id, username, display_name, fan_subscription_enabled, fan_subscription_price_cents')
      .eq('id', creatorProfileId)
      .eq('is_active', true)
      .single();

    if (cpErr || !creatorProfile) return jsonError('Creator profile not found', 404, corsHeaders);
    if (!creatorProfile.fan_subscription_enabled) return jsonError('Subscriptions are disabled for this creator', 400, corsHeaders);
    if (creatorProfile.user_id === user.id) return jsonError('Creators cannot subscribe to themselves', 400, corsHeaders);

    const priceCents = creatorProfile.fan_subscription_price_cents || 500;
    if (priceCents < 500) return jsonError('Invalid subscription price', 400, corsHeaders);

    // ── Short-circuit if a live sub already exists ──
    const { data: existingLive } = await supabaseAdmin
      .from('fan_creator_subscriptions')
      .select('id, status, period_end')
      .eq('fan_id', user.id)
      .eq('creator_profile_id', creatorProfileId)
      .in('status', ['pending', 'active', 'cancelled', 'past_due'])
      .maybeSingle();

    if (existingLive && existingLive.status === 'active' && existingLive.period_end && new Date(existingLive.period_end) > new Date()) {
      return jsonOk({ alreadySubscribed: true, subscription_id: existingLive.id }, corsHeaders);
    }

    // ── Reuse pending row (idempotent retries) or create a new one ──
    let subId = existingLive?.id ?? null;
    if (!subId) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('fan_creator_subscriptions')
        .insert({
          fan_id: user.id,
          creator_profile_id: creatorProfileId,
          creator_user_id: creatorProfile.user_id,
          status: 'pending',
          price_cents: priceCents,
          currency: 'USD',
        })
        .select('id')
        .single();
      if (insErr || !inserted) {
        console.error('Error creating pending fan subscription', insErr);
        return jsonError('Unable to start subscription checkout', 500, corsHeaders);
      }
      subId = inserted.id;
    }

    const merchantReference = `fsub_${subId}`;
    const amountDecimal = (priceCents / 100).toFixed(2);
    const displayName = creatorProfile.display_name || creatorProfile.username || 'creator';

    const fields: Record<string, string> = {
      QuickPayToken: quickPayToken!,
      SiteID: siteId,
      AmountTotal: amountDecimal,
      CurrencyID: 'USD',
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'true',
      ShowUserNamePassword: 'false',
      MembershipUsername: subId!, // uuid, matched on postbacks
      SubscriptionPlanId: fanSubPlanId!,
      'ItemName[0]': `Subscribe to ${displayName}`,
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': amountDecimal,
      'ItemDesc[0]': `Monthly subscription to ${displayName}'s exclusive content`,
      ApprovedURL: `${siteUrl}/fan?tab=feed&subscribed=${encodeURIComponent(creatorProfile.username || '')}`,
      ConfirmURL: `${siteUrl}/api/ugp-confirm`,
      DeclinedURL: `${siteUrl}/${encodeURIComponent(creatorProfile.username || '')}?subscribe_failed=1`,
      MerchantReference: merchantReference,
      Email: user.email || '',
    };

    // Persist the merchant reference + username for later cancel ops
    await supabaseAdmin.from('fan_creator_subscriptions').update({
      ugp_membership_username: subId,
      ugp_merchant_reference: merchantReference,
    }).eq('id', subId);

    return jsonOk({ fields, subscription_id: subId }, corsHeaders);
  } catch (err) {
    console.error('Error in create-fan-subscription-checkout:', err);
    return jsonError('Unable to start subscription checkout', 500, corsHeaders);
  }
});
```

- [ ] **Step 3: Deploy and smoke-test**

Run:
```bash
supabase functions deploy create-fan-subscription-checkout
```
Expected: deploy succeeds.

Then, as the Supabase project owner, set the env var:
```bash
supabase secrets set QUICKPAY_FAN_SUB_PLAN_ID=<value from Derek>
```
**If the plan ID isn't ready yet, leave this blocked and continue with tasks 6–20; mark this step done when the env var is live.**

Smoke-test (logged-in fan session):
```bash
curl -X POST https://qexnwezetjlbwltyccks.supabase.co/functions/v1/create-fan-subscription-checkout \
  -H "Authorization: Bearer <FAN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"creator_profile_id":"<real creator profile uuid>"}' | jq .
```
Expected: `{ fields: { SubscriptionPlanId: "...", AmountTotal: "5.00", ... } }`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/create-fan-subscription-checkout/
git commit -m "feat(functions): create-fan-subscription-checkout with variable price"
```

---

### Task 6: Extend `ugp-confirm` — handle `fsub_` merchant reference

**Files:**
- Modify: `supabase/functions/ugp-confirm/index.ts`

- [ ] **Step 1: Add the new case in the main switch**

Find the switch in `supabase/functions/ugp-confirm/index.ts` (around line 131):

```ts
    switch (parsed.type) {
      case 'link':
        await handleLinkPurchase(parsed.id, body);
        break;
      case 'tip':
        await handleTip(parsed.id, body);
        break;
      case 'gift':
        await handleGift(parsed.id, body);
        break;
      case 'req':
        await handleRequest(parsed.id, body, transactionState);
        break;
      case 'sub':
        await handleSubscription(parsed.id, body);
        break;
      default:
        console.warn('Unknown transaction type:', parsed.type);
    }
```

Replace with:

```ts
    switch (parsed.type) {
      case 'link':
        await handleLinkPurchase(parsed.id, body);
        break;
      case 'tip':
        await handleTip(parsed.id, body);
        break;
      case 'gift':
        await handleGift(parsed.id, body);
        break;
      case 'req':
        await handleRequest(parsed.id, body, transactionState);
        break;
      case 'sub':
        await handleSubscription(parsed.id, body);
        break;
      case 'fsub':
        await handleFanSubscription(parsed.id, body);
        break;
      default:
        console.warn('Unknown transaction type:', parsed.type);
    }
```

- [ ] **Step 2: Append the `handleFanSubscription` function**

At the bottom of `supabase/functions/ugp-confirm/index.ts` (after `handleSubscription`, before `SHARED HELPERS`), add:

```ts
// ══════════════════════════════════════════════════════════════════════════
// FAN → CREATOR SUBSCRIPTION (initial Sale only — renewals hit ugp-membership-confirm)
// ══════════════════════════════════════════════════════════════════════════

async function handleFanSubscription(subscriptionId: string, body: Record<string, string>) {
  const { data: sub, error: fetchErr } = await supabase
    .from('fan_creator_subscriptions')
    .select('id, fan_id, creator_profile_id, status, price_cents, period_end')
    .eq('id', subscriptionId)
    .single();

  if (fetchErr || !sub) {
    console.error('Fan subscription not found:', subscriptionId, fetchErr);
    return;
  }

  // Idempotent: already active and period still valid
  if (sub.status === 'active' && sub.period_end && new Date(sub.period_end) > new Date()) {
    console.log('Fan subscription already active:', subscriptionId);
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 30); // 30-day cycle; membership-confirm extends on Rebill

  const { error: updateErr } = await supabase
    .from('fan_creator_subscriptions')
    .update({
      status: 'active',
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
      started_at: sub.status === 'pending' ? now.toISOString() : undefined,
      ugp_transaction_id: body.TransactionID,
      ugp_merchant_reference: body.MerchantReference,
      cancel_at_period_end: false,
    })
    .eq('id', subscriptionId);

  if (updateErr) {
    console.error('Error activating fan subscription:', updateErr);
    return;
  }

  console.log('Fan subscription activated:', subscriptionId, 'period_end=', periodEnd.toISOString());
}
```

- [ ] **Step 3: Deploy and verify**

```bash
supabase functions deploy ugp-confirm
```

Manual test (requires a real QuickPay sandbox transaction — ok to defer to the E2E task at the end if no sandbox):
```bash
# Simulate an fsub postback
curl -X POST https://qexnwezetjlbwltyccks.supabase.co/functions/v1/ugp-confirm \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "TransactionID=test-fsub-1&MerchantReference=fsub_<real pending sub uuid>&TransactionState=Sale&Amount=5.00&CustomerEmail=test@fan.local"
```
Expected: response `OK`; DB row flipped to `status='active'` with `period_end` ≈ now+30d.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ugp-confirm/index.ts
git commit -m "feat(functions): handle fsub_ merchant reference in ugp-confirm"
```

---

### Task 7: Extend `ugp-membership-confirm` — route fan-sub renewals/cancels

**Files:**
- Modify: `supabase/functions/ugp-membership-confirm/index.ts`

**Context:** Membership postbacks have the same shape for creator subs and fan subs. Disambiguate by `SubscriptionPlanId`. For fan subs, `Username` is the subscription row id (what we set as `MembershipUsername` in Task 5).

- [ ] **Step 1: Read env vars at top**

Near the other `Deno.env.get()` calls at the top of the file, add:
```ts
const creatorPlanId = Deno.env.get('QUICKPAY_SUB_PLAN_ID') || '11027';
const fanPlanId = Deno.env.get('QUICKPAY_FAN_SUB_PLAN_ID');
```

- [ ] **Step 2: Route the postback in the main switch**

Find the block (around line 66):
```ts
  try {
    switch (action) {
      case 'Add':
      case 'Rebill':
        await handleActivation(userId, memberId, action);
        break;

      case 'Cancel':
      case 'Inactive':
        await handleDeactivation(userId, action);
        break;

      default:
        console.warn('Unknown membership action:', action);
    }
  } catch (err) {
```

Replace with:

```ts
  const isFanSubPlan = !!fanPlanId && subscriptionPlanId === fanPlanId;

  try {
    if (isFanSubPlan) {
      // Fan → creator subscription. Username = fan_creator_subscriptions.id.
      switch (action) {
        case 'Add':
        case 'Rebill':
          await handleFanActivation(userId /* = sub row id */, memberId, action);
          break;
        case 'Cancel':
        case 'Inactive':
          await handleFanDeactivation(userId /* = sub row id */, action);
          break;
        default:
          console.warn('Unknown fan-sub membership action:', action);
      }
    } else {
      // Creator premium subscription (existing behaviour).
      switch (action) {
        case 'Add':
        case 'Rebill':
          await handleActivation(userId, memberId, action);
          break;
        case 'Cancel':
        case 'Inactive':
          await handleDeactivation(userId, action);
          break;
        default:
          console.warn('Unknown membership action:', action);
      }
    }
  } catch (err) {
```

- [ ] **Step 3: Add fan-sub activation + deactivation handlers**

Append at the bottom of the file:

```ts
// ── FAN → CREATOR SUBSCRIPTION HANDLERS ─────────────────────────────────

async function handleFanActivation(subId: string, memberId: string, action: string) {
  const { data: sub } = await supabase
    .from('fan_creator_subscriptions')
    .select('id, status, period_end, cancel_at_period_end')
    .eq('id', subId)
    .single();

  if (!sub) {
    console.error('Fan sub not found for activation:', subId);
    return;
  }

  // New 30-day period starting now (Rebill extends, Add activates first period).
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);

  const updatePayload: Record<string, unknown> = {
    status: 'active',
    period_start: now.toISOString(),
    period_end: periodEnd.toISOString(),
    ugp_member_id: memberId,
    cancel_at_period_end: false,
  };
  if (!sub.status || sub.status === 'pending') {
    updatePayload.started_at = now.toISOString();
  }

  await supabase.from('fan_creator_subscriptions').update(updatePayload).eq('id', subId);
  console.log(`Fan sub ${action}:`, subId, 'period_end=', periodEnd.toISOString());
}

async function handleFanDeactivation(subId: string, action: string) {
  // The fan keeps access until the current period_end. We just flip status to
  // 'cancelled' and stamp cancelled_at; has_active_fan_subscription() still
  // returns true until period_end has passed.
  await supabase
    .from('fan_creator_subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_at_period_end: true,
    })
    .eq('id', subId);

  console.log(`Fan sub ${action}:`, subId);
}
```

- [ ] **Step 4: Deploy and commit**

```bash
supabase functions deploy ugp-membership-confirm
git add supabase/functions/ugp-membership-confirm/index.ts
git commit -m "feat(functions): route fan-sub postbacks in ugp-membership-confirm"
```

---

### Task 8: Edge Function — `cancel-fan-subscription`

**Files:**
- Create: `supabase/functions/cancel-fan-subscription/index.ts`
- Create: `supabase/functions/cancel-fan-subscription/config.toml`

**Context:** Returns QuickPay Cancel form fields (mirror of `cancel-creator-subscription`). Actual cancel is a browser-side POST to QuickPay. On click we also immediately flip `cancel_at_period_end=true` so UX can show "Access until MMM D".

- [ ] **Step 1: config.toml**

```toml
verify_jwt = false
```

- [ ] **Step 2: index.ts**

```ts
// supabase/functions/cancel-fan-subscription/index.ts
//
// Returns UGP QuickPay Cancel form fields for a fan → creator subscription.
// Also flips cancel_at_period_end=true immediately so the UI can reflect pending
// cancellation. Status stays 'active' until UGP fires the Cancel postback (then
// ugp-membership-confirm flips status → 'cancelled'); access persists until
// period_end regardless.
//
// Auth: required (fan must own the subscription).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const quickPayToken = Deno.env.get('QUICKPAY_TOKEN');
const siteId = Deno.env.get('QUICKPAY_SITE_ID') || '98845';
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
if (!quickPayToken) throw new Error('Missing QUICKPAY_TOKEN');

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const allowedOrigins = [
  siteUrl,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins.includes(origin) ? origin : siteUrl;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonOk(data: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Missing authorization header', 401, corsHeaders);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return jsonError('Invalid or expired token', 401, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const subId = typeof body?.subscription_id === 'string' ? body.subscription_id : null;
    if (!subId) return jsonError('Missing subscription_id', 400, corsHeaders);

    const { data: sub } = await supabaseAdmin
      .from('fan_creator_subscriptions')
      .select('id, fan_id, status, ugp_membership_username, period_end')
      .eq('id', subId)
      .single();

    if (!sub || sub.fan_id !== user.id) return jsonError('Subscription not found', 404, corsHeaders);
    if (sub.status !== 'active') return jsonError('Subscription is not active', 400, corsHeaders);

    // Mark pending cancellation immediately so the UI can update.
    await supabaseAdmin
      .from('fan_creator_subscriptions')
      .update({ cancel_at_period_end: true })
      .eq('id', subId);

    return jsonOk({
      action: 'https://quickpay.ugpayments.ch/Cancel',
      fields: {
        QuickpayToken: quickPayToken!,
        username: sub.ugp_membership_username || sub.id,
        SiteID: siteId,
      },
      period_end: sub.period_end,
    }, corsHeaders);
  } catch (err) {
    console.error('Error in cancel-fan-subscription:', err);
    return jsonError('Unable to cancel subscription', 500, corsHeaders);
  }
});
```

- [ ] **Step 3: Deploy and commit**

```bash
supabase functions deploy cancel-fan-subscription
git add supabase/functions/cancel-fan-subscription/
git commit -m "feat(functions): cancel-fan-subscription"
```

---

### Task 9: Creator editor — FanSubscriptionSection

**Files:**
- Create: `src/components/linkinbio/sections/FanSubscriptionSection.tsx`
- Modify: `src/pages/LinkInBioEditor.tsx`

- [ ] **Step 1: Create `FanSubscriptionSection.tsx`**

```tsx
// src/components/linkinbio/sections/FanSubscriptionSection.tsx
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { DollarSign, Users } from 'lucide-react';

interface FanSubscriptionSectionProps {
  enabled: boolean;
  priceCents: number;
  gender: 'female' | 'male' | 'other' | null;
  onUpdate: (updates: {
    fan_subscription_enabled?: boolean;
    fan_subscription_price_cents?: number;
    gender?: 'female' | 'male' | 'other';
  }) => void;
}

export function FanSubscriptionSection({ enabled, priceCents, gender, onUpdate }: FanSubscriptionSectionProps) {
  const priceDollars = (priceCents / 100).toFixed(2);

  const handlePriceChange = (value: string) => {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(5, Math.min(100, parsed));
    onUpdate({ fan_subscription_price_cents: Math.round(clamped * 100) });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Fan subscription</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Let fans pay monthly to unlock your private feed. You keep 100% (Pro) or 85% (Free, 15% platform fee).
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => onUpdate({ fan_subscription_enabled: checked })}
          />
        </div>

        {enabled && (
          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground block">Monthly price (USD)</label>
            <div className="relative">
              <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="number"
                min={5}
                max={100}
                step={0.5}
                value={priceDollars}
                onChange={(e) => handlePriceChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Minimum $5, maximum $100. Fans keep access until the end of their paid period if they cancel.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Creator gender</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Used by the Discover carousel filter. Affects where your profile appears to fans.
        </p>
        <div className="flex gap-2">
          {(['female', 'male', 'other'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onUpdate({ gender: option })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                gender === option
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {option === 'female' ? 'Female' : option === 'male' ? 'Male' : 'Other'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `LinkInBioEditor.tsx`**

In [src/pages/LinkInBioEditor.tsx](src/pages/LinkInBioEditor.tsx):

1. Add the import near the other section imports:
   ```tsx
   import { FanSubscriptionSection } from '@/components/linkinbio/sections/FanSubscriptionSection';
   ```
2. Extend the `LinkInBioData` type to include:
   ```ts
   fan_subscription_enabled: boolean;
   fan_subscription_price_cents: number;
   gender: 'female' | 'male' | 'other' | null;
   ```
3. Extend the initial state and defaults:
   ```ts
   fan_subscription_enabled: true,
   fan_subscription_price_cents: 500,
   gender: null,
   ```
4. Add the three new fields to the `.select(...)` calls for both `creator_profiles` and `profiles` reads (lines ~156 and ~185).
5. Include them in `dataToLoad` (line ~215) and in `profilePayload` (line ~294). For the `profiles` fallback save, drop the fan-sub fields (they only live on `creator_profiles`): extend the destructuring on line ~344 with `fan_subscription_enabled: _fse, fan_subscription_price_cents: _fsp, gender: _g,`.
6. Render the section wherever the existing tip settings are shown. Use the same `editorData` / `updateEditorData` callbacks:
   ```tsx
   <FanSubscriptionSection
     enabled={editorData.fan_subscription_enabled}
     priceCents={editorData.fan_subscription_price_cents}
     gender={editorData.gender}
     onUpdate={(updates) => setEditorData((d) => ({ ...d, ...updates }))}
   />
   ```

- [ ] **Step 3: Type-check + manual smoke**

```bash
npm run build
```
Expected: clean build.

Then `npm run dev` → log in as a creator → visit `/app/profile` → toggle the subscription switch, change the price to $7.50, change gender to "Female" → confirm the saving indicator flashes and refreshing the page retains values.

- [ ] **Step 4: Commit**

```bash
git add src/components/linkinbio/sections/FanSubscriptionSection.tsx src/pages/LinkInBioEditor.tsx
git commit -m "feat(profile): fan subscription settings + gender selector"
```

---

### Task 10: ContentLibrary — feed caption + preview marker

**Files:**
- Modify: `src/pages/ContentLibrary.tsx`
- Modify: `src/components/linkinbio/sections/PublicContentSection.tsx`

- [ ] **Step 1: Extend the `LibraryAsset` type**

In [src/pages/ContentLibrary.tsx](src/pages/ContentLibrary.tsx) around line 14, add:
```ts
type LibraryAsset = {
  id: string;
  title: string | null;
  created_at: string;
  storage_path: string;
  mime_type: string | null;
  previewUrl?: string | null;
  is_public: boolean;
  feed_caption: string | null;
  is_feed_preview: boolean;
};
```
Then update the `.select()` calls on line ~73 and ~238 to include `feed_caption, is_feed_preview`.

- [ ] **Step 2: Add caption field to the upload modal**

In the upload form (search for `isPublic` state), add a new state + textarea:
```tsx
const [feedCaption, setFeedCaption] = useState('');
```
Next to the existing "Public" switch, render:
```tsx
{isPublic && (
  <div className="space-y-1">
    <label className="text-xs font-medium text-foreground">Feed caption (optional, 500 chars max)</label>
    <textarea
      value={feedCaption}
      onChange={(e) => setFeedCaption(e.target.value.slice(0, 500))}
      rows={2}
      placeholder="Legend shown above the post in your feed…"
      className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
    />
  </div>
)}
```
Pass it to the `.insert(...)` payload (near line 236):
```ts
feed_caption: feedCaption.trim() || null,
is_feed_preview: false,
```

- [ ] **Step 3: Rich per-asset caption editor in `PublicContentSection.tsx`**

Replace the right-hand Switch block in `SortableItem` (the `{/* Visibility Toggle */}` block around lines 125–143) with a two-row layout:

```tsx
<div className="flex flex-col items-end gap-2 flex-shrink-0">
  <Switch
    checked={content.is_public}
    onCheckedChange={(checked) => onToggle(content.id, checked)}
  />
  {content.is_public && (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
      <input
        type="radio"
        name="feed-preview"
        checked={content.is_feed_preview}
        onChange={() => onSetPreview(content.id)}
        className="accent-primary"
      />
      Free preview
    </label>
  )}
</div>
```

Extend the `SortableItem` props and `PublicContent` type:
```ts
interface PublicContent {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  is_public: boolean;
  is_feed_preview: boolean;
  feed_caption: string | null;
  previewUrl?: string;
}

interface SortableItemProps {
  content: PublicContent;
  onToggle: (id: string, isPublic: boolean) => void;
  onSetPreview: (id: string) => void;
  onCaptionChange: (id: string, caption: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}
```

Under the existing title/info block inside `SortableItem`, add an inline caption editor:
```tsx
{content.is_public && (
  <textarea
    defaultValue={content.feed_caption ?? ''}
    onBlur={(e) => onCaptionChange(content.id, e.target.value)}
    rows={2}
    maxLength={500}
    placeholder="Feed caption…"
    className="w-full resize-none rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground mt-2"
  />
)}
```

- [ ] **Step 4: Add the handlers in `PublicContentSection`**

Below `handleToggleVisibility`:

```ts
const handleSetPreview = async (contentId: string) => {
  setIsUpdating(true);

  // First clear any existing preview on this profile scope.
  const scopeFilter = profileId
    ? { column: 'profile_id' as const, value: profileId }
    : { column: 'creator_id' as const, value: userId! };

  await supabase
    .from('assets')
    .update({ is_feed_preview: false })
    .eq(scopeFilter.column, scopeFilter.value)
    .eq('is_feed_preview', true);

  const { error } = await supabase
    .from('assets')
    .update({ is_feed_preview: true })
    .eq('id', contentId);

  if (error) {
    console.error('Error setting feed preview', error);
    toast.error('Failed to set preview');
  } else {
    toast.success('Set as free preview');
    await fetchContents();
    onContentUpdate?.();
  }
  setIsUpdating(false);
};

const handleCaptionChange = async (contentId: string, caption: string) => {
  const trimmed = caption.trim().slice(0, 500);
  const { error } = await supabase
    .from('assets')
    .update({ feed_caption: trimmed || null })
    .eq('id', contentId);
  if (error) {
    console.error('Error saving caption', error);
    toast.error('Failed to save caption');
  }
};
```

Update the `.select(...)` for `assetsQuery` to include `feed_caption, is_feed_preview` (around line 176).

Pass the new handlers to each `<SortableItem>`:
```tsx
<SortableItem
  key={content.id}
  content={content}
  onToggle={handleToggleVisibility}
  onSetPreview={handleSetPreview}
  onCaptionChange={handleCaptionChange}
  isSelected={selectedIds.includes(content.id)}
  onSelect={handleSelectContent}
/>
```

- [ ] **Step 5: Type-check + manual smoke**

```bash
npm run build
```
Expected: clean build.

Then in dev: upload a new public asset with a caption, mark a different asset as "Free preview", refresh → confirm only one has the radio selected and captions persist.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ContentLibrary.tsx src/components/linkinbio/sections/PublicContentSection.tsx
git commit -m "feat(content): feed caption + free preview flag on assets"
```

---

### Task 11: `useFanSubscription` hook

**Files:**
- Create: `src/hooks/useFanSubscription.ts`

- [ ] **Step 1: Implement the hook**

```ts
// src/hooks/useFanSubscription.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

type State = {
  isSubscribed: boolean;
  fanId: string | null;
  subscriptionId: string | null;
};

/**
 * Returns whether the current authenticated user has an active fan subscription
 * to a given creator_profile_id. Anonymous users always get `isSubscribed=false`.
 */
export function useFanSubscription(creatorProfileId: string | null) {
  const query = useQuery<State>({
    queryKey: ['fan-subscription', creatorProfileId],
    enabled: !!creatorProfileId,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !creatorProfileId) {
        return { isSubscribed: false, fanId: null, subscriptionId: null };
      }

      // Single live row per (fan, creator) — `status IN ('active','cancelled') AND period_end > now()`
      const { data } = await supabase
        .from('fan_creator_subscriptions')
        .select('id, status, period_end')
        .eq('fan_id', user.id)
        .eq('creator_profile_id', creatorProfileId)
        .in('status', ['active', 'cancelled'])
        .gt('period_end', new Date().toISOString())
        .maybeSingle();

      return {
        isSubscribed: !!data,
        fanId: user.id,
        subscriptionId: data?.id ?? null,
      };
    },
    staleTime: 30_000,
  });

  return {
    isSubscribed: query.data?.isSubscribed ?? false,
    fanId: query.data?.fanId ?? null,
    subscriptionId: query.data?.subscriptionId ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useFanSubscription.ts
git commit -m "feat(hooks): useFanSubscription"
```

---

### Task 12: `FeedPost` component

**Files:**
- Create: `src/components/feed/FeedPost.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/feed/FeedPost.tsx
import { Lock, Play, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';

export type FeedPostData =
  | {
      kind: 'asset';
      id: string;
      previewUrl: string | null;
      mimeType: string | null;
      caption: string | null;
      isUnlocked: boolean; // true for the free preview or if viewer is subscribed
    }
  | {
      kind: 'link';
      id: string;
      slug: string;
      title: string;
      description: string | null;
      priceCents: number;
      coverUrl: string | null;
    };

interface FeedPostProps {
  post: FeedPostData;
  gradientStops: [string, string];
  onLockedClick: () => void; // opens subscribe popup
  onLinkClick: (slug: string) => void;
}

export function FeedPost({ post, gradientStops, onLockedClick, onLinkClick }: FeedPostProps) {
  if (post.kind === 'link') {
    return (
      <motion.button
        type="button"
        onClick={() => onLinkClick(post.slug)}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative w-full overflow-hidden rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm text-left"
      >
        <div className="relative aspect-square w-full overflow-hidden">
          {post.coverUrl ? (
            <img src={post.coverUrl} alt="" className="w-full h-full object-cover scale-110 blur-2xl brightness-50" />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Lock className="w-8 h-8 text-white/90" />
            <span className="text-xs font-medium text-white/80 uppercase tracking-wider">Paid content</span>
            <span
              className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-bold text-black"
              style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Unlock ${(post.priceCents / 100).toFixed(2)}
            </span>
          </div>
        </div>
        <div className="p-3">
          <h4 className="text-sm font-semibold text-white truncate">{post.title}</h4>
          {post.description && <p className="text-xs text-white/60 truncate">{post.description}</p>}
        </div>
      </motion.button>
    );
  }

  const isVideo = post.mimeType?.startsWith('video/');
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative w-full overflow-hidden rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm"
    >
      {post.caption && (
        <p className="px-3 pt-3 pb-2 text-sm text-white/90 whitespace-pre-wrap">{post.caption}</p>
      )}
      <div className="relative aspect-square w-full overflow-hidden">
        {post.previewUrl ? (
          isVideo ? (
            <video
              src={post.previewUrl}
              className={`w-full h-full object-cover ${!post.isUnlocked ? 'blur-2xl brightness-50 scale-110' : ''}`}
              muted
              loop
              playsInline
            />
          ) : (
            <img
              src={post.previewUrl}
              alt=""
              className={`w-full h-full object-cover ${!post.isUnlocked ? 'blur-2xl brightness-50 scale-110' : ''}`}
            />
          )
        ) : (
          <div className="w-full h-full bg-white/5 flex items-center justify-center">
            <Lock className="w-6 h-6 text-white/40" />
          </div>
        )}

        {!post.isUnlocked && (
          <button
            type="button"
            onClick={onLockedClick}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30"
          >
            <Lock className="w-8 h-8 text-white/90" />
            <span
              className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-bold text-black"
              style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
            >
              Subscribe to view
            </span>
          </button>
        )}

        {post.isUnlocked && isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm border border-white/20">
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/feed/FeedPost.tsx
git commit -m "feat(feed): FeedPost card component"
```

---

### Task 13: `SubscriptionPopup` component

**Files:**
- Create: `src/components/feed/SubscriptionPopup.tsx`

- [ ] **Step 1: Implement the popup**

```tsx
// src/components/feed/SubscriptionPopup.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface SubscriptionPopupProps {
  open: boolean;
  onClose: () => void;
  creator: {
    profileId: string;
    displayName: string;
    handle: string;
    avatarUrl: string | null;
    priceCents: number;
  };
  gradientStops: [string, string];
}

export function SubscriptionPopup({ open, onClose, creator, gradientStops }: SubscriptionPopupProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate(`/fan/signup?creator=${encodeURIComponent(creator.handle)}&redirect_sub=1`);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-fan-subscription-checkout', {
        body: { creator_profile_id: creator.profileId },
      });

      if (error) {
        toast.error('Unable to start checkout');
        console.error(error);
        return;
      }

      if (data?.alreadySubscribed) {
        toast.success('You already subscribe to this creator');
        onClose();
        return;
      }

      // Build a form and POST to QuickPay (same pattern as other checkouts).
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://quickpay.ugpayments.ch/';
      form.style.display = 'none';

      for (const [name, value] of Object.entries(data.fields as Record<string, string>)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black p-6 text-white"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div
                className="w-20 h-20 rounded-full overflow-hidden border-2 mb-4"
                style={{ borderColor: gradientStops[0] }}
              >
                {creator.avatarUrl ? (
                  <img src={creator.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/10 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-white/60" />
                  </div>
                )}
              </div>

              <h2 className="text-lg font-bold mb-1">Discover all {creator.displayName}'s exclusive contents</h2>
              <p className="text-sm text-white/60 mb-6">@{creator.handle}</p>

              <div className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 mb-6">
                <div className="flex items-baseline justify-center gap-1 mb-1">
                  <span
                    className="text-3xl font-extrabold bg-clip-text text-transparent"
                    style={{ backgroundImage: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
                  >
                    ${(creator.priceCents / 100).toFixed(2)}
                  </span>
                  <span className="text-sm text-white/60">/ month</span>
                </div>
                <p className="text-[11px] text-white/50">Cancel anytime — access stays until the end of the period.</p>
              </div>

              <button
                type="button"
                onClick={handleSubscribe}
                disabled={isSubmitting}
                className="w-full h-12 rounded-full text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 inline-flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Subscribe for ${(creator.priceCents / 100).toFixed(2)}/mo
              </button>

              <p className="text-[11px] text-white/40 mt-3">
                You still need to buy paid links separately. This unlocks the feed.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/feed/SubscriptionPopup.tsx
git commit -m "feat(feed): SubscriptionPopup modal"
```

---

### Task 14: Public profile — transform "Content" tab into vertical feed

**Files:**
- Modify: `src/pages/CreatorPublic.tsx`

- [ ] **Step 1: Load the new data fields + subscription state**

In the main fetch effect (around line 396), change the assets `.select(...)` to include the new columns and the subscription price:

```ts
// Replace the existing assets fetch
let assetsQuery = supabase
  .from('assets')
  .select('id, title, storage_path, mime_type, feed_caption, is_feed_preview')
  .eq('is_public', true)
  .order('is_feed_preview', { ascending: false }) // preview first
  .order('created_at', { ascending: false });
```

Earlier in the same effect, extend the creator profile SELECT (fallback around line 333 and main around line 313 — find by searching for `select('id, display_name,`) to also request `fan_subscription_enabled, fan_subscription_price_cents, gender`.

Add hook-based subscription state near `useState`s:
```tsx
import { useFanSubscription } from '@/hooks/useFanSubscription';
// ...
const { isSubscribed } = useFanSubscription(creatorProfileId);
const [showSubscribePopup, setShowSubscribePopup] = useState(false);
```

- [ ] **Step 2: Build a unified feed-items list**

Add after the existing `publicContent`/`links` state definitions:

```tsx
type FeedItem =
  | { kind: 'asset'; id: string; previewUrl: string | null; mimeType: string | null; caption: string | null; isPreview: boolean; createdAt: string }
  | { kind: 'link'; id: string; slug: string; title: string; description: string | null; priceCents: number; coverUrl: string | null; createdAt: string };
const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
```

After both `links` and `publicContent` finish loading, compute:

```ts
useEffect(() => {
  const assetItems: FeedItem[] = publicContent.map((a: any) => ({
    kind: 'asset',
    id: a.id,
    previewUrl: a.previewUrl ?? null,
    mimeType: a.mime_type ?? null,
    caption: a.feed_caption ?? null,
    isPreview: a.is_feed_preview === true,
    createdAt: a.created_at ?? new Date().toISOString(),
  }));
  const linkItems: FeedItem[] = links.map((l: any) => ({
    kind: 'link',
    id: l.id,
    slug: l.slug,
    title: l.title,
    description: l.description ?? null,
    priceCents: l.price_cents,
    coverUrl: null,                       // cover optional; rely on gradient if absent
    createdAt: l.created_at ?? new Date().toISOString(),
  }));

  // Sort: the single free preview first, then interleave by createdAt desc.
  const preview = assetItems.find((x) => x.isPreview);
  const rest = [...assetItems.filter((x) => !x.isPreview), ...linkItems]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  setFeedItems(preview ? [preview, ...rest] : rest);
}, [publicContent, links]);
```

- [ ] **Step 3: Replace the content tab render with the feed**

Find the two blocks (mobile ~line 1127, desktop ~line 1563) matching:
```tsx
{!isContentLoading && activeTab === 'content' && publicContent.length > 0 && (
  <div className="grid grid-cols-2 gap-3">
    {publicContent.map(...)}
  </div>
)}
{!isContentLoading && activeTab === 'content' && publicContent.length === 0 && (
  <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 text-sm text-white/70 text-center">No public content available yet.</div>
)}
```

Replace **both** occurrences with:

```tsx
{!isContentLoading && activeTab === 'content' && (
  feedItems.length > 0 ? (
    <div className="space-y-4">
      {feedItems.map((item) => (
        <FeedPost
          key={`${item.kind}-${item.id}`}
          post={
            item.kind === 'asset'
              ? {
                  kind: 'asset',
                  id: item.id,
                  previewUrl: item.previewUrl,
                  mimeType: item.mimeType,
                  caption: item.caption,
                  isUnlocked: item.isPreview || isSubscribed,
                }
              : {
                  kind: 'link',
                  id: item.id,
                  slug: item.slug,
                  title: item.title,
                  description: item.description,
                  priceCents: item.priceCents,
                  coverUrl: item.coverUrl,
                }
          }
          gradientStops={gradientStops}
          onLockedClick={() => setShowSubscribePopup(true)}
          onLinkClick={(slug) => navigate(`/l/${slug}`)}
        />
      ))}
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setShowSubscribePopup(true)}
      className="relative w-full aspect-square rounded-2xl overflow-hidden border border-white/20"
    >
      <div
        className="absolute inset-0 scale-110 blur-2xl brightness-50"
        style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
        <Lock className="w-8 h-8" />
        <span className="text-sm font-semibold">Subscribe to unlock the feed</span>
        <span
          className="inline-flex px-4 py-2 rounded-full text-xs font-bold text-black"
          style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
        >
          Discover
        </span>
      </div>
    </button>
  )
)}
```

- [ ] **Step 4: Mount the popup**

At the bottom of the `CreatorPublic` return (near `<GuestChat ... />`), add:
```tsx
<SubscriptionPopup
  open={showSubscribePopup}
  onClose={() => setShowSubscribePopup(false)}
  creator={{
    profileId: creatorProfileId || '',
    displayName: profile?.display_name || profile?.handle || 'creator',
    handle: profile?.handle || '',
    avatarUrl: profile?.avatar_url ?? null,
    priceCents: (profile as any)?.fan_subscription_price_cents ?? 500,
  }}
  gradientStops={gradientStops}
/>
```
And import `FeedPost` / `SubscriptionPopup` / `useFanSubscription` at the top.

- [ ] **Step 5: Ensure the "Content" tab is always shown** (so the popup is reachable even when the creator has no public assets)

Change the tab visibility guard on lines ~1049 and ~1475 from:
```tsx
{publicContent.length > 0 && (
  <button onClick={() => setActiveTab('content')} ...>
```
to always show when `fan_subscription_enabled` is true:
```tsx
{(publicContent.length > 0 || (profile as any)?.fan_subscription_enabled) && (
  <button onClick={() => setActiveTab('content')} ...>
```

- [ ] **Step 6: Manual verification**

```bash
npm run dev
```
- Open `/:testhandle` while logged out → Content tab should show feed with 1 unblurred preview + rest blurred + a blurred "Unlock for $X" card per published link. Click any blurred post → popup opens.
- Log in as a fan without subscription → same behaviour.
- Manually insert an active subscription row in the DB and refresh → assets become unblurred; links stay blurred (paid).

- [ ] **Step 7: Commit**

```bash
git add src/pages/CreatorPublic.tsx
git commit -m "feat(public): replace Content tab with feed + subscribe popup"
```

---

### Task 15: FanDashboard — new "Feed" tab

**Files:**
- Modify: `src/pages/FanDashboard.tsx`

- [ ] **Step 1: Add the tab to `validTabs` and `tabs`**

Around line 121:
```ts
const validTabs = ['favorites', 'feed', 'tips', 'requests', 'messages', 'settings'] as const;
```

Around line 448:
```ts
const tabs = [
  { key: 'favorites' as const, label: 'My Creators', icon: Heart },
  { key: 'feed' as const, label: 'Feed', icon: Compass },
  { key: 'messages' as const, label: 'Messages', icon: MessagesSquare },
  { key: 'tips' as const, label: 'Tips & Gifts', icon: DollarSign },
  { key: 'requests' as const, label: 'Links & Requests', icon: Unlock },
];
```
(`Compass` is already imported.)

In the mobile bottom bar `shortLabel` branch around line 624:
```ts
const shortLabel =
  key === "favorites" ? "Creators" :
  key === "feed" ? "Feed" :
  key === "messages" ? "Chat" :
  key === "tips" ? "Tips" :
  key === "requests" ? "Links" : "";
```

- [ ] **Step 2: Render the tab container**

Below the existing `activeTab === 'messages'` block (around line 1130), before `activeTab === 'requests'`, add:

```tsx
{!isLoading && activeTab === 'feed' && (
  <FanFeedView userId={userId} />
)}
```

And define `FanFeedView` at the bottom of the file (outside `FanDashboard`) as a lightweight stub that we'll flesh out in Task 16:

```tsx
function FanFeedView({ userId }: { userId: string | null }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-center text-muted-foreground">
      <p className="text-sm">Your feed is loading…</p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/FanDashboard.tsx
git commit -m "feat(fan): add Feed tab scaffold"
```

---

### Task 16: In-app feed view — posts from favorites + active subs

**Files:**
- Create: `src/components/feed/FanFeedView.tsx`
- Modify: `src/pages/FanDashboard.tsx` (replace the stub from Task 15)

- [ ] **Step 1: Create `FanFeedView.tsx`**

```tsx
// src/components/feed/FanFeedView.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { getSignedUrl } from '@/lib/storageUtils';
import { FeedPost, type FeedPostData } from '@/components/feed/FeedPost';
import { SubscriptionPopup } from '@/components/feed/SubscriptionPopup';
import { DiscoveryCarousel } from '@/components/feed/DiscoveryCarousel';
import { getAuroraGradient } from '@/lib/auroraGradients';

type CreatorEntry = {
  profileId: string;
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  gradientStops: [string, string];
  priceCents: number;
  isSubscribed: boolean;
};

type AssetRow = {
  id: string;
  profile_id: string | null;
  creator_id: string | null;
  storage_path: string;
  mime_type: string | null;
  feed_caption: string | null;
  is_feed_preview: boolean;
  created_at: string;
};

type LinkRow = {
  id: string;
  profile_id: string | null;
  creator_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  price_cents: number;
  created_at: string;
};

interface CompoundPost {
  creator: CreatorEntry;
  post: FeedPostData;
  createdAt: string;
}

export function FanFeedView({ userId }: { userId: string | null }) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<CompoundPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [popupCreator, setPopupCreator] = useState<CreatorEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) { setIsLoading(false); return; }
      setIsLoading(true);

      // 1) Collect creator profile ids the fan cares about:
      //    a) favorites (fan_favorites.creator_id → profiles.id) — keep it simple: take any active creator_profile for each favorited user
      //    b) active subscriptions (fan_creator_subscriptions)
      const [{ data: favs }, { data: subs }] = await Promise.all([
        supabase.from('fan_favorites').select('creator_id').eq('fan_id', userId),
        supabase.from('fan_creator_subscriptions')
          .select('creator_profile_id')
          .eq('fan_id', userId)
          .in('status', ['active', 'cancelled'])
          .gt('period_end', new Date().toISOString()),
      ]);

      const favUserIds = (favs ?? []).map((f: any) => f.creator_id);
      const subbedProfileIds = new Set((subs ?? []).map((s: any) => s.creator_profile_id));

      // Resolve creator_profiles for favorited users
      const { data: favProfiles } = favUserIds.length
        ? await supabase
            .from('creator_profiles')
            .select('id, user_id, username, display_name, avatar_url, aurora_gradient, fan_subscription_price_cents')
            .in('user_id', favUserIds)
            .eq('is_active', true)
        : { data: [] as any[] };

      const profileIds = new Set<string>([
        ...(favProfiles ?? []).map((p: any) => p.id),
        ...subbedProfileIds,
      ]);

      if (profileIds.size === 0) {
        setPosts([]);
        setIsLoading(false);
        return;
      }

      const profileIdArr = Array.from(profileIds);

      // Bulk-load profile meta for any missing entries
      const { data: allProfiles } = await supabase
        .from('creator_profiles')
        .select('id, user_id, username, display_name, avatar_url, aurora_gradient, fan_subscription_price_cents')
        .in('id', profileIdArr);

      const creatorByProfileId = new Map<string, CreatorEntry>();
      for (const p of allProfiles ?? []) {
        const gradientStops = getAuroraGradient((p as any).aurora_gradient || 'purple_dream').colorStops.slice(0, 2) as [string, string];
        creatorByProfileId.set(p.id, {
          profileId: p.id,
          userId: p.user_id,
          handle: p.username ?? '',
          displayName: p.display_name || p.username || 'creator',
          avatarUrl: p.avatar_url ?? null,
          gradientStops,
          priceCents: (p as any).fan_subscription_price_cents ?? 500,
          isSubscribed: subbedProfileIds.has(p.id),
        });
      }

      // 2) Load posts — public assets + published paid links for all those profiles
      const [{ data: assetRows }, { data: linkRows }] = await Promise.all([
        supabase
          .from('assets')
          .select('id, profile_id, creator_id, storage_path, mime_type, feed_caption, is_feed_preview, created_at')
          .in('profile_id', profileIdArr)
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('links')
          .select('id, profile_id, creator_id, slug, title, description, price_cents, created_at')
          .in('profile_id', profileIdArr)
          .eq('status', 'published')
          .eq('show_on_profile', true)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      // Sign URLs once
      const compound: CompoundPost[] = [];
      for (const a of (assetRows ?? []) as AssetRow[]) {
        const creator = a.profile_id ? creatorByProfileId.get(a.profile_id) : undefined;
        if (!creator) continue;
        const url = await getSignedUrl(a.storage_path);
        compound.push({
          creator,
          createdAt: a.created_at,
          post: {
            kind: 'asset',
            id: a.id,
            previewUrl: url,
            mimeType: a.mime_type,
            caption: a.feed_caption,
            isUnlocked: creator.isSubscribed || a.is_feed_preview,
          },
        });
      }
      for (const l of (linkRows ?? []) as LinkRow[]) {
        const creator = l.profile_id ? creatorByProfileId.get(l.profile_id) : undefined;
        if (!creator) continue;
        compound.push({
          creator,
          createdAt: l.created_at,
          post: {
            kind: 'link',
            id: l.id,
            slug: l.slug,
            title: l.title,
            description: l.description,
            priceCents: l.price_cents,
            coverUrl: null,
          },
        });
      }

      compound.sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));

      if (!cancelled) {
        setPosts(compound);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className="space-y-6 pb-20">
      {isLoading && (
        <div className="text-center text-sm text-muted-foreground py-12">Loading your feed…</div>
      )}

      {!isLoading && posts.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-muted-foreground text-sm">
          <p>You don't follow any creator yet.</p>
          <p className="mt-1">Scroll down to discover creators.</p>
        </div>
      )}

      {!isLoading && posts.map(({ creator, post }) => (
        <div key={`${post.kind}-${post.id}`} className="space-y-2">
          <button
            type="button"
            onClick={() => navigate(`/${creator.handle}`)}
            className="flex items-center gap-2 text-foreground"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden border border-border">
              {creator.avatarUrl ? (
                <img src={creator.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted" />
              )}
            </div>
            <span className="text-sm font-semibold">{creator.displayName}</span>
            <span className="text-xs text-muted-foreground">@{creator.handle}</span>
          </button>
          <FeedPost
            post={post}
            gradientStops={creator.gradientStops}
            onLockedClick={() => setPopupCreator(creator)}
            onLinkClick={(slug) => navigate(`/l/${slug}`)}
          />
        </div>
      ))}

      <DiscoveryCarousel />

      {popupCreator && (
        <SubscriptionPopup
          open={!!popupCreator}
          onClose={() => setPopupCreator(null)}
          creator={{
            profileId: popupCreator.profileId,
            displayName: popupCreator.displayName,
            handle: popupCreator.handle,
            avatarUrl: popupCreator.avatarUrl,
            priceCents: popupCreator.priceCents,
          }}
          gradientStops={popupCreator.gradientStops}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it in `FanDashboard.tsx`**

Delete the `function FanFeedView(...)` stub added in Task 15 and import the real one:
```tsx
import { FanFeedView } from '@/components/feed/FanFeedView';
```

- [ ] **Step 3: Build + manual check**

```bash
npm run build
```
Expected: clean build.

Then `npm run dev` → log in as a fan with at least 1 favorite creator → `/fan?tab=feed` → verify posts appear with author header + blurred overlay if not subscribed.

- [ ] **Step 4: Commit**

```bash
git add src/components/feed/FanFeedView.tsx src/pages/FanDashboard.tsx
git commit -m "feat(fan): in-app feed view from favorites + subs"
```

---

### Task 17: DiscoveryCarousel — Pro-first ranking with gender filter

**Files:**
- Create: `src/components/feed/DiscoveryCarousel.tsx`

- [ ] **Step 1: Implement the carousel**

```tsx
// src/components/feed/DiscoveryCarousel.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

type DiscoverCreator = {
  profileId: string;
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isPremium: boolean;
  gender: 'female' | 'male' | 'other' | null;
};

type GenderFilter = 'female' | 'male' | 'all';

export function DiscoveryCarousel() {
  const navigate = useNavigate();
  const [creators, setCreators] = useState<DiscoverCreator[]>([]);
  const [filter, setFilter] = useState<GenderFilter>('female');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);

      // Join creator_profiles with profiles to know whether the owner is premium (is_creator_subscribed).
      const { data } = await supabase
        .from('creator_profiles')
        .select(`
          id, user_id, username, display_name, avatar_url, gender, is_directory_visible,
          profiles!creator_profiles_user_id_fkey(is_creator_subscribed)
        `)
        .eq('is_active', true)
        .eq('is_directory_visible', true)
        .limit(200);

      const mapped: DiscoverCreator[] = (data ?? [])
        .filter((row: any) => !!row.username)
        .map((row: any) => ({
          profileId: row.id,
          userId: row.user_id,
          handle: row.username,
          displayName: row.display_name || row.username,
          avatarUrl: row.avatar_url,
          isPremium: !!row.profiles?.is_creator_subscribed,
          gender: (row.gender ?? null) as DiscoverCreator['gender'],
        }));

      setCreators(mapped);
      setIsLoading(false);
    })();
  }, []);

  const visible = useMemo(() => {
    const filtered = filter === 'all'
      ? creators
      : creators.filter((c) => c.gender === filter);
    // Premium first, then free. Stable order within groups.
    const premium = filtered.filter((c) => c.isPremium);
    const free = filtered.filter((c) => !c.isPremium);
    return [...premium, ...free];
  }, [creators, filter]);

  return (
    <section className="pt-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-foreground">Recommended creators</h3>
        <div className="flex rounded-full bg-muted p-1 text-[11px] font-medium">
          {(['female', 'male', 'all'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              className={`px-3 py-1 rounded-full transition-colors ${
                filter === opt ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {opt === 'female' ? 'Women' : opt === 'male' ? 'Men' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="text-xs text-muted-foreground text-center py-6">Loading…</div>
      )}

      {!isLoading && visible.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-6">No creators to show right now.</div>
      )}

      {!isLoading && visible.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory">
          {visible.map((c) => (
            <button
              key={c.profileId}
              type="button"
              onClick={() => navigate(`/${c.handle}`)}
              className="shrink-0 w-40 snap-start rounded-2xl border border-border bg-card p-3 flex flex-col items-center gap-3 hover:border-primary/50 transition-colors"
            >
              <div className={`w-24 h-24 rounded-full overflow-hidden border-2 ${c.isPremium ? 'border-primary' : 'border-border'}`}>
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground truncate max-w-[8rem]">@{c.handle}</p>
              </div>
              <span className="w-full text-center rounded-full py-1.5 text-xs font-semibold bg-emerald-500/15 text-emerald-500">
                Discover
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Manual verification**

`npm run dev` → `/fan?tab=feed` → scroll to the bottom → verify the carousel filters change visible creators and that Pro creators appear first (if any exist).

- [ ] **Step 3: Commit**

```bash
git add src/components/feed/DiscoveryCarousel.tsx
git commit -m "feat(fan): DiscoveryCarousel with gender filter"
```

---

### Task 18: Chat → "View feed" CTA

**Files:**
- Modify: `src/components/chat/ChatWindow.tsx`

- [ ] **Step 1: Add the CTA in the chat header**

Find the chat header section (usually near the top of `ChatWindow` render — the block that displays the creator name/avatar). Inject a button that navigates to `/{handle}?tab=content`. Look for the existing creator info display; add next to the avatar/name:

```tsx
{creatorHandle && (
  <button
    type="button"
    onClick={() => navigate(`/${creatorHandle}?tab=content`)}
    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
    aria-label="View creator feed"
  >
    <Compass className="w-3.5 h-3.5" />
    View feed
  </button>
)}
```

Make sure `Compass` is imported from `lucide-react` and that `navigate` (from `useNavigate()`) and `creatorHandle` are available. If `creatorHandle` isn't already a prop, derive it from the conversation's `creator_profile.username` and pass it down from wherever ChatWindow is instantiated (search for `<ChatWindow` in the codebase — both creator and fan sides mount it).

- [ ] **Step 2: Accept deep-link `?tab=content` in `CreatorPublic.tsx`**

Near the `useState<'links' | 'content' | 'wishlist'>('links')` declaration, replace with:

```tsx
const initialTab = (new URLSearchParams(window.location.search).get('tab') === 'content' ? 'content' : 'links') as 'links' | 'content' | 'wishlist';
const [activeTab, setActiveTab] = useState<'links' | 'content' | 'wishlist'>(initialTab);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatWindow.tsx src/pages/CreatorPublic.tsx
git commit -m "feat(chat): View feed CTA in conversation header"
```

---

### Task 19: Fan cancel subscription UI

**Files:**
- Modify: `src/pages/FanDashboard.tsx` (Settings tab)

- [ ] **Step 1: Load active subscriptions for the fan**

In `FanDashboard.tsx`, add state + loader:

```tsx
type FanSubscriptionRow = {
  id: string;
  creator_profile_id: string;
  price_cents: number;
  status: string;
  period_end: string | null;
  cancel_at_period_end: boolean;
  creator_profile: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};
const [fanSubs, setFanSubs] = useState<FanSubscriptionRow[]>([]);
```

In the existing data-loading effect, after loading tips/gifts/etc:
```ts
const { data: subsData } = await supabase
  .from('fan_creator_subscriptions')
  .select(`
    id, creator_profile_id, price_cents, status, period_end, cancel_at_period_end,
    creator_profile:creator_profiles!fan_creator_subscriptions_creator_profile_id_fkey(username, display_name, avatar_url)
  `)
  .eq('fan_id', userId)
  .in('status', ['active', 'cancelled'])
  .gt('period_end', new Date().toISOString());
setFanSubs((subsData as any) ?? []);
```

- [ ] **Step 2: Render the subs list + cancel button**

Inside the `activeTab === 'settings'` render block, add a "Subscriptions" section:

```tsx
<section className="rounded-2xl border border-border bg-card p-5">
  <h3 className="text-sm font-semibold text-foreground mb-3">Your creator subscriptions</h3>
  {fanSubs.length === 0 && (
    <p className="text-xs text-muted-foreground">You don't subscribe to any creator right now.</p>
  )}
  {fanSubs.map((s) => (
    <div key={s.id} className="flex items-center justify-between gap-3 py-3 border-t border-border first:border-t-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-muted">
          {s.creator_profile?.avatar_url && <img src={s.creator_profile.avatar_url} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">@{s.creator_profile?.username}</p>
          <p className="text-[11px] text-muted-foreground">
            ${(s.price_cents / 100).toFixed(2)}/mo
            {s.cancel_at_period_end && s.period_end && (
              <> · ends {new Date(s.period_end).toLocaleDateString()}</>
            )}
          </p>
        </div>
      </div>
      {!s.cancel_at_period_end ? (
        <button
          type="button"
          onClick={() => handleCancelSub(s.id)}
          className="text-xs font-semibold text-red-500 hover:underline"
        >
          Cancel
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">Cancelling</span>
      )}
    </div>
  ))}
</section>
```

Add the handler near the other handlers:
```ts
const handleCancelSub = async (subId: string) => {
  if (!confirm('Cancel this subscription? You keep access until the end of the period.')) return;
  const { data, error } = await supabase.functions.invoke('cancel-fan-subscription', {
    body: { subscription_id: subId },
  });
  if (error || !data?.fields) {
    toast.error('Unable to cancel');
    return;
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = data.action;
  form.style.display = 'none';
  for (const [n, v] of Object.entries(data.fields as Record<string, string>)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = n;
    input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
};
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/FanDashboard.tsx
git commit -m "feat(fan): cancel subscription from settings"
```

---

### Task 20: End-to-end verification + ship

**Files:** none (verification only)

- [ ] **Step 1: Run the full build + typecheck**

```bash
npm run build
```
Expected: clean build (warnings acceptable).

- [ ] **Step 2: Verify env vars + Supabase secrets**

```bash
supabase secrets list | grep QUICKPAY_FAN_SUB_PLAN_ID
```
Expected: the secret exists. If not, stop and coordinate with the plan owner (Thomas) + Derek.

Also add `QUICKPAY_FAN_SUB_PLAN_ID` to Vercel project env for all environments. None of the frontend code reads it directly — the edge functions do — but keeping parity avoids surprises for anyone debugging.

- [ ] **Step 3: Manual UGP sandbox flow (smoke)**

1. Log in as a fan, visit `/<some-creator>` → Content tab → click subscribe popup → complete QuickPay sandbox payment.
2. Verify redirect to `/fan?tab=feed&subscribed=<handle>`.
3. Verify `fan_creator_subscriptions` row is `status='active'` with `period_end ≈ now+30d`.
4. Return to that creator's public profile → assets now unblurred; paid links still locked with "Unlock $X" CTAs.
5. Go to `/fan` → Settings → Cancel → complete QuickPay Cancel form → verify `cancel_at_period_end=true` and settings shows "Cancelling".
6. In DB, force `period_end = now() - interval '1 day'` on that row → reload → access is gone.

- [ ] **Step 4: Self-review the subscriber-read RLS**

Run:
```bash
supabase db execute --linked --sql "EXPLAIN SELECT 1 FROM fan_creator_subscriptions WHERE creator_profile_id = gen_random_uuid();"
```
Expected: query planner uses `idx_fan_subs_creator_profile`.

- [ ] **Step 5: Open PR**

```bash
git push
gh pr create --title "feat: fan→creator subscriptions + public feed (parts 3+4)" --body "$(cat <<'EOF'
## Summary
- New `fan_creator_subscriptions` table with RLS + `has_active_fan_subscription` RPC
- `create-fan-subscription-checkout` + `cancel-fan-subscription` edge functions (UGP variable-price recurring)
- Extends `ugp-confirm` (`fsub_` merchant reference) and `ugp-membership-confirm` (fan plan id routing)
- Public `/:handle` Content tab becomes a vertical feed (1 free preview + subscriber-gated assets + paid link cards)
- `/fan` gains a Feed tab with author-grouped posts and a DiscoveryCarousel (Pro-first, gender filter)
- Creator editor: price + gender settings; ContentLibrary gains caption + free-preview flag

## Test plan
- [ ] Build passes (`npm run build`)
- [ ] Migration 147 applies cleanly (`supabase db reset`)
- [ ] Sandbox UGP subscription flow: subscribe → feed unlocks → cancel → access until period_end
- [ ] Partial-unique preview index rejects a second preview on the same profile
- [ ] Non-subscribed visitor sees 1 unblurred preview + blurred rest
- [ ] Fan with active sub sees unblurred assets; paid links still show "Unlock $X"
EOF
)"
```

- [ ] **Step 6: Commit any final cleanups**

```bash
git status
# if anything left over, commit with "chore: final cleanups for fan subs + feed"
```

---

## Self-Review (run before handing the plan off)

**Spec coverage:**

| Spec item (from Plan amelioration Exclu — §3+§4) | Task |
| --- | --- |
| `creator_fan_subscriptions` table (status, price, period_end, etc.) | Task 3 (`fan_creator_subscriptions`) |
| New edge function `create-fan-subscription-checkout` with UGP recurring variable price | Task 5 |
| Popup "Discover all [name]'s exclusive contents" on public profile | Tasks 13–14 |
| Default $5/mo, editable from `/app/profile` | Task 9 |
| Transform "Content" tab into feed of posts (reuse `assets`) | Task 14 |
| Text message above each post (legend) | Tasks 2 + 10 (`feed_caption`) |
| 1 preview visible to non-subscribers, rest blurred | Tasks 2 + 14 (partial unique index + rendering) |
| Section "Feed" in fan dashboard next to chat | Tasks 15–16 |
| Paid links as blurred posts in feed (double visibility) | Task 14 (mixed with assets) and 16 |
| Clean blurred preview that doesn't leak content | `blur-2xl` on a scaled copy (Tasks 12 + 14) |
| Section Discovery at the bottom of the in-app feed | Task 17 |
| Gender filter, female default | Tasks 1 (column + backfill) + 17 (filter UI) |
| Cancellation: access until period end | Tasks 4 (RPC) + 7 (deactivation handler) + 19 (UI) |
| UGP renewal/failure webhook handling | Task 7 |
| UGP variable-price recurring validated with Derek | Task 5 note (blocking env var) |

**Placeholder scan:** No `TODO`, `TBD`, or "add appropriate error handling" — every step has runnable code or a specific shell command.

**Type consistency:** `has_active_fan_subscription(uuid, uuid)` is referenced in Task 4 (creation), Task 11 falls back to a direct query so it doesn't name-drift; the DB constraints, edge function shapes (`fields`, `subscription_id`), and the `MembershipUsername = sub.id` invariant are consistent across Tasks 5 / 6 / 7 / 8.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-fan-creator-subscriptions-feed.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
