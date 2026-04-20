# Payment Routing & Subscriptions Refonte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reliable end-to-end payment pipeline on Exclu — country-based 2D/3D routing (US/CA → 2D, rest → 3D), full creator & fan subscription refactor driven by `/recurringtransactions` (no more fake wallet debits), pricing refonte (Free 15% / Pro 0%), and a Pro upgrade popup once per week.

**Architecture:** Keep QuickPay for checkout (no PCI scope change), route to one of two MIDs based on fan billing country. Rebill subscriptions from our server via UG's Direct Rebilling API, so we fully control amount + cadence and can recharge any legit card without asking fans to re-enter it. Every wallet credit is strictly gated on a `state=Sale` (initial) or `state=Recurring` (rebill) ConfirmURL callback from UG — no more "verify = sale" pollution.

**Tech Stack:** React 18 + TypeScript + Vite (frontend), Tailwind + shadcn/ui, Supabase (Postgres + Edge Functions in Deno), Vercel serverless + cron, UG Payments (QuickPay hosted for checkout, Direct Rebilling API for recurring), Brevo (emails).

---

## Pending External Dependencies

5 questions are out to Derek. The plan's **default assumptions** are documented here; tasks blocked on a specific answer are marked `⚠️ PENDING DEREK Q<n>`.

