-- 166_fan_subscription_refactor.sql
-- fan_creator_subscriptions was designed for QuickPay plans with a fixed
-- QUICKPAY_FAN_SUB_PLAN_ID (which was never provisioned). Refactor to the
-- same one-shot-Sale + /recurringtransactions model as creator Pro.

alter table fan_creator_subscriptions
  add column if not exists ugp_mid text,
  add column if not exists next_rebill_at timestamptz,
  add column if not exists suspended_at timestamptz;

-- ugp_transaction_id already exists on this table (added in 147_fan_creator_subscriptions.sql)
-- price_cents already exists and is locked at subscribe time (grandfathered semantics)

-- Backfill next_rebill_at from period_end for any currently active rows
update fan_creator_subscriptions
  set next_rebill_at = period_end
  where status = 'active' and next_rebill_at is null;

create index if not exists fan_subs_next_rebill_idx
  on fan_creator_subscriptions(next_rebill_at)
  where status = 'active' and suspended_at is null and cancel_at_period_end = false;
