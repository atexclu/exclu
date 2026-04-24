-- 154_mailing_contacts_email_format.sql
-- Tighten email-format enforcement on our marketing pipeline.
--
-- Why: the Welcome campaign hit 2 Brevo "invalid email" failures on rows
-- like `info@hannahperez` and `vaxagaw525@1200b`. These addresses exist
-- because a handful of users submitted the signup form before finishing
-- typing the TLD (e.g. they hit Enter while still on `…@gmail` before
-- `.com`), and no server-side validator rejected them. The client-side
-- regex in src/pages/Auth.tsx was only added on 2026-04-10 — every
-- malformed row in mailing_contacts predates it.
--
-- This migration closes the gap at the DB boundary so the same problem
-- cannot sneak in again via any signup path, backfill, or manual import:
--   1. Purge existing malformed rows from mailing_contacts + their audit
--      children (mailing_contact_events, email_suppression_list) so the
--      CHECK constraint can be added cleanly.
--   2. Add a CHECK constraint that requires `local@host.tld` with at
--      least a 2-letter TLD.
--
-- The regex is intentionally conservative — it matches what Brevo's
-- accepted-recipient validator accepts. Anything this rejects would
-- fail at Brevo anyway, so blocking it at insert time saves a wasted
-- send + a failed-tile in the admin UI.
--
-- Regex (POSIX, case-insensitive via ~*):
--   ^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$

-- ------------------------------------------------------------------------
-- 1. Purge malformed rows
-- ------------------------------------------------------------------------

with bad as (
  select email
  from public.mailing_contacts
  where email is null
     or email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
)
delete from public.mailing_contact_events
where email in (select email from bad);

with bad as (
  select email
  from public.mailing_contacts
  where email is null
     or email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
)
delete from public.email_suppressions
where email in (select email from bad);

delete from public.mailing_contacts
where email is null
   or email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$';

-- ------------------------------------------------------------------------
-- 2. Add CHECK constraint (idempotent)
-- ------------------------------------------------------------------------

alter table public.mailing_contacts
  drop constraint if exists mailing_contacts_email_format_chk;

alter table public.mailing_contacts
  add constraint mailing_contacts_email_format_chk
  check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');
