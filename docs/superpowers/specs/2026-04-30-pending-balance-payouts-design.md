# Pending Balance & Payout Proof — Design (2026-04-30)

## Context

Client request #2 from `docs/Demandes client - 2026-04-30.md` ("PAYOUT: Pending balance & payouts — 0,5 j"):

1. Display a **Pending balance** alongside the existing **Current balance** in the creator earnings tab, with a tooltip explaining the rolling 7-day system.
2. **3-week initial holding period** for new creator accounts (from account creation date).
3. After day 21, every new credit becomes withdrawable on a **rolling 7-day basis** (credit on day J → matures on J+7).
4. **Globally-set "Next platform payout date"** displayed to all creators (admin updates manually when triggering a batch).
5. When admin marks a payout as paid: optional **transfer date**, optional **proof upload** (PDF/image), optional **admin message**.
6. Creator sees the proof + date + message in their withdrawal history.

## Decisions taken in brainstorming

- Maturity per-credit: each credit row has its own `available_at` timestamp. Pending = sum of credits with `available_at > now()`.
- New-account rule: if creator's `auth.users.created_at` is < 21 days when a credit is written, `available_at = creator.created_at + 21 days`. Otherwise `available_at = transaction.created_at + 7 days`.
- Backfill: every pre-existing `wallet_transactions` row gets `available_at = created_at` so no funds are frozen at deploy.
- Refunds/chargebacks: reverse against the *same bucket* the parent credit currently sits in (pending if still pending, current if matured) — handled inside the RPC by reading the parent's `available_at`.
- Justificatif: **all fields optional** (paid date, proof file, admin message). Admin can confirm a payout with nothing extra.
- Proof storage: private Storage bucket `payout-proofs`. Path = `<creator_id>/<payout_id>.<ext>`. Signed URLs (5-minute TTL) generated on demand by an edge function.
- Email confirmation: yes, the `process-payout` "complete" branch already mails the creator — extended to include the paid date and a "Download proof" CTA.
- Min withdrawal stays at **$50** (unchanged from current behavior).

## Architecture

### Data model

**Migration `183_pending_balance_and_payout_proof.sql`** introduces:

1. `wallet_transactions.available_at TIMESTAMPTZ`
   - NULL for debits.
   - For credits: set automatically by the RPC (see below). Backfilled to `created_at` for all pre-existing rows.
   - Indexed: `(available_at)` partial WHERE `available_at IS NOT NULL` — used by the maturation cron.

2. `profiles.pending_balance_cents BIGINT NOT NULL DEFAULT 0`
   - Mirror of `wallet_balance_cents` for the un-matured slice.
   - Backfill: 0 (existing rows are all matured because of the backfill above).

3. `payouts.paid_at DATE NULL` — date admin actually wired the funds (manual entry).
4. `payouts.proof_path TEXT NULL` — Storage path of the proof file.
5. `payouts.admin_message TEXT NULL` — optional message from admin to creator.

6. `platform_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by UUID NULL)`.
   - One row used by this feature: `key = 'next_payout_date'`, `value = { "date": "2026-05-05" }`.
   - RLS: SELECT for `authenticated`, ALL only via service role (admin edge function).

### Storage bucket

- Bucket `payout-proofs`, **private**.
- Created via SQL: `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)`.
- 10 MB cap, MIME allow-list: `image/png`, `image/jpeg`, `image/webp`, `application/pdf`.
- RLS:
  - Admin (service role) can read/write everywhere.
  - Creator can only `SELECT` paths under their own `<creator_id>/` prefix (used by the signed-URL edge function).
  - No direct upload from creator (admin-only, via signed upload URL).

### RPC: `apply_wallet_transaction` (replaced)

The new version computes `available_at` for credits and routes the projection update to the right column.

```
if direction = 'credit' and owner_kind = 'creator':
  if account_age < 21 days:
    available_at = profile.created_at + 21 days
  else:
    available_at = now() + 7 days
  if available_at > now():
    bump pending_balance_cents
  else:
    bump wallet_balance_cents
  always bump total_earned_cents (lifetime gross)

if direction = 'credit' and owner_kind = 'chatter':
  no holding period — chatters see real-time earnings (chatter_earnings_cents)
  available_at = transaction.created_at  # already mature

if direction = 'debit' (refund/chargeback/payout_hold):
  available_at = NULL on the new row
  if parent_id is set and parent.available_at > now():
    decrement pending_balance_cents
  else:
    decrement wallet_balance_cents
```

Idempotency on `(owner_id, source_type, direction, source_transaction_id|source_id)` is preserved.

### RPC: `mature_wallet_transactions(p_now TIMESTAMPTZ DEFAULT now()) RETURNS TABLE(creator_id UUID, moved_cents BIGINT)`

- For every credit row where `available_at <= p_now` AND the row's owner still has a positive `pending_balance_cents`, the cron transfers from `pending` to `wallet`.
- Implementation: inner query computes per-creator sum-to-mature based on a "frontier marker" we track to avoid re-running on already-matured rows.
- **Frontier**: a single row in `platform_settings` with `key = 'maturity_frontier_at'` storing the timestamp up to which we've already matured. The cron only sums rows where `available_at > frontier AND available_at <= now()`.
- This makes the cron O(rows-since-last-run), idempotent within the same `p_now`.
- Atomic per-creator UPDATE under `FOR UPDATE` lock; returns one row per creator that moved.

