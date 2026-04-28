# Account Deletion (RGPD soft-delete) + Public Profile Feed-Default — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship self-service RGPD-compliant soft-delete for creator/fan/chatter accounts (with cascading subscription cancellation, email notification, audit log, handle reservation, re-signup blocking), plus public-profile UX defaults to Feed and hides empty Links tab.

**Architecture:** Soft-delete adds `deleted_at` to `profiles` and `creator_profiles`, with a Postgres atomic RPC `soft_delete_account` doing all DB mutations and an edge-function orchestrator handling auth ban + email side. A `BEFORE INSERT` trigger on `auth.users` blocks re-signup with deleted email. Visibility filters (`deleted_at IS NULL`) added to every discoverability surface; historical surfaces render `[Deleted user]` placeholder. Webhooks intentionally bypass the filter to preserve ledger integrity.

**Tech Stack:** PostgreSQL (Supabase) + Deno edge functions + React 18 + Vercel serverless `api/`. Re-uses existing patterns: `_shared/` modules in edge functions, shadcn/ui components in front.

**Spec reference:** [docs/superpowers/specs/2026-04-27-account-deletion-and-public-profile-default.md](../specs/2026-04-27-account-deletion-and-public-profile-default.md)

**Pre-implementation verifications confirmed:**
- `fan_creator_subscriptions` columns: `cancelled_at` (UK spelling, double-l), `cancel_at_period_end`, `status IN ('pending','active','cancelled','expired','past_due')`. **No** `cancel_reason` column today — we add it.
- Creator Pro storage lives on **`creator_profiles`** (not `profiles`): `subscription_plan`, `subscription_ugp_transaction_id`, `subscription_mid`, `subscription_period_end`, `subscription_cancel_at_period_end`, `subscription_suspended_at`. **No** `subscription_cancel_reason` today — we add it.
- Account type lives on `profiles.role` (`'creator' | 'fan' | 'chatter' | 'agency'`); also `profiles.is_creator boolean`.
- Existing `handle_new_user()` is `AFTER INSERT` and swallows errors via `RAISE WARNING`. Our re-signup blocker must be `BEFORE INSERT` and `RAISE EXCEPTION` to actually block.
- `pgcrypto` is enabled (used by guest_chat migration 126).
- `fan_creator_subscriptions.fan_id` and `creator_user_id` reference `auth.users(id) ON DELETE CASCADE` — **safe** because soft-delete never touches `auth.users` rows.
- Last applied migration: `177_claim_guest_custom_requests_enriched.sql`. Next available: `178_*`.

---

## File Structure (decomposition)

**New SQL (migration `178_account_soft_delete.sql`):**
- Columns: `profiles.deleted_at|deleted_reason|deleted_actor_id`, `creator_profiles.deleted_at|fans_notified_at_deletion`, `fan_creator_subscriptions.cancel_reason|deletion_email_sent_at`, `creator_profiles.subscription_cancel_reason|subscription_canceled_at_deletion`.
- Table: `account_deletion_audit`.
- Functions: `is_user_active(uuid)`, `is_handle_available(text)`, `check_email_not_deleted()` (trigger fn), `soft_delete_account(uuid, text, uuid, text)` (the atomic RPC).
- Trigger: `check_email_not_deleted_trigger BEFORE INSERT ON auth.users`.
- Indexes: 3 partial indexes for fast `deleted_at IS NULL` filtering + handle reservation lookup + audit email_hash lookup.

**New edge functions:**
- `supabase/functions/pre-delete-check/index.ts` — read-only check, returns blocks + warnings.
- `supabase/functions/delete-account/index.ts` — orchestrator (calls RPC, applies auth ban, triggers emails).
- `supabase/functions/notify-fans-creator-deleted/index.ts` — batched fan notification.

**Modified edge functions** (visibility filtering or webhook hardening comment):
- `admin-get-users`, `admin-get-user-overview`, `admin-impersonate-user`, `admin-export-users-csv`, `admin-delete-user` (wipes audit row when hard-deleting).
- `create-link-checkout`, `create-tip-checkout`, `create-request-checkout`, `create-gift-checkout`, `create-creator-subscription`, `create-fan-subscription-checkout`.
- `guest-chat-init`, `guest-chat-send`, `guest-chat-claim`.
- `increment-link-click`, `increment-profile-view`.
- `ugp-listener`, `ugp-confirm`, `ugp-membership-confirm`, `verify-payment` (add comment: do **not** filter `deleted_at`).
- `manage-request` (capture path on request acceptance — must still work if creator soft-deletes after acceptance, but pre-delete-check blocks `accepted` so this is defensive).

**New email templates** (location TBD by Task 5 audit — likely `supabase/functions/_shared/emails/`):
- `account-deleted-confirmation.html`
- `fan-creator-deleted.html`
- `account-deletion-support-alert.html`

**New frontend:**
- `src/pages/DeleteAccountCreator.tsx`
- `src/pages/DeleteAccountFan.tsx`
- `src/pages/DeleteAccountChatter.tsx`
- `src/components/settings/DeleteAccountFlow.tsx` (shared block/warning/confirm UI)
- `src/lib/deletedAccountErrors.ts` (sentinel matcher for re-signup blocker error)

**Modified frontend (visibility filters + entry points + UX):**
- `src/App.tsx` (3 new routes).
- `src/pages/CreatorPublic.tsx` (feed-default, Links tab gating, deleted-creator state).
- `src/pages/Profile.tsx` (Danger Zone in Security tab).
- `src/pages/FanDashboard.tsx` (replace broken delete UI).
- `src/pages/ChatterDashboard.tsx` (Settings icon → delete page).
- `src/pages/Auth.tsx`, `src/pages/FanSignup.tsx`, `src/pages/ChatterAuth.tsx` (catch deletion sentinel).
- `src/pages/Terms.tsx` (new clauses).
- `src/pages/AdminUsers.tsx`, `src/pages/AdminUserOverview.tsx` (already filtered by edge fn but defensive UI).
- `src/pages/DirectoryCreators.tsx`, `src/pages/DirectoryHub.tsx`.
- `src/components/feed/SuggestedCreatorsStrip.tsx`, `src/components/CreatorsCarousel.tsx`.
- Various hooks & components reading creator lists (full inventory in Task 9).

**Modified Vercel `api/`:**
- `api/og-proxy.ts` — return 410 Gone for deleted creator handles.
- `api/sitemap.ts`, `api/rss.ts`, `api/directory-ssr.ts` — exclude deleted.
- `api/blog-ssr.ts` — exclude blog articles whose author is deleted (if applicable).

**Modified shared:**
- `src/lib/supabaseClient.ts` (no change, just used).
- Tests: `src/lib/deletedAccountErrors.test.ts` (new).

---

## Task 1: Database migration — soft-delete schema, audit table, RPC, re-signup trigger

**Files:**
- Create: `supabase/migrations/178_account_soft_delete.sql`

This is one large migration intentionally — every change is interdependent (RPC needs the columns, trigger needs the audit table). Splitting into multiple files would create ordering complexity for marginal benefit.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/178_account_soft_delete.sql`:

```sql
-- ============================================================================
-- Migration 178: Account Soft-Delete (RGPD)
-- ============================================================================
-- Adds:
--   - deleted_at columns on profiles + creator_profiles
--   - cancel_reason columns on fan_creator_subscriptions and creator_profiles
--     (Pro subscription cancellation reason)
--   - account_deletion_audit table (RGPD compliance + re-signup block)
--   - SQL helpers: is_user_active(uuid), is_handle_available(text)
--   - RPC soft_delete_account(uuid, text, uuid, text) — atomic deletion
--   - BEFORE INSERT trigger on auth.users to block re-signup with deleted email
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Soft-delete columns ──

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text,
  ADD COLUMN IF NOT EXISTS deleted_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_deleted_reason_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_deleted_reason_check
  CHECK (deleted_reason IS NULL OR deleted_reason IN ('user_self_delete', 'admin_delete', 'compliance_delete'));

ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS fans_notified_at_deletion timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_canceled_at_deletion timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_reason text;

ALTER TABLE public.fan_creator_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS deletion_email_sent_at timestamptz;

-- ── 2. Indexes ──

CREATE INDEX IF NOT EXISTS idx_profiles_active
  ON public.profiles (id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_creator_profiles_active
  ON public.creator_profiles (id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_creator_profiles_username_lower
  ON public.creator_profiles (LOWER(username));

-- ── 3. Audit table ──

CREATE TABLE IF NOT EXISTS public.account_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_at_deletion text NOT NULL,
  email_hash text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('creator', 'fan', 'chatter', 'agency')),
  reason text NOT NULL,
  actor_id uuid,
  wallet_balance_forfeited_cents bigint NOT NULL DEFAULT 0,
  fan_subs_canceled_count integer NOT NULL DEFAULT 0,
  creator_profiles_deleted_count integer NOT NULL DEFAULT 0,
  custom_requests_at_deletion jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_audit_email_hash
  ON public.account_deletion_audit (email_hash);

CREATE INDEX IF NOT EXISTS idx_account_deletion_audit_user_id
  ON public.account_deletion_audit (user_id);

ALTER TABLE public.account_deletion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_read_deletion_audit ON public.account_deletion_audit;
CREATE POLICY admin_read_deletion_audit
  ON public.account_deletion_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );
-- writes are service-role only (bypasses RLS)

COMMENT ON TABLE public.account_deletion_audit IS
  'RGPD-compliant soft-delete audit. email_hash is used by the auth.users BEFORE INSERT trigger to block re-signup. user_id is intentionally NOT a FK so the row survives any future hard-delete of auth.users.';

-- ── 4. SQL helpers ──