| Q | Topic | Default assumption | Impact if wrong |
|---|---|---|---|
| D1 | `/recurringtransactions` on QuickPay-originated TIDs | ✅ works — we can migrate existing `plan 11027` subs by reusing their original Sale TID | If not: Phase 4 migration step (Task 4.10) pivots to "force re-subscribe" UX |
| D2 | 2D US/CA MID returns its own QuickPayToken + OAuth Bearer + SiteID | ✅ assumed yes — plan stores per-MID env vars | If it's same creds with different MID routing: env var collapse, routing logic simplifies |
| D3 | Card-expired `reasonCode` on `/recurringtransactions` | ✅ assumed detectable from `reasonCode` or `message` — we match substrings `expired`, `declined`, `lost`, `invalid card` | If not: all rebill failures collapse to generic retry; no "ask user to update card" UX |
| D4 | TID portability across MIDs | ✅ assumed NO — rebills must hit the same MID as the initial Sale. Plan stores `ugp_mid` per subscription | If portable: we can consolidate to one MID for rebills — simplification |
| D5 | `/recurringtransactions` limits (min/max amount, max interval) | ✅ assumed: min $1, max $10000, no interval limit (we'll rebill annual 365 days later) | If limits exist: Annual plan may need splitting into 12×$20 rebills or similar |

---

## File Structure

### New files

**Database migrations:**
- `supabase/migrations/150_country_and_mid_routing.sql` — adds `profiles.country`, `profiles.billing_country`, `purchases.ugp_mid`, `tips.ugp_mid`, `gift_purchases.ugp_mid`, `custom_requests.ugp_mid`
- `supabase/migrations/151_creator_subscription_refactor.sql` — new columns `subscription_plan`, `subscription_ugp_transaction_id`, `subscription_mid`, `subscription_amount_cents`, `subscription_period_start`, `subscription_period_end`, `subscription_cancel_at_period_end`, `subscription_last_pro_popup_at`, `subscription_suspended_at`; drop `subscription_ugp_member_id` usage (keep column for history)
- `supabase/migrations/152_fan_subscription_refactor.sql` — adds `ugp_transaction_id`, `ugp_mid`, `next_rebill_at`, `suspended_at` to `fan_creator_subscriptions`; removes dependency on `QUICKPAY_FAN_SUB_PLAN_ID`
- `supabase/migrations/153_rebill_attempts.sql` — retry tracking table
- `supabase/migrations/154_pricing_commission_rates.sql` — updates existing succeeded rows' fee breakdown is out of scope; new txs pick up new rates via code

**Shared helpers:**
- `src/lib/countryRouting.ts` — `isUS2DCountry(iso2) → boolean`, `routeMidForCountry(iso2) → 'us_2d' | 'intl_3d'`
- `src/lib/countryList.ts` — ISO-3166 country list with names, with US/CA/AU/UK/FR/DE/ES/IT/CH/NL pinned to top
- `supabase/functions/_shared/ugRouting.ts` — Deno equivalent of `countryRouting.ts` + credential resolver (`getMidCredentials(mid)`)
- `supabase/functions/_shared/ugRebill.ts` — `rebillTransaction(mid, tid, amountCents, tracking)` wrapper around `/recurringtransactions`

**UI components:**
- `src/components/checkout/CountrySelect.tsx` — searchable country dropdown with pinned top list
- `src/components/checkout/PreCheckoutGate.tsx` — extracts the +18 + Terms + Country inline form from `PublicLink.tsx` into a reusable component used across link/tip/gift/request checkouts
- `src/components/ProUpgradePopup.tsx` — weekly nudge popup for Free creators
- `src/components/pricing/PlanCard.tsx` — reusable card for a plan (Free / Monthly / Annual)
- `src/components/settings/PlanManagement.tsx` — UI in Settings showing current plan + upgrade/downgrade

**Pages:**
- `src/pages/FanSubscriptions.tsx` — `/fan/subscriptions` page listing active fan→creator subscriptions
- *(Pricing page already exists; we refactor)*

**Edge Functions:**
- `supabase/functions/rebill-subscriptions/index.ts` — cron-called entry point
- `supabase/functions/rebill-subscriptions/config.toml` — `verify_jwt = false`

**Vercel cron:**
- `api/cron/rebill-subscriptions.ts` — triggers the edge function daily

### Modified files

- `src/pages/PublicLink.tsx` — extract checkout gate, add country dropdown
- `src/pages/LinkDetail.tsx` *(already fixed Buyers list in earlier commit)*
- `src/pages/Auth.tsx` or `src/pages/fan/FanSignup.tsx` — add optional country to onboarding
- `src/pages/Pricing.tsx` — new 3-plan layout
- `src/pages/CreateProfile.tsx` — plan selector + dynamic pricing
- `src/pages/Profile.tsx` (settings section) — new PlanManagement component
- `src/pages/Terms.tsx` — updated commission text + bank fee mention
- `src/components/AppShell.tsx` — mount ProUpgradePopup globally for signed-in Free creators
- `src/lib/payment-config.ts` — new constants for pricing refonte, remove legacy plan-related constants after cleanup
- `supabase/functions/create-link-checkout/index.ts` — new commission rates + MID routing + store `ugp_mid`
- `supabase/functions/create-tip-checkout/index.ts` — same
- `supabase/functions/create-gift-checkout/index.ts` — same
- `supabase/functions/create-request-checkout/index.ts` — same
- `supabase/functions/create-creator-subscription/index.ts` — refactor from plan 11027 to one-shot Sale
- `supabase/functions/create-fan-subscription-checkout/index.ts` — refactor from fan plan to one-shot Sale
- `supabase/functions/ugp-confirm/index.ts` — handle new flows (`sub_`, `fsub_` via Sale; `rebill_` trigger)
- `supabase/functions/ugp-membership-confirm/index.ts` — deprecate `chargeProfileAddons`, return early for creator Pro (new flow doesn't use Member Postbacks); keep for legacy subs still on plan 11027 until drained
- `supabase/functions/cancel-creator-subscription/index.ts` — flip to `cancel_at_period_end=true` model
- `supabase/functions/cancel-fan-subscription/index.ts` — same
- `vercel.json` — add `/fan/subscriptions` rewrite + new cron
- `src/App.tsx` — new `/fan/subscriptions` route

---

## Phase 0 — Schema & Shared Infrastructure (1 day)

### Task 0.1 — Migration 150: country + MID columns

**Files:**
- Create: `supabase/migrations/150_country_and_mid_routing.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 150_country_and_mid_routing.sql
-- Adds country tracking on profiles (for routing + compliance) and the MID
-- used for each captured sale (so rebills can target the same MID).

alter table profiles
  add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$'),
  add column if not exists billing_country text check (billing_country is null or billing_country ~ '^[A-Z]{2}$');

alter table purchases
  add column if not exists ugp_mid text;
alter table tips
  add column if not exists ugp_mid text;
alter table gift_purchases
  add column if not exists ugp_mid text;
alter table custom_requests
  add column if not exists ugp_mid text;

-- Indexes only where we filter/aggregate on country
create index if not exists profiles_country_idx on profiles(country) where country is not null;
```

- [ ] **Step 2: Apply locally, verify**

```bash
supabase db reset  # fresh local DB applies all migrations
supabase db remote show schema-only | grep -E "country|ugp_mid"
```

Expected: `country`, `billing_country`, `ugp_mid` columns exist.

- [ ] **Step 3: Push to prod**

```bash
supabase db push --linked
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/150_country_and_mid_routing.sql
git commit -m "feat(db): add country + ugp_mid columns for payment routing"
```

---

### Task 0.2 — Migration 151: creator subscription refactor columns

**Files:**
- Create: `supabase/migrations/151_creator_subscription_refactor.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 151_creator_subscription_refactor.sql
-- Schema for the new creator subscription flow:
--   - One-shot Sale at checkout, original ugp_transaction_id stored on the profile
--   - Server-driven monthly rebills via /recurringtransactions
--   - Amount recomputed each cycle from current profile count (Monthly plan)
--   - Annual plan = fixed 239.99 for 365 days, unlimited profiles (soft cap 50)

do $$ begin
  create type subscription_plan_type as enum ('free', 'monthly', 'annual');
exception when duplicate_object then null; end $$;

alter table profiles
  add column if not exists subscription_plan subscription_plan_type not null default 'free',
  add column if not exists subscription_ugp_transaction_id text,
  add column if not exists subscription_mid text,
  add column if not exists subscription_amount_cents int,
  add column if not exists subscription_currency text default 'USD',
  add column if not exists subscription_period_start timestamptz,
  add column if not exists subscription_period_end timestamptz,
  add column if not exists subscription_cancel_at_period_end boolean not null default false,
  add column if not exists subscription_suspended_at timestamptz,
  add column if not exists subscription_last_pro_popup_at timestamptz;

-- Backfill: any profile currently is_creator_subscribed=true is on the legacy plan
update profiles
  set subscription_plan = 'monthly'
  where is_creator_subscribed = true and subscription_plan = 'free';

create index if not exists profiles_subscription_period_end_idx
  on profiles(subscription_period_end)
  where subscription_plan in ('monthly', 'annual') and subscription_suspended_at is null;
```

- [ ] **Step 2: Apply locally + run prod-safe backfill check**

```bash
supabase db reset
```

Then with SUPABASE_SERVICE_ROLE_KEY set:
```bash
deno eval 'import { createClient } from "npm:@supabase/supabase-js@2"; const sb = createClient("https://qexnwezetjlbwltyccks.supabase.co", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")); const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_plan", "monthly"); console.log("monthly count:", count);'
```
Expected: matches `count(*) where is_creator_subscribed = true`.

- [ ] **Step 3: Push + commit**

```bash
supabase db push --linked
git add supabase/migrations/151_creator_subscription_refactor.sql
git commit -m "feat(db): creator subscription refactor schema"
```

---

### Task 0.3 — Migration 152: fan subscription refactor columns

**Files:**
- Create: `supabase/migrations/152_fan_subscription_refactor.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 152_fan_subscription_refactor.sql
-- fan_creator_subscriptions was designed for QuickPay plans with a fixed
-- QUICKPAY_FAN_SUB_PLAN_ID (which was never provisioned). Refactor to the
-- same one-shot-Sale + /recurringtransactions model as creator Pro.

alter table fan_creator_subscriptions
  add column if not exists ugp_mid text,
  add column if not exists next_rebill_at timestamptz,
  add column if not exists suspended_at timestamptz;

-- ugp_transaction_id already exists on this table (added in 147_fan_creator_subscriptions.sql)
-- price_cents already exists and is locked at subscribe time (grandfathered semantics)

-- Backfill next_rebill_at from period_end for any currently active rows
update fan_creator_subscriptions
  set next_rebill_at = period_end
  where status = 'active' and next_rebill_at is null;

create index if not exists fan_subs_next_rebill_idx
  on fan_creator_subscriptions(next_rebill_at)
  where status = 'active' and suspended_at is null and cancel_at_period_end = false;
```

- [ ] **Step 2: Apply + push + commit**

```bash
supabase db reset
supabase db push --linked
git add supabase/migrations/152_fan_subscription_refactor.sql
git commit -m "feat(db): fan subscription refactor schema"
```

---

### Task 0.4 — Migration 153: rebill_attempts retry tracking

**Files:**
- Create: `supabase/migrations/153_rebill_attempts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 153_rebill_attempts.sql
-- Tracks every /recurringtransactions call with outcome for monitoring,
-- retry decisions, and reconciliation.

create table if not exists rebill_attempts (
  id uuid primary key default gen_random_uuid(),
  subject_table text not null check (subject_table in ('profiles', 'fan_creator_subscriptions')),
  subject_id uuid not null,
  ugp_mid text not null,
  reference_transaction_id text not null,
  amount_cents int not null,
  currency text not null default 'USD',
  attempt_number int not null default 1,
  status text not null check (status in ('pending', 'success', 'declined', 'card_expired', 'error')),
  ugp_response jsonb,
  ugp_transaction_id text,
  reason_code text,
  message text,
  created_at timestamptz not null default now()
);

create index rebill_attempts_subject_idx on rebill_attempts(subject_table, subject_id, created_at desc);
create index rebill_attempts_status_idx on rebill_attempts(status, created_at desc);
```

- [ ] **Step 2: Apply + push + commit**

```bash
supabase db reset
supabase db push --linked
git add supabase/migrations/153_rebill_attempts.sql
git commit -m "feat(db): rebill_attempts table"
```

---

### Task 0.5 — Shared country helpers (frontend)

**Files:**
- Create: `src/lib/countryList.ts`
- Create: `src/lib/countryRouting.ts`

- [ ] **Step 1: Write the country list**

```ts
// src/lib/countryList.ts
export type Country = { code: string; name: string };

export const PINNED_COUNTRIES: Country[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'CH', name: 'Switzerland' },
];

export const ALL_COUNTRIES: Country[] = [
  // Full ISO-3166-1 alpha-2 list — ~250 entries. Generate once via
  //   `node -e "console.log(JSON.stringify(require('i18n-iso-countries').getNames('en'), null, 2))"`
  // and inline. (Do not ship a runtime dependency on i18n-iso-countries.)
  // Omitted here for brevity — TASK owner must paste the full list.
  // Sample starter:
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  // ... complete list required
];

export function searchCountries(query: string): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...PINNED_COUNTRIES, ...ALL_COUNTRIES.filter(c => !PINNED_COUNTRIES.find(p => p.code === c.code))];
  return ALL_COUNTRIES.filter(c =>
    c.name.toLowerCase().startsWith(q) || c.code.toLowerCase() === q
  );
}
```

- [ ] **Step 2: Write the routing helper**

```ts
// src/lib/countryRouting.ts
import { PAYMENT_CONFIG } from './payment-config';

export type UgMidKey = 'us_2d' | 'intl_3d';

const US_2D_COUNTRIES: ReadonlySet<string> = new Set(['US', 'CA']);

/** Returns the MID key to use for this country. Falls back to 3D if unknown. */
export function routeMidForCountry(countryCode: string | null | undefined): UgMidKey {
  if (countryCode && US_2D_COUNTRIES.has(countryCode.toUpperCase())) {
    return 'us_2d';
  }
  return 'intl_3d';
}

export function midKeyToLabel(key: UgMidKey): string {
  return key === 'us_2d' ? 'US/CA 2D' : 'International 3DS';
}
```

- [ ] **Step 3: Unit tests**

Create `src/lib/countryRouting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { routeMidForCountry } from './countryRouting';

describe('routeMidForCountry', () => {
  it('routes US to 2D', () => expect(routeMidForCountry('US')).toBe('us_2d'));
  it('routes CA to 2D', () => expect(routeMidForCountry('CA')).toBe('us_2d'));
  it('routes FR to 3D', () => expect(routeMidForCountry('FR')).toBe('intl_3d'));
  it('routes unknown to 3D', () => expect(routeMidForCountry(null)).toBe('intl_3d'));
  it('is case-insensitive', () => expect(routeMidForCountry('us')).toBe('us_2d'));
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/lib/countryRouting.test.ts
```
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/country*.ts
git commit -m "feat(routing): country list + MID routing helpers"
```

---

### Task 0.6 — Shared UG routing + rebill helpers (edge functions)

**Files:**
- Create: `supabase/functions/_shared/ugRouting.ts`
- Create: `supabase/functions/_shared/ugRebill.ts`

- [ ] **Step 1: Write `ugRouting.ts`**

```ts
// supabase/functions/_shared/ugRouting.ts
//
// Resolves the per-MID credentials and endpoints for UG payments.
// Env vars expected (both MUST be set for prod):
//   QUICKPAY_TOKEN_INTL_3D        / QUICKPAY_SITE_ID_INTL_3D        / UGP_MID_INTL_3D        / UGP_API_BEARER_TOKEN_INTL_3D
//   QUICKPAY_TOKEN_US_2D          / QUICKPAY_SITE_ID_US_2D          / UGP_MID_US_2D          / UGP_API_BEARER_TOKEN_US_2D
// ⚠️ PENDING DEREK Q2: confirm separate creds per MID. If shared, collapse to one set.

const US_2D_COUNTRIES = new Set(['US', 'CA']);

export type UgMidKey = 'us_2d' | 'intl_3d';

export interface UgMidCredentials {
  key: UgMidKey;
  quickPayToken: string;
  siteId: string;
  merchantId: string;
  oauthBearer: string;
}

export function routeMidForCountry(country: string | null | undefined): UgMidKey {
  if (country && US_2D_COUNTRIES.has(country.toUpperCase())) return 'us_2d';
  return 'intl_3d';
}

export function getMidCredentials(key: UgMidKey): UgMidCredentials {
  const prefix = key === 'us_2d' ? 'US_2D' : 'INTL_3D';
  const creds = {
    key,
    quickPayToken: Deno.env.get(`QUICKPAY_TOKEN_${prefix}`) ?? '',
    siteId: Deno.env.get(`QUICKPAY_SITE_ID_${prefix}`) ?? '',
    merchantId: Deno.env.get(`UGP_MID_${prefix}`) ?? '',
    oauthBearer: Deno.env.get(`UGP_API_BEARER_TOKEN_${prefix}`) ?? '',
  };
  if (!creds.quickPayToken || !creds.siteId || !creds.merchantId) {
    throw new Error(`Missing UG credentials for MID ${key}`);
  }
  return creds;
}
```

- [ ] **Step 2: Write `ugRebill.ts`**

```ts
// supabase/functions/_shared/ugRebill.ts
import type { UgMidCredentials } from './ugRouting.ts';

export interface RebillResult {
  success: boolean;
  transactionId: string | null;
  reasonCode: string | null;
  message: string | null;
  classification: 'success' | 'declined' | 'card_expired' | 'error';
  raw: unknown;
}

const CARD_EXPIRED_MARKERS = ['expired', 'invalid expiry', 'expired card'];
const CARD_DEAD_MARKERS = ['lost', 'stolen', 'pick up card', 'retain', 'invalid card number'];

export async function rebillTransaction(
  creds: UgMidCredentials,
  referenceTransactionId: string,
  amountCents: number,
  trackingId: string,
): Promise<RebillResult> {
  const url = `https://api.ugpayments.ch/merchants/${creds.merchantId}/recurringtransactions`;
  const body = {
    TransactionID: referenceTransactionId,
    Amount: (amountCents / 100).toFixed(2),
    Currency: 'USD',
    trackingId,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.oauthBearer}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      success: false,
      transactionId: null,
      reasonCode: null,
      message: (e as Error).message,
      classification: 'error',
      raw: null,
    };
  }

  const raw = await res.json().catch(() => null);
  const status = String(raw?.status ?? '').toLowerCase();
  const reasonCode = raw?.reasoncode ? String(raw.reasoncode) : raw?.reasonCode ? String(raw.reasonCode) : null;
  const message = raw?.message ? String(raw.message) : null;
  const tid = raw?.id ? String(raw.id) : null;

  if (status === 'successful' || status === 'approved') {
    return { success: true, transactionId: tid, reasonCode, message, classification: 'success', raw };
  }

  const lower = (message || '').toLowerCase();
  // ⚠️ PENDING DEREK Q3: confirm the exact reasonCode for card-expired. Fallback to substring match for now.
  const expired = CARD_EXPIRED_MARKERS.some((m) => lower.includes(m));
  const dead = CARD_DEAD_MARKERS.some((m) => lower.includes(m));
  if (expired || dead) {
    return { success: false, transactionId: tid, reasonCode, message, classification: 'card_expired', raw };
  }
  if (status === 'declined' || status === 'scrubbed' || status === 'fraud') {
    return { success: false, transactionId: tid, reasonCode, message, classification: 'declined', raw };
  }
  return { success: false, transactionId: tid, reasonCode, message, classification: 'error', raw };
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/ugRouting.ts supabase/functions/_shared/ugRebill.ts
git commit -m "feat(payments): shared UG routing + rebill helpers"
```

---

### Task 0.7 — Env vars provisioning

- [ ] **Step 1: Document required env vars in `CLAUDE.md`**

Append to the "Base de données (Supabase)" or a new "Payments — MID Credentials" section:

```md
### UG Payments — Per-MID credentials

Both MIDs MUST have the following secrets set on Supabase and Vercel:

- `QUICKPAY_TOKEN_INTL_3D` / `QUICKPAY_SITE_ID_INTL_3D` / `UGP_MID_INTL_3D` / `UGP_API_BEARER_TOKEN_INTL_3D` — existing MID 103799 (3DS)
- `QUICKPAY_TOKEN_US_2D` / `QUICKPAY_SITE_ID_US_2D` / `UGP_MID_US_2D` / `UGP_API_BEARER_TOKEN_US_2D` — new MID for US/CA (2D)

Legacy aliases kept during rollout: `QUICKPAY_TOKEN`, `QUICKPAY_SITE_ID`, `UGP_MERCHANT_ID`, `UGP_API_BEARER_TOKEN` — all point at the INTL_3D MID.
```

- [ ] **Step 2: Set the INTL_3D secrets (aliased from existing)**

```bash
supabase secrets set --linked \
  QUICKPAY_TOKEN_INTL_3D="$(supabase secrets list --linked | awk '/QUICKPAY_TOKEN /{print $3}')"
# Repeat for the 3 other INTL_3D vars by copying the existing values via the Supabase dashboard
# (the CLI only prints digests — use the dashboard Secrets panel for the actual values).
```

⚠️ PENDING DEREK Q2: US_2D secrets set once Derek provides them.

- [ ] **Step 3: Mirror in Vercel env vars**

```bash
vercel env add QUICKPAY_TOKEN_INTL_3D production preview development
# ... etc for every new var
```

- [ ] **Step 4: Commit the CLAUDE.md change**

```bash
git add CLAUDE.md
git commit -m "docs: document per-MID payment credentials"
```

---

## Phase 1 — Country Detection & Pre-Checkout UX (1.5 days)

### Task 1.1 — IP geolocation helper (frontend)

**Files:**
- Create: `src/lib/ipGeo.ts`
- Create: `api/ipgeo.ts`

Vercel exposes `x-vercel-ip-country` on request headers to serverless functions. Frontend calls our small `/api/ipgeo` to read it.

- [ ] **Step 1: Write the Vercel function**

```ts
// api/ipgeo.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const country = (req.headers['x-vercel-ip-country'] as string) || null;
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({ country });
}
```

- [ ] **Step 2: Add rewrite in `vercel.json`** (none needed — `/api/*` passes through already)

Verify by running `curl -I https://exclu.at/api/ipgeo` (after deploy).

- [ ] **Step 3: Write the client helper**

```ts
// src/lib/ipGeo.ts
let cache: string | null | undefined = undefined;

export async function getGeoCountry(): Promise<string | null> {
  if (cache !== undefined) return cache;
  try {
    const res = await fetch('/api/ipgeo', { headers: { accept: 'application/json' } });
    const data = await res.json();
    cache = (data?.country as string | null) ?? null;
  } catch {
    cache = null;
  }
  return cache;
}
```

- [ ] **Step 4: Commit**

```bash
git add api/ipgeo.ts src/lib/ipGeo.ts
git commit -m "feat(geo): IP-based country detection helper"
```

---

### Task 1.2 — CountrySelect component

**Files:**
- Create: `src/components/checkout/CountrySelect.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/checkout/CountrySelect.tsx
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PINNED_COUNTRIES, ALL_COUNTRIES, searchCountries, type Country } from '@/lib/countryList';

interface Props {
  value: string | null;
  onChange: (code: string) => void;
  autoDetectedCountry?: string | null;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

export function CountrySelect({ value, onChange, autoDetectedCountry, placeholder = 'Select country…', required, id }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchCountries(query), [query]);

  const selectedName = useMemo(() => {
    if (!value) return null;
    return ALL_COUNTRIES.find(c => c.code === value)?.name ?? value;
  }, [value]);

  // Auto-preselect from IP geo on first render
  useEffect(() => {
    if (!value && autoDetectedCountry) {
      onChange(autoDetectedCountry);
    }
  }, [value, autoDetectedCountry, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          {selectedName || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type to search…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            {!query && (
              <CommandGroup heading="Common">
                {PINNED_COUNTRIES.map(c => (
                  <CountryRow key={c.code} country={c} selected={value === c.code} onSelect={(code) => { onChange(code); setOpen(false); }} />
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={query ? 'Results' : 'All'}>
              {results
                .filter(c => query || !PINNED_COUNTRIES.find(p => p.code === c.code))
                .map(c => (
                  <CountryRow key={c.code} country={c} selected={value === c.code} onSelect={(code) => { onChange(code); setOpen(false); }} />
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CountryRow({ country, selected, onSelect }: { country: Country; selected: boolean; onSelect: (code: string) => void }) {
  return (
    <CommandItem value={country.code} onSelect={() => onSelect(country.code)}>
      <Check className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
      <span className="flex-1">{country.name}</span>
      <span className="text-xs text-muted-foreground">{country.code}</span>
    </CommandItem>
  );
}
```

- [ ] **Step 2: Quick smoke render test**

Add a simple test in `src/components/checkout/CountrySelect.test.tsx` that imports and renders (RTL):

```tsx
import { render, screen } from '@testing-library/react';
import { CountrySelect } from './CountrySelect';

test('renders placeholder when no value', () => {
  render(<CountrySelect value={null} onChange={() => {}} placeholder="Your country" />);
  expect(screen.getByRole('combobox')).toHaveTextContent('Your country');
});
```

```bash
npm run test -- CountrySelect.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/checkout/CountrySelect.tsx src/components/checkout/CountrySelect.test.tsx
git commit -m "feat(checkout): searchable CountrySelect component"
```

---

### Task 1.3 — Extract PreCheckoutGate from PublicLink

**Files:**
- Create: `src/components/checkout/PreCheckoutGate.tsx`
- Modify: `src/pages/PublicLink.tsx`

Currently PublicLink.tsx renders the +18 + Terms checkbox + email input inline. We extract a reusable gate that wraps those + the new country field.

- [ ] **Step 1: Write the component**

```tsx
// src/components/checkout/PreCheckoutGate.tsx
import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CountrySelect } from './CountrySelect';
import { getGeoCountry } from '@/lib/ipGeo';

export interface PreCheckoutGateState {
  email: string;
  country: string | null;
  ageAccepted: boolean;
}

interface Props {
  value: PreCheckoutGateState;
  onChange: (next: PreCheckoutGateState) => void;
  emailLocked?: boolean;
  requireEmail?: boolean;
  countryHiddenIfSignedIn?: boolean;
  signedInCountry?: string | null;
}

export function PreCheckoutGate({ value, onChange, emailLocked, requireEmail, countryHiddenIfSignedIn, signedInCountry }: Props) {
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => {
    if (!value.country && !signedInCountry) {
      getGeoCountry().then((c) => { if (c) setDetected(c); });
    }
  }, [value.country, signedInCountry]);

  const shouldShowCountry = !(countryHiddenIfSignedIn && signedInCountry);
  const currentCountry = value.country ?? signedInCountry ?? null;

  return (
    <div className="space-y-3">
      {!emailLocked && (
        <div>
          <label htmlFor="pre-checkout-email" className="text-[11px] uppercase tracking-[0.22em] text-exclu-space/70 block mb-1.5">
            Email {requireEmail ? <span className="text-red-400">*</span> : null}
          </label>
          <Input
            id="pre-checkout-email"
            type="email"
            required={requireEmail}
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
            placeholder="you@email.com"
          />
        </div>
      )}

      {shouldShowCountry && (
        <div>
          <label htmlFor="pre-checkout-country" className="text-[11px] uppercase tracking-[0.22em] text-exclu-space/70 block mb-1.5">
            Country <span className="text-red-400">*</span>
          </label>
          <CountrySelect
            id="pre-checkout-country"
            value={currentCountry}
            autoDetectedCountry={detected}
            onChange={(code) => onChange({ ...value, country: code })}
            required
            placeholder="Select your country"
          />
          <p className="text-[11px] text-exclu-space/60 mt-1">
            We use this to route your payment through the right network for your bank.
          </p>
        </div>
      )}

      <label className="flex items-start gap-2.5 cursor-pointer group">
        <Checkbox
          checked={value.ageAccepted}
          onCheckedChange={(v) => onChange({ ...value, ageAccepted: v === true })}
        />
        <span className="text-[11px] text-white/60 leading-relaxed group-hover:text-white/80 transition-colors">
          I confirm that I am at least <strong className="text-white">18 years old</strong> and agree to the{' '}
          <a href="/terms" target="_blank" className="text-primary hover:underline">Terms</a> and{' '}
          <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>.
        </span>
      </label>
    </div>
  );
}

/** Convenience — is the gate complete enough to submit the checkout form? */
export function isPreCheckoutReady(state: PreCheckoutGateState, requireEmail = true): boolean {
  if (!state.ageAccepted) return false;
  if (!state.country) return false;
  if (requireEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) return false;
  return true;
}
```

- [ ] **Step 2: Swap into PublicLink.tsx**

Open `src/pages/PublicLink.tsx`. Locate the existing +18 checkbox block (around line 1000) and the email input block (around line 1040). Replace both with a single `<PreCheckoutGate>` instance whose state is lifted into the component. The submit button is enabled only when `isPreCheckoutReady` returns true.

Example snippet for the submit handler:

```tsx
const [gate, setGate] = useState<PreCheckoutGateState>({ email: '', country: null, ageAccepted: false });

