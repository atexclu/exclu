-- 156_drain_singleton_and_idle_timeout.sql
-- Incident 2026-04-21 hardening — prevent recurrence of the Supabase
-- saturation that pegged the CPU until a project restart.
--
-- Root cause (see postmortem): compound load on an undersized compute
-- tier. The Vercel cron drain-campaigns fires every minute and runs a
-- 5-step pipeline unconditionally. When the DB got slow, a tick couldn't
-- finish in 60s; the next tick fired anyway and piled on, holding
-- row-level locks on email_campaign_sends. PostgREST connections then
-- stacked up in "idle in transaction" (observed: 6s wait_event=ClientRead)
-- until pgbouncer's circuit breaker opened.
--
-- This migration adds two safety nets:
--
--   1. A lease-based singleton guard so drain ticks never overlap.
--      Implemented as a table (not pg_try_advisory_lock) because drain
--      issues multiple RPC/CRUD calls each in its own PgBouncer-pooled
--      transaction — a session-level lock wouldn't persist across them.
--
--   2. idle_in_transaction_session_timeout = 30s at the DB level so any
--      zombie PostgREST connection self-closes instead of hoarding a pool
--      slot. 30s is well above the p99 of normal PostgREST transactions
--      (<200ms) and well below the multi-minute stalls we observed.
--
-- Also performs a one-shot reclaim at the bottom of the migration to
-- flush any rows left in 'sending' from the incident window.

-- ======================================================================
-- 1. Global idle-in-transaction safety net
-- ======================================================================
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '30s';

-- Existing sessions keep their previous value until reconnect; the drain
-- cron opens fresh connections every tick via supabase-js, so they pick
-- this up on the next invocation. No bounce needed.

-- ======================================================================
-- 2. Drain lease table
-- ======================================================================
CREATE TABLE IF NOT EXISTS public.drain_leases (
  id           text        PRIMARY KEY,
  acquired_at  timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  note         text
);

COMMENT ON TABLE public.drain_leases IS
  'Distributed singleton lock for background ticks (e.g. drain-campaign-sends). One row per lease name. expires_at acts as a TTL so a crashed holder auto-releases.';

-- ======================================================================
-- 3. Acquire / release RPCs
-- ======================================================================
-- try_acquire_drain_lease: atomically takes the lease iff nobody holds
-- it or the holder's TTL has elapsed. Returns true on success. Callers
-- MUST release via release_drain_lease in a finally block.
CREATE OR REPLACE FUNCTION public.try_acquire_drain_lease(
  p_lease_id     text DEFAULT 'drain_campaign_sends',
  p_ttl_seconds  int  DEFAULT 90
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  INSERT INTO public.drain_leases (id, acquired_at, expires_at)
  VALUES (p_lease_id, now(), now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (id) DO UPDATE
    SET acquired_at = now(),
        expires_at  = now() + make_interval(secs => p_ttl_seconds)
    WHERE public.drain_leases.expires_at < now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

COMMENT ON FUNCTION public.try_acquire_drain_lease(text, int) IS
  'Returns true iff this caller now holds the named lease. On conflict, only steals the lease from an expired holder (expires_at < now()). Callers MUST release via release_drain_lease in a finally block.';

-- release_drain_lease: always idempotent — safe to call even if we never
-- held the lease (no-op in that case).
CREATE OR REPLACE FUNCTION public.release_drain_lease(
  p_lease_id text DEFAULT 'drain_campaign_sends'
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.drain_leases WHERE id = p_lease_id;
$$;

GRANT EXECUTE ON FUNCTION public.try_acquire_drain_lease(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_drain_lease(text)          TO service_role;

-- ======================================================================
-- 4. One-shot cleanup of rows stuck in 'sending' during the incident
-- ======================================================================
-- Safe: reclaim_stuck_campaign_sends only touches rows older than the
-- passed timeout, so normal traffic is untouched.
SELECT public.reclaim_stuck_campaign_sends(5);
