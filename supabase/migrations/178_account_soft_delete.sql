-- ============================================================================
-- Migration 178: Account Soft-Delete (RGPD)
-- ============================================================================
-- Adds:
--   - deleted_at columns on profiles + creator_profiles
--   - cancel_reason columns on fan_creator_subscriptions
--   - subscription_canceled_at_deletion / subscription_cancel_reason on profiles
--     (Creator Pro subscription state lives on profiles, NOT creator_profiles —
--      see migration 165_creator_subscription_refactor.sql)
--   - account_deletion_audit table (RGPD compliance + re-signup block)
--   - SQL helpers: is_user_active(uuid), is_handle_available(text)
--   - RPC soft_delete_account(uuid, text, uuid, text) — atomic deletion
--   - BEFORE INSERT trigger on auth.users to block re-signup with deleted email
-- ============================================================================
-- Adaptations from plan text (verified against the live schema):
--   - chatter_invitations inviter column is `invited_by` (migration 073),
--     not `inviter_user_id`.
--   - Creator Pro columns live on `profiles` (migration 165), not on
--     `creator_profiles`. Aux columns moved accordingly; cancel UPDATE targets
--     profiles.
--   - Payouts in-flight statuses are `pending|approved|processing`
--     (migration 112 + supabase/functions/request-withdrawal/index.ts) —
--     not `requested|processing`.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Soft-delete columns on profiles ─────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text,
  ADD COLUMN IF NOT EXISTS deleted_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_deleted_reason_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_deleted_reason_check
  CHECK (deleted_reason IS NULL OR deleted_reason IN ('user_self_delete', 'admin_delete', 'compliance_delete'));

-- Creator Pro subscription cancellation auxiliaries (subscription state itself
-- already exists on profiles since migration 165).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_canceled_at_deletion timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_reason text;

-- ── 2. Soft-delete + auxiliary columns on creator_profiles ────────────────
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS fans_notified_at_deletion timestamptz;

-- ── 3. Cancellation tracking on fan_creator_subscriptions ─────────────────
ALTER TABLE public.fan_creator_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS deletion_email_sent_at timestamptz;

