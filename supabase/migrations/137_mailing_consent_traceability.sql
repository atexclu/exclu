-- 137_mailing_consent_traceability.sql
-- Phase 4.5 — Consent traceability for mailing_contacts.
--
-- Product decision (2026-04-16): every account creation (terms checkbox
-- acceptance) AND every paid transaction grants implicit consent for
-- marketing communications — matching ePrivacy Directive Art. 13(2) soft
-- opt-in for existing customers. Users can opt out at any time via:
--   1. Settings toggle in /app/profile (calls set_mailing_opt_in RPC)
--   2. Unsubscribe link in every campaign email (calls Vercel fn)
--
-- This migration:
--   1. Adds traceability columns: WHEN and FROM WHERE consent was granted
--   2. Backfills these columns for existing 4818 contacts
--   3. Extends upsert_mailing_contact RPC with p_marketing_opted_in param
--      (default TRUE preserves current behavior)
--   4. Adds set_mailing_opt_in RPC for the Settings toggle (authenticated
--      users flipping their OWN row only)
--   5. Extends handle_new_user trigger so every new signup immediately
--      appears in mailing_contacts with role + display_name derived from
--      the auth.users row (today only paid transactions wire it)
--   6. Refreshes mailing_contacts_with_account view to expose new cols

-- ======================================================================
-- 1. Traceability columns
-- ======================================================================

alter table public.mailing_contacts
  add column if not exists marketing_opted_in_at timestamptz,
  add column if not exists marketing_opt_in_source text;

comment on column public.mailing_contacts.marketing_opted_in_at is
  'Timestamp when the contact granted marketing consent. Null if never opted in or if currently opted out.';
comment on column public.mailing_contacts.marketing_opt_in_source is
  'How consent was captured: signup, link_purchase, tip, gift, custom_request, settings, backfill.';

-- Backfill traceability for existing rows (4818 contacts). We stamp
-- first_seen_at as the opt-in moment and mark the source as first_source.
update public.mailing_contacts
set
  marketing_opted_in_at = first_seen_at,
  marketing_opt_in_source = first_source
where marketing_opted_in = true
  and marketing_opted_in_at is null;

-- ======================================================================
-- 2. Replace upsert_mailing_contact with new signature (adds p_marketing_opted_in)
-- ======================================================================

-- Drop old 5-arg signature so the new one takes its place. Existing
-- callers use named args + defaults so backward compat is preserved:
-- ugp-confirm only passes p_email/p_source/p_source_ref/p_role/p_display_name,
-- and p_marketing_opted_in defaults to TRUE (matching current behavior).
drop function if exists public.upsert_mailing_contact(text, text, text, text, text);

create or replace function public.upsert_mailing_contact(
  p_email text,
  p_source text,
  p_source_ref text default null,
  p_role text default 'unknown',
  p_display_name text default null,
  p_marketing_opted_in boolean default true
) returns public.mailing_contacts
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text;
  v_contact public.mailing_contacts;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'upsert_mailing_contact: invalid email %', p_email;
  end if;

  insert into public.mailing_contacts
    (email, display_name, role, first_source, last_source, last_seen_at,
     marketing_opted_in, marketing_opted_in_at, marketing_opt_in_source)
  values
    (v_email,
     nullif(trim(coalesce(p_display_name, '')), ''),
     coalesce(p_role, 'unknown'),
     p_source,
     p_source,
     now(),
     coalesce(p_marketing_opted_in, true),
     case when coalesce(p_marketing_opted_in, true) then now() else null end,
     case when coalesce(p_marketing_opted_in, true) then p_source else null end)
  on conflict (email) do update set
    role = case
      when public.mailing_contacts.role = 'unknown' then excluded.role
      else public.mailing_contacts.role
    end,
    display_name = coalesce(public.mailing_contacts.display_name, excluded.display_name),
    last_source = excluded.last_source,
    last_seen_at = excluded.last_seen_at,
    -- Only upgrade marketing_opted_in from false→true, never auto-flip true→false.
    -- Opt-out is explicit and happens via set_mailing_opt_in or unsubscribe flow.
    marketing_opted_in = case
      when public.mailing_contacts.marketing_opted_in = false and coalesce(p_marketing_opted_in, true) = true
        then true
      else public.mailing_contacts.marketing_opted_in
    end,
    marketing_opted_in_at = case
      when public.mailing_contacts.marketing_opted_in = false and coalesce(p_marketing_opted_in, true) = true
        then now()
      else public.mailing_contacts.marketing_opted_in_at
    end,
    marketing_opt_in_source = case
      when public.mailing_contacts.marketing_opted_in = false and coalesce(p_marketing_opted_in, true) = true
        then p_source
      else public.mailing_contacts.marketing_opt_in_source
    end,
    marketing_opted_out_at = case
      when public.mailing_contacts.marketing_opted_in = false and coalesce(p_marketing_opted_in, true) = true
        then null
      else public.mailing_contacts.marketing_opted_out_at
    end,
    updated_at = now()
  returning * into v_contact;

  insert into public.mailing_contact_events (email, source, source_ref)
  values (v_email, p_source, p_source_ref);

  return v_contact;
