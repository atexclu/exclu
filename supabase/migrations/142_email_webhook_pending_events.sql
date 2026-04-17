-- 142_email_webhook_pending_events.sql
-- Phase 6.2 — Race-safe Brevo webhook event ingestion.
--
-- Before: brevo-webhook called record_campaign_event(brevo_message_id, ...),
-- and if the matching email_campaign_sends row hadn't been written yet
-- (the drain posts to Brevo BEFORE writing brevo_message_id back), the
-- RPC silently returned null and the event was lost forever.
--
-- This migration:
--   1. Adds email_campaign_events_pending — unresolved events waiting for
--      a send row to appear. Unique per (brevo_message_id, event_type,
--      occurred_at) so webhook retries don't create duplicates.
--   2. Adds email_campaign_events_orphan — events we gave up on matching
--      after max_age_hours; kept for forensic / support review.
--   3. Replaces record_campaign_event to:
--        - match synchronously (fast path, ~100% of traffic)
--        - on miss, INSERT into pending instead of silently dropping
--   4. Adds process_pending_campaign_events(max_age_hours, batch_size)
--      — called from drain on every tick:
--        - retries match for pending rows; on hit, processes like normal
--        - on rows older than max_age_hours, moves to orphan and deletes
--
-- Nothing mutates mailing_contacts here; that side-effect stays inside
-- record_campaign_event and fires only when a real send row is found.

-- ======================================================================
-- 1. Tables
-- ======================================================================

