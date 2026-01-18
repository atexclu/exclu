import AppShell from '@/components/AppShell';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Link as RouterLink } from 'react-router-dom';
import { Copy, ExternalLink, Plus } from 'lucide-react';

const AppDashboard = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalLinks, setTotalLinks] = useState(0);
  const [publishedLinksCount, setPublishedLinksCount] = useState(0);
  const [totalSalesCount, setTotalSalesCount] = useState(0);
  const [totalRevenueCents, setTotalRevenueCents] = useState(0);
  const [linksRaw, setLinksRaw] = useState<any[]>([]);
  const [purchasesRaw, setPurchasesRaw] = useState<any[]>([]);
  const [activeMetric, setActiveMetric] = useState<'published' | 'sales' | 'revenue'>('published');
  const [activeRange, setActiveRange] = useState<'7d' | '30d' | '365d'>('30d');
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number } | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [profileHandle, setProfileHandle] = useState<string | null>(null);
  const [profileLinks, setProfileLinks] = useState<{ platform: string; url: string }[]>([]);
  const [bioDraft, setBioDraft] = useState('');
  const [isSavingBio, setIsSavingBio] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

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
        // Profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, bio, handle')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error loading creator profile', profileError);
        }

        // External platform links
        const { data: profileLinksData, error: profileLinksError } = await supabase
          .from('profile_links')
          .select('platform, url')
          .eq('profile_id', user.id);

        if (profileLinksError) {
          console.error('Error loading profile_links in dashboard', profileLinksError);
        } else if (profileLinksData && Array.isArray(profileLinksData)) {
          setProfileLinks(
            (profileLinksData as any[]).map((row) => ({
              platform: row.platform as string,
              url: row.url as string,
            }))
          );
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

        if (!isMounted) return;

        setTotalLinks(linksCount);
        setPublishedLinksCount(publishedCount);
        setTotalSalesCount(salesCount);
        setTotalRevenueCents(revenueSum);
        setLinksRaw(safeLinks);
        setPurchasesRaw(safePurchases);
        if (profile) {
          setProfileName(profile.display_name || 'Creator');
          setProfileAvatarUrl(profile.avatar_url || null);
          setProfileHandle(profile.handle || null);
          setBioDraft(profile.bio || '');
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

  const publicProfileUrl = profileHandle ? `${window.location.origin}/c/${profileHandle}` : '';

  const handlePlatformClick = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getPlatformMeta = (platform: string) => {
    switch (platform as any) {
      case 'onlyfans':
        return {
          label: 'OnlyFans',
          short: 'OF',
          bg: 'bg-[#00AFF0]/15',
          text: 'text-[#00AFF0]',
        };
      case 'fansly':
        return {
          label: 'Fansly',
          short: 'F',
          bg: 'bg-[#1DA1F2]/15',
          text: 'text-[#1DA1F2]',
        };
      case 'myclub':
        return {
          label: 'my.club',
          short: 'MC',
          bg: 'bg-[#6366F1]/15',
          text: 'text-[#6366F1]',
        };
      case 'mym':
        return {
          label: 'MYM',
          short: 'MYM',
          bg: 'bg-[#F97316]/15',
          text: 'text-[#F97316]',
        };
      case 'other':
      default:
        return {
          label: 'Website',
          short: 'WEB',
          bg: 'bg-exclu-cloud/10',
          text: 'text-exclu-cloud',
        };
    }
  };

  const handleSaveBio = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSavingBio(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('You must be logged in to update your profile.');
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ bio: bioDraft.trim() || null })
        .eq('id', user.id);

      if (updateError) {
        console.error(updateError);
        throw new Error('Unable to save your bio. Please try again.');
      }
    } catch (err) {
      console.error('Error updating bio', err);
      // we reuse the generic error banner if needed; no toast here to keep it simple
    } finally {
      setIsSavingBio(false);
    }
  };

  const handleAvatarClick = () => {
    if (!profileAvatarUrl && avatarInputRef.current) {
      avatarInputRef.current.click();
    }
  };

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('You must be logged in to update your profile picture.');
      }

      const ext = file.name.split('.').pop() || 'jpg';
      const objectName = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(objectName, file, {
          upsert: true,
        });

      if (uploadError) {
        console.error(uploadError);
        throw new Error('Upload failed. Please try again.');
      }

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(objectName);
      const avatarUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id);

      if (updateError) {
        console.error(updateError);
        throw new Error('Profile picture was uploaded but could not be saved.');
      }

      setProfileAvatarUrl(avatarUrl);
    } catch (err) {
      console.error('Error updating avatar', err);
    } finally {
      event.target.value = '';
    }
  };

  const handleCopyProfileUrl = async () => {
    if (!publicProfileUrl) return;
    try {
      await navigator.clipboard.writeText(publicProfileUrl);
    } catch {
      // Fallback: no-op; the user can still long-press/copy from the input if we add one later
    }
  };

  return (
    <AppShell>
      <main className="px-4 pb-16 max-w-6xl mx-auto">
        <section className="mt-4 sm:mt-6 mb-8">
          <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 p-4 sm:p-6 space-y-4">
            {/* Top row: avatar + name on the left, public URL and platforms on the right */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="flex-shrink-0" onClick={handleAvatarClick}>
                  <div
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border border-exclu-arsenic/70 bg-exclu-ink flex items-center justify-center text-xs sm:text-sm text-exclu-cloud/80 ${
                      !profileAvatarUrl ? 'cursor-pointer' : ''
                    }`}
                  >
                    {profileAvatarUrl ? (
                      <img src={profileAvatarUrl} alt={profileName} className="w-full h-full object-cover" />
                    ) : (
                      <Plus className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-exclu-cloud truncate">
                    {profileName || 'Creator'}
                  </h1>
                  {profileHandle && (
                    <p className="text-xs text-exclu-space/70 mt-0.5 truncate">@{profileHandle}</p>
                  )}
                </div>
              </div>

              {/* Public profile URL field + external platforms */}
              <div className="w-full sm:w-80 flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] text-exclu-space/80">Public profile link</p>
                  <div className="flex items-center gap-2 rounded-full bg-black/80 border border-exclu-arsenic/70 px-3 py-1.5">
                    <input
                      type="text"
                      readOnly
                      value={publicProfileUrl || ''}
                      placeholder="Set a handle to get your public URL"
                      className="flex-1 bg-transparent border-0 outline-none text-[11px] text-exclu-cloud placeholder:text-exclu-space/60 truncate"
                    />
                    <button
                      type="button"
                      onClick={handleCopyProfileUrl}
                      disabled={!publicProfileUrl}
                      className="disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
                      aria-label="Copy public profile URL"
                    >
                      <Copy className="w-3.5 h-3.5 text-primary" />
                    </button>
                    <a
                      href={publicProfileUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="View public profile"
                      className={`inline-flex items-center justify-center ${
                        publicProfileUrl ? 'opacity-100' : 'opacity-40 pointer-events-none'
                      }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-primary" />
                    </a>
                  </div>
                </div>

                {profileLinks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
                    {profileLinks.map((link) => {
                      const meta = getPlatformMeta(link.platform);
                      return (
                        <button
                          key={`${link.platform}-${link.url}`}
                          type="button"
                          onClick={() => handlePlatformClick(link.url)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-exclu-arsenic/60 bg-black/70 px-2 py-0.5 text-[10px] text-exclu-cloud hover:border-primary/70 hover:bg-black/90 transition-colors"
                        >
                          <span
                            className={`inline-flex items-center justify-center w-4.5 h-4.5 rounded-full text-[8px] font-semibold ${meta.bg} ${meta.text}`}
                          >
                            {meta.short}
                          </span>
                          <span className="truncate max-w-[70px] sm:max-w-[100px]">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Bio section full width */}
            <form onSubmit={handleSaveBio} className="space-y-1">
              <p className="text-[11px] text-exclu-space/80">Bio / description</p>
              <textarea
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-exclu-arsenic/50 bg-transparent text-exclu-cloud text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary/60 placeholder:text-exclu-space/60 resize-none"
                placeholder="Présente-toi à tes fans, parle de ton contenu exclusif, de ton style, de ce qu'ils vont débloquer…"
              />
              <div className="flex items-center justify-end">
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="rounded-full border-exclu-arsenic/60 text-[11px] px-4 py-1 h-7"
                  disabled={isSavingBio}
                >
                  {isSavingBio ? 'Saving…' : 'Save bio'}
                </Button>
              </div>
            </form>
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-400 mb-4 max-w-xl">{error}</p>
        )}

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
            <p className="text-[11px] text-exclu-space/80 mt-1">Total revenue from successful purchases (mock until payments are fully wired).</p>
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
                          <stop offset="0%" stopColor="rgba(56,189,248,0.6)" />
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

      </main>
    </AppShell>
  );
};

export default AppDashboard;
