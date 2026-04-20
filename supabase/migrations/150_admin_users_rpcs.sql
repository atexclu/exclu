-- Migration 150: Admin users page performance + correctness
--
-- Goals:
--   1. Replace the N+N network-chatty admin-get-users logic with a single
--      `admin_list_users` SECURITY DEFINER RPC that joins profiles,
--      auth.users, profile_analytics, links, assets, creator_profiles in
--      one round-trip, with server-side search / sort / pagination.
--   2. Expose `admin_user_metrics(p_user_id)` returning aggregated totals
--      across every revenue surface (purchases, tips, gifts, custom
--      requests, fan subscriptions) so the admin overview stops showing 0
--      ventes when a creator actually has sales from older links.
--   3. Add trigram indexes so ILIKE '%x%' searches on display_name, handle
--      and auth.users.email are index-backed instead of seq-scanning.
--
-- Both RPCs are locked to service_role: they are only callable by the
-- Edge Functions (admin-get-users / admin-get-user-overview) that run
-- with the service role key and have already verified `profiles.is_admin`.

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  A) Extensions + trigram indexes for fast ILIKE search               ║
-- ╚══════════════════════════════════════════════════════════════════════╝

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON public.profiles USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_handle_trgm
  ON public.profiles USING gin (handle gin_trgm_ops);

-- auth.users is owned by the auth admin role on managed Supabase projects.
-- Most projects can still index it from a migration running as postgres, but we
-- wrap the statement so the migration doesn't blow up on setups where the
-- privilege isn't granted. Search will still work without it, just slower.
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_auth_users_email_trgm
    ON auth.users USING gin (email gin_trgm_ops);
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'admin_users_rpcs: skipping trigram index on auth.users.email (insufficient privilege)';
END $$;