-- ── 4. Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_active
  ON public.profiles (id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_creator_profiles_active
  ON public.creator_profiles (id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_creator_profiles_username_lower
  ON public.creator_profiles (LOWER(username));

-- ── 5. Audit table ────────────────────────────────────────────────────────
-- user_id is intentionally NOT a FK to auth.users so the row survives any
-- future hard-delete of the auth.users record (RGPD requirement: the audit
-- + re-signup block must outlive the user row itself).
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
-- writes are service-role only (bypasses RLS); no INSERT/UPDATE/DELETE policy.

COMMENT ON TABLE public.account_deletion_audit IS
  'RGPD-compliant soft-delete audit. email_hash is used by the auth.users BEFORE INSERT trigger to block re-signup. user_id is intentionally NOT a FK so the row survives any future hard-delete of auth.users.';

-- ── 6. SQL helpers ────────────────────────────────────────────────────────

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
  -- Intentionally does NOT filter deleted_at — deleted handles stay reserved
  -- permanently to prevent impersonation of a former creator.
  SELECT NOT EXISTS(
    SELECT 1 FROM public.creator_profiles
    WHERE LOWER(username) = LOWER(handle_to_check)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_handle_available(text) TO authenticated, anon, service_role;

-- ── 7. Re-signup blocking trigger on auth.users ───────────────────────────
-- This MUST be BEFORE INSERT and RAISE EXCEPTION (NOT WARNING) so the auth
-- INSERT is actually rolled back. The existing `handle_new_user` trigger is
-- AFTER INSERT and uses RAISE WARNING because it is intentionally fail-tolerant
-- (we do not want a profile-creation hiccup to break signup). Ours has the
-- opposite intent: deny the insert outright.

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
    RETURN NEW;  -- defensive; Supabase always sets email on auth.users INSERT.
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

-- ── 8. The atomic RPC: soft_delete_account ────────────────────────────────
-- Called by the delete-account edge function with the service role.
-- Performs ALL database mutations atomically; the edge function handles the
-- auth.users ban + emails AFTER this returns successfully.

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
  v_pending_request_count integer;
  v_payouts_in_flight_count integer;
  v_affiliate_deactivated integer := 0;
  v_fan_favorites_creator_deleted integer := 0;
  v_fan_favorites_fan_deleted integer := 0;
BEGIN
  -- 1. Re-check blocks (race protection): pre-delete-check edge function ran
  --    earlier client-side, but state may have changed before this RPC runs.

  -- 1a. Pending custom requests where this user is the creator
  SELECT count(*) INTO v_pending_request_count
  FROM public.custom_requests
  WHERE creator_id = p_user_id
    AND status IN ('pending', 'accepted');

  IF v_pending_request_count > 0 THEN
    RAISE EXCEPTION 'EXCLU_BLOCK_PENDING_REQUESTS: % pending custom requests', v_pending_request_count
      USING ERRCODE = 'P0001';
  END IF;

  -- 1b. Payouts in flight (statuses 'pending'|'approved'|'processing' are
  --     considered "to review / not yet final" — see request-withdrawal and
  --     migration 112_ugpayments_wallet_system.sql).
  SELECT count(*) INTO v_payouts_in_flight_count
  FROM public.payouts
  WHERE creator_id = p_user_id
    AND status IN ('pending', 'approved', 'processing');

  IF v_payouts_in_flight_count > 0 THEN
    RAISE EXCEPTION 'EXCLU_BLOCK_PAYOUTS_IN_FLIGHT: % payouts in flight', v_payouts_in_flight_count
      USING ERRCODE = 'P0001';
  END IF;

  -- 1c. Fetch role (also used later for the audit row)
  SELECT role::text INTO v_account_type
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_account_type IS NULL THEN
    RAISE EXCEPTION 'EXCLU_NOT_FOUND_OR_ALREADY_DELETED' USING ERRCODE = 'P0001';
  END IF;

  -- 1d. Chatters cannot soft-delete with a non-zero wallet (forfeit prevention)
  IF v_account_type = 'chatter' THEN
    SELECT COALESCE(wallet_balance_cents, 0) INTO v_wallet_balance
    FROM public.profiles WHERE id = p_user_id;

    IF v_wallet_balance > 0 THEN
      RAISE EXCEPTION 'EXCLU_BLOCK_CHATTER_WALLET: chatter wallet has % cents', v_wallet_balance
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2. Snapshot wallet balance for audit (creators forfeit any non-zero balance)
  SELECT COALESCE(wallet_balance_cents, 0) INTO v_wallet_balance
  FROM public.profiles WHERE id = p_user_id;

  -- 3. Snapshot custom_requests rows (both directions) for audit
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'status', status,
    'role', CASE WHEN creator_id = p_user_id THEN 'creator' ELSE 'fan' END,
    'amount_cents', proposed_amount_cents,
    'created_at', created_at
  )), '[]'::jsonb) INTO v_custom_requests_snapshot
  FROM public.custom_requests
  WHERE creator_id = p_user_id OR fan_id = p_user_id;

  -- 4. Soft-delete the profile row
  UPDATE public.profiles
  SET deleted_at = now(),
      deleted_reason = p_reason,
      deleted_actor_id = p_actor_id
  WHERE id = p_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXCLU_NOT_FOUND_OR_ALREADY_DELETED' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Soft-delete every creator_profile owned by this user (multi-profile cascade)
  UPDATE public.creator_profiles
  SET deleted_at = now()
  WHERE user_id = p_user_id AND deleted_at IS NULL;

  GET DIAGNOSTICS v_creator_profiles_deleted = ROW_COUNT;

  -- 6. Cancel active fan→creator subscriptions where this user is the creator
  --    (honor-then-end: keep access until period_end then expire naturally).
  UPDATE public.fan_creator_subscriptions
  SET cancel_at_period_end = true,
      cancelled_at = now(),
      cancel_reason = 'creator_account_deleted'
  WHERE creator_user_id = p_user_id
    AND status = 'active'
    AND cancel_at_period_end = false;

  GET DIAGNOSTICS v_fan_subs_canceled = ROW_COUNT;

  -- 7. Cancel active fan→creator subscriptions where this user is the fan
  UPDATE public.fan_creator_subscriptions
  SET cancel_at_period_end = true,
      cancelled_at = now(),
      cancel_reason = 'fan_account_deleted'
  WHERE fan_id = p_user_id
    AND status = 'active'
    AND cancel_at_period_end = false;

  -- 8. Cancel Creator Pro subscription (state lives on profiles since
  --    migration 165). Only act if there is an active plan and it isn't
  --    already scheduled to cancel.
  UPDATE public.profiles
  SET subscription_cancel_at_period_end = true,
      subscription_canceled_at_deletion = now(),
      subscription_cancel_reason = 'account_deleted'
  WHERE id = p_user_id
    AND subscription_plan IS NOT NULL
    AND subscription_plan <> 'free'
    AND COALESCE(subscription_cancel_at_period_end, false) = false;

  -- 9. Revoke any chatter invitations sent BY this user. The inviter column
  --    is `invited_by` (verified migration 073_chatting_system_core.sql).
  UPDATE public.chatter_invitations
  SET status = 'revoked'
  WHERE invited_by = p_user_id
    AND status IN ('pending', 'accepted');

  -- 10. Remove agency_members rows where this user is the agency owner.
  --     (If the user is the chatter side of the row, those rows are tied to
  --     other agency owners — not our business to drop them here.)
  DELETE FROM public.agency_members
  WHERE agency_user_id = p_user_id;

  -- 11. Deactivate the user's affiliate row, if any.
  UPDATE public.affiliates
  SET is_active = false
  WHERE user_id = p_user_id AND is_active = true;

  GET DIAGNOSTICS v_affiliate_deactivated = ROW_COUNT;

  -- 12. Hard-delete fan_favorites pointing TO this creator (so they vanish
  --     from fans' favorites lists immediately).
  DELETE FROM public.fan_favorites
  WHERE creator_id = p_user_id;

  GET DIAGNOSTICS v_fan_favorites_creator_deleted = ROW_COUNT;

  -- 13. Hard-delete fan_favorites OWNED by this user (if they were a fan).
  DELETE FROM public.fan_favorites
  WHERE fan_id = p_user_id;

  GET DIAGNOSTICS v_fan_favorites_fan_deleted = ROW_COUNT;

  -- 14. Insert the audit row — THIS is what blocks re-signup via the
  --     check_email_not_deleted_trigger above.
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
    v_custom_requests_snapshot,
    jsonb_build_object(
      'fan_favorites_creator_side_deleted', v_fan_favorites_creator_deleted,
      'fan_favorites_fan_side_deleted', v_fan_favorites_fan_deleted,
      'affiliate_deactivated', v_affiliate_deactivated > 0
    )
  )
  RETURNING id INTO v_audit_id;

  -- 15. Forfeit the wallet (zero out). We deliberately do NOT write a ledger
  --     entry here: the wallet is "frozen" at deletion time, the historical
  --     ledger remains intact for audit, and find_wallet_drift must be patched
  --     to exclude soft-deleted accounts so the drift never alerts on this.
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

