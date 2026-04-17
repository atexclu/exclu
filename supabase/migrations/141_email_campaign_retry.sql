-- 141_email_campaign_retry.sql
-- Phase 6.1 — Idempotency + retry queue on email_campaign_sends.
--
-- Before: a Brevo 429/5xx on a campaign send flipped status='failed'
-- definitively; a Deno crash between the Brevo POST and our status update
-- could leave a row stuck in 'sending' forever; and there was no way to
-- dedupe a re-send to Brevo for the same recipient on the same campaign.
--
-- This migration:
--   1. Adds per-row idempotency_key (stable across retries) so the Brevo
--      custom header can be used to spot duplicate deliveries in logs.
--   2. Adds retry_count + next_retry_at so drain can reschedule retryable
--      failures (429/5xx/network) with exponential backoff (60s, 5m, 25m).
--   3. Adds sending_started_at so a dedicated reclaim step can move rows
--      stuck in 'sending' back to 'queued' after a timeout.
--   4. Extends status check with 'retrying'.
--   5. Adds two RPCs:
--        schedule_campaign_send_retry(send_id, error, max_retries)
--          — called by drain on a retryable failure; returns 'retrying'
--            or 'failed' when retries are exhausted.
--        reclaim_stuck_campaign_sends(timeout_minutes)
--          — idempotent sweeper called by drain on every tick.
--
-- No data migration required: existing rows default to retry_count=0 and
-- a freshly-generated idempotency_key. Existing failed rows stay failed.

-- ======================================================================
-- 1. New columns
-- ======================================================================

alter table public.email_campaign_sends
  add column if not exists idempotency_key uuid not null default gen_random_uuid(),
  add column if not exists retry_count int not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists sending_started_at timestamptz;

comment on column public.email_campaign_sends.idempotency_key is
  'Stable UUID generated at insert time. Sent to Brevo as a custom header (X-Exclu-Idempotency-Key) so duplicate deliveries caused by retries surface in provider logs.';
comment on column public.email_campaign_sends.retry_count is
  'Number of failed delivery attempts so far. Incremented by schedule_campaign_send_retry. Capped via max_retries param (default 3 → 4 total attempts).';
comment on column public.email_campaign_sends.next_retry_at is
  'When status=retrying, the earliest moment the drain may attempt redelivery. Null otherwise.';
comment on column public.email_campaign_sends.sending_started_at is
  'When the drain claims a row (status queued|retrying → sending), we stamp this. A sweeper (reclaim_stuck_campaign_sends) flips rows whose timestamp is older than N minutes back to queued.';

-- ======================================================================
-- 2. Extend status check to include 'retrying'
-- ======================================================================
-- Postgres requires drop+add for check constraint enum widening.

do $$
declare v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.email_campaign_sends'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if v_constraint_name is not null then
    execute format('alter table public.email_campaign_sends drop constraint %I', v_constraint_name);
  end if;
end$$;

alter table public.email_campaign_sends
  add constraint email_campaign_sends_status_check
  check (status in (
    'queued','sending','retrying','sent','delivered','opened','clicked',
    'bounced','complained','unsubscribed','failed','skipped'
  ));

-- ======================================================================
-- 3. Indexes
-- ======================================================================

-- Drain picks up rows whose status is queued OR retrying-with-due-time.
-- Replace the old narrow index with one that covers both states.
drop index if exists public.email_campaign_sends_queue_idx;
create index if not exists email_campaign_sends_queue_idx
  on public.email_campaign_sends(status, created_at)
  where status in ('queued','retrying');

create index if not exists email_campaign_sends_retry_due_idx
  on public.email_campaign_sends(next_retry_at)
  where status = 'retrying';

create index if not exists email_campaign_sends_stuck_sending_idx
  on public.email_campaign_sends(sending_started_at)
  where status = 'sending';

