-- ══════════════════════════════════════════════════════════════════════
-- 086 — Fix function_search_path_mutable warnings
--
-- Sets search_path = public on all custom functions to prevent
-- mutable search_path security warnings from Supabase linter.
-- ══════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public;

ALTER FUNCTION public.update_links_updated_at()
  SET search_path = public;

ALTER FUNCTION public.track_sale()
  SET search_path = public;

ALTER FUNCTION public.calculate_subscription_price(uuid)
  SET search_path = public;

ALTER FUNCTION public.user_has_role(uuid, public.user_role)
  SET search_path = public;

ALTER FUNCTION public.get_accessible_profiles(uuid)
  SET search_path = public;

ALTER FUNCTION public.generate_referral_code()
  SET search_path = public;

ALTER FUNCTION public.create_affiliate_on_signup()
  SET search_path = public;

ALTER FUNCTION public.deactivate_additional_profiles(uuid)
  SET search_path = public;

ALTER FUNCTION public.reactivate_all_profiles(uuid)
  SET search_path = public;

ALTER FUNCTION public.check_agency_profile_limit()
  SET search_path = public;

ALTER FUNCTION public.increment_profile_daily_views(uuid)
  SET search_path = public;

ALTER FUNCTION public.check_profile_creation_quota()
  SET search_path = public;

ALTER FUNCTION public.is_chatter_of_agency(uuid, uuid)
  SET search_path = public;

ALTER FUNCTION public.get_chatter_accessible_profiles(uuid)
  SET search_path = public;

ALTER FUNCTION public.chatter_has_access_to_profile(uuid, uuid)
  SET search_path = public;

ALTER FUNCTION public.count_user_active_profiles(uuid)
  SET search_path = public;

ALTER FUNCTION public.get_subscription_details(uuid)
  SET search_path = public;

ALTER FUNCTION public.log_profile_count_change()
  SET search_path = public;

ALTER FUNCTION public.track_profile_view()
  SET search_path = public;

ALTER FUNCTION public.track_link_click()
  SET search_path = public;
