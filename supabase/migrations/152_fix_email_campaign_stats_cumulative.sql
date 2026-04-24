-- 152_fix_email_campaign_stats_cumulative.sql
-- Fix admin UI "Delivered 0 / 0.0%" metric.
--
-- The view counted funnel states NON-cumulatively for `delivered_count`:
--
--   count(*) filter (where s.status = 'delivered')    as delivered_count
--
-- But email_campaign_sends.status transitions forward through the funnel
-- (delivered → opened → clicked) inside record_campaign_event. So as soon
-- as Brevo posts an `opened` webhook, the row exits `delivered_count` and
-- never comes back — even though the email was in fact delivered.
--
-- Confirmed on 2026-04-21: 2 delivered events recorded, yet the view
-- reports delivered_count=0 for every campaign because opened/clicked
-- events followed and overwrote the status.
--
-- Rewrite:
--   sent_count       = reached Brevo pipeline (all downstream states,
--                      incl. bounced/complained/unsubscribed so bounce-
--                      rate = bounced/sent is a meaningful ratio)
--   delivered_count  = accepted by recipient MTA (delivered|opened|clicked)
--   opened_count     = opened at least once (opened|clicked)
--   clicked_count    = clicked (terminal positive)
--
-- Column order preserved from migration 141 (adds retrying_count after
-- queued_count) so CREATE OR REPLACE VIEW accepts the swap without a
-- schema drop.

create or replace view public.email_campaign_stats as
select
  c.id as campaign_id,
  c.name,
  c.status,
  c.total_recipients,
  c.started_at,
  c.finished_at,
  count(*) filter (
    where s.status in ('sent','delivered','opened','clicked',
                       'bounced','complained','unsubscribed')
  )::int as sent_count,
  count(*) filter (
    where s.status in ('delivered','opened','clicked')
  )::int as delivered_count,
  count(*) filter (where s.status in ('opened','clicked'))::int as opened_count,
  count(*) filter (where s.status = 'clicked')::int            as clicked_count,
  count(*) filter (where s.status = 'bounced')::int            as bounced_count,
  count(*) filter (where s.status = 'complained')::int         as complained_count,
  count(*) filter (where s.status = 'unsubscribed')::int       as unsubscribed_count,
  count(*) filter (where s.status = 'failed')::int             as failed_count,
  count(*) filter (where s.status in ('queued','retrying'))::int as queued_count,
  count(*) filter (where s.status = 'retrying')::int           as retrying_count
from public.email_campaigns c
left join public.email_campaign_sends s on s.campaign_id = c.id
group by c.id, c.name, c.status, c.total_recipients, c.started_at, c.finished_at;

grant select on public.email_campaign_stats to authenticated, service_role;
