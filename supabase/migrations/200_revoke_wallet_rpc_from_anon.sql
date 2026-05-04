-- 200_revoke_wallet_rpc_from_anon.sql
--
-- Closes a critical financial-side vulnerability surfaced by the PCI audit
-- live cross-check on 2026-05-04: every SECURITY DEFINER wallet-mutating RPC
-- in the public schema was callable by `anon` and `authenticated` via
-- PostgREST. Combined with the absence of an internal authorization check
-- inside `apply_wallet_transaction`, this meant any actor with the public
-- Supabase anon JWT (already shipped in the frontend bundle) could credit
-- arbitrary amounts to any creator wallet by POSTing to
-- /rest/v1/rpc/apply_wallet_transaction.
--
-- Origin: Postgres' default behaviour grants EXECUTE on every freshly
-- CREATEd function to the implicit `PUBLIC` role. The original migration
-- (170_wallet_ledger.sql line 142) explicitly granted EXECUTE to
-- service_role thinking it was restricting access, but GRANTs are additive,
-- not exclusive — the implicit PUBLIC grant remained.
--
-- This migration revokes EXECUTE from PUBLIC, anon, and authenticated on
-- every wallet-mutating RPC. Edge Functions all create their Supabase
-- client with SERVICE_ROLE_KEY (verified across `_shared/ledger.ts`,
-- `verify-payment`, `process-payout`, `mature-pending-balance`,
-- `ugp-confirm`, `ugp-listener`, `manage-request`, `rebill-subscriptions`)
-- and the explicit GRANT TO service_role from migration 170 is preserved,
-- so this revoke is operationally safe — no caller in the codebase relies
-- on the leaked PUBLIC grant.

REVOKE EXECUTE ON FUNCTION public.apply_wallet_transaction(
  uuid, public.wallet_owner_kind, public.wallet_tx_direction, bigint,
  public.wallet_tx_source, uuid, text, text, uuid, jsonb, text
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.credit_creator_wallet(uuid, bigint)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.debit_creator_wallet(uuid, bigint)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_chatter_earnings(uuid, integer)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_total_withdrawn(uuid, bigint)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mature_wallet_transactions(timestamptz)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.find_wallet_drift(bigint)
  FROM PUBLIC, anon, authenticated;
