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
  LogOut, UserCheck, ChevronDown, Check,
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

      {/* ── Main: split-pane (identical layout to CreatorChat) ──────── */}
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
