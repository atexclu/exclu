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
  Tag,
  X,
  Loader2,
  Sparkles,
  Users,
} from 'lucide-react';
import { AgencyCategoryConfig, EMPTY_AGENCY_CATEGORIES, type AgencyCategoryData } from '@/components/ui/AgencyCategoryConfig';

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
  const [showCategories, setShowCategories] = useState(false);
  const [agencyCats, setAgencyCats] = useState<AgencyCategoryData>(EMPTY_AGENCY_CATEGORIES);
  const [isSavingCategories, setIsSavingCategories] = useState(false);

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
      const rate = premium ? 0 : 0.15;

      // Fetch RPC stats
      const { data, error } = await supabase.rpc('get_user_profiles', {
        p_user_id: user.id,
      });

      if (error) {
        console.error('Error fetching agency stats:', error);
        setIsLoading(false);
        return;
      }

      // Revenue from RPC is raw amount_cents — we need to strip 15% fan fee + platform commission
      const stats: ProfileStats[] = (data ?? []).map((row: any) => {
        const rawRevenue = Number(row.total_revenue_cents ?? 0);
        const netRevenue = Math.round(rawRevenue / 1.15 * (1 - rate));
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

      // Fetch agency categories from profiles
      const { data: profileCats } = await supabase
        .from('profiles')
        .select('agency_pricing, agency_target_market, agency_services_offered, agency_platform_focus, agency_growth_strategy, model_categories')
        .eq('id', user.id)
        .maybeSingle();
      if (profileCats) {
        setAgencyCats({
          pricing: profileCats.agency_pricing || '',
          targetMarket: profileCats.agency_target_market || [],
          services: profileCats.agency_services_offered || [],
          platform: profileCats.agency_platform_focus || [],
          growthStrategy: profileCats.agency_growth_strategy || [],
          modelTypes: profileCats.model_categories || [],
        });
      }
    };

    if (profiles.length > 0) {
      fetchStats();
    } else {
      setIsLoading(false);
    }
  }, [profiles]);

  const handleSaveCategories = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setIsSavingCategories(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        agency_pricing: agencyCats.pricing || null,
        agency_target_market: agencyCats.targetMarket,
        agency_services_offered: agencyCats.services,
        agency_platform_focus: agencyCats.platform,
        agency_growth_strategy: agencyCats.growthStrategy,
        model_categories: agencyCats.modelTypes,
      })
      .eq('id', user.id);
    setIsSavingCategories(false);
    if (!error) setShowCategories(false);
  };

  const commissionRate = isPremium ? 0 : 0.15;

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
        const value = metric === 'sales' ? 1 : Math.round((purchase.amount_cents ?? 0) / 1.15 * (1 - commissionRate));
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
      <main className="px-4 lg:px-6 pb-16 w-full max-w-6xl mx-auto">
        {/* Header — title + quick actions (harmonized with Earnings) */}
        <section className="mt-4 sm:mt-6 mb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/55 dark:text-white/55 mb-1 font-semibold">
                Agency
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground dark:text-white truncate tracking-tight">
                Agency Panel
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCategories(!showCategories)}
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground/70 dark:text-white/70 hover:text-foreground dark:hover:text-white hover:border-foreground/20 dark:hover:border-white/20 transition-colors"
              >
                <Tag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Categories</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/app/profiles/new')}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#CFFF16] px-3.5 py-1.5 text-xs font-bold text-black hover:bg-[#bef200] shadow-[0_6px_20px_-6px_rgba(207,255,22,0.5)] transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New profile</span>
              </button>
            </div>
          </div>

          {/* Agency Categories Panel */}
          {showCategories && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-foreground dark:text-white">Agency categories</p>
                  <p className="text-[11px] text-foreground/55 dark:text-white/55">How your agency appears in the directory</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveCategories}
                    disabled={isSavingCategories}
                    className="rounded-full text-xs h-8 px-4 bg-[#CFFF16] text-black hover:bg-[#bef200]"
                  >
                    {isSavingCategories ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : null}
                    {isSavingCategories ? 'Saving…' : 'Save'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setShowCategories(false)}
                    className="p-1.5 rounded-full hover:bg-foreground/5 dark:hover:bg-white/10 transition-colors text-foreground/60 dark:text-white/60"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <AgencyCategoryConfig value={agencyCats} onChange={setAgencyCats} />
            </motion.div>
          )}
        </section>

        {/* ───────────── Agency Hero (mirrors Earnings hero) ───────────── */}
        <section className="mb-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-3xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-6 sm:p-8 lg:p-10 shadow-[0_24px_80px_-40px_rgba(207,255,22,0.22)] dark:shadow-[0_30px_100px_-50px_rgba(207,255,22,0.4)]"
          >
            <div aria-hidden className="pointer-events-none absolute -top-32 -right-20 w-[460px] h-[460px] rounded-full bg-[radial-gradient(circle,rgba(207,255,22,0.28),transparent_60%)] blur-3xl opacity-80 dark:opacity-95" />
            <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 w-[380px] h-[380px] rounded-full bg-[radial-gradient(circle,rgba(207,255,22,0.12),transparent_60%)] blur-3xl opacity-40 dark:opacity-60" />
            <div aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block opacity-[0.04] mix-blend-overlay bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.7%22/></svg>')]" />

            <div className="relative lg:grid lg:grid-cols-[1fr,auto] lg:gap-10 lg:items-start">
              {/* ── LEFT (desktop) / TOP (mobile) — label + revenue + stats ── */}
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-semibold text-foreground/60 dark:text-white/60">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inset-0 rounded-full bg-[#CFFF16] animate-ping opacity-50" />
                    <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[#CFFF16] shadow-[0_0_10px_rgba(207,255,22,0.9)]" />
                  </span>
                  Portfolio revenue
                </div>

                <div className="mt-3 flex items-end gap-2.5">
                  <span className="text-[3.25rem] leading-[0.9] sm:text-7xl lg:text-[5.25rem] font-black tracking-[-0.045em] text-foreground dark:text-white tabular-nums">
                    {formattedTotalRevenue}
                  </span>
                  <span className="text-[11px] font-bold text-foreground/40 dark:text-white/40 mb-2 sm:mb-3 tracking-[0.2em]">USD</span>
                </div>

                <div className="mt-8 h-px bg-gradient-to-r from-transparent via-foreground/10 dark:via-white/12 to-transparent" />
                <div className="mt-5 grid grid-cols-3">
                  {[
                    { label: 'Profiles', value: profiles.length.toLocaleString('en-US') },
                    { label: 'Total sales', value: totals.sales.toLocaleString('en-US') },
                    { label: 'Profile visits', value: totals.views.toLocaleString('en-US') },
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
              </div>

              {/* ── RIGHT (desktop, top-aligned) / BOTTOM (mobile, centered) — pills + CTA ── */}
              <div className="mt-7 lg:mt-0 flex flex-col items-center lg:items-end gap-3 lg:gap-4">
                <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-white/5 px-2.5 py-1 text-[10px] text-foreground/70 dark:text-white/70">
                    <Users className="w-3 h-3 text-[#CFFF16]" />
                    <span>{profiles.length} creator{profiles.length !== 1 ? 's' : ''} managed</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-white/5 px-2.5 py-1 text-[10px] text-foreground/70 dark:text-white/70">
                    <Sparkles className="w-3 h-3 text-[#CFFF16]" />
                    {isPremium
                      ? <>Premium · <span className="text-[#4a6304] dark:text-[#CFFF16] font-semibold">0% commission</span></>
                      : <>Free · {Math.round(commissionRate * 100)}% commission</>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/app/profiles/new')}
                  className="group relative w-full lg:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-[#CFFF16] px-6 py-3.5 text-sm font-bold text-black shadow-[0_10px_32px_-8px_rgba(207,255,22,0.5)] hover:shadow-[0_14px_40px_-8px_rgba(207,255,22,0.75)] hover:-translate-y-0.5 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add a new profile
                </button>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Metric cards — drill-down selector for chart */}
        <section className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
          {[
            { key: 'profile_views' as const, label: 'Profile visits', value: totals.views.toLocaleString('en-US'), hint: 'Combined views' },
            { key: 'sales' as const, label: 'Sales', value: totals.sales.toLocaleString('en-US'), hint: 'Purchases across profiles' },
            { key: 'revenue' as const, label: 'Revenue', value: `${formattedTotalRevenue}`, hint: 'Net after fees' },
          ].map((m) => {
            const active = activeMetric === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => { setActiveMetric(m.key); setHoveredPoint(null); }}
                className={`text-left rounded-2xl border p-4 sm:p-5 transition-all ${
                  active
                    ? 'border-[#CFFF16]/50 bg-[#CFFF16]/8 dark:bg-[#CFFF16]/5 shadow-[0_12px_32px_-16px_rgba(207,255,22,0.35)]'
                    : 'border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] hover:border-foreground/20 dark:hover:border-white/20'
                }`}
              >
                <p className={`text-[10px] uppercase tracking-wider font-semibold ${active ? 'text-[#4a6304] dark:text-[#CFFF16]' : 'text-foreground/50 dark:text-white/50'}`}>
                  {m.label}
                </p>
                <p className="text-xl sm:text-2xl font-bold text-foreground dark:text-white mt-1 tabular-nums">{m.value}</p>
                <p className="text-[11px] text-foreground/50 dark:text-white/50 mt-1">{m.hint}</p>
              </button>
            );
          })}
        </section>

        {/* Analytics chart */}
        <section className="mt-4">
          <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/55 dark:text-white/55 font-semibold mb-1">Growth over time</p>
                <p className="text-sm text-foreground/80 dark:text-white/80">
                  {activeMetric === 'profile_views'
                    ? 'Profile views'
                    : activeMetric === 'sales'
                      ? 'Total sales'
                      : 'Revenue'}{' '}
                  over the last {activeRange === '7d' ? '7 days' : activeRange === '30d' ? '30 days' : '12 months'}.
                </p>
              </div>
              <div className="inline-flex rounded-full border border-black/5 dark:border-white/10 bg-foreground/5 dark:bg-white/5 p-0.5 text-[11px] text-foreground/70 dark:text-white/70">
                {([{ key: '7d' as const, label: '7D' }, { key: '30d' as const, label: '30D' }, { key: '365d' as const, label: '1Y' }]).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => { setActiveRange(item.key); setHoveredPoint(null); }}
                    className={`px-3 py-1 rounded-full transition-colors ${activeRange === item.key
                      ? 'bg-[#CFFF16] text-black shadow-sm font-semibold'
                      : 'hover:text-foreground dark:hover:text-white'
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
                          className="drop-shadow-[0_0_10px_rgba(207,255,22,0.7)] transition-all duration-500"
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
                      <div className="mt-2 flex justify-between text-[10px] text-foreground/55 dark:text-white/55">
                        {series.map((point, index) => (
                          <span key={index} className="min-w-0 truncate">
                            {index === 0 || index === series.length - 1 || series.length <= 7 ? point.label : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {tooltipPoint && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-foreground/70 dark:text-white/70">
                      <span>
                        {activeMetric === 'profile_views' ? 'Views on' : 'Total'}{' '}
                        {activeMetric === 'revenue'
                          ? `${formatRevenue(lastPoint.value)} USD`
                          : lastPoint.value}{' '}
                        on {lastPoint.label}
                      </span>
                      {hoveredPoint && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#CFFF16]/40 bg-[#CFFF16]/10 px-2.5 py-1 text-[10px] text-[#4a6304] dark:text-[#CFFF16] font-semibold">
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

        {/* Profiles list */}
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-foreground/55 dark:text-white/55">Managed profiles</p>
            <span className="text-[11px] text-foreground/55 dark:text-white/55">{profileStats.length} profile{profileStats.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="space-y-3">
            {profileStats.map((profile, i) => (
              <motion.div
                key={profile.id}
                custom={i + 4}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-4 sm:p-5 hover:border-[#CFFF16]/40 dark:hover:border-[#CFFF16]/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.display_name || ''}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border border-black/10 dark:border-white/10"
                      />
                    ) : (
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#CFFF16]/20 to-[#CFFF16]/5 border border-[#CFFF16]/30 flex items-center justify-center text-lg font-semibold text-[#4a6304] dark:text-[#CFFF16]">
                        {(profile.display_name || profile.username || '?')[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground dark:text-white truncate">
                        {profile.display_name || profile.username || 'Unnamed'}
                      </p>
                      {profile.username && (
                        <span className="text-xs text-foreground/55 dark:text-white/55">@{profile.username}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-foreground/60 dark:text-white/60">
                      <span className="flex items-center gap-1 tabular-nums">
                        <DollarSign className="w-3 h-3" />
                        {formatRevenueShort(profile.total_revenue_cents)}
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <ShoppingBag className="w-3 h-3" />
                        {profile.total_sales} sales
                      </span>
                      <span className="hidden sm:flex items-center gap-1 tabular-nums">
                        <Eye className="w-3 h-3" />
                        {profile.profile_view_count.toLocaleString()} views
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditProfile(profile.id)}
                      className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-foreground/10 dark:border-white/10 bg-foreground/5 dark:bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground/70 dark:text-white/70 hover:text-foreground dark:hover:text-white hover:border-foreground/20 dark:hover:border-white/20 transition-colors"
                    >
                      <Palette className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleManageProfile(profile.id)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#CFFF16] px-3.5 py-1.5 text-xs font-bold text-black hover:bg-[#bef200] shadow-[0_6px_20px_-6px_rgba(207,255,22,0.45)] transition-all"
                    >
                      Manage
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    {profile.username && (
                      <a
                        href={`/${profile.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full border border-foreground/10 dark:border-white/10 hover:bg-foreground/5 dark:hover:bg-white/10 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-foreground/60 dark:text-white/60" />
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
              className="w-full rounded-2xl border-2 border-dashed border-foreground/15 dark:border-white/15 p-6 flex flex-col items-center justify-center gap-2 hover:border-[#CFFF16]/60 hover:bg-[#CFFF16]/5 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full border border-dashed border-foreground/20 dark:border-white/20 flex items-center justify-center">
                <Plus className="w-5 h-5 text-foreground/60 dark:text-white/60" />
              </div>
              <p className="text-sm text-foreground/70 dark:text-white/70 font-medium">Add a new profile</p>
            </motion.button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
