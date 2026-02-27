import AppShell from '@/components/AppShell';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ExternalLink, X, CreditCard, Check, Copy, Zap, Users, Share2, Mail, Send, Loader2 } from 'lucide-react';
import { SiX, SiTelegram, SiInstagram, SiTiktok, SiSnapchat } from 'react-icons/si';
import { motion, AnimatePresence } from 'framer-motion';

// --- SELF-HEALING & CACHE-BUSTING ---
// Increment this version when making critical changes to force data re-fetch
const APP_DASHBOARD_VERSION = '1.0.4';

const AppDashboard = () => {
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
  const [activeTab, setActiveTab] = useState<'metrics' | 'earnings' | 'referral'>('metrics');
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
  const [activeMetric, setActiveMetric] = useState<'published' | 'sales' | 'revenue'>('published');
  const [activeRange, setActiveRange] = useState<'7d' | '30d' | '365d'>('30d');
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number } | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
  const [profileViewCount, setProfileViewCount] = useState<number | null>(null);
  const [stripeConnectStatus, setStripeConnectStatus] = useState<string | null>(null);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [isCreatorSubscribed, setIsCreatorSubscribed] = useState(false);
  const [commissionRate, setCommissionRate] = useState(0.10);
  const [connectPhaseIndex, setConnectPhaseIndex] = useState(0);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const stripeConnectPhases = [
    'Preparing a secure connection with Stripe…',
    'Creating your Stripe onboarding link…',
    'Almost ready, redirecting you to Stripe…',
  ];

  useEffect(() => {
    let isMounted = true;

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
        // Profile (display_name for greeting + stripe_connect_status + premium flag)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('display_name, handle, stripe_connect_status, is_creator_subscribed, profile_view_count, referral_code, affiliate_earnings_cents, affiliate_payout_requested_at')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error loading creator profile', profileError);
        }

        // Links metrics
        const { data: links, error: linksError } = await supabase
          .from('links')
          .select('id, click_count, status, created_at')
          .eq('creator_id', user.id);

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

        // Tips revenue – net amount received by creator (amount_cents already = what creator gets, no fee adjustment needed)
        const { data: tipsData } = await supabase
          .from('tips')
          .select('amount_cents')
          .eq('creator_id', user.id)
          .eq('status', 'succeeded');
        const safeTips = tipsData ?? [];
        const tipsSum = safeTips.reduce((sum: number, t: any) => sum + Math.round((t.amount_cents ?? 0) * (1 - rate)), 0);

        // Payouts for earnings view
        const { data: payoutsData, error: payoutsError } = await supabase
          .from('payouts')
          .select('id, amount_cents, status, created_at, paid_at')
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false });

        if (payoutsError) throw payoutsError;

        const safePayouts = payoutsData ?? [];
        const totalPayoutsCents = safePayouts
          .filter((p: any) => p.status !== 'failed')
          .reduce((sum: number, p: any) => sum + (p.amount_cents ?? 0), 0);
        const walletBalance = revenueSum + tipsSum - totalPayoutsCents;

        if (!isMounted) return;

        setTotalLinks(linksCount);
        setPublishedLinksCount(publishedCount);
        setTotalSalesCount(salesCount);
        setTotalRevenueCents(revenueSum + tipsSum);
        setTipsRevenueCents(tipsSum);
        setWalletBalanceCents(walletBalance);
        setLinksRaw(safeLinks);
        setPurchasesRaw(safePurchases);
        setPayouts(safePayouts);
        if (profile) {
          setProfileName(profile.display_name || 'Creator');
          setProfileHandle(profile.handle || null);
          setProfileViewCount(profile.profile_view_count ?? 0);
          setStripeConnectStatus(profile.stripe_connect_status || null);
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

          // --- SELF-HEALING: INTERCEPT INCOMPLETE STRIPE STATUS ---
          // If the profile says it's not complete, we trigger a background check 
          // to ensure the DB and Stripe are in sync without waiting for a webhook.
          if (profile.stripe_connect_status !== 'complete' && profile.stripe_connect_status !== 'no_account') {
            supabase.functions.invoke('stripe-connect-status', {}).then(({ data }) => {
              if (data?.status && data.status !== profile.stripe_connect_status) {
                console.log('[Dashboard] Auto-synced Stripe status:', data.status);
                setStripeConnectStatus(data.status);
              }
            }).catch(console.error);
          }

          // Show Stripe modal if not connected (only once per session)
          const stripeModalDismissed = sessionStorage.getItem('stripeModalDismissed');
          if (profile.stripe_connect_status !== 'complete' && !stripeModalDismissed) {
            setShowStripeModal(true);
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
    // This helps when a user goes to Stripe/Email and comes back
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
  }, []);

  // We removed the stripe_onboarding=return effect here
  // because the user is now redirected to /app/stripe-validation.

  const handleStripeConnect = async () => {
    setIsConnectingStripe(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Please sign in again to connect Stripe.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
        headers: {
          // Prevent the Functions gateway from trying to validate the user JWT
          // in the Authorization header; we pass it explicitly via x-supabase-auth.
          Authorization: '',
          'x-supabase-auth': session.access_token,
        },
      });

      if (error) {
        console.error('Error invoking stripe-connect-onboard', error);
        throw new Error('Unable to start Stripe onboarding.');
      }

      const url = (data as any)?.url;
      if (!url) {
        throw new Error('Stripe onboarding URL not available.');
      }

      window.location.href = url;
    } catch (err: any) {
      console.error('Error during Stripe Connect', err);
      toast.error(err?.message || 'Unable to connect Stripe.');
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const handleDismissStripeModal = () => {
    sessionStorage.setItem('stripeModalDismissed', 'true');
    setShowStripeModal(false);
  };

  const formattedRevenue = (totalRevenueCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const publicProfileUrl = profileHandle ? `${window.location.origin}/${profileHandle}` : null;

  // While we are starting the Stripe Connect flow, show a small phased status message
  // so creators understand that the redirect can take a few seconds.
  useEffect(() => {
    if (!isConnectingStripe) {
      setConnectPhaseIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setConnectPhaseIndex((prev) => (prev + 1) % stripeConnectPhases.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [isConnectingStripe]);

  const buildSeries = (
    metric: 'published' | 'sales' | 'revenue',
    range: '7d' | '30d' | '365d'
  ): { label: string; value: number; dateKey: string }[] => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 365;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Collect events (date + value)
    const events: { date: Date; value: number }[] = [];

    if (metric === 'published') {
      linksRaw.forEach((link: any) => {
        if (link.status === 'published' && link.created_at) {
          const d = new Date(link.created_at);
          d.setHours(0, 0, 0, 0);
          events.push({ date: d, value: 1 });
        }
      });
    } else if (metric === 'sales' || metric === 'revenue') {
      purchasesRaw.forEach((purchase: any) => {
        if (purchase.created_at) {
          const d = new Date(purchase.created_at);
          d.setHours(0, 0, 0, 0);
          const value = metric === 'sales' ? 1 : Math.round((purchase.amount_cents ?? 0) / 1.05 * (1 - commissionRate));
          events.push({ date: d, value });
        }
      });
    }

    if (events.length === 0) {
      return [];
    }

    // Sort events by date
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    const points: { label: string; value: number; dateKey: string }[] = [];

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
      {/* Stripe Connect Modal */}
      <AnimatePresence>
        {showStripeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={handleDismissStripeModal}
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
                onClick={handleDismissStripeModal}
                className="absolute top-4 right-4 text-exclu-space/60 hover:text-exclu-cloud transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-6">
                <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-[#635BFF] to-[#A259FF] flex items-center justify-center mb-4">
                  <span className="text-sm font-semibold tracking-tight text-white">Stripe</span>
                </div>
                <h2 className="text-xl font-bold text-exclu-cloud mb-2">
                  Connect Stripe to get paid
                </h2>
                <p className="text-sm text-exclu-space/80">
                  Exclu does not hold a wallet for you: every payment from your fans is paid out directly to your
                  Stripe account. On the Premium plan you keep 100% of your sales; on the Free plan Exclu only takes a
                  10% creator commission.
                </p>
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <span className="text-exclu-space">Instant payouts to your bank</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <span className="text-exclu-space">Secure & trusted worldwide</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  </div>
                  <span className="text-exclu-space">Takes only 2 minutes</span>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  variant="hero"
                  size="lg"
                  className="w-full rounded-full"
                  onClick={handleStripeConnect}
                  disabled={isConnectingStripe}
                >
                  {isConnectingStripe ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="text-xs sm:text-sm text-exclu-cloud/90">
                        {stripeConnectPhases[connectPhaseIndex]}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4" />
                      Connect with Stripe
                    </span>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={handleDismissStripeModal}
                  className="w-full text-center text-xs text-exclu-space/60 hover:text-exclu-space transition-colors py-2"
                >
                  I'll do this later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="px-4 pb-16 max-w-6xl mx-auto">
        {/* Simple header with greeting */}
        <section className="mt-4 sm:mt-6 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-extrabold text-exclu-cloud truncate">
                <span>Welcome back{profileName ? <>, <span className="text-black dark:text-[#CFFF16]">{profileName}</span></> : ''}</span>
              </h1>
              <p className="text-sm text-exclu-space/70 mt-1">
                Here's an overview of your performance <span className="text-[10px] opacity-30">v{APP_DASHBOARD_VERSION}</span>
              </p>
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
              <RouterLink
                to="/app/profile"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 text-xs text-exclu-space hover:text-exclu-cloud hover:border-primary/50 transition-colors whitespace-nowrap"
              >
                <span>Profile</span>
              </RouterLink>

            </div>
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-400 mb-4 max-w-xl">{error}</p>
        )}

        {/* Notice for creators with existing links but incomplete or limited Stripe Connect */}
        {!isLoading && !error && totalLinks > 0 && stripeConnectStatus !== 'complete' && (
          <section className="mb-4 max-w-2xl">
            <div className="rounded-2xl border border-amber-500/50 bg-amber-500/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-[13px]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <CreditCard className="w-3.5 h-3.5 text-amber-900 dark:text-amber-300" />
                </div>
                <div className="space-y-0.5">
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    {stripeConnectStatus === 'restricted'
                      ? 'Action needed to restore payouts on Stripe'
                      : 'Finish your Stripe payout setup to unlock payments'}
                  </p>
                  <p className="text-[11px] sm:text-xs text-amber-800 dark:text-amber-100/80">
                    {stripeConnectStatus === 'restricted'
                      ? 'Stripe has temporarily limited your payout account. Open Stripe to provide the missing information or fix any issues so payouts can be enabled again.'
                      : 'Fans can already see your links, but checkout is disabled until you complete your payout details on Stripe.'}
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="hero"
                  className="rounded-full px-3 py-1 text-xs whitespace-nowrap"
                  onClick={handleStripeConnect}
                  disabled={isConnectingStripe}
                >
                  {isConnectingStripe ? 'Redirecting…' : 'Finish Stripe setup'}
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Metrics / Earnings / Referral toggle */}
        <section className="mt-1 mb-4">
          <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80">
            {[
              { key: 'metrics', label: 'Metrics' },
              { key: 'earnings', label: 'Earnings' },
              { key: 'referral', label: 'Referral' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as 'metrics' | 'earnings' | 'referral')}
                className={`px-4 py-1.5 rounded-full font-medium transition-all ${activeTab === tab.key
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
            <section className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
              {/* Profile visits metric */}
              <div
                className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 transition-colors hover:border-primary/70 hover:ring-1 hover:ring-primary/70"
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
                className={`rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 cursor-pointer transition-colors ${activeMetric === 'published' ? 'ring-1 ring-primary/70 border-primary/70' : ''
                  }`}
                onClick={() => {
                  setActiveMetric('published');
                  setHoveredPoint(null);
                }}
              >
                <p className="text-xs text-exclu-space mb-1">Tips & Requests</p>
                <p className="text-2xl font-bold text-exclu-cloud">
                  {isLoading ? '—' : `$${(tipsRevenueCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`}
                </p>
                <p className="text-[11px] text-exclu-space/80 mt-1">
                  Cumulative earnings from tips and requests.
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
                <p className="text-[11px] text-exclu-space/80 mt-1">Total revenue from successful purchases.</p>
              </div>
            </section>

            {/* Analytics chart */}
            <section className="mt-6">
              <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70 mb-1">Growth over time</p>
                    <p className="text-sm text-exclu-space/80">
                      {activeMetric === 'published'
                        ? 'Published links'
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

                    if (series.length === 0 || maxValue === 0) {
                      return (
                        <p className="text-sm text-exclu-space/80">
                          Not enough data yet to display a chart. Start publishing links and generating sales.
                        </p>
                      );
                    }

                    const height = 160;
                    const width = 600; // viewBox width, SVG is responsive
                    const paddingX = 10;
                    const paddingY = 10;
                    const innerWidth = width - paddingX * 2;
                    const innerHeight = height - paddingY * 2;

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

                    return (
                      <div className="relative">
                        <svg
                          viewBox={`0 0 ${width} ${height}`}
                          className="w-full h-40 sm:h-48 text-primary/80 transition-all duration-500"
                        >
                          <defs>
                            <linearGradient id="metric-gradient" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="rgba(163,230,53,0.6)" />
                              <stop offset="100%" stopColor="rgba(15,23,42,0)" />
                            </linearGradient>
                          </defs>

                          {/* Background grid */}
                          <g className="stroke-exclu-arsenic/40">
                            {[0.25, 0.5, 0.75].map((ratio) => (
                              <line
                                key={ratio}
                                x1={paddingX}
                                x2={width - paddingX}
                                y1={paddingY + innerHeight * ratio}
                                y2={paddingY + innerHeight * ratio}
                                strokeWidth={0.5}
                              />
                            ))}
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
                            className="drop-shadow-[0_0_10px_rgba(56,189,248,0.7)] transition-all duration-500"
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
                                  // On sales / revenue, try to navigate to the link if the day maps to a single link
                                  if (activeMetric === 'published') return;

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

                        {/* X-axis labels */}
                        <div className="mt-2 flex justify-between text-[10px] text-exclu-space/70">
                          {series.map((point, index) => (
                            <span key={index} className="min-w-0 truncate">
                              {index === 0 || index === series.length - 1 || series.length <= 7
                                ? point.label
                                : ''}
                            </span>
                          ))}
                        </div>

                        {/* Subtitle with latest total + tooltip info */}
                        {tooltipPoint && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-exclu-space/80">
                            <span>
                              Total{' '}
                              {activeMetric === 'revenue'
                                ? `$${(lastPoint.value / 100).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} USD`
                                : lastPoint.value}{' '}
                              au {lastPoint.label}
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
          </>
        )}

        {activeTab === 'earnings' && (
          <section className="mt-2 space-y-4">
            {/* Stripe Connect CTA if not connected */}
            {stripeConnectStatus !== 'complete' && (
              <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-yellow-400 mb-1">
                      {stripeConnectStatus === 'restricted'
                        ? 'Your Stripe account is restricted'
                        : 'Connect Stripe to receive payouts'}
                    </p>
                    <p className="text-xs text-yellow-400/70">
                      {stripeConnectStatus === 'restricted'
                        ? 'Your Stripe account was rejected or limited by Stripe. Please review your details on Stripe and try again.'
                        : 'You need to connect your Stripe account to withdraw your earnings. It only takes a few minutes.'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleStripeConnect}
                    disabled={isConnectingStripe}
                    className="rounded-full border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 whitespace-nowrap"
                  >
                    {isConnectingStripe ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
                        Connecting…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <ExternalLink className="w-4 h-4" />
                        {stripeConnectStatus === 'restricted' ? 'Review Stripe setup' : 'Connect Stripe'}
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70 mb-1">Wallet</p>
                <p className="text-sm text-exclu-space/80 mb-2">Amount earned and not yet paid out.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-exclu-space/80">Current balance</p>
                <p className="text-3xl sm:text-4xl font-extrabold text-exclu-cloud">
                  {isLoading
                    ? '—'
                    : `$${(walletBalanceCents / 100).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} USD`}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70">Payouts</p>
                {payouts.length > 0 && (
                  <p className="text-[11px] text-exclu-space/70">{payouts.length} payout{payouts.length > 1 ? 's' : ''}</p>
                )}
              </div>

              {isLoading && <p className="text-sm text-exclu-space/80">Loading earnings…</p>}

              {!isLoading && payouts.length === 0 && (
                <p className="text-sm text-exclu-space/80">
                  No payouts have been recorded yet. Once payouts are processed, they will appear here with their
                  status.
                </p>
              )}

              {!isLoading && payouts.length > 0 && (
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                  <table className="min-w-full text-sm">
                    <thead className="text-xs uppercase text-exclu-space/70 border-b border-exclu-arsenic/60">
                      <tr>
                        <th className="px-2 sm:px-3 py-2 text-left">Date</th>
                        <th className="px-2 sm:px-3 py-2 text-left">Amount</th>
                        <th className="px-2 sm:px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((payout: any) => (
                        <tr key={payout.id} className="border-t border-exclu-arsenic/40">
                          <td className="px-2 sm:px-3 py-2 text-exclu-space/80">
                            {new Date(payout.paid_at || payout.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-2 sm:px-3 py-2 text-right text-exclu-space">
                            ${(payout.amount_cents / 100).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            USD
                          </td>
                          <td className="px-2 sm:px-3 py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${payout.status === 'paid'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/40'
                                : payout.status === 'pending' || payout.status === 'processing'
                                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/40'
                                  : payout.status === 'failed'
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/40'
                                    : 'bg-exclu-arsenic/40 text-exclu-cloud border border-exclu-arsenic/60'
                                }`}
                            >
                              {payout.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* $100 Referral bonus — visible only if this creator was recruited by someone */}
            {myReferralBonus && (
              <div className={`rounded-2xl border p-5 sm:p-6 ${
                myReferralBonus.unlocked
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : myReferralBonus.eligible
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-exclu-arsenic/60 bg-exclu-ink/80'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70 mb-1">$100 welcome bonus</p>
                    {myReferralBonus.unlocked ? (
                      <>
                        <p className="text-2xl font-bold text-emerald-400">+$100.00 unlocked</p>
                        <p className="text-[11px] text-exclu-space/70 mt-1">You reached $1k in revenue within 90 days. Bonus credited to your affiliate earnings.</p>
                      </>
                    ) : myReferralBonus.eligible ? (
                      <>
                        <p className="text-sm font-semibold text-amber-300">Pending — {myReferralBonus.daysLeft} day{myReferralBonus.daysLeft !== 1 ? 's' : ''} left</p>
                        <p className="text-[11px] text-exclu-space/70 mt-1">Reach $1,000 in net revenue before the deadline to unlock your $100 bonus.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-exclu-space/60">Expired</p>
                        <p className="text-[11px] text-exclu-space/50 mt-1">The 90-day window has passed. Keep growing — more rewards coming soon.</p>
                      </>
                    )}
                  </div>
                  <div className={`text-right shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border ${
                    myReferralBonus.unlocked
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40'
                      : myReferralBonus.eligible
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/40'
                        : 'bg-exclu-arsenic/20 text-exclu-space/50 border-exclu-arsenic/40'
                  }`}>
                    {myReferralBonus.unlocked ? 'Credited' : myReferralBonus.eligible ? 'In progress' : 'Expired'}
                  </div>
                </div>
              </div>
            )}

          </section>
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
                  Authorization: '',
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
              // Use x-supabase-auth header — same pattern as stripe-connect-onboard
              // to avoid Supabase gateway JWT validation conflict
              const { error } = await supabase.functions.invoke('send-referral-invite', {
                body: { to_email: inviteEmail },
                headers: {
                  Authorization: '',
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

      </main>
    </AppShell>
  );
};

export default AppDashboard;
