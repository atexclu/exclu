-- 165_creator_subscription_refactor.sql
-- Schema for the new creator subscription flow:
--   - One-shot Sale at checkout, original ugp_transaction_id stored on the profile
--   - Server-driven monthly rebills via /recurringtransactions
--   - Amount recomputed each cycle from current profile count (Monthly plan)
--   - Annual plan = fixed 239.99 for 365 days, unlimited profiles (soft cap 50)

do $$ begin
  create type subscription_plan_type as enum ('free', 'monthly', 'annual');
exception when duplicate_object then null; end $$;

alter table profiles
  add column if not exists subscription_plan subscription_plan_type not null default 'free',
  add column if not exists subscription_ugp_transaction_id text,
  add column if not exists subscription_mid text,
  add column if not exists subscription_amount_cents int,
  add column if not exists subscription_currency text default 'USD',
  add column if not exists subscription_period_start timestamptz,
  add column if not exists subscription_period_end timestamptz,
  add column if not exists subscription_cancel_at_period_end boolean not null default false,
  add column if not exists subscription_suspended_at timestamptz,
  add column if not exists subscription_last_pro_popup_at timestamptz;

-- Backfill: any profile currently is_creator_subscribed=true is on the legacy plan
update profiles
  set subscription_plan = 'monthly'
  where is_creator_subscribed = true and subscription_plan = 'free';

create index if not exists profiles_subscription_period_end_idx
  on profiles(subscription_period_end)
  where subscription_plan in ('monthly', 'annual') and subscription_suspended_at is null;
