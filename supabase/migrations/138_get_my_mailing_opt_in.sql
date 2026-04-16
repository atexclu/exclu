-- 138_get_my_mailing_opt_in.sql
-- Phase 4.5 — Companion read RPC for the Settings "Communications" toggle.
-- The Settings UI needs to display the current opt-in state; mailing_contacts
-- itself is admin-only via RLS, so we expose a narrow SECURITY DEFINER helper
-- that only returns the caller's own flag.

create or replace function public.get_my_mailing_opt_in()
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_opted_in boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'get_my_mailing_opt_in: authentication required';
  end if;

  select lower(email) into v_email
  from auth.users
  where id = v_user_id;

  if v_email is null or v_email = '' then
    return true;  -- No email on account → default to opted-in (matches column default)
  end if;

  select marketing_opted_in into v_opted_in
  from public.mailing_contacts
  where email = v_email;

  -- If no row yet (legacy user who never transacted and signed up before 137),
  -- return true — the column default — so the toggle reflects the soft opt-in
  -- they granted at signup. First toggle-off will create the row.
  return coalesce(v_opted_in, true);
end;
$$;

grant execute on function public.get_my_mailing_opt_in() to authenticated;
