# Account Deletion (RGPD soft-delete) + Public Profile Feed-Default

**Date**: 2026-04-27
**Author**: Claude (brainstormed with @tbdevpro)
**Status**: Approved design, ready for implementation plan
**Scope**: Two features bundled because the second (account deletion) impacts visibility filters everywhere — including the first (public profile rendering).

---

## 1. Problem statement

### 1.1 Public creator profile (`/:handle`)

- Default tab is currently `Links`. Most creators rely primarily on the Feed (paid content + fan subscription teaser); the Feed should be the entry point.
- The Links tab today aggregates two unrelated things: classic `links` rows and the `exclusive_content_*` block (text/link_id/url/image_url) on `creator_profiles`. When a creator has neither links nor an exclusive_content block, the Links tab still renders empty space — visually noisy and confusing.

### 1.2 Account deletion

Exclu has no self-service account deletion. The only existing path is `admin-delete-user` (hard delete, drops `auth.users` row + cascades + storage purge). Three problems:

1. **Users can't delete themselves** — only support intervention works. RGPD article 17 requires user-initiated deletion.
2. **Hard delete breaks financial traceability** — the wallet ledger (`wallet_transactions`), `sales`, `purchases`, `payouts`, `payment_events` all reference `auth.users(id)` via `creator_id` / `buyer_id` / `fan_id`. Deleting the row breaks the audit chain that French accounting law requires us to retain for 10 years.
3. **Stale dead code**: `FanDashboard.tsx:518` calls `supabase.functions.invoke('delete-fan-account', ...)` but no such edge function exists — the button silently fails.

We need a self-service, RGPD-compliant **soft delete** that:
- Hides the account from every surface (public, admin, directory, search, favorites, chat, suggested creators).
- Cancels active subscriptions (Pro + fan-side) using the standard "honor-then-end" pattern.
- Forfeits wallet balance (warned, not blocked) and revokes payout entitlement.
- Blocks re-signup with the same email + a clear English error message.
- Reserves the handle definitively.
- Keeps all financial/transactional data intact in the database (referential integrity preserved).
- Logs every deletion to an audit table.

---

## 2. Design — Public profile feed-default

### 2.1 Default tab logic

`CreatorPublic.tsx:122-128` currently does:

```ts
const initialTab = (() => {
  const t = new URLSearchParams(window.location.search).get('tab');
  if (t === 'content' || t === 'feed') return 'content';
  if (t === 'wishlist') return 'wishlist';
  return 'links';                                    // ← change this
})();
```

New behavior:
- If `?tab=` is set, honor it (back-compat for chat "View feed" CTA, fan sub-success redirect, etc.).
- Else **default to `'content'`** (Feed) for every creator.

### 2.2 Hide Links tab entirely when empty

`CreatorPublic.tsx:1175-1200` already conditionally renders each tab button. New rule:

The Links tab button shows IFF **either** of these is true:
- `links.length > 0` (classic links), OR
- The creator has any of: `exclusive_content_text`, `exclusive_content_link_id`, `exclusive_content_url`, `exclusive_content_image_url` (any non-null exclusive_content_* field on `creator_profiles`).

If neither is true:
- The Links tab button is not rendered.
- The whole tab strip collapses to just `Feed` (and optionally `Wishlist`) — and if even Feed is the only one, we hide the tab strip entirely (current behavior already handles single-tab).
- The `activeTab` initial value falls through to `'content'` regardless of any `?tab=links` URL hint (defensive: if someone bookmarks `?tab=links` after the creator removes their last link, we still render something sensible).

### 2.3 Implementation surface

- `src/pages/CreatorPublic.tsx`: tweak `initialTab`, add a derived `hasAnyLinks = links.length > 0 || hasExclusiveContent` boolean, gate the Links tab button on it, and add a guard inside the `useEffect` watching `activeTab` to fall back to `'content'` if `activeTab === 'links' && !hasAnyLinks`.
- `api/og-proxy.ts` (SSR for `/:handle`): no behavior change — OG tags are profile-level, not tab-level.
- No DB change.

### 2.4 Edge cases

- Creator removes their last link while a fan is on the Links tab in another tab — when the fan navigates back, the `useEffect` guard re-runs and switches them to Feed.
- Wishlist-only creators (no feed, no links): tab strip shows only Wishlist, default to Wishlist (keep current behavior for that case via the same fallback chain).
- SSR (og-proxy) doesn't render tabs, only meta — no change needed.

---

## 3. Design — Account deletion (soft-delete)

### 3.1 Data model

#### 3.1.1 New columns on `profiles`