// On mount, if signed in, preload email + country from profile
useEffect(() => {
  supabase.auth.getUser().then(async ({ data }) => {
    if (!data?.user) return;
    setGate(g => ({ ...g, email: data.user.email ?? g.email }));
    const { data: profile } = await supabase.from('profiles').select('country').eq('id', data.user.id).maybeSingle();
    if (profile?.country) setGate(g => ({ ...g, country: profile.country }));
  });
}, []);

// Send gate.country to the checkout edge function:
await supabase.functions.invoke('create-link-checkout', {
  body: { slug, buyerEmail: gate.email || null, country: gate.country, /* ... */ },
});
```

- [ ] **Step 3: Verify in browser**

```bash
npm run dev
```

Open `http://localhost:8080/l/<some-link-slug>`. Confirm:
- Country dropdown appears, pre-filled from IP
- Checkbox still present and required
- Submit blocked until all 3 gate conditions pass

- [ ] **Step 4: Commit**

```bash
git add src/components/checkout/PreCheckoutGate.tsx src/pages/PublicLink.tsx
git commit -m "feat(checkout): PreCheckoutGate with country selector"
```

---

### Task 1.4 — Add country to fan onboarding (optional step)

**Files:**
- Modify: `src/pages/FanSignup.tsx` (or wherever fan signup lives — check `src/pages/FanDashboard.tsx` for onboarding flow)

- [ ] **Step 1: Identify the fan signup component**

```bash
grep -rn "fan_signup\|fan/signup\|FanSignup\|fan onboarding" src/ | head
```

- [ ] **Step 2: Add country field after avatar upload, marked optional**

```tsx
<div>
  <label className="text-[11px] uppercase tracking-[0.22em] text-exclu-space/70 block mb-1.5">
    Country <span className="text-xs normal-case text-exclu-space/50">(optional, helps us process your payments)</span>
  </label>
  <CountrySelect value={country} onChange={setCountry} autoDetectedCountry={detectedCountry} placeholder="Skip or pick your country" />
</div>
```

- [ ] **Step 3: Persist on signup**

When the fan submits onboarding:
```ts
if (country) {
  await supabase.from('profiles').update({ country }).eq('id', user.id);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/FanSignup.tsx
git commit -m "feat(fan): optional country field in signup onboarding"
```

---

### Task 1.5 — MID routing in `create-link-checkout`

**Files:**
- Modify: `supabase/functions/create-link-checkout/index.ts`

- [ ] **Step 1: Update signature + imports**

At the top of the file, import the helpers:

```ts
import { routeMidForCountry, getMidCredentials } from '../_shared/ugRouting.ts';
```

Remove:
```ts
const quickPayToken = Deno.env.get('QUICKPAY_TOKEN');
const siteId = Deno.env.get('QUICKPAY_SITE_ID') || '98845';
```

- [ ] **Step 2: Accept `country` from request body**

```ts
const body = await req.json();
const country = typeof body?.country === 'string' ? body.country.toUpperCase() : null;
// ...existing buyerEmail / slug / chtref parsing
```

- [ ] **Step 3: Resolve MID per request**

Right before building the QuickPay fields:

```ts
const midKey = routeMidForCountry(country);
const creds = getMidCredentials(midKey);
```

Replace references to `quickPayToken` with `creds.quickPayToken`, `siteId` with `creds.siteId`.

- [ ] **Step 4: Persist `ugp_mid` on the pre-created purchase**

In the `insert` call:
```ts
.insert({
  // ... existing fields
  ugp_mid: midKey,
})
```

- [ ] **Step 5: Deploy + smoke test**

```bash
supabase functions deploy create-link-checkout --linked
```

Then from the browser, trigger a checkout while the PreCheckoutGate has country=US and confirm the returned `fields.SiteID` equals the US_2D SiteID.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/create-link-checkout/index.ts
git commit -m "feat(checkout): route links through country-specific MID"
```

---

### Task 1.6 — Same MID routing for tip/gift/request checkouts

**Files:**
- Modify: `supabase/functions/create-tip-checkout/index.ts`
- Modify: `supabase/functions/create-gift-checkout/index.ts`
- Modify: `supabase/functions/create-request-checkout/index.ts`

Each function replays the pattern in Task 1.5:
1. Import `routeMidForCountry` + `getMidCredentials`
2. Accept `country` on the request
3. Resolve MID per request
4. Use `creds.quickPayToken` / `creds.siteId`
5. Store `ugp_mid` on the inserted row

- [ ] **Step 1: Tip checkout**

Edit `supabase/functions/create-tip-checkout/index.ts` following Task 1.5 pattern. The row is inserted into `tips`, so add `ugp_mid: midKey` there.

- [ ] **Step 2: Gift checkout**

Edit `supabase/functions/create-gift-checkout/index.ts`. Row goes into `gift_purchases`.

- [ ] **Step 3: Request checkout**

Edit `supabase/functions/create-request-checkout/index.ts`. Row goes into `custom_requests`.

- [ ] **Step 4: Deploy + commit**

```bash
supabase functions deploy create-tip-checkout --linked
supabase functions deploy create-gift-checkout --linked
supabase functions deploy create-request-checkout --linked

