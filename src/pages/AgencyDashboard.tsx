import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useProfiles } from '@/contexts/ProfileContext';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import {
  Eye,
  DollarSign,
  ShoppingBag,
  Plus,
  ExternalLink,
  Palette,
  ArrowRight,
} from 'lucide-react';

interface ProfileStats {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_view_count: number;
  total_links: number;
  total_sales: number;
  total_revenue_cents: number;
}

export default function AgencyDashboard() {
  const { profiles, setActiveProfileId } = useProfiles();
  const navigate = useNavigate();
  const [profileStats, setProfileStats] = useState<ProfileStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [purchasesRaw, setPurchasesRaw] = useState<any[]>([]);
  const [profileViewsRaw, setProfileViewsRaw] = useState<{ date: string; views: number }[]>([]);
  const [activeMetric, setActiveMetric] = useState<'profile_views' | 'sales' | 'revenue'>('revenue');
  const [activeRange, setActiveRange] = useState<'7d' | '30d' | '365d'>('30d');
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number } | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch premium status
      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_creator_subscribed')
        .eq('id', user.id)
        .single();
      const premium = profileData?.is_creator_subscribed === true;
      setIsPremium(premium);
      const rate = premium ? 0 : 0.10;

      // Fetch RPC stats
      const { data, error } = await supabase.rpc('get_user_profiles', {
        p_user_id: user.id,
      });

      if (error) {
        console.error('Error fetching agency stats:', error);
        setIsLoading(false);
        return;
      }

      // Revenue from RPC is raw amount_cents — we need to strip 5% fan fee + platform commission
      const stats: ProfileStats[] = (data ?? []).map((row: any) => {
        const rawRevenue = Number(row.total_revenue_cents ?? 0);
        const netRevenue = Math.round(rawRevenue / 1.05 * (1 - rate));
        return {
          id: row.profile_id,
          username: row.username,
          display_name: row.display_name,
          avatar_url: null,
          profile_view_count: Number(row.profile_views ?? 0),
          total_links: Number(row.total_links ?? 0),
          total_sales: Number(row.total_sales ?? 0),
          total_revenue_cents: netRevenue,
        };
      });

      const enriched = stats.map((s) => {
        const ctxProfile = profiles.find((p) => p.id === s.id);
        return { ...s, avatar_url: ctxProfile?.avatar_url ?? null };
      });

      setProfileStats(enriched);

      // Fetch all purchases across all profiles for the chart
      const allProfileIds = (data ?? []).map((r: any) => r.profile_id);
      if (allProfileIds.length > 0) {
        const { data: allLinks } = await supabase
          .from('links')
          .select('id')
          .in('profile_id', allProfileIds);
        const linkIds = (allLinks ?? []).map((l: any) => l.id);

        if (linkIds.length > 0) {
          const { data: purchases } = await supabase
            .from('purchases')
            .select('id, link_id, amount_cents, created_at')
            .in('link_id', linkIds)
            .eq('status', 'succeeded');
          setPurchasesRaw(purchases ?? []);
        }
      }

      // Fetch profile views across all profiles
      const { data: analyticsData } = await supabase
        .from('profile_analytics')
        .select('date, profile_views')
        .eq('profile_id', user.id)
        .order('date', { ascending: true });
      setProfileViewsRaw(
        (analyticsData ?? []).map((r: any) => ({ date: r.date, views: r.profile_views ?? 0 }))
      );

      setIsLoading(false);
    };

    if (profiles.length > 0) {
      fetchStats();
    } else {
      setIsLoading(false);
    }
  }, [profiles]);

  const commissionRate = isPremium ? 0 : 0.10;

  const totals = profileStats.reduce(
    (acc, p) => ({
      views: acc.views + p.profile_view_count,
      sales: acc.sales + p.total_sales,
      revenue: acc.revenue + p.total_revenue_cents,
      links: acc.links + p.total_links,
    }),
    { views: 0, sales: 0, revenue: 0, links: 0 }
  );

  const handleManageProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    navigate('/app');
  };

  const handleEditProfile = (profileId: string) => {
    setActiveProfileId(profileId);
    navigate('/app/profile');
  };

  const formatRevenue = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatRevenueShort = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const cardVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.06, type: 'spring' as const, stiffness: 300, damping: 30 },
    }),
  };

  const buildSeries = (
    metric: 'profile_views' | 'sales' | 'revenue',
    range: '7d' | '30d' | '365d'
  ): { label: string; value: number; dateKey: string }[] => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 365;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const points: { label: string; value: number; dateKey: string }[] = [];

    if (metric === 'profile_views') {
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

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  const formattedTotalRevenue = formatRevenue(totals.revenue);

  return (
    <AppShell>
      <main className="px-4 pb-16 max-w-6xl mx-auto">
        {/* Header */}
        <section className="mt-4 sm:mt-6 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-extrabold text-exclu-cloud">Agency Panel</h1>
              <p className="text-sm text-exclu-space/70">
                {profiles.length} profile{profiles.length !== 1 ? 's' : ''} managed
              </p>
            </div>
            <Button
              onClick={() => navigate('/app/profiles/new')}
              className="gap-2 rounded-xl"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Profile</span>
            </Button>
          </div>
        </section>

        {/* Metric cards — identical style to AppDashboard */}
        <section className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div
            className={`rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 cursor-pointer transition-colors ${activeMetric === 'profile_views' ? 'ring-1 ring-primary/70 border-primary/70' : ''}`}
            onClick={() => { setActiveMetric('profile_views'); setHoveredPoint(null); }}
          >
            <p className="text-xs text-exclu-space mb-1">Total profile visits</p>
            <p className="text-2xl font-bold text-exclu-cloud">
              {totals.views.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] text-exclu-space/80 mt-1">Combined views across all profiles.</p>
          </div>

          <div
            className={`rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 cursor-pointer transition-colors ${activeMetric === 'sales' ? 'ring-1 ring-primary/70 border-primary/70' : ''}`}
            onClick={() => { setActiveMetric('sales'); setHoveredPoint(null); }}
          >
            <p className="text-xs text-exclu-space mb-1">Total sales</p>
            <p className="text-2xl font-bold text-exclu-cloud">{totals.sales.toLocaleString()}</p>
            <p className="text-[11px] text-exclu-space/80 mt-1">Purchases across all profiles.</p>
          </div>

          <div
            className={`rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 cursor-pointer transition-colors ${activeMetric === 'revenue' ? 'ring-1 ring-primary/70 border-primary/70' : ''}`}
            onClick={() => { setActiveMetric('revenue'); setHoveredPoint(null); }}
          >
            <p className="text-xs text-exclu-space mb-1">Total revenue</p>
            <p className="text-2xl font-bold text-exclu-cloud">{formattedTotalRevenue} USD</p>
            <p className="text-[11px] text-exclu-space/80 mt-1">Net revenue after fees.</p>
          </div>
        </section>

        {/* Analytics chart — identical to AppDashboard */}
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
                {([{ key: '7d' as const, label: '7D' }, { key: '30d' as const, label: '30D' }, { key: '365d' as const, label: '1Y' }]).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => { setActiveRange(item.key); setHoveredPoint(null); }}
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

            {(() => {
              const series = buildSeries(activeMetric, activeRange);
              const maxValue = series.reduce((max, p) => (p.value > max ? p.value : max), 0);

              if (series.length === 0) {
                return (
                  <p className="text-sm text-exclu-space/80">
                    {activeMetric === 'profile_views'
                      ? 'No profile view data yet for this period.'
                      : 'Not enough data yet to display a chart.'}
                  </p>
                );
              }

              const height = 160;
              const width = 600;
              const paddingX = 4;
              const paddingY = 10;
              const innerWidth = width - paddingX * 2;
              const innerHeight = height - paddingY * 2;
              const yLevels = [0, 0.25, 0.5, 0.75, 1];

              const computedPoints = series.map((point, index) => {
                const x = series.length === 1
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
                  <div className="flex items-stretch gap-0">
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
                    <div className="flex-1 min-w-0">
                      <svg
                        viewBox={`0 0 ${width} ${height}`}
                        className="w-full h-40 sm:h-48 text-primary/80 transition-all duration-500"
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient id="agency-metric-gradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgba(163,230,53,0.6)" />
                            <stop offset="100%" stopColor="rgba(15,23,42,0)" />
                          </linearGradient>
                        </defs>
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
                        <polyline
                          fill="url(#agency-metric-gradient)"
                          stroke="none"
                          points={`${paddingX + innerWidth},${height - paddingY} ${pointsAttr} ${paddingX},${height - paddingY}`}
                          className="opacity-80 transition-all duration-500"
                        />
                        <polyline
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          points={pointsAttr}
                          className="drop-shadow-[0_0_10px_rgba(56,189,248,0.7)] transition-all duration-500"
                        />
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
                      <div className="mt-2 flex justify-between text-[10px] text-exclu-space/70">
                        {series.map((point, index) => (
                          <span key={index} className="min-w-0 truncate">
                            {index === 0 || index === series.length - 1 || series.length <= 7 ? point.label : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {tooltipPoint && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-exclu-space/80">
                      <span>
                        {activeMetric === 'profile_views' ? 'Views on' : 'Total'}{' '}
                        {activeMetric === 'revenue'
                          ? `${formatRevenue(lastPoint.value)} USD`
                          : lastPoint.value}{' '}
                        on {lastPoint.label}
                      </span>
                      {hoveredPoint && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 px-2.5 py-1 text-[10px] text-exclu-cloud">
                          {tooltipPoint.label} ·{' '}
                          {activeMetric === 'revenue'
                            ? `${formatRevenue(tooltipPoint.value)} USD`
                            : tooltipPoint.value}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </section>

        {/* Profiles List */}
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">My Profiles</h2>
            <span className="text-xs text-muted-foreground">{profileStats.length} profile{profileStats.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="space-y-3">
            {profileStats.map((profile, i) => (
              <motion.div
                key={profile.id}
                custom={i + 4}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="rounded-2xl border border-border/50 bg-card p-4 sm:p-5 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.display_name || ''}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border border-border/40"
                      />
                    ) : (
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-border/40 flex items-center justify-center text-lg font-semibold text-foreground/60">
                        {(profile.display_name || profile.username || '?')[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">
                        {profile.display_name || profile.username || 'Unnamed'}
                      </p>
                      {profile.username && (
                        <span className="text-xs text-muted-foreground">@{profile.username}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        {formatRevenueShort(profile.total_revenue_cents)}
                      </span>
                      <span className="flex items-center gap-1">
                        <ShoppingBag className="w-3 h-3" />
                        {profile.total_sales} sales
                      </span>
                      <span className="hidden sm:flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {profile.profile_view_count.toLocaleString()} views
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditProfile(profile.id)}
                      className="hidden sm:flex gap-1.5 rounded-lg text-xs"
                    >
                      <Palette className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleManageProfile(profile.id)}
                      className="gap-1.5 rounded-lg text-xs"
                    >
                      Manage
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                    {profile.username && (
                      <a
                        href={`/${profile.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden sm:flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 hover:bg-muted/50 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

            <motion.button
              custom={profileStats.length + 4}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              onClick={() => navigate('/app/profiles/new')}
              className="w-full rounded-2xl border-2 border-dashed border-border/50 p-6 flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-muted/20 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full border border-dashed border-border/60 flex items-center justify-center">
                <Plus className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">Add a new profile</p>
            </motion.button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
