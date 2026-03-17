/**
 * ChatterDashboard — /app/chatter
 *
 * Chat interface for chatters, modeled after CreatorChat.
 * Split-pane layout: conversation list (left) + chat window (right).
 *
 * Features:
 *  - Profile switcher when managing multiple creators
 *  - Same filter tabs as CreatorChat (All, Pending, Active, Archived)
 *  - Claim unclaimed conversations
 *  - Realtime updates via useConversations hook
 *  - Fully responsive (mobile: list/chat toggle)
 *  - All UI in English
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, Search, Loader2, MessagesSquare, ArrowLeft,
  LogOut, UserCheck, ChevronDown, Check, BarChart3, MessageCircle,
  DollarSign, Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useConversations } from '@/hooks/useConversations';
import { ConversationListItem } from '@/components/chat/ConversationListItem';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import logoWhite from '@/assets/logo-white.svg';
import logoBlack from '@/assets/logo-black.svg';
import type { Conversation } from '@/types/chat';

interface ChatterProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

type StatusFilter = 'active' | 'unclaimed' | 'archived' | 'all';
type MainView = 'chat' | 'dashboard';

interface ChatterMetrics {
  totalRevenueCents: number;
  totalConversations: number;
  activeConversations: number;
  messagesSent: number;
  revenueByDay: { date: string; cents: number }[];
}

export default function ChatterDashboard() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Creator profiles this chatter is authorized for
  const [profiles, setProfiles] = useState<ChatterProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [showProfilePicker, setShowProfilePicker] = useState(false);

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showMobileList, setShowMobileList] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainView>('chat');
  const [metrics, setMetrics] = useState<ChatterMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [activeRange, setActiveRange] = useState<'7d' | '30d' | '365d'>('30d');
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number } | null>(null);

  const statusesToFetch = useMemo<Conversation['status'][]>(() => {
    switch (statusFilter) {
      case 'active':    return ['active'];
      case 'unclaimed': return ['unclaimed'];
      case 'archived':  return ['archived'];
      default:          return ['unclaimed', 'active'];
    }
  }, [statusFilter]);

  const { conversations, isLoading: convsLoading, refetch } = useConversations({
    profileId: activeProfileId,
    statusFilter: statusesToFetch,
  });

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;

  // ── Auth + load authorized profiles ────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/');
        return;
      }
      setCurrentUserId(user.id);

      const { data: invitations } = await supabase
        .from('chatter_invitations')
        .select('profile_id')
        .eq('chatter_id', user.id)
        .eq('status', 'accepted');

      if (!invitations || invitations.length === 0) {
        setIsAuthorized(false);
        setIsLoading(false);
        return;
      }

      const profileIds = invitations.map((i: any) => i.profile_id);

      const { data: profilesData } = await supabase
        .from('creator_profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', profileIds);

      const loadedProfiles = (profilesData ?? []) as ChatterProfile[];
      setProfiles(loadedProfiles);

      if (loadedProfiles.length > 0) {
        setActiveProfileId(loadedProfiles[0].id);
      }

      setIsAuthorized(true);
      setIsLoading(false);
    };

    init();
  }, [navigate]);

  // ── Fetch chatter metrics when dashboard tab is active ─────────────────
  useEffect(() => {
    if (mainView !== 'dashboard' || !currentUserId || !activeProfileId) return;
    let cancelled = false;
    const fetchMetrics = async () => {
      setMetricsLoading(true);
      try {
        // Conversations assigned to this chatter for the active profile
        const { data: convs } = await supabase
          .from('conversations')
          .select('id, status, total_revenue_cents, created_at')
          .eq('profile_id', activeProfileId)
          .eq('assigned_chatter_id', currentUserId);

        const safeConvs = convs ?? [];
        const totalRev = safeConvs.reduce((s, c: any) => s + (c.total_revenue_cents ?? 0), 0);
        const activeCount = safeConvs.filter((c: any) => c.status === 'active').length;

        // Count messages sent by this chatter in this profile's conversations
        const convIds = safeConvs.map((c: any) => c.id);
        let msgCount = 0;
        if (convIds.length > 0) {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', currentUserId)
            .in('conversation_id', convIds);
          msgCount = count ?? 0;
        }

        // Revenue by day (from purchases via conversation links)
        // Simplified: use conversations created_at + revenue for charting
        const revByDay: Record<string, number> = {};
        safeConvs.forEach((c: any) => {
          if (c.total_revenue_cents > 0 && c.created_at) {
            const day = new Date(c.created_at).toISOString().slice(0, 10);
            revByDay[day] = (revByDay[day] ?? 0) + c.total_revenue_cents;
          }
        });

        if (!cancelled) {
          setMetrics({
            totalRevenueCents: totalRev,
            totalConversations: safeConvs.length,
            activeConversations: activeCount,
            messagesSent: msgCount,
            revenueByDay: Object.entries(revByDay).map(([date, cents]) => ({ date, cents })),
          });
        }
      } catch (err) {
        console.error('Failed to fetch chatter metrics', err);
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    };
    fetchMetrics();
    return () => { cancelled = true; };
  }, [mainView, currentUserId, activeProfileId]);

  // ── Filtered conversations ─────────────────────────────────────────────
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => {
      const name = c.fan?.display_name?.toLowerCase() ?? '';
      const preview = c.last_message_preview?.toLowerCase() ?? '';
      return name.includes(q) || preview.includes(q);
    });
  }, [conversations, searchQuery]);

  const unclaimedCount = conversations.filter((c) => c.status === 'unclaimed').length;

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setShowMobileList(false);
  };

  const handleBackToList = () => {
    setShowMobileList(true);
  };

  const handleClaim = useCallback(async (conv: Conversation) => {
    if (!currentUserId) return;
    setClaimingId(conv.id);
    try {
      const { error } = await supabase.rpc('claim_conversation', {
        p_conversation_id: conv.id,
      });
      if (error) throw error;

      toast.success('Conversation claimed!');
      await refetch();
      const claimed = { ...conv, status: 'active' as const, assigned_chatter_id: currentUserId };
      setSelectedConversation(claimed);
      setShowMobileList(false);
    } catch (err: any) {
      if (err?.message?.includes('conversation_already_claimed')) {
        toast.error('This conversation was already claimed by someone else');
        await refetch();
      } else {
        toast.error(err?.message || 'Failed to claim conversation');
      }
    } finally {
      setClaimingId(null);
    }
  }, [currentUserId, refetch]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const filterTabs: { key: StatusFilter; label: string; badge?: number }[] = [
    { key: 'all',       label: 'All' },
    { key: 'unclaimed', label: 'Pending', badge: unclaimedCount },
    { key: 'active',    label: 'Active' },
    { key: 'archived',  label: 'Archived' },
  ];

  // ── Loading ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Unauthorized ───────────────────────────────────────────────────────
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-6 p-8 text-center">
        <MessagesSquare className="w-12 h-12 text-muted-foreground/30" />
        <div>
          <h1 className="text-xl font-bold">Access denied</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            You haven't been invited to join a chatter team yet.
            Contact the creator to receive an invitation.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/')}>
          Back to home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Topbar ────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-30 border-b border-border/50 bg-card/80 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          <a href="/" className="inline-flex items-center flex-shrink-0">
            <img
              src={resolvedTheme === 'light' ? logoBlack : logoWhite}
              alt="Exclu"
              className="h-5 w-auto object-contain"
            />
          </a>

          {/* Profile switcher — center */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowProfilePicker((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-sm font-medium"
            >
              {activeProfile?.avatar_url ? (
                <img src={activeProfile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-muted-foreground/20 flex items-center justify-center text-[10px] font-bold">
                  {(activeProfile?.display_name ?? activeProfile?.username ?? '?').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate max-w-[120px] sm:max-w-[180px]">
                {activeProfile?.display_name || activeProfile?.username || 'Select profile'}
              </span>
              {profiles.length > 1 && <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>

            {/* Dropdown */}
            <AnimatePresence>
              {showProfilePicker && profiles.length > 1 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-1 left-0 w-56 bg-card border border-border rounded-xl shadow-xl z-50 py-1 overflow-hidden"
                >
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setActiveProfileId(p.id);
                        setSelectedConversation(null);
                        setShowMobileList(true);
                        setShowProfilePicker(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/60 transition-colors ${
                        p.id === activeProfileId ? 'bg-muted/40' : ''
                      }`}
                    >
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {(p.display_name ?? p.username ?? '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="truncate flex-1 text-left">{p.display_name || p.username}</span>
                      {p.id === activeProfileId && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Chat / Dashboard toggle */}
          <div className="inline-flex rounded-full border border-border/60 bg-muted/30 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setMainView('chat')}
              className={`flex items-center gap-1 px-3 py-1 rounded-full font-medium transition-all ${
                mainView === 'chat'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageCircle className="w-3 h-3" />
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMainView('dashboard')}
              className={`flex items-center gap-1 px-3 py-1 rounded-full font-medium transition-all ${
                mainView === 'dashboard'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BarChart3 className="w-3 h-3" />
              Dashboard
            </button>
          </div>

          <Button
            variant="outline"
            size="icon"
            className="rounded-full h-8 w-8 border-border/60 flex-shrink-0"
            onClick={handleSignOut}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── Dashboard view ─────────────────────────────────────────── */}
      {mainView === 'dashboard' && (
        <div className="pt-14 flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-foreground">Performance</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Stats for {activeProfile?.display_name || activeProfile?.username || 'this profile'}
              </p>
            </div>

            {metricsLoading && (
              <div className="flex justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!metricsLoading && metrics && (() => {
              const fmtRev = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

              // Build chart series
              const days = activeRange === '7d' ? 7 : activeRange === '30d' ? 30 : 365;
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const revMap: Record<string, number> = {};
              metrics.revenueByDay.forEach(({ date, cents }) => { revMap[date] = (revMap[date] ?? 0) + cents; });

              const series: { label: string; value: number; dateKey: string }[] = [];
              let cumulative = 0;
              // Pre-compute cumulative for dates before the range
              Object.entries(revMap).sort().forEach(([d, c]) => {
                const rangeStart = new Date(today);
                rangeStart.setDate(today.getDate() - days + 1);
                if (d < rangeStart.toISOString().slice(0, 10)) cumulative += c;
              });
              for (let i = days - 1; i >= 0; i--) {
                const day = new Date(today); day.setDate(today.getDate() - i);
                const dayKey = day.toISOString().slice(0, 10);
                cumulative += revMap[dayKey] ?? 0;
                series.push({
                  label: day.toLocaleDateString(undefined, { month: activeRange === '365d' ? 'short' : 'numeric', day: 'numeric' }),
                  value: cumulative,
                  dateKey: dayKey,
                });
              }
              const maxValue = series.reduce((m, p) => (p.value > m ? p.value : m), 0);
              const lastPoint = series[series.length - 1];
              const tooltipPoint = hoveredPoint || lastPoint;

              const height = 160, width = 600, paddingX = 4, paddingY = 10;
              const innerWidth = width - paddingX * 2, innerHeight = height - paddingY * 2;
              const yLevels = [0, 0.25, 0.5, 0.75, 1];

              const computedPoints = series.map((pt, idx) => {
                const x = series.length === 1 ? paddingX + innerWidth / 2 : paddingX + (innerWidth * idx) / (series.length - 1);
                const normalized = pt.value / (maxValue || 1);
                const y = paddingY + innerHeight - normalized * innerHeight;
                return { x, y, ...pt };
              });
              const pointsAttr = computedPoints.map(p => `${p.x},${p.y}`).join(' ');
              const fmtYLabel = (v: number) => v >= 100 ? `$${Math.round(v / 100)}` : `$${(v / 100).toFixed(1)}`;

              return (
                <>
                  {/* Metric cards */}
                  <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl border border-border/60 bg-card p-5">
                      <p className="text-xs text-muted-foreground mb-1">Revenue generated</p>
                      <p className="text-2xl font-bold text-foreground">{fmtRev(metrics.totalRevenueCents)}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">Total from your conversations.</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-card p-5">
                      <p className="text-xs text-muted-foreground mb-1">Conversations</p>
                      <p className="text-2xl font-bold text-foreground">{metrics.totalConversations}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">{metrics.activeConversations} active right now.</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-card p-5">
                      <p className="text-xs text-muted-foreground mb-1">Messages sent</p>
                      <p className="text-2xl font-bold text-foreground">{metrics.messagesSent.toLocaleString()}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">Total replies to fans.</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-card p-5">
                      <p className="text-xs text-muted-foreground mb-1">Avg. per conversation</p>
                      <p className="text-2xl font-bold text-foreground">
                        {metrics.totalConversations > 0 ? fmtRev(Math.round(metrics.totalRevenueCents / metrics.totalConversations)) : '$0.00'}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">Average revenue per conversation.</p>
                    </div>
                  </div>

                  {/* Revenue chart */}
                  <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70 mb-1">Revenue over time</p>
                        <p className="text-sm text-muted-foreground/80">
                          Cumulative revenue over the last {activeRange === '7d' ? '7 days' : activeRange === '30d' ? '30 days' : '12 months'}.
                        </p>
                      </div>
                      <div className="inline-flex rounded-full border border-border/60 bg-muted/30 p-0.5 text-[11px]">
                        {([{ key: '7d' as const, label: '7D' }, { key: '30d' as const, label: '30D' }, { key: '365d' as const, label: '1Y' }]).map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => { setActiveRange(item.key); setHoveredPoint(null); }}
                            className={`px-3 py-1 rounded-full transition-colors ${
                              activeRange === item.key
                                ? 'bg-foreground text-background shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {maxValue === 0 ? (
                      <p className="text-sm text-muted-foreground/80">No revenue data yet for this period.</p>
                    ) : (
                      <div className="relative">
                        <div className="flex items-stretch gap-0">
                          <div className="relative flex-shrink-0 w-9 h-40 sm:h-48 select-none">
                            {yLevels.map((ratio) => {
                              const dataVal = maxValue * (1 - ratio);
                              const topPct = (paddingY + innerHeight * ratio) / height * 100;
                              return (
                                <span key={ratio} className="absolute right-1 text-[9px] leading-none text-muted-foreground/50 -translate-y-1/2" style={{ top: `${topPct}%` }}>
                                  {fmtYLabel(dataVal)}
                                </span>
                              );
                            })}
                          </div>
                          <div className="flex-1 min-w-0">
                            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 sm:h-48 text-primary/80 transition-all duration-500" preserveAspectRatio="none">
                              <defs>
                                <linearGradient id="chatter-rev-grad" x1="0" x2="0" y1="0" y2="1">
                                  <stop offset="0%" stopColor="rgba(163,230,53,0.6)" />
                                  <stop offset="100%" stopColor="rgba(15,23,42,0)" />
                                </linearGradient>
                              </defs>
                              <g>
                                {yLevels.map((ratio) => {
                                  const yVal = paddingY + innerHeight * ratio;
                                  return <line key={ratio} x1={paddingX} x2={paddingX + innerWidth} y1={yVal} y2={yVal} stroke="rgba(148,163,184,0.15)" strokeWidth={0.5} />;
                                })}
                              </g>
                              <polyline fill="url(#chatter-rev-grad)" stroke="none" points={`${paddingX + innerWidth},${height - paddingY} ${pointsAttr} ${paddingX},${height - paddingY}`} className="opacity-80 transition-all duration-500" />
                              <polyline fill="none" stroke="currentColor" strokeWidth={2} points={pointsAttr} className="drop-shadow-[0_0_10px_rgba(56,189,248,0.7)] transition-all duration-500" />
                              <g>
                                {computedPoints.map((pt, idx) => (
                                  <circle key={idx} cx={pt.x} cy={pt.y} r={3} className="fill-current opacity-0 hover:opacity-100 cursor-pointer transition-opacity duration-200"
                                    onMouseEnter={() => setHoveredPoint({ label: pt.label, value: pt.value })}
                                    onMouseLeave={() => setHoveredPoint(null)}
                                  />
                                ))}
                              </g>
                            </svg>
                            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground/60">
                              {series.map((pt, idx) => (
                                <span key={idx} className="min-w-0 truncate">
                                  {idx === 0 || idx === series.length - 1 || series.length <= 7 ? pt.label : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        {tooltipPoint && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
                            <span>Total {fmtRev(lastPoint.value)} on {lastPoint.label}</span>
                            {hoveredPoint && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card px-2.5 py-1 text-[10px] text-foreground">
                                {tooltipPoint.label} · {fmtRev(tooltipPoint.value)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Chat view: split-pane (identical layout to CreatorChat) ────── */}
      {mainView === 'chat' && (
      <div className="pt-14 flex-1 flex overflow-hidden h-[calc(100vh-3.5rem)]">

        {/* ── Left panel: conversation list ──────────────────────────── */}
        <div className={`
          flex flex-col border-r border-border bg-card
          w-full md:w-80 lg:w-96 flex-shrink-0
          ${showMobileList ? 'flex' : 'hidden md:flex'}
        `}>
          <div className="px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-lg font-bold text-foreground">Conversations</h1>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search…"
                className="pl-8 h-8 text-xs bg-muted/50 border-0 rounded-xl"
              />
            </div>

            <div className="flex gap-1 mt-2 overflow-x-auto scrollbar-hide">
              {filterTabs.map(({ key, label, badge }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    statusFilter === key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {label}
                  {badge !== undefined && badge > 0 && (
                    <span className="px-1 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 text-[9px] font-bold min-w-[14px] text-center">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {convsLoading && (
              <div className="flex justify-center py-10">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!convsLoading && filteredConversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
                <MessagesSquare className="w-8 h-8 text-muted-foreground/20" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground/60">
                    {searchQuery ? 'No results' : 'No conversations'}
                  </p>
                  <p className="text-xs text-muted-foreground/40">
                    {searchQuery
                      ? 'Try a different search'
                      : statusFilter === 'unclaimed'
                        ? 'No pending conversations right now'
                        : 'Fan conversations will appear here'}
                  </p>
                </div>
              </div>
            )}

            {!convsLoading && filteredConversations.map((conv) => {
              const isUnclaimed = conv.status === 'unclaimed';
              const isClaiming = claimingId === conv.id;

              return (
                <div key={conv.id} className="relative">
                  <ConversationListItem
                    conversation={conv}
                    isSelected={selectedConversation?.id === conv.id}
                    onClick={() => {
                      if (isUnclaimed) {
                        handleClaim(conv);
                      } else {
                        handleSelectConversation(conv);
                      }
                    }}
                  />
                  {isUnclaimed && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-[10px] gap-1 rounded-lg px-2"
                        disabled={isClaiming}
                        onClick={(e) => { e.stopPropagation(); handleClaim(conv); }}
                      >
                        {isClaiming ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <UserCheck className="w-3 h-3" />
                        )}
                        Claim
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right panel: chat window ────────────────────────────────── */}
        <div className={`
          flex-1 flex flex-col overflow-hidden
          ${!showMobileList ? 'flex' : 'hidden md:flex'}
        `}>
          <AnimatePresence mode="wait">
            {selectedConversation && currentUserId ? (
              <motion.div
                key={selectedConversation.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs h-8 px-2"
                    onClick={handleBackToList}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </Button>
                </div>

                <ChatWindow
                  conversation={selectedConversation}
                  currentUserId={currentUserId}
                  senderType="chatter"
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8"
              >
                <div className="w-16 h-16 rounded-2xl border border-border bg-muted/30 flex items-center justify-center">
                  <MessageSquare className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-foreground/60">
                    Select a conversation
                  </p>
                  <p className="text-sm text-muted-foreground/40 max-w-xs">
                    Pick a conversation from the list to start replying to fans
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      )}

      {/* Close profile picker on outside click */}
      {showProfilePicker && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setShowProfilePicker(false)}
        />
      )}
    </div>
  );
}