end;
$$;

grant execute on function public.upsert_mailing_contact(text, text, text, text, text, boolean)
  to service_role;

-- ======================================================================
-- 3. set_mailing_opt_in RPC — Settings toggle (user flips own row)
-- ======================================================================
-- Callers pass only the desired state. The RPC derives the email from
-- auth.uid() → auth.users so a user cannot mutate anyone else's row.
-- The unsubscribe Vercel fn does not use this RPC; it authenticates via
-- HMAC token and uses the service role to UPDATE mailing_contacts
-- directly (RLS bypassed).

create or replace function public.set_mailing_opt_in(
  p_opted_in boolean
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
    updated_at = now()
  where email = v_email
  returning * into v_contact;

  -- If the contact row doesn't exist yet (edge case: user who signed up
  -- before migration 137 wired handle_new_user, and never transacted),
  -- create it in the requested state.
  if v_contact is null then
    insert into public.mailing_contacts
      (email, role, first_source, last_source,
       marketing_opted_in, marketing_opted_in_at, marketing_opt_in_source,
       marketing_opted_out_at)
    values
      (v_email, 'fan', 'settings', 'settings',
       p_opted_in,
       case when p_opted_in then now() else null end,
       'settings',
       case when p_opted_in then null else now() end)
    returning * into v_contact;
  end if;

  insert into public.mailing_contact_events (email, source, source_ref)
  values (
    v_email,
    'settings',
    case when p_opted_in then 'opt_in' else 'opt_out' end
  );

  return v_contact;
end;
$$;

grant execute on function public.set_mailing_opt_in(boolean)
  to authenticated;

-- ======================================================================
-- 4. Extend handle_new_user to wire mailing_contacts on every signup
-- ======================================================================
-- Currently mailing_contacts is populated only by paid transactions via
-- ugp-confirm. New signups (which grant consent via the ToS checkbox)
-- must also land in mailing_contacts. We do the upsert inside a nested
-- BEGIN/EXCEPTION so a failure here never blocks signup.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_creator boolean;
  v_is_chatter boolean;
  v_role user_role;
  v_display_name text;
begin
  v_is_creator := coalesce((new.raw_user_meta_data->>'is_creator')::boolean, true);
  v_is_chatter := coalesce((new.raw_user_meta_data->>'is_chatter')::boolean, false);
  v_display_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'handle',
    split_part(new.email, '@', 1)
  );

  if v_is_chatter then
    v_role := 'chatter'::user_role;
    v_is_creator := false;
  elsif v_is_creator then
    v_role := 'creator'::user_role;
  else
    v_role := 'fan'::user_role;
  end if;

  insert into public.profiles (id, display_name, is_creator, role)
  values (new.id, v_display_name, v_is_creator, v_role)
  on conflict (id) do update
    set display_name = coalesce(excluded.display_name, profiles.display_name),
        role = coalesce(excluded.role, profiles.role);

  if v_is_creator then
    begin
      insert into public.creator_profiles (user_id, display_name, username)
      values (
        new.id,
        v_display_name,
        coalesce(new.raw_user_meta_data->>'handle', 'user_' || left(new.id::text, 8))
      )
      on conflict (user_id) do nothing;
    exception when others then
      raise warning 'handle_new_user: creator_profiles insert failed: %', SQLERRM;
    end;
  end if;

  -- Register the signup in mailing_contacts with implicit consent (terms
  -- checkbox accepted at signup covers marketing per ToS section 14).
  -- Never fail signup if this step errors.
  if new.email is not null and length(trim(new.email)) > 0 then
    begin
      perform public.upsert_mailing_contact(
        p_email := new.email,
        p_source := 'signup',
        p_source_ref := new.id::text,
        p_role := v_role::text,
        p_display_name := v_display_name,
        p_marketing_opted_in := true
      );
    exception when others then
      raise warning 'handle_new_user: mailing_contacts upsert failed: %', SQLERRM;
    end;
  end if;

  return new;
exception when others then
  raise warning 'handle_new_user failed: % %', SQLSTATE, SQLERRM;
  return new;
end;
$$;

-- ======================================================================
-- 5. Refresh view to expose new columns
-- ======================================================================
-- CREATE OR REPLACE VIEW cannot reorder or add columns before existing
-- ones. Drop and recreate. No dependent objects reference this view
-- (admin-list-mailing-contacts queries it through PostgREST, not via a
-- DB-level dependency).

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

grant select on public.mailing_contacts_with_account to authenticated, service_role;
