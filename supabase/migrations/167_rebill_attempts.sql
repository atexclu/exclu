-- 167_rebill_attempts.sql
-- Tracks every /recurringtransactions call with outcome for monitoring,
-- retry decisions, reconciliation, and idempotency (D8 — UG does not dedupe).
--
-- Idempotency model: before any POST to /recurringtransactions we INSERT a
-- row with status='pending' + a cycle_bucket derived from the billing cycle
-- end date. A unique constraint on (subject_table, subject_id, cycle_bucket)
-- causes the INSERT to fail if another cron run is already working this
-- cycle — we skip on 23505. After the API responds (or the listener postback
-- arrives — D9 echoes the id as TrackingId) we UPDATE the row in place.

create table if not exists rebill_attempts (
  id uuid primary key default gen_random_uuid(),
  subject_table text not null check (subject_table in ('profiles', 'fan_creator_subscriptions')),
  subject_id uuid not null,
  ugp_mid text not null,
  reference_transaction_id text not null,
  amount_cents int not null,
  currency text not null default 'USD',
  cycle_bucket date not null,                          -- DATE(period_end) at INSERT time
  attempt_number int not null default 1,
  status text not null check (status in ('pending', 'success', 'declined', 'error', 'transient')),
  ugp_response jsonb,
  ugp_transaction_id text,                             -- the NEW rebill TID from UG
  reason_code text,
  message text,
  responded_at timestamptz,                            -- when the sync JSON response came back
  listener_confirmed_at timestamptz,                   -- when the async ListenerURL postback was received
  created_at timestamptz not null default now(),
  constraint rebill_attempts_cycle_unique unique (subject_table, subject_id, cycle_bucket)
);

create index rebill_attempts_subject_idx on rebill_attempts(subject_table, subject_id, created_at desc);
create index rebill_attempts_status_idx on rebill_attempts(status, created_at desc);
create index rebill_attempts_listener_pending_idx
  on rebill_attempts(status, listener_confirmed_at)
  where status = 'success' and listener_confirmed_at is null;
