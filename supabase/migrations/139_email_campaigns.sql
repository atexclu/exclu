-- 139_email_campaigns.sql
-- Phase 5 — Bulk campaigns (admin-only CRUD + queue-backed delivery).
--
-- Tables:
--   email_campaign_segments — reusable recipient rules (JSONB)
--   email_campaigns         — one row per campaign (draft → sent)
--   email_campaign_sends    — one row per recipient per campaign (queue + status)
--   email_campaign_events   — append-only log of Brevo webhook events
--
-- Helper views:
--   email_campaign_stats    — aggregated sent/open/click/bounce/unsub per campaign
--
-- Helper RPCs:
--   resolve_campaign_segment(p_rules jsonb) → setof mailing_contact_row
--       Given rules, returns the list of opted-in mailing_contacts.
--       Used by the admin UI for live count + by drain-campaign-sends to enqueue.
--   set_campaign_sent_status(p_send_id uuid, p_status text, p_brevo_message_id text, p_error text)
--       Called by drain-campaign-sends after a Brevo API call returns.
--   record_campaign_event(p_brevo_message_id text, p_event_type text, p_meta jsonb)
--       Called by brevo-webhook to append an event + flip mailing_contacts
--       on unsubscribe/complaint.
--
-- Design notes:
--   * Sends go through Brevo's TRANSACTIONAL API, not their campaign API,
--     so each recipient gets a per-recipient HMAC unsub URL and we keep
--     full control over rate + content. brevo_campaign_id on
--     email_campaigns is reserved for a future admin-side dashboard link.
--   * Warmup cap is enforced in drain-campaign-sends (SQL only counts
--     sends per day, the actual limit lives in the edge fn).
--   * RLS is admin-only on all 4 tables. Service role bypasses it and is
--     the only writer after drain-campaign-sends + brevo-webhook.

-- ======================================================================
-- 1. email_campaign_segments
-- ======================================================================

create table if not exists public.email_campaign_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- Rules shape (enforced by the resolve RPC, not at DB level):
  --   {
  --     role: ['fan', 'creator', 'agency', 'chatter'] | null,
  --     has_account: true | false | null,
  --     last_seen_after: '2026-01-01' | null,
  --     first_source_in: ['signup', 'link_purchase'] | null,
  --     email_contains: 'substring' | null,
  --     -- marketing_opted_in is ALWAYS forced to true in resolve (never in rules)
  --   }
  rules jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_campaign_segments_name_idx
  on public.email_campaign_segments(name);

create or replace function public.email_campaign_segments_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists email_campaign_segments_touch_trg on public.email_campaign_segments;
create trigger email_campaign_segments_touch_trg
  before update on public.email_campaign_segments
  for each row execute function public.email_campaign_segments_touch();

-- ======================================================================
-- 2. email_campaigns
-- ======================================================================

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  preheader text,
  html_content text not null,
  tag text,
  segment_id uuid references public.email_campaign_segments(id) on delete set null,
  -- Inline snapshot of the rules at start-of-send time. Guarantees that
  -- mutating a segment after a campaign has started doesn't change who
  -- it ships to.
  resolved_rules jsonb,
  status text not null default 'draft'
    check (status in ('draft','scheduled','sending','sent','cancelled','failed')),
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  total_recipients int,
  brevo_campaign_id bigint,           -- reserved; we use transactional API
  last_error text,                    -- surfaced to UI when status=failed
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_campaigns_status_idx
  on public.email_campaigns(status);
create index if not exists email_campaigns_scheduled_idx
  on public.email_campaigns(scheduled_at)
  where status = 'scheduled';
create index if not exists email_campaigns_created_idx
  on public.email_campaigns(created_at desc);

create or replace function public.email_campaigns_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists email_campaigns_touch_trg on public.email_campaigns;
create trigger email_campaigns_touch_trg
  before update on public.email_campaigns
  for each row execute function public.email_campaigns_touch();

-- ======================================================================
-- 3. email_campaign_sends — per-recipient queue row
-- ======================================================================

create table if not exists public.email_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  email text not null,                  -- lowercase match to mailing_contacts
  status text not null default 'queued'
    check (status in ('queued','sending','sent','delivered','opened','clicked',
                      'bounced','complained','unsubscribed','failed','skipped')),
  brevo_message_id text,
  sent_at timestamptz,
  last_event_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent double-queuing the same email for the same campaign.
create unique index if not exists email_campaign_sends_unique_email_per_campaign
  on public.email_campaign_sends(campaign_id, email);

create index if not exists email_campaign_sends_queue_idx
  on public.email_campaign_sends(status, campaign_id)
  where status in ('queued','sending');

create index if not exists email_campaign_sends_brevo_msg_idx
  on public.email_campaign_sends(brevo_message_id)
  where brevo_message_id is not null;

create index if not exists email_campaign_sends_sent_at_idx
  on public.email_campaign_sends(sent_at desc)
  where sent_at is not null;

create or replace function public.email_campaign_sends_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists email_campaign_sends_touch_trg on public.email_campaign_sends;
create trigger email_campaign_sends_touch_trg
  before update on public.email_campaign_sends
  for each row execute function public.email_campaign_sends_touch();