```sql
alter table public.profiles
  add column deleted_at timestamptz,
  add column deleted_reason text check (deleted_reason in ('user_self_delete', 'admin_delete', 'compliance_delete')),
  add column deleted_actor_id uuid references auth.users(id);  -- who triggered the delete (admin or self)

create index idx_profiles_deleted_at_null on public.profiles (id) where deleted_at is null;
```

The partial index on `deleted_at IS NULL` is critical — every visibility query in the app will filter on this, and a partial index keeps the hot path narrow even as the deleted-row count grows.

#### 3.1.2 New columns on `creator_profiles`

```sql
alter table public.creator_profiles
  add column deleted_at timestamptz;

create index idx_creator_profiles_deleted_at_null on public.creator_profiles (id) where deleted_at is null;
create index idx_creator_profiles_username_deleted_at on public.creator_profiles (username, deleted_at);
```

The second index supports the handle reservation check (see §3.7).

#### 3.1.3 New table `account_deletion_audit`

```sql
create table public.account_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                   -- NOT a FK — must survive deletion of auth.users in the future
  email_at_deletion text not null,         -- snapshot, used for dispute lookups by email
  email_hash text not null,                -- sha256(lower(email)), used by re-signup blocker
  account_type text not null check (account_type in ('creator', 'fan', 'chatter')),
  reason text not null,
  actor_id uuid,                           -- self vs admin
  wallet_balance_forfeited_cents bigint not null default 0,
  fan_subs_canceled_count integer not null default 0,
  creator_profiles_deleted_count integer not null default 0,
  custom_requests_at_deletion jsonb,       -- snapshot for legal trail
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_account_deletion_audit_email_hash on public.account_deletion_audit (email_hash);
create index idx_account_deletion_audit_user_id on public.account_deletion_audit (user_id);
```

**Why snapshot the email + hash separately**: the hash is what we look up at re-signup time (constant-time, no PII leakage in indexes); the plaintext email lets support reverse-lookup deletion records by email when handling user disputes. Both are required.

**RLS**: `account_deletion_audit` is admin-only (no user-facing policy). Service-role writes from edge functions.

#### 3.1.4 New columns for subscription cancellation tracking

`fan_creator_subscriptions` (assumed table name based on §170_wallet_ledger.sql migration; verify exact name during plan):
```sql
alter table public.fan_creator_subscriptions
  add column cancel_reason text;  -- 'user_canceled' | 'creator_account_deleted' | 'fan_account_deleted'
```

`profiles` (Creator Pro fields, may already exist — verify):
```sql
alter table public.profiles
  add column creator_pro_canceled_at timestamptz,
  add column creator_pro_cancel_reason text;
```

The rebill cron (`rebill-subscriptions`) already skips rows where `cancel_at_period_end = true` per CLAUDE.md — we just need to ensure both tables are updated correctly. **Plan must verify exact column names and existing skip logic in the rebill cron before writing the migration.**

### 3.2 Auth blocking — preventing login of soft-deleted accounts

Two-lock approach (defense in depth):

#### 3.2.1 Lock 1: `auth.users.banned_until`

Supabase Auth respects `banned_until` natively — login attempts (password, magic link, OAuth) all fail when `banned_until > now()`. We set it to `'2099-12-31'::timestamptz` on soft-delete via the service-role admin API:

```ts
await supabase.auth.admin.updateUserById(user_id, {
  ban_duration: '876000h'  // ~100 years; Supabase accepts duration strings
});
```

#### 3.2.2 Lock 2: scrambled password

Belt-and-braces in case `banned_until` is ever cleared by mistake (or future Supabase changes):

```ts
await supabase.auth.admin.updateUserById(user_id, {
  password: crypto.randomUUID() + crypto.randomUUID()  // 72 chars random
});
```

This ensures even if the ban is removed, the original password no longer works and there's no recoverable secret.

### 3.3 Re-signup blocking — clear English error message

#### 3.3.1 Mechanism

Two enforcement points (defense in depth):

**Database trigger** (primary, fires regardless of which signup path is used):

```sql
create or replace function public.check_email_not_deleted()
returns trigger
language plpgsql
security definer
as $$
declare
  is_deleted boolean;
begin
  select exists(
    select 1
    from public.account_deletion_audit
    where email_hash = encode(digest(lower(new.email), 'sha256'), 'hex')
  ) into is_deleted;

  if is_deleted then
    raise exception 'EXCLU_DELETED_ACCOUNT' using hint = 'This account has been deleted. Please use another email address.';
  end if;

  return new;
end;
$$;

create trigger check_email_not_deleted_trigger
  before insert on auth.users
  for each row execute function public.check_email_not_deleted();
```

The `EXCLU_DELETED_ACCOUNT` sentinel is what the frontend matches on to display the user-facing message. Supabase surfaces the `hint` in the error response from `signUp()`.