git add supabase/functions/create-tip-checkout/index.ts supabase/functions/create-gift-checkout/index.ts supabase/functions/create-request-checkout/index.ts
git commit -m "feat(checkout): country-based MID routing for tips/gifts/requests"
```

---

### Task 1.7 — Store country on fan profile from first successful checkout

So repeat buyers don't see the country prompt again.

**Files:**
- Modify: `supabase/functions/ugp-confirm/index.ts`

- [ ] **Step 1: In `handleLinkPurchase`, after updating the purchase to succeeded**

```ts
// Persist billing_country on the fan's profile if present and not set yet
const billingCountry = body.CustomerCountry ? body.CustomerCountry.toUpperCase() : null;
if (billingCountry && billingCountry.length === 2 && purchase.chat_conversation_id /* proxy: there's a fan behind */) {
  // Find the fan via buyer_email → profiles (best effort)
  if (customerEmail) {
    await supabase.from('profiles')
      .update({ billing_country: billingCountry })
      .eq('id',
        (await supabase.auth.admin.listUsers({ filter: `email.eq.${customerEmail}`, perPage: 1 }))?.data?.users?.[0]?.id
      )
      .is('billing_country', null);
  }
}
```

Apply the same block in `handleTip`, `handleGift`, and `handleRequest`.

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy ugp-confirm --linked
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/ugp-confirm/index.ts
git commit -m "feat(routing): persist fan billing_country from confirmed checkouts"
```

---

## Phase 2 — Pricing Refonte (0.5 day, independent)

### Task 2.1 — Update commission rates

**Files:**
- Modify: `src/lib/payment-config.ts`
- Modify: `supabase/functions/create-link-checkout/index.ts`
- Modify: `supabase/functions/create-tip-checkout/index.ts`
- Modify: `supabase/functions/create-gift-checkout/index.ts`
- Modify: `supabase/functions/create-request-checkout/index.ts`

- [ ] **Step 1: Update `payment-config.ts`**

```ts
// src/lib/payment-config.ts (line 17-19)
PROCESSING_FEE_RATE: 0.15,       // 15% fan fee (was 0.05)
COMMISSION_RATE_FREE: 0.15,      // 15% platform commission on Free (was 0.10)
COMMISSION_RATE_PREMIUM: 0,      // unchanged
```

- [ ] **Step 2: Update each edge function's rate**

In each of the 4 checkout edge functions, find `fanProcessingFeeCents = Math.round(baseCents * 0.05)` and change `0.05` → `0.15`. Find `commissionRate = isSubscribed ? 0 : 0.10` and change `0.10` → `0.15`.

Use the `fan_processing_fee_rate_v2` constant if helpful, but inline is fine — these are small numbers.

- [ ] **Step 3: Update UI displays that hard-coded 5% or 10%**

```bash
grep -rn "1\.05\|0\.10\|/1\.05\|\\b5%\\b\|\\b10%\\b" src/ | grep -v node_modules | grep -v '.test'
```

Fix every match that's related to payments — especially:
- `src/pages/LinkDetail.tsx` — revenue calc uses `/1.05 * 0.9`, update to `/1.15 * 0.85`
- `src/pages/AppDashboard.tsx` — same pattern
- `src/pages/Terms.tsx` — the 5% bank fee line
- Any help page mentioning "10%"

- [ ] **Step 4: Deploy all 4 edge functions**

```bash
for fn in create-link-checkout create-tip-checkout create-gift-checkout create-request-checkout; do
  supabase functions deploy "$fn" --linked
done
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/payment-config.ts src/pages/LinkDetail.tsx src/pages/AppDashboard.tsx src/pages/Terms.tsx supabase/functions/create-*-checkout/index.ts
git commit -m "feat(pricing): update rates to 15% platform / 15% fan fee"
```

---

### Task 2.2 — Update Terms page

**Files:**
- Modify: `src/pages/Terms.tsx`

- [ ] **Step 1: Find and update the pricing section**

Search for "10%" and "5%" — rewrite to 15% platform commission on Free plan, 0% on Pro, and note the 15% fan processing fee. Add a line: "Your bank may apply additional processing fees of up to 5.5% on international card transactions, which are deducted from the amount you see on your statement — not from the creator payout."

Also update the "Multi-Profile Pricing" section (§3.6) to describe the **new** charging model: the full subscription amount (base + extras) is billed directly to the creator's card each month, not debited from wallet.

- [ ] **Step 2: Commit**

```bash
git add src/pages/Terms.tsx
git commit -m "docs(terms): reflect new commission rates + multi-profile billing model"
```

---

## Phase 3 — Pricing Page + Pro Upgrade Popup (1 day)

### Task 3.1 — PlanCard component

**Files:**
- Create: `src/components/pricing/PlanCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/pricing/PlanCard.tsx
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PlanCardProps {
  name: string;
  priceLabel: string;
  priceSuffix?: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  ctaLabel: string;
  onCta: () => void;
  ctaDisabled?: boolean;
}

export function PlanCard({ name, priceLabel, priceSuffix, description, features, highlighted, badge, ctaLabel, onCta, ctaDisabled }: PlanCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border bg-card p-6',
        highlighted ? 'border-primary shadow-glow-lg' : 'border-border',
      )}
    >
      {badge && (
        <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
      <h3 className="text-lg font-bold text-foreground">{name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-foreground">{priceLabel}</span>
        {priceSuffix && <span className="text-sm text-muted-foreground">{priceSuffix}</span>}
      </div>
      <ul className="mt-6 space-y-3 text-sm flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground/90">{f}</span>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        onClick={onCta}
        variant={highlighted ? 'hero' : 'outline'}
        disabled={ctaDisabled}
        className="mt-6 w-full"
      >
        {ctaLabel}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pricing/PlanCard.tsx
git commit -m "feat(pricing): PlanCard component"
```

---

### Task 3.2 — Refactor `/pricing` page with 3 plans

**Files:**
- Modify: `src/pages/Pricing.tsx` (find current pricing page path first)

```bash
grep -rn "path.*pricing\|route.*pricing" src/App.tsx
```

- [ ] **Step 1: Update the page**

```tsx
// src/pages/Pricing.tsx (section within the page)
import { PlanCard } from '@/components/pricing/PlanCard';
import { useNavigate } from 'react-router-dom';

export function PricingPlans() {
  const navigate = useNavigate();
  const goSubscribe = (plan: 'monthly' | 'annual') =>
    navigate(`/app/settings?subscribe=${plan}`);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3 max-w-5xl mx-auto">
      <PlanCard
        name="Free"
        priceLabel="$0"
        priceSuffix="/forever"
        description="Start selling with no upfront cost."
        features={[
          '15% platform commission',
          '15% processing fee paid by the fan',
          'Unlimited links, tips, custom requests, and gifts',
          'Single creator profile',
        ]}
        ctaLabel="Current plan"
        onCta={() => {}}
        ctaDisabled
      />
      <PlanCard
        name="Pro Monthly"
        priceLabel="$39"
        priceSuffix="/month"
        description="Keep 100% of your sales. Up to 2 profiles included, $10/mo per extra profile."
        features={[
          '0% platform commission on every sale',
          'Up to 2 profiles included',
          'Additional profiles $10/mo each, billed monthly',
          'All Free features',
        ]}
        badge="Popular"
        highlighted
        ctaLabel="Upgrade to Monthly"
        onCta={() => goSubscribe('monthly')}
      />
      <PlanCard
        name="Pro Annual"
        priceLabel="$239.99"
        priceSuffix="/year"
        description="Best value. Unlimited profiles, save 50% vs monthly."
        features={[
          '0% platform commission',
          'Unlimited profiles (up to 50)',
          '2 months free vs monthly billing',
          'All Free features',
        ]}
        badge="Best value"
        ctaLabel="Upgrade to Annual"
        onCta={() => goSubscribe('annual')}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire the CTAs to trigger the new checkout flow (Phase 4)**

The `?subscribe=monthly|annual` query param is read by `Profile.tsx` (Settings) to auto-trigger the subscription checkout.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Pricing.tsx
git commit -m "feat(pricing): /pricing page with Free/Monthly/Annual plans"
```

---

### Task 3.3 — ProUpgradePopup with weekly throttle

**Files:**
- Create: `src/components/ProUpgradePopup.tsx`
- Modify: `src/components/AppShell.tsx`

- [ ] **Step 1: Write the popup**

