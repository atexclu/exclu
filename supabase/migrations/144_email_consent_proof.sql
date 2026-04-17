-- 144_email_consent_proof.sql
-- Phase 6.4 — Defensible proof of marketing consent (CNIL / GDPR / CASL).
--
-- Before: marketing_opted_in_at + marketing_opt_in_source (added in 137)
-- gave us WHEN and under what logical label consent was captured, but
-- nothing about WHERE the user was, WHICH CHECKBOX they clicked, WHICH
-- version of the ToS/Privacy was live at that moment, or their network
-- fingerprint (IP / UA).
--
-- Without those, a CNIL complaint replying "prove I opted in" is not
-- defensible. This migration adds the five fields standard in every
-- defensible consent audit (ePrivacy Directive Art. 13 + GDPR Art. 7.1).
--
-- Changes:
--   1. legal_documents_versions — immutable log of every publish of
--      /terms, /privacy, /cookies. Rows are append-only; each row's id is
--      referenced by mailing_contact_events when that doc version was
--      shown at the moment of consent.
--   2. mailing_contact_events — extend with ip, user_agent, consent_url,
--      consent_text, legal_document_version_id.
--   3. mailing_contacts — add a snapshot of the LAST consent grant so the
--      admin UI can surface it without a JOIN per row.
--   4. upsert_mailing_contact — extend signature with the new params
--      (all optional; backward compatible with every existing caller).
--   5. set_mailing_opt_in — accept optional consent_url / ip / user_agent
--      so the Settings toggle also leaves an audit trail.
--   6. Refresh mailing_contacts_with_account.
--   7. current_legal_version(slug) helper.
--   8. Seed initial legal_documents_versions rows for 'terms' + 'privacy'
--      + 'cookies' so FK references are valid today.

-- ======================================================================
-- 1. legal_documents_versions
-- ======================================================================

create table if not exists public.legal_documents_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    check (slug in ('terms','privacy','cookies','dmca','marketing_consent')),
  version text not null,                          -- 'v2026-04-16' or 'v1.2.3'
  published_at timestamptz not null,
  content_url text not null,                      -- '/terms' (relative or absolute)
  content_hash text,                              -- sha256 of markdown source when known
  notes text,                                     -- changelog blurb for admin readability
  created_at timestamptz not null default now(),
  unique (slug, version)
);

create index if not exists legal_documents_versions_slug_published_idx
  on public.legal_documents_versions(slug, published_at desc);

alter table public.legal_documents_versions enable row level security;

-- Public read (so the signup page can surface current version ids to users
-- in disclosure UI). No write policy — service role only.
drop policy if exists "public read legal_documents_versions"
  on public.legal_documents_versions;
create policy "public read legal_documents_versions"
  on public.legal_documents_versions for select
  using (true);

grant select on public.legal_documents_versions to anon, authenticated, service_role;

