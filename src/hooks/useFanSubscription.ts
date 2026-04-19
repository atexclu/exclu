import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

type State = {
  isSubscribed: boolean;
  fanId: string | null;
  subscriptionId: string | null;
};

/**
 * Does the currently-authenticated fan have an active, unexpired subscription
 * to `creatorProfileId`?
 *
 * Implementation notes:
 *  - Returns `isSubscribed=false` for anonymous users (no session).
 *  - `active` and `cancelled` both count as long as period_end is in the future;
 *    this mirrors the `has_active_fan_subscription` SQL RPC (migration 147).
 *  - 30s staleTime is enough to cover popup → checkout redirect; the fan feed
 *    re-queries when the user navigates back from QuickPay (ApprovedURL).
 */
export function useFanSubscription(creatorProfileId: string | null) {
  const query = useQuery<State>({
    queryKey: ['fan-subscription', creatorProfileId],
    enabled: !!creatorProfileId,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !creatorProfileId) {
        return { isSubscribed: false, fanId: null, subscriptionId: null };
      }

      const { data } = await supabase
        .from('fan_creator_subscriptions')
        .select('id, status, period_end')
        .eq('fan_id', user.id)
        .eq('creator_profile_id', creatorProfileId)
        .in('status', ['active', 'cancelled'])
        .gt('period_end', new Date().toISOString())
        .maybeSingle();

      return {
        isSubscribed: !!data,
        fanId: user.id,
        subscriptionId: data?.id ?? null,
      };
    },
    staleTime: 30_000,
  });

  return {
    isSubscribed: query.data?.isSubscribed ?? false,
    fanId: query.data?.fanId ?? null,
    subscriptionId: query.data?.subscriptionId ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