-- ── 9. Webhook bypass invariant (documentation) ───────────────────────────
COMMENT ON COLUMN public.profiles.deleted_at IS
  'Soft-delete timestamp. NULL = active. All discoverability surfaces must filter on deleted_at IS NULL. Webhooks (ugp-*) MUST NOT filter on this so historical callbacks remain processable.';

-- ── 10. Patch find_wallet_drift to skip soft-deleted accounts ─────────────
-- Patched by migration 178: skip soft-deleted accounts whose wallet was
-- forfeited at deletion (projection=0, ledger=historical, expected divergence
-- is not drift). Original definition lives in 172_wallet_drift_rpc.sql.
create or replace function find_wallet_drift(p_tolerance_cents bigint default 1)
returns table(user_id uuid, projection_cents bigint, ledger_cents bigint)
language sql stable security definer
set search_path = public
as $$
  select p.id,
         coalesce(p.wallet_balance_cents, 0) as projection_cents,
         coalesce((
           select sum(case when direction = 'credit' then amount_cents else -amount_cents end)
             from wallet_transactions wt
            where wt.owner_id = p.id and wt.owner_kind = 'creator'
         ), 0) as ledger_cents
    from profiles p
   where p.is_creator = true
     and p.deleted_at is null
     and abs(coalesce(p.wallet_balance_cents, 0) - coalesce((
           select sum(case when direction = 'credit' then amount_cents else -amount_cents end)
             from wallet_transactions wt
            where wt.owner_id = p.id and wt.owner_kind = 'creator'
         ), 0)) > p_tolerance_cents;
$$;

grant execute on function find_wallet_drift(bigint) to service_role;