CREATE OR REPLACE FUNCTION public.is_user_active(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE id = check_user_id AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_active(uuid) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.is_handle_available(handle_to_check text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Intentionally does NOT filter deleted_at — deleted handles stay reserved permanently.
  SELECT NOT EXISTS(
    SELECT 1 FROM public.creator_profiles
    WHERE LOWER(username) = LOWER(handle_to_check)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_handle_available(text) TO authenticated, anon, service_role;

-- ── 5. Re-signup block: trigger on auth.users ──

CREATE OR REPLACE FUNCTION public.check_email_not_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email_hash text;
  v_is_deleted boolean;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;  -- defensive; Supabase always sets email but be safe
  END IF;

  v_email_hash := encode(digest(LOWER(NEW.email), 'sha256'), 'hex');

  SELECT EXISTS(
    SELECT 1 FROM public.account_deletion_audit
    WHERE email_hash = v_email_hash
  ) INTO v_is_deleted;

  IF v_is_deleted THEN
    RAISE EXCEPTION 'EXCLU_DELETED_ACCOUNT: This account has already been deleted. You must use another email address.'
      USING ERRCODE = 'P0001',
            HINT = 'EXCLU_DELETED_ACCOUNT';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_email_not_deleted_trigger ON auth.users;
CREATE TRIGGER check_email_not_deleted_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.check_email_not_deleted();

-- ── 6. The atomic RPC: soft_delete_account ──
-- Called by the delete-account edge function with the service role.
-- Performs ALL database mutations atomically; the edge function handles
-- the auth.users ban + emails AFTER this returns successfully.

CREATE OR REPLACE FUNCTION public.soft_delete_account(
  p_user_id uuid,
  p_reason text,
  p_actor_id uuid,
  p_email_snapshot text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_account_type text;
  v_email_hash text;
  v_wallet_balance bigint;
  v_fan_subs_canceled integer := 0;
  v_creator_profiles_deleted integer := 0;
  v_custom_requests_snapshot jsonb;
  v_audit_id uuid;
  v_pending_blocks integer;
BEGIN
  -- 1. Re-check blocks (race protection)
  SELECT count(*) INTO v_pending_blocks
  FROM public.custom_requests
  WHERE creator_id = p_user_id AND status IN ('pending', 'accepted');

  IF v_pending_blocks > 0 THEN
    RAISE EXCEPTION 'EXCLU_BLOCK_PENDING_REQUESTS: % pending custom requests', v_pending_blocks
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_pending_blocks
  FROM public.payouts
  WHERE creator_id = p_user_id AND status IN ('requested', 'processing');

  IF v_pending_blocks > 0 THEN
    RAISE EXCEPTION 'EXCLU_BLOCK_PAYOUTS_IN_FLIGHT: % payouts in flight', v_pending_blocks
      USING ERRCODE = 'P0001';
  END IF;

  -- For chatters, additional block: wallet > 0
  SELECT role INTO v_account_type FROM public.profiles WHERE id = p_user_id;

  IF v_account_type = 'chatter' THEN
    SELECT COALESCE(wallet_balance_cents, 0) INTO v_wallet_balance
    FROM public.profiles WHERE id = p_user_id;

    IF v_wallet_balance > 0 THEN
      RAISE EXCEPTION 'EXCLU_BLOCK_CHATTER_WALLET: chatter wallet has % cents', v_wallet_balance
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2. Snapshot wallet balance for audit (creators forfeit non-zero balance)
  SELECT COALESCE(wallet_balance_cents, 0) INTO v_wallet_balance
  FROM public.profiles WHERE id = p_user_id;

  -- 3. Snapshot custom requests at deletion for audit
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'status', status,
    'amount_cents', proposed_amount_cents,
    'created_at', created_at
  )), '[]'::jsonb) INTO v_custom_requests_snapshot
  FROM public.custom_requests
  WHERE creator_id = p_user_id OR fan_id = p_user_id;

  -- 4. Soft-delete profile
  UPDATE public.profiles
  SET deleted_at = now(),
      deleted_reason = p_reason,
      deleted_actor_id = p_actor_id
  WHERE id = p_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXCLU_NOT_FOUND_OR_ALREADY_DELETED' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Soft-delete all creator_profiles owned by this user (multi-profile cascade)
  UPDATE public.creator_profiles
  SET deleted_at = now()
  WHERE user_id = p_user_id AND deleted_at IS NULL;

  GET DIAGNOSTICS v_creator_profiles_deleted = ROW_COUNT;

  -- 6. Cancel active fan subscriptions where this user is the creator (honor-then-end)
  UPDATE public.fan_creator_subscriptions
  SET cancel_at_period_end = true,
      cancelled_at = now(),
      cancel_reason = 'creator_account_deleted'
  WHERE creator_user_id = p_user_id
    AND status = 'active'
    AND cancel_at_period_end = false;

  GET DIAGNOSTICS v_fan_subs_canceled = ROW_COUNT;

  -- 7. Cancel active fan subscriptions where this user is the fan
  UPDATE public.fan_creator_subscriptions
  SET cancel_at_period_end = true,
      cancelled_at = now(),
      cancel_reason = 'fan_account_deleted'
  WHERE fan_id = p_user_id
    AND status = 'active'
    AND cancel_at_period_end = false;

  -- 8. Cancel Creator Pro subscriptions (lives on creator_profiles)
  UPDATE public.creator_profiles
  SET subscription_cancel_at_period_end = true,
      subscription_canceled_at_deletion = now(),
      subscription_cancel_reason = 'account_deleted'
  WHERE user_id = p_user_id
    AND subscription_plan IS NOT NULL
    AND COALESCE(subscription_cancel_at_period_end, false) = false;

  -- 9. Revoke chatter invitations sent BY this user (creator side)
  UPDATE public.chatter_invitations
  SET status = 'revoked'
  WHERE inviter_user_id = p_user_id
    AND status IN ('pending', 'accepted');

  -- 9b. Revoke agency_members rows where this user is the agency owner
  DELETE FROM public.agency_members
  WHERE agency_user_id = p_user_id;

  -- 10. Deactivate referral / affiliate row
  UPDATE public.affiliates
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;

  -- 11. Hard-delete fan_favorites pointing to this user (so they vanish from fans' lists)
  DELETE FROM public.fan_favorites
  WHERE creator_id = p_user_id;

  -- 12. Hard-delete fan_favorites OWNED by this user (if they were a fan)
  DELETE FROM public.fan_favorites
  WHERE fan_id = p_user_id;

  -- 13. Insert audit row (THIS is what blocks re-signup via the trigger)
  v_email_hash := encode(digest(LOWER(p_email_snapshot), 'sha256'), 'hex');

  INSERT INTO public.account_deletion_audit (
    user_id, email_at_deletion, email_hash, account_type,
    reason, actor_id, wallet_balance_forfeited_cents,
    fan_subs_canceled_count, creator_profiles_deleted_count,
    custom_requests_at_deletion, metadata
  ) VALUES (
    p_user_id, p_email_snapshot, v_email_hash, v_account_type,
    p_reason, p_actor_id, v_wallet_balance,
    v_fan_subs_canceled, v_creator_profiles_deleted,
    v_custom_requests_snapshot, '{}'::jsonb
  )
  RETURNING id INTO v_audit_id;

  -- 14. Forfeit wallet (zero out, ledger remains intact for audit)
  -- We do NOT write a ledger entry here; the wallet is "frozen" at deletion time.
  -- The ledger sum will diverge from profiles.wallet_balance_cents = 0 after deletion;
  -- this is documented and the wallet_drift RPC must exclude deleted accounts.
  UPDATE public.profiles
  SET wallet_balance_cents = 0
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'audit_id', v_audit_id,
    'fan_subs_canceled', v_fan_subs_canceled,
    'creator_profiles_deleted', v_creator_profiles_deleted,
    'wallet_forfeited_cents', v_wallet_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_account(uuid, text, uuid, text) TO service_role;

-- ── 7. Update wallet_drift to exclude deleted accounts ──
-- (existing function from migration 172 — must not flag soft-deleted users as drift)

-- Check if find_wallet_drift exists and patch it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'find_wallet_drift'
  ) THEN
    -- Will be re-defined by the patch below
    NULL;
  END IF;
END $$;

-- Re-create find_wallet_drift to skip deleted accounts (idempotent — uses CREATE OR REPLACE)
-- IMPORTANT: if the original function signature differs, this CREATE OR REPLACE will fail and
-- the migration aborts cleanly; the operator must reconcile manually.
-- We do NOT re-create here because we don't know the exact signature; instead we add a comment
-- as a TODO for the reconcile cron and leave the code change in Task 6 step where the cron is patched.

COMMENT ON COLUMN public.profiles.deleted_at IS
  'Soft-delete timestamp. NULL = active. All discoverability surfaces must filter on deleted_at IS NULL. Webhooks (ugp-*) MUST NOT filter on this so historical callbacks remain processable.';
```

- [ ] **Step 2: Apply migration locally and verify**

```bash
supabase db reset
```

Expected: all migrations apply cleanly, including 178. No errors.

Then run:

```bash
supabase db diff --schema public
```

Expected: empty diff (schema matches migrations).

- [ ] **Step 3: Smoke-test the trigger and helpers via psql**

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT public.is_user_active('00000000-0000-0000-0000-000000000000'::uuid);
  SELECT public.is_handle_available('zzz_unused_handle_zzz');
"
```

Expected: `false` and `true`.

- [ ] **Step 4: Smoke-test the re-signup block**

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "
  INSERT INTO public.account_deletion_audit (user_id, email_at_deletion, email_hash, account_type, reason)
  VALUES ('11111111-1111-1111-1111-111111111111', 'blocked@test.com', encode(digest('blocked@test.com', 'sha256'), 'hex'), 'fan', 'user_self_delete');
"
```

Then attempt to insert a user with this email through Supabase Auth admin (via the local dashboard or curl) and confirm the error message includes `EXCLU_DELETED_ACCOUNT`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/178_account_soft_delete.sql
git commit -m "feat(db): account soft-delete schema, audit table, RPC, re-signup trigger"
```

---

## Task 2: Edge function `pre-delete-check`

**Files:**
- Create: `supabase/functions/pre-delete-check/index.ts`
- Modify: `supabase/config.toml` (add `verify_jwt = false` block for the new function)

- [ ] **Step 1: Add config entry**

Append to `supabase/config.toml`:

```toml
[functions.pre-delete-check]
verify_jwt = false
```

(All Exclu functions use `verify_jwt = false` per CLAUDE.md and verify auth manually.)

- [ ] **Step 2: Write the function**

Create `supabase/functions/pre-delete-check/index.ts`:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Block = {
  type: 'pending_custom_requests' | 'in_flight_payouts' | 'chatter_wallet_nonzero';
  count?: number;
  amount_cents?: number;
  cta_label: string;
  cta_url: string;
  message: string;
};

type Warning = {
  type: 'wallet_forfeit' | 'active_fan_subs' | 'creator_pro_active' | 'legal_retention' | 'fan_active_subs' | 'handle_reservation';
  message: string;
  metadata?: Record<string, unknown>;
};

type CheckResult = {
  account_type: 'creator' | 'fan' | 'chatter' | 'agency';
  email: string;
  handle: string | null;
  can_delete: boolean;
  blocks: Block[];
  warnings: Warning[];
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('VITE_SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!;

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const svc = createClient(supabaseUrl, supabaseServiceKey);

    // Profile + role
    const { data: profile } = await svc.from('profiles')
      .select('role, wallet_balance_cents, deleted_at')
      .eq('id', user.id).single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (profile.deleted_at) {
      return new Response(JSON.stringify({ error: 'Account already deleted' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const accountType = profile.role as CheckResult['account_type'];
    const blocks: Block[] = [];
    const warnings: Warning[] = [];

    // Get primary handle (for type-to-confirm)
    const { data: cp } = await svc.from('creator_profiles')
      .select('username').eq('user_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle();
    const handle = cp?.username ?? null;

    if (accountType === 'creator' || accountType === 'agency') {
      // Block 1: pending custom requests
      const { count: pendingReqs } = await svc.from('custom_requests')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .in('status', ['pending', 'accepted']);
      if ((pendingReqs ?? 0) > 0) {
        blocks.push({
          type: 'pending_custom_requests',
          count: pendingReqs!,
          cta_label: 'Manage requests',
          cta_url: '/app/chat',
          message: `You have ${pendingReqs} pending or accepted custom request${pendingReqs! > 1 ? 's' : ''}. Resolve each (decline pending, deliver accepted) before deleting your account.`,
        });
      }

      // Block 2: in-flight payouts
      const { count: payoutsInFlight } = await svc.from('payouts')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .in('status', ['requested', 'processing']);
      if ((payoutsInFlight ?? 0) > 0) {
        blocks.push({
          type: 'in_flight_payouts',
          count: payoutsInFlight!,
          cta_label: 'View earnings',
          cta_url: '/app/earnings',
          message: `${payoutsInFlight} payout${payoutsInFlight! > 1 ? 's are' : ' is'} currently being processed. Wait until completion before deleting.`,
        });
      }

      // Warning: wallet > 0
      const wallet = profile.wallet_balance_cents ?? 0;
      if (wallet > 0) {
        warnings.push({
          type: 'wallet_forfeit',
          message: `Your wallet balance ($${(wallet / 100).toFixed(2)}) will be permanently forfeited. To withdraw it, request a payout first.`,
          metadata: { wallet_cents: wallet },
        });
      }

      // Warning: active fan subs (count across all creator_profiles owned by user)
      const { data: profiles } = await svc.from('creator_profiles')
        .select('id').eq('user_id', user.id);
      const cpIds = (profiles ?? []).map((p) => p.id);
      let activeFanSubs = 0;
      if (cpIds.length > 0) {
        const { count } = await svc.from('fan_creator_subscriptions')
          .select('id', { count: 'exact', head: true })
          .in('creator_profile_id', cpIds)
          .eq('status', 'active')
          .eq('cancel_at_period_end', false);
        activeFanSubs = count ?? 0;
      }
      if (activeFanSubs > 0) {
        warnings.push({
          type: 'active_fan_subs',
          message: `${activeFanSubs} fan${activeFanSubs > 1 ? 's are' : ' is'} currently subscribed. Their subscriptions will be canceled (no more rebills); they keep access until the end of their current billing period and will be notified by email.`,
          metadata: { count: activeFanSubs },
        });
      }

      // Warning: Creator Pro
      const { data: pro } = await svc.from('creator_profiles')
        .select('subscription_plan')
        .eq('user_id', user.id)
        .not('subscription_plan', 'is', null)
        .limit(1).maybeSingle();
      if (pro) {
        warnings.push({
          type: 'creator_pro_active',
          message: 'Your Creator Pro subscription will be canceled. No prorated refund is issued.',
        });
      }

      warnings.push({
        type: 'handle_reservation',
        message: handle
          ? `Your handle @${handle} will be permanently reserved and cannot be used by anyone, including you.`
          : 'Your handle will be permanently reserved.',
      });
    }

    if (accountType === 'chatter') {
      const wallet = profile.wallet_balance_cents ?? 0;
      if (wallet > 0) {
        blocks.push({
          type: 'chatter_wallet_nonzero',
          amount_cents: wallet,
          cta_label: 'Request payout',
          cta_url: '/app/chatter',
          message: `Your wallet contains $${(wallet / 100).toFixed(2)} in earned commissions. You must withdraw it via a payout request before deleting your account.`,
        });
      }

      const { count: payoutsInFlight } = await svc.from('payouts')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', user.id) // chatters use the same payouts table, keyed on their user_id
        .in('status', ['requested', 'processing']);
      if ((payoutsInFlight ?? 0) > 0) {
        blocks.push({
          type: 'in_flight_payouts',
          count: payoutsInFlight!,
          cta_label: 'View payouts',
          cta_url: '/app/chatter',
          message: `${payoutsInFlight} payout${payoutsInFlight! > 1 ? 's are' : ' is'} in flight. Wait for completion.`,
        });
      }
    }

    if (accountType === 'fan') {
      const { count: activeSubs } = await svc.from('fan_creator_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('fan_id', user.id)
        .eq('status', 'active')
        .eq('cancel_at_period_end', false);
      if ((activeSubs ?? 0) > 0) {
        warnings.push({
          type: 'fan_active_subs',
          message: `You have ${activeSubs} active subscription${activeSubs! > 1 ? 's' : ''}. They will be canceled (no more rebills). You retain access until the end of each current billing period and no refunds are issued.`,
          metadata: { count: activeSubs },
        });
      }
    }

    // Always show legal retention warning
    warnings.push({
      type: 'legal_retention',
      message: 'Transactional data (sales, payouts, tips) is retained for 10 years per French accounting law. Personal data (display name, bio, avatar, conversations) is hidden everywhere on Exclu immediately upon deletion.',
    });

    const result: CheckResult = {
      account_type: accountType,
      email: user.email!,
      handle,
      can_delete: blocks.length === 0,
      blocks,
      warnings,
    };

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('[pre-delete-check]', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
```

- [ ] **Step 3: Deploy and smoke-test**

```bash
supabase functions deploy pre-delete-check
```

Then test with a real user JWT (use a test account):

```bash
curl -X POST "$VITE_SUPABASE_URL/functions/v1/pre-delete-check" \
  -H "Authorization: Bearer $TEST_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: JSON response with `account_type`, `can_delete`, `blocks`, `warnings`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/pre-delete-check/ supabase/config.toml
git commit -m "feat(edge): pre-delete-check returns blocks and warnings before account deletion"
```

---

## Task 3: Edge function `delete-account` (orchestrator)

**Files:**
- Create: `supabase/functions/delete-account/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Add config entry**

Append:

```toml
[functions.delete-account]
verify_jwt = false
```

- [ ] **Step 2: Write the function**

Create `supabase/functions/delete-account/index.ts`:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPPORT_EMAIL = 'atexclu@gmail.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('VITE_SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!;

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt);
    if (authErr || !user || !user.email) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json().catch(() => ({}));
    const confirmation: string = (body.confirmation ?? '').trim();
    if (!confirmation) {
      return new Response(JSON.stringify({ error: 'Missing confirmation' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const svc = createClient(supabaseUrl, supabaseServiceKey);

    // Verify confirmation matches handle (creator) OR email (fan/chatter)
    const { data: profile } = await svc.from('profiles')
      .select('role').eq('id', user.id).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let confirmationValid = false;
    if (profile.role === 'creator' || profile.role === 'agency') {
      const { data: cp } = await svc.from('creator_profiles')
        .select('username').eq('user_id', user.id)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      const handle = cp?.username ?? null;
      confirmationValid = !!handle && confirmation.replace(/^@/, '').toLowerCase() === handle.toLowerCase();
    } else {
      confirmationValid = confirmation.toLowerCase() === user.email.toLowerCase();
    }

    if (!confirmationValid) {
      return new Response(JSON.stringify({ error: 'Confirmation does not match' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Call the atomic RPC
    const { data: rpcResult, error: rpcErr } = await svc.rpc('soft_delete_account', {
      p_user_id: user.id,
      p_reason: 'user_self_delete',
      p_actor_id: user.id,
      p_email_snapshot: user.email,
    });

    if (rpcErr) {
      const msg = rpcErr.message ?? '';
      // Map known sentinels to 409 Conflict so the frontend re-fetches pre-delete-check
      if (msg.includes('EXCLU_BLOCK_') || msg.includes('EXCLU_NOT_FOUND')) {
        return new Response(JSON.stringify({ error: msg }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.error('[delete-account] RPC error', rpcErr);
      return new Response(JSON.stringify({ error: 'Internal error during deletion' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // RPC succeeded — DB is in deleted state. Now apply auth ban + emails.
    // These are best-effort with retry; if they fail, we alert support but do
    // NOT roll back the DB (better to have a deleted-in-DB user with auth still
    // partially active than a half-deleted state).

    let banApplied = false;
    let banLastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { error: banErr } = await svc.auth.admin.updateUserById(user.id, {
          ban_duration: '876000h',
          password: crypto.randomUUID() + crypto.randomUUID(),
        });
        if (!banErr) {
          banApplied = true;
          break;
        }
        banLastError = banErr;
      } catch (e) {
        banLastError = e;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }

    // Fire-and-forget: confirmation email to user
    try {
      await svc.functions.invoke('send-account-deleted-email', {
        body: { user_id: user.id, email: user.email, account_type: profile.role },
      });
    } catch (e) {
      console.warn('[delete-account] confirmation email enqueue failed', e);
    }

    // Fire-and-forget: notify-fans-creator-deleted (one call per affected creator_profile)
    if (profile.role === 'creator' || profile.role === 'agency') {
      try {
        await svc.functions.invoke('notify-fans-creator-deleted', {
          body: { user_id: user.id },
        });
      } catch (e) {
        console.warn('[delete-account] notify-fans enqueue failed', e);
      }
    }

    // Support alert if ban failed
    if (!banApplied) {
      console.error('[delete-account] BAN FAILED for user', user.id, banLastError);
      try {
        await svc.functions.invoke('send-account-deleted-email', {
          body: {
            email: SUPPORT_EMAIL,
            template: 'support_alert',
            metadata: { user_id: user.id, ban_error: String(banLastError) },
          },
        });
      } catch {
        // last-resort: just log
      }
    }

    return new Response(JSON.stringify({ success: true, ...rpcResult }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('[delete-account]', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
```

- [ ] **Step 3: Deploy**

```bash
supabase functions deploy delete-account
```

- [ ] **Step 4: End-to-end smoke-test on local Supabase**

Create a test fan user via the local dashboard, get their JWT, then:

```bash
# 1. Pre-check should return can_delete: true with no blocks for a fresh fan
curl -X POST "http://127.0.0.1:54321/functions/v1/pre-delete-check" \
  -H "Authorization: Bearer $TEST_FAN_JWT" -d '{}'

# 2. Delete with email confirmation
curl -X POST "http://127.0.0.1:54321/functions/v1/delete-account" \
  -H "Authorization: Bearer $TEST_FAN_JWT" -H "Content-Type: application/json" \
  -d '{"confirmation": "fan@test.com"}'

# 3. Verify profile.deleted_at is set
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT id, deleted_at, deleted_reason FROM profiles WHERE id = '$TEST_FAN_USER_ID';
  SELECT * FROM account_deletion_audit ORDER BY created_at DESC LIMIT 1;
"

# 4. Try to re-signup with same email — should fail with EXCLU_DELETED_ACCOUNT
```

Expected: deletion succeeds, audit row inserted, re-signup blocked.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/delete-account/ supabase/config.toml
git commit -m "feat(edge): delete-account orchestrator (RPC + auth ban + email enqueue)"
```

---

## Task 4: Edge function `notify-fans-creator-deleted`

**Files:**
- Create: `supabase/functions/notify-fans-creator-deleted/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Inventory existing email infrastructure**

Run:

```bash
ls supabase/functions/_shared/ 2>/dev/null
grep -rn "sendgrid\|resend\|smtp\|mailgun\|nodemailer\|fetch.*sendgrid\|fetch.*resend" supabase/functions/_shared/ supabase/functions/send-* 2>/dev/null | head -20
```

Identify which email provider is used (Resend, SendGrid, etc.) and whether there's a `_shared/email.ts` helper. Document the finding inline in this task. The notify function must reuse the existing helper, **not** introduce a new email library.

- [ ] **Step 2: Add config entry**

```toml
[functions.notify-fans-creator-deleted]
verify_jwt = false
```

- [ ] **Step 3: Write the function**

Create `supabase/functions/notify-fans-creator-deleted/index.ts`:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
// Adapt this import to whatever Task 4 Step 1 found (e.g., _shared/email.ts)
// import { sendEmail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 250;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')!;

  try {
    const body = await req.json();
    const userId: string = body.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const svc = createClient(supabaseUrl, supabaseServiceKey);

    // Get all creator_profiles owned by this deleted user (the cascade soft-deleted them)
    const { data: cps } = await svc.from('creator_profiles')
      .select('id, username, display_name, fans_notified_at_deletion')
      .eq('user_id', userId);

    if (!cps || cps.length === 0) {
      return new Response(JSON.stringify({ success: true, profiles_processed: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let totalEmailsSent = 0;

    for (const cp of cps) {
      // Idempotency: skip if already notified
      if (cp.fans_notified_at_deletion) {
        console.log(`[notify-fans] skipping cp ${cp.id} — already notified`);
        continue;
      }

      // Fetch fans whose subscription was just canceled at deletion (cancel_reason = 'creator_account_deleted')
      // and who haven't received the email yet
      const { data: subs } = await svc.from('fan_creator_subscriptions')
        .select('id, fan_id, period_end, deletion_email_sent_at')
        .eq('creator_profile_id', cp.id)
        .eq('cancel_reason', 'creator_account_deleted')
        .is('deletion_email_sent_at', null);

      if (!subs || subs.length === 0) {
        await svc.from('creator_profiles')
          .update({ fans_notified_at_deletion: new Date().toISOString() })
          .eq('id', cp.id);
        continue;
      }

      // Resolve fan emails
      const fanIds = subs.map((s) => s.fan_id);
      const { data: fanUsers } = await svc.auth.admin.listUsers({ perPage: 1000 });
      const emailById = new Map(
        (fanUsers?.users ?? []).filter((u) => fanIds.includes(u.id)).map((u) => [u.id, u.email])
      );

      // Batch send
      for (let i = 0; i < subs.length; i += BATCH_SIZE) {
        const batch = subs.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(batch.map(async (sub) => {
          const email = emailById.get(sub.fan_id);
          if (!email) return;
          const periodEnd = sub.period_end ? new Date(sub.period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'the end of your current billing period';
          // ADAPT this call to the actual email helper found in Step 1
          // await sendEmail({
          //   to: email,
          //   subject: `Creator @${cp.username} has left Exclu`,
          //   html: renderFanCreatorDeletedTemplate({ creatorHandle: cp.username, periodEnd }),
          // });
          // Mark as sent
          await svc.from('fan_creator_subscriptions')
            .update({ deletion_email_sent_at: new Date().toISOString() })
            .eq('id', sub.id);
          totalEmailsSent++;
        }));
        if (i + BATCH_SIZE < subs.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      await svc.from('creator_profiles')
        .update({ fans_notified_at_deletion: new Date().toISOString() })
        .eq('id', cp.id);
    }

    return new Response(JSON.stringify({ success: true, emails_sent: totalEmailsSent, profiles_processed: cps.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('[notify-fans-creator-deleted]', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
```

- [ ] **Step 4: Adapt to actual email helper**

Once Step 1 found the email helper, replace the `// ADAPT this call` comment block with the real call. The HTML template content is defined in Task 5.

- [ ] **Step 5: Deploy and smoke-test**

```bash
supabase functions deploy notify-fans-creator-deleted
```

Test by manually inserting a fake `fan_creator_subscriptions` row with `cancel_reason = 'creator_account_deleted'` and invoking the function with the corresponding `user_id`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/notify-fans-creator-deleted/ supabase/config.toml
git commit -m "feat(edge): notify-fans-creator-deleted batched fan notification with idempotency"
```

---

## Task 5: Email templates + send-account-deleted-email function

**Files:**
- Create: `supabase/functions/send-account-deleted-email/index.ts`
- Modify: `supabase/config.toml`
- Inventory: existing email templates location (likely `supabase/functions/_shared/emails/` or inline)

- [ ] **Step 1: Locate existing email infrastructure**

```bash
find supabase/functions -name "*.ts" | xargs grep -l "subject:\|html:\|sendEmail\|sendgrid\|resend" 2>/dev/null | head -10
```

Document the existing pattern (file path, helper function, template format) inline before continuing.

- [ ] **Step 2: Add three template constants**

Pattern based on what Step 1 found. Templates as inline TypeScript constants for now (matches existing pattern in most send-*-email functions in this codebase):

```ts
export const ACCOUNT_DELETED_CONFIRMATION = ({ accountType }: { accountType: string }) => ({
  subject: 'Your Exclu account has been deleted',
  html: `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h2>Your Exclu account has been deleted</h2>
      <p>Your account has been permanently deleted from Exclu. You will no longer be able to log in.</p>
      <p><strong>What happens next:</strong></p>
      <ul>
        <li>Your profile is hidden from all surfaces immediately.</li>
        <li>Your handle is permanently reserved and cannot be reused.</li>
        <li>You cannot create a new account with the same email address.</li>
        <li>Active subscriptions (if any) have been canceled with no refunds for the current period.</li>
      </ul>
      <p><strong>Data retention:</strong> Per French accounting law, your transactional data (invoices, sales, payouts) is retained for 10 years. Personal data (display name, bio, avatar, conversations) is hidden everywhere on Exclu immediately.</p>
      <p>If this was a mistake or you have questions, contact <a href="mailto:atexclu@gmail.com">atexclu@gmail.com</a>.</p>
      <p>Thanks for being part of Exclu.</p>
    </div>
  `,
});

export const FAN_CREATOR_DELETED = ({ creatorHandle, periodEnd }: { creatorHandle: string; periodEnd: string }) => ({
  subject: `Creator @${creatorHandle} has left Exclu`,
  html: `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h2>Creator @${creatorHandle} has left Exclu</h2>
      <p>The creator <strong>@${creatorHandle}</strong> you were subscribed to has deleted their Exclu account.</p>
      <p><strong>Your subscription has been canceled and will not renew.</strong></p>
      <p>You retain access to their content until <strong>${periodEnd}</strong>. After that date, you will no longer have access. No further charges will be made.</p>
      <p>Want to support other creators? <a href="https://exclu.at/directory/creators">Discover more on Exclu</a>.</p>
    </div>
  `,
});

export const ACCOUNT_DELETION_SUPPORT_ALERT = ({ userId, error }: { userId: string; error: string }) => ({
  subject: '[ACTION REQUIRED] Account deletion partial failure',
  html: `
    <div style="font-family: monospace; max-width: 800px; padding: 24px;">
      <h2>Account deletion: auth ban failed</h2>
      <p>The DB-side soft-delete completed for <code>user_id = ${userId}</code>, but applying the auth ban failed after 3 retries.</p>
      <p><strong>Error:</strong> <code>${error}</code></p>
      <p><strong>Manual remediation:</strong></p>
      <ol>
        <li>Open the Supabase dashboard → Authentication → Users.</li>
        <li>Find the user by <code>user_id</code>.</li>
        <li>Set Ban Duration to "100 years" and reset password to a random string.</li>
      </ol>
      <p>The user is already invisible in the app (DB shows deleted_at) but can still technically log in until ban is applied.</p>
    </div>
  `,
});
```

Place this in `supabase/functions/send-account-deleted-email/templates.ts`.

- [ ] **Step 3: Write the send function**

Create `supabase/functions/send-account-deleted-email/index.ts`:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { ACCOUNT_DELETED_CONFIRMATION, ACCOUNT_DELETION_SUPPORT_ALERT } from './templates.ts';
// ADAPT: import the existing email helper found in Task 4 Step 1
// import { sendEmail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { email, account_type, template, metadata } = body;
    if (!email) {
      return new Response(JSON.stringify({ error: 'email required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (template === 'support_alert') {
      const { subject, html } = ACCOUNT_DELETION_SUPPORT_ALERT({
        userId: metadata?.user_id ?? 'unknown',
        error: metadata?.ban_error ?? 'unknown',
      });
      // await sendEmail({ to: email, subject, html });
    } else {
      const { subject, html } = ACCOUNT_DELETED_CONFIRMATION({ accountType: account_type ?? 'fan' });
      // await sendEmail({ to: email, subject, html });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('[send-account-deleted-email]', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
```

Add config:

```toml
[functions.send-account-deleted-email]
verify_jwt = false
```

- [ ] **Step 4: Wire the FAN_CREATOR_DELETED template into notify-fans-creator-deleted**

Edit `supabase/functions/notify-fans-creator-deleted/index.ts` to import and use the template from `../send-account-deleted-email/templates.ts`.

- [ ] **Step 5: Deploy both**

```bash
supabase functions deploy send-account-deleted-email
supabase functions deploy notify-fans-creator-deleted
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/send-account-deleted-email/ supabase/functions/notify-fans-creator-deleted/ supabase/config.toml
git commit -m "feat(emails): account deletion confirmation, fan creator-deleted, support alert templates"
```

---

## Task 6: Visibility filters in admin edge functions

**Files:**
- Modify: `supabase/functions/admin-get-users/index.ts`
- Modify: `supabase/functions/admin-get-user-overview/index.ts`
- Modify: `supabase/functions/admin-impersonate-user/index.ts`
- Modify: `supabase/functions/admin-export-users-csv/index.ts`
- Modify: `supabase/functions/admin-delete-user/index.ts` (also wipe account_deletion_audit row)

- [ ] **Step 1: Patch `admin-get-users`**

Read the file, find every `supabase.from('profiles').select(...)` query, add `.is('deleted_at', null)` to each. Same for `creator_profiles`.

For RPC-backed admin functions (e.g. those in migration `150_admin_users_rpcs.sql`), the SQL functions themselves need the filter — patch them via a follow-up migration `179_admin_filter_deleted.sql` if needed (verify by reading the RPC source).

```bash
grep -n "from('profiles')\|from('creator_profiles')\|rpc('admin_" supabase/functions/admin-get-users/index.ts
```

Add `.is('deleted_at', null)` to each profile/creator_profiles read. Document any RPC that needs SQL-side patching.

- [ ] **Step 2: Patch `admin-get-user-overview`**

If the request targets a user with `deleted_at IS NOT NULL`, return 404. Otherwise add the filter to all sub-queries.

```ts
// At the top, after fetching the target profile:
if (targetProfile?.deleted_at) {
  return new Response(JSON.stringify({ error: 'User not found' }), {
    status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 3: Patch `admin-impersonate-user`**

Refuse impersonation of deleted users:

```ts
if (targetProfile?.deleted_at) {
  return new Response(JSON.stringify({ error: 'Cannot impersonate a deleted user' }), {
    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 4: Patch `admin-export-users-csv`**

Add `.is('deleted_at', null)` to the user listing query.

- [ ] **Step 5: Patch `admin-delete-user` (hard-delete escape hatch)**

Add removal of audit row when admin hard-deletes (so the email becomes available again — this is the only path that should free a deleted email):

```ts
// At the end of the existing tablesToDelete loop, add:
await supabase.from('account_deletion_audit').delete().eq('user_id', user_id);
```

Add a comment block at the top of the function:

```ts
// NOTE: This is the admin HARD-DELETE escape hatch (used for fraud, CSAM, or legal compliance).
// The standard self-service path is the `delete-account` edge function (soft-delete).
// This function:
//   1. Purges all user data (storage, DB rows).
//   2. Removes the account_deletion_audit row (frees the email for re-signup).
//   3. Deletes auth.users.
// Soft-deleted users can also be hard-deleted through this path (admin must call it
// after the soft-delete already occurred) — the operations are idempotent.
```

- [ ] **Step 6: Deploy each**

```bash
for fn in admin-get-users admin-get-user-overview admin-impersonate-user admin-export-users-csv admin-delete-user; do
  supabase functions deploy $fn
done
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/admin-*/
git commit -m "feat(admin): filter deleted users from admin surfaces; hard-delete also wipes audit row"
```

---

## Task 7: Visibility filters in checkout / chat / tracking edge functions

**Files:**
- Modify: `supabase/functions/create-link-checkout/index.ts`
- Modify: `supabase/functions/create-tip-checkout/index.ts`
- Modify: `supabase/functions/create-request-checkout/index.ts`
- Modify: `supabase/functions/create-gift-checkout/index.ts`
- Modify: `supabase/functions/create-creator-subscription/index.ts`
- Modify: `supabase/functions/create-fan-subscription-checkout/index.ts`
- Modify: `supabase/functions/guest-chat-init/index.ts`
- Modify: `supabase/functions/guest-chat-send/index.ts`
- Modify: `supabase/functions/guest-chat-claim/index.ts`
- Modify: `supabase/functions/increment-link-click/index.ts`
- Modify: `supabase/functions/increment-profile-view/index.ts`
- Modify (comment only): `supabase/functions/ugp-listener/index.ts`, `supabase/functions/ugp-confirm/index.ts`, `supabase/functions/ugp-membership-confirm/index.ts`, `supabase/functions/verify-payment/index.ts`

- [ ] **Step 1: Add `is_user_active` gate to each checkout function**

Pattern for each `create-*-checkout`:

```ts
// After resolving target creator user_id (or creator_profile_id):
const { data: targetActive } = await supabase.rpc('is_user_active', {
  check_user_id: targetCreatorUserId
});
if (!targetActive) {
  return new Response(JSON.stringify({ error: 'Creator unavailable' }), {
    status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

For functions that take a `creator_profile_id` (e.g. `create-fan-subscription-checkout`), join through `creator_profiles` to get `user_id` first:

```ts
const { data: cp } = await supabase.from('creator_profiles')
  .select('user_id, deleted_at')
  .eq('id', creatorProfileId).single();
if (!cp || cp.deleted_at) {
  return new Response(JSON.stringify({ error: 'Creator unavailable' }), {
    status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 2: Add gate to guest-chat functions**

Same pattern in `guest-chat-init` and `guest-chat-send` — refuse to start/continue a chat with a deleted creator. For `guest-chat-claim`, refuse to claim a guest conversation if either party is deleted.

- [ ] **Step 3: Silent no-op for tracking functions**

In `increment-link-click` and `increment-profile-view`, gate the increment but **return 200 OK silently** so old indexed URLs don't 404:

```ts
const { data: active } = await supabase.rpc('is_user_active', { check_user_id: creatorUserId });
if (!active) {
  return new Response(JSON.stringify({ success: true, skipped: 'deleted_creator' }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

- [ ] **Step 4: Add hardening comments to webhook handlers**

In `ugp-listener/index.ts`, `ugp-confirm/index.ts`, `ugp-membership-confirm/index.ts`, and `verify-payment/index.ts`, add at the top of each:

```ts
// ─────────────────────────────────────────────────────────────────────────
// IMPORTANT — DO NOT add `is_user_active` checks or filter `deleted_at` here.
// Webhook callbacks for transactions initiated before the creator's account
// deletion (or refunds/chargebacks years later) must remain processable, or
// money is lost. The wallet ledger is the source of truth and is keyed by
// user_id regardless of deletion state.
// ─────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 5: Deploy all modified functions**

```bash
for fn in create-link-checkout create-tip-checkout create-request-checkout create-gift-checkout create-creator-subscription create-fan-subscription-checkout guest-chat-init guest-chat-send guest-chat-claim increment-link-click increment-profile-view ugp-listener ugp-confirm ugp-membership-confirm verify-payment; do
  supabase functions deploy $fn
done
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/
git commit -m "feat(edge): block actions targeting deleted creators; document webhook bypass"
```

---

## Task 8: Visibility filters in Vercel SSR (`api/`)

**Files:**
- Modify: `api/og-proxy.ts`
- Modify: `api/sitemap.ts`
- Modify: `api/rss.ts`
- Modify: `api/directory-ssr.ts`
- Modify: `api/blog-ssr.ts`

- [ ] **Step 1: Patch `api/og-proxy.ts`**

For `/:handle` routes: query `creator_profiles` with `.is('deleted_at', null)`. If not found, return a minimal 410 Gone HTML response with generic OG tags pointing to a "creator not found" page.

```ts
const { data: creator } = await supabase
  .from('creator_profiles')
  .select('display_name, avatar_url, bio, username')
  .eq('username', handle.toLowerCase())
  .is('deleted_at', null)
  .maybeSingle();

if (!creator) {
  // Could be a deleted creator OR a never-existed handle — both render the same page
  return res.status(410).send(renderHtml({
    title: 'Creator not found · Exclu',
    description: 'This creator is no longer on Exclu.',
    ogImage: '/og/default.png',
  }));
}
```

For `/l/:slug`: similarly check `links` join with `creator_profiles.deleted_at IS NULL`.

- [ ] **Step 2: Patch `api/sitemap.ts` and `api/rss.ts`**

Add `.is('deleted_at', null)` to all creator/profile selects.

- [ ] **Step 3: Patch `api/directory-ssr.ts`**

Filter creators by `deleted_at IS NULL`. Editorial agencies (in `agencies` table) are unaffected (they're not user accounts).

- [ ] **Step 4: Patch `api/blog-ssr.ts`**

If blog articles have an `author_id`, filter out articles whose author is deleted (or surface as "[Deleted user]" — use the same pattern as historical surfaces). Verify the schema first:

```bash
grep -n "blog_articles\|author" supabase/migrations/*blog* 2>/dev/null | head -10
```

- [ ] **Step 5: Local test**

Start the dev server (or `vercel dev`) and hit `/sitemap.xml` after creating a soft-deleted test user — confirm they don't appear.

- [ ] **Step 6: Commit**

```bash
git add api/
git commit -m "feat(ssr): exclude deleted creators from og-proxy, sitemap, rss, directory, blog"
```

---

## Task 9: Visibility filters in frontend queries

**Files:** (preliminary — Step 1 will produce the exhaustive list)
- Modify: `src/pages/CreatorPublic.tsx`
- Modify: `src/pages/DirectoryCreators.tsx`
- Modify: `src/pages/DirectoryHub.tsx`
- Modify: `src/pages/FanDashboard.tsx`
- Modify: `src/pages/CreatorChat.tsx`
- Modify: `src/components/feed/SuggestedCreatorsStrip.tsx`
- Modify: `src/components/CreatorsCarousel.tsx`
- Modify: various hooks in `src/hooks/`

- [ ] **Step 1: Run the audit grep**

```bash
grep -rn "\.from('profiles')\|\.from('creator_profiles')" src/ | grep -v "test\." > /tmp/visibility-audit.txt
cat /tmp/visibility-audit.txt
```

For each match, classify:
- **Filter required** (discoverability) → add `.is('deleted_at', null)`.
- **Filter not required, render placeholder** (history) → keep query as-is, render `[Deleted user]` in UI.
- **Filter not required, no UI exposure** → no change.

Document the classification inline in the plan execution log (or in PR description).

- [ ] **Step 2: Apply filters surface-by-surface**

For each "Filter required" entry, add the filter. Example for `DirectoryCreators.tsx`:

```ts
// Before:
const { data } = await supabase.from('creator_profiles').select('id, username, display_name, avatar_url').limit(50);

// After:
const { data } = await supabase.from('creator_profiles').select('id, username, display_name, avatar_url').is('deleted_at', null).limit(50);
```

Repeat for every match classified as "Filter required".

- [ ] **Step 3: Patch `CreatorPublic.tsx` for deleted state**

In the profile load logic (around line 314 / 403), if `creator_profiles.deleted_at` (or `profiles.deleted_at`) is not null, set a new state `setIsDeleted(true)` and render a dedicated component:

```tsx
{isDeleted && (
  <div className="min-h-screen flex items-center justify-center px-6 text-center">
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-3">This creator is no longer on Exclu</h1>
      <p className="text-muted-foreground max-w-md">
        The account you're looking for has been deleted. If you were a subscriber, your access has ended and no further charges will be made.
      </p>
      <a href="/directory/creators" className="mt-6 inline-block underline">Discover other creators</a>
    </div>
  </div>
)}
```

- [ ] **Step 4: Test locally**

```bash
npm run dev
```

Open `/:handle` for a soft-deleted test user → should see the "no longer on Exclu" page. Open the directory → deleted user should not appear.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ src/components/ src/hooks/
git commit -m "feat(front): hide deleted users from discoverability surfaces; render dedicated profile-deleted state"
```

---

## Task 10: Frontend `[Deleted user]` placeholder for historical surfaces

**Files:**
- Create: `src/components/DeletedUserBadge.tsx` (small reusable component)
- Modify: `src/pages/CreatorChat.tsx`
- Modify: `src/components/chat/ConversationListItem.tsx` (or equivalent)
- Modify: `src/pages/FanDashboard.tsx` (for transaction history)

- [ ] **Step 1: Create the placeholder component**

```tsx
// src/components/DeletedUserBadge.tsx
type Props = { className?: string };
export function DeletedUserBadge({ className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 text-muted-foreground italic ${className}`}>
      <span className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900" aria-hidden />
      [Deleted user]
    </span>
  );
}
```

- [ ] **Step 2: Use it in chat conversation list**

In the chat list item, if the counterpart's `profiles.deleted_at IS NOT NULL` (the query already returns the row but with `deleted_at` set), render `<DeletedUserBadge />` instead of name + avatar; remove the click handler so the conversation can still be opened (history preserved) but no profile link works.

- [ ] **Step 3: Use it in transaction history**

In FanDashboard tips/requests/purchases history, when the creator linked to the row is deleted, show `<DeletedUserBadge />` in place of the creator name; transaction details (amount, date) remain visible.

- [ ] **Step 4: Test**

Soft-delete a test creator that has past conversations & transactions with a fan. Log in as the fan → past chat thread shows "[Deleted user]"; past tip shows "[Deleted user]"; current "My Creators" tab does NOT show them (handled by Task 9 fan_favorites delete).

- [ ] **Step 5: Commit**

```bash
git add src/components/DeletedUserBadge.tsx src/pages/CreatorChat.tsx src/components/chat/ src/pages/FanDashboard.tsx
git commit -m "feat(front): [Deleted user] placeholder for chat and transaction history"
```

---

## Task 11: Settings entry points (creator Danger Zone, fan replace, chatter add)

**Files:**
- Modify: `src/pages/Profile.tsx` (add Danger Zone in Security tab)
- Modify: `src/pages/FanDashboard.tsx` (replace broken delete UI with link to new page)
- Modify: `src/pages/ChatterDashboard.tsx` (add Settings icon → delete-account page)

- [ ] **Step 1: Creator — add Danger Zone**

In `src/pages/Profile.tsx`, append a new card after the Support card (around line 1427) inside the Security section:

```tsx
{/* Danger Zone */}
<div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 sm:p-6">
  <h2 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h2>
  <p className="text-xs text-red-300/70 mb-5">
    Deleting your account is permanent and irreversible. You will lose access to your wallet balance and active subscriptions.
  </p>
  <Button
    variant="outline"
    onClick={() => navigate('/app/settings/delete-account')}
    className="rounded-full border-red-500/40 text-red-300 hover:bg-red-500/10"
  >
    Delete my account
  </Button>
</div>
```

- [ ] **Step 2: Fan — replace broken UI**

In `src/pages/FanDashboard.tsx`:
- Remove the `handleDeleteAccount` function (lines 514-530).
- Remove the `showDeleteConfirm` state.
- Replace the inline confirm UI (lines 1600-1640 area) with a single button:

```tsx
<button
  onClick={() => navigate('/fan/settings/delete-account')}
  className="text-sm text-red-400 hover:text-red-300 underline"
>
  Delete my account
</button>
```

Removed code includes the dead `delete-fan-account` invocation.

- [ ] **Step 3: Chatter — add Settings icon → delete page**

In `src/pages/ChatterDashboard.tsx`, find the LogOut button (around line 462 or wherever the header sign-out is) and add a Settings icon button next to it:

```tsx
<button
  type="button"
  onClick={() => navigate('/app/chatter/delete-account')}
  className="p-2 rounded-full hover:bg-white/10"
  aria-label="Account settings"
>
  <Settings className="w-5 h-5 text-muted-foreground" />
</button>
```

(`Settings` is already imported per the existing import on line 22.)

- [ ] **Step 4: Test routing**

```bash
npm run dev
```

Click each entry point → confirms navigation to `/app/settings/delete-account`, `/fan/settings/delete-account`, `/app/chatter/delete-account` respectively (these will 404 until Task 12 ships the pages).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Profile.tsx src/pages/FanDashboard.tsx src/pages/ChatterDashboard.tsx
git commit -m "feat(settings): add Danger Zone (creator), replace dead delete UI (fan), add Settings entry (chatter)"
```

---

## Task 12: Delete account pages — shared component + 3 routes

**Files:**
- Create: `src/components/settings/DeleteAccountFlow.tsx`
- Create: `src/pages/DeleteAccount.tsx` (single page, account-type-aware via `useUserRole` hook or props)
- Modify: `src/App.tsx`

We use **one page** routed via 3 paths (creator/fan/chatter) and the `DeleteAccountFlow` component reads the `account_type` from the `pre-delete-check` response — no need to duplicate. The 3 routes simply differ in their parent shell (AppShell vs FanProtectedRoute vs chatter route guard).

- [ ] **Step 1: Create shared `DeleteAccountFlow` component**

```tsx
// src/components/settings/DeleteAccountFlow.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ArrowLeft, AlertTriangle, ExternalLink } from 'lucide-react';

type Block = {
  type: string;
  count?: number;
  amount_cents?: number;
  cta_label: string;
  cta_url: string;
  message: string;
};

type Warning = {
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
};

type CheckResult = {
  account_type: 'creator' | 'fan' | 'chatter' | 'agency';
  email: string;
  handle: string | null;
  can_delete: boolean;
  blocks: Block[];
  warnings: Warning[];
};

type Props = {
  backUrl: string;
};

export function DeleteAccountFlow({ backUrl }: Props) {
  const navigate = useNavigate();
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('pre-delete-check', { body: {} });
        if (error) throw error;
        setCheck(data as CheckResult);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load deletion check');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }
  if (error || !check) {
    return <div className="p-6 text-red-400">Error: {error ?? 'unknown'}</div>;
  }

  const allWarningsAcknowledged = check.warnings.every((w) => acknowledged[w.type]);
  const expectedConfirmation = (check.account_type === 'creator' || check.account_type === 'agency')
    ? (check.handle ?? '')
    : check.email;
  const confirmationValid = confirmation.replace(/^@/, '').toLowerCase() === expectedConfirmation.toLowerCase();
  const canSubmit = check.can_delete && allWarningsAcknowledged && confirmationValid && !deleting;

  const handleDelete = async () => {
    if (!canSubmit) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account', {
        body: { confirmation },
      });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success('Your account has been deleted. A confirmation email has been sent.');
      navigate('/', { replace: true });
    } catch (e: any) {
      const msg = e?.message ?? 'Deletion failed';
      if (msg.includes('EXCLU_BLOCK_')) {
        toast.error('Conditions changed. Refreshing.');
        // re-fetch
        setLoading(true);
        const { data } = await supabase.functions.invoke('pre-delete-check', { body: {} });
        setCheck(data as CheckResult);
        setLoading(false);
      } else {
        toast.error(msg);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <button onClick={() => navigate(backUrl)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Delete your account</h1>
        <p className="text-sm text-muted-foreground mt-1">Permanent and irreversible. Read carefully.</p>
      </div>

      {check.blocks.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 space-y-4">
          <div className="flex items-center gap-2 text-red-400 font-semibold">
            <AlertTriangle className="w-5 h-5" />
            Resolve these before continuing
          </div>
          {check.blocks.map((b, i) => (
            <div key={i} className="space-y-2">
              <p className="text-sm text-foreground">{b.message}</p>
              <button
                onClick={() => navigate(b.cta_url)}
                className="inline-flex items-center gap-1 text-sm text-red-300 hover:text-red-200 underline"
              >
                {b.cta_label} <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {check.warnings.length > 0 && check.blocks.length === 0 && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5 space-y-4">
          <h2 className="font-semibold text-yellow-400">Acknowledge each before continuing</h2>
          {check.warnings.map((w) => (
            <label key={w.type} className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={!!acknowledged[w.type]}
                onCheckedChange={(v) => setAcknowledged((prev) => ({ ...prev, [w.type]: !!v }))}
                className="mt-0.5"
              />
              <span className="text-sm text-foreground">{w.message}</span>
            </label>
          ))}
        </div>
      )}

      {check.blocks.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-foreground">Confirm</h2>
          <p className="text-sm text-muted-foreground">
            Type your {(check.account_type === 'creator' || check.account_type === 'agency') ? 'handle' : 'email'} to confirm:
            <span className="ml-1 font-mono text-foreground">
              {(check.account_type === 'creator' || check.account_type === 'agency') ? `@${check.handle}` : check.email}
            </span>
          </p>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={(check.account_type === 'creator' || check.account_type === 'agency') ? '@yourhandle' : 'you@example.com'}
            className="bg-background"
          />
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleDelete}
              disabled={!canSubmit}
              variant="destructive"
              className="rounded-full"
            >
              {deleting ? 'Deleting…' : 'Delete my account permanently'}
            </Button>
            <Button onClick={() => navigate(backUrl)} variant="outline" className="rounded-full">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the page wrapper**

```tsx
// src/pages/DeleteAccount.tsx
import { DeleteAccountFlow } from '@/components/settings/DeleteAccountFlow';

type Props = { backUrl?: string };
export default function DeleteAccount({ backUrl = '/app/profile' }: Props) {
  return <DeleteAccountFlow backUrl={backUrl} />;
}
```

- [ ] **Step 3: Register routes in `src/App.tsx`**

Add 3 routes BEFORE the catch-all `*` and the `/:handle` wildcard:

```tsx
import DeleteAccount from '@/pages/DeleteAccount';

// Inside the router config:
<Route path="/app/settings/delete-account" element={<ProtectedRoute><AppShell><DeleteAccount backUrl="/app/profile" /></AppShell></ProtectedRoute>} />
<Route path="/app/chatter/delete-account" element={<ProtectedRoute><DeleteAccount backUrl="/app/chatter" /></ProtectedRoute>} />
<Route path="/fan/settings/delete-account" element={<FanProtectedRoute><DeleteAccount backUrl="/fan" /></FanProtectedRoute>} />
```

(Verify the exact existing wrapper components — `ProtectedRoute`, `FanProtectedRoute`, `AppShell` — match the current routing patterns; mirror what's done for sibling routes.)

- [ ] **Step 4: Add rewrites in `vercel.json`**

For each new route, add a rewrite so deep-linking works in production:

```json
{ "source": "/app/settings/delete-account", "destination": "/index.html" },
{ "source": "/app/chatter/delete-account", "destination": "/index.html" },
{ "source": "/fan/settings/delete-account", "destination": "/index.html" }
```

(Add to the existing `rewrites` array.)

- [ ] **Step 5: Test the full flow on a local fan account**

```bash
npm run dev
```

1. Sign in as a test fan.
2. Navigate to /fan/settings/delete-account.
3. Confirm: warnings list shows; checkboxes work; type-email-to-confirm works; submit deletes; redirected to `/`.
4. Try to log in again with the same credentials → should fail.
5. Try to sign up again with same email → should see "This account has already been deleted" message (Task 13).

- [ ] **Step 6: Commit**

```bash
git add src/pages/DeleteAccount.tsx src/components/settings/DeleteAccountFlow.tsx src/App.tsx vercel.json
git commit -m "feat(settings): self-service delete-account page (creator, fan, chatter)"
```

---

## Task 13: Auth — re-signup deleted-account error message

**Files:**
- Create: `src/lib/deletedAccountErrors.ts`
- Create: `src/lib/deletedAccountErrors.test.ts`
- Modify: `src/pages/Auth.tsx`
- Modify: `src/pages/FanSignup.tsx`
- Modify: `src/pages/ChatterAuth.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/deletedAccountErrors.test.ts
import { describe, it, expect } from 'vitest';
import { isDeletedAccountError, deletedAccountMessage } from './deletedAccountErrors';

describe('deletedAccountErrors', () => {
  it('matches errors with EXCLU_DELETED_ACCOUNT marker', () => {
    expect(isDeletedAccountError({ message: 'Database error: EXCLU_DELETED_ACCOUNT: ...' })).toBe(true);
    expect(isDeletedAccountError({ message: 'something else' })).toBe(false);
    expect(isDeletedAccountError(null)).toBe(false);
  });

  it('returns the canonical user-facing message', () => {
    expect(deletedAccountMessage()).toBe('This account has already been deleted. You must use another email address.');
  });
});
```

- [ ] **Step 2: Run the test (expect FAIL — module missing)**

```bash
npm run test -- src/lib/deletedAccountErrors.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement**

```ts
// src/lib/deletedAccountErrors.ts
export function isDeletedAccountError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as { message?: string }).message ?? '';
  return typeof msg === 'string' && msg.includes('EXCLU_DELETED_ACCOUNT');
}

export function deletedAccountMessage(): string {
  return 'This account has already been deleted. You must use another email address.';
}
```

- [ ] **Step 4: Run the test (expect PASS)**

```bash
npm run test -- src/lib/deletedAccountErrors.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire into Auth.tsx**

Find the signup error catch block in `src/pages/Auth.tsx` and add:

```ts
import { isDeletedAccountError, deletedAccountMessage } from '@/lib/deletedAccountErrors';

// In the existing signup error handler:
if (isDeletedAccountError(error)) {
  toast.error(deletedAccountMessage());
  return;
}
// fall through to existing error handling
```

- [ ] **Step 6: Repeat for FanSignup.tsx and ChatterAuth.tsx**

Same pattern.

- [ ] **Step 7: Commit**

```bash
git add src/lib/deletedAccountErrors.ts src/lib/deletedAccountErrors.test.ts src/pages/Auth.tsx src/pages/FanSignup.tsx src/pages/ChatterAuth.tsx
git commit -m "feat(auth): show 'account already deleted' message on re-signup attempt"
```

---

## Task 14: Public profile — Feed default + Links tab gating

**Files:**
- Modify: `src/pages/CreatorPublic.tsx`

- [ ] **Step 1: Change default tab**

Edit lines 122-128:

```tsx
const initialTab: 'links' | 'content' | 'wishlist' = (() => {
  if (typeof window === 'undefined') return 'content';
  const t = new URLSearchParams(window.location.search).get('tab');
  if (t === 'content' || t === 'feed') return 'content';
  if (t === 'wishlist') return 'wishlist';
  if (t === 'links') return 'links';
  return 'content';  // default → Feed
})();
```

- [ ] **Step 2: Compute `hasAnyLinksOrExclusive`**

In the component body (after profile and links state are loaded), derive:

```tsx
const hasExclusiveContent = !!(
  profile?.exclusive_content_text ||
  profile?.exclusive_content_link_id ||
  profile?.exclusive_content_url ||
  profile?.exclusive_content_image_url
);
const hasAnyLinksOrExclusive = links.length > 0 || hasExclusiveContent;
```

- [ ] **Step 3: Gate the Links tab button**

Around lines 1179-1184, change the conditional:

```tsx
{hasAnyLinksOrExclusive && (
  <button onClick={() => setActiveTab('links')} className={`relative py-3 text-sm font-medium transition-colors ${activeTab === 'links' ? 'text-white' : 'text-white/50 hover:text-white/70'}`}>
    Links
    {activeTab === 'links' && <motion.div layoutId="activeTabMobile" className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full z-10" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />}
  </button>
)}
```

Repeat the same pattern for the second tab strip block at lines 1663+ (mirror change).

- [ ] **Step 4: Add fallback effect**

```tsx
useEffect(() => {
  if (activeTab === 'links' && !hasAnyLinksOrExclusive) {
    setActiveTab('content');
  }
}, [activeTab, hasAnyLinksOrExclusive]);
```

- [ ] **Step 5: Test**

```bash
npm run dev
```

1. Open a creator with no links and no exclusive content → tab strip shows only Feed (and Wishlist if any), default = Feed.
2. Open a creator with both → 3 tabs, default = Feed (was previously Links).
3. URL `?tab=links` on a creator with no links → falls back to Feed.

- [ ] **Step 6: Commit**

```bash
git add src/pages/CreatorPublic.tsx
git commit -m "feat(public-profile): default to Feed tab; hide Links tab when no links and no exclusive content"
```

---

## Task 15: Terms.tsx update

**Files:**
- Modify: `src/pages/Terms.tsx`

- [ ] **Step 1: Locate the existing "request account deletion" mention**

Around line 208 (per spec). Read that section to find a logical insertion point for a new "Account Deletion" clause.

- [ ] **Step 2: Insert the new section**

Add a new `<section>` (or whatever structure the page uses — JSX consistency required) with the content from spec §3.11:

```tsx
<section className="space-y-3">
  <h2 className="text-2xl font-semibold text-foreground">Account Deletion</h2>
  <p>You may delete your account at any time from your account Settings. Account deletion is <strong>immediate and irreversible</strong>.</p>

  <h3 className="text-lg font-semibold text-foreground">Pre-deletion requirements (Creators)</h3>
  <ul className="list-disc pl-6 space-y-1">
    <li>All pending custom requests must be resolved (accepted, declined, or expired).</li>
    <li>All in-flight payouts must complete.</li>
  </ul>

  <h3 className="text-lg font-semibold text-foreground">Wallet balance</h3>
  <p>If you delete your account while your wallet contains funds, those funds are <strong>permanently forfeited</strong>. To withdraw your balance, request a payout before initiating account deletion.</p>

  <h3 className="text-lg font-semibold text-foreground">Active fan subscriptions (Creators)</h3>
  <p>When you delete your account, all active fan subscriptions are canceled. Subscribers retain access until the end of their current billing period and are not charged again. They are notified by email.</p>

  <h3 className="text-lg font-semibold text-foreground">Active subscriptions (Fans)</h3>
  <p>When you delete your account, all your active subscriptions to creators are canceled. You retain access until the end of each current billing period and are not charged again. No refunds are issued.</p>

  <h3 className="text-lg font-semibold text-foreground">Creator Pro subscription</h3>
  <p>Pro subscriptions are canceled upon deletion with no prorated refund.</p>

  <h3 className="text-lg font-semibold text-foreground">Affiliate / referral commissions</h3>
  <p>Future commissions stop accruing immediately upon account deletion. Commissions already credited to your wallet remain in the wallet (and are subject to the same forfeiture rule above if not withdrawn).</p>

  <h3 className="text-lg font-semibold text-foreground">Handle reservation</h3>
  <p>Your handle (<code>@yourname</code>) is permanently reserved upon deletion and cannot be reused by you or any other user.</p>

  <h3 className="text-lg font-semibold text-foreground">Re-registration</h3>
  <p>Once an account is deleted, the email address associated with it cannot be used to create a new Exclu account.</p>

  <h3 className="text-lg font-semibold text-foreground">Data retention</h3>
  <p>In compliance with French accounting law (Code de commerce, Article L. 123-22), transactional data (sales, payouts, tips, custom requests, invoices) is retained for ten (10) years following account deletion. Personal data (display name, biography, avatar, photos, conversations) is hidden from all Exclu surfaces immediately upon deletion. Data is not transmitted to third parties. To exercise your right to deletion of personal data beyond legal retention requirements (RGPD Article 17), contact <a href="mailto:privacy@exclu.at" className="underline">privacy@exclu.at</a>.</p>

  <h3 className="text-lg font-semibold text-foreground">Administrative deletion</h3>
  <p>Exclu reserves the right to delete accounts that violate these Terms. Administrative deletion follows the same data retention rules.</p>
</section>
```

(Adapt the JSX structure to match the existing Terms.tsx — wrappers, classes, etc.)

- [ ] **Step 2 [bis]: Update "last updated" date if Terms.tsx has one**

```bash
grep -n "Last updated\|Effective date\|effective" src/pages/Terms.tsx | head
```

If present, update to today's date.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Terms.tsx
git commit -m "docs(terms): account deletion clauses (RGPD, retention, handle reservation, re-signup)"
```

---

## Task 16: Manual end-to-end QA pass + push deploy

**Files:** None (verification + deploy)

- [ ] **Step 1: Local QA — creator deletion**

1. Sign in as a test creator with: 1 active fan sub, $5 wallet, no pending requests, no in-flight payouts.
2. Go to /app/profile → Security → Delete my account → /app/settings/delete-account.
3. Verify: no blocks, 3-4 warnings (wallet, fan subs, handle reservation, legal), checkboxes work, type-handle-to-confirm works.
4. Click delete → redirect to / → toast "deleted, email sent".
5. Try to log in with old credentials → fails.
6. Open `/@deletedhandle` → "no longer on Exclu" page.
7. Open admin /admin/users → deleted user does NOT appear.
8. Sign up with same email → "This account has already been deleted" message.
9. Verify in DB: `SELECT * FROM account_deletion_audit ORDER BY created_at DESC LIMIT 1` shows the row with snapshot data.
10. Verify fan subscriber received the cancellation email (check local inbox or function logs).
11. Sign in as fan who was subscribed → "My Creators" no longer shows the deleted creator; chat history shows "[Deleted user]"; transaction history shows "[Deleted user]".

- [ ] **Step 2: Local QA — fan deletion**

1. Sign in as a test fan with active subs.
2. Go to fan dashboard → Settings → Delete account → /fan/settings/delete-account.
3. Verify: no blocks, warnings (active subs, legal), checkboxes work, type-email-to-confirm.
4. Click delete → redirect to /.
5. Re-signup blocked.
6. Sign in as a creator the fan was subscribed to → previous fan name is now "[Deleted user]" in chat history; subscriber count decremented.

- [ ] **Step 3: Local QA — chatter deletion**

1. Sign in as test chatter with $0 wallet.
2. Click Settings icon → /app/chatter/delete-account.
3. Delete works.
4. Sign in as creator who had invited this chatter → invitation marked revoked; chatter no longer in their list.
5. Sign in as chatter with $5 wallet → block: "must request payout first".

- [ ] **Step 4: Local QA — block scenarios**

1. Creator with 1 pending custom request → block visible, delete button absent, CTA links to /app/chat.
2. Creator with payout `requested` → block visible.

- [ ] **Step 5: Local QA — public profile UX**

1. Creator with feed + links + exclusive content → 3 tabs, default Feed.
2. Creator with no links and no exclusive → only Feed (+ Wishlist if any).
3. URL `/@x?tab=links` on creator with no links → falls back to Feed.

- [ ] **Step 6: Deploy edge functions to staging/prod**

```bash
supabase functions deploy pre-delete-check delete-account notify-fans-creator-deleted send-account-deleted-email
# Plus all modified admin/checkout/chat/tracking/webhook functions:
for fn in admin-get-users admin-get-user-overview admin-impersonate-user admin-export-users-csv admin-delete-user create-link-checkout create-tip-checkout create-request-checkout create-gift-checkout create-creator-subscription create-fan-subscription-checkout guest-chat-init guest-chat-send guest-chat-claim increment-link-click increment-profile-view ugp-listener ugp-confirm ugp-membership-confirm verify-payment; do
  supabase functions deploy $fn
done
```

- [ ] **Step 7: Apply migration to prod**

```bash
supabase db push
```

(Or apply via the Supabase dashboard SQL editor with the contents of `178_account_soft_delete.sql`.)

- [ ] **Step 8: Verify prod**

Repeat Step 1 with a real test creator on prod (or use staging).

- [ ] **Step 9: Final commit + push**

```bash
git status  # confirm clean
git push
```

---

## Self-Review notes

**Spec coverage check:**
- §2 public profile defaults & gating → Task 14 ✅
- §3.1 schema + audit table → Task 1 ✅
- §3.2 auth blocking (banned_until + scramble) → Task 3 Step 2 ✅
- §3.3 re-signup blocking trigger → Task 1 + Task 13 ✅
- §3.4 visibility filters everywhere → Tasks 6, 7, 8, 9, 10 ✅
- §3.5 hard blocks + warnings → Task 2 (pre-delete-check) + Task 1 (RPC re-check) ✅
- §3.6 auto-cancel cascades → Task 1 (RPC) ✅
- §3.7 handle reservation → Task 1 (`is_handle_available`) ✅
- §3.8 deleted creator landing page → Task 9 Step 3 ✅
- §3.9 dedicated UI page → Tasks 11, 12 ✅
- §3.10 edge functions → Tasks 2, 3, 4 ✅
- §3.11 CGU update → Task 15 ✅
- §3.12 emails → Task 5 ✅
- §3.13 audit checklist → Task 9 Step 1 ✅

**Open known gaps to be resolved during implementation (verify in plan execution):**
- Email infrastructure: Task 4 Step 1 explicitly inventories before writing — reused, not re-introduced.
- Existing admin RPC SQL functions (e.g., from `150_admin_users_rpcs.sql`) may need patching via a migration `179` if they don't already filter `deleted_at`. Task 6 Step 1 grep flags this.
- `find_wallet_drift` RPC must skip deleted users — flagged in Task 1 Step 1 comment for follow-up; if it scans `profiles.wallet_balance_cents`, the soft-delete sets it to 0 anyway, so drift detection vs ledger is consistent. Re-verify during execution.
- Existing `chatter_invitations` schema: spec assumes `inviter_user_id` column; verify exact column name before Task 1.

These are planning-phase TODOs that the execution will resolve with grep / reads, not code placeholders.