```tsx
// src/components/ProUpgradePopup.tsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';

const LAST_SHOWN_KEY = 'exclu_pro_popup_last_shown';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function ProUpgradePopup() {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (checked) return;
    (async () => {
      setChecked(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles')
        .select('subscription_plan, subscription_last_pro_popup_at')
        .eq('id', user.id)
        .maybeSingle();
      if (!profile || profile.subscription_plan !== 'free') return;

      const localLast = Number(localStorage.getItem(LAST_SHOWN_KEY) ?? 0);
      const dbLast = profile.subscription_last_pro_popup_at
        ? new Date(profile.subscription_last_pro_popup_at).getTime()
        : 0;
      const lastShown = Math.max(localLast, dbLast);
      if (Date.now() - lastShown < WEEK_MS) return;

      setVisible(true);
      localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
      await supabase.from('profiles')
        .update({ subscription_last_pro_popup_at: new Date().toISOString() })
        .eq('id', user.id);
    })();
  }, [checked]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-primary/40 bg-card p-5 shadow-glow-lg"
      >
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="text-[11px] uppercase tracking-widest font-semibold">Keep 100% of sales</span>
        </div>
        <h4 className="mt-2 text-lg font-bold text-foreground">Go Pro today</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          From $39/month. Zero commission on every sale — pays for itself after $260 of monthly revenue.
        </p>
        <Button
          type="button"
          variant="hero"
          className="mt-4 w-full"
          onClick={() => { setVisible(false); navigate('/pricing'); }}
        >
          See plans
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Mount it in AppShell (only on `/app/*` routes)**

```tsx
// src/components/AppShell.tsx
import { ProUpgradePopup } from './ProUpgradePopup';

// Inside the main return, next to existing shell:
return (
  <>
    {/* existing content */}
    <ProUpgradePopup />
  </>
);
```

- [ ] **Step 3: Smoke test**

```bash
npm run dev
# Sign in as a Free creator. The popup should appear on first /app/* load.
# Reload — should NOT appear again for 7 days.
# Clear localStorage + subscription_last_pro_popup_at in DB — should appear again.
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ProUpgradePopup.tsx src/components/AppShell.tsx
git commit -m "feat(pricing): weekly Pro upgrade popup for Free creators"
```

---

## Phase 4 — Creator Pro Refactor (Monthly) (2 days)

### Task 4.1 — Refactor `create-creator-subscription` to one-shot Sale

**Files:**
- Modify: `supabase/functions/create-creator-subscription/index.ts`

- [ ] **Step 1: Rewrite body**

Replace the file's content with:

```ts
/**
 * create-creator-subscription — initial checkout for a creator Pro subscription.
 *
 * Issues a QuickPay ONE-SHOT Sale for the total amount (base + extras). The
 * ConfirmURL callback (state=Sale) stores the TransactionID on profiles.
 * From there, rebill-subscriptions cron drives monthly charges via
 * /recurringtransactions — UG no longer manages a subscription plan for us.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { routeMidForCountry, getMidCredentials } from '../_shared/ugRouting.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const BASE_MONTHLY_CENTS = 3900;   // $39
const ADDON_PER_PROFILE_CENTS = 1000; // $10
const INCLUDED_PROFILES = 2;
const ANNUAL_CENTS = 23999;        // $239.99

type Plan = 'monthly' | 'annual';

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = ['http://localhost:8080', 'http://localhost:5173', siteUrl];
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : siteUrl,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const token = auth.replace('Bearer ', '');
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const plan: Plan = body?.plan === 'annual' ? 'annual' : 'monthly';
    const country = typeof body?.country === 'string' ? body.country.toUpperCase() : null;

    // Fetch current profile count for monthly pricing
    const { data: profilesRows } = await supabase
      .from('creator_profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true);
    const profileCount = Math.max(1, profilesRows?.length ?? 1);

    const extraProfiles = Math.max(0, profileCount - INCLUDED_PROFILES);
    const amountCents = plan === 'annual'
      ? ANNUAL_CENTS
      : BASE_MONTHLY_CENTS + extraProfiles * ADDON_PER_PROFILE_CENTS;

    // Don't allow double-subscribe
    const { data: profile } = await supabase.from('profiles')
      .select('subscription_plan, subscription_period_end')
      .eq('id', user.id).maybeSingle();
    if (profile?.subscription_plan !== 'free') {
      return new Response(JSON.stringify({ error: 'Already subscribed' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const midKey = routeMidForCountry(country);
    const creds = getMidCredentials(midKey);

    const merchantReference = `sub_${plan}_${user.id}`;
    const amountDecimal = (amountCents / 100).toFixed(2);

    const fields: Record<string, string> = {
      QuickPayToken: creds.quickPayToken,
      SiteID: creds.siteId,
      AmountTotal: amountDecimal,
      CurrencyID: 'USD',
      'ItemName[0]': plan === 'annual' ? 'Exclu Pro Annual' : 'Exclu Pro Monthly',
      'ItemQuantity[0]': '1',
      'ItemAmount[0]': amountDecimal,
      'ItemDesc[0]': plan === 'annual'
        ? 'Pro Annual subscription — 0% commission, unlimited profiles'
        : `Pro Monthly — 0% commission, ${profileCount} profile(s)`,
      AmountShipping: '0.00',
      ShippingRequired: 'false',
      MembershipRequired: 'false',
      ApprovedURL: `${siteUrl}/app?subscription=success`,
      ConfirmURL: `${siteUrl}/api/ugp-confirm`,
      DeclinedURL: `${siteUrl}/app?subscription=failed`,
      MerchantReference: merchantReference,
      Email: user.email ?? '',
    };

    return new Response(JSON.stringify({ fields, amountCents, plan, mid: midKey }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('create-creator-subscription error:', err);
    return new Response(JSON.stringify({ error: 'Unable to start checkout' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
```

- [ ] **Step 2: Deploy + smoke test**

```bash
supabase functions deploy create-creator-subscription --linked
```

Trigger from the Profile settings UI (once Task 4.7 is done) and confirm the returned `fields.MerchantReference` is `sub_monthly_<uuid>` or `sub_annual_<uuid>`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-creator-subscription/index.ts
git commit -m "refactor(sub): creator Pro checkout as one-shot Sale"
```

---

### Task 4.2 — Handle `sub_monthly_*` / `sub_annual_*` in ugp-confirm

**Files:**
- Modify: `supabase/functions/ugp-confirm/index.ts`

Currently `handleSubscription` sets `is_creator_subscribed=true`. We rewrite it to populate the new schema.

- [ ] **Step 1: Update the dispatcher**

Find the switch statement in the handler (around line 131) and the MerchantReference parser. Extend to support `sub_monthly_*` and `sub_annual_*`:

```ts
function parseMerchantRef(ref: string): { type: string; id: string; subPlan?: 'monthly' | 'annual' } | null {
  if (!ref) return null;
  // sub_monthly_<uuid> or sub_annual_<uuid> or sub_<uuid> (legacy)
  const subMatch = ref.match(/^sub_(monthly|annual)_(.+)$/);
  if (subMatch) return { type: 'sub', subPlan: subMatch[1] as 'monthly' | 'annual', id: subMatch[2] };
  // fall back to legacy sub_<uuid>
  const idx = ref.indexOf('_');
  if (idx === -1) return null;
  return { type: ref.slice(0, idx), id: ref.slice(idx + 1) };
}
```

Update `actionableStatesByType`: `sub` still accepts `Sale` (and `Recurring` for rebills — see Task 4.5).

- [ ] **Step 2: Rewrite `handleSubscription`**

```ts
async function handleSubscription(userId: string, body: Record<string, string>, subPlan: 'monthly' | 'annual' = 'monthly') {
  const { data: profile } = await supabase.from('profiles')
    .select('id, subscription_plan')
    .eq('id', userId).single();
  if (!profile) {
    console.error('Profile not found for subscription:', userId);
    return;
  }

  const amountCents = Math.round(parseFloat(body.Amount || '0') * 100);
  const now = new Date();
  const periodEnd = new Date(now);
  if (subPlan === 'annual') periodEnd.setUTCDate(periodEnd.getUTCDate() + 365);
  else periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);

  // MID: infer from SiteID (the incoming callback carries it)
  const siteIdFromCallback = body.SiteID || '';
  const intlSite = Deno.env.get('QUICKPAY_SITE_ID_INTL_3D') || '';
  const us2dSite = Deno.env.get('QUICKPAY_SITE_ID_US_2D') || '';
  const mid = siteIdFromCallback === us2dSite ? 'us_2d' : 'intl_3d';

  await supabase.from('profiles').update({
    is_creator_subscribed: true,
    subscription_plan: subPlan,
    subscription_ugp_transaction_id: body.TransactionID || null,
    subscription_mid: mid,
    subscription_amount_cents: amountCents,
    subscription_period_start: now.toISOString(),
    subscription_period_end: periodEnd.toISOString(),
    subscription_cancel_at_period_end: false,
    subscription_suspended_at: null,
    show_join_banner: false,
    show_certification: true,
    show_deeplinks: true,
    show_available_now: true,
  }).eq('id', userId);

  await creditReferralCommission(userId);

  console.log(`Creator sub activated: ${userId} plan=${subPlan} amount=${amountCents} period_end=${periodEnd.toISOString()}`);
}
```

Update the dispatcher call: `await handleSubscription(parsed.id, body, parsed.subPlan ?? 'monthly');`

- [ ] **Step 3: Deploy + commit**

```bash
supabase functions deploy ugp-confirm --linked
git add supabase/functions/ugp-confirm/index.ts
git commit -m "feat(sub): store TID + plan + MID on new creator sub activation"
```

---

### Task 4.3 — Rebill cron edge function

**Files:**
- Create: `supabase/functions/rebill-subscriptions/index.ts`
- Create: `supabase/functions/rebill-subscriptions/config.toml`

- [ ] **Step 1: Write config.toml**

```toml
# supabase/functions/rebill-subscriptions/config.toml
verify_jwt = false
```

- [ ] **Step 2: Write the function**

```ts
// supabase/functions/rebill-subscriptions/index.ts
//
// Daily cron: finds creator subs and fan subs whose period ends today or
// earlier, rebills them via /recurringtransactions on the MID used for the
// original Sale, and updates state accordingly.
//
// Auth: requires Authorization: Bearer <REBILL_CRON_SECRET>

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getMidCredentials } from '../_shared/ugRouting.ts';
import { rebillTransaction } from '../_shared/ugRebill.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('REBILL_CRON_SECRET');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_DAYS = [0, 3, 4]; // total ~7 days across 3 attempts
const BASE_MONTHLY_CENTS = 3900;
const ADDON_PER_PROFILE_CENTS = 1000;
const INCLUDED_PROFILES = 2;
const ANNUAL_CENTS = 23999;

async function computeCreatorMonthlyAmount(userId: string): Promise<number> {
  const { data: profiles } = await supabase.from('creator_profiles')
    .select('id').eq('user_id', userId).eq('is_active', true);
  const count = Math.max(1, profiles?.length ?? 1);
  const extras = Math.max(0, count - INCLUDED_PROFILES);
  return BASE_MONTHLY_CENTS + extras * ADDON_PER_PROFILE_CENTS;
}

async function rebillCreatorSubscription(creator: any): Promise<void> {
  const mid = creator.subscription_mid as 'us_2d' | 'intl_3d' | null;
  const tid = creator.subscription_ugp_transaction_id as string | null;
  if (!mid || !tid) {
    console.error(`[rebill] creator ${creator.id}: missing mid or tid, skipping`);
    return;
  }

  const plan = creator.subscription_plan as 'monthly' | 'annual';
  const amount = plan === 'annual'
    ? ANNUAL_CENTS
    : await computeCreatorMonthlyAmount(creator.id);

  const creds = getMidCredentials(mid);
  const tracking = `rebill_cre_${creator.id}_${Date.now()}`;
  const { count: priorAttempts } = await supabase.from('rebill_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('subject_table', 'profiles').eq('subject_id', creator.id)
    .gte('created_at', creator.subscription_period_end);
  const attemptNumber = (priorAttempts ?? 0) + 1;

  const result = await rebillTransaction(creds, tid, amount, tracking);

  await supabase.from('rebill_attempts').insert({
    subject_table: 'profiles',
    subject_id: creator.id,
    ugp_mid: mid,
    reference_transaction_id: tid,
    amount_cents: amount,
    attempt_number: attemptNumber,
    status: result.classification,
    ugp_response: result.raw,
    ugp_transaction_id: result.transactionId,
    reason_code: result.reasonCode,
    message: result.message,
  });

  if (result.success) {
    const now = new Date();
    const nextEnd = new Date(now);
    if (plan === 'annual') nextEnd.setUTCDate(nextEnd.getUTCDate() + 365);
    else nextEnd.setUTCDate(nextEnd.getUTCDate() + 30);
    await supabase.from('profiles').update({
      subscription_amount_cents: amount,
      subscription_period_start: now.toISOString(),
      subscription_period_end: nextEnd.toISOString(),
      subscription_suspended_at: null,
    }).eq('id', creator.id);
    console.log(`[rebill] creator ${creator.id} success, next: ${nextEnd.toISOString()}`);
    return;
  }

  // Failure handling
  if (attemptNumber >= MAX_ATTEMPTS || result.classification === 'card_expired') {
    await supabase.from('profiles').update({
      is_creator_subscribed: false,
      subscription_plan: 'free',
      subscription_suspended_at: new Date().toISOString(),
      show_certification: false,
      show_deeplinks: false,
      show_available_now: false,
    }).eq('id', creator.id);
    // TODO: send suspension email via Brevo helper
    console.log(`[rebill] creator ${creator.id} suspended after ${attemptNumber} attempts`);
    return;
  }

  // Schedule retry
  const retryIn = RETRY_DELAY_DAYS[Math.min(attemptNumber, RETRY_DELAY_DAYS.length - 1)];
  const nextTry = new Date(Date.now() + retryIn * 86400000);
  await supabase.from('profiles').update({
    subscription_period_end: nextTry.toISOString(),
  }).eq('id', creator.id);
  console.log(`[rebill] creator ${creator.id} retry scheduled for ${nextTry.toISOString()}`);
}

async function rebillFanSubscription(sub: any): Promise<void> {
  const mid = sub.ugp_mid as 'us_2d' | 'intl_3d' | null;
  const tid = sub.ugp_transaction_id as string | null;
  if (!mid || !tid) {
    console.error(`[rebill] fan sub ${sub.id}: missing mid or tid, skipping`);
    return;
  }
  const amount = sub.price_cents as number; // grandfathered — locked at subscribe time
  const creds = getMidCredentials(mid);
  const tracking = `rebill_fan_${sub.id}_${Date.now()}`;

  const { count: priorAttempts } = await supabase.from('rebill_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('subject_table', 'fan_creator_subscriptions').eq('subject_id', sub.id)
    .gte('created_at', sub.next_rebill_at);
  const attemptNumber = (priorAttempts ?? 0) + 1;

  const result = await rebillTransaction(creds, tid, amount, tracking);

  await supabase.from('rebill_attempts').insert({
    subject_table: 'fan_creator_subscriptions',
    subject_id: sub.id,
    ugp_mid: mid,
    reference_transaction_id: tid,
    amount_cents: amount,
    attempt_number: attemptNumber,
    status: result.classification,
    ugp_response: result.raw,
    ugp_transaction_id: result.transactionId,
    reason_code: result.reasonCode,
    message: result.message,
  });

  if (result.success) {
    const now = new Date();
    const nextEnd = new Date(now); nextEnd.setUTCDate(nextEnd.getUTCDate() + 30);
    await supabase.from('fan_creator_subscriptions').update({
      period_start: now.toISOString(),
      period_end: nextEnd.toISOString(),
      next_rebill_at: nextEnd.toISOString(),
      suspended_at: null,
    }).eq('id', sub.id);
    return;
  }

  if (attemptNumber >= MAX_ATTEMPTS || result.classification === 'card_expired') {
    await supabase.from('fan_creator_subscriptions').update({
      status: 'past_due',
      suspended_at: new Date().toISOString(),
    }).eq('id', sub.id);
    return;
  }

  const retryIn = RETRY_DELAY_DAYS[Math.min(attemptNumber, RETRY_DELAY_DAYS.length - 1)];
  const next = new Date(Date.now() + retryIn * 86400000);
  await supabase.from('fan_creator_subscriptions').update({
    next_rebill_at: next.toISOString(),
  }).eq('id', sub.id);
}

serve(async (req) => {
  // Auth gate
  const providedSecret = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date().toISOString();

  // ── Creator subs ─────────────────────────────────────────────────
  const { data: creators } = await supabase.from('profiles')
    .select('id, subscription_plan, subscription_ugp_transaction_id, subscription_mid, subscription_period_end, subscription_cancel_at_period_end, subscription_suspended_at')
    .in('subscription_plan', ['monthly', 'annual'])
    .lte('subscription_period_end', now)
    .is('subscription_suspended_at', null);

  let creatorOk = 0, creatorFail = 0;
  for (const c of creators ?? []) {
    if (c.subscription_cancel_at_period_end) {
      await supabase.from('profiles').update({
        is_creator_subscribed: false,
        subscription_plan: 'free',
      }).eq('id', c.id);
      continue;
    }
    try {
      await rebillCreatorSubscription(c);
      creatorOk++;
    } catch (e) {
      console.error('rebill creator error', c.id, e);
      creatorFail++;
    }
  }

  // ── Fan subs ─────────────────────────────────────────────────────
  const { data: fanSubs } = await supabase.from('fan_creator_subscriptions')
    .select('id, ugp_transaction_id, ugp_mid, price_cents, next_rebill_at, cancel_at_period_end')
    .eq('status', 'active')
    .lte('next_rebill_at', now)
    .is('suspended_at', null);

  let fanOk = 0, fanFail = 0;
  for (const s of fanSubs ?? []) {
    if (s.cancel_at_period_end) {
      await supabase.from('fan_creator_subscriptions').update({ status: 'cancelled' }).eq('id', s.id);
      continue;
    }
    try {
      await rebillFanSubscription(s);
      fanOk++;
    } catch (e) {
      console.error('rebill fan sub error', s.id, e);
      fanFail++;
    }
  }

  return new Response(JSON.stringify({ creatorOk, creatorFail, fanOk, fanFail }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 3: Provision secret**

```bash
openssl rand -hex 32 | pbcopy
supabase secrets set REBILL_CRON_SECRET=<paste>
vercel env add REBILL_CRON_SECRET production preview development   # same value
```

- [ ] **Step 4: Deploy**

```bash
supabase functions deploy rebill-subscriptions --linked
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/rebill-subscriptions/
git commit -m "feat(sub): rebill cron for creator Pro + fan subs"
```

---

### Task 4.4 — Vercel cron entrypoint

**Files:**
- Create: `api/cron/rebill-subscriptions.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the entrypoint**

```ts
// api/cron/rebill-subscriptions.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_FN_URL = 'https://qexnwezetjlbwltyccks.supabase.co/functions/v1/rebill-subscriptions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel signs cron invocations with a header matching CRON_SECRET
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const r = await fetch(SUPABASE_FN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.REBILL_CRON_SECRET}`,
      'apikey': process.env.SUPABASE_ANON_KEY ?? '',
    },
  });
  const body = await r.text();
  res.status(r.status).setHeader('Content-Type', 'application/json').send(body);
}
```

- [ ] **Step 2: Register the cron in vercel.json**

```json
"crons": [
  { "path": "/api/cron/drain-campaigns", "schedule": "* * * * *" },
  { "path": "/api/cron/rebill-subscriptions", "schedule": "0 8 * * *" }
]
```

(Runs every day at 08:00 UTC.)

- [ ] **Step 3: Set `CRON_SECRET` in Vercel (Vercel auto-signs cron calls with this)**

```bash
vercel env add CRON_SECRET production preview development
# Enter a value (e.g., the output of `openssl rand -hex 32`)
```

- [ ] **Step 4: Smoke test locally**

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/rebill-subscriptions
```

Expected: JSON `{ "creatorOk": 0, ... }` (if no subs are due).

- [ ] **Step 5: Commit**

```bash
git add api/cron/rebill-subscriptions.ts vercel.json
git commit -m "feat(cron): daily trigger for rebill-subscriptions"
```

---

### Task 4.5 — Handle `state=Recurring` ConfirmURL callbacks

The Direct Rebilling doc §Confirm page confirms UG POSTs to our ConfirmURL after every rebill with `TransactionState=Recurring`. Our Phase 0 hotfix skips Recurring for `sub_` and `fsub_` — we now want to accept it (no-op other than logging, since the rebill cron already updated our DB from the synchronous API response).

**Files:**
- Modify: `supabase/functions/ugp-confirm/index.ts`

- [ ] **Step 1: Add Recurring to actionable states**

```ts
const actionableStatesByType: Record<string, ReadonlySet<string>> = {
  link: new Set(['Sale']),
  tip: new Set(['Sale']),
  gift: new Set(['Sale']),
  req: new Set(['Authorize']),
  sub: new Set(['Sale', 'Recurring']),   // Recurring = rebill (no-op: cron already handled)
  fsub: new Set(['Sale', 'Recurring']),
};
```

- [ ] **Step 2: Short-circuit for Recurring (log only)**

In the dispatcher, before calling `handleSubscription`, check:

```ts
const isRecurringCallback = transactionState === 'Recurring';
if (isRecurringCallback) {
  // We already updated state from the synchronous /recurringtransactions response.
  // Just mark the event processed and return.
  await supabase.from('payment_events').update({
    processed: true,
    processing_result: `${parsed.type} recurring callback logged`,
  }).eq('transaction_id', transactionId);
  return new Response('OK', { status: 200 });
}
```

- [ ] **Step 3: Deploy + commit**

```bash
supabase functions deploy ugp-confirm --linked
git add supabase/functions/ugp-confirm/index.ts
git commit -m "feat(confirm): accept Recurring callbacks for sub/fsub"
```

---

### Task 4.6 — Handle failed rebills (email notifications)

**Files:**
- Create: `supabase/functions/_shared/rebillEmails.ts`
- Modify: `supabase/functions/rebill-subscriptions/index.ts`

- [ ] **Step 1: Write email helpers**

```ts
// supabase/functions/_shared/rebillEmails.ts
import { sendBrevoEmail, formatUSD } from './brevo.ts';
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at';

export async function emailRebillFailedRetry(toEmail: string, name: string, amountCents: number, attempt: number, nextAttemptAt: Date) {
  return sendBrevoEmail({
    to: toEmail,
    subject: `⚠️ Subscription renewal couldn't be charged (attempt ${attempt})`,
    htmlContent: `<p>Hi ${name},</p>
      <p>Your Exclu Pro subscription renewal for ${formatUSD(amountCents)} could not be charged on your card. We'll try again on ${nextAttemptAt.toUTCString()}.</p>
      <p>If you've changed cards recently, please update your payment method in <a href="${siteUrl}/app/settings">Settings</a>.</p>`,
  });
}

export async function emailRebillSuspended(toEmail: string, name: string, amountCents: number) {
  return sendBrevoEmail({
    to: toEmail,
    subject: `Your Exclu Pro subscription has been paused`,
    htmlContent: `<p>Hi ${name},</p>
      <p>After 3 failed attempts to renew your Pro subscription (${formatUSD(amountCents)}), we've paused your plan. Your Pro features are temporarily disabled until you resubscribe.</p>
      <p><a href="${siteUrl}/pricing">Reactivate my Pro plan</a></p>`,
  });
}

export async function emailFanSubSuspended(toEmail: string, creatorName: string, amountCents: number) {
  return sendBrevoEmail({
    to: toEmail,
    subject: `Your subscription to ${creatorName} has been paused`,
    htmlContent: `<p>We couldn't renew your ${formatUSD(amountCents)}/month subscription to ${creatorName}. Your access is paused until you update your payment method.</p>
      <p><a href="${siteUrl}/fan/subscriptions">Manage my subscriptions</a></p>`,
  });
}
```

- [ ] **Step 2: Wire into rebill-subscriptions**

In `rebillCreatorSubscription`:

```ts
// On retry scheduled:
const { data: authUser } = await supabase.auth.admin.getUserById(creator.id);
if (authUser?.user?.email) {
  await emailRebillFailedRetry(authUser.user.email, /*name*/ '', amount, attemptNumber, nextTry);
}

