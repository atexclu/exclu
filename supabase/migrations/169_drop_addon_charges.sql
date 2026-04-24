-- 169_drop_addon_charges.sql
-- addon_charges was the legacy wallet-debit log for creator Pro extra profiles.
-- Replaced by the new rebill-subscriptions cron flow (Task 4.3) which charges
-- the full amount (base + extras) to the card each cycle. The table is no
-- longer written by any edge function (chargeProfileAddons is deleted in this
-- same task) and no dashboard reads from it.
drop table if exists public.addon_charges;
