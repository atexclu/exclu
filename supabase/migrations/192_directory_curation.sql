-- 192_directory_curation.sql
--
-- Admin curation layer for /directory/creators.
--
-- Adds:
--   * directory_curation table — per-(creator, category) overrides
--     (featured pin, hidden-from-this-category, manual position).
--     A row with category = NULL represents the global "Featured" tab.
--   * v_directory_creators view — materializes the public ordering rules so
--     /directory/creators (React + future SSR) reads a single source of truth.
--   * RPCs admin_set_directory_curation / admin_reorder_directory.
--
-- Global hide remains creator_profiles.is_directory_visible. directory_curation.is_hidden
-- only hides the creator from one specific category. So a creator marked
-- non-visible globally never appears anywhere; a creator visible globally can
-- still be hidden from category X via directory_curation.

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.directory_curation (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references public.creator_profiles(id) on delete cascade,
  category     text,
  position     integer,
  is_featured  boolean not null default false,
  is_hidden    boolean not null default false,
  updated_by   uuid references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- One curation row per (creator, category). Postgres treats NULLs as distinct
-- in unique indexes, so we need two partial indexes to enforce uniqueness on
-- both the per-category rows and the single global row.
create unique index if not exists directory_curation_creator_category_uniq
  on public.directory_curation (creator_id, category)
  where category is not null;

create unique index if not exists directory_curation_creator_global_uniq
  on public.directory_curation (creator_id)
  where category is null;

-- Hot path: per-category public render (featured first, then curated position,
-- nulls last for the unpositioned curated entries).
create index if not exists directory_curation_category_render_idx
  on public.directory_curation (category, is_featured desc, position asc nulls last)
  where is_hidden = false;

create index if not exists directory_curation_creator_idx
  on public.directory_curation (creator_id);

-- updated_at auto-bump (no shared moddatetime extension in this repo).
create or replace function public.touch_directory_curation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_directory_curation_updated_at on public.directory_curation;
create trigger trg_directory_curation_updated_at
  before update on public.directory_curation
  for each row execute function public.touch_directory_curation_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.directory_curation enable row level security;

-- Public read: anon + authenticated can SELECT (the view leans on this).
drop policy if exists directory_curation_select_public on public.directory_curation;
create policy directory_curation_select_public
  on public.directory_curation
  for select
  using (true);

-- Writes restricted to admins.
drop policy if exists directory_curation_admin_write on public.directory_curation;
create policy directory_curation_admin_write
  on public.directory_curation
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.is_admin = true
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- VIEW: v_directory_creators
--
-- One row per (creator_profile, category-bucket). For the global "Featured"
-- tab and the public /directory/creators feed, callers query
-- where category is null. For a per-category view, query where category = X.
--
-- display_rank semantics (smaller = earlier):
--   1 = featured (curation_is_featured = true)
--   2 = curated  (curation row exists with non-null position, not featured)
--   3 = premium fallback (no curation, is_premium = true)
--   4 = has-paid-links fallback (no curation, paid_links_count > 0)
--   5 = rest (no curation, no paid links, not premium)
--
-- Callers order by: display_rank asc, position asc nulls last,
-- profile_view_count desc, created_at desc.
--
-- Hidden filtering:
--   * is_directory_visible = false → row excluded entirely (global hide).
--   * is_hidden_for_category = true → caller filters this column out for
--     the specific category they're rendering.
-- ─────────────────────────────────────────────────────────────────────────────

drop view if exists public.v_directory_creators;

create view public.v_directory_creators
with (security_invoker = true)
as
with paid_links as (
  select
    creator_id,
    count(*)::int as paid_links_count
  from public.links
  where status = 'published'
    and price_cents > 0
  group by creator_id
),
admin_users as (
  select id from public.profiles where is_admin = true
)
select
  cp.id                                 as creator_profile_id,
  cp.user_id                            as user_id,
  cp.username                           as username,
  cp.display_name                       as display_name,
  cp.avatar_url                         as avatar_url,
  cp.bio                                as bio,
  cp.country                            as country,
  cp.city                               as city,
  cp.niche                              as niche,
  cp.model_categories                   as model_categories,
  cp.profile_view_count                 as profile_view_count,
  cp.created_at                         as created_at,
  coalesce(pl.paid_links_count, 0)      as paid_links_count,
  coalesce(p.is_creator_subscribed, false) as is_premium,
  dc.category                           as category,
  coalesce(dc.is_featured, false)       as is_featured,
  dc.position                           as position,
  coalesce(dc.is_hidden, false)         as is_hidden_for_category,
  case
    when coalesce(dc.is_featured, false) then 1
    when dc.position is not null then 2
    when coalesce(p.is_creator_subscribed, false) then 3
    when coalesce(pl.paid_links_count, 0) > 0 then 4
    else 5
  end                                   as display_rank
from public.creator_profiles cp
left join public.profiles p on p.id = cp.user_id
left join paid_links pl on pl.creator_id = cp.user_id
left join public.directory_curation dc on dc.creator_id = cp.id
where cp.is_active = true
  and cp.deleted_at is null
  and cp.avatar_url is not null
  and cp.is_directory_visible = true
  and cp.user_id not in (select id from admin_users);

grant select on public.v_directory_creators to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: admin_set_directory_curation
--
-- Upserts a single curation row. patch is a JSON object that may contain any
-- subset of: is_featured (bool), is_hidden (bool), position (int|null).
-- Missing keys are left untouched on update.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_set_directory_curation(
  p_creator_id  uuid,
  p_category    text,
  p_patch       jsonb
)
returns public.directory_curation
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.directory_curation;
  v_admin   boolean;
  v_uid     uuid := auth.uid();
  v_feat    boolean;
  v_hide    boolean;
  v_pos     integer;
  v_has_feat boolean;
  v_has_hide boolean;
  v_has_pos  boolean;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select is_admin into v_admin from public.profiles where id = v_uid;
  if not coalesce(v_admin, false) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  v_has_feat := p_patch ? 'is_featured';
  v_has_hide := p_patch ? 'is_hidden';
  v_has_pos  := p_patch ? 'position';

  if v_has_feat then v_feat := (p_patch ->> 'is_featured')::boolean; end if;
  if v_has_hide then v_hide := (p_patch ->> 'is_hidden')::boolean; end if;
  if v_has_pos then
    if jsonb_typeof(p_patch -> 'position') = 'null' then
      v_pos := null;
    else
      v_pos := (p_patch ->> 'position')::integer;
    end if;
  end if;

  -- Find existing row; cannot rely on ON CONFLICT because (creator_id, category)
  -- with NULL category isn't covered by a single unique index.
  select *
    into v_row
    from public.directory_curation
   where creator_id = p_creator_id
     and (
       (p_category is null and category is null)
       or category = p_category
     )
   limit 1;

  if v_row.id is null then
    insert into public.directory_curation (
      creator_id, category, is_featured, is_hidden, position, updated_by
    ) values (
      p_creator_id,
      p_category,
      coalesce(v_feat, false),
      coalesce(v_hide, false),
      v_pos,
      v_uid
    )
    returning * into v_row;
  else
    update public.directory_curation
       set is_featured = case when v_has_feat then v_feat else is_featured end,
           is_hidden   = case when v_has_hide then v_hide else is_hidden   end,
           position    = case when v_has_pos  then v_pos  else position    end,
           updated_by  = v_uid
     where id = v_row.id
     returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_set_directory_curation(uuid, text, jsonb) from public;
grant execute on function public.admin_set_directory_curation(uuid, text, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: admin_reorder_directory
--
-- Rewrites position in batch for the given category. ordered_creator_ids is
-- an array of creator_profile.id in display order (index 0 = first slot).
-- Only the listed creators are updated; others keep their existing position.
-- Use category = NULL for the global "Featured" tab.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_reorder_directory(
  p_category            text,
  p_ordered_creator_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_idx   integer;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select is_admin into v_admin from public.profiles where id = v_uid;
  if not coalesce(v_admin, false) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  for v_idx in 1 .. coalesce(array_length(p_ordered_creator_ids, 1), 0) loop
    v_id := p_ordered_creator_ids[v_idx];

    insert into public.directory_curation (
      creator_id, category, position, updated_by
    ) values (
      v_id, p_category, v_idx - 1, v_uid
    )
    on conflict do nothing;

    update public.directory_curation
       set position   = v_idx - 1,
           updated_by = v_uid
     where creator_id = v_id
       and (
         (p_category is null and category is null)
         or category = p_category
       );
  end loop;
end;
$$;

revoke all on function public.admin_reorder_directory(text, uuid[]) from public;
grant execute on function public.admin_reorder_directory(text, uuid[]) to authenticated;