-- Btree indexes supporting the aggregate JOINs.
CREATE INDEX IF NOT EXISTS idx_links_creator_id ON public.links(creator_id);
CREATE INDEX IF NOT EXISTS idx_assets_creator_id ON public.assets(creator_id);
-- profile_analytics already has idx_profile_analytics_profile_date (mig 059).

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  B) admin_list_users — paginated, searchable, sortable user list    ║
-- ╚══════════════════════════════════════════════════════════════════════╝

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
    WHERE pm.search IS NULL
       OR p.display_name ILIKE '%' || pm.search || '%'
       OR p.handle       ILIKE '%' || pm.search || '%'
       OR u.email        ILIKE '%' || pm.search || '%'
       OR (
         pm.search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND p.id::text = pm.search
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
    SELECT DISTINCT ON (cp.user_id) cp.user_id, cp.avatar_url
    FROM public.creator_profiles cp
    WHERE cp.user_id IN (SELECT id FROM filtered)
      AND cp.is_active = true
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

REVOKE ALL ON FUNCTION public.admin_list_users(text, int, int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users(text, int, int, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text) TO service_role;

COMMENT ON FUNCTION public.admin_list_users(text, int, int, text) IS
  'Admin-only, paginated, searchable user list with aggregated metrics. Callable from the admin-get-users Edge Function (service role).';

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  C) admin_user_metrics — full revenue breakdown for one user        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.admin_user_metrics(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH
  purchases_agg AS (
    SELECT
      COUNT(*)::bigint                                 AS cnt,
      COALESCE(SUM(pu.amount_cents), 0)::bigint        AS gross_cents,
      COALESCE(SUM(pu.creator_net_cents), 0)::bigint   AS net_cents
    FROM public.purchases pu
    JOIN public.links l ON l.id = pu.link_id
    WHERE l.creator_id = p_user_id
      AND pu.status = 'succeeded'
  ),
  tips_agg AS (
    SELECT
      COUNT(*)::bigint                                 AS cnt,
      COALESCE(SUM(amount_cents), 0)::bigint           AS gross_cents,
      COALESCE(SUM(creator_net_cents), 0)::bigint      AS net_cents
    FROM public.tips
    WHERE creator_id = p_user_id
      AND status = 'succeeded'
  ),
  gifts_agg AS (
    SELECT
      COUNT(*)::bigint                                 AS cnt,
      COALESCE(SUM(amount_cents), 0)::bigint           AS gross_cents,
      COALESCE(SUM(creator_net_cents), 0)::bigint      AS net_cents
    FROM public.gift_purchases
    WHERE creator_id = p_user_id
      AND status = 'succeeded'
  ),
  requests_agg AS (
    SELECT
      COUNT(*)::bigint                                 AS cnt,
      COALESCE(SUM(final_amount_cents), 0)::bigint     AS gross_cents,
      COALESCE(SUM(creator_net_cents), 0)::bigint      AS net_cents
    FROM public.custom_requests
    WHERE creator_id = p_user_id
      AND status IN ('paid', 'in_progress', 'delivered', 'completed')
  ),
  fan_subs_agg AS (
    SELECT
      COUNT(*) FILTER (
        WHERE status IN ('active', 'cancelled')
          AND period_end IS NOT NULL
          AND period_end > now()
      )::bigint                                                                AS active_count,
      COUNT(*)::bigint                                                          AS total_count,
      COALESCE(SUM(price_cents) FILTER (WHERE status = 'active'), 0)::bigint    AS monthly_revenue_cents
    FROM public.fan_creator_subscriptions
    WHERE creator_user_id = p_user_id
  ),
  last_30d AS (
    SELECT
      COALESCE(SUM(sales_count), 0)::bigint   AS sales_count,
      COALESCE(SUM(revenue_cents), 0)::bigint AS revenue_cents
    FROM public.profile_analytics
    WHERE profile_id = p_user_id
      AND date >= (CURRENT_DATE - INTERVAL '30 days')
  ),
  top_links AS (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) AS items
    FROM (
      SELECT
        l.id,
        l.title,
        l.slug,
        COUNT(pu.id)::bigint                       AS sales_count,
        COALESCE(SUM(pu.amount_cents), 0)::bigint  AS revenue_cents
      FROM public.links l
      LEFT JOIN public.purchases pu
             ON pu.link_id = l.id AND pu.status = 'succeeded'
      WHERE l.creator_id = p_user_id
      GROUP BY l.id, l.title, l.slug
      HAVING COUNT(pu.id) > 0
      ORDER BY COUNT(pu.id) DESC, SUM(pu.amount_cents) DESC
      LIMIT 5
    ) t
  )
  SELECT jsonb_build_object(
    'purchases',         (SELECT row_to_json(purchases_agg) FROM purchases_agg),
    'tips',              (SELECT row_to_json(tips_agg)      FROM tips_agg),
    'gifts',             (SELECT row_to_json(gifts_agg)     FROM gifts_agg),
    'custom_requests',   (SELECT row_to_json(requests_agg)  FROM requests_agg),
    'fan_subscriptions', (SELECT row_to_json(fan_subs_agg)  FROM fan_subs_agg),
    'last_30d',          (SELECT row_to_json(last_30d)      FROM last_30d),
    'top_links',         (SELECT items FROM top_links),
    'totals', jsonb_build_object(
      'count',
        (SELECT cnt FROM purchases_agg)
      + (SELECT cnt FROM tips_agg)
      + (SELECT cnt FROM gifts_agg)
      + (SELECT cnt FROM requests_agg),
      'gross_cents',
        (SELECT gross_cents FROM purchases_agg)
      + (SELECT gross_cents FROM tips_agg)
      + (SELECT gross_cents FROM gifts_agg)
      + (SELECT gross_cents FROM requests_agg),
      'net_cents',
        (SELECT net_cents FROM purchases_agg)
      + (SELECT net_cents FROM tips_agg)
      + (SELECT net_cents FROM gifts_agg)
      + (SELECT net_cents FROM requests_agg)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_user_metrics(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_user_metrics(uuid) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_user_metrics(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_user_metrics(uuid) IS
  'Admin-only revenue breakdown for a single user across purchases, tips, gifts, custom requests and fan subscriptions. Callable from the admin-get-user-overview Edge Function (service role).';
