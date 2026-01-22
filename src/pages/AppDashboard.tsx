import AppShell from '@/components/AppShell';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Link as RouterLink } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ExternalLink, X, CreditCard, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AppDashboard = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalLinks, setTotalLinks] = useState(0);
  const [publishedLinksCount, setPublishedLinksCount] = useState(0);
  const [totalSalesCount, setTotalSalesCount] = useState(0);
  const [totalRevenueCents, setTotalRevenueCents] = useState(0);
  const [walletBalanceCents, setWalletBalanceCents] = useState(0);
  const [linksRaw, setLinksRaw] = useState<any[]>([]);
  const [purchasesRaw, setPurchasesRaw] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'metrics' | 'earnings'>('metrics');
  const [activeMetric, setActiveMetric] = useState<'published' | 'sales' | 'revenue'>('published');
  const [activeRange, setActiveRange] = useState<'7d' | '30d' | '365d'>('30d');
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number } | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [stripeConnectStatus, setStripeConnectStatus] = useState<string | null>(null);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [showStripeModal, setShowStripeModal] = useState(false);

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
        // Profile (display_name for greeting + stripe_connect_status)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('display_name, stripe_connect_status')
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

        // Purchases metrics (RLS limite déjà aux achats du créateur)
        const { data: purchases, error: purchasesError } = await supabase
          .from('purchases')
          .select('id, amount_cents, created_at');

        if (purchasesError) throw purchasesError;

        const safePurchases = purchases ?? [];
        const salesCount = safePurchases.length;
        const revenueSum = safePurchases.reduce((sum, p: any) => sum + (p.amount_cents ?? 0), 0);

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
        const walletBalance = revenueSum - totalPayoutsCents;

        if (!isMounted) return;

        setTotalLinks(linksCount);
        setPublishedLinksCount(publishedCount);
        setTotalSalesCount(salesCount);
        setTotalRevenueCents(revenueSum);
        setWalletBalanceCents(walletBalance);
        setLinksRaw(safeLinks);
        setPurchasesRaw(safePurchases);
        setPayouts(safePayouts);
        if (profile) {
          setProfileName(profile.display_name || 'Creator');
          setStripeConnectStatus(profile.stripe_connect_status || null);
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

    return () => {
      isMounted = false;
    };
  }, []);

  const handleStripeConnect = async () => {
    setIsConnectingStripe(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {});
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

  const buildSeries = (
    metric: 'published' | 'sales' | 'revenue',
    range: '7d' | '30d' | '365d'
  ): { label: string; value: number }[] => {
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
          const value = metric === 'sales' ? 1 : purchase.amount_cents ?? 0;
          events.push({ date: d, value });
        }
      });
    }

    if (events.length === 0) {
      return [];
    }

    // Sort events by date
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    const points: { label: string; value: number }[] = [];

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

      points.push({ label, value: cumulative });
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
                  <CreditCard className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-bold text-exclu-cloud mb-2">
                  Connect Stripe to get paid
                </h2>
                <p className="text-sm text-exclu-space/80">
                  You need to connect a Stripe account to receive payments from your fans.
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
                      Redirecting…
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud">
                Welcome back{profileName ? `, ${profileName}` : ''}
              </h1>
              <p className="text-sm text-exclu-space/70 mt-1">
                Here's an overview of your performance
              </p>
            </div>
            <RouterLink
              to="/app/profile"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 text-xs text-exclu-space hover:text-exclu-cloud hover:border-primary/50 transition-colors"
            >
              <span>Settings</span>
            </RouterLink>
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-400 mb-4 max-w-xl">{error}</p>
        )}

        {/* Metrics / Earnings toggle */}
        <section className="mt-1 mb-4">
          <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80">
            {[
              { key: 'metrics' as const, label: 'Metrics' },
              { key: 'earnings' as const, label: 'Earnings' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1 rounded-full transition-colors ${
                  activeTab === tab.key
                    ? 'bg-exclu-cloud text-black shadow-sm'
                    : 'text-exclu-space hover:text-exclu-cloud'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === 'metrics' && (
          <>
            <section className="grid gap-4 sm:gap-6 md:grid-cols-3">
              <div
                className={`rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 cursor-pointer transition-colors ${
                  activeMetric === 'published' ? 'ring-1 ring-primary/70 border-primary/70' : ''
                }`}
                onClick={() => {
                  setActiveMetric('published');
                  setHoveredPoint(null);
                }}
              >
                <p className="text-xs text-exclu-space mb-1">Published links</p>
                <p className="text-2xl font-bold text-exclu-cloud">{isLoading ? '—' : publishedLinksCount}</p>
                <p className="text-[11px] text-exclu-space/80 mt-1">
                  Links currently live for fans ({isLoading ? '—' : totalLinks} created in total).
                </p>
              </div>
              <div
                className={`rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 cursor-pointer transition-colors ${
                  activeMetric === 'sales' ? 'ring-1 ring-primary/70 border-primary/70' : ''
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
                className={`rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 cursor-pointer transition-colors ${
                  activeMetric === 'revenue' ? 'ring-1 ring-primary/70 border-primary/70' : ''
                }`}
                onClick={() => {
                  setActiveMetric('revenue');
                  setHoveredPoint(null);
                }}
              >
                <p className="text-xs text-exclu-space mb-1">Revenue</p>
                <p className="text-2xl font-bold text-exclu-cloud">{isLoading ? '—' : `${formattedRevenue} €`}</p>
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
                    className={`px-3 py-1 rounded-full transition-colors ${
                      activeRange === item.key
                        ? 'bg-exclu-cloud text-black shadow-sm'
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
                  return { x, y, label: point.label, value: point.value };
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
                            ? `${(lastPoint.value / 100).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })} €`
                            : lastPoint.value}{' '}
                          au {lastPoint.label}
                        </span>
                        {hoveredPoint && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 px-2.5 py-1 text-[10px] text-exclu-cloud">
                            {tooltipPoint.label} ·{' '}
                            {activeMetric === 'revenue'
                              ? `${(tooltipPoint.value / 100).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} €`
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
                    <p className="text-sm font-semibold text-yellow-400 mb-1">Connect Stripe to receive payouts</p>
                    <p className="text-xs text-yellow-400/70">
                      You need to connect your Stripe account to withdraw your earnings. It only takes a few minutes.
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
                        Connect Stripe
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
                    : `${(walletBalanceCents / 100).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} €`}
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
                          <td className="px-2 sm:px-3 py-2 text-exclu-cloud">
                            {(payout.amount_cents / 100).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            €
                          </td>
                          <td className="px-2 sm:px-3 py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                payout.status === 'paid'
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
          </section>
        )}

      </main>
    </AppShell>
  );
};

export default AppDashboard;
