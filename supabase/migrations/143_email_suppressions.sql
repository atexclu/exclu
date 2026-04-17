-- 143_email_suppressions.sql
-- Phase 6.3 — Active suppression list.
--
-- Before: hard bounces + complaints flipped mailing_contacts.marketing_opted_in
-- to false, but (a) a second CSV import could reset that flag and silently
-- re-add the address, and (b) transactional flows never checked whether an
-- address was poisoning deliverability.
--
-- This migration introduces an authoritative, append-only suppression
-- registry that is:
--   - Written to by record_campaign_event on terminal negative events
--     (hard_bounce, complained, invalid_email).
--   - Checked by resolve_campaign_segment (campaigns never re-target a
--     suppressed address).
--   - Exposed via is_email_suppressed(email) for transactional callers.
--
-- A second job (sync-brevo-blocklist, not in this migration) will push
-- suppressions into Brevo's Contacts blocklist so that even a rogue code
-- path that calls Brevo directly still drops on the platform side.

-- ======================================================================
-- 1. Enum + table
-- ======================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'email_suppression_reason') then
    create type email_suppression_reason as enum (
      'hard_bounce',
      'complaint',
      'invalid_email',
      'role_address',
      'manual',
      'gdpr_delete'
    );
  end if;
end$$;

create table if not exists public.email_suppressions (
  email text primary key,                                  -- lowercase
  reason email_suppression_reason not null,
  source text,                                             -- 'brevo_webhook' | 'admin' | 'validation' | 'gdpr_request'
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  brevo_synced_at timestamptz,                             -- stamp when we last pushed to Brevo blocklist
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_suppressions_reason_idx
  on public.email_suppressions(reason);
create index if not exists email_suppressions_pending_sync_idx
  on public.email_suppressions(updated_at)
  where brevo_synced_at is null;

create or replace function public.email_suppressions_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists email_suppressions_touch_trg on public.email_suppressions;
create trigger email_suppressions_touch_trg
  before update on public.email_suppressions
  for each row execute function public.email_suppressions_touch();

-- ======================================================================
-- 2. RLS — admin-only read; writes via service role only
-- ======================================================================

alter table public.email_suppressions enable row level security;

drop policy if exists "admins read email_suppressions" on public.email_suppressions;
create policy "admins read email_suppressions"
  on public.email_suppressions for select
  using (public.is_admin());

grant select on public.email_suppressions to authenticated, service_role;

-- ======================================================================
-- 3. add_email_suppression RPC — upsert entry
-- ======================================================================
-- Callers: record_campaign_event (auto), admin-manage-suppressions (manual),
-- validation pipelines (invalid_email). Lowercase + trim enforced.

create or replace function public.add_email_suppression(
  p_email text,
  p_reason email_suppression_reason,
  p_source text default null,
  p_notes text default null
)
returns public.email_suppressions
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text;
  v_row public.email_suppressions;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'add_email_suppression: invalid email %', p_email;
  end if;

  insert into public.email_suppressions (email, reason, source, notes)
  values (v_email, p_reason, nullif(trim(coalesce(p_source, '')), ''), nullif(trim(coalesce(p_notes, '')), ''))
  on conflict (email) do update set
    -- Never downgrade: 'hard_bounce'/'complaint' outrank 'manual'/'gdpr_delete' for dedup purposes,
    -- but we keep the FIRST reason and just bump last_seen_at. Admin override is always welcome.
    reason = case
      when excluded.reason = 'manual' then excluded.reason   -- admin override
      else public.email_suppressions.reason
    end,
    source = coalesce(excluded.source, public.email_suppressions.source),
    last_seen_at = now(),
    notes = coalesce(excluded.notes, public.email_suppressions.notes),
    brevo_synced_at = null                                   -- re-sync on change
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.add_email_suppression(text, email_suppression_reason, text, text)
  to service_role;

-- ======================================================================
-- 4. is_email_suppressed RPC — for transactional callers
-- ======================================================================

create or replace function public.is_email_suppressed(p_email text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(
    select 1 from public.email_suppressions
    where email = lower(trim(coalesce(p_email, '')))
  );
$$;

grant execute on function public.is_email_suppressed(text)
  to service_role, authenticated;

-- ======================================================================
-- 5. Wire record_campaign_event to auto-suppress hard negatives
-- ======================================================================
-- We replace the function created in 142 so the suppression insert
-- happens in the same transaction as the mailing_contacts flip. This
-- guarantees that a hard_bounce never leaves mailing_contacts+suppressions
-- in an inconsistent state.

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
  v_suppression_reason email_suppression_reason;
begin
  if p_brevo_message_id is null or length(trim(p_brevo_message_id)) = 0 then
    raise exception 'record_campaign_event: missing brevo_message_id';
  end if;
  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'record_campaign_event: missing event_type';
  end if;

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

  -- Terminal negative events → flip mailing_contacts opt-in + audit log.
  if p_event_type in ('unsubscribed','complained','bounced') then
    update public.mailing_contacts
    set marketing_opted_in = false,
        marketing_opted_out_at = coalesce(marketing_opted_out_at, now()),
        updated_at = now()
    where email = v_send.email;

    insert into public.mailing_contact_events (email, source, source_ref)
    values (v_send.email, 'brevo_' || p_event_type, v_send.id::text);
  end if;

  -- Authoritative suppression: hard_bounce + complaint are terminal and
  -- permanent for reputation purposes; invalid_email from Brevo too.
  -- We do NOT suppress on 'unsubscribed' (that's a reversible opt-out
  -- handled by mailing_contacts only).
  v_suppression_reason := case p_event_type
    when 'bounced' then 'hard_bounce'::email_suppression_reason
    when 'complained' then 'complaint'::email_suppression_reason
    when 'failed' then 'invalid_email'::email_suppression_reason
    else null
  end;

  if v_suppression_reason is not null then
    perform public.add_email_suppression(
      v_send.email,
      v_suppression_reason,
      'brevo_webhook',
      format('auto-suppressed from %s on send %s', p_event_type, v_send.id)
    );
  end if;

  return v_event_id;
end;
$$;

grant execute on function public.record_campaign_event(text, text, jsonb) to service_role;

-- ======================================================================
-- 6. Filter resolve_campaign_segment to exclude suppressed addresses
-- ======================================================================
-- Suppressions are a HARD floor — even a segment rule that matches the
-- contact row (still opted-in for some reason) must not target them.

create or replace function public.resolve_campaign_segment(p_rules jsonb)
returns table (
  email text,
  display_name text,
  role text,
  first_source text,
  last_seen_at timestamptz,
  has_account boolean
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_roles text[];
  v_sources text[];
  v_has_account boolean;
  v_last_seen_after timestamptz;
  v_email_contains text;
begin
  if p_rules ? 'role' and jsonb_typeof(p_rules->'role') = 'array' then
    select array_agg(x::text) into v_roles
    from jsonb_array_elements_text(p_rules->'role') x;
  end if;

  if p_rules ? 'first_source_in' and jsonb_typeof(p_rules->'first_source_in') = 'array' then
    select array_agg(x::text) into v_sources
    from jsonb_array_elements_text(p_rules->'first_source_in') x;
  end if;

  if p_rules ? 'has_account' and jsonb_typeof(p_rules->'has_account') = 'boolean' then
    v_has_account := (p_rules->>'has_account')::boolean;
  end if;

  if p_rules ? 'last_seen_after' and (p_rules->>'last_seen_after') <> '' then
    begin
      v_last_seen_after := (p_rules->>'last_seen_after')::timestamptz;
    exception when others then
      v_last_seen_after := null;
    end;
  end if;

  if p_rules ? 'email_contains' and length(trim(p_rules->>'email_contains')) > 0 then
    v_email_contains := lower(trim(p_rules->>'email_contains'));
  end if;

  return query
  select
    v.email,
    v.display_name,
    v.role,
    v.first_source,
    v.last_seen_at,
    v.has_account
  from public.mailing_contacts_with_account v
  where v.marketing_opted_in = true
    and not exists (
      select 1 from public.email_suppressions s where s.email = v.email
    )
    and (v_roles is null or v.role = any(v_roles))
    and (v_sources is null or v.first_source = any(v_sources))
    and (v_has_account is null or v.has_account = v_has_account)
    and (v_last_seen_after is null or v.last_seen_at >= v_last_seen_after)
    and (v_email_contains is null or v.email like '%' || v_email_contains || '%');
end;
$$;

grant execute on function public.resolve_campaign_segment(jsonb) to service_role;

-- ======================================================================
-- 7. Backfill — seed suppressions from existing mailing_contact_events
-- ======================================================================
-- Every contact that was opted out by a past brevo_bounced / brevo_complained
-- event must land in the suppression list now. Idempotent.

insert into public.email_suppressions (email, reason, source, first_seen_at, last_seen_at, notes)
select
  e.email,
  case
    when e.source = 'brevo_bounced' then 'hard_bounce'::email_suppression_reason
    when e.source = 'brevo_complained' then 'complaint'::email_suppression_reason
    else 'manual'::email_suppression_reason
  end,
  'backfill_migration_143',
  min(e.occurred_at),
  max(e.occurred_at),
  'backfilled from mailing_contact_events'
from public.mailing_contact_events e
where e.source in ('brevo_bounced', 'brevo_complained')
group by e.email, e.source
on conflict (email) do nothing;
