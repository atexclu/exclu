-- 135_mailing_contacts.sql
-- Phase 3 (Part B.1) — central fan/user email registry for transactional
-- audit AND outbound marketing. Every email the platform ever captures
-- (signup, link purchase, tip, gift, custom request, guest chat) upserts
-- a row here. A VIEW joins to auth.users so the admin UI can distinguish
-- contacts who registered an account from contacts who only left an email
-- during a checkout.
--
-- Tables:
--   mailing_contacts         — one row per unique email (canonical lowercase)
--   mailing_contact_events   — append-only log of every capture event
--
-- View:
--   mailing_contacts_with_account — mailing_contacts LEFT JOIN auth.users
--                                    + profiles, exposes has_account flag
--
-- RPC:
--   upsert_mailing_contact(...) — called by edge functions to register
--                                 a new email or update an existing row
--
-- Side-car:
--   gift_purchases.fan_email (new column) — wire will capture it going
--   forward; Phase 1 preflight flagged this as missing.

-- ======================================================================
-- 1. Extend gift_purchases with fan_email (was missing vs other checkouts)
-- ======================================================================

alter table public.gift_purchases
  add column if not exists fan_email text;

create index if not exists gift_purchases_fan_email_idx
  on public.gift_purchases(fan_email)
  where fan_email is not null;

-- ======================================================================
-- 2. mailing_contacts — canonical email registry
-- ======================================================================

create table if not exists public.mailing_contacts (
  email text primary key,                      -- lowercase, trimmed
  display_name text,                            -- first-name / handle if known
  role text not null default 'unknown'
    check (role in ('fan', 'creator', 'agency', 'chatter', 'unknown')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_source text not null,                   -- 'signup', 'link_purchase', etc.
  last_source text not null,
  marketing_opted_in boolean not null default true,
  marketing_opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mailing_contacts_last_seen_idx
  on public.mailing_contacts(last_seen_at desc);
create index if not exists mailing_contacts_role_idx
  on public.mailing_contacts(role);
create index if not exists mailing_contacts_opted_in_idx
  on public.mailing_contacts(marketing_opted_in)
  where marketing_opted_in = true;

create or replace function public.mailing_contacts_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mailing_contacts_touch_trg on public.mailing_contacts;
create trigger mailing_contacts_touch_trg
  before update on public.mailing_contacts
  for each row execute function public.mailing_contacts_touch();

-- ======================================================================
-- 3. mailing_contact_events — append-only audit log
-- ======================================================================

create table if not exists public.mailing_contact_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null,
  source_ref text,           -- purchase_id, tip_id, gift_id, request_id, session_id
  occurred_at timestamptz not null default now()
);

create index if not exists mailing_contact_events_email_idx
  on public.mailing_contact_events(email, occurred_at desc);
create index if not exists mailing_contact_events_source_idx
  on public.mailing_contact_events(source, occurred_at desc);

-- ======================================================================
-- 4. upsert_mailing_contact RPC
-- ======================================================================

-- SECURITY DEFINER so callers (edge functions with service_role OR in-DB
-- triggers) can invoke it without needing direct INSERT privileges on the
-- underlying tables. Service role already bypasses RLS so this is mainly
-- for future DB-trigger callers.
create or replace function public.upsert_mailing_contact(
  p_email text,
  p_source text,
  p_source_ref text default null,
  p_role text default 'unknown',
  p_display_name text default null
) returns public.mailing_contacts
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text;
  v_contact public.mailing_contacts;
begin
  -- Normalize + basic shape validation
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'upsert_mailing_contact: invalid email %', p_email;
  end if;

  -- Upsert into mailing_contacts
  insert into public.mailing_contacts
    (email, display_name, role, first_source, last_source, last_seen_at)
  values
    (v_email, nullif(trim(coalesce(p_display_name, '')), ''),
     coalesce(p_role, 'unknown'), p_source, p_source, now())
  on conflict (email) do update set
    -- Only upgrade role from 'unknown' to a specific role; never demote.
    role = case
      when public.mailing_contacts.role = 'unknown' then excluded.role
      else public.mailing_contacts.role
    end,
    -- Preserve existing display_name unless we now have a non-empty one
    -- and the current value is null.
    display_name = coalesce(public.mailing_contacts.display_name, excluded.display_name),
    last_source = excluded.last_source,
    last_seen_at = excluded.last_seen_at,
    updated_at = now()
  returning * into v_contact;

  -- Always record the event (even if this was an update)
  insert into public.mailing_contact_events (email, source, source_ref)
  values (v_email, p_source, p_source_ref);

  return v_contact;
end;
$$;

-- ======================================================================
-- 5. mailing_contacts_with_account VIEW — always-fresh has_account flag
-- ======================================================================

-- This view is the source of truth for the admin "Contacts" list. It
-- joins LEFT to auth.users so contacts without an account show
-- has_account=false, and brings over profile role flags for UI badges.
create or replace view public.mailing_contacts_with_account as
select
  mc.email,
  mc.display_name,
  mc.role,
  mc.first_seen_at,
  mc.last_seen_at,
  mc.first_source,
  mc.last_source,
  mc.marketing_opted_in,
  mc.marketing_opted_out_at,
  mc.created_at,
  mc.updated_at,
  u.id as user_id,
  (u.id is not null) as has_account,
  u.email_confirmed_at as account_email_confirmed_at,
  u.last_sign_in_at as account_last_sign_in_at,
  p.is_creator as profile_is_creator,
  p.is_admin as profile_is_admin,
  p.handle as profile_handle
from public.mailing_contacts mc
left join auth.users u on lower(u.email) = mc.email
left join public.profiles p on p.id = u.id;

-- ======================================================================
-- 6. RLS
-- ======================================================================

alter table public.mailing_contacts enable row level security;
alter table public.mailing_contact_events enable row level security;

-- Admin-only read. No insert/update/delete policies: service role (used by
-- upsert_mailing_contact + edge fns) bypasses RLS, and no other role
-- should ever mutate these tables directly.
drop policy if exists "admins read mailing contacts" on public.mailing_contacts;
create policy "admins read mailing contacts"
  on public.mailing_contacts for select
  using (public.is_admin());

drop policy if exists "admins read mailing contact events" on public.mailing_contact_events;
create policy "admins read mailing contact events"
  on public.mailing_contact_events for select
  using (public.is_admin());

-- Views inherit RLS from their underlying tables. mailing_contacts_with_account
-- joins to auth.users + profiles — both are already RLS-secured, and the
-- underlying mailing_contacts SELECT requires is_admin(). Safe.

-- ======================================================================
-- 7. Grants for PostgREST access
-- ======================================================================

-- Let the admin UI (authenticated with an admin JWT) query the view.
-- RLS still gates the actual row visibility via public.is_admin().
grant select on public.mailing_contacts to authenticated, service_role;
grant select on public.mailing_contact_events to authenticated, service_role;
grant select on public.mailing_contacts_with_account to authenticated, service_role;
grant execute on function public.upsert_mailing_contact(text, text, text, text, text)
  to service_role;
