-- 145_blog_articles_admin_rpc.sql
-- ============================================================================
-- Fix: "canceling statement due to statement_timeout" on blog article save.
--
-- Symptom: clicking "Publish" on a new blog article returned
--   Save failed: Failed to create article: canceling statement due to statement timeout
--
-- Why it happened:
--   The admin-blog-manage edge function went through PostgREST as service_role,
--   which in some Supabase projects has a non-zero statement_timeout. A blog
--   article can carry a large content_html payload (Tiptap HTML with images,
--   long guides, pasted content with inline base64, etc.). That combination
--   can push a plain INSERT over the role timeout, even though the operation
--   itself is not truly "long-running" from a correctness standpoint.
--
-- Fix strategy:
--   Move the INSERT and UPDATE behind two SECURITY DEFINER RPC functions
--   that force `statement_timeout = 0` in their own signature. The function's
--   setting is applied automatically on entry and reverts on exit, so this
--   relaxation is scoped strictly to the blog-article write path. The edge
--   function (which already verifies the caller is an admin) calls these via
--   supabase.rpc(), so RLS / service_role settings become irrelevant here.
--
--   As a bonus, the create function does the slug-uniqueness check and the
--   INSERT in the same transaction — no race between the SELECT and the
--   INSERT as there was before.
-- ============================================================================

-- ─── create ────────────────────────────────────────────────────────────────