**Frontend message normalization**: in `src/pages/Auth.tsx`, `src/pages/FanSignup.tsx`, `src/pages/ChatterAuth.tsx`, and any other signup entry point — catch the error from `supabase.auth.signUp(...)`, check for `'EXCLU_DELETED_ACCOUNT'` in the error message/hint, and display:

> **This account has already been deleted. You must use another email address.**

(Exact wording per user request.) For all other errors, fall through to existing handling.

#### 3.3.2 Why a trigger and not just an edge function check

- Closes the race window between "check email" and "create account" (a parallel signup with the same email could slip through a two-step check).
- Catches every signup path automatically: native Supabase Auth (email/password, magic link), OAuth providers (Google, etc.), admin-created users, future signup paths we haven't built yet.
- The trigger runs in the same transaction as the auth.users INSERT, so it's atomic.

### 3.4 Visibility filtering — every surface that lists or shows a user

This is the highest-risk part of the implementation. Missing one filter = ghost user appearing in admin, directory, or someone's chat. The plan must enumerate **every** query.

#### 3.4.1 Inventory of surfaces (must verify exhaustively in plan phase)

Database queries that need `where deleted_at is null` added (or the equivalent join filter):

**Frontend (React):**
- `src/pages/CreatorPublic.tsx` — `/:handle` route lookup. If `deleted_at IS NOT NULL`, return 404 / "This creator is no longer on Exclu" page.
- `src/pages/DirectoryCreators.tsx` — directory listing.
- `src/pages/DirectoryHub.tsx` — hub featured creators.
- `src/pages/FanDashboard.tsx` — favorites list, chat list, tips/requests history (history rows stay visible but the creator card shows "[Deleted user]" with a generic avatar).
- `src/pages/CreatorChat.tsx` — when listing past conversations with fans (no impact since fans deleting hides their identity, not the conversation).
- `src/components/feed/SuggestedCreatorsStrip.tsx`.
- `src/components/CreatorsCarousel.tsx`.
- Any `useQuery` hook in `src/hooks/` that fetches creator/profile lists — audit all.

