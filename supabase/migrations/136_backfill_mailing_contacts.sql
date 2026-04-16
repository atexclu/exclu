-- 136_backfill_mailing_contacts.sql
-- Phase 3 (Part B.1) — one-shot backfill of `mailing_contacts` from every
-- source where the platform already captured a fan or user email. Runs
-- ONCE at deploy time and is idempotent (ON CONFLICT DO NOTHING on the
-- contacts table, NOT EXISTS guard on the events table).
--
-- Priority for first-source assignment (first table wins):
--   1. auth.users       → role = creator / fan, first_source = 'backfill_signup'
--   2. purchases        → role = fan, first_source = 'backfill_link_purchase'
--   3. tips             → role = fan, first_source = 'backfill_tip'
--   4. custom_requests  → role = fan, first_source = 'backfill_custom_request'
--   5. guest_sessions   → role = fan, first_source = 'backfill_guest_chat'
--
-- `gift_purchases.fan_email` is brand-new (added in 135), so there's
-- nothing to backfill from gifts in this run. Going forward,
-- ugp-listener captures it.
--
-- A single 'backfill' event is written per contact so the admin UI shows
-- a "seeded from migration 136" marker in the events log. Post-deploy,
-- real capture events accumulate normally.

-- ======================================================================
-- Pass 1: auth.users + profiles → most authoritative source
-- ======================================================================
insert into public.mailing_contacts
  (email, display_name, role, first_source, last_source, first_seen_at, last_seen_at)
select
  lower(trim(u.email)),
  coalesce(
    nullif(trim(p.display_name), ''),
    split_part(u.email, '@', 1)
  ),
  case
    when p.is_creator = true then 'creator'
    else 'fan'
  end,
  'backfill_signup',
  'backfill_signup',
  u.created_at,
  coalesce(u.last_sign_in_at, u.created_at)
from auth.users u
left join public.profiles p on p.id = u.id
where u.email is not null
  and length(trim(u.email)) > 0
on conflict (email) do nothing;

-- ======================================================================
-- Pass 2: purchases.buyer_email
-- ======================================================================
insert into public.mailing_contacts
  (email, display_name, role, first_source, last_source, first_seen_at, last_seen_at)
select
  lower(trim(buyer_email)),
  null,                          -- purchases have no display name
  'fan',
  'backfill_link_purchase',
  'backfill_link_purchase',
  min(created_at),
  max(created_at)
from public.purchases
where buyer_email is not null
  and length(trim(buyer_email)) > 0
group by lower(trim(buyer_email))
on conflict (email) do update set
  -- If the contact exists (likely from pass 1), only bump last_seen_at to
  -- the most recent transactional interaction. Do NOT update role, source,
  -- or display_name — pass 1 is more authoritative.
  last_seen_at = greatest(public.mailing_contacts.last_seen_at, excluded.last_seen_at);

-- ======================================================================
-- Pass 3: tips.fan_email
-- ======================================================================
insert into public.mailing_contacts
  (email, display_name, role, first_source, last_source, first_seen_at, last_seen_at)
select
  lower(trim(fan_email)),
  null,
  'fan',
  'backfill_tip',
  'backfill_tip',
  min(created_at),
  max(created_at)
from public.tips
where fan_email is not null
  and length(trim(fan_email)) > 0
group by lower(trim(fan_email))
on conflict (email) do update set
  last_seen_at = greatest(public.mailing_contacts.last_seen_at, excluded.last_seen_at);

-- ======================================================================
-- Pass 4: custom_requests.fan_email
-- ======================================================================
insert into public.mailing_contacts
  (email, display_name, role, first_source, last_source, first_seen_at, last_seen_at)
select
  lower(trim(fan_email)),
  null,
  'fan',
  'backfill_custom_request',
  'backfill_custom_request',
  min(created_at),
  max(created_at)
from public.custom_requests
where fan_email is not null
  and length(trim(fan_email)) > 0
group by lower(trim(fan_email))
on conflict (email) do update set
  last_seen_at = greatest(public.mailing_contacts.last_seen_at, excluded.last_seen_at);

-- ======================================================================
-- Pass 5: guest_sessions.email
-- ======================================================================
insert into public.mailing_contacts
  (email, display_name, role, first_source, last_source, first_seen_at, last_seen_at)
select
  lower(trim(email)),
  null,
  'fan',
  'backfill_guest_chat',
  'backfill_guest_chat',
  min(created_at),
  max(created_at)
from public.guest_sessions
where email is not null
  and length(trim(email)) > 0
group by lower(trim(email))
on conflict (email) do update set
  last_seen_at = greatest(public.mailing_contacts.last_seen_at, excluded.last_seen_at);

-- ======================================================================
-- Events: one 'backfill' event per contact so the audit log isn't empty
-- after the seed. Guarded with NOT EXISTS so re-running the migration
-- doesn't duplicate events.
-- ======================================================================
insert into public.mailing_contact_events (email, source, source_ref, occurred_at)
select mc.email, 'backfill', 'migration_136', mc.first_seen_at
from public.mailing_contacts mc
where not exists (
  select 1 from public.mailing_contact_events e
  where e.email = mc.email and e.source = 'backfill'
);