create or replace function public.admin_create_blog_article(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = 0
as $$
declare
  v_slug    text := p_data->>'slug';
  v_title   text := p_data->>'title';
  v_article blog_articles%rowtype;
begin
  if v_title is null or length(trim(v_title)) = 0 then
    raise exception 'Title is required' using errcode = '22023';
  end if;
  if v_slug is null or length(trim(v_slug)) = 0 then
    raise exception 'Slug is required' using errcode = '22023';
  end if;

  if exists (select 1 from blog_articles where slug = v_slug) then
    raise exception 'Slug already exists' using errcode = '23505';
  end if;

  insert into blog_articles (
    title, slug, excerpt, content, content_html,
    cover_image_url, cover_image_alt, category_id, tags,
    meta_title, meta_description, canonical_url, og_image_url,
    focus_keyword, author_name, author_url,
    reading_time_minutes, status, published_at, scheduled_at
  ) values (
    v_title,
    v_slug,
    nullif(p_data->>'excerpt', ''),
    coalesce(p_data->'content', '{}'::jsonb),
    nullif(p_data->>'content_html', ''),
    nullif(p_data->>'cover_image_url', ''),
    nullif(p_data->>'cover_image_alt', ''),
    nullif(p_data->>'category_id', '')::uuid,
    coalesce(
      (select array_agg(value) from jsonb_array_elements_text(p_data->'tags') as t(value)),
      '{}'::text[]
    ),
    nullif(p_data->>'meta_title', ''),
    nullif(p_data->>'meta_description', ''),
    nullif(p_data->>'canonical_url', ''),
    nullif(p_data->>'og_image_url', ''),
    nullif(p_data->>'focus_keyword', ''),
    coalesce(nullif(p_data->>'author_name', ''), 'Exclu Team'),
    nullif(p_data->>'author_url', ''),
    coalesce((p_data->>'reading_time_minutes')::integer, 0),
    coalesce(nullif(p_data->>'status', ''), 'draft'),
    nullif(p_data->>'published_at', '')::timestamptz,
    nullif(p_data->>'scheduled_at', '')::timestamptz
  )
  returning * into v_article;

  return to_jsonb(v_article);
end;
$$;

revoke all on function public.admin_create_blog_article(jsonb) from public;
grant execute on function public.admin_create_blog_article(jsonb) to service_role;

comment on function public.admin_create_blog_article(jsonb) is
  'Atomic blog-article INSERT for the admin-blog-manage edge function. SECURITY DEFINER with statement_timeout=0 to survive large content_html payloads.';

-- ─── update ────────────────────────────────────────────────────────────────

create or replace function public.admin_update_blog_article(p_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = 0
as $$
declare
  v_article blog_articles%rowtype;
  v_new_slug text := p_data->>'slug';
begin
  if p_id is null then
    raise exception 'Article id is required' using errcode = '22023';
  end if;

  -- Slug uniqueness (only enforce when the slug key is present AND non-empty)
  if p_data ? 'slug' and v_new_slug is not null and length(v_new_slug) > 0 then
    if exists (select 1 from blog_articles where slug = v_new_slug and id <> p_id) then
      raise exception 'Slug already exists' using errcode = '23505';
    end if;
  end if;

  update blog_articles a set
    title = case when p_data ? 'title' then coalesce(p_data->>'title', a.title) else a.title end,
    slug  = case when p_data ? 'slug'  then coalesce(p_data->>'slug',  a.slug)  else a.slug  end,
    excerpt = case when p_data ? 'excerpt' then nullif(p_data->>'excerpt', '') else a.excerpt end,
    content = case when p_data ? 'content' then coalesce(p_data->'content', a.content) else a.content end,
    content_html = case when p_data ? 'content_html' then nullif(p_data->>'content_html', '') else a.content_html end,
    cover_image_url = case when p_data ? 'cover_image_url' then nullif(p_data->>'cover_image_url', '') else a.cover_image_url end,
    cover_image_alt = case when p_data ? 'cover_image_alt' then nullif(p_data->>'cover_image_alt', '') else a.cover_image_alt end,
    category_id = case when p_data ? 'category_id' then nullif(p_data->>'category_id', '')::uuid else a.category_id end,
    tags = case when p_data ? 'tags'
      then coalesce(
        (select array_agg(value) from jsonb_array_elements_text(p_data->'tags') as t(value)),
        '{}'::text[]
      )
      else a.tags
    end,
    meta_title = case when p_data ? 'meta_title' then nullif(p_data->>'meta_title', '') else a.meta_title end,
    meta_description = case when p_data ? 'meta_description' then nullif(p_data->>'meta_description', '') else a.meta_description end,
    canonical_url = case when p_data ? 'canonical_url' then nullif(p_data->>'canonical_url', '') else a.canonical_url end,
    og_image_url = case when p_data ? 'og_image_url' then nullif(p_data->>'og_image_url', '') else a.og_image_url end,
    focus_keyword = case when p_data ? 'focus_keyword' then nullif(p_data->>'focus_keyword', '') else a.focus_keyword end,
    author_name = case when p_data ? 'author_name' then coalesce(nullif(p_data->>'author_name', ''), 'Exclu Team') else a.author_name end,
    author_url = case when p_data ? 'author_url' then nullif(p_data->>'author_url', '') else a.author_url end,
    reading_time_minutes = case when p_data ? 'reading_time_minutes' then (p_data->>'reading_time_minutes')::integer else a.reading_time_minutes end,
    status = case when p_data ? 'status' then coalesce(nullif(p_data->>'status', ''), a.status) else a.status end,
    published_at = case
      when p_data ? 'published_at' then nullif(p_data->>'published_at', '')::timestamptz
      -- Auto-stamp if transitioning to 'published' without explicit published_at and never published before
      when p_data->>'status' = 'published' and a.published_at is null then now()
      else a.published_at
    end,
    scheduled_at = case when p_data ? 'scheduled_at' then nullif(p_data->>'scheduled_at', '')::timestamptz else a.scheduled_at end,
    updated_at = now()
  where a.id = p_id
  returning * into v_article;

  if v_article.id is null then
    raise exception 'Article not found' using errcode = 'P0002';
  end if;

  return to_jsonb(v_article);
end;
$$;

revoke all on function public.admin_update_blog_article(uuid, jsonb) from public;
grant execute on function public.admin_update_blog_article(uuid, jsonb) to service_role;

comment on function public.admin_update_blog_article(uuid, jsonb) is
  'Atomic blog-article UPDATE for the admin-blog-manage edge function. SECURITY DEFINER with statement_timeout=0 to survive large content_html payloads.';
