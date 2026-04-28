-- ============================================================================
-- Migration 181: Creator Pro one-time retention discount
-- ============================================================================
-- 50% off the next monthly rebill, offered to monthly Pro creators when they
-- attempt to cancel their subscription OR delete their account. Applies once
-- per account, ever. Annual plans are excluded.
--
-- Storage:
--   profiles.creator_pro_discount_used_at      — stamped when granted
--   profiles.creator_pro_discount_applied_at   — stamped by rebill cron when
--                                                 the discounted cycle actually
--                                                 charges. Until set, the next
--                                                 rebill is at 50%.
--   creator_pro_discount_grants                — full audit row per grant
--
-- The unique index on creator_pro_discount_grants(user_id) is the durable
-- "one-time" enforcement. Even if profiles.creator_pro_discount_used_at is
-- somehow cleared, the unique constraint blocks a second insert.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS creator_pro_discount_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS creator_pro_discount_applied_at timestamptz;

COMMENT ON COLUMN public.profiles.creator_pro_discount_used_at IS
  'Set when the creator claimed the one-time 50% retention discount. Forever
true once set — discount can never be re-offered, even if grants row is gone.';

COMMENT ON COLUMN public.profiles.creator_pro_discount_applied_at IS
  'Set by the rebill cron when it applies the discount on the next monthly
cycle. After this is set, future rebills go back to full price.';

CREATE TABLE IF NOT EXISTS public.creator_pro_discount_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  original_amount_cents bigint NOT NULL,
  discounted_amount_cents bigint NOT NULL,
  context text NOT NULL CHECK (context IN ('cancel_attempt', 'delete_attempt')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pro_discount_per_user
  ON public.creator_pro_discount_grants (user_id);

CREATE INDEX IF NOT EXISTS idx_pro_discount_grants_granted_at
  ON public.creator_pro_discount_grants (granted_at DESC);

ALTER TABLE public.creator_pro_discount_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_reads_own_pro_discount_grant ON public.creator_pro_discount_grants;
CREATE POLICY user_reads_own_pro_discount_grant
  ON public.creator_pro_discount_grants
  FOR SELECT USING (auth.uid() = user_id);

-- Admin reads all
DROP POLICY IF EXISTS admin_reads_all_pro_discount_grants ON public.creator_pro_discount_grants;
CREATE POLICY admin_reads_all_pro_discount_grants
  ON public.creator_pro_discount_grants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

COMMENT ON TABLE public.creator_pro_discount_grants IS
  'Audit log of one-time 50% retention discounts granted to monthly Pro
creators. Unique index on user_id enforces "once per account, ever".';

-- ── RPC: claim the discount atomically (called by edge function) ──────────
-- Inputs:
--   p_user_id uuid     — the creator (must equal auth.uid() — checked by
--                        the edge function before calling).
--   p_context text     — 'cancel_attempt' | 'delete_attempt'
-- Returns:
--   jsonb { success, original_amount_cents, discounted_amount_cents,
--            grant_id, next_rebill_at }
--
-- All preconditions are enforced here. If any fail, RAISE EXCEPTION with a
-- sentinel the edge function maps to a 4xx.
CREATE OR REPLACE FUNCTION public.claim_creator_pro_retention_discount(
  p_user_id uuid,
  p_context text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_original_cents bigint;
  v_discounted_cents bigint;
  v_grant_id uuid;
BEGIN
  IF p_context NOT IN ('cancel_attempt', 'delete_attempt') THEN
    RAISE EXCEPTION 'EXCLU_DISCOUNT_BAD_CONTEXT' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, deleted_at, subscription_plan, subscription_period_end,
         subscription_suspended_at, creator_pro_discount_used_at,
         subscription_amount_cents
    INTO v_profile
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXCLU_DISCOUNT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'EXCLU_DISCOUNT_ACCOUNT_DELETED' USING ERRCODE = 'P0001';
  END IF;
  IF v_profile.subscription_plan IS DISTINCT FROM 'monthly' THEN
    RAISE EXCEPTION 'EXCLU_DISCOUNT_NOT_MONTHLY' USING ERRCODE = 'P0001';
  END IF;
  IF v_profile.subscription_suspended_at IS NOT NULL THEN
    RAISE EXCEPTION 'EXCLU_DISCOUNT_SUSPENDED' USING ERRCODE = 'P0001';
  END IF;
  IF v_profile.creator_pro_discount_used_at IS NOT NULL THEN
    RAISE EXCEPTION 'EXCLU_DISCOUNT_ALREADY_USED' USING ERRCODE = 'P0001';
  END IF;

  -- Snapshot the price the creator is currently paying. Falls back to the
  -- baseline $39.99 if subscription_amount_cents is somehow null.
  v_original_cents := COALESCE(v_profile.subscription_amount_cents, 3999);
  v_discounted_cents := v_original_cents / 2;

  INSERT INTO public.creator_pro_discount_grants (
    user_id, granted_at, original_amount_cents, discounted_amount_cents, context
  ) VALUES (
    p_user_id, now(), v_original_cents, v_discounted_cents, p_context
  )
  RETURNING id INTO v_grant_id;
  -- Note: unique index on user_id raises 23505 if a grant already exists
  -- (defense in depth — the discount_used_at check above would normally
  -- catch this earlier, but the constraint is the load-bearing guarantee).

  -- Stamp profile + clear any pending cancellation. Accepting the discount
  -- means staying on Pro, so cancel_at_period_end must be false.
  UPDATE public.profiles
  SET creator_pro_discount_used_at = now(),
      subscription_cancel_at_period_end = false
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'grant_id', v_grant_id,
    'original_amount_cents', v_original_cents,
    'discounted_amount_cents', v_discounted_cents,
    'next_rebill_at', v_profile.subscription_period_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_creator_pro_retention_discount(uuid, text)
  TO service_role;