-- ======================================================================
-- 4. email_campaign_events — append-only log of Brevo webhook events
-- ======================================================================

create table if not exists public.email_campaign_events (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references public.email_campaign_sends(id) on delete cascade,
  event_type text not null
    check (event_type in ('sent','delivered','opened','clicked','bounced',
                          'complained','unsubscribed','failed','soft_bounced','blocked')),
  occurred_at timestamptz not null default now(),
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_campaign_events_send_idx
  on public.email_campaign_events(send_id, occurred_at desc);
create index if not exists email_campaign_events_type_idx
  on public.email_campaign_events(event_type, occurred_at desc);

-- ======================================================================
-- 5. email_campaign_stats — per-campaign aggregated counters
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
  count(*) filter (where s.status = 'queued')::int                                    as queued_count
from public.email_campaigns c
left join public.email_campaign_sends s on s.campaign_id = c.id
group by c.id, c.name, c.status, c.total_recipients, c.started_at, c.finished_at;

-- ======================================================================
-- 6. resolve_campaign_segment RPC
-- ======================================================================
-- Given a rules JSONB (same shape as email_campaign_segments.rules),
-- return the list of opted-in mailing_contacts rows that match.
-- `marketing_opted_in = true` is ALWAYS applied regardless of rules.

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
  -- Parse rules (all optional)
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
    and (v_roles is null or v.role = any(v_roles))
    and (v_sources is null or v.first_source = any(v_sources))
    and (v_has_account is null or v.has_account = v_has_account)
    and (v_last_seen_after is null or v.last_seen_at >= v_last_seen_after)
    and (v_email_contains is null or v.email like '%' || v_email_contains || '%');
end;
$$;

grant execute on function public.resolve_campaign_segment(jsonb) to service_role;

-- ======================================================================
-- 7. record_campaign_event RPC — brevo-webhook helper
-- ======================================================================
-- Accepts a Brevo message_id and an event type, finds the matching send
-- row, appends an event, updates the send status, and for terminal
-- negative events (unsubscribed/complained) flips the contact's
-- mailing_opted_in flag so we never hit them again.

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
begin
  if p_brevo_message_id is null or length(trim(p_brevo_message_id)) = 0 then
    raise exception 'record_campaign_event: missing brevo_message_id';
  end if;
  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'record_campaign_event: missing event_type';
  end if;

  select * into v_send
  from public.email_campaign_sends
  where brevo_message_id = p_brevo_message_id
  limit 1;

  if v_send is null then
    -- Webhook arrived before we recorded the send (race) or for a send
    -- we no longer track. Insert an orphan event record on a synthetic
    -- send-id is not possible with the FK, so we silently drop.
    return null;
  end if;

  insert into public.email_campaign_events (send_id, event_type, meta, occurred_at)
  values (v_send.id, p_event_type, p_meta, now())
  returning id into v_event_id;

  -- Map event type → send status (never downgrade happy-path terminal states)
  v_new_send_status := case p_event_type
    when 'delivered' then 'delivered'
    when 'opened' then
      case when v_send.status in ('clicked') then v_send.status
      else 'opened' end
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

  -- Flip the contact's opt-in for terminal negative events so future
  -- campaigns never target them again. Hard bounce + complaint + explicit
  -- Brevo unsubscribe all land here.
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
-- 8. count_campaign_sends_today — warmup cap helper
-- ======================================================================

create or replace function public.count_campaign_sends_today()
returns int
language sql stable security definer
set search_path = public
as $$
  select coalesce(count(*)::int, 0)
  from public.email_campaign_sends
  where sent_at >= date_trunc('day', now() at time zone 'UTC');
$$;

grant execute on function public.count_campaign_sends_today() to service_role;

-- ======================================================================
-- 9. RLS — admin-only SELECT, writes via service role
-- ======================================================================

alter table public.email_campaign_segments enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_sends enable row level security;
alter table public.email_campaign_events enable row level security;

drop policy if exists "admins read email_campaign_segments" on public.email_campaign_segments;
create policy "admins read email_campaign_segments"
  on public.email_campaign_segments for select
  using (public.is_admin());

drop policy if exists "admins read email_campaigns" on public.email_campaigns;
create policy "admins read email_campaigns"
  on public.email_campaigns for select
  using (public.is_admin());

drop policy if exists "admins read email_campaign_sends" on public.email_campaign_sends;
create policy "admins read email_campaign_sends"
  on public.email_campaign_sends for select
  using (public.is_admin());

drop policy if exists "admins read email_campaign_events" on public.email_campaign_events;
create policy "admins read email_campaign_events"
  on public.email_campaign_events for select
  using (public.is_admin());

-- ======================================================================
-- 10. Grants for PostgREST access (admin UI queries through the view)
-- ======================================================================

grant select on public.email_campaign_segments to authenticated, service_role;
grant select on public.email_campaigns to authenticated, service_role;
grant select on public.email_campaign_sends to authenticated, service_role;
grant select on public.email_campaign_events to authenticated, service_role;
grant select on public.email_campaign_stats to authenticated, service_role;
