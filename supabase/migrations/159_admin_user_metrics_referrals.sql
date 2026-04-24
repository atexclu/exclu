-- Migration 151: Extend admin_user_metrics with referral earnings
--
-- The admin user overview needs to display the same affiliate numbers the
-- creator sees on /app/referral (ReferralDashboard):
--   - lifetime commissions (profiles.affiliate_earnings_cents — the single
--     source of truth incremented by ugp-membership-confirm whenever a
--     referred creator's premium sub renews)
--   - total / converted referral counts (referrals table, referrer_id)
--   - pending payout state (profiles.affiliate_payout_requested_at)
--
-- We also surface "referred_by" so admins can see which creator originally
-- recruited the current user.
--
-- The only behaviour change vs migration 150 is the new `referrals` key in
-- the returned JSONB payload — existing callers stay compatible.

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
  ),
  referrals_agg AS (
    -- Referrals brought IN BY this user (acting as referrer).
    SELECT
      COUNT(*)::bigint                                                                AS recruited_count,
      COUNT(*) FILTER (WHERE status = 'converted')::bigint                            AS converted_count,
      COALESCE(SUM(commission_earned_cents), 0)::bigint                               AS row_sum_cents
    FROM public.referrals
    WHERE referrer_id = p_user_id
  ),
  referrer_profile AS (
    -- The user who originally recruited this creator (if any).
    SELECT rp.id, rp.handle, rp.display_name
    FROM public.profiles me
    LEFT JOIN public.profiles rp ON rp.id = me.referred_by
    WHERE me.id = p_user_id
  ),
  me AS (
    SELECT
      COALESCE(affiliate_earnings_cents, 0)::bigint       AS lifetime_earnings_cents,
      affiliate_payout_requested_at
    FROM public.profiles
    WHERE id = p_user_id
  )
  SELECT jsonb_build_object(
    'purchases',         (SELECT row_to_json(purchases_agg) FROM purchases_agg),
    'tips',              (SELECT row_to_json(tips_agg)      FROM tips_agg),
    'gifts',             (SELECT row_to_json(gifts_agg)     FROM gifts_agg),
    'custom_requests',   (SELECT row_to_json(requests_agg)  FROM requests_agg),
    'fan_subscriptions', (SELECT row_to_json(fan_subs_agg)  FROM fan_subs_agg),
    'last_30d',          (SELECT row_to_json(last_30d)      FROM last_30d),
    'top_links',         (SELECT items FROM top_links),
    'referrals', jsonb_build_object(
      'lifetime_earnings_cents',      (SELECT lifetime_earnings_cents FROM me),
      'commissions_row_sum_cents',    (SELECT row_sum_cents FROM referrals_agg),
      'recruited_count',              (SELECT recruited_count FROM referrals_agg),
      'converted_count',              (SELECT converted_count FROM referrals_agg),
      'payout_requested_at',          (SELECT affiliate_payout_requested_at FROM me),
      'referred_by', (
        SELECT CASE
          WHEN rp.id IS NULL THEN NULL
          ELSE jsonb_build_object('id', rp.id, 'handle', rp.handle, 'display_name', rp.display_name)
        END
        FROM referrer_profile rp
      )
    ),
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

-- Grants unchanged from migration 150.
