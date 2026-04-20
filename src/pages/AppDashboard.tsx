import AppShell from '@/components/AppShell';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ExternalLink, X, CreditCard, Check, Copy, Zap, Users, Share2, Mail, Send, Loader2, Building2, Landmark, Heart, Gift, FileText, UserPlus, ArrowDownToLine, Banknote, AlertCircle, CircleCheck, CircleX, Clock, Sparkles, ShieldCheck, Pencil, ArrowUpRight } from 'lucide-react';
import { SiX, SiTelegram, SiInstagram, SiTiktok, SiSnapchat } from 'react-icons/si';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfiles } from '@/contexts/ProfileContext';
import BankDetailsForm, { BankData, getBankDisplayFields } from '@/components/BankDetailsForm';

// --- SELF-HEALING & CACHE-BUSTING ---
// Increment this version when making critical changes to force data re-fetch
const APP_DASHBOARD_VERSION = '1.0.4';

const AppDashboard = () => {
  const { activeProfile, isAgency } = useProfiles();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalLinks, setTotalLinks] = useState(0);
  const [publishedLinksCount, setPublishedLinksCount] = useState(0);
  const [totalSalesCount, setTotalSalesCount] = useState(0);
  const [totalRevenueCents, setTotalRevenueCents] = useState(0);
  const [tipsRevenueCents, setTipsRevenueCents] = useState(0);
  const [walletBalanceCents, setWalletBalanceCents] = useState(0);
  const [linksRaw, setLinksRaw] = useState<any[]>([]);
  const [purchasesRaw, setPurchasesRaw] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'metrics' | 'subscriptions' | 'referral' | 'payouts'>('metrics');
  // Fan → creator subscriptions (active period, past history)
  const [fanSubscribers, setFanSubscribers] = useState<Array<{
    id: string;
    status: string;
    price_cents: number;
    creator_net_cents: number;
    period_start: string | null;
    period_end: string | null;
    cancel_at_period_end: boolean;
    started_at: string | null;
    cancelled_at: string | null;
    fan: { id: string; display_name: string | null; avatar_url: string | null } | null;
  }>>([]);
  const [fanSubStats, setFanSubStats] = useState<{
    active: number;
    lifetimeNetCents: number;
    last30dNetCents: number;
  }>({ active: 0, lifetimeNetCents: 0, last30dNetCents: 0 });
  const [tipsRaw, setTipsRaw] = useState<any[]>([]);
  const [giftsRaw, setGiftsRaw] = useState<any[]>([]);
  const [requestsRaw, setRequestsRaw] = useState<any[]>([]);
  // Referral state (recruteur)
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [affiliateEarningsCents, setAffiliateEarningsCents] = useState(0);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [referralLinkCopied, setReferralLinkCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isRequestingPayout, setIsRequestingPayout] = useState(false);
  const [payoutRequested, setPayoutRequested] = useState(false);
  // Referral bonus state (recruté — this creator was referred by someone)
  const [myReferralBonus, setMyReferralBonus] = useState<{ eligible: boolean; unlocked: boolean; daysLeft: number } | null>(null);
  const [activeMetric, setActiveMetric] = useState<'profile_views' | 'sales' | 'revenue'>('revenue');
  const [profileViewsRaw, setProfileViewsRaw] = useState<{ date: string; views: number }[]>([]);
  const [activeRange, setActiveRange] = useState<'7d' | '30d' | '365d'>('30d');
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number } | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
  const [profileViewCount, setProfileViewCount] = useState<number | null>(null);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [isCreatorSubscribed, setIsCreatorSubscribed] = useState(false);
  const [commissionRate, setCommissionRate] = useState(0.10);
  // Wallet / payouts state (formerly /app/earnings)
  const [walletTotalEarnedCents, setWalletTotalEarnedCents] = useState(0);
  const [walletTotalWithdrawnCents, setWalletTotalWithdrawnCents] = useState(0);
  const [walletPayouts, setWalletPayouts] = useState<any[]>([]);
  const [bankData, setBankData] = useState<BankData | null>(null);
  const [payoutSetupComplete, setPayoutSetupComplete] = useState(false);
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [isRequestingWithdrawal, setIsRequestingWithdrawal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const payoutsSectionRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let isMounted = true;

    // Verify subscription payment if returning from QuickPay
    const subSuccess = searchParams.get('subscription');
    const ugpTxnId = searchParams.get('TransactionID');
    const ugpMerchRef = searchParams.get('MerchantReference');
    if (subSuccess === 'success') {
      if (ugpTxnId && ugpMerchRef) {
        fetch('/api/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merchant_reference: ugpMerchRef, transaction_id: ugpTxnId }),
        }).catch((err) => console.error('[AppDashboard] verify-payment failed:', err));
      }
      toast.success('Premium subscription activated! You now keep 100% of your revenue.');
      // Clean URL params
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('subscription');
      newParams.delete('TransactionID');
      newParams.delete('MerchantReference');
      setSearchParams(newParams, { replace: true });
    }
    if (searchParams.get('subscription') === 'failed') {
      toast.error('Subscription payment was not completed. Please try again.');
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('subscription');
      setSearchParams(newParams, { replace: true });
    }

    const fetchMetrics = async () => {
      setIsLoading(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!isMounted) return;
        setError('Unable to load your stats. Please sign in again.');
        setIsLoading(false);
        return;
      }

      try {
        if (isMounted) setUserId(user.id);
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('display_name, handle, is_creator_subscribed, profile_view_count, referral_code, affiliate_earnings_cents, affiliate_payout_requested_at, payout_setup_complete, wallet_balance_cents, total_earned_cents, total_withdrawn_cents, bank_iban, bank_holder_name, bank_bic, bank_account_type, bank_account_number, bank_routing_number, bank_bsb, bank_country')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error loading creator profile', profileError);
        }

        // Links metrics — filter by profile_id when active profile available, else by creator_id
        const linksQuery = supabase
          .from('links')
          .select('id, click_count, status, created_at');

        const { data: links, error: linksError } = activeProfile?.id
          ? await linksQuery.eq('profile_id', activeProfile.id)
          : await linksQuery.eq('creator_id', user.id);

        if (linksError) throw linksError;

        const safeLinks = links ?? [];
        const linksCount = safeLinks.length;
        const publishedCount = safeLinks.filter((link: any) => link.status === 'published').length;

        // Purchases metrics – filter by this creator's link IDs for proper data isolation
        const creatorLinkIds = safeLinks.map((l: any) => l.id);
        let safePurchases: any[] = [];
        if (creatorLinkIds.length > 0) {
          const { data: purchases, error: purchasesError } = await supabase
            .from('purchases')
            .select('id, link_id, amount_cents, created_at')
            .in('link_id', creatorLinkIds)
            .eq('status', 'succeeded');

          if (purchasesError) throw purchasesError;
          safePurchases = purchases ?? [];
        }
        const salesCount = safePurchases.length;
        // Creator net: strip 5% fan fee, then deduct 10% platform commission if not premium
        const isPremium = profile?.is_creator_subscribed === true;
        const rate = isPremium ? 0 : 0.10;
        const revenueSum = safePurchases.reduce(
          (sum, p: any) => sum + Math.round((p.amount_cents ?? 0) / 1.05 * (1 - rate)), 0
        );

        // Tips revenue — fetch full details for the Tips tab display
        const tipsQuery = supabase
          .from('tips')
          .select('id, amount_cents, creator_net_cents, currency, status, message, is_anonymous, fan_name, fan_id, created_at')
          .eq('status', 'succeeded')
          .order('created_at', { ascending: false });
        const { data: tipsData } = activeProfile?.id
          ? await tipsQuery.eq('creator_id', user.id).or(`profile_id.eq.${activeProfile.id},profile_id.is.null`)
          : await tipsQuery.eq('creator_id', user.id);

        // Resolve fan profiles separately (tips.fan_id FK → auth.users, not profiles)
        const rawTips = tipsData ?? [];
        const fanIds = [...new Set(rawTips.filter((t: any) => t.fan_id).map((t: any) => t.fan_id))];
        let fanProfiles = new Map<string, { display_name: string | null; avatar_url: string | null }>();
        if (fanIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', fanIds);
          (profiles ?? []).forEach((p: any) => fanProfiles.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url }));
        }
        const safeTips = rawTips.map((t: any) => ({
          ...t,
          fan: t.fan_id ? fanProfiles.get(t.fan_id) ?? null : null,
        }));
        const tipsSum = safeTips.reduce((sum: number, t: any) => {
          if (typeof t.creator_net_cents === 'number' && t.creator_net_cents > 0) return sum + t.creator_net_cents;
          return sum + Math.round((t.amount_cents ?? 0) * (1 - rate));
        }, 0);
        if (isMounted) setTipsRaw(safeTips);

        // Profile views history from profile_analytics
        const analyticsQuery = supabase
          .from('profile_analytics')
          .select('date, profile_views')
          .order('date', { ascending: true });
        const { data: analyticsData } = await analyticsQuery.eq('profile_id', user.id);
        if (isMounted) setProfileViewsRaw(
          (analyticsData ?? []).map((r: any) => ({ date: r.date, views: r.profile_views ?? 0 }))
        );

        // Payouts for earnings view
        const { data: payoutsData, error: payoutsError } = await supabase
          .from('payouts')
          .select('id, amount_cents, status, created_at, paid_at, requested_at, processed_at, admin_notes, rejection_reason')
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false });

        if (payoutsError) throw payoutsError;

        // Custom requests delivered — count as sales + revenue
        const { data: deliveredRequests } = await supabase
          .from('custom_requests')
          .select('id, proposed_amount_cents, creator_net_cents, created_at, description, fan_id')
          .eq('creator_id', user.id)
          .eq('status', 'delivered');
        const safeRequests = deliveredRequests ?? [];

        // Gift purchases
        const { data: giftsData } = await supabase
          .from('gift_purchases')
          .select('id, amount_cents, creator_net_cents, currency, status, message, is_anonymous, fan_id, created_at')
          .eq('creator_id', user.id)
          .eq('status', 'succeeded')
          .order('created_at', { ascending: false });
        const safeGifts = giftsData ?? [];
        const requestsRevenue = safeRequests.reduce((sum: number, r: any) => {
          if (typeof r.creator_net_cents === 'number' && r.creator_net_cents > 0) return sum + r.creator_net_cents;
          return sum + Math.round((r.proposed_amount_cents ?? 0) * (1 - rate));
        }, 0);

        // Fan → creator subscriptions (active + history, for the Subscriptions tab and Overview breakdown)
        const { data: fanSubRows } = await supabase
          .from('fan_creator_subscriptions')
          .select('id, fan_id, status, price_cents, creator_net_cents, period_start, period_end, cancel_at_period_end, started_at, cancelled_at')
          .eq('creator_user_id', user.id)
          .order('started_at', { ascending: false, nullsFirst: false });
        const safeFanSubs = fanSubRows ?? [];

        // Resolve fan meta (profiles.id = auth.users.id)
        const fanSubIds = [...new Set(safeFanSubs.filter((s: any) => s.fan_id).map((s: any) => s.fan_id))];
        const fanSubProfiles = new Map<string, { id: string; display_name: string | null; avatar_url: string | null }>();
        if (fanSubIds.length) {
          const { data: fans } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', fanSubIds);
          (fans ?? []).forEach((p: any) => fanSubProfiles.set(p.id, { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url }));
        }
        const fanSubscribersEnriched = safeFanSubs.map((s: any) => ({ ...s, fan: s.fan_id ? fanSubProfiles.get(s.fan_id) ?? null : null }));

        const now = Date.now();
        const windowStart = now - 30 * 24 * 60 * 60 * 1000;
        const subsStats = fanSubscribersEnriched.reduce(
          (acc, s: any) => {
            // "Active" = still within period_end, status in active/cancelled (cancelled keeps access until period ends)
            const periodEnd = s.period_end ? new Date(s.period_end).getTime() : 0;
            const isLive = (s.status === 'active' || s.status === 'cancelled') && periodEnd > now;
            if (isLive) acc.active += 1;
            const net = s.creator_net_cents ?? 0;
            if (s.started_at) acc.lifetimeNetCents += net;
            if (s.period_start && new Date(s.period_start).getTime() >= windowStart) acc.last30dNetCents += net;
            return acc;
          },
          { active: 0, lifetimeNetCents: 0, last30dNetCents: 0 },
        );

        if (isMounted) {
          setFanSubscribers(fanSubscribersEnriched);
          setFanSubStats(subsStats);
        }

        const safePayouts = payoutsData ?? [];
        const totalPayoutsCents = safePayouts
          .filter((p: any) => p.status !== 'failed')
          .reduce((sum: number, p: any) => sum + (p.amount_cents ?? 0), 0);
        // Use DB wallet as source of truth (if available), else fallback to frontend calc
        const dbWallet = profile?.wallet_balance_cents;
        const walletBalance = typeof dbWallet === 'number' && dbWallet >= 0
          ? dbWallet
          : revenueSum + tipsSum + requestsRevenue - totalPayoutsCents;

        if (!isMounted) return;

        // Gifts + subscriptions roll up into the same revenue picture.
        const giftsRevenue = safeGifts.reduce((sum: number, g: any) => sum + (g.creator_net_cents ?? 0), 0);

        setTotalLinks(linksCount);
        setPublishedLinksCount(publishedCount);
        setTotalSalesCount(salesCount + safeRequests.length);
        // Use DB total_earned_cents as source of truth (matches wallet credits)
        // Fallback to frontend calc if not available (now includes subs + gifts)
        const dbTotalEarned = profile?.total_earned_cents;
        const fallbackTotal = revenueSum + tipsSum + requestsRevenue + giftsRevenue + subsStats.lifetimeNetCents;
        setTotalRevenueCents(
          typeof dbTotalEarned === 'number' && dbTotalEarned >= 0 ? dbTotalEarned : fallbackTotal,
        );
        setTipsRevenueCents(tipsSum);
        setWalletBalanceCents(walletBalance);
        setLinksRaw(safeLinks);
        setPurchasesRaw(safePurchases);
        setPayouts(safePayouts);
        setGiftsRaw(safeGifts);
        setRequestsRaw(safeRequests);
        setWalletPayouts(safePayouts);
        setWalletTotalEarnedCents(
          typeof dbTotalEarned === 'number' && dbTotalEarned >= 0 ? dbTotalEarned : fallbackTotal,
        );
        setWalletTotalWithdrawnCents(
          typeof profile?.total_withdrawn_cents === 'number' ? profile.total_withdrawn_cents : totalPayoutsCents
        );
        if (profile) {
          setPayoutSetupComplete(profile.payout_setup_complete === true);
          setBankData({
            bank_account_type: profile.bank_account_type ?? undefined,
            bank_iban: profile.bank_iban ?? undefined,
            bank_holder_name: profile.bank_holder_name ?? undefined,
            bank_bic: profile.bank_bic ?? undefined,
            bank_account_number: profile.bank_account_number ?? undefined,
            bank_routing_number: profile.bank_routing_number ?? undefined,
            bank_bsb: profile.bank_bsb ?? undefined,
            bank_country: profile.bank_country ?? undefined,
          });
          setProfileName(activeProfile?.display_name || profile.display_name || 'Creator');
          setProfileHandle(activeProfile?.username || profile.handle || null);
          setProfileViewCount(activeProfile?.profile_view_count ?? profile.profile_view_count ?? 0);
          setIsCreatorSubscribed(profile.is_creator_subscribed === true);
          setCommissionRate(profile.is_creator_subscribed === true ? 0 : 0.10);
          setAffiliateEarningsCents(profile.affiliate_earnings_cents || 0);
          if (profile.affiliate_payout_requested_at) setPayoutRequested(true);

          // Referral code (auto-generate client-side if missing)
          let code = profile.referral_code;
          if (!code) {
            const prefix = (profile.handle || 'exclu').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 6);
            code = `${prefix}-${Math.random().toString(36).substring(2, 8)}`;
            supabase.from('profiles').update({ referral_code: code }).eq('id', user.id).then(() => { });
          }
          setReferralCode(code);

          // Load referrals (as referrer — people I recruited)
          const { data: referralsData } = await supabase
            .from('referrals')
            .select('id, referred_id, status, commission_earned_cents, created_at')
            .eq('referrer_id', user.id)
            .order('created_at', { ascending: false });

          // Check if this creator was themselves referred → $100 bonus eligibility
          const { data: myReferralRow } = await supabase
            .from('referrals')
            .select('created_at, bonus_paid_to_referred')
            .eq('referred_id', user.id)
            .maybeSingle();

          if (myReferralRow && isMounted) {
            const signupDate = new Date(myReferralRow.created_at);
            const diffDays = (Date.now() - signupDate.getTime()) / (1000 * 3600 * 24);
            setMyReferralBonus({
              eligible: diffDays <= 90,
              unlocked: myReferralRow.bonus_paid_to_referred === true,
              daysLeft: Math.max(0, Math.ceil(90 - diffDays)),
            });
          }

          if (referralsData && referralsData.length > 0 && isMounted) {
            const referredIds = referralsData.map((r: any) => r.referred_id);
            const { data: referredProfiles } = await supabase
              .from('profiles')
              .select('id, handle, display_name, avatar_url')
              .in('id', referredIds);
            const profileMap = new Map((referredProfiles || []).map((p: any) => [p.id, p]));
            setReferrals(referralsData.map((r: any) => {
              const rp = profileMap.get(r.referred_id);
              return { ...r, referred_handle: rp?.handle || null, referred_display_name: rp?.display_name || null };
            }));
          }

          // Show bank setup modal if payout not configured (only once per session)
          const bankModalDismissed = sessionStorage.getItem('bankModalDismissed');
          if (!profile.payout_setup_complete && !bankModalDismissed) {
            setShowPayoutModal(true);
          }
        }
      } catch (err) {
        console.error('Error loading dashboard metrics', err);
        if (!isMounted) return;
        setError('Unable to load your stats right now.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchMetrics();

    // --- SELF-HEALING: REFRESH ON TAB FOCUS ---
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchMetrics();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeProfile?.id]);

  const handleDismissPayoutModal = () => {
    sessionStorage.setItem('bankModalDismissed', 'true');
    setShowPayoutModal(false);
  };

  const goToPayouts = () => {
    setActiveTab('payouts');
    requestAnimationFrame(() => {
      payoutsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleRequestWithdrawal = async () => {
    if (!userId) return;
    if (walletBalanceCents < 5000) {
      toast.error('Minimum withdrawal is $50.00');
      return;
    }
    if (!payoutSetupComplete) {
      toast.error('Please set up your bank details first.');
      goToPayouts();
      return;
    }
    setIsRequestingWithdrawal(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('request-withdrawal', {
        body: {},
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error || 'Withdrawal request failed');
      }
      toast.success('Withdrawal requested! Funds typically arrive within 3–5 business days.');
      if ((data as any)?.new_balance !== undefined) {
        setWalletBalanceCents((data as any).new_balance);
      }
      const { data: refreshedPayouts } = await supabase
        .from('payouts')
        .select('id, amount_cents, status, created_at, paid_at, requested_at, processed_at, admin_notes, rejection_reason')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (refreshedPayouts) setWalletPayouts(refreshedPayouts);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to request withdrawal');
    } finally {
      setIsRequestingWithdrawal(false);
    }
  };

  const formattedRevenue = (totalRevenueCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const publicProfileUrl = profileHandle ? `${window.location.origin}/${profileHandle}` : null;

  const buildSeries = (
    metric: 'profile_views' | 'sales' | 'revenue',
    range: '7d' | '30d' | '365d'
  ): { label: string; value: number; dateKey: string }[] => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 365;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const points: { label: string; value: number; dateKey: string }[] = [];

    if (metric === 'profile_views') {
      // Daily (non-cumulative) profile views from profile_analytics
      const viewsByDate: Record<string, number> = {};
      profileViewsRaw.forEach(({ date, views }) => { viewsByDate[date] = views; });

      for (let i = days - 1; i >= 0; i--) {
        const day = new Date(today);
        day.setDate(today.getDate() - i);
        const dayKey = day.toISOString().slice(0, 10);
        const label = day.toLocaleDateString(undefined, {
          month: range === '365d' ? 'short' : 'numeric',
          day: 'numeric',
        });
        points.push({ label, value: viewsByDate[dayKey] ?? 0, dateKey: dayKey });
      }
      return points;
    }

    // Collect events (date + value) for sales / revenue
    const events: { date: Date; value: number }[] = [];
    purchasesRaw.forEach((purchase: any) => {
      if (purchase.created_at) {
        const d = new Date(purchase.created_at);
        d.setHours(0, 0, 0, 0);
        const value = metric === 'sales' ? 1 : Math.round((purchase.amount_cents ?? 0) / 1.05 * (1 - commissionRate));
        events.push({ date: d, value });
      }
    });

    if (events.length === 0) return [];

    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const dayKey = day.toISOString().slice(0, 10);

      // cumulative value up to this day
      const cumulative = events.reduce((sum, ev) => {
        const evKey = ev.date.toISOString().slice(0, 10);
        return evKey <= dayKey ? sum + ev.value : sum;
      }, 0);

      const label = day.toLocaleDateString(undefined, {
        month: range === '365d' ? 'short' : 'numeric',
        day: 'numeric',
      });

      points.push({ label, value: cumulative, dateKey: dayKey });
    }

    return points;
  };

  return (
    <AppShell>
      {/* Payout Setup Modal */}
      <AnimatePresence>
        {showPayoutModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={handleDismissPayoutModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md bg-exclu-ink border border-exclu-arsenic/70 rounded-2xl shadow-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleDismissPayoutModal}
                className="absolute top-4 right-4 text-exclu-space/60 hover:text-exclu-cloud transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-6">
                <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500/30 to-lime-500/30 flex items-center justify-center mb-4">
                  <Landmark className="w-6 h-6 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-exclu-cloud mb-2">
                  Set up your bank details to get paid
                </h2>
                <p className="text-sm text-exclu-space/80">
                  Add your bank account (IBAN) to receive payouts. Money from fans goes into your Exclu wallet, and you can withdraw anytime.
                </p>
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <span className="text-exclu-space">Withdraw to your bank account anytime</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <span className="text-exclu-space">Secure & encrypted storage</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <span className="text-exclu-space">Takes only 1 minute</span>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  variant="hero"
                  size="lg"
                  className="w-full rounded-full"
                  onClick={() => {
                    handleDismissPayoutModal();
                    goToPayouts();
                  }}
                >
                  <Landmark className="w-4 h-4 mr-2" />
                  Set up bank details
                </Button>
                <button
                  type="button"
                  onClick={handleDismissPayoutModal}
                  className="w-full text-center text-xs text-exclu-space/60 hover:text-exclu-space transition-colors py-2"
                >
                  I'll do this later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="px-4 lg:px-6 pb-16 w-full">
        {/* Header — title + quick profile actions */}
        <section className="mt-4 sm:mt-6 mb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-exclu-space/60 mb-1 font-semibold">
                {profileName ? `${profileName}'s wallet` : 'Wallet'}
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud truncate tracking-tight">
                Earnings
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {publicProfileUrl && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(publicProfileUrl);
                        toast.success('Public profile link copied');
                      } catch {
                        toast.error('Failed to copy link');
                      }
                    }}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 text-exclu-space hover:text-exclu-cloud hover:border-primary/50 transition-colors"
                    aria-label="Copy public profile link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <a
                    href={publicProfileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 text-exclu-space hover:text-exclu-cloud hover:border-primary/50 transition-colors"
                    aria-label="Open public profile"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </>
              )}
              {isAgency ? (
                <RouterLink
                  to="/app/agency"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/40 bg-primary/10 text-xs text-primary hover:bg-primary/20 hover:border-primary/60 transition-colors whitespace-nowrap font-medium"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Agency Panel</span>
                </RouterLink>
              ) : (
                <RouterLink
                  to="/app/profile"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 text-xs text-exclu-space hover:text-exclu-cloud hover:border-primary/50 transition-colors whitespace-nowrap"
                >
                  <span>Profile</span>
                </RouterLink>
              )}
            </div>
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-400 mb-4 max-w-xl">{error}</p>
        )}

        {/* ───────────── Wallet Hero ───────────── */}
        <section className="mb-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-3xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-6 sm:p-8 lg:p-10 shadow-[0_24px_80px_-40px_rgba(207,255,22,0.22)] dark:shadow-[0_30px_100px_-50px_rgba(207,255,22,0.4)]"
          >
            {/* Lime aurora corners — single accent, no blue */}
            <div aria-hidden className="pointer-events-none absolute -top-32 -right-20 w-[460px] h-[460px] rounded-full bg-[radial-gradient(circle,rgba(207,255,22,0.28),transparent_60%)] blur-3xl opacity-80 dark:opacity-95" />
            <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 w-[380px] h-[380px] rounded-full bg-[radial-gradient(circle,rgba(207,255,22,0.12),transparent_60%)] blur-3xl opacity-40 dark:opacity-60" />
            {/* Grain — dark only */}
            <div aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block opacity-[0.04] mix-blend-overlay bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.7%22/></svg>')]" />

            <div className="relative">
              {/* Row 1 — micro label */}
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-semibold text-foreground/60 dark:text-white/60">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-[#CFFF16] animate-ping opacity-50" />
                  <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[#CFFF16] shadow-[0_0_10px_rgba(207,255,22,0.9)]" />
                </span>
                Available to withdraw
              </div>

              {/* Row 2 — balance */}
              <div className="mt-3 flex items-end gap-2.5">
                <span className="text-[3.25rem] leading-[0.9] sm:text-7xl lg:text-[5.25rem] font-black tracking-[-0.045em] text-foreground dark:text-white tabular-nums">
                  ${(walletBalanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] font-bold text-foreground/40 dark:text-white/40 mb-2 sm:mb-3 tracking-[0.2em]">USD</span>
              </div>

              {/* Row 3 — stats */}
              <div className="mt-8 h-px bg-gradient-to-r from-transparent via-foreground/10 dark:via-white/12 to-transparent" />
              <div className="mt-5 grid grid-cols-3">
                {[
                  { label: 'Total earned', value: `$${Math.round(walletTotalEarnedCents / 100).toLocaleString('en-US')}` },
                  { label: 'Withdrawn', value: `$${Math.round(walletTotalWithdrawnCents / 100).toLocaleString('en-US')}` },
                  { label: 'Sales', value: totalSalesCount.toLocaleString('en-US') },
                ].map((stat, i) => (
                  <div
                    key={stat.label}
                    className={i > 0 ? 'pl-4 sm:pl-6 border-l border-foreground/10 dark:border-white/10' : ''}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-foreground/45 dark:text-white/45 font-semibold">{stat.label}</p>
                    <p className="text-lg sm:text-2xl font-bold text-foreground dark:text-white mt-1 tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Row 4 — actions */}
              <div className="mt-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {/* Bank pill + plan chip */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={goToPayouts}
                    className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${
                      payoutSetupComplete
                        ? 'border-[#CFFF16]/45 bg-[#CFFF16]/12 text-[#4a6304] dark:text-[#CFFF16] hover:bg-[#CFFF16]/20'
                        : 'border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15'
                    }`}
                  >
                    <span className="relative flex h-2 w-2">
                      {!payoutSetupComplete && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                      )}
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${payoutSetupComplete ? 'bg-[#CFFF16] shadow-[0_0_8px_rgba(207,255,22,0.8)]' : 'bg-amber-400'}`} />
                    </span>
                    {payoutSetupComplete ? 'Bank account connected' : 'Connect bank'}
                    <ArrowUpRight className="w-3 h-3 opacity-60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </button>

                  <div className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-white/5 px-2.5 py-1 text-[10px] text-foreground/70 dark:text-white/70">
                    <Sparkles className="w-3 h-3 text-[#CFFF16]" />
                    {isCreatorSubscribed
                      ? <>Premium · <span className="text-[#4a6304] dark:text-[#CFFF16] font-semibold">0% commission</span></>
                      : <>Free · {Math.round(commissionRate * 100)}% commission</>}
                  </div>
                </div>

                {/* Withdraw CTA */}
                <div className="flex flex-col items-stretch sm:items-end gap-1.5">
                  <button
                    type="button"
                    onClick={handleRequestWithdrawal}
                    disabled={isRequestingWithdrawal || walletBalanceCents < 5000 || !payoutSetupComplete}
                    className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-[#CFFF16] px-6 py-3.5 text-sm font-bold text-black shadow-[0_10px_32px_-8px_rgba(207,255,22,0.5)] hover:shadow-[0_14px_40px_-8px_rgba(207,255,22,0.75)] hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none"
                  >
                    {isRequestingWithdrawal ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                    ) : (
                      <>
                        <ArrowDownToLine className="w-4 h-4" />
                        Withdraw {walletBalanceCents >= 5000 ? `$${(walletBalanceCents / 100).toFixed(2)}` : ''}
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-foreground/45 dark:text-white/45 tracking-wide sm:text-right">
                    Min. <span className="text-foreground/75 dark:text-white/75 font-semibold">$50.00</span> · 3–5 business days
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Tab toggle */}
        <section className="mt-1 mb-4">
          <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80 max-w-full overflow-x-auto scrollbar-hide">
            {[
              { key: 'metrics', label: 'Overview' },
              { key: 'subscriptions', label: 'Subscriptions' },
              { key: 'referral', label: 'Referral' },
              { key: 'payouts', label: 'Payouts' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as 'metrics' | 'subscriptions' | 'referral' | 'payouts')}
                className={`px-4 py-1.5 rounded-full font-medium transition-all whitespace-nowrap ${activeTab === tab.key
                  ? 'bg-primary text-white dark:text-black shadow-sm'
                  : 'hover:text-exclu-cloud'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === 'metrics' && (
          <>
            <section className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Profile visits metric */}
              <div
                className={`rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 cursor-pointer transition-colors ${activeMetric === 'profile_views' ? 'ring-1 ring-primary/70 border-primary/70' : ''}`}
                onClick={() => { setActiveMetric('profile_views'); setHoveredPoint(null); }}
              >
                <p className="text-xs text-exclu-space mb-1">Profile visits</p>
                <p className="text-2xl font-bold text-exclu-cloud">
                  {isLoading || profileViewCount === null
                    ? '—'
                    : profileViewCount.toLocaleString('en-US')}
                </p>
                <p className="text-[11px] text-exclu-space/80 mt-1">
                  Total visits on your public profile page.
                </p>
              </div>

              <div
                className={`rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 cursor-pointer transition-colors ${activeMetric === 'sales' ? 'ring-1 ring-primary/70 border-primary/70' : ''
                  }`}
                onClick={() => {
                  setActiveMetric('sales');
                  setHoveredPoint(null);
                }}
              >
                <p className="text-xs text-exclu-space mb-1">Total sales</p>
                <p className="text-2xl font-bold text-exclu-cloud">{isLoading ? '—' : totalSalesCount}</p>
                <p className="text-[11px] text-exclu-space/80 mt-1">Number of purchases across all your links.</p>
              </div>
              <div
                className={`rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 cursor-pointer transition-colors ${activeMetric === 'revenue' ? 'ring-1 ring-primary/70 border-primary/70' : ''
                  }`}
                onClick={() => {
                  setActiveMetric('revenue');
                  setHoveredPoint(null);
                }}
              >
                <p className="text-xs text-exclu-space mb-1">Revenue</p>
                <p className="text-2xl font-bold text-exclu-cloud">{isLoading ? '—' : `$${formattedRevenue} USD`}</p>
                <p className="text-[11px] text-exclu-space/80 mt-1">Net earnings across every revenue stream.</p>
              </div>
            </section>

            {/* Earnings breakdown — single consolidated view (replaces the old Tips tab) */}
            <section className="mt-6">
              <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70">Revenue breakdown</p>
                    <p className="text-sm text-exclu-space/80 mt-0.5">Net amount credited per stream — lifetime.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: 'Links', value: (purchasesRaw.reduce((s: number, p: any) => s + (p.creator_net_cents ?? Math.round(((p.amount_cents ?? 0) / 1.05) * (1 - commissionRate))), 0)), icon: Zap },
                    { label: 'Tips', value: tipsRevenueCents, icon: Heart },
                    { label: 'Requests', value: requestsRaw.reduce((s: number, r: any) => s + (r.creator_net_cents ?? Math.round((r.proposed_amount_cents ?? 0) * (1 - commissionRate))), 0), icon: FileText },
                    { label: 'Gifts', value: giftsRaw.reduce((s: number, g: any) => s + (g.creator_net_cents ?? 0), 0), icon: Gift },
                    { label: 'Subscriptions', value: fanSubStats.lifetimeNetCents, icon: Users },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-xl border border-exclu-arsenic/50 bg-black/30 p-4">
                      <div className="flex items-center gap-2 text-exclu-space/70 mb-1.5">
                        <Icon className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
                      </div>
                      <p className="text-lg font-bold text-exclu-cloud">
                        {isLoading ? '—' : `$${(value / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Analytics chart */}
            <section className="mt-6">
              <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70 mb-1">Growth over time</p>
                    <p className="text-sm text-exclu-space/80">
                      {activeMetric === 'profile_views'
                        ? 'Profile views'
                        : activeMetric === 'sales'
                          ? 'Total sales'
                          : 'Revenue'}{' '}
                      over the last {activeRange === '7d' ? '7 days' : activeRange === '30d' ? '30 days' : '12 months'}.
                    </p>
                  </div>
                  <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80">
                    {[
                      { key: '7d' as const, label: '7D' },
                      { key: '30d' as const, label: '30D' },
                      { key: '365d' as const, label: '1Y' },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setActiveRange(item.key);
                          setHoveredPoint(null);
                        }}
                        className={`px-3 py-1 rounded-full transition-colors ${activeRange === item.key
                          ? 'bg-exclu-cloud text-white dark:text-black shadow-sm'
                          : 'text-exclu-space hover:text-exclu-cloud'
                          }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {isLoading ? (
                  <p className="text-sm text-exclu-space/80">Loading analytics…</p>
                ) : (
                  (() => {
                    const series = buildSeries(activeMetric, activeRange);
                    const maxValue = series.reduce((max, p) => (p.value > max ? p.value : max), 0);

                    if (series.length === 0) {
                      return (
                        <p className="text-sm text-exclu-space/80">
                          {activeMetric === 'profile_views'
                            ? 'No profile view data yet for this period.'
                            : 'Not enough data yet to display a chart. Start publishing links and generating sales.'}
                        </p>
                      );
                    }

                    const height = 160;
                    const width = 600; // viewBox width, SVG is responsive
                    const paddingX = 4;  // minimal horizontal padding inside SVG — Y labels are HTML
                    const paddingY = 10;
                    const innerWidth = width - paddingX * 2;
                    const innerHeight = height - paddingY * 2;

                    const yLevels = [0, 0.25, 0.5, 0.75, 1];

                    const computedPoints = series.map((point, index) => {
                      const x =
                        series.length === 1
                          ? paddingX + innerWidth / 2
                          : paddingX + (innerWidth * index) / (series.length - 1);
                      const normalized = point.value / (maxValue || 1);
                      const y = paddingY + innerHeight - normalized * innerHeight;
                      return { x, y, label: point.label, value: point.value, dateKey: point.dateKey };
                    });

                    const pointsAttr = computedPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');

                    const lastPoint = series[series.length - 1];
                    const tooltipPoint = hoveredPoint || lastPoint;

                    const fmtYLabel = (dataVal: number) =>
                      activeMetric === 'revenue'
                        ? dataVal >= 100 ? `$${Math.round(dataVal / 100)}` : `$${(dataVal / 100).toFixed(1)}`
                        : Math.round(dataVal).toString();

                    return (
                      <div className="relative">
                        {/* Chart: Y-axis labels column + SVG column */}
                        <div className="flex items-stretch gap-0">
                          {/* Y-axis labels — fixed width, right-aligned */}
                          <div className="relative flex-shrink-0 w-9 h-40 sm:h-48 select-none">
                            {yLevels.map((ratio) => {
                              const dataVal = maxValue * (1 - ratio);
                              const topPct = (paddingY + innerHeight * ratio) / height * 100;
                              return (
                                <span
                                  key={ratio}
                                  className="absolute right-1 text-[9px] leading-none text-slate-400/60 -translate-y-1/2"
                                  style={{ top: `${topPct}%` }}
                                >
                                  {fmtYLabel(dataVal)}
                                </span>
                              );
                            })}
                          </div>

                          {/* SVG — full width of remaining space */}
                          <div className="flex-1 min-w-0">
                            <svg
                              viewBox={`0 0 ${width} ${height}`}
                              className="w-full h-40 sm:h-48 text-primary/80 transition-all duration-500"
                              preserveAspectRatio="none"
                            >
                              <defs>
                                <linearGradient id="metric-gradient" x1="0" x2="0" y1="0" y2="1">
                                  <stop offset="0%" stopColor="rgba(163,230,53,0.6)" />
                                  <stop offset="100%" stopColor="rgba(15,23,42,0)" />
                                </linearGradient>
                              </defs>

                              {/* Grid lines only (no Y text — handled in HTML) */}
                              <g>
                                {yLevels.map((ratio) => {
                                  const yVal = paddingY + innerHeight * ratio;
                                  return (
                                    <line
                                      key={ratio}
                                      x1={paddingX}
                                      x2={paddingX + innerWidth}
                                      y1={yVal}
                                      y2={yVal}
                                      stroke="rgba(148,163,184,0.15)"
                                      strokeWidth={0.5}
                                    />
                                  );
                                })}
                              </g>

                              {/* Area under curve */}
                              <polyline
                                fill="url(#metric-gradient)"
                                stroke="none"
                                points={`${paddingX + innerWidth},${height - paddingY} ${pointsAttr} ${paddingX},${height - paddingY}`}
                                className="opacity-80 transition-all duration-500"
                              />

                              {/* Line */}
                              <polyline
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                points={pointsAttr}
                                className="drop-shadow-[0_0_10px_rgba(207,255,22,0.7)] transition-all duration-500"
                              />

                              {/* Hover points */}
                              <g>
                                {computedPoints.map((pt, index) => (
                                  <circle
                                    key={index}
                                    cx={pt.x}
                                    cy={pt.y}
                                    r={3}
                                    className="fill-current opacity-0 hover:opacity-100 cursor-pointer transition-opacity duration-200"
                                    onMouseEnter={() => setHoveredPoint({ label: pt.label, value: pt.value })}
                                    onMouseLeave={() => setHoveredPoint(null)}
                                    onClick={() => {
                                      if (activeMetric === 'profile_views') return;

                                      const purchasesForDay = purchasesRaw.filter((purchase: any) => {
                                        if (!purchase.created_at) return false;
                                        const d = new Date(purchase.created_at);
                                        d.setHours(0, 0, 0, 0);
                                        const key = d.toISOString().slice(0, 10);
                                        return key === pt.dateKey;
                                      });

                                      const distinctLinkIds = Array.from(
                                        new Set(
                                          purchasesForDay
                                            .map((p: any) => p.link_id)
                                            .filter((id: string | null | undefined) => !!id),
                                        ),
                                      );

                                      if (distinctLinkIds.length === 1) {
                                        navigate(`/app/links/${distinctLinkIds[0]}`);
                                      } else if (distinctLinkIds.length > 1) {
                                        toast.info('Multiple links were purchased on this day. Open your Links page for details.');
                                      }
                                    }}
                                  />
                                ))}
                              </g>
                            </svg>

                            {/* X-axis labels — full width of SVG column */}
                            <div className="mt-2 flex justify-between text-[10px] text-exclu-space/70">
                              {series.map((point, index) => (
                                <span key={index} className="min-w-0 truncate">
                                  {index === 0 || index === series.length - 1 || series.length <= 7
                                    ? point.label
                                    : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Subtitle with latest total + tooltip info */}
                        {tooltipPoint && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-exclu-space/80">
                            <span>
                              {activeMetric === 'profile_views' ? 'Views on' : 'Total'}{' '}
                              {activeMetric === 'revenue'
                                ? `$${(lastPoint.value / 100).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} USD`
                                : lastPoint.value}{' '}
                              on {lastPoint.label}
                            </span>
                            {hoveredPoint && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 px-2.5 py-1 text-[10px] text-exclu-cloud">
                                {tooltipPoint.label} ·{' '}
                                {activeMetric === 'revenue'
                                  ? `$${(tooltipPoint.value / 100).toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })} USD`
                                  : tooltipPoint.value}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            </section>

            {/* Sales History — all revenue sources */}
            <section className="mt-6 rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 overflow-hidden">
              <div className="px-5 py-4 border-b border-exclu-arsenic/40">
                <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70">Sales History</p>
              </div>
              {purchasesRaw.length === 0 && tipsRaw.length === 0 && giftsRaw.length === 0 && requestsRaw.length === 0 ? (
                <p className="px-5 py-6 text-sm text-exclu-space/80">No sales yet. Start publishing links and sharing your profile!</p>
              ) : (
                <div className="divide-y divide-exclu-arsenic/40 max-h-[500px] overflow-y-auto">
                  {[
                    ...purchasesRaw.map((p: any) => ({
                      type: 'sale' as const,
                      amount_cents: Math.round((p.amount_cents ?? 0) / 1.05 * (1 - commissionRate)),
                      raw_cents: p.amount_cents,
                      date: p.created_at,
                      label: linksRaw.find((l: any) => l.id === p.link_id)?.title || 'Link purchase',
                    })),
                    ...tipsRaw.map((t: any) => ({
                      type: 'tip' as const,
                      amount_cents: t.creator_net_cents ?? Math.round((t.amount_cents ?? 0) * (1 - commissionRate)),
                      raw_cents: t.amount_cents,
                      date: t.created_at,
                      label: t.is_anonymous ? 'Anonymous tip' : ((t.fan as any)?.display_name || t.fan_name || 'Fan tip'),
                    })),
                    ...giftsRaw.map((g: any) => ({
                      type: 'gift' as const,
                      amount_cents: g.creator_net_cents ?? Math.round((g.amount_cents ?? 0) * (1 - commissionRate)),
                      raw_cents: g.amount_cents,
                      date: g.created_at,
                      label: g.is_anonymous ? 'Anonymous gift' : 'Wishlist gift',
                    })),
                    ...requestsRaw.map((r: any) => ({
                      type: 'request' as const,
                      amount_cents: r.creator_net_cents ?? Math.round((r.proposed_amount_cents ?? 0) * (1 - commissionRate)),
                      raw_cents: r.proposed_amount_cents,
                      date: r.created_at,
                      label: (r.description || 'Custom request').slice(0, 60),
                    })),
                  ]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 100)
                    .map((item, i) => {
                      const iconConfig = {
                        sale: { icon: <CreditCard className="w-3.5 h-3.5 text-green-400" />, bg: 'bg-green-500/20' },
                        tip: { icon: <Heart className="w-3.5 h-3.5 text-pink-400" />, bg: 'bg-pink-500/20' },
                        gift: { icon: <Gift className="w-3.5 h-3.5 text-purple-400" />, bg: 'bg-purple-500/20' },
                        request: { icon: <FileText className="w-3.5 h-3.5 text-blue-400" />, bg: 'bg-blue-500/20' },
                      }[item.type];
                      const typeLabel = { sale: 'Sale', tip: 'Tip', gift: 'Gift', request: 'Custom request' }[item.type];
                      return (
                        <div key={`${item.type}-${i}`} className="px-5 py-3.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconConfig.bg}`}>
                              {iconConfig.icon}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-exclu-cloud truncate">{item.label}</p>
                              <p className="text-[11px] text-exclu-space/60">
                                {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                {' · '}
                                <span>{typeLabel}</span>
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-green-400">
                              +${(item.amount_cents / 100).toFixed(2)}
                            </p>
                            <p className="text-[10px] text-exclu-space/50">
                              ${((item.raw_cents ?? 0) / 100).toFixed(2)} total
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>
          </>
        )}


        {activeTab === 'referral' && (() => {
          const COMMISSION_RATE = 0.35;
          const PREMIUM_USD = 39;
          const MIN_PAYOUT_CENTS = 10000;
          const totalReferred = referrals.length;
          const totalConverted = referrals.filter((r: any) => r.status === 'converted').length;
          const conversionRate = totalReferred > 0 ? Math.round((totalConverted / totalReferred) * 100) : 0;
          const canRequestPayout = affiliateEarningsCents >= MIN_PAYOUT_CENTS;
          const fmtAmt = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const referralLink = referralCode ? `${window.location.origin}/auth?mode=signup&ref=${referralCode}` : null;

          const SHARE_MSG = `Still giving away 20% to OnlyFans ? 😅\n\nSmart 🔞 creators are moving to Exclu.\n\n0% commission 💸\nGet paid fast 💵\nSell from your bio, anywhere 🔗\n\nEvery day you wait = money lost.\n\nSwitch now 📲 exclu.at\n\n(Limited FREE access link)`;

          const handleCopy = async () => {
            if (!referralLink) return;
            await navigator.clipboard.writeText(referralLink).catch(() => { });
            setReferralLinkCopied(true);
            setTimeout(() => setReferralLinkCopied(false), 2500);
          };


          const handleShare = (platform: string) => {
            if (!referralLink) return;
            const fullMsg = SHARE_MSG + '\n' + referralLink;
            const t = encodeURIComponent(fullMsg);
            const u = encodeURIComponent(referralLink);
            const m = encodeURIComponent(SHARE_MSG);
            // Instagram doesn't support direct share URLs — copy to clipboard instead
            if (platform === 'instagram') {
              navigator.clipboard.writeText(fullMsg).catch(() => { });
              toast.success('Message copied! Paste it on Instagram 📋');
              return;
            }
            const urls: Record<string, string> = {
              twitter: `https://twitter.com/intent/tweet?text=${t}`,
              telegram: `https://t.me/share/url?url=${u}&text=${m}`,
              snapchat: `https://www.snapchat.com/scan?attachmentUrl=${u}`,
            };
            if (urls[platform]) { window.open(urls[platform], '_blank', 'noopener,noreferrer'); }
            else { navigator.clipboard.writeText(fullMsg).catch(() => { }); }
          };


          const handleRequestPayout = async () => {
            setIsRequestingPayout(true);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const { error } = await supabase.functions.invoke('request-affiliate-payout', {
                body: {},
                headers: {
                  'x-supabase-auth': session?.access_token ?? '',
                },
              });
              if (error) throw error;
              setPayoutRequested(true);
              toast.success('Payout request sent! Our team will process it within 3 business days.');
            } catch {
              toast.error('Failed to send payout request. Please try again.');
            } finally {
              setIsRequestingPayout(false);
            }
          };

          const handleSendEmail = async () => {
            if (!inviteEmail || !inviteEmail.includes('@')) return;
            setIsSendingEmail(true);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              // Use x-supabase-auth header to avoid Supabase gateway JWT validation conflict
              const { error } = await supabase.functions.invoke('send-referral-invite', {
                body: { to_email: inviteEmail },
                headers: {
                  'x-supabase-auth': session?.access_token ?? '',
                },
              });
              if (!error) { setInviteEmail(''); toast.success(`Invite sent to ${inviteEmail}!`); }
              else { toast.error('Failed to send invite. Please try again.'); }
            } catch { toast.error('Failed to send invite. Please try again.'); }
            finally { setIsSendingEmail(false); }
          };

          const socialPlatformsList = [
            { p: 'twitter', label: 'X', icon: <SiX className="w-5 h-5" />, gradient: 'from-slate-900 to-slate-700' },
            { p: 'telegram', label: 'Telegram', icon: <SiTelegram className="w-5 h-5" />, gradient: 'from-sky-500 to-cyan-500' },
            { p: 'instagram', label: 'Instagram', icon: <SiInstagram className="w-5 h-5" />, gradient: 'from-[#f97316] to-[#ec4899]' },
            { p: 'snapchat', label: 'Snapchat', icon: <SiSnapchat className="w-5 h-5" />, gradient: 'from-yellow-300 to-yellow-500' },
          ];

          return (
            <section className="mt-2 space-y-4">

              {/* Stat cards — 3 cols for non-referred, 4 cols for referred users */}
              <div className={`grid gap-4 grid-cols-2 ${myReferralBonus !== null ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
                <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 transition-colors hover:border-primary/70 hover:ring-1 hover:ring-primary/70">
                  <p className="text-xs text-exclu-space mb-1">Affiliate earnings</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-exclu-cloud">{isLoading ? '—' : fmtAmt(affiliateEarningsCents)}</p>
                    {payoutRequested && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Pending</span>
                    )}
                  </div>
                  <p className="text-[11px] text-exclu-space/80 mt-1">Cashout when earnings &gt; $100.</p>
                </div>
                <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 transition-colors hover:border-primary/70 hover:ring-1 hover:ring-primary/70">
                  <p className="text-xs text-exclu-space mb-1">Creators recruited</p>
                  <p className="text-2xl font-bold text-exclu-cloud">{isLoading ? '—' : totalReferred}</p>
                  <p className="text-[11px] text-exclu-space/80 mt-1">Signed up via your link.</p>
                </div>
                <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 transition-colors hover:border-primary/70 hover:ring-1 hover:ring-primary/70">
                  <p className="text-xs text-exclu-space mb-1">Conversion rate</p>
                  <p className="text-2xl font-bold text-exclu-cloud">{isLoading ? '—' : `${conversionRate}%`}</p>
                  <p className="text-[11px] text-exclu-space/80 mt-1">{totalConverted} premium out of {totalReferred}.</p>
                </div>
                {myReferralBonus !== null && (
                  <div className={`rounded-2xl border p-5 transition-colors ${myReferralBonus.unlocked ? 'border-green-500/60 bg-green-950/40 hover:border-green-400/70 hover:ring-1 hover:ring-green-400/70' : 'border-exclu-arsenic/60 bg-exclu-ink/80 hover:border-primary/70 hover:ring-1 hover:ring-primary/70'}`}>
                    <p className="text-xs text-exclu-space mb-1">Welcome bonus</p>
                    <p className={`text-2xl font-bold ${myReferralBonus.unlocked ? 'text-green-400' : 'text-exclu-cloud'}`}>
                      {isLoading ? '—' : '$100.00'}
                    </p>
                    <p className="text-[11px] text-exclu-space/80 mt-1">
                      {myReferralBonus.unlocked
                        ? 'Unlocked — credited to your earnings.'
                        : myReferralBonus.eligible
                          ? `Make $1,000 in sales within ${myReferralBonus.daysLeft}d to unlock.`
                          : 'Expired — $1,000 target not reached in time.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Payout request button — centered below the cards */}
              {canRequestPayout && !payoutRequested && (
                <div className="flex flex-col items-center gap-2 py-1">
                  <Button
                    type="button"
                    variant="hero"
                    size="sm"
                    disabled={isRequestingPayout}
                    onClick={handleRequestPayout}
                  >
                    {isRequestingPayout
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Sending request…</>
                      : <><ExternalLink className="w-4 h-4" />Request payout — {fmtAmt(affiliateEarningsCents)}</>}
                  </Button>
                  <p className="text-[10px] text-exclu-space/50">Payouts are processed manually within 3 business days.</p>
                </div>
              )}

              {/* Referral link + email + social */}
              <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6 space-y-4">

                {/* Header with info tooltip */}
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70">Your referral link</p>
                  <div className="relative group/info">
                    {/* Info icon */}
                    <button type="button" className="w-4 h-4 rounded-full border border-exclu-arsenic/60 text-exclu-space/50 hover:text-exclu-cloud hover:border-exclu-space/60 transition-colors flex items-center justify-center">
                      <span className="text-[9px] font-bold leading-none">i</span>
                    </button>
                    {/* Tooltip — slide up on hover, opaque bg */}
                    <div className="
                      absolute left-0 bottom-[calc(100%+8px)] w-72 z-50
                      rounded-2xl border border-slate-200 dark:border-exclu-arsenic/60
                      bg-white dark:bg-[#0e0e16]
                      shadow-xl p-4
                      opacity-0 translate-y-2 pointer-events-none
                      group-hover/info:opacity-100 group-hover/info:translate-y-0 group-hover/info:pointer-events-auto
                      transition-all duration-200 ease-out
                    ">
                      <p className="text-xs font-semibold text-slate-900 dark:text-exclu-cloud mb-2">How it works 💡</p>
                      <div className="space-y-2 text-[11px] leading-relaxed text-slate-600 dark:text-exclu-space/80">
                        <p>
                          <span className="font-medium text-slate-900 dark:text-exclu-cloud">For you :</span>{' '}
                          We give you <span className="text-primary font-semibold">35%</span> of the revenue Exclu generates from your referrals. Withdrawals start at $100.
                        </p>
                        <p>
                          <span className="font-medium text-slate-900 dark:text-exclu-cloud">For friends :</span>{' '}
                          <span className="text-primary font-semibold">+$100</span> Bonus if they reach $1k in revenue within 90 days.
                        </p>
                        <p className="text-slate-400 dark:text-exclu-space/50 text-[10px] pt-1 border-t border-slate-200 dark:border-exclu-arsenic/40">
                          *Each referral doubles as an entry ticket to win our monthly Mystery Box: Birkins, Cash Prizes.
                        </p>
                      </div>
                      {/* Arrow */}
                      <div className="absolute -bottom-1.5 left-3 w-3 h-3 rotate-45 border-b border-r border-slate-200 dark:border-exclu-arsenic/60 bg-white dark:bg-[#0e0e16]" />
                    </div>
                  </div>
                </div>

                {/* Link + copy — blanc en clair, sombre en dark */}
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-exclu-arsenic/50 bg-white dark:bg-black/30 px-3 py-2.5">
                    <p className="text-xs text-black dark:text-exclu-space/80 font-mono truncate">{referralLink ?? 'Generating…'}</p>
                  </div>
                  <Button
                    type="button" size="sm"
                    variant={referralLinkCopied ? 'outline' : 'hero'}
                    className="rounded-xl px-4 flex-shrink-0 transition-all"
                    onClick={handleCopy}
                    disabled={!referralLink}
                  >
                    {referralLinkCopied
                      ? <span className="flex items-center gap-1.5 text-green-400"><Check className="w-3.5 h-3.5" />Copied!</span>
                      : <span className="flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" />Copy</span>}
                  </Button>
                </div>

                {/* Email invite — blanc en clair, sombre en dark */}
                <div>
                  <p className="text-[11px] text-exclu-space/60 mb-2 flex items-center gap-1.5"><Mail className="w-3 h-3" />Send a personal invite by email</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="creator@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSendEmail(); }}
                      className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-exclu-arsenic/50 bg-white dark:bg-black/30 px-3 text-sm text-black dark:text-exclu-cloud placeholder:text-slate-400 dark:placeholder:text-exclu-space/40 outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <Button
                      type="button" variant="hero" size="sm"
                      className="rounded-xl px-3 flex-shrink-0"
                      onClick={handleSendEmail}
                      disabled={isSendingEmail || !inviteEmail}
                    >
                      {isSendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="flex items-center gap-1"><Send className="w-3 h-3" />Send</span>}
                    </Button>
                  </div>
                </div>

                {/* Social share — 4 platforms in 1 row (no TikTok; Instagram copies) */}
                <div>
                  <p className="text-[11px] text-exclu-space/60 mb-3">Share on social media</p>
                  <div className="grid grid-cols-4 gap-2">
                    {socialPlatformsList.map(({ p, label, icon, gradient }) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleShare(p)}
                        className="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border border-exclu-arsenic/60 bg-exclu-arsenic/10 hover:bg-exclu-arsenic/20 hover:border-exclu-arsenic/80 transition-all group"
                      >
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-r ${gradient} flex items-center justify-center text-white flex-shrink-0`}>
                          {icon}
                        </div>
                        <p className="text-[10px] font-medium text-exclu-cloud/80 group-hover:text-exclu-cloud truncate w-full text-center">{label}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Activity table */}
              <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 overflow-hidden">
                <div className="px-5 py-4 border-b border-exclu-arsenic/40 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70">Recruitment history</p>
                  {referrals.length > 0 && <p className="text-[11px] text-exclu-space/70">{referrals.length} creator{referrals.length > 1 ? 's' : ''}</p>}
                </div>

                {isLoading && <p className="px-5 py-4 text-sm text-exclu-space/80">Loading…</p>}

                {!isLoading && referrals.length === 0 && (
                  <p className="px-5 py-6 text-sm text-exclu-space/80">
                    No recruitments yet — share your link to start earning!
                  </p>
                )}

                {!isLoading && referrals.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-xs uppercase text-exclu-space/70 border-b border-exclu-arsenic/60">
                        <tr>
                          <th className="px-5 py-2 text-left">Creator</th>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {referrals.map((r: any) => (
                          <tr key={r.id} className="border-t border-exclu-arsenic/40 hover:bg-white/[0.02] transition-colors">
                            <td className="px-5 py-3 text-exclu-cloud font-medium">
                              {r.referred_display_name || r.referred_handle || 'Anonymous'}
                              {r.referred_handle && <span className="ml-1.5 text-[11px] text-exclu-space/60">@{r.referred_handle}</span>}
                            </td>
                            <td className="px-3 py-3 text-exclu-space/80 text-xs">
                              {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${r.status === 'converted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                                : r.status === 'inactive' ? 'bg-red-500/10 text-red-400 border border-red-500/40'
                                  : 'bg-blue-500/10 text-blue-300 border border-blue-500/40'
                                }`}>
                                {r.status === 'converted' ? 'Premium' : r.status === 'inactive' ? 'Inactive' : 'Free'}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-medium">
                              <span className={r.commission_earned_cents > 0 ? 'text-primary' : 'text-exclu-space/40'}>
                                {r.commission_earned_cents > 0 ? fmtAmt(r.commission_earned_cents) : '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>

            </section>
          );
        })()}

        {activeTab === 'subscriptions' && (
          <section className="mt-2 space-y-4">
            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5">
                <p className="text-xs text-exclu-space mb-1">Active subscribers</p>
                <p className="text-2xl font-bold text-exclu-cloud">{isLoading ? '—' : fanSubStats.active}</p>
                <p className="text-[11px] text-exclu-space/80 mt-1">Fans currently within their paid period.</p>
              </div>
              <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5">
                <p className="text-xs text-exclu-space mb-1">Lifetime earnings</p>
                <p className="text-2xl font-bold text-exclu-cloud">
                  {isLoading
                    ? '—'
                    : `$${(fanSubStats.lifetimeNetCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
                <p className="text-[11px] text-exclu-space/80 mt-1">Net credited to your wallet.</p>
              </div>
              <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5">
                <p className="text-xs text-exclu-space mb-1">Last 30 days</p>
                <p className="text-2xl font-bold text-exclu-cloud">
                  {isLoading
                    ? '—'
                    : `$${(fanSubStats.last30dNetCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
                <p className="text-[11px] text-exclu-space/80 mt-1">Rolling 30-day subscription revenue.</p>
              </div>
              <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5">
                <p className="text-xs text-exclu-space mb-1">Total history</p>
                <p className="text-2xl font-bold text-exclu-cloud">{isLoading ? '—' : fanSubscribers.length}</p>
                <p className="text-[11px] text-exclu-space/80 mt-1">Every fan who ever subscribed.</p>
              </div>
            </div>

            {/* Subscribers list */}
            <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 overflow-hidden">
              <div className="px-5 py-4 border-b border-exclu-arsenic/40 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70">Subscribers</p>
                <p className="text-[11px] text-exclu-space/60">Sorted by most recent</p>
              </div>

              {isLoading && (
                <p className="px-5 py-4 text-sm text-exclu-space/80">Loading subscribers…</p>
              )}

              {!isLoading && fanSubscribers.length === 0 && (
                <p className="px-5 py-6 text-sm text-exclu-space/80">
                  No subscribers yet. Share your profile link — the Discover popup on your public page lets fans subscribe in one click.
                </p>
              )}

              {!isLoading && fanSubscribers.length > 0 && (
                <div className="divide-y divide-exclu-arsenic/40 max-h-[600px] overflow-y-auto">
                  {fanSubscribers.map((sub) => {
                    const now = Date.now();
                    const periodEnd = sub.period_end ? new Date(sub.period_end).getTime() : 0;
                    const isLive = (sub.status === 'active' || sub.status === 'cancelled') && periodEnd > now;
                    const isExpired = periodEnd > 0 && periodEnd <= now;
                    return (
                      <div key={sub.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-primary/15 flex-shrink-0">
                            {sub.fan?.avatar_url ? (
                              <img src={sub.fan.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Users className="w-4 h-4 text-primary/80" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-exclu-cloud truncate">
                              {sub.fan?.display_name || 'Fan'}
                            </p>
                            <p className="text-[11px] text-exclu-space/60">
                              Started {sub.started_at ? new Date(sub.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                              {isLive && sub.period_end && (
                                <> · renews {sub.cancel_at_period_end ? 'no — ends ' : ''}
                                  {new Date(sub.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                              )}
                              {isExpired && ' · expired'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-green-400">
                            +${((sub.creator_net_cents || 0) / 100).toFixed(2)}
                          </p>
                          <p className="text-[10px] text-exclu-space/50">
                            ${(sub.price_cents / 100).toFixed(2)} / mo
                          </p>
                          {isLive && (
                            <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${sub.cancel_at_period_end ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                              <span className={`w-1 h-1 rounded-full ${sub.cancel_at_period_end ? 'bg-amber-300' : 'bg-emerald-300'}`} />
                              {sub.cancel_at_period_end ? 'Cancelling' : 'Active'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'payouts' && (
          <section ref={payoutsSectionRef} className="mt-2 space-y-4 scroll-mt-24">
            {/* Quick withdrawal stat row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Available', value: walletBalanceCents, accent: 'text-[#4a6304] dark:text-[#CFFF16]' },
                { label: 'Total earned', value: walletTotalEarnedCents, accent: 'text-foreground dark:text-white' },
                { label: 'Withdrawn', value: walletTotalWithdrawnCents, accent: 'text-foreground dark:text-white' },
                {
                  label: 'In progress',
                  value: walletPayouts
                    .filter((p: any) => ['pending', 'processing', 'requested'].includes(p.status))
                    .reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0),
                  accent: 'text-foreground/70 dark:text-white/70',
                },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-foreground/50 dark:text-white/50 font-semibold">{stat.label}</p>
                  <p className={`text-xl sm:text-2xl font-bold mt-1 tabular-nums ${stat.accent}`}>
                    ${(stat.value / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>

            {/* Bank Account card */}
            <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/50 dark:text-white/50 font-semibold mb-1">Payout method</p>
                  <h2 className="text-lg sm:text-xl font-bold text-foreground dark:text-white">Bank account</h2>
                </div>
                {payoutSetupComplete && !isEditingBank && (
                  <button
                    type="button"
                    onClick={() => setIsEditingBank(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-white/5 px-2.5 py-1 text-[11px] font-medium text-foreground/70 dark:text-white/70 hover:text-foreground dark:hover:text-white hover:border-foreground/20 dark:hover:border-white/20 transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>

              {payoutSetupComplete && !isEditingBank ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Visual bank "card" — lime gradient, no emerald */}
                  <div className="relative overflow-hidden rounded-2xl border border-[#CFFF16]/30 bg-gradient-to-br from-[#CFFF16]/12 via-transparent to-[#CFFF16]/8 dark:from-[#CFFF16]/14 dark:via-transparent dark:to-[#CFFF16]/6 p-5 min-h-[180px]">
                    <div aria-hidden className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full bg-[#CFFF16]/25 blur-3xl" />
                    <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-16 w-44 h-44 rounded-full bg-[#CFFF16]/10 blur-3xl" />
                    <div className="relative flex items-center justify-between">
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-[#CFFF16]/15 border border-[#CFFF16]/50 px-2.5 py-1 text-[10px] font-semibold text-[#4a6304] dark:text-[#CFFF16]">
                        <ShieldCheck className="w-3 h-3" /> Verified
                      </div>
                      <Landmark className="w-6 h-6 text-[#4a6304]/70 dark:text-[#CFFF16]/80" />
                    </div>
                    <div className="relative mt-10">
                      <p className="text-[10px] uppercase tracking-wider text-foreground/55 dark:text-white/55 font-semibold">Account holder</p>
                      <p className="text-base font-bold text-foreground dark:text-white truncate mt-0.5">{bankData?.bank_holder_name || '—'}</p>
                    </div>
                    <div className="relative mt-3 font-mono text-sm tracking-wider text-foreground/90 dark:text-white/90">
                      {bankData?.bank_iban
                        ? bankData.bank_iban.replace(/(.{4})/g, '$1 ').trim()
                        : bankData?.bank_account_number || '••••  ••••  ••••'}
                    </div>
                  </div>

                  {/* Field details */}
                  <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-foreground/[0.02] dark:bg-white/[0.03] p-5 space-y-1 text-sm">
                    {getBankDisplayFields(bankData).map((f) => (
                      <div key={f.label} className="flex justify-between gap-4 py-1.5 border-b border-foreground/5 dark:border-white/5 last:border-b-0">
                        <span className="text-foreground/60 dark:text-white/60 text-xs">{f.label}</span>
                        <span className="text-foreground dark:text-white font-mono text-xs truncate">{f.value}</span>
                      </div>
                    ))}
                    {bankData?.bank_country && (
                      <div className="flex justify-between gap-4 py-1.5">
                        <span className="text-foreground/60 dark:text-white/60 text-xs">Country</span>
                        <span className="text-foreground dark:text-white text-xs">{bankData.bank_country}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#CFFF16]/40 bg-[#CFFF16]/5 p-4 mb-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-[#4a6304] dark:text-[#CFFF16] flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-foreground dark:text-white">{isEditingBank ? 'Update your bank details' : 'Set up your payout method'}</p>
                    <p className="text-xs text-foreground/70 dark:text-white/70 mt-0.5">
                      {isEditingBank
                        ? 'Save the new details and we\'ll send your next payout to this account.'
                        : 'Add a bank account to receive your earnings. We support IBAN, US (ACH), AU (BSB) and more.'}
                    </p>
                  </div>
                </div>
              )}

              {(!payoutSetupComplete || isEditingBank) && (
                <div className="mt-4">
                  <BankDetailsForm
                    initialData={bankData}
                    payoutSetupComplete={payoutSetupComplete}
                    onSaved={(data) => {
                      setBankData(data);
                      setPayoutSetupComplete(true);
                      setIsEditingBank(false);
                      toast.success('Bank account saved.');
                    }}
                    onCancel={isEditingBank ? () => setIsEditingBank(false) : undefined}
                  />
                </div>
              )}
            </div>

            {/* Withdrawal History */}
            <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] overflow-hidden">
              <div className="px-5 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/50 dark:text-white/50 font-semibold">Withdrawal history</p>
                  <p className="text-sm text-foreground dark:text-white font-bold mt-0.5">{walletPayouts.length} {walletPayouts.length === 1 ? 'payout' : 'payouts'}</p>
                </div>
                {walletBalanceCents >= 5000 && payoutSetupComplete && (
                  <Button
                    type="button"
                    onClick={handleRequestWithdrawal}
                    disabled={isRequestingWithdrawal}
                    size="sm"
                    className="rounded-full gap-1.5 bg-[#CFFF16] text-black hover:bg-[#bef200] shadow-[0_6px_20px_-6px_rgba(207,255,22,0.55)]"
                  >
                    {isRequestingWithdrawal
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Requesting</>
                      : <><ArrowDownToLine className="w-3.5 h-3.5" /> Cash out</>}
                  </Button>
                )}
              </div>

              {walletPayouts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-foreground/5 dark:bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center">
                    <Banknote className="w-6 h-6 text-foreground/50 dark:text-white/50" />
                  </div>
                  <p className="text-sm text-foreground/70 dark:text-white/70">No withdrawals yet</p>
                  <p className="text-[11px] text-foreground/50 dark:text-white/50 max-w-xs text-center">
                    Reach <span className="text-foreground dark:text-white font-semibold">$50</span> in your wallet then request a payout — funds arrive in 3–5 business days.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-black/5 dark:divide-white/10 max-h-[520px] overflow-y-auto">
                  {walletPayouts.map((payout) => {
                    const isPaid = payout.status === 'completed' || payout.status === 'paid';
                    const isFailed = payout.status === 'failed' || payout.status === 'rejected';
                    const dotClass = isPaid
                      ? 'bg-[#CFFF16]/15 text-[#4a6304] dark:text-[#CFFF16] border border-[#CFFF16]/40'
                      : isFailed
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
                        : 'bg-foreground/5 dark:bg-white/5 text-foreground/70 dark:text-white/70 border border-foreground/10 dark:border-white/10';
                    const Icon = isPaid ? CircleCheck : isFailed ? CircleX : Clock;
                    return (
                      <div key={payout.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${dotClass}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground dark:text-white tabular-nums">
                              ${(payout.amount_cents / 100).toFixed(2)}
                            </p>
                            <p className="text-[11px] text-foreground/55 dark:text-white/55">
                              Requested {new Date(payout.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {payout.paid_at && ` · paid ${new Date(payout.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                            </p>
                            {payout.rejection_reason && (
                              <p className="text-[11px] text-red-500/80 dark:text-red-300/80 mt-1">Reason: {payout.rejection_reason}</p>
                            )}
                          </div>
                        </div>
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${dotClass}`}>
                          {payout.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

      </main>
    </AppShell>
  );
};

export default AppDashboard;