// On suspension:
await emailRebillSuspended(authUser.user.email, '', amount);
```

Same pattern in `rebillFanSubscription`.

- [ ] **Step 3: Deploy + commit**

```bash
supabase functions deploy rebill-subscriptions --linked
git add supabase/functions/_shared/rebillEmails.ts supabase/functions/rebill-subscriptions/index.ts
git commit -m "feat(sub): email notifications on rebill retry + suspension"
```

---

### Task 4.7 — Settings PlanManagement UI

**Files:**
- Create: `src/components/settings/PlanManagement.tsx`
- Modify: `src/pages/Profile.tsx` (find the settings subscription section)

- [ ] **Step 1: Write the component**

```tsx
// src/components/settings/PlanManagement.tsx
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { QuickPayForm } from '@/components/payment/QuickPayForm';

interface SubState {
  plan: 'free' | 'monthly' | 'annual';
  amount_cents: number | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
}

export function PlanManagement() {
  const [sub, setSub] = useState<SubState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFields, setPendingFields] = useState<Record<string, string> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('profiles')
        .select('subscription_plan, subscription_amount_cents, subscription_period_end, subscription_cancel_at_period_end')
        .eq('id', user.id).maybeSingle();
      if (data) setSub({
        plan: data.subscription_plan,
        amount_cents: data.subscription_amount_cents,
        period_end: data.subscription_period_end,
        cancel_at_period_end: data.subscription_cancel_at_period_end,
      });
    });
  }, []);

  const startCheckout = async (plan: 'monthly' | 'annual') => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('create-creator-subscription', {
        body: { plan, country: null /* UI will prompt later via PreCheckoutGate */ },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) throw error;
      setPendingFields((data as any).fields);
    } catch (e: any) {
      toast.error(e?.message || 'Unable to start checkout');
    } finally {
      setBusy(false);
    }
  };

  const cancelAtEnd = async () => {
    if (!confirm('Cancel at end of period? You keep Pro until then.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke('cancel-creator-subscription', {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (error) return toast.error('Cancellation failed');
    toast.success('Your subscription will end on ' + sub?.period_end?.slice(0,10));
  };

  if (!sub) return null;

  if (pendingFields) {
    return <QuickPayForm fields={pendingFields} />; // existing component auto-submits
  }

  if (sub.plan === 'free') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Button variant="hero" onClick={() => startCheckout('monthly')} disabled={busy}>
          Start Monthly — $39/mo
        </Button>
        <Button variant="outline" onClick={() => startCheckout('annual')} disabled={busy}>
          Start Annual — $239.99/yr
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold">{sub.plan === 'annual' ? 'Pro Annual' : 'Pro Monthly'}</h3>
        <span className="text-sm text-muted-foreground">
          {sub.amount_cents ? `$${(sub.amount_cents / 100).toFixed(2)}` : '—'} • renews {sub.period_end?.slice(0, 10)}
        </span>
      </div>
      {!sub.cancel_at_period_end ? (
        <Button variant="outline" onClick={cancelAtEnd}>Cancel at end of period</Button>
      ) : (
        <p className="text-sm text-amber-400">Your plan will end on {sub.period_end?.slice(0, 10)}. No further charges.</p>
      )}
      {sub.plan === 'monthly' && (
        <Button variant="ghost" onClick={() => navigate('/pricing')}>
          Switch to Annual (save 50%)
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount in Profile settings**

In `src/pages/Profile.tsx`, find the "Subscription" / "Premium" section and replace with `<PlanManagement />`.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/PlanManagement.tsx src/pages/Profile.tsx
git commit -m "feat(settings): new PlanManagement UI with Monthly/Annual selection"
```

---

### Task 4.8 — Refactor cancel-creator-subscription to flag-based

**Files:**
- Modify: `supabase/functions/cancel-creator-subscription/index.ts`

Instead of calling the QuickPay cancel endpoint, simply flip `subscription_cancel_at_period_end = true`. The cron handles the actual downgrade when `period_end` elapses.

- [ ] **Step 1: Rewrite**

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sbUrl = Deno.env.get('PROJECT_URL')!;
const sbKey = Deno.env.get('SERVICE_ROLE_KEY')!;
const sb = createClient(sbUrl, sbKey);

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const auth = req.headers.get('Authorization') || '';
  const { data: { user }, error } = await sb.auth.getUser(auth.replace('Bearer ', ''));
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  await sb.from('profiles').update({
    subscription_cancel_at_period_end: true,
  }).eq('id', user.id);

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
```

- [ ] **Step 2: Deploy + commit**

```bash
supabase functions deploy cancel-creator-subscription --linked
git add supabase/functions/cancel-creator-subscription/index.ts
git commit -m "refactor(sub): cancel creator sub via cancel_at_period_end flag"
```

---

### Task 4.9 — Migrate existing `plan 11027` subscribers ⚠️ PENDING DEREK Q1

**Files:**
- Create: `scripts/migrate-legacy-creator-subs.ts`

Only run this once D1 is answered. If D1=yes (TID is rebillable), we populate `subscription_ugp_transaction_id` for existing subscribers from `payment_events`. If D1=no, we'd need a force-resubscribe flow (not detailed here — ~1 more day of work).

- [ ] **Step 1: Write the script**

```ts
// scripts/migrate-legacy-creator-subs.ts
// Populates subscription_ugp_transaction_id + subscription_mid for creators
// currently on the legacy plan 11027. Idempotent.

import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient('https://qexnwezetjlbwltyccks.supabase.co', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const { data: subs } = await sb.from('profiles')
  .select('id, subscription_plan, subscription_ugp_transaction_id')
  .eq('subscription_plan', 'monthly')
  .is('subscription_ugp_transaction_id', null);

console.log('Migrating', subs?.length, 'creators');

for (const s of subs ?? []) {
  const { data: event } = await sb.from('payment_events')
    .select('transaction_id, raw_payload, processed, transaction_state, created_at')
    .eq('merchant_reference', `sub_${s.id}`)
    .eq('transaction_state', 'Sale')
    .eq('processed', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!event?.transaction_id) {
    console.log('❌ no initial Sale event for', s.id);
    continue;
  }

  const siteId = String((event.raw_payload as any)?.SiteID ?? '');
  const intl = Deno.env.get('QUICKPAY_SITE_ID_INTL_3D') ?? '';
  const us2d = Deno.env.get('QUICKPAY_SITE_ID_US_2D') ?? '';
  const mid = siteId === us2d ? 'us_2d' : 'intl_3d';

  await sb.from('profiles').update({
    subscription_ugp_transaction_id: event.transaction_id,
    subscription_mid: mid,
    subscription_amount_cents: 3900, // legacy base, will recompute on next rebill
  }).eq('id', s.id);

  console.log('✅', s.id, 'TID', event.transaction_id, 'MID', mid);
}
```

- [ ] **Step 2: Run after Derek confirms D1**

```bash
SUPABASE_SERVICE_ROLE_KEY=... deno run -A scripts/migrate-legacy-creator-subs.ts
```

- [ ] **Step 3: Disable `chargeProfileAddons`**

In `supabase/functions/ugp-membership-confirm/index.ts`, comment out the `await chargeProfileAddons(userId);` line. Legacy 11027 rebills (which still hit this function) stop debiting wallets for extras — the new cron is the source of truth going forward.

```bash
supabase functions deploy ugp-membership-confirm --linked
```

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-legacy-creator-subs.ts supabase/functions/ugp-membership-confirm/index.ts
git commit -m "feat(sub): migrate legacy plan 11027 subs to /recurringtransactions flow"
```

---

## Phase 5 — Creator Pro Annual (0.5 day)

### Task 5.1 — Annual logic already in place

Task 4.1 already branches on `plan === 'annual'` for amount and Task 4.2 extends period_end by 365 days. Task 4.3 rebills annual subs with the $239.99 fixed amount. Task 4.7 lets the creator choose Annual at checkout.

The only remaining work is the **profile cap**:

**Files:**
- Modify: `src/pages/CreateProfile.tsx`
- Modify: `supabase/functions/create-fan-subscription-checkout/index.ts` (no, this is fan subs)

- [ ] **Step 1: Add 50-profile cap in UI**

In `CreateProfile.tsx`, before submitting a new profile, check the current count:

```tsx
const HARD_CAP = 50;
if (profiles.length >= HARD_CAP) {
  toast.error('You have reached the 50-profile limit. Contact support if you need more.');
  return;
}
```

- [ ] **Step 2: Enforce server-side** — add a check in the profile creation RPC (`create_creator_profile` or equivalent; find with `grep -rn "create_creator_profile\|creator_profiles.*insert" supabase/`)

If it's RPC:
```sql
if (select count(*) from creator_profiles where user_id = p_user_id and is_active) >= 50 then
  raise exception 'Profile cap reached';
end if;
```

If it's direct insert in an Edge Function, add a count check before `.insert()`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CreateProfile.tsx supabase/functions/<profile-creation-fn>/index.ts
git commit -m "feat(sub): hard cap 50 profiles per account"
```

---

## Phase 6 — Fan → Creator Subscriptions Refactor (1.5 days)

### Task 6.1 — Refactor `create-fan-subscription-checkout`

**Files:**
- Modify: `supabase/functions/create-fan-subscription-checkout/index.ts`

The current implementation (from the `feat/fan-subs-and-feed` branch) builds a QuickPay subscription form with `SubscriptionPlanId=QUICKPAY_FAN_SUB_PLAN_ID`. Derek confirmed this won't work — rewrite as one-shot Sale.

- [ ] **Step 1: Rewrite to one-shot Sale**

```ts
// supabase/functions/create-fan-subscription-checkout/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { routeMidForCountry, getMidCredentials } from '../_shared/ugRouting.ts';

const sbUrl = Deno.env.get('PROJECT_URL')!;
const sbKey = Deno.env.get('SERVICE_ROLE_KEY')!;
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at').replace(/\/$/, '');
const sb = createClient(sbUrl, sbKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const auth = req.headers.get('Authorization') ?? '';
  const { data: { user } } = await sb.auth.getUser(auth.replace('Bearer ', ''));
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = await req.json().catch(() => ({}));
  const creatorProfileId = body?.creator_profile_id;
  const country = typeof body?.country === 'string' ? body.country.toUpperCase() : null;
  if (!creatorProfileId) return new Response(JSON.stringify({ error: 'Missing creator_profile_id' }), { status: 400 });

  const { data: creatorProfile } = await sb.from('creator_profiles')
    .select('id, user_id, fan_sub_price_cents, display_name')
    .eq('id', creatorProfileId).maybeSingle();
  if (!creatorProfile?.fan_sub_price_cents) return new Response(JSON.stringify({ error: 'Creator not accepting subs' }), { status: 400 });

  const priceCents = creatorProfile.fan_sub_price_cents;

  // Create the pending subscription row
  const { data: subRow, error: insErr } = await sb.from('fan_creator_subscriptions').insert({
    fan_id: user.id,
    creator_profile_id: creatorProfile.id,
    price_cents: priceCents,
    status: 'pending',
  }).select('id').single();
  if (insErr) return new Response(JSON.stringify({ error: 'Insert failed' }), { status: 500 });

  const midKey = routeMidForCountry(country);
  const creds = getMidCredentials(midKey);
  const amountDecimal = (priceCents / 100).toFixed(2);
  const merchantReference = `fsub_${subRow.id}`;

  const fields: Record<string, string> = {
    QuickPayToken: creds.quickPayToken,
    SiteID: creds.siteId,
    AmountTotal: amountDecimal,
    CurrencyID: 'USD',
    'ItemName[0]': `Monthly subscription to ${creatorProfile.display_name}`,
    'ItemQuantity[0]': '1',
    'ItemAmount[0]': amountDecimal,
    'ItemDesc[0]': 'Exclu fan subscription — monthly',
    AmountShipping: '0.00',
    ShippingRequired: 'false',
    MembershipRequired: 'false',
    ApprovedURL: `${siteUrl}/fan/subscriptions?subscribed=${creatorProfile.id}`,
    ConfirmURL: `${siteUrl}/api/ugp-confirm`,
    DeclinedURL: `${siteUrl}/fan/subscriptions?failed=${creatorProfile.id}`,
    MerchantReference: merchantReference,
    Email: user.email ?? '',
  };

  return new Response(JSON.stringify({ fields, subscription_id: subRow.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Extend ugp-confirm handleFanSubscription**

In `supabase/functions/ugp-confirm/index.ts`, update `handleFanSubscription` to store `ugp_transaction_id`, `ugp_mid`, `next_rebill_at`:

```ts
async function handleFanSubscription(subscriptionId: string, body: Record<string, string>) {
  const { data: sub } = await supabase.from('fan_creator_subscriptions')
    .select('id, status').eq('id', subscriptionId).maybeSingle();
  if (!sub) return;
  if (sub.status === 'active') return; // idempotent

  const now = new Date();
  const periodEnd = new Date(now); periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);
  const siteId = body.SiteID || '';
  const intl = Deno.env.get('QUICKPAY_SITE_ID_INTL_3D') ?? '';
  const us2d = Deno.env.get('QUICKPAY_SITE_ID_US_2D') ?? '';
  const mid = siteId === us2d ? 'us_2d' : 'intl_3d';

  await supabase.from('fan_creator_subscriptions').update({
    status: 'active',
    period_start: now.toISOString(),
    period_end: periodEnd.toISOString(),
    next_rebill_at: periodEnd.toISOString(),
    started_at: now.toISOString(),
    ugp_transaction_id: body.TransactionID || null,
    ugp_mid: mid,
    cancel_at_period_end: false,
    suspended_at: null,
  }).eq('id', subscriptionId);
}
```

- [ ] **Step 3: Deploy + commit**

```bash
supabase functions deploy create-fan-subscription-checkout --linked
supabase functions deploy ugp-confirm --linked
git add supabase/functions/create-fan-subscription-checkout/index.ts supabase/functions/ugp-confirm/index.ts
git commit -m "refactor(fan-sub): one-shot Sale + server-driven rebills"
```

---

### Task 6.2 — `/fan/subscriptions` page

**Files:**
- Create: `src/pages/FanSubscriptions.tsx`
- Modify: `src/App.tsx`
- Modify: `vercel.json`

- [ ] **Step 1: Write the page**

```tsx
// src/pages/FanSubscriptions.tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

type Row = {
  id: string;
  creator_handle: string | null;
  creator_name: string | null;
  price_cents: number;
  period_end: string;
  cancel_at_period_end: boolean;
  status: string;
};

export default function FanSubscriptions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('fan_creator_subscriptions')
      .select('id, price_cents, period_end, cancel_at_period_end, status, creator_profile:creator_profiles!inner(handle, display_name)')
      .eq('fan_id', user.id)
      .in('status', ['active', 'past_due', 'cancelled'])
      .order('period_end', { ascending: false });
    setRows((data ?? []).map((r: any) => ({
      id: r.id,
      creator_handle: r.creator_profile?.handle ?? null,
      creator_name: r.creator_profile?.display_name ?? null,
      price_cents: r.price_cents,
      period_end: r.period_end,
      cancel_at_period_end: r.cancel_at_period_end,
      status: r.status,
    })));
    setLoading(false);
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancel at end of billing period? You keep access until then.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke('cancel-fan-subscription', {
      body: { subscription_id: id },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (error) return toast.error('Cancel failed');
    toast.success('Will end on period close');
    await load();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">My subscriptions</h1>
      {loading && <p className="text-muted-foreground mt-4">Loading…</p>}
      {!loading && rows.length === 0 && <p className="mt-4 text-muted-foreground">You're not subscribed to any creator yet.</p>}
      <ul className="mt-6 space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
            <div>
              <Link to={`/${r.creator_handle}`} className="font-semibold hover:underline">{r.creator_name || r.creator_handle}</Link>
              <p className="text-sm text-muted-foreground">${(r.price_cents/100).toFixed(2)}/mo • next charge {r.period_end.slice(0, 10)}</p>
              {r.cancel_at_period_end && <p className="text-xs text-amber-400 mt-1">Ends on {r.period_end.slice(0, 10)}</p>}
              {r.status === 'past_due' && <p className="text-xs text-red-400 mt-1">Payment failed — update your card</p>}
            </div>
            {r.status === 'active' && !r.cancel_at_period_end && (
              <Button variant="outline" size="sm" onClick={() => cancel(r.id)}>Cancel</Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add route in App.tsx**

Find the routes block and add **before** the `/:handle` wildcard:

```tsx
<Route path="/fan/subscriptions" element={<FanSubscriptions />} />
```

- [ ] **Step 3: Add rewrite in vercel.json**

```json
{ "source": "/fan/subscriptions", "destination": "/index.html" }
```

Place **before** the `/:handle` rewrite.

- [ ] **Step 4: Link from FanDashboard / settings**

Find the fan settings section (Profile.tsx when `?role=fan` or `FanDashboard.tsx`) and add:
```tsx
<Link to="/fan/subscriptions" className="...">My subscriptions</Link>
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/FanSubscriptions.tsx src/App.tsx vercel.json src/pages/FanDashboard.tsx
git commit -m "feat(fan): /fan/subscriptions page with cancel"
```

---

### Task 6.3 — Refactor `cancel-fan-subscription`

**Files:**
- Modify: `supabase/functions/cancel-fan-subscription/index.ts`

Similar to Task 4.8 — flip a flag, don't call UG.

- [ ] **Step 1: Rewrite**

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('PROJECT_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { data: { user } } = await sb.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const subId = body?.subscription_id;
  if (!subId) return new Response(JSON.stringify({ error: 'Missing subscription_id' }), { status: 400 });

  // Authorize: fan must own the sub
  const { data: sub } = await sb.from('fan_creator_subscriptions')
    .select('id, fan_id, status').eq('id', subId).maybeSingle();
  if (!sub || sub.fan_id !== user.id) return new Response('Forbidden', { status: 403 });
  if (sub.status !== 'active') return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });

  await sb.from('fan_creator_subscriptions').update({
    cancel_at_period_end: true,
  }).eq('id', subId);

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
```

- [ ] **Step 2: Deploy + commit**

```bash
supabase functions deploy cancel-fan-subscription --linked
git add supabase/functions/cancel-fan-subscription/index.ts
git commit -m "refactor(fan-sub): cancel via cancel_at_period_end flag"
```

---

### Task 6.4 — Mini sub status on creator public profile

**Files:**
- Modify: `src/pages/CreatorPublic.tsx` (locate the subscribe button)

- [ ] **Step 1: Show active sub state on creator profile**

When a logged-in fan views a creator who has fan subs enabled:
- If fan has active sub → show "✓ Subscribed — ends <date>" with a small "Manage" link to `/fan/subscriptions`
- Otherwise → show the "Subscribe for $X/mo" button

Query:
```ts
const { data: mySub } = await supabase.from('fan_creator_subscriptions')
  .select('id, status, period_end, cancel_at_period_end')
  .eq('fan_id', user.id)
  .eq('creator_profile_id', creatorProfile.id)
  .in('status', ['active', 'past_due'])
  .order('period_end', { ascending: false })
  .limit(1)
  .maybeSingle();
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/CreatorPublic.tsx
git commit -m "feat(creator): show subscription status on public profile"
```

---

## Phase 7 — Cleanup & Hardening (1 day)

### Task 7.1 — Remove legacy addon debit code

**Files:**
- Modify: `supabase/functions/ugp-membership-confirm/index.ts`

Once all legacy 11027 subs have naturally expired or been migrated (Task 4.9), we can fully remove `chargeProfileAddons` and its dependencies.

- [ ] **Step 1: Delete `chargeProfileAddons` and `addon_charges` references**

Delete the function definition (lines ~209-270) and remove the call site (`if (action === 'Rebill') await chargeProfileAddons(userId);`).

- [ ] **Step 2: Drop the `addon_charges` table (new migration 155)**

```sql
-- 155_drop_addon_charges.sql
drop table if exists addon_charges;
```

- [ ] **Step 3: Deploy + commit**

```bash
supabase db push --linked
supabase functions deploy ugp-membership-confirm --linked
git add supabase/migrations/155_drop_addon_charges.sql supabase/functions/ugp-membership-confirm/index.ts
git commit -m "chore(sub): drop legacy addon_charges + chargeProfileAddons"
```

---

### Task 7.2 — Remove legacy env vars

Once everything is migrated:

- [ ] **Step 1: Remove from Supabase + Vercel**

```bash
supabase secrets unset QUICKPAY_TOKEN QUICKPAY_SITE_ID QUICKPAY_SUB_PLAN_ID QUICKPAY_FAN_SUB_PLAN_ID UGP_MERCHANT_ID UGP_API_BEARER_TOKEN --linked
# Vercel: use dashboard or: vercel env rm <name> production preview development
```

- [ ] **Step 2: Remove from `payment-config.ts` + any code still referencing them**

```bash
grep -rn "QUICKPAY_SUB_PLAN_ID\|QUICKPAY_FAN_SUB_PLAN_ID\|PREMIUM_PRICE_CENTS" src/ supabase/
```

Clean each match.

- [ ] **Step 3: Commit**

```bash
git add src/lib/payment-config.ts supabase/functions/
git commit -m "chore: remove legacy QuickPay env vars"
```

---

### Task 7.3 — Integration tests for ugp-confirm

**Files:**
- Create: `supabase/functions/ugp-confirm/handler.test.ts`

A deferred want from the April 19 incident: confirm that our handler rejects `Verify` events and accepts only `Sale`/`Authorize`/`Recurring` per-type.

- [ ] **Step 1: Write a Deno test**

```ts
// supabase/functions/ugp-confirm/handler.test.ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

// We need to refactor index.ts to expose a pure handler function to test.
// Sketch: extract the body of serve() into an exported `handle(req: Request): Promise<Response>`
// and verify:
//   - POST with TransactionState=Verify + MerchantReference=link_<uuid> returns 200
//     AND does NOT credit the wallet (check via a mock supabase client)
//   - POST with TransactionState=Sale + MerchantReference=sub_monthly_<uuid> updates the profile
//   - POST with TransactionState=Recurring + MerchantReference=sub_monthly_<uuid> is a no-op

Deno.test('Verify on link_ is a no-op', async () => {
  // Mock Supabase client + call handle()
  // ...
  assertEquals(1, 1); // placeholder — task owner writes real assertions
});
```

*(Task owner: extract handler to `handler.ts`, mock `createClient`, assert expected DB writes.)*

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/ugp-confirm/handler.test.ts supabase/functions/ugp-confirm/handler.ts supabase/functions/ugp-confirm/index.ts
git commit -m "test(confirm): integration tests for state filtering"
```

---

### Task 7.4 — Admin monitoring dashboard for rebills

**Files:**
- Modify: `src/pages/AdminPayments.tsx` (or new `AdminRebills.tsx`)

Add a section: "Recent rebill attempts" — last 50 from `rebill_attempts`, grouped by status, with counts of `success` / `declined` / `card_expired` / `error` in the last 24h.

- [ ] **Step 1: Add the query + card**

```tsx
// Inside AdminPayments.tsx
const [stats, setStats] = useState<{ ok: number; fail: number; expired: number } | null>(null);

useEffect(() => {
  supabase.from('rebill_attempts')
    .select('status')
    .gte('created_at', new Date(Date.now() - 86400000).toISOString())
    .then(({ data }) => {
      const out = { ok: 0, fail: 0, expired: 0 };
      for (const r of data ?? []) {
        if (r.status === 'success') out.ok++;
        else if (r.status === 'card_expired') out.expired++;
        else out.fail++;
      }
      setStats(out);
    });
}, []);

// In render:
{stats && (
  <div className="mb-6 grid grid-cols-3 gap-3">
    <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Rebills 24h · OK</p><p className="text-xl font-bold text-green-400">{stats.ok}</p></div>
    <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Failed</p><p className="text-xl font-bold text-red-400">{stats.fail}</p></div>
    <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Card expired</p><p className="text-xl font-bold text-amber-400">{stats.expired}</p></div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/AdminPayments.tsx
git commit -m "feat(admin): 24h rebill stats"
```

---

### Task 7.5 — CLAUDE.md updates

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update architecture section**

Replace the "Flux de paiement" section with the new reality:
- 2 MIDs (US/CA 2D + International 3D), routed by fan country
- Creator subs: one-shot Sale at checkout, monthly/annual `/recurringtransactions` rebill cron
- Fan subs: same pattern, variable amount per creator, grandfathered
- Removed: `chargeProfileAddons`, `SubscriptionPlanId` usage, `QUICKPAY_FAN_SUB_PLAN_ID` env var

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for payment pipeline refonte"
```

---

## Execution Order & Dependencies

```
Phase 0 (schema + helpers)        ────────────────────────► can start now
Phase 2 (pricing refonte)         ────────────────────────► can start now (independent)
Phase 3 (pricing page + popup)    ──(needs Phase 2 numbers)► after Phase 2

Phase 1 (country + routing)       ──(needs Phase 0 + D2)───► after Derek provides 2D MID creds
Phase 4 (creator Pro refactor)    ──(needs Phase 0 + D1)───► after Derek confirms rebill on QuickPay TIDs
Phase 5 (creator Pro annual)      ──(extends Phase 4)──────► after Phase 4
Phase 6 (fan sub refactor)        ──(needs Phase 0)────────► can start in parallel with Phase 4

Phase 7 (cleanup)                 ──(last)─────────────────► after Phases 4 + 6
```

Realistic timeline if one engineer full-time: **8–10 working days** including testing. Many phases parallelizable with 2 engineers.

---

## Self-Review Notes

- Spec coverage: every item from the user's requirements maps to a task (country onboarding/pre-checkout, 2D/3D routing, reliable credit only on Sale, creator Free/Monthly/Annual with variable profiles charged on card, fan subs with fan-side cancel UI, pricing refonte 15%/0% + 15% fan fee, weekly Pro popup for Free creators, legacy 11027 migration).
- Placeholder scan: two explicit placeholders remain and are acceptable — the full ISO-3166 country list in `countryList.ts` (250 entries, task owner pastes) and the Deno test mock setup in Task 7.3 (sketch is clear enough). Both are bounded work, not "TBD architectural decisions".
- Type consistency: `UgMidKey = 'us_2d' | 'intl_3d'` used identically across frontend + edge functions; `subscription_plan_type` enum matches the `'free' | 'monthly' | 'annual'` string literals in code.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-payment-routing-subscriptions-refonte.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
