-- Migration 069: RPC function for agency dashboard
-- Returns profile stats (links count, sales count, revenue) for all creator_profiles belonging to a user.

DROP FUNCTION IF EXISTS public.get_user_profiles(uuid);

CREATE OR REPLACE FUNCTION public.get_user_profiles(p_user_id uuid)
RETURNS TABLE (
  profile_id uuid,
  username text,
  display_name text,
  profile_views bigint,
  total_links bigint,
  total_sales bigint,
  total_revenue_cents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    cp.id AS profile_id,
    cp.username,
    cp.display_name,
    cp.profile_view_count::bigint AS profile_views,
    COALESCE(link_stats.cnt, 0) AS total_links,
    COALESCE(sales_stats.cnt, 0) AS total_sales,
    COALESCE(sales_stats.revenue, 0) AS total_revenue_cents
  FROM creator_profiles cp
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM links l
    WHERE l.profile_id = cp.id
  ) link_stats ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt, COALESCE(sum(p.amount_cents), 0)::bigint AS revenue
    FROM purchases p
    JOIN links l ON l.id = p.link_id
    WHERE l.profile_id = cp.id
      AND p.status = 'succeeded'
  ) sales_stats ON true
  WHERE cp.user_id = p_user_id
    AND cp.is_active = true
  ORDER BY cp.created_at ASC;
$$;