**Edge functions:**
- `admin-get-users` — must filter (admin should not see deleted users by default; can add a separate "View deleted accounts" admin tool later if needed, out of scope here).
- `admin-get-user-overview` — return 404 for deleted users.
- `admin-impersonate-user` — refuse to impersonate deleted users.
- `admin-export-users-csv` — exclude deleted.
- All `create-*-checkout` functions — return error "Creator unavailable" if `deleted_at IS NOT NULL` on target.
- `guest-chat-init` / `guest-chat-send` — refuse to start a chat with a deleted creator.
- `send-chatter-invitation` — block if inviter or invitee is deleted.
- `increment-link-click` / `increment-profile-view` — silently no-op if deleted (so they don't error out for old indexed URLs).
- `og-proxy.ts`, `blog-ssr.ts`, `directory-ssr.ts`, `sitemap.ts`, `rss.ts` (Vercel serverless) — exclude deleted creators from sitemaps/RSS, return 404 og-proxy for deleted creator handles.

**SQL views / RLS policies:**
- Audit every `select` policy on profiles, creator_profiles, links, conversations, etc. Most policies don't need a change (data still belongs to the user, RLS still applies), but any policy that does cross-user reads (e.g., "fans can read creator profiles") must add `and deleted_at is null`.

#### 3.4.2 Defensive helper

Add a SQL helper used by RPCs and policies:

```sql
create or replace function public.is_user_active(user_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists(
    select 1 from public.profiles
    where id = user_id and deleted_at is null
  );
$$;
```

Used by checkout RPCs and other server-side gates.

#### 3.4.3 Frontend "[Deleted user]" placeholder

For surfaces that **must** still render (chat history, transaction history, fan's purchase records), show:
- Display name: `[Deleted user]`
- Avatar: generic gradient placeholder (no PII)
- Handle: not displayed (clickable link removed)
- "View profile" CTAs hidden

This applies to historical references — never to active discoverability surfaces.

### 3.5 Hard blocks — pre-deletion checks

Implemented in a single edge function `pre-delete-check` that returns a JSON payload describing the current state. The frontend renders the page based on this payload.

#### 3.5.1 Creator account hard blocks

```ts
type CreatorPreDeleteCheck = {
  can_delete: boolean;
  blocks: Array<{
    type: 'pending_custom_requests' | 'in_flight_payouts';
    count: number;
    items?: Array<{ id: string; description: string; amount_cents: number; created_at: string }>;
    cta_label: string;
    cta_url: string;
  }>;
  warnings: Array<{
    type: 'wallet_forfeit' | 'active_fan_subs' | 'creator_pro_active' | 'legal_retention';
    message: string;
    metadata?: Record<string, unknown>;
  }>;
};
```

**Blocks** (deletion refused until resolved):
1. **Pending custom requests** — `select count(*) from custom_requests where creator_id = $user and status in ('pending', 'accepted')`. CTA: "Resolve them" → `/app/chat` (or wherever requests are managed).
2. **In-flight payouts** — `select count(*) from payouts where creator_id = $user and status in ('requested', 'processing')`. CTA: "Wait for completion".

**Warnings** (informational, gated by a checkbox "I understand"):
- **Wallet > 0** — Show balance, message: "You have $X.XX in your wallet. Once your account is deleted, this balance is forfeited and cannot be recovered. To withdraw it, [request a payout](/app/earnings) first." Checkbox: "I understand my wallet balance will be forfeited."
- **Active fan subscriptions** — `select count(*) from fan_creator_subscriptions where creator_id in (your creator_profiles) and status = 'active' and cancel_at_period_end = false`. Message: "N fans are currently subscribed to your profile(s). Their subscriptions will be canceled. They keep access until the end of their current billing period (no refunds), and they will be notified by email."
- **Creator Pro active** — Message: "Your Pro subscription will be canceled. You retain Pro features until [period_end], but since your account will be deleted, this has no practical effect."
- **Legal retention** — Always shown: "Your transactional data (sales, payouts, tips) will be retained for 10 years per French accounting law. Your personal data (handle, bio, avatar, messages) will be hidden everywhere on Exclu immediately."

#### 3.5.2 Chatter hard blocks

- **Wallet > 0** → block (per user requirement: chatter wallet is commission earned, must payout first).
- **In-flight payouts** → block.

Warnings:
- "Your past conversations and chat messages are retained for legal compliance but you will appear as [Deleted user] to creators."
- "Your chatter invitations to current creators will be revoked."

#### 3.5.3 Fan hard blocks

None (fans don't have wallets in the receiving sense, they don't have payouts). Warnings only:
- **Active fan subscriptions** — "You have N active subscriptions. They will be canceled and you will not be charged again. You retain access until the end of each current billing period."
- "Your past purchases (downloaded content) are retained in your purchase history for legal compliance, but you will appear as [Deleted user] to creators."

### 3.6 Auto-cancel flows (during deletion, not blockers)

Triggered atomically inside the soft-delete edge function (single transaction where possible — see §3.10 for transaction boundaries):

#### 3.6.1 Fan-side subscriptions (creator deletion)

For each `creator_profile_id` belonging to the deleted creator account:
```sql
update public.fan_creator_subscriptions
set cancel_at_period_end = true,
    canceled_at = now(),
    cancel_reason = 'creator_account_deleted'
where creator_profile_id = $cp_id
  and status = 'active'
  and cancel_at_period_end = false;
```

Then enqueue an email batch via a new edge function `notify-fans-creator-deleted`:
- Input: `{ creator_profile_id, creator_display_name }`.
- Behavior: queries the affected fan list (with `period_end` for each fan), sends the email through the existing email infrastructure.
- **Rate limiting / batching**: if a popular creator deletes their account with thousands of fans, do this in batches of 50 with a small delay to avoid email provider throttling. Use the existing email queue if one exists; otherwise process synchronously in the deletion function with chunked sends.

Email content:
> Subject: Creator @{handle} has left Exclu
>
> The creator @{handle} you were subscribed to has deleted their account. Your subscription has been canceled and will not renew. You retain access until {period_end_human_date}. After that date, you will no longer have access to their content. No further charges will be made.

#### 3.6.2 Fan-side subscription (fan deletion)

```sql
update public.fan_creator_subscriptions
set cancel_at_period_end = true,
    canceled_at = now(),
    cancel_reason = 'fan_account_deleted'
where fan_id = $user
  and status = 'active'
  and cancel_at_period_end = false;
```

No email to creators (per user choice in §1 — privacy-respecting).

#### 3.6.3 Creator Pro

```sql
update public.profiles
set creator_pro_cancel_at_period_end = true,
    creator_pro_canceled_at = now(),
    creator_pro_cancel_reason = 'account_deleted'
where id = $user
  and creator_pro_cancel_at_period_end = false;
```

#### 3.6.4 Chatter invitations (creator deletion)

```sql
update public.chatter_invitations
set status = 'revoked', revoked_at = now()
where creator_id = $user
  and status in ('pending', 'accepted');

delete from public.agency_members
where agency_user_id = $user;
```

The chatters' personal accounts are not touched — they retain their wallet, can work for other creators.

#### 3.6.5 Referral commissions

```sql
update public.affiliates
set is_active = false, deactivated_at = now(), deactivation_reason = 'account_deleted'
where user_id = $user;
```

(Verify exact column names in `affiliates` table during plan phase — adjust as needed.)

Existing commissions already in the ledger remain untouched. Future referral attributions stop because the `affiliates` row is inactive; the existing referral attribution logic must be audited to ensure it filters on `is_active = true`.

#### 3.6.6 Soft-delete cascade for multi-profile creator accounts

For a creator account with N `creator_profiles`:
```sql
update public.creator_profiles
set deleted_at = now()
where user_id = $user;
```

This single query soft-deletes all creator_profiles owned by the deleted user. Fan subs, custom requests, links, etc., are filtered through `creator_profile_id` joins downstream — no need to soft-delete each individually.

#### 3.6.7 Fan favorites cleanup

```sql
delete from public.fan_favorites
where creator_id = $user;
```

Hard delete here is correct: fan_favorites is purely a "follow" relationship with no financial value, and removing it makes the deleted creator disappear from fans' "My Creators" lists immediately and naturally without needing visibility filters there.

### 3.7 Handle reservation

After soft-delete, the handle stays in `creator_profiles.username` with `deleted_at IS NOT NULL`. The signup / handle availability check (used in `CreateProfile.tsx`, possibly `Auth.tsx`, and any backend RPC like `check_handle_available`) must check **without** the `deleted_at IS NULL` filter — i.e., a handle owned by a deleted account is **not available**:

```sql
create or replace function public.is_handle_available(handle_to_check text)
returns boolean
language sql
stable
as $$
  select not exists(
    select 1 from public.creator_profiles
    where lower(username) = lower(handle_to_check)
    -- intentionally no `and deleted_at is null` — deleted handles stay reserved
  );
$$;
```

### 3.8 `/:handle` for deleted creators

Render a dedicated state (not a generic 404):
- Page title: "This creator is no longer on Exclu"
- Body: "The account you're looking for has been deleted. If you were a subscriber, your access ended on [period_end] and no further charges will be made."
- HTTP status: 410 Gone (more semantically correct than 404, helps SEO).

`og-proxy.ts` returns the same minimal OG tags pointing to the generic "creator not found" page.

### 3.9 UI — Delete account page (`B`: dedicated route)

#### 3.9.1 Routes

- `/app/settings/delete-account` — for creators (rendered inside AppShell under the Settings sidebar).
- `/app/chatter/settings/delete-account` — for chatters (or `/app/chatter/delete-account`; align with existing chatter UX).
- `/fan/settings/delete-account` — for fans.

All three routes are gated by their respective `ProtectedRoute` / `FanProtectedRoute` / chatter route guards.

#### 3.9.2 Page structure (creator variant)

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to Settings                                      │
│                                                         │
│ Delete your account                                     │
│ Permanent and irreversible. Read carefully.             │
│                                                         │
│ ┌─ Blocks (red, must resolve before continuing) ─────┐  │
│ │ ⚠ 3 pending custom requests                        │  │
│ │   Resolve each before deleting.                    │  │
│ │   [Go to my requests →]                            │  │
│ │                                                    │  │
│ │ ⚠ 1 payout in flight                               │  │
│ │   Wait until processing completes.                 │  │
│ └────────────────────────────────────────────────────┘  │
│                                                         │
│ ┌─ Warnings (yellow, must acknowledge) ──────────────┐  │
│ │ ☐ My wallet balance ($42.30) will be forfeited.    │  │
│ │   To withdraw it, request a payout first.          │  │
│ │   [Request payout →]                               │  │
│ │                                                    │  │
│ │ ☐ My 12 active fan subscribers will be notified    │  │
│ │   and their subscriptions canceled (no refunds).   │  │
│ │                                                    │  │
│ │ ☐ My Creator Pro subscription will be canceled.    │  │
│ │                                                    │  │
│ │ ☐ My handle @johndoe will be reserved permanently  │  │
│ │   and cannot be used by anyone, including me.      │  │
│ │                                                    │  │
│ │ ☐ I understand my data is retained 10 years for    │  │
│ │   legal compliance but hidden everywhere.          │  │
│ └────────────────────────────────────────────────────┘  │
│                                                         │
│ ┌─ Confirm ──────────────────────────────────────────┐  │
│ │ Type your handle to confirm: @____________         │  │
│ │                                                    │  │
│ │ [ Delete my account permanently ]                  │  │
│ │ [ Cancel ]                                         │  │
│ └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

- **Blocks section** only renders if there are blocks. CTA buttons deep-link to the resolution page.
- **Warnings section** only renders applicable warnings; each has a checkbox; the final delete button is disabled until **all** are checked.
- **Confirm section** requires typing the exact handle (creator) / email (fan & chatter, since they don't have handles). Final button enabled only when input matches.
- After click: optimistic loading state, then redirect to `/` with a toast: "Your account has been deleted. A confirmation email has been sent."

#### 3.9.3 Page structure (fan variant)

Same skeleton minus the creator-specific blocks and warnings. Just:
- Active subscriptions warning (if any).
- Legal retention warning.
- Type-email-to-confirm.

#### 3.9.4 Page structure (chatter variant)

Same skeleton with chatter-specific blocks (wallet, payouts) and warnings (invitation revocation).

#### 3.9.5 Settings entry points

- **Creator** (`src/pages/Profile.tsx` → Security tab): add a `Danger Zone` card at the bottom with a "Delete account" button → navigates to `/app/settings/delete-account`. Visual style: red/destructive border, separator above ("Account").
- **Fan** (`src/pages/FanDashboard.tsx`): replace existing broken delete UI in the settings tab with a button → navigates to `/fan/settings/delete-account`. Remove the inline delete confirm modal (`showDeleteConfirm` state + `handleDeleteAccount` function calling the non-existent `delete-fan-account` function).
- **Chatter** (`src/pages/ChatterDashboard.tsx`): the chatter dashboard currently has no Settings tab. Add a Settings icon button in the existing header (next to the LogOut button at line ~462) that navigates to `/app/chatter/delete-account`. Scope is intentionally minimal: just one "Delete account" page with a "← Back to dashboard" link. We don't build a full chatter Settings hub here.

### 3.10 Edge functions — design

#### 3.10.1 New function: `pre-delete-check`

- **Auth**: requires the requesting user's JWT, returns the check for the authenticated user only.
- **Input**: `{ }` (uses JWT user_id).
- **Output**: `CreatorPreDeleteCheck | FanPreDeleteCheck | ChatterPreDeleteCheck` (typed by the user's account type detected from `profiles`).
- **Side effects**: none (pure read).

#### 3.10.2 New function: `delete-account`

Single unified function (creator/fan/chatter). The account type is detected from `profiles` (`is_creator`, `is_chatter`, or default = fan).

- **Auth**: requires JWT.
- **Input**: `{ confirmation: string }` — must match the user's `creator_profiles.username` (creator) or `auth.users.email` (fan, chatter).
- **Behavior**:
  1. Re-run the pre-delete-check server-side; abort with 409 if any block is now present (race protection).
  2. Begin operations (see transaction boundaries below).
  3. Insert into `account_deletion_audit` (with snapshots: wallet balance, fan sub count, custom requests JSON snapshot).
  4. Update `profiles.deleted_at`, `deleted_reason='user_self_delete'`, `deleted_actor_id=user.id`.
  5. Update `creator_profiles.deleted_at` (cascade for multi-profile).
  6. Run the auto-cancel cascades (§3.6).
  7. Delete `fan_favorites` rows (§3.6.7).
  8. Update `auth.users` via admin API: `ban_duration` + `password = random()` (§3.2).
  9. Send confirmation email to the deleted user ("Your account has been deleted...").
  10. Trigger `notify-fans-creator-deleted` (background invocation if creator with subs).
  11. Return `{ success: true }`.
- **Error handling**: log all errors to a structured logger (Supabase function logs); on partial failure between auth update and DB updates, the audit row's `metadata` field captures which steps completed.

**Transaction boundaries**:
- Steps 3–7 (pure DB) run inside a single Postgres transaction via an RPC `soft_delete_account(user_id, reason, actor_id, confirmation_snapshot)` — atomic.
- Steps 8–10 (auth API + emails) run after the DB commits. If the auth update fails, the DB state is already correct (user is invisible) but the user can still log in until ban is applied. We retry the ban call up to 3 times; if all fail, page support via an alert email to `atexclu@gmail.com`. This is the only realistic failure mode and it's recoverable manually.

The RPC is preferred over doing it all in TS for atomicity. The edge function orchestrates the auth + email side, the RPC handles all DB mutations atomically.

#### 3.10.3 New function: `notify-fans-creator-deleted`

- **Auth**: service-role only (called by `delete-account`).
- **Input**: `{ creator_profile_id: string }`.
- **Behavior**: queries affected fan subs, sends batched emails.
- **Idempotency**: add column `creator_profiles.fans_notified_at_deletion timestamptz` (set when notification batch completes); the function returns early if it's already set. Per-fan duplicate-send protection via `fan_creator_subscriptions.deletion_email_sent_at` set per row as each batch processes.

#### 3.10.4 Existing function changes

- `admin-delete-user`: keep as-is for now (admin hard-delete is a separate tool, used for severe cases like CSAM, fraud, etc.). Mark with a comment that the standard self-service path is `delete-account`. Add a check: if the target is already soft-deleted, the admin hard-delete still works (purges everything including the audit row's email_hash).
- `admin-get-users`, `admin-get-user-overview`, `admin-impersonate-user`, `admin-export-users-csv`: add `where deleted_at is null` filters.
- All `create-*-checkout` functions: gate on `is_user_active(target_creator_id)`.
- `guest-chat-init`, `guest-chat-send`: gate on `is_user_active(creator_id)`.
- Webhook handlers (`ugp-listener`, `ugp-confirm`, `ugp-membership-confirm`, `verify-payment`): **do not gate on `deleted_at`** — these process callbacks for transactions initiated before deletion (or for refunds/chargebacks years later). The ledger is the source of truth and it's keyed by `user_id` regardless of deletion state. **Document this explicitly with code comments in each webhook handler** so future maintainers don't add a "is_user_active" check by mistake.

### 3.11 CGU / Terms update

`src/pages/Terms.tsx` requires a new section. Suggested location: a new clause near the existing "request account deletion" mention (line 208).

New clauses to add (English, since the rest of Terms.tsx is English):

> ### Account Deletion
>
> You may delete your account at any time from your account Settings. Account deletion is **immediate and irreversible**.
>
> **Pre-deletion requirements (Creators).** Before you can delete your account:
> - All pending custom requests must be resolved (accepted, declined, or expired).
> - All in-flight payouts must complete.
>
> **Wallet balance.** If you delete your account while your wallet contains funds, those funds are **permanently forfeited**. To withdraw your balance, request a payout before initiating account deletion.
>
> **Active fan subscriptions (Creators).** When you delete your account, all active fan subscriptions are canceled. Subscribers retain access until the end of their current billing period and are not charged again. They are notified by email.
>
> **Active subscriptions (Fans).** When you delete your account, all your active subscriptions to creators are canceled. You retain access until the end of each current billing period and are not charged again. No refunds are issued.
>
> **Creator Pro subscription.** Pro subscriptions are canceled upon deletion with no prorated refund.
>
> **Affiliate / referral commissions.** Future commissions stop accruing immediately upon account deletion. Commissions already credited to your wallet remain in the wallet (and are subject to the same forfeiture rule above if not withdrawn).
>
> **Handle reservation.** Your handle (`@yourname`) is permanently reserved upon deletion and cannot be reused by you or any other user.
>
> **Re-registration.** Once an account is deleted, the email address associated with it cannot be used to create a new Exclu account.
>
> **Data retention.** In compliance with French accounting law (Code de commerce, Article L. 123-22), transactional data (sales, payouts, tips, custom requests, invoices) is retained for ten (10) years following account deletion. Personal data (display name, biography, avatar, photos, conversations) is hidden from all Exclu surfaces immediately upon deletion. Data is not transmitted to third parties. To exercise your right to deletion of personal data beyond legal retention requirements (RGPD Article 17), contact privacy@exclu.at.
>
> **Administrative deletion.** Exclu reserves the right to delete accounts that violate these Terms. Administrative deletion follows the same data retention rules.

### 3.12 Email templates

Three new emails to add to the existing email infrastructure (likely under `supabase/functions/_shared/emails/` or wherever the existing send-auth-email templates live):

1. **`account-deleted-confirmation`** — sent to the deleting user immediately.
   - Subject: "Your Exclu account has been deleted"
   - Body: confirmation of deletion, mention of 10-year retention, support contact.
2. **`fan-creator-deleted`** — sent to each subscribed fan (creator deletion only).
   - Subject: "Creator @{handle} has left Exclu"
   - Body: cancellation notice, period_end date.
3. **`account-deletion-support-alert`** — sent to `atexclu@gmail.com` if any post-DB step (auth ban, emails) fails.
   - Subject: "[ACTION REQUIRED] Account deletion partial failure for user {id}"
   - Body: which steps succeeded/failed, manual remediation instructions.

### 3.13 Audit checklist for visibility filtering (for plan phase)

The implementation plan must include a step that runs a grep audit and lists every match for review:

```bash
# Surfaces that read profiles/creator_profiles and may need a deleted_at filter
grep -rn "from.*profiles\|from.*creator_profiles" src/ supabase/functions/ api/

# Surfaces that join creator_id / fan_id / chatter_id
grep -rn "creator_id\|fan_id\|chatter_id" src/ supabase/functions/ api/
```

Each match must be classified:
- **Filter required** (discoverability surface, e.g., directory, search, public profile).
- **Filter not required, render placeholder** (history surface, e.g., chat, transactions).
- **Filter not required, no UI exposure** (financial backend, e.g., webhooks, ledger).

The plan includes a checklist of every surface, classified.

---

## 4. Out of scope (explicitly)

- 30-day grace period / "Cancel deletion" undo (rejected by user).
- GDPR data export download button (rejected, only mention in CGU as "contact support").
- Editorial agencies on `/directory/agencies` (these are not user accounts, no deletion logic needed).
- A separate "Restore account" admin tool (out of scope; if a deleted user wants reactivation, they contact support, who manually resets `deleted_at = null`, clears `banned_until`, and resets password — undocumented operational procedure for now).
- Migrating the existing `admin-delete-user` to use soft-delete (it stays as the hard-delete escape hatch for fraud/CSAM cases).

---

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Missing one visibility filter, deleted user appears in some surface | Mandatory grep audit checklist in plan phase (§3.13), classified inventory. |
| Race: user deletes account while a `create-tip-checkout` is in flight | Webhook handlers process by user_id regardless of `deleted_at`, ledger remains authoritative. Tested explicitly. |
| Race: another user signs up with the same email between pre-check and INSERT | Trigger on `auth.users` BEFORE INSERT closes the window atomically (§3.3.1). |
| Email provider throttling on bulk fan notification for large creators | Batched sends with delay, idempotency flag on creator_profiles. |
| Auth ban API fails, user can still log in despite DB showing deleted | 3-retry logic, support alert email, manual remediation procedure documented in support runbook (out of scope spec, but noted). |
| Soft-deleted creator's signed-URL emails to fans still grant content access | Acceptable per design (transparent in CGU); URLs expire naturally. Not a regression — same behavior as a creator who deactivates without deleting. |
| Handle reservation grows unbounded as deleted accounts accumulate | Acceptable — handles are short strings, the `creator_profiles` table grows linearly with users either way. Indexed lookup remains fast. |

---

## 6. Implementation order (high-level — actual plan in writing-plans phase)

1. DB migration: `profiles.deleted_at`, `creator_profiles.deleted_at`, `account_deletion_audit`, RPC `soft_delete_account`, helper `is_user_active`, signup trigger `check_email_not_deleted`.
2. Edge functions: `pre-delete-check`, `delete-account`, `notify-fans-creator-deleted`, plus updates to existing admin / checkout / chat functions to filter `deleted_at`.
3. Frontend visibility filters: every query enumerated in §3.4.1 audit.
4. Frontend pages: 3 delete-account pages (creator, fan, chatter), Settings entry points, Auth.tsx error message handling.
5. Public profile feed-default + Links tab gating (§2).
6. Terms.tsx update (§3.11).
7. Email templates (§3.12).
8. Manual QA pass: full deletion flow per account type, re-signup attempt, admin views, public profile lookup, chat history rendering.

---

## 7. Files inventory (touch list — preliminary, plan will refine)

**New:**
- `supabase/migrations/178_account_deletion.sql` (or next available number)
- `supabase/functions/pre-delete-check/index.ts`
- `supabase/functions/delete-account/index.ts`
- `supabase/functions/notify-fans-creator-deleted/index.ts`
- `src/pages/DeleteAccount.tsx` (creator) — or split into 3 page files if cleaner
- `src/pages/FanDeleteAccount.tsx`
- `src/pages/ChatterDeleteAccount.tsx`
- (Possibly) `src/components/settings/DeleteAccountFlow.tsx` shared component
- 3 email templates

**Modified (preliminary):**
- `src/App.tsx` (add 3 routes)
- `src/pages/CreatorPublic.tsx` (feed-default, Links tab gating, deleted-creator state)
- `src/pages/Profile.tsx` (Danger Zone in Security tab)
- `src/pages/FanDashboard.tsx` (replace broken delete UI)
- `src/pages/ChatterDashboard.tsx` (Settings entry point)
- `src/pages/Auth.tsx`, `src/pages/FanSignup.tsx`, `src/pages/ChatterAuth.tsx` (signup error handling)
- `src/pages/Terms.tsx` (new clauses)
- All `supabase/functions/admin-*` (visibility filters)
- All `supabase/functions/create-*-checkout` (is_user_active gate)
- `supabase/functions/guest-chat-init`, `guest-chat-send`, `guest-chat-claim`
- `supabase/functions/increment-link-click`, `increment-profile-view`
- `api/og-proxy.ts`, `api/sitemap.ts`, `api/rss.ts`, `api/directory-ssr.ts`
- Various hooks in `src/hooks/`
- Various components in `src/components/feed/`, `src/components/CreatorsCarousel.tsx`

---

## 8. Open items for plan phase

- Verify exact column names on `fan_creator_subscriptions`, `affiliates`, `creator_pro_*` fields on profiles (some assumed, may differ).
- Verify exact email template infrastructure (where to add new templates, what library).
- Decide on shared component vs. 3 pages for the delete-account UI (ergonomics call after seeing the variant differences).
- Verify the rebill cron's exact skip logic on `cancel_at_period_end` to ensure we don't need additional flags.
- Inventory the full list of admin RPCs that may need filtering (beyond the 4 enumerated).