create table if not exists public.email_campaign_events_pending (
  id uuid primary key default gen_random_uuid(),
  brevo_message_id text not null,
  event_type text not null
    check (event_type in ('sent','delivered','opened','clicked','bounced',
                          'complained','unsubscribed','failed','soft_bounced','blocked')),
  occurred_at timestamptz not null default now(),
  payload jsonb,
  attempts int not null default 0,
  last_attempted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Dedupe webhook retries for the same logical event.
create unique index if not exists email_campaign_events_pending_dedup_idx
  on public.email_campaign_events_pending(brevo_message_id, event_type, occurred_at);

create index if not exists email_campaign_events_pending_msg_idx
  on public.email_campaign_events_pending(brevo_message_id);

create index if not exists email_campaign_events_pending_created_idx
  on public.email_campaign_events_pending(created_at);

create table if not exists public.email_campaign_events_orphan (
  id uuid primary key default gen_random_uuid(),
  brevo_message_id text not null,
  event_type text not null,
  occurred_at timestamptz,
  payload jsonb,
  attempts int,
  first_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_campaign_events_orphan_msg_idx
  on public.email_campaign_events_orphan(brevo_message_id);

create index if not exists email_campaign_events_orphan_created_idx
  on public.email_campaign_events_orphan(created_at desc);

-- ======================================================================
-- 2. RLS — admin-only read, service-role writes
-- ======================================================================

alter table public.email_campaign_events_pending enable row level security;
alter table public.email_campaign_events_orphan enable row level security;

drop policy if exists "admins read email_campaign_events_pending"
  on public.email_campaign_events_pending;
create policy "admins read email_campaign_events_pending"
  on public.email_campaign_events_pending for select using (public.is_admin());

drop policy if exists "admins read email_campaign_events_orphan"
  on public.email_campaign_events_orphan;
create policy "admins read email_campaign_events_orphan"
  on public.email_campaign_events_orphan for select using (public.is_admin());

grant select on public.email_campaign_events_pending to authenticated, service_role;
grant select on public.email_campaign_events_orphan to authenticated, service_role;

-- ======================================================================
-- 3. Replace record_campaign_event — race-safe
-- ======================================================================
-- Semantics:
--   Match found      → insert into email_campaign_events, update send,
--                      (unsub/complaint/bounce) flip mailing_contacts,
--                      return event id.
--   Match NOT found  → insert into email_campaign_events_pending (ON
--                      CONFLICT DO NOTHING so webhook retries collapse),
--                      return null.
--
-- The function remains idempotent for the happy path: recording the same
-- (brevo_message_id, event_type) twice inserts two events rows but never
-- double-flips the mailing_contacts opt-in (it's already set to false
-- after the first terminal event).

create or replace function public.record_campaign_event(
  p_brevo_message_id text,
  p_event_type text,
  p_meta jsonb default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_send public.email_campaign_sends;
  v_new_send_status text;
  v_event_id uuid;
  v_occurred_at timestamptz;
begin
  if p_brevo_message_id is null or length(trim(p_brevo_message_id)) = 0 then
    raise exception 'record_campaign_event: missing brevo_message_id';
  end if;
  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'record_campaign_event: missing event_type';
  end if;

  -- Pull occurred_at from payload if the caller threaded it through;
  -- otherwise fall back to now(). This matters for pending-queue dedup:
  -- a webhook retry carries the same date so the unique index collapses it.
  v_occurred_at := coalesce(
    (p_meta->>'occurred_at')::timestamptz,
    (p_meta->>'date')::timestamptz,
    now()
  );

  select * into v_send
  from public.email_campaign_sends
  where brevo_message_id = p_brevo_message_id
  limit 1;

  if v_send is null then
    -- Race: webhook arrived before drain wrote brevo_message_id back, OR
    -- message-id doesn't match anything we track. Park it for reprocessing.
    insert into public.email_campaign_events_pending
      (brevo_message_id, event_type, occurred_at, payload)
    values
      (trim(p_brevo_message_id), p_event_type, v_occurred_at, p_meta)
    on conflict (brevo_message_id, event_type, occurred_at) do nothing;
    return null;
  end if;

  insert into public.email_campaign_events (send_id, event_type, meta, occurred_at)
  values (v_send.id, p_event_type, p_meta, v_occurred_at)
  returning id into v_event_id;

  -- Map event type → send status (never downgrade happy-path terminal states).
  v_new_send_status := case p_event_type
    when 'delivered' then 'delivered'
    when 'opened' then
      case when v_send.status in ('clicked') then v_send.status else 'opened' end
    when 'clicked' then 'clicked'
    when 'bounced' then 'bounced'
    when 'soft_bounced' then
      case when v_send.status in ('delivered','opened','clicked') then v_send.status
      else 'bounced' end
    when 'blocked' then 'bounced'
    when 'complained' then 'complained'
    when 'unsubscribed' then 'unsubscribed'
    when 'failed' then 'failed'
    else v_send.status
  end;

  update public.email_campaign_sends
  set status = v_new_send_status,
      last_event_at = now(),
      updated_at = now()
  where id = v_send.id;

  -- Terminal negative events → flip mailing_contacts opt-in + audit.
  if p_event_type in ('unsubscribed','complained','bounced') then
    update public.mailing_contacts
    set marketing_opted_in = false,
        marketing_opted_out_at = coalesce(marketing_opted_out_at, now()),
        updated_at = now()
    where email = v_send.email;

    insert into public.mailing_contact_events (email, source, source_ref)
    values (v_send.email, 'brevo_' || p_event_type, v_send.id::text);
  end if;

  return v_event_id;
end;
$$;

grant execute on function public.record_campaign_event(text, text, jsonb) to service_role;

-- ======================================================================
-- 4. process_pending_campaign_events — called by drain on every tick
-- ======================================================================
-- For every row in email_campaign_events_pending:
--   - If a send now matches brevo_message_id → promote it by calling
--     record_campaign_event (which inserts + updates + side-effects),
--     then delete the pending row.
--   - Else if pending row is older than p_max_age_hours → archive to
--     email_campaign_events_orphan and delete from pending. Forensic
--     only, no further processing.
--
-- Returns { promoted, orphaned, scanned }.

create or replace function public.process_pending_campaign_events(
  p_max_age_hours int default 24,
  p_batch_size int default 500
)
returns table (promoted int, orphaned int, scanned int)
language plpgsql security definer
set search_path = public
as $$
declare
  v_row public.email_campaign_events_pending;
  v_promoted int := 0;
  v_orphaned int := 0;
  v_scanned int := 0;
  v_send_exists boolean;
  v_cutoff timestamptz;
begin
  v_cutoff := now() - make_interval(hours => greatest(coalesce(p_max_age_hours, 24), 1));

  for v_row in
    select *
    from public.email_campaign_events_pending
    order by created_at asc
    limit greatest(coalesce(p_batch_size, 500), 1)
  loop
    v_scanned := v_scanned + 1;
    select exists(
      select 1 from public.email_campaign_sends
      where brevo_message_id = v_row.brevo_message_id
    ) into v_send_exists;

    if v_send_exists then
      -- Re-enter record_campaign_event for the side-effects (update send,
      -- insert event row, flip contact). Row is deleted afterward.
      perform public.record_campaign_event(
        v_row.brevo_message_id,
        v_row.event_type,
        coalesce(v_row.payload, '{}'::jsonb)
          || jsonb_build_object('occurred_at', v_row.occurred_at)
      );
      delete from public.email_campaign_events_pending where id = v_row.id;
      v_promoted := v_promoted + 1;
    elsif v_row.created_at < v_cutoff then
      insert into public.email_campaign_events_orphan
        (brevo_message_id, event_type, occurred_at, payload, attempts, first_seen_at)
      values
        (v_row.brevo_message_id, v_row.event_type, v_row.occurred_at,
         v_row.payload, v_row.attempts, v_row.created_at);
      delete from public.email_campaign_events_pending where id = v_row.id;
      v_orphaned := v_orphaned + 1;
    else
      update public.email_campaign_events_pending
      set attempts = attempts + 1,
          last_attempted_at = now()
      where id = v_row.id;
    end if;
  end loop;

  return query select v_promoted, v_orphaned, v_scanned;
end;
$$;

grant execute on function public.process_pending_campaign_events(int, int)
  to service_role;