### Edge functions

| Function | Auth | Purpose |
| --- | --- | --- |
| `mature-pending-balance` | Bearer = `RECONCILE_CRON_SECRET` (reused) | Calls `mature_wallet_transactions(now())`, logs counts. |
| `sign-payout-proof-upload` | Admin | Returns a Supabase signed upload URL targeting `<creator_id>/<payout_id>.<ext>` after validating the payout exists and belongs to that creator. |
| `get-payout-proof-url` | Auth (creator-self or admin) | Returns a 5-minute signed download URL for `payouts.proof_path`. |
| `process-payout` (extended) | Admin | Adds optional `paid_at`, `proof_path`, `admin_message` to the body; persists them on the payout; includes them in the confirmation email. |
| `update-platform-setting` | Admin | Upserts a row in `platform_settings` (only allow-listed keys: `next_payout_date`). |

### Vercel cron

Add to `vercel.json`:

```json
{ "path": "/api/cron/mature-pending-balance", "schedule": "30 8 * * *" }
```

`api/cron/mature-pending-balance.ts` mirrors the existing reconcile-payments handler.

### Frontend — admin

`src/pages/AdminPayments.tsx`:
- Replace the inline "Mark paid / Reject" buttons + admin-notes input with a single **Confirm payout dialog** opened by "Mark paid":
  - Date picker (defaults to today).
  - File picker (image/PDF, optional). Upload runs immediately via `sign-payout-proof-upload` so the path is ready when admin clicks "Confirm".
  - Textarea for `admin_message` (visible to creator).
  - On Confirm → calls `process-payout` with `{ payout_id, action: 'complete', paid_at, proof_path, admin_message }`.
- A small "Reject" button stays inline (no proof needed for rejections).
- Header gets a **"Next platform payout date"** input + "Save" button (calls `update-platform-setting`).

### Frontend — creator (`AppDashboard.tsx`)

Two changes inside the `payouts` tab + the wallet hero:

1. **Wallet hero** — split the single big "Available" number into a 2-column hero:
   - Left card: **Current balance** (= `wallet_balance_cents`, withdrawable).
   - Right card: **Pending balance** (= `pending_balance_cents`) with an info icon. Tooltip text:
     > *"Your balance is processed on a 7-day rolling basis. Earnings on day J become available for withdrawal on day J+7. New creators have a 21-day initial holding period from account creation."*
   - Line below: **"Next platform payout: May 5, 2026"** (from `platform_settings`).

2. **Withdrawal history** — each row gets:
   - Paid date (from `paid_at`, fallback to `processed_at`) when status is completed.
   - Admin message displayed inline if present.
   - "Download proof" button if `proof_path` is set → calls `get-payout-proof-url`, opens the signed URL in a new tab.

### CI guard

Extend `scripts/check-ledger-discipline.sh` to also forbid direct writes to `pending_balance_cents`:

```
"wallet_balance_cents\s*=|chatter_earnings_cents\s*=|total_earned_cents\s*=|pending_balance_cents\s*=|credit_creator_wallet\(|debit_creator_wallet\("
```

### Tests

- **Vitest unit (Postgres-side)** in `supabase/migrations/__tests__/` simulating credits at various maturities — cannot run against prod, so we add `pgTAP`-style assertions via a new test file.
- **Vitest mock test** for `process-payout` with proof_path + paid_at + admin_message.
- **Frontend**: smoke test that AppDashboard renders both cards and the tooltip.

### Edge cases

- **Refund of a pending credit** before maturity → debits pending. Verified by inspecting the parent row's `available_at`.
- **Refund of a credit that matured between credit and refund** → debits current. Same mechanism.
- **Withdrawal request mid-maturation** → `request-withdrawal` only reads `wallet_balance_cents`. Pending funds are unreachable until the cron moves them. ✓
- **Cron downtime for several days** → next run sweeps everything between `frontier` and `now()` in one pass. No data loss.
- **Backfill safety** → all existing `wallet_transactions.available_at = created_at`, so all credits are mature at deploy. `pending_balance_cents` initialises to 0 and `wallet_balance_cents` is unchanged. Production balances do not move.
- **Account creation timestamp**: read from `auth.users.created_at` via a SECURITY DEFINER function (already-used pattern: `apply_wallet_transaction` runs as definer).

## Out of scope

- Per-creator hold dates (only a global "next payout date" string).
- Auto-batching of payouts.
- Re-enabling chatter pending (chatters keep real-time earnings — confirmed by user; chatter_earnings_cents stays untouched).
- Migrating min-withdrawal threshold or any commission logic.

## Build sequence

1. Migration `183_pending_balance_and_payout_proof.sql`.
2. `_shared/ledger.ts` is a pass-through; no changes needed (RPC handles routing).
3. Edge functions: `mature-pending-balance`, `sign-payout-proof-upload`, `get-payout-proof-url`, `update-platform-setting`, plus update `process-payout`.
4. Vercel cron handler `api/cron/mature-pending-balance.ts` + `vercel.json` entry.
5. `AdminPayments.tsx` confirm dialog + next-payout-date editor.
6. `AppDashboard.tsx` two-card wallet hero + history with proof download.
7. CI script update.
8. Tests + `npm run test` + `npm run build`.
