import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageSquare, MessagesSquare, DollarSign, Settings, LogOut, ArrowUpRight, Trash2, Sun, Moon, User, ExternalLink, Unlock, ArrowLeft, Gift, Search, Compass, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import logoBlack from '@/assets/logo-black.svg';
import logoWhite from '@/assets/logo-white.svg';
import { useTheme } from '@/contexts/ThemeContext';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ChatCustomRequest } from '@/components/chat/ChatCustomRequest';
import type { Conversation } from '@/types/chat';

interface FavoriteCreator {
  id: string;
  creator_id: string;
  creator: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    handle: string | null;
    tips_enabled: boolean;
    custom_requests_enabled: boolean;
  };
}

interface TipRecord {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  message: string | null;
  is_anonymous: boolean;
  created_at: string;
  creator: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  };
}

interface GiftRecord {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  message: string | null;
  is_anonymous: boolean;
  created_at: string;
  wishlist_item: {
    name: string;
    emoji: string | null;
    image_url: string | null;
  } | null;
  creator: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  };
}

interface RequestRecord {
  id: string;
  description: string;
  proposed_amount_cents: number;
  final_amount_cents: number | null;
  currency: string;
  status: string;
  creator_response: string | null;
  created_at: string;
  delivery_link_id: string | null;
  delivery_link_slug: string | null;
  creator: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  };
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  succeeded: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  refunded: 'bg-gray-500/20 text-gray-400',
  accepted: 'bg-blue-500/20 text-blue-400',
  paid: 'bg-emerald-500/20 text-emerald-400',
  in_progress: 'bg-indigo-500/20 text-indigo-400',
  delivered: 'bg-green-500/20 text-green-400',
  completed: 'bg-green-500/20 text-green-400',
  refused: 'bg-red-500/20 text-red-400',
  expired: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
};

function RequestCreatorModal({ creatorId, onClose }: { creatorId: string; onClose: () => void }) {
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('creator_profiles')
      .select('id')
      .eq('user_id', creatorId)
      .eq('is_active', true)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setProfileId(data.id);
      });
  }, [creatorId]);

  if (!profileId) return null;
  return <ChatCustomRequest profileId={profileId} onClose={onClose} />;
}

const FanDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const validTabs = ['favorites', 'tips', 'requests', 'messages', 'settings'] as const;
  const urlTab = searchParams.get('tab') as typeof validTabs[number] | null;
  const [activeTab, setActiveTab] = useState<typeof validTabs[number]>(
    urlTab && validTabs.includes(urlTab) ? urlTab : 'favorites'
  );
  const [favorites, setFavorites] = useState<FavoriteCreator[]>([]);
  const [tips, setTips] = useState<TipRecord[]>([]);
  const [gifts, setGifts] = useState<GiftRecord[]>([]);
  const [tipsSubTab, setTipsSubTab] = useState<'tips' | 'gifts'>('tips');
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [fanDisplayName, setFanDisplayName] = useState<string | null>(null);
  const [fanAvatarUrl, setFanAvatarUrl] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Messages tab
  const [fanConversations, setFanConversations] = useState<Conversation[]>([]);
  const [selectedFanConversation, setSelectedFanConversation] = useState<Conversation | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [showMobileConvList, setShowMobileConvList] = useState(true);

  // Request from favorites
  const [requestCreator, setRequestCreator] = useState<FavoriteCreator | null>(null);

  // Creator discovery
  const [discoveryCreators, setDiscoveryCreators] = useState<{ id: string; user_id: string; username: string; display_name: string | null; avatar_url: string | null; model_categories: string[] | null; }[]>([]);
  const [discoveryFilter, setDiscoveryFilter] = useState<string | null>(null);
  const [discoverySearch, setDiscoverySearch] = useState('');
  const [showDiscovery, setShowDiscovery] = useState(false);

  // Auto-favorite creator from signup redirect
  const creatorFromSignup = searchParams.get('creator');
  const tabParam = searchParams.get('tab');
  const convParam = searchParams.get('conversation');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setUserEmail(user.email || null);

      // Load fan profile
      const { data: fanProfile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (fanProfile) {
        setFanDisplayName(fanProfile.display_name || null);
        setFanAvatarUrl(fanProfile.avatar_url || null);
      }

      // Auto-favorite if coming from signup
      if (creatorFromSignup) {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('handle', creatorFromSignup)
          .eq('is_creator', true)
          .maybeSingle();

        if (creatorProfile) {
          await supabase
            .from('fan_favorites')
            .upsert(
              { fan_id: user.id, creator_id: creatorProfile.id },
              { onConflict: 'fan_id,creator_id' }
            );
        }
      }

      await fetchData(user.id);

      // Handle tab/conversation redirect from CreatorPublic
      if (tabParam === 'messages') {
        setActiveTab('messages');
        await fetchFanConversations(user.id, convParam ?? null);
      }
    };

    init();
  }, [creatorFromSignup, tabParam, convParam]);

  const fetchFanConversations = async (uid: string, preSelectId: string | null) => {
    setIsLoadingConversations(true);
    const { data } = await supabase
      .from('conversations')
      .select('*, creator_profile:creator_profiles!conversations_profile_id_fkey(id, username, display_name, avatar_url)')
      .eq('fan_id', uid)
      .in('status', ['unclaimed', 'active'])
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (data) {
      // Map creator_profile into fan field shape expected by ChatWindow
      const mapped: Conversation[] = data.map((c: any) => ({
        ...c,
        fan: c.creator_profile
          ? { id: c.creator_profile.id, display_name: c.creator_profile.display_name, avatar_url: c.creator_profile.avatar_url }
          : null,
      }));
      setFanConversations(mapped);
      if (preSelectId) {
        const target = mapped.find((c) => c.id === preSelectId);
        if (target) {
          setSelectedFanConversation(target);
          setShowMobileConvList(false);
        }
      }
    }
    setIsLoadingConversations(false);
  };

  const fetchData = async (uid: string) => {
    setIsLoading(true);

    // Fetch favorites with creator profile
    const { data: favData } = await supabase
      .from('fan_favorites')
      .select('id, creator_id, creator:profiles!fan_favorites_creator_id_fkey(id, display_name, avatar_url, handle, tips_enabled, custom_requests_enabled)')
      .eq('fan_id', uid)
      .order('created_at', { ascending: false });

    if (favData) {
      setFavorites(favData.map((f: any) => ({
        id: f.id,
        creator_id: f.creator_id,
        creator: f.creator,
      })));
    }

    // Fetch ALL active creators for discovery directory
    const { data: creatorsData } = await supabase
      .from('creator_profiles')
      .select('id, user_id, username, display_name, avatar_url, model_categories')
      .eq('is_active', true)
      .not('avatar_url', 'is', null)
      .order('profile_view_count', { ascending: false });
    if (creatorsData) setDiscoveryCreators(creatorsData);

    // Fetch tips
    const { data: tipsData } = await supabase
      .from('tips')
      .select('id, amount_cents, currency, status, message, is_anonymous, created_at, creator:profiles!tips_creator_id_fkey(display_name, handle, avatar_url)')
      .eq('fan_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);

    if (tipsData) {
      setTips(tipsData.map((t: any) => ({ ...t, creator: t.creator })));
    }

    // Fetch gifts
    const { data: giftsData } = await supabase
      .from('gift_purchases')
      .select('id, amount_cents, currency, status, message, is_anonymous, created_at, wishlist_item:wishlist_items!gift_purchases_wishlist_item_id_fkey(name, emoji, image_url), creator:profiles!gift_purchases_creator_id_fkey(display_name, handle, avatar_url)')
      .eq('fan_id', uid)
      .order('created_at', { ascending: false })
      .limit(50);

    if (giftsData) {
      setGifts(giftsData.map((g: any) => ({ ...g, wishlist_item: g.wishlist_item, creator: g.creator })));
    }

    // Fetch custom requests with delivery link slug (exclude incomplete checkouts)
    const { data: reqData } = await supabase
      .from('custom_requests')
      .select('id, description, proposed_amount_cents, final_amount_cents, currency, status, creator_response, created_at, delivery_link_id, delivery_link:links!custom_requests_delivery_link_id_fkey(slug), creator:profiles!creator_id(display_name, handle, avatar_url)')
      .eq('fan_id', uid)
      .neq('status', 'pending_payment')
      .order('created_at', { ascending: false })
      .limit(50);

    if (reqData) {
      setRequests(reqData.map((r: any) => ({
        ...r,
        creator: r.creator,
        delivery_link_slug: r.delivery_link?.slug ?? null,
      })));
    }

    setIsLoading(false);
  };

  const handleRemoveFavorite = async (favoriteId: string) => {
    const { error } = await supabase
      .from('fan_favorites')
      .delete()
      .eq('id', favoriteId);

    if (error) {
      toast.error('Failed to remove');
      return;
    }

    setFavorites((prev) => prev.filter((f) => f.id !== favoriteId));
    toast.success('Creator removed from favorites');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleFanAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    setIsUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop() ?? 'jpg';
      const filePath = `avatars/${userId}/fan-avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) {
        toast.error('Failed to upload avatar.');
        return;
      }

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const newAvatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', userId);

      if (updateError) {
        toast.error('Failed to save avatar.');
        return;
      }

      setFanAvatarUrl(newAvatarUrl);
      toast.success('Profile photo updated!');
    } catch {
      toast.error('Failed to upload avatar.');
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleDeleteAccount = async () => {
    if (!userId) return;

    try {
      const { error } = await supabase.functions.invoke('delete-fan-account', {
        body: { user_id: userId },
      });

      if (error) throw error;

      await supabase.auth.signOut();
      toast.success('Your account has been deleted');
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete account');
    }
  };

  const tabs = [
    { key: 'favorites' as const, label: 'My Creators', icon: Heart },
    { key: 'messages' as const, label: 'Messages', icon: MessagesSquare },
    { key: 'tips' as const, label: 'Tips & Gifts', icon: DollarSign },
    { key: 'requests' as const, label: 'Requests', icon: MessageSquare },
  ];

  const handleMessagesTabClick = async () => {
    if (activeTab !== 'messages') {
      setActiveTab('messages');
      if (userId && fanConversations.length === 0) {
        await fetchFanConversations(userId, null);
      }
    }
  };

  const handleOpenChat = async (creatorId: string) => {
    if (!userId) return;
    setActiveTab('messages');
    // Find or create conversation for this fan + creator
    const { data: existing } = await supabase
      .from('conversations')
      .select('*, creator_profile:creator_profiles!conversations_profile_id_fkey(id, username, display_name, avatar_url)')
      .eq('fan_id', userId)
      .in('status', ['unclaimed', 'active'])
      .limit(100);

    // Match by creator user_id through profile
    const convs = (existing ?? []) as any[];
    const match = convs.find((c: any) => c.creator_profile?.id && favorites.some(f => f.creator_id === creatorId));
    const mapped: Conversation[] = convs.map((c: any) => ({
      ...c,
      fan: c.creator_profile
        ? { id: c.creator_profile.id, display_name: c.creator_profile.display_name, avatar_url: c.creator_profile.avatar_url }
        : null,
    }));
    setFanConversations(mapped);
    if (match) {
      const target = mapped.find(c => c.id === match.id);
      if (target) {
        setSelectedFanConversation(target);
        setShowMobileConvList(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Topbar (AppShell style) ── */}
      <header className="fixed top-0 inset-x-0 z-30 border-b border-border/50 bg-card/80 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">

          {/* Logo */}
          <a href="/" className="inline-flex items-center flex-shrink-0">
            <img
              src={resolvedTheme === 'light' ? logoBlack : logoWhite}
              alt="Exclu"
              className="h-5 sm:h-6 w-auto object-contain"
            />
          </a>

          {/* Nav pills */}
          <nav className="flex-1 flex items-center justify-center">
            <div className="relative flex items-center gap-0.5 sm:gap-1 rounded-2xl bg-muted/50 dark:bg-muted/30 p-1">
              {tabs.map(({ key, label, icon: Icon }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => key === 'messages' ? handleMessagesTabClick() : setActiveTab(key as any)}
                    className="relative z-10"
                  >
                    <motion.div
                      className={`relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors duration-200 ${
                        active ? 'text-black dark:text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      whileHover={!active ? { scale: 1.04 } : {}}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="hidden sm:inline">{label}</span>
                    </motion.div>
                    {active && (
                      <motion.div
                        layoutId="fan-nav-pill"
                        className="absolute inset-0 rounded-xl bg-background dark:bg-white/10 shadow-sm border border-border/60 dark:border-white/10"
                        transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.8 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Right: avatar + theme + logout */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Avatar */}
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="group relative"
              aria-label="Profile settings"
            >
              <motion.div
                className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 transition-all ${
                  activeTab === 'settings'
                    ? 'border-primary shadow-[0_0_12px_rgba(var(--primary),0.3)]'
                    : 'border-border/60 group-hover:border-primary/50'
                }`}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                {fanAvatarUrl ? (
                  <img src={fanAvatarUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            </button>

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
            <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full h-8 w-8 sm:h-9 sm:w-9 border-border/60"
                onClick={handleSignOut}
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </motion.div>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="pt-16 sm:pt-20 flex-1 flex flex-col">
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-32">
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          )}

          <AnimatePresence mode="wait">

            {/* ── MY CREATORS TAB ── */}
            {!isLoading && activeTab === 'favorites' && (
              <motion.div
                key="favorites"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {/* Section header */}
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">My Creators</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {favorites.length > 0
                        ? `${favorites.length} creator${favorites.length > 1 ? 's' : ''} you follow`
                        : 'Discover and follow your favorite creators'}
                    </p>
                  </div>
                  {favorites.length > 0 && !showDiscovery && (
                    <button
                      onClick={() => setShowDiscovery(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#CFFF16]/10 text-[#CFFF16] hover:bg-[#CFFF16]/20 transition-colors"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      Add more
                    </button>
                  )}
                </div>

                {(favorites.length === 0 || showDiscovery) ? (
                  <div>
                    {/* Back to favorites button (when coming from "Add more") */}
                    {favorites.length > 0 && showDiscovery && (
                      <button
                        type="button"
                        onClick={() => { setShowDiscovery(false); setDiscoverySearch(''); setDiscoveryFilter(null); }}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back to my creators
                      </button>
                    )}

                    {/* Tag search */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        value={discoverySearch}
                        onChange={(e) => setDiscoverySearch(e.target.value)}
                        placeholder="Search by tag…"
                        className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    {/* Category filters */}
                    {(() => {
                      const allCategories = Array.from(new Set(
                        discoveryCreators.flatMap((c) => c.model_categories || [])
                      )).sort();
                      if (allCategories.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-2 mb-4">
                          <button
                            type="button"
                            onClick={() => setDiscoveryFilter(null)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                              !discoveryFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            All
                          </button>
                          {allCategories.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setDiscoveryFilter(discoveryFilter === cat ? null : cat)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                                discoveryFilter === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Creator grid */}
                    {(() => {
                      const favoriteUserIds = new Set(favorites.map(f => f.creator_id));
                      const filtered = discoveryCreators.filter((c) => {
                        if (discoveryFilter && !(c.model_categories || []).includes(discoveryFilter)) return false;
                        if (discoverySearch.trim()) {
                          const q = discoverySearch.toLowerCase();
                          return (c.model_categories || []).some(tag => tag.toLowerCase().includes(q));
                        }
                        return true;
                      });
                      if (filtered.length === 0) return (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                          <Search className="w-6 h-6 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">No creators found</p>
                        </div>
                      );
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {filtered.map((c, i) => {
                            const isFav = favoriteUserIds.has(c.user_id);
                            return (
                              <motion.div
                                key={c.id}
                                initial={{ opacity: 0, scale: 0.92 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.3, delay: i * 0.03 }}
                                className="group relative rounded-2xl overflow-hidden cursor-pointer bg-card border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg"
                                onClick={() => navigate(`/${c.username}`)}
                              >
                                <div className="relative aspect-[3/4] overflow-hidden">
                                  {c.avatar_url ? (
                                    <motion.img
                                      src={c.avatar_url}
                                      alt={c.display_name || c.username}
                                      className="w-full h-full object-cover"
                                      whileHover={{ scale: 1.07 }}
                                      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-muted flex items-center justify-center">
                                      <span className="text-4xl font-bold text-muted-foreground/30">
                                        {(c.display_name || c.username).charAt(0).toUpperCase()}
                                      </span>
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                                  {/* Heart / favorite button */}
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!userId) return;
                                      if (isFav) {
                                        const fav = favorites.find(f => f.creator_id === c.user_id);
                                        if (fav) await handleRemoveFavorite(fav.id);
                                      } else {
                                        const { data: inserted, error } = await supabase
                                          .from('fan_favorites')
                                          .insert({ fan_id: userId, creator_id: c.user_id })
                                          .select('id, creator_id')
                                          .single();
                                        if (!error && inserted) {
                                          setFavorites(prev => [...prev, {
                                            id: inserted.id,
                                            creator_id: c.user_id,
                                            creator: { id: c.id, display_name: c.display_name, avatar_url: c.avatar_url, handle: c.username, tips_enabled: false, custom_requests_enabled: false },
                                          }]);
                                          toast.success('Added to favorites');
                                        } else if (error && error.code !== '23505') {
                                          toast.error('Failed to add favorite');
                                        }
                                      }
                                    }}
                                    className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all z-10 ${
                                      isFav
                                        ? 'bg-red-500/90 text-white shadow-lg'
                                        : 'bg-black/50 backdrop-blur-sm text-white/70 hover:text-red-400 hover:bg-black/70 opacity-0 group-hover:opacity-100'
                                    }`}
                                  >
                                    <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                                  </button>

                                  <div className="absolute bottom-0 inset-x-0 p-3">
                                    <p className="text-sm font-semibold text-white leading-tight truncate">
                                      {c.display_name || c.username}
                                    </p>
                                    <p className="text-[11px] text-white/60 truncate">@{c.username}</p>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    {/* Add more button moved to header */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {favorites.map((fav, i) => (
                      <motion.div
                        key={fav.id}
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: i * 0.05 }}
                        className="group relative rounded-2xl overflow-hidden cursor-pointer bg-exclu-ink border border-exclu-arsenic/60 hover:border-primary/50 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
                        onClick={() => navigate(`/${fav.creator.handle}`)}
                      >
                        {/* Photo cover */}
                        <div className="relative aspect-[3/4] overflow-hidden">
                          {fav.creator.avatar_url ? (
                            <motion.img
                              src={fav.creator.avatar_url}
                              alt={fav.creator.display_name || ''}
                              className="w-full h-full object-cover"
                              whileHover={{ scale: 1.07 }}
                              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                            />
                          ) : (
                            <div className="w-full h-full bg-exclu-phantom flex items-center justify-center">
                              <span className="text-4xl font-bold text-white/20">
                                {(fav.creator.display_name || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}

                          {/* Gradient overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                          {/* Remove button */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveFavorite(fav.id); }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/60 hover:text-red-400 hover:bg-red-500/20 transition-all"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Name overlay */}
                          <div className="absolute bottom-0 inset-x-0 p-3">
                            <p className="text-sm font-semibold text-white leading-tight truncate">
                              {fav.creator.display_name || fav.creator.handle}
                            </p>
                            <p className="text-[11px] text-white/60 truncate">@{fav.creator.handle}</p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="p-2.5 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="flex-1 rounded-xl text-xs h-8 border-exclu-arsenic/60 hover:bg-white/5"
                            onClick={(e) => { e.stopPropagation(); handleOpenChat(fav.creator_id); }}
                          >
                            <MessagesSquare className="w-3 h-3 mr-1" />
                            Chat
                          </Button>
                          {fav.creator.custom_requests_enabled && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="flex-1 rounded-xl text-xs h-8 border-exclu-arsenic/60 hover:bg-white/5"
                              onClick={(e) => { e.stopPropagation(); setActiveTab('requests'); setRequestCreator(fav); }}
                            >
                              <MessageSquare className="w-3 h-3 mr-1" />
                              Request
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── TIPS & GIFTS TAB ── */}
            {!isLoading && activeTab === 'tips' && (
              <motion.div
                key="tips"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Tips & Gifts</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Your support history</p>
                  </div>
                  <div className="flex gap-1 p-1 rounded-xl bg-muted/50 dark:bg-muted/30 w-fit">
                  <button
                    type="button"
                    onClick={() => setTipsSubTab('tips')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      tipsSubTab === 'tips'
                        ? 'bg-background dark:bg-white/10 text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    Tips
                    {tips.length > 0 && <span className="text-[10px] ml-0.5 opacity-60">({tips.length})</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipsSubTab('gifts')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      tipsSubTab === 'gifts'
                        ? 'bg-background dark:bg-white/10 text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Gift className="w-3.5 h-3.5" />
                    Gifts
                    {gifts.length > 0 && <span className="text-[10px] ml-0.5 opacity-60">({gifts.length})</span>}
                  </button>
                  </div>
                </div>

                {/* Tips sub-tab */}
                {tipsSubTab === 'tips' && (
                  <>
                    {tips.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                          <DollarSign className="w-7 h-7 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">No tips sent yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {tips.map((tip, i) => (
                          <motion.div
                            key={tip.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="rounded-2xl border border-exclu-arsenic/60 bg-card p-4 hover:border-exclu-arsenic/80 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-exclu-ink flex-shrink-0">
                                  {tip.creator.avatar_url ? (
                                    <img src={tip.creator.avatar_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/40 text-xs font-bold">
                                      {(tip.creator.display_name || '?').charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    {tip.creator.display_name || tip.creator.handle}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(tip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-foreground">
                                  ${(tip.amount_cents / 100).toFixed(2)}
                                </p>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[tip.status] || 'bg-gray-500/20 text-gray-400'}`}>
                                  {tip.status}
                                </span>
                              </div>
                            </div>
                            {tip.message && (
                              <p className="text-xs text-muted-foreground mt-3 pl-[52px] italic">"{tip.message}"</p>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Gifts sub-tab */}
                {tipsSubTab === 'gifts' && (
                  <>
                    {gifts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                          <Gift className="w-7 h-7 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">No gifts sent yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {gifts.map((gift, i) => (
                          <motion.div
                            key={gift.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="rounded-2xl border border-exclu-arsenic/60 bg-card p-4 hover:border-exclu-arsenic/80 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-exclu-ink flex-shrink-0 flex items-center justify-center">
                                  {gift.wishlist_item?.image_url ? (
                                    <img src={gift.wishlist_item.image_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-lg">{gift.wishlist_item?.emoji || '🎁'}</span>
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    {gift.wishlist_item?.name || 'Gift'}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    to {gift.creator.display_name || gift.creator.handle} · {new Date(gift.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-foreground">
                                  ${(gift.amount_cents / 100).toFixed(2)}
                                </p>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[gift.status] || 'bg-gray-500/20 text-gray-400'}`}>
                                  {gift.status}
                                </span>
                              </div>
                            </div>
                            {gift.message && (
                              <p className="text-xs text-muted-foreground mt-3 pl-[52px] italic">"{gift.message}"</p>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ── MESSAGES TAB ── */}
            {!isLoading && activeTab === 'messages' && (
              <motion.div
                key="messages"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="flex gap-0 h-[calc(100vh-12rem)] rounded-none md:rounded-2xl border-0 md:border border-border/60 md:shadow-[0_0_40px_-12px_rgba(0,0,0,0.3)] overflow-hidden"
              >
                {/* Liste des conversations */}
                <div className={`flex flex-col border-r border-border/60 bg-card w-full md:w-72 flex-shrink-0 ${
                  showMobileConvList ? 'flex' : 'hidden md:flex'
                }`}>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {isLoadingConversations && (
                      <div className="flex justify-center py-8">
                        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      </div>
                    )}
                    {!isLoadingConversations && fanConversations.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
                        <MessagesSquare className="w-8 h-8 text-muted-foreground/20" />
                        <p className="text-xs text-muted-foreground/60">Aucune conversation encore</p>
                      </div>
                    )}
                    {!isLoadingConversations && fanConversations.map((conv) => {
                      const profile = conv.fan;
                      const name = profile?.display_name || 'Creator';
                      return (
                        <button
                          key={conv.id}
                          type="button"
                          onClick={() => { setSelectedFanConversation(conv); setShowMobileConvList(false); }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                            selectedFanConversation?.id === conv.id
                              ? 'bg-primary/10 border border-primary/20'
                              : 'hover:bg-muted/60 border border-transparent'
                          }`}
                        >
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-muted border border-border flex-shrink-0">
                            {profile?.avatar_url
                              ? <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">{name.charAt(0)}</div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{name}</p>
                            <p className="text-xs text-muted-foreground/60 truncate">
                              {conv.last_message_preview || 'Début de la conversation'}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fenêtre de chat */}
                <div className={`flex-1 overflow-hidden ${
                  !showMobileConvList ? 'flex flex-col' : 'hidden md:flex md:flex-col'
                }`}>
                  {selectedFanConversation && userId ? (
                    <>
                      <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-border/60">
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 px-2" onClick={() => setShowMobileConvList(true)}>
                          <ArrowLeft className="w-3.5 h-3.5" />
                          Retour
                        </Button>
                      </div>
                      <ChatWindow
                        conversation={selectedFanConversation}
                        currentUserId={userId}
                        senderType="fan"
                      />
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
                      <MessagesSquare className="w-8 h-8 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground/50">Sélectionne une conversation</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── REQUESTS TAB ── */}
            {!isLoading && activeTab === 'requests' && (
              <motion.div
                key="requests"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-foreground">Custom requests</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Track your requests to creators</p>
                </div>

                {requests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                      <MessageSquare className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No custom requests yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map((req, i) => (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="rounded-2xl border border-exclu-arsenic/60 bg-card p-4 hover:border-exclu-arsenic/80 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-exclu-ink flex-shrink-0">
                              {req.creator.avatar_url ? (
                                <img src={req.creator.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/40 text-xs font-bold">
                                  {(req.creator.display_name || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {req.creator.display_name || req.creator.handle}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-foreground">
                              ${((req.final_amount_cents || req.proposed_amount_cents) / 100).toFixed(2)}
                            </p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[req.status] || 'bg-gray-500/20 text-gray-400'}`}>
                              {req.status}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{req.description}</p>
                        {req.creator_response && (
                          <div className="mt-3 pl-3 border-l-2 border-primary/30 bg-primary/5 rounded-r-lg py-2 pr-2">
                            <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Creator's response</p>
                            <p className="text-xs text-foreground italic">{req.creator_response}</p>
                          </div>
                        )}

                        {/* Unlock button: visible when delivered/accepted + delivery link exists */}
                        {(req.status === 'delivered' || req.status === 'accepted') && req.delivery_link_id && req.delivery_link_slug && req.creator.handle && (
                          <div className="mt-3">
                            <Button
                              type="button"
                              size="sm"
                              className="w-full rounded-xl gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs"
                              onClick={() => navigate(`/${req.creator.handle}/links/${req.delivery_link_slug}`)}
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              Unlock content
                            </Button>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── SETTINGS TAB ── */}
            {!isLoading && activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-foreground">Settings</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Manage your fan account</p>
                </div>

                {/* Profile card */}
                <div className="rounded-2xl border border-border/60 bg-card p-5 flex items-center gap-4">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFanAvatarUpload}
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="relative w-16 h-16 rounded-2xl overflow-hidden border border-border/60 bg-muted flex-shrink-0 group cursor-pointer"
                  >
                    {fanAvatarUrl ? (
                      <img src={fanAvatarUrl} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-7 h-7 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                    {isUploadingAvatar && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      </div>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground truncate">
                      {fanDisplayName || userEmail?.split('@')[0] || 'Fan'}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">{userEmail}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">Click photo to change</p>
                  </div>
                </div>

                {/* Theme toggle */}
                <div className="rounded-2xl border border-border/60 bg-card p-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Appearance</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{resolvedTheme === 'dark' ? 'Dark mode' : 'Light mode'}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-border/60 gap-2"
                    onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                  >
                    {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
                  </Button>
                </div>

                {/* Sign out */}
                <div className="rounded-2xl border border-border/60 bg-card p-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Sign out</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Log out of your fan account</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-border/60 gap-2"
                    onClick={handleSignOut}
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </Button>
                </div>

                {/* Danger zone */}
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-red-400">Danger zone</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Permanently delete your account and all associated data. This cannot be undone.
                    </p>
                  </div>
                  {!showDeleteConfirm ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Delete my account
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-red-400 font-medium">
                        Are you sure? This action is irreversible.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
                          onClick={handleDeleteAccount}
                        >
                          Yes, delete
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl border-border/60"
                          onClick={() => setShowDeleteConfirm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Custom Request modal triggered from favorites */}
          <AnimatePresence>
            {requestCreator && (
              <RequestCreatorModal
                creatorId={requestCreator.creator_id}
                onClose={() => setRequestCreator(null)}
              />
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default FanDashboard;
