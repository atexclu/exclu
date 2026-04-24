-- 153_campaign_send_status_counts_rpc.sql
-- Exact per-status counts for a single campaign's email_campaign_sends.
--
-- Needed by the admin Recipients panel: the filter pills display
-- counts per status (Queued / Sent / Delivered / Bounced / …). Running
-- this through PostgREST by fetching every row and counting client-side
-- is bounded by the default max-rows (1000), which silently truncates
-- for any campaign with 1001+ recipients. This RPC does the aggregation
-- in Postgres and returns a single JSON object.

create or replace function public.campaign_send_status_counts(p_campaign_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
  from (
    select status, count(*)::int as n
    from public.email_campaign_sends
    where campaign_id = p_campaign_id
    group by status
  ) t;
$$;

grant execute on function public.campaign_send_status_counts(uuid) to service_role;
