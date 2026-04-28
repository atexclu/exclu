-- Migration 179: Filter soft-deleted users from admin discoverability surfaces.
--
-- Re-defines `admin_list_users` (originally migration 150) to add
-- `deleted_at IS NULL` on the `profiles` scan inside the filter CTE.
-- Soft-deleted users now disappear from the admin users page list, the
-- search/sort/pagination they expose, and any caller that goes through
-- this RPC.
--
-- Signature, return shape, sort options, pagination semantics, and grants
-- are intentionally unchanged — only the WHERE clause gains a single
-- predicate. CREATE OR REPLACE keeps existing callers working with no
-- migration on their side.
--
-- Note: `admin_user_metrics(p_user_id)` is NOT patched here. It is called
-- from `admin-get-user-overview` for a SPECIFIC user_id — that function
-- now refuses to load deleted users at the edge layer (404 guard), so the
-- metrics RPC never receives a deleted user_id. Financial history (sales,
-- payouts, ledger) for already-deleted users remains queryable via direct
-- service-role access for compliance / audit purposes.

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search    text DEFAULT NULL,
  p_page      int  DEFAULT 1,
  p_page_size int  DEFAULT 50,
  p_sort_by   text DEFAULT 'created_desc'
)
RETURNS TABLE (
  id                  uuid,
  display_name        text,
  handle              text,
  email               text,
  avatar_url          text,
  created_at          timestamptz,
  is_creator          boolean,
  is_admin            boolean,
  is_agency           boolean,
  links_count         bigint,
  assets_count        bigint,
  total_sales         bigint,
  total_revenue_cents bigint,
  profile_view_count  integer,
  total_count         bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  WITH params AS (
    SELECT
      NULLIF(btrim(p_search), '')                      AS search,
      GREATEST(1, COALESCE(p_page, 1))                 AS page,
      LEAST(GREATEST(1, COALESCE(p_page_size, 50)), 200) AS page_size,
      COALESCE(p_sort_by, 'created_desc')              AS sort_by
  ),
  filtered AS (
    SELECT p.id
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    CROSS JOIN params pm
    WHERE p.deleted_at IS NULL  -- migration 179: hide soft-deleted users
      AND (
        pm.search IS NULL
        OR p.display_name ILIKE '%' || pm.search || '%'
        OR p.handle       ILIKE '%' || pm.search || '%'
        OR u.email        ILIKE '%' || pm.search || '%'
        OR (
          pm.search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND p.id::text = pm.search
        )
      )
  ),
  sales_agg AS (
    SELECT
      pa.profile_id,
      COALESCE(SUM(pa.sales_count), 0)::bigint   AS total_sales,
      COALESCE(SUM(pa.revenue_cents), 0)::bigint AS total_revenue_cents
    FROM public.profile_analytics pa
    WHERE pa.profile_id IN (SELECT id FROM filtered)
    GROUP BY pa.profile_id
  ),
  links_agg AS (
    SELECT l.creator_id, COUNT(*)::bigint AS n
    FROM public.links l
    WHERE l.creator_id IN (SELECT id FROM filtered)
    GROUP BY l.creator_id
  ),
  assets_agg AS (
    SELECT a.creator_id, COUNT(*)::bigint AS n
    FROM public.assets a
    WHERE a.creator_id IN (SELECT id FROM filtered)
    GROUP BY a.creator_id
  ),
  creator_pics AS (
    -- Creators keep their real avatar on creator_profiles, not on profiles.
    -- Also skip soft-deleted creator_profiles so we don't surface a deleted
    -- profile's avatar after its parent profile somehow survived (defensive).
    SELECT DISTINCT ON (cp.user_id) cp.user_id, cp.avatar_url
    FROM public.creator_profiles cp
    WHERE cp.user_id IN (SELECT id FROM filtered)
      AND cp.is_active = true
      AND cp.deleted_at IS NULL
      AND cp.avatar_url IS NOT NULL
    ORDER BY cp.user_id, cp.updated_at DESC NULLS LAST
  ),
  enriched AS (
    SELECT
      p.id,
      p.display_name,
      p.handle,
      u.email,
      COALESCE(cp.avatar_url, p.avatar_url)            AS avatar_url,
      p.created_at,
      p.is_creator,
      p.is_admin,
      (p.agency_name IS NOT NULL)                      AS is_agency,
      COALESCE(la.n, 0)                                AS links_count,
      COALESCE(aa.n, 0)                                AS assets_count,
      COALESCE(sa.total_sales, 0)                      AS total_sales,
      COALESCE(sa.total_revenue_cents, 0)              AS total_revenue_cents,
      COALESCE(p.profile_view_count, 0)                AS profile_view_count
    FROM filtered f
    JOIN public.profiles p ON p.id = f.id
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN creator_pics cp ON cp.user_id = p.id
    LEFT JOIN links_agg  la ON la.creator_id  = p.id
    LEFT JOIN assets_agg aa ON aa.creator_id  = p.id
    LEFT JOIN sales_agg  sa ON sa.profile_id  = p.id
  ),
  counted AS (
    SELECT e.*, COUNT(*) OVER () AS total_count FROM enriched e
  )
  SELECT
    c.id,
    c.display_name,
    c.handle,
    c.email,
    c.avatar_url,
    c.created_at,
    c.is_creator,
    c.is_admin,
    c.is_agency,
    c.links_count,
    c.assets_count,
    c.total_sales,
    c.total_revenue_cents,
    c.profile_view_count,
    c.total_count
  FROM counted c
  CROSS JOIN params pm
  ORDER BY
    CASE WHEN pm.sort_by = 'created_asc'   THEN c.created_at         END ASC  NULLS LAST,
    CASE WHEN pm.sort_by = 'most_viewed'   THEN c.profile_view_count END DESC NULLS LAST,
    CASE WHEN pm.sort_by = 'best_sellers'  THEN c.total_sales        END DESC NULLS LAST,
    CASE WHEN pm.sort_by = 'best_sellers'  THEN c.total_revenue_cents END DESC NULLS LAST,
    CASE WHEN pm.sort_by = 'most_content'  THEN c.assets_count       END DESC NULLS LAST,
    CASE WHEN pm.sort_by = 'most_links'    THEN c.links_count        END DESC NULLS LAST,
    c.created_at DESC
  OFFSET (SELECT (page - 1) * page_size FROM params)
  LIMIT  (SELECT page_size FROM params);
$$;

-- Grants are unchanged from migration 150; CREATE OR REPLACE preserves them,
-- but we re-assert them here defensively to stay consistent across resets.
REVOKE ALL ON FUNCTION public.admin_list_users(text, int, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users(text, int, int, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text) TO service_role;

COMMENT ON FUNCTION public.admin_list_users(text, int, int, text) IS
  'Admin-only, paginated, searchable user list with aggregated metrics. Filters out soft-deleted users (profiles.deleted_at IS NOT NULL) since migration 179. Callable from the admin-get-users Edge Function (service role).';
