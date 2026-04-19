-- 149_purchases_status_extend.sql
--
-- Extend purchases.status CHECK constraint to include 'failed' and 'refunded'
-- so the UG reconciliation script (scripts/reconcile-ugp.ts) can mark polluted
-- and abandoned checkouts without tripping the constraint.
--
-- Existing values in prod: pending, succeeded. Adding: failed, refunded.
-- Matches what tips + gift_purchases already allow.

alter table purchases drop constraint if exists purchases_status_check;

alter table purchases add constraint purchases_status_check
  check (status in ('pending', 'succeeded', 'failed', 'refunded'));
