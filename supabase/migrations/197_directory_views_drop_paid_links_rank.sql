-- 197_directory_views_drop_paid_links_rank.sql
--
-- Auto-fallback ordering used to give a tier to "has at least one paid link",
-- which silently outranked higher-traffic creators with no paid links yet.
-- Drop that tier — within Pro/non-Pro, views alone drive the order. Featured
-- and manually-positioned curation still come first.

-- ── PUBLIC VIEW ──
drop view if exists public.v_directory_creators;

create view public.v_directory_creators
with (security_invoker = true)
as
with paid_links as (
  select creator_id, count(*)::int as paid_links_count
  from public.links
  where status = 'published' and price_cents > 0
  group by creator_id
),
admin_users as (select id from public.profiles where is_admin = true)
select
  cp.id                                       as creator_profile_id,
  cp.user_id                                  as user_id,
  cp.username                                 as username,
  cp.display_name                             as display_name,
  cp.avatar_url                               as avatar_url,
  cp.bio                                      as bio,
  cp.country                                  as country,
  cp.city                                     as city,
  cp.niche                                    as niche,
  cp.model_categories                         as model_categories,
  cp.profile_view_count                       as profile_view_count,
  cp.created_at                               as created_at,
  coalesce(pl.paid_links_count, 0)            as paid_links_count,
  coalesce(p.is_creator_subscribed, false)    as is_premium,
  dc.category                                 as category,
  coalesce(dc.is_featured, false)             as is_featured,
  dc.position                                 as position,
  coalesce(dc.is_hidden, false)               as is_hidden_for_category,
  case
    when coalesce(dc.is_featured, false) then 1
    when dc.position is not null then 2
    when coalesce(p.is_creator_subscribed, false) then 3
    else 4
  end                                         as display_rank
from public.creator_profiles cp
left join public.profiles p on p.id = cp.user_id
left join paid_links pl on pl.creator_id = cp.user_id
left join public.directory_curation dc
       on dc.creator_id = cp.id and dc.category is null
where cp.is_active = true
  and cp.deleted_at is null
  and cp.avatar_url is not null
  and cp.is_directory_visible = true
  and cp.user_id not in (select id from admin_users);

grant select on public.v_directory_creators to anon, authenticated;

-- ── ADMIN VIEW ──
drop view if exists public.v_directory_creators_admin;

create view public.v_directory_creators_admin
with (security_invoker = true)
as
with paid_links as (
  select creator_id, count(*)::int as paid_links_count
  from public.links
  where status = 'published' and price_cents > 0
  group by creator_id
),
assets_per_creator as (
  select creator_id, count(*)::int as assets_count
  from public.assets
  where deleted_at is null
  group by creator_id
),
admin_users as (select id from public.profiles where is_admin = true)
select
  cp.id                                       as creator_profile_id,
  cp.user_id                                  as user_id,
  cp.username                                 as username,
  cp.display_name                             as display_name,
  cp.avatar_url                               as avatar_url,
  cp.bio                                      as bio,
  cp.country                                  as country,
  cp.city                                     as city,
  cp.niche                                    as niche,
  cp.model_categories                         as model_categories,
  cp.profile_view_count                       as profile_view_count,
  cp.is_directory_visible                     as is_directory_visible,
  cp.created_at                               as created_at,
  coalesce(pl.paid_links_count, 0)            as paid_links_count,
  coalesce(ap.assets_count, 0)                as assets_count,
  coalesce(p.is_creator_subscribed, false)    as is_premium,
  coalesce(p.total_earned_cents, 0)::bigint   as total_earned_cents,
  dc.category                                 as category,
  coalesce(dc.is_featured, false)             as is_featured,
  dc.position                                 as position,
  coalesce(dc.is_hidden, false)               as is_hidden_for_category,
  case
    when coalesce(dc.is_featured, false) then 1
    when dc.position is not null then 2
    when coalesce(p.is_creator_subscribed, false) then 3
    else 4
  end                                         as display_rank
from public.creator_profiles cp
left join public.profiles p on p.id = cp.user_id
left join paid_links pl on pl.creator_id = cp.user_id
left join assets_per_creator ap on ap.creator_id = cp.user_id
left join public.directory_curation dc
       on dc.creator_id = cp.id and dc.category is null
where cp.is_active = true
  and cp.deleted_at is null
  and cp.is_directory_visible = true
  and cp.user_id not in (select id from admin_users);

grant select on public.v_directory_creators_admin to authenticated;