-- ======================================================================
-- 4. schedule_campaign_send_retry RPC
-- ======================================================================
-- Called by drain after a retryable Brevo failure. Moves status to
-- 'retrying' with exponential backoff. After max_retries, flips to 'failed'.
-- Returns 'retrying' or 'failed' so the caller can log accordingly.
--
-- Backoff formula (seconds): 60 * 5^retry_count
--   retry #1 → +60s,  retry #2 → +300s,  retry #3 → +1500s,  retry #4 → fail
-- This keeps transient Brevo blips out of 'failed' while still bounding
-- the amount of queue lag we introduce for a truly dead recipient.

create or replace function public.schedule_campaign_send_retry(
  p_send_id uuid,
  p_error text,
  p_max_retries int default 3
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_current int;
  v_delay_seconds int;
begin
  if p_send_id is null then
    raise exception 'schedule_campaign_send_retry: send_id required';
  end if;

  select retry_count into v_current
  from public.email_campaign_sends
  where id = p_send_id
  for update;

  if not found then return 'not_found'; end if;

  if v_current >= coalesce(p_max_retries, 3) then
    update public.email_campaign_sends
    set status = 'failed',
        error = left(coalesce(p_error, 'max_retries_exhausted'), 400),
        next_retry_at = null,
        sending_started_at = null,
        updated_at = now()
    where id = p_send_id;
    return 'failed';
  end if;

  v_delay_seconds := 60 * (5 ^ v_current)::int;

  update public.email_campaign_sends
  set status = 'retrying',
      retry_count = v_current + 1,
      next_retry_at = now() + make_interval(secs => v_delay_seconds),
      sending_started_at = null,
      error = left(coalesce(p_error, 'retryable'), 400),
      updated_at = now()
  where id = p_send_id;
  return 'retrying';
end;
$$;

grant execute on function public.schedule_campaign_send_retry(uuid, text, int)
  to service_role;

-- ======================================================================
-- 5. reclaim_stuck_campaign_sends RPC
-- ======================================================================
-- Drains any row that's been 'sending' for longer than p_timeout_minutes
-- back to 'queued' so the next tick picks it up. Called on every drain
-- tick — idempotent and cheap thanks to the partial index above.
--
-- Stuck rows happen when the Deno function crashes between the CAS
-- (queued → sending) and the post-Brevo update. Without this sweeper the
-- row would sit in 'sending' forever.

create or replace function public.reclaim_stuck_campaign_sends(
  p_timeout_minutes int default 10
)
returns int
language plpgsql security definer
set search_path = public
as $$
declare v_count int;
begin
  update public.email_campaign_sends
  set status = 'queued',
      sending_started_at = null,
      error = left(
        coalesce(nullif(error, ''), '') || format(' | reclaimed_after_%smin', p_timeout_minutes),
        400
      ),
      updated_at = now()
  where status = 'sending'
    and sending_started_at is not null
    and sending_started_at < now() - make_interval(mins => greatest(p_timeout_minutes, 1));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.reclaim_stuck_campaign_sends(int) to service_role;

-- ======================================================================
-- 6. Refresh email_campaign_stats to bucket 'retrying' with queued
-- ======================================================================

create or replace view public.email_campaign_stats as
select
  c.id as campaign_id,
  c.name,
  c.status,
  c.total_recipients,
  c.started_at,
  c.finished_at,
  count(*) filter (where s.status in ('sent','delivered','opened','clicked'))::int   as sent_count,
  count(*) filter (where s.status = 'delivered')::int                                 as delivered_count,
  count(*) filter (where s.status in ('opened','clicked'))::int                       as opened_count,
  count(*) filter (where s.status = 'clicked')::int                                   as clicked_count,
  count(*) filter (where s.status = 'bounced')::int                                   as bounced_count,
  count(*) filter (where s.status = 'complained')::int                                as complained_count,
  count(*) filter (where s.status = 'unsubscribed')::int                              as unsubscribed_count,
  count(*) filter (where s.status = 'failed')::int                                    as failed_count,
  count(*) filter (where s.status in ('queued','retrying'))::int                      as queued_count,
  count(*) filter (where s.status = 'retrying')::int                                  as retrying_count
from public.email_campaigns c
left join public.email_campaign_sends s on s.campaign_id = c.id
group by c.id, c.name, c.status, c.total_recipients, c.started_at, c.finished_at;

grant select on public.email_campaign_stats to authenticated, service_role;