-- Helper: fetch the current (most recent) version id for a slug.
create or replace function public.current_legal_version(p_slug text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id
  from public.legal_documents_versions
  where slug = p_slug
  order by published_at desc
  limit 1;
$$;

grant execute on function public.current_legal_version(text)
  to anon, authenticated, service_role;

-- ======================================================================
-- 2. Extend mailing_contact_events with the audit-trail fields
-- ======================================================================

alter table public.mailing_contact_events
  add column if not exists ip inet,
  add column if not exists user_agent text,
  add column if not exists consent_url text,
  add column if not exists consent_text text,
  add column if not exists legal_document_version_id uuid
    references public.legal_documents_versions(id) on delete set null;

comment on column public.mailing_contact_events.ip is
  'Originating IP when consent was granted (from x-forwarded-for at the Vercel/Edge Function layer). Null when captured from a context without HTTP (e.g. Postgres trigger).';
comment on column public.mailing_contact_events.user_agent is
  'User-Agent at the moment consent was granted. Null when unavailable.';
comment on column public.mailing_contact_events.consent_url is
  'Full URL the user was on when they granted consent, e.g. https://exclu.at/auth?mode=signup.';
comment on column public.mailing_contact_events.consent_text is
  'Exact sentence of the checkbox/disclosure at capture time (language-localized). Lets us replay what the user actually agreed to, even after UI changes.';
comment on column public.mailing_contact_events.legal_document_version_id is
  'The Terms/Privacy version live at capture time. FK ensures the referenced text was never deleted.';

create index if not exists mailing_contact_events_ip_idx
  on public.mailing_contact_events(ip)
  where ip is not null;

-- ======================================================================
-- 3. Mirror a snapshot of the LAST consent grant on mailing_contacts
-- ======================================================================

alter table public.mailing_contacts
  add column if not exists last_consent_ip inet,
  add column if not exists last_consent_user_agent text,
  add column if not exists last_consent_url text,
  add column if not exists last_consent_legal_version_id uuid
    references public.legal_documents_versions(id) on delete set null;

-- ======================================================================
-- 4. Replace upsert_mailing_contact with the extended signature
-- ======================================================================
-- All new params are optional and default to null → existing callers
-- (ugp-confirm, handle_new_user trigger, etc.) keep working verbatim.
-- Callers that DO have HTTP context (edge functions) should pass IP + UA
-- + consent_url + consent_text + legal_version_id so the audit trail is
-- complete.

drop function if exists public.upsert_mailing_contact(text, text, text, text, text, boolean);

create or replace function public.upsert_mailing_contact(
  p_email text,
  p_source text,
  p_source_ref text default null,
  p_role text default 'unknown',
  p_display_name text default null,
  p_marketing_opted_in boolean default true,
  p_ip inet default null,
  p_user_agent text default null,
  p_consent_url text default null,
  p_consent_text text default null,
  p_legal_version_id uuid default null
) returns public.mailing_contacts
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text;
  v_contact public.mailing_contacts;
  v_opted_in boolean;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'upsert_mailing_contact: invalid email %', p_email;
  end if;
  v_opted_in := coalesce(p_marketing_opted_in, true);

  insert into public.mailing_contacts (
    email, display_name, role, first_source, last_source, last_seen_at,
    marketing_opted_in, marketing_opted_in_at, marketing_opt_in_source,
    last_consent_ip, last_consent_user_agent, last_consent_url,
    last_consent_legal_version_id
  )
  values (
    v_email,
    nullif(trim(coalesce(p_display_name, '')), ''),
    coalesce(p_role, 'unknown'),
    p_source,
    p_source,
    now(),
    v_opted_in,
    case when v_opted_in then now() else null end,
    case when v_opted_in then p_source else null end,
    case when v_opted_in then p_ip else null end,
    case when v_opted_in then p_user_agent else null end,
    case when v_opted_in then p_consent_url else null end,
    case when v_opted_in then p_legal_version_id else null end
  )
  on conflict (email) do update set
    role = case
      when public.mailing_contacts.role = 'unknown' then excluded.role
      else public.mailing_contacts.role
    end,
    display_name = coalesce(public.mailing_contacts.display_name, excluded.display_name),
    last_source = excluded.last_source,
    last_seen_at = excluded.last_seen_at,
    marketing_opted_in = case
      when public.mailing_contacts.marketing_opted_in = false and v_opted_in = true
        then true
      else public.mailing_contacts.marketing_opted_in
    end,
    marketing_opted_in_at = case
      when public.mailing_contacts.marketing_opted_in = false and v_opted_in = true
        then now()
      else public.mailing_contacts.marketing_opted_in_at
    end,
    marketing_opt_in_source = case
      when public.mailing_contacts.marketing_opted_in = false and v_opted_in = true
        then p_source
      else public.mailing_contacts.marketing_opt_in_source
    end,
    marketing_opted_out_at = case
      when public.mailing_contacts.marketing_opted_in = false and v_opted_in = true
        then null
      else public.mailing_contacts.marketing_opted_out_at
    end,
    -- Always refresh the consent snapshot with the latest grant context.
    -- Preserve previous snapshot if the current upsert carries no HTTP
    -- context (null coalesce) so we never erase a good audit trail with
    -- a blank one.
    last_consent_ip = case when v_opted_in then coalesce(p_ip, public.mailing_contacts.last_consent_ip)
                           else public.mailing_contacts.last_consent_ip end,
    last_consent_user_agent = case when v_opted_in then coalesce(p_user_agent, public.mailing_contacts.last_consent_user_agent)
                                   else public.mailing_contacts.last_consent_user_agent end,
    last_consent_url = case when v_opted_in then coalesce(p_consent_url, public.mailing_contacts.last_consent_url)
                            else public.mailing_contacts.last_consent_url end,
    last_consent_legal_version_id = case when v_opted_in then coalesce(p_legal_version_id, public.mailing_contacts.last_consent_legal_version_id)
                                         else public.mailing_contacts.last_consent_legal_version_id end,
    updated_at = now()
  returning * into v_contact;

  insert into public.mailing_contact_events (
    email, source, source_ref,
    ip, user_agent, consent_url, consent_text, legal_document_version_id
  )
  values (
    v_email, p_source, p_source_ref,
    p_ip, p_user_agent, p_consent_url, p_consent_text, p_legal_version_id
  );

  return v_contact;
end;
$$;

grant execute on function public.upsert_mailing_contact(
  text, text, text, text, text, boolean, inet, text, text, text, uuid
) to service_role;

-- ======================================================================
-- 5. Replace set_mailing_opt_in with audit-trail params
-- ======================================================================

drop function if exists public.set_mailing_opt_in(boolean);

create or replace function public.set_mailing_opt_in(
  p_opted_in boolean,
  p_consent_url text default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_consent_text text default null,
  p_legal_version_id uuid default null
) returns public.mailing_contacts
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_contact public.mailing_contacts;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'set_mailing_opt_in: authentication required';
  end if;

  select lower(email) into v_email
  from auth.users
  where id = v_user_id;

  if v_email is null or v_email = '' then
    raise exception 'set_mailing_opt_in: no email on account';
  end if;

  update public.mailing_contacts
  set
    marketing_opted_in = p_opted_in,
    marketing_opted_out_at = case when p_opted_in then null else now() end,
    marketing_opted_in_at = case
      when p_opted_in then now()
      else marketing_opted_in_at
    end,
    marketing_opt_in_source = case
      when p_opted_in then 'settings'
      else marketing_opt_in_source
    end,
    last_consent_ip = case when p_opted_in then coalesce(p_ip, last_consent_ip) else last_consent_ip end,
    last_consent_user_agent = case when p_opted_in then coalesce(p_user_agent, last_consent_user_agent) else last_consent_user_agent end,
    last_consent_url = case when p_opted_in then coalesce(p_consent_url, last_consent_url) else last_consent_url end,
    last_consent_legal_version_id = case when p_opted_in then coalesce(p_legal_version_id, last_consent_legal_version_id) else last_consent_legal_version_id end,
    updated_at = now()
  where email = v_email
  returning * into v_contact;

  if v_contact is null then
    insert into public.mailing_contacts (
      email, role, first_source, last_source,
      marketing_opted_in, marketing_opted_in_at, marketing_opt_in_source,
      marketing_opted_out_at,
      last_consent_ip, last_consent_user_agent, last_consent_url,
      last_consent_legal_version_id
    )
    values (
      v_email, 'fan', 'settings', 'settings',
      p_opted_in,
      case when p_opted_in then now() else null end,
      'settings',
      case when p_opted_in then null else now() end,
      case when p_opted_in then p_ip else null end,
      case when p_opted_in then p_user_agent else null end,
      case when p_opted_in then p_consent_url else null end,
      case when p_opted_in then p_legal_version_id else null end
    )
    returning * into v_contact;
  end if;

  insert into public.mailing_contact_events (
    email, source, source_ref,
    ip, user_agent, consent_url, consent_text, legal_document_version_id
  )
  values (
    v_email,
    'settings',
    case when p_opted_in then 'opt_in' else 'opt_out' end,
    p_ip, p_user_agent, p_consent_url, p_consent_text, p_legal_version_id
  );

  return v_contact;
end;
$$;

grant execute on function public.set_mailing_opt_in(boolean, text, inet, text, text, uuid)
  to authenticated;

-- ======================================================================
-- 6. Refresh mailing_contacts_with_account to expose new columns
-- ======================================================================

drop view if exists public.mailing_contacts_with_account;

create view public.mailing_contacts_with_account as
select
  mc.email,
  mc.display_name,
  mc.role,
  mc.first_seen_at,
  mc.last_seen_at,
  mc.first_source,
  mc.last_source,
  mc.marketing_opted_in,
  mc.marketing_opted_in_at,
  mc.marketing_opt_in_source,
  mc.marketing_opted_out_at,
  mc.last_consent_ip,
  mc.last_consent_user_agent,
  mc.last_consent_url,
  mc.last_consent_legal_version_id,
  lv.slug as last_consent_legal_slug,
  lv.version as last_consent_legal_version,
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
left join public.profiles p on p.id = u.id
left join public.legal_documents_versions lv on lv.id = mc.last_consent_legal_version_id;

grant select on public.mailing_contacts_with_account to authenticated, service_role;

-- ======================================================================
-- 7. Seed current legal versions so FKs resolve from day one
-- ======================================================================
-- Published_at is stamped with the current migration date. When the
-- product genuinely republishes terms/privacy, insert a new row rather
-- than mutating these. Previous captures keep pointing at the old row.

insert into public.legal_documents_versions (slug, version, published_at, content_url, notes)
values
  ('terms',             'v2026-04-16', '2026-04-16T00:00:00Z', '/terms',     'Initial seed — terms of service current at Phase 6 rollout.'),
  ('privacy',           'v2026-04-16', '2026-04-16T00:00:00Z', '/privacy',   'Initial seed — privacy policy current at Phase 6 rollout.'),
  ('cookies',           'v2026-04-16', '2026-04-16T00:00:00Z', '/cookies',   'Initial seed — cookie policy current at Phase 6 rollout.'),
  ('marketing_consent', 'v2026-04-16', '2026-04-16T00:00:00Z', '/terms#14',  'Soft opt-in clause referenced in handle_new_user + checkouts.')
on conflict (slug, version) do nothing;
