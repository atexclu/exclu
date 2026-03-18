-- ══════════════════════════════════════════════════════════════════════
-- 085 — Convert SECURITY DEFINER views to SECURITY INVOKER
--
-- Fixes Supabase linter errors: these 6 views were using SECURITY DEFINER
-- which bypasses RLS. Converting to SECURITY INVOKER so they respect
-- the querying user's permissions instead of the view owner's.
--
-- None of these views are actively queried from the application frontend
-- or edge functions, so this change is safe.
-- ══════════════════════════════════════════════════════════════════════

ALTER VIEW public.user_profile_counts    SET (security_invoker = on);
ALTER VIEW public.profile_stats_summary  SET (security_invoker = on);
ALTER VIEW public.agency_stats           SET (security_invoker = on);
ALTER VIEW public.user_active_roles      SET (security_invoker = on);
ALTER VIEW public.user_billing_summary   SET (security_invoker = on);
ALTER VIEW public.agency_overview        SET (security_invoker = on);
