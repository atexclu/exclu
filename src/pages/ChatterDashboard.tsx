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
  DollarSign, Users, Sun, Moon, ExternalLink, User,
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
  user_id: string;
}

interface ChatterClient {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  profiles: ChatterProfile[];
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
  const { resolvedTheme, setTheme } = useTheme();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [chatterDisplayName, setChatterDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Creator clients (grouped by user_id) and profiles
  const [clients, setClients] = useState<ChatterClient[]>([]);
  const [activeClientUserId, setActiveClientUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ChatterProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [showProfilePicker, setShowProfilePicker] = useState(false);

  // Derived: profiles for the active client
  const activeClient = clients.find((c) => c.user_id === activeClientUserId) ?? null;
  const clientProfiles = activeClient?.profiles ?? profiles;

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

  const allProfileIds = useMemo(() => clientProfiles.map((p) => p.id), [clientProfiles]);

  const { conversations, isLoading: convsLoading, refetch } = useConversations({
    profileId: activeProfileId,
    profileIds: activeProfileId === null ? allProfileIds : undefined,
    statusFilter: statusesToFetch,
  });

  const activeProfile = activeProfileId ? profiles.find((p) => p.id === activeProfileId) ?? null : null;

  // ── Auth + load authorized profiles ────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/');
        return;
      }
      setCurrentUserId(user.id);

      // Fetch chatter's own display name
      const { data: ownProfile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
      if (ownProfile?.display_name) {
        setChatterDisplayName(ownProfile.display_name);
      }

      // 1. Get invited profile IDs
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

      const invitedProfileIds = invitations.map((i: any) => i.profile_id);

      // 2. Get the user_id (creator account) for each invited profile
      const { data: invitedProfiles } = await supabase
        .from('creator_profiles')
        .select('user_id')
        .in('id', invitedProfileIds);

      const creatorUserIds = [...new Set((invitedProfiles ?? []).map((p: any) => p.user_id))];

      // 3. Load ALL profiles for each creator account (agency expansion)
      const { data: allProfilesData } = await supabase
        .from('creator_profiles')
        .select('id, username, display_name, avatar_url, user_id')
        .in('user_id', creatorUserIds)
        .order('created_at', { ascending: true });

      const allProfiles = (allProfilesData ?? []) as ChatterProfile[];

      // 4. Fetch creator account display names for the client switcher
      const { data: creatorAccounts } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', creatorUserIds);

      const creatorAccountMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
      (creatorAccounts ?? []).forEach((a: any) => creatorAccountMap.set(a.id, { display_name: a.display_name, avatar_url: a.avatar_url }));

      // 5. Group profiles by creator account (client)
      const clientMap = new Map<string, ChatterClient>();
      for (const uid of creatorUserIds) {
        const account = creatorAccountMap.get(uid);
        clientMap.set(uid, {
          user_id: uid,
          display_name: account?.display_name ?? null,
          avatar_url: account?.avatar_url ?? null,
          profiles: allProfiles.filter((p) => p.user_id === uid),
        });
      }
      const loadedClients = [...clientMap.values()];
      setClients(loadedClients);
      setProfiles(allProfiles);

      // 6. Auto-select client and profile
      if (loadedClients.length === 1) {
        setActiveClientUserId(loadedClients[0].user_id);
        const clientProfilesList = loadedClients[0].profiles;
        if (clientProfilesList.length === 1) {
          setActiveProfileId(clientProfilesList[0].id);
        } else {
          setActiveProfileId(null);
        }
      } else {
        setActiveClientUserId(creatorUserIds[0]);
        setActiveProfileId(null);
      }

      setIsAuthorized(true);
      setIsLoading(false);
    };

    init();
  }, [navigate]);

  // ── Fetch chatter metrics when dashboard tab is active ─────────────────
  useEffect(() => {
    if (mainView !== 'dashboard' || !currentUserId) return;
    if (!activeProfileId && allProfileIds.length === 0) return;
    let cancelled = false;
    const fetchMetrics = async () => {
      setMetricsLoading(true);
      try {
        // Conversations assigned to this chatter for the active profile(s)
        let convsQuery = supabase
          .from('conversations')
          .select('id, status, total_revenue_cents, created_at')
          .eq('assigned_chatter_id', currentUserId);

        if (activeProfileId) {
          convsQuery = convsQuery.eq('profile_id', activeProfileId);
        } else {
          convsQuery = convsQuery.in('profile_id', allProfileIds);
        }

        const { data: convs } = await convsQuery;

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
  }, [mainView, currentUserId, activeProfileId, allProfileIds.join(',')]);

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
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">

      {/* ── Topbar (matching creator AppShell) ─────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-30 border-b border-border/50 bg-card/80 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
          <a href="/" className="inline-flex items-center flex-shrink-0">
            <img
              src={resolvedTheme === 'light' ? logoBlack : logoWhite}
              alt="Exclu"
              className="h-5 sm:h-6 w-auto object-contain"
            />
          </a>

          {/* Chat / Dashboard nav pill — center */}
          <nav className="flex-1 flex items-center justify-center">
            <div className="relative flex items-center gap-0.5 sm:gap-1 rounded-2xl bg-muted/50 dark:bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setMainView('chat')}
                className="relative z-10"
              >
                <div
                  className={`relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors duration-200 ${
                    mainView === 'chat' ? 'text-black dark:text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <MessageCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Chat</span>
                </div>
                {mainView === 'chat' && (
                  <motion.div
                    layoutId="chatter-nav-active"
                    className="absolute inset-0 rounded-xl bg-background dark:bg-white/10 shadow-sm dark:shadow-[0_0_12px_rgba(255,255,255,0.06)] border border-border/60 dark:border-white/10"
                    transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.8 }}
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => setMainView('dashboard')}
                className="relative z-10"
              >
                <div
                  className={`relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors duration-200 ${
                    mainView === 'dashboard' ? 'text-black dark:text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Dashboard</span>
                </div>
                {mainView === 'dashboard' && (
                  <motion.div
                    layoutId="chatter-nav-active"
                    className="absolute inset-0 rounded-xl bg-background dark:bg-white/10 shadow-sm dark:shadow-[0_0_12px_rgba(255,255,255,0.06)] border border-border/60 dark:border-white/10"
                    transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.8 }}
                  />
                )}
              </button>
            </div>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Client avatar + switcher (multiple creator clients OR multiple profiles) */}
            <div className="relative">
              <motion.button
                type="button"
                onClick={() => (clients.length > 1 || (activeClient && activeClient.profiles.length > 1)) ? setShowProfilePicker((v) => !v) : undefined}
                className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 transition-all ${
                  showProfilePicker
                    ? 'border-primary shadow-[0_0_12px_rgba(var(--primary),0.3)]'
                    : 'border-border/60 hover:border-primary/50'
                } ${(clients.length <= 1 && (!activeClient || activeClient.profiles.length <= 1)) ? 'cursor-default' : 'cursor-pointer'}`}
                whileHover={(clients.length > 1 || (activeClient && activeClient.profiles.length > 1)) ? { scale: 1.08 } : {}}
                whileTap={(clients.length > 1 || (activeClient && activeClient.profiles.length > 1)) ? { scale: 0.95 } : {}}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                {activeClient?.avatar_url ? (
                  <img src={activeClient.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </motion.button>

              {/* Client/Profile switcher dropdown */}
              <AnimatePresence>
                {showProfilePicker && (clients.length > 1 || (activeClient && activeClient.profiles.length > 1)) && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full mt-1 right-0 w-56 bg-card border border-border rounded-xl shadow-xl z-50 py-1 overflow-hidden"
                  >
                    {clients.length > 1 && (
                      <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Your clients
                      </div>
                    )}
                    {clients.length > 1 && clients.map((client) => (
                      <button
                        key={client.user_id}
                        type="button"
                        onClick={() => {
                          setActiveClientUserId(client.user_id);
                          setActiveProfileId(client.profiles.length === 1 ? client.profiles[0].id : null);
                          setSelectedConversation(null);
                          setShowMobileList(true);
                          setShowProfilePicker(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/60 transition-colors ${
                          client.user_id === activeClientUserId ? 'bg-muted/40' : ''
                        }`}
                      >
                        {client.avatar_url ? (
                          <img src={client.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-border/40" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {(client.display_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-xs font-medium truncate">{client.display_name || 'Creator'}</p>
                          <p className="text-[10px] text-muted-foreground">{client.profiles.length} profile{client.profiles.length > 1 ? 's' : ''}</p>
                        </div>
                        {client.user_id === activeClientUserId && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      </button>
                    ))}
                    
                    {/* Show profiles when single client with multiple profiles */}
                    {clients.length === 1 && activeClient && activeClient.profiles.length > 1 && (
                      <>
                        <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-t border-border/40 mt-1 pt-2">
                          Profiles
                        </div>
                        {activeClient.profiles.map((profile) => (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => {
                              setActiveProfileId(profile.id);
                              setSelectedConversation(null);
                              setShowMobileList(true);
                              setShowProfilePicker(false);
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/60 transition-colors ${
                              profile.id === activeProfileId ? 'bg-muted/40' : ''
                            }`}
                          >
                            {profile.avatar_url ? (
                              <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-border/40" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                {(profile.display_name ?? profile.username ?? '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-0 text-left">
                              <p className="text-xs font-medium truncate">{profile.display_name || profile.username || 'Profile'}</p>
                              <p className="text-[10px] text-muted-foreground">@{profile.username || profile.id.slice(0, 8)}</p>
                            </div>
                            {profile.id === activeProfileId && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                          </button>
                        ))}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme toggle — desktop only */}
            <motion.button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-full border border-border/60 bg-background hover:bg-muted transition-colors"
              aria-label="Toggle theme"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Moon className="w-4 h-4 text-muted-foreground" />
              )}
            </motion.button>

            {/* Logout */}
            <motion.div
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <Button
                variant="outline"
                size="icon"
                className="rounded-full h-8 w-8 sm:h-9 sm:w-9 border-border/60"
                onClick={handleSignOut}
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </motion.div>
          </div>
        </div>
      </header>

      {/* ── Dashboard view (identical styling to AppDashboard) ────── */}
      {mainView === 'dashboard' && (
        <div className="pt-16 sm:pt-20 flex-1 overflow-y-auto">
          <div className="px-4 pb-16 max-w-6xl mx-auto">
            {/* Header — same as AppDashboard */}
            <section className="mt-4 sm:mt-6 mb-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-3xl font-extrabold text-exclu-cloud truncate">
                    <span>Welcome back{chatterDisplayName ? <>, <span className="text-black dark:text-[#CFFF16]">{chatterDisplayName}</span></> : ''}</span>
                  </h1>
                  <p className="text-sm text-exclu-space/70 mt-1">
                    Here's an overview of your performance
                  </p>
                </div>
              </div>
            </section>

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
                  {/* Metric cards — same grid & card style as AppDashboard */}
                  <section className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5">
                      <p className="text-xs text-exclu-space mb-1">Revenue generated</p>
                      <p className="text-2xl font-bold text-exclu-cloud">{fmtRev(metrics.totalRevenueCents)}</p>
                      <p className="text-[11px] text-exclu-space/80 mt-1">Total from your conversations.</p>
                    </div>
                    <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5">
                      <p className="text-xs text-exclu-space mb-1">Conversations</p>
                      <p className="text-2xl font-bold text-exclu-cloud">{metrics.totalConversations}</p>
                      <p className="text-[11px] text-exclu-space/80 mt-1">{metrics.activeConversations} active right now.</p>
                    </div>
                    <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5">
                      <p className="text-xs text-exclu-space mb-1">Messages sent</p>
                      <p className="text-2xl font-bold text-exclu-cloud">{metrics.messagesSent.toLocaleString()}</p>
                      <p className="text-[11px] text-exclu-space/80 mt-1">Total replies to fans.</p>
                    </div>
                    <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5">
                      <p className="text-xs text-exclu-space mb-1">Avg. per conversation</p>
                      <p className="text-2xl font-bold text-exclu-cloud">
                        {metrics.totalConversations > 0 ? fmtRev(Math.round(metrics.totalRevenueCents / metrics.totalConversations)) : '$0.00'}
                      </p>
                      <p className="text-[11px] text-exclu-space/80 mt-1">Average revenue per conversation.</p>
                    </div>
                  </section>

                  {/* Revenue chart — same style as AppDashboard analytics chart */}
                  <section className="mt-6">
                    <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70 mb-1">Growth over time</p>
                          <p className="text-sm text-exclu-space/80">
                            Revenue over the last {activeRange === '7d' ? '7 days' : activeRange === '30d' ? '30 days' : '12 months'}.
                          </p>
                        </div>
                        <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80">
                          {([{ key: '7d' as const, label: '7D' }, { key: '30d' as const, label: '30D' }, { key: '365d' as const, label: '1Y' }]).map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => { setActiveRange(item.key); setHoveredPoint(null); }}
                              className={`px-3 py-1 rounded-full transition-colors ${
                                activeRange === item.key
                                  ? 'bg-exclu-cloud text-white dark:text-black shadow-sm'
                                  : 'text-exclu-space hover:text-exclu-cloud'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {maxValue === 0 ? (
                        <p className="text-sm text-exclu-space/80">No revenue data yet for this period.</p>
                      ) : (
                        <div className="relative">
                          <div className="flex items-stretch gap-0">
                            <div className="relative flex-shrink-0 w-9 h-40 sm:h-48 select-none">
                              {yLevels.map((ratio) => {
                                const dataVal = maxValue * (1 - ratio);
                                const topPct = (paddingY + innerHeight * ratio) / height * 100;
                                return (
                                  <span key={ratio} className="absolute right-1 text-[9px] leading-none text-slate-400/60 -translate-y-1/2" style={{ top: `${topPct}%` }}>
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
                              <div className="mt-2 flex justify-between text-[10px] text-exclu-space/70">
                                {series.map((pt, idx) => (
                                  <span key={idx} className="min-w-0 truncate">
                                    {idx === 0 || idx === series.length - 1 || series.length <= 7 ? pt.label : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          {tooltipPoint && (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-exclu-space/80">
                              <span>Total {fmtRev(lastPoint.value)} on {lastPoint.label}</span>
                              {hoveredPoint && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 px-2.5 py-1 text-[10px] text-exclu-cloud">
                                  {tooltipPoint.label} · {fmtRev(tooltipPoint.value)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Chat view: split-pane (identical layout to CreatorChat) ────── */}
      {mainView === 'chat' && (
      <div className="pt-16 sm:pt-20 flex-1 flex overflow-hidden">

        {/* ── Left panel: conversation list ──────────────────────────── */}
        <div className={`
          flex flex-col border-r border-border bg-card
          w-full md:w-80 lg:w-96 flex-shrink-0
          ${showMobileList ? 'flex' : 'hidden md:flex'}
        `}>
          <div className="px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-lg font-bold text-foreground">Conversations</h1>
            </div>

            {/* Profile story-bubbles — switch between profiles within the active client */}
            {clientProfiles.length > 1 && (
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pt-2 pb-2 mb-2 pl-2">
                {/* All profiles bubble */}
                <button
                  type="button"
                  onClick={() => { setActiveProfileId(null); setSelectedConversation(null); setShowMobileList(true); }}
                  className="flex flex-col items-center gap-1 flex-shrink-0"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    activeProfileId === null
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/10'
                      : 'bg-muted/60 hover:bg-muted'
                  }`}>
                    <Users className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <span className={`text-[9px] font-medium truncate max-w-[52px] ${
                    activeProfileId === null ? 'text-primary' : 'text-muted-foreground'
                  }`}>All</span>
                </button>

                {clientProfiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setActiveProfileId(p.id); setSelectedConversation(null); setShowMobileList(true); }}
                    className="flex flex-col items-center gap-1 flex-shrink-0"
                  >
                    <div className={`w-12 h-12 rounded-full overflow-hidden transition-all ${
                      activeProfileId === p.id
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                        : 'ring-1 ring-border/40 hover:ring-primary/50'
                    }`}>
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                          {(p.display_name ?? p.username ?? '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className={`text-[9px] font-medium truncate max-w-[52px] ${
                      activeProfileId === p.id ? 'text-primary' : 'text-muted-foreground'
                    }`}>{p.display_name || p.username}</span>
                  </button>
                ))}
              </div>
            )}

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
