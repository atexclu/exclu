import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Lock, ArrowUpRight, Image as ImageIcon, Globe, X, Play, MapPin } from 'lucide-react';
import logo from '@/assets/logo-white.svg';
import Aurora from '@/components/ui/Aurora';
import SplitText from '@/components/ui/SplitText';
import { getAuroraGradient } from '@/lib/auroraGradients';
import {
  SiX,
  SiInstagram,
  SiTiktok,
  SiTelegram,
  SiOnlyfans,
  SiYoutube,
  SiSnapchat,
  SiLinktree,
} from 'react-icons/si';

interface CreatorProfileData {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  handle: string | null;
  location: string | null;
  theme_color: string | null;
  aurora_gradient?: string | null;
  social_links: Record<string, string> | null;
  is_creator_subscribed?: boolean | null;
  show_join_banner?: boolean | null;
  exclusive_content_text?: string | null;
  exclusive_content_link_id?: string | null;
  exclusive_content_url?: string | null;
  exclusive_content_image_url?: string | null;
}

interface CreatorLinkCard {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  slug: string;
}

// Theme color configurations
const themeColors: Record<string, { gradient: string; button: string; ring: string; bg: string; stops: [string, string] }> = {
  pink: {
    gradient: 'from-pink-500 to-rose-500',
    button: 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600',
    ring: 'ring-pink-500/50',
    bg: 'rgba(236, 72, 153, 0.9)',
    stops: ['#ec4899', '#f43f5e'],
  },
  purple: {
    gradient: 'from-purple-500 to-violet-500',
    button: 'bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600',
    ring: 'ring-purple-500/50',
    bg: 'rgba(139, 92, 246, 0.9)',
    stops: ['#a855f7', '#8b5cf6'],
  },
  blue: {
    gradient: 'from-blue-500 to-cyan-500',
    button: 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600',
    ring: 'ring-blue-500/50',
    bg: 'rgba(59, 130, 246, 0.9)',
    stops: ['#3b82f6', '#06b6d4'],
  },
  orange: {
    gradient: 'from-orange-500 to-amber-500',
    button: 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600',
    ring: 'ring-orange-500/50',
    bg: 'rgba(249, 115, 22, 0.9)',
    stops: ['#f97316', '#f59e0b'],
  },
  green: {
    gradient: 'from-green-500 to-emerald-500',
    button: 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600',
    ring: 'ring-green-500/50',
    bg: 'rgba(34, 197, 94, 0.9)',
    stops: ['#22c55e', '#10b981'],
  },
  red: {
    gradient: 'from-red-500 to-rose-600',
    button: 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700',
    ring: 'ring-red-500/50',
    bg: 'rgba(239, 68, 68, 0.9)',
    stops: ['#ef4444', '#e11d48'],
  },
};

// Social platform configurations using real brand icons (monochrome)
const socialPlatforms: Record<string, { label: string; icon: JSX.Element }> = {
  twitter: { label: 'X (Twitter)', icon: <SiX className="w-4 h-4" /> },
  instagram: { label: 'Instagram', icon: <SiInstagram className="w-4 h-4" /> },
  tiktok: { label: 'TikTok', icon: <SiTiktok className="w-4 h-4" /> },
  telegram: { label: 'Telegram', icon: <SiTelegram className="w-4 h-4" /> },
  onlyfans: { label: 'OnlyFans', icon: <SiOnlyfans className="w-4 h-4" /> },
  youtube: { label: 'YouTube', icon: <SiYoutube className="w-4 h-4" /> },
  snapchat: { label: 'Snapchat', icon: <SiSnapchat className="w-4 h-4" /> },
  linktree: { label: 'Linktree', icon: <SiLinktree className="w-4 h-4" /> },
  website: { label: 'Website', icon: <Globe className="w-4 h-4" /> },
};

const CreatorPublic = () => {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<CreatorProfileData | null>(null);
  const [links, setLinks] = useState<CreatorLinkCard[]>([]);
  const [publicContent, setPublicContent] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'links' | 'content'>('links');
  const [selectedContent, setSelectedContent] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const fetchCreator = async () => {
      if (!handle) return;
      setIsLoading(true);
      setError(null);

      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, bio, handle, location, is_creator, theme_color, aurora_gradient, social_links, is_creator_subscribed, show_join_banner, stripe_connect_status, exclusive_content_text, exclusive_content_link_id, exclusive_content_url, exclusive_content_image_url')
          .eq('handle', handle)
          .maybeSingle();

        if (!isMounted) return;

        if (profileError || !profileData) {
          console.error('Error loading creator profile', profileError);
          setError('This creator profile is not available.');
          setProfile(null);
          setLinks([]);
          setIsLoading(false);
          return;
        }

      // Load paid links - only show if creator has Stripe fully connected
      const isStripeComplete = profileData.stripe_connect_status === 'complete';
      
        if (isStripeComplete) {
          const { data: linksData, error: linksError } = await supabase
            .from('links')
            .select('id, title, description, price_cents, currency, slug, status, show_on_profile')
            .eq('creator_id', profileData.id)
            .eq('status', 'published')
            .eq('show_on_profile', true)
            .order('created_at', { ascending: false });

          if (!isMounted) return;

          if (linksError) {
            console.error('Error loading creator links', linksError);
            setError('Unable to load this creator content right now.');
            setLinks([]);
          } else {
            setLinks((linksData ?? []) as CreatorLinkCard[]);
          }
        } else {
        // Creator hasn't completed Stripe setup - don't show paid links
        setLinks([]);
      }

        // Load public content from assets table
        const { data: publicData, error: publicError } = await supabase
          .from('assets')
          .select('id, title, storage_path, mime_type')
          .eq('creator_id', profileData.id)
          .eq('is_public', true)
          .order('created_at', { ascending: false });

        if (!isMounted) return;

        if (!publicError && publicData) {
          // Generate signed URLs
          const withUrls = await Promise.all(
            publicData.map(async (item) => {
              if (!item.storage_path) return { ...item, previewUrl: null };
              const { data: signed } = await supabase.storage
                .from('paid-content')
                .createSignedUrl(item.storage_path, 60 * 60);
              return { ...item, previewUrl: signed?.signedUrl || null };
            })
          );
          
          if (!isMounted) return;
          setPublicContent(withUrls);
        }

        setProfile(profileData as unknown as CreatorProfileData);

        // Increment profile view count (best-effort) via Edge Function
        if (profileData.handle) {
          supabase.functions
            .invoke('increment-profile-view', { body: { handle: profileData.handle } })
            .catch(() => {
              // Silently fail - this is a best-effort metric
            });
        }

        setIsLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Error in fetchCreator:', err);
        setError('Unable to load this creator profile.');
        setIsLoading(false);
      }
    };

    fetchCreator();
    
    return () => {
      isMounted = false;
    };
  }, [handle]);

  const handleLinkClick = (link: CreatorLinkCard) => {
    navigate(`/l/${link.slug}`);
  };

  const handleSocialClick = (url: string) => {
    if (!url) return;
    // On mobile, navigate directly so the OS can intercept and open the native app (deep link).
    // window.open with _blank can prevent deep linking on some mobile browsers.
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const displayName = profile?.display_name || profile?.handle || handle || 'Creator';
  const themeColor = profile?.theme_color || 'pink';
  const theme = themeColors[themeColor] || themeColors.pink;
  const socialLinks = profile?.social_links || {};
  const activeSocials = Object.entries(socialLinks).filter(([_, url]) => url && url.trim() !== '');
  const isPremium = profile?.is_creator_subscribed === true;
  const shouldShowJoinBanner = !isPremium || (isPremium && profile?.show_join_banner !== false);

  const getSocialGradient = (platform: string) => {
    switch (platform) {
      case 'telegram':
        return 'from-sky-500 to-cyan-500';
      case 'twitter':
        return 'from-slate-900 to-slate-700';
      case 'tiktok':
        return 'from-[#ff0050] to-[#00f2ea]';
      case 'onlyfans':
        return 'from-sky-500 to-cyan-400';
      case 'fansly':
        return 'from-sky-500 to-blue-600';
      case 'instagram':
        return 'from-[#f97316] to-[#ec4899]';
      case 'youtube':
        return 'from-red-500 to-red-700';
      case 'snapchat':
        return 'from-yellow-300 to-yellow-500';
      case 'linktree':
        return 'from-emerald-400 to-emerald-600';
      default:
        return 'from-exclu-ink to-exclu-phantom';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-exclu-ink to-black text-white flex flex-col relative overflow-x-hidden">
      {/* Desktop: Aurora animated background from top */}
      <div className="hidden sm:block fixed inset-0 z-0 pointer-events-none">
        <Aurora
          colorStops={getAuroraGradient(profile?.aurora_gradient || 'purple_dream').colors}
          blend={0.5}
          amplitude={1.0}
          speed={1}
        />
      </div>

      {/* Mobile: Aurora animated background from bottom of profile photo */}
      <div className="sm:hidden absolute inset-x-0 top-[55vh] h-[120vh] z-0 pointer-events-none">
        <Aurora
          colorStops={getAuroraGradient(profile?.aurora_gradient || 'purple_dream').colors}
          blend={0.5}
          amplitude={1.0}
          speed={1}
        />
      </div>

      {/* Mobile: Hero image header */}
      <motion.div
        className="sm:hidden relative -mx-4 overflow-hidden z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {profile?.avatar_url && (
          <>
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="w-full h-auto max-h-[70vh] object-cover"
            />
            {/* Soft dark overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/80" />
            {/* Name overlay */}
            <div className="absolute inset-x-5 bottom-6 flex flex-col items-center text-center">
              <div className="flex items-center gap-1.5">
                <h1 className="text-2xl font-extrabold text-white drop-shadow-[0_6px_18px_rgba(0,0,0,0.9)]">
                  {displayName}
                </h1>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0 drop-shadow-lg">
                  <defs><linearGradient id="badge-grad-m" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={theme.stops[0]} /><stop offset="100%" stopColor={theme.stops[1]} /></linearGradient></defs>
                  <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="url(#badge-grad-m)" stroke="url(#badge-grad-m)" />
                  <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2" fill="none" />
                </svg>
              </div>
            </div>
          </>
        )}
      </motion.div>

      <main className="relative z-10 flex-1 flex flex-col px-4 pt-10 pb-24 sm:pt-12 sm:pb-10">
        {/* Inner shadow at top - mobile: black to transparent over 150px */}
        <div className="sm:hidden absolute inset-x-0 top-0 h-[150px] bg-gradient-to-b from-black to-transparent pointer-events-none z-20" />
        {/* Inner shadow at top - desktop */}
        <div className="hidden sm:block absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none z-20" />
        <div className="max-w-md mx-auto w-full flex flex-col flex-1">
          {/* Profile Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-center mb-6"
          >
            {/* Avatar - smaller on mobile since it's in background */}
            <div className="relative inline-block mb-6 hidden sm:inline-block">
              <motion.div
                className="absolute inset-0 rounded-3xl bg-black/40 blur-xl opacity-40 scale-110"
                initial={{ opacity: 0.2, scale: 1 }}
                animate={{ opacity: [0.2, 0.45, 0.25], scale: [1, 1.03, 0.98] }}
                transition={{ duration: 20, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
              />
              <div
                className="relative max-w-[220px] md:max-w-[260px] rounded-3xl overflow-hidden border-2 border-white/30 ring-4 ring-black/20"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="w-full h-auto block"
                  />
                ) : (
                  <div className="w-full h-full bg-exclu-ink flex items-center justify-center">
                    <span className="text-3xl font-bold text-white/80">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Name & Handle */}
            <div className="hidden sm:flex items-center justify-center gap-2 mb-1">
              <SplitText
                text={displayName}
                className="text-2xl sm:text-3xl font-extrabold text-white drop-shadow-lg"
                delay={50}
                duration={1.25}
                ease="power3.out"
                splitType="chars"
                from={{ opacity: 0, y: 40 }}
                to={{ opacity: 1, y: 0 }}
                threshold={0.1}
                rootMargin="-100px"
                textAlign="center"
                tag="h1"
              />
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 flex-shrink-0 drop-shadow-lg">
                <defs><linearGradient id="badge-grad-d" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={theme.stops[0]} /><stop offset="100%" stopColor={theme.stops[1]} /></linearGradient></defs>
                <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="url(#badge-grad-d)" stroke="url(#badge-grad-d)" />
                <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2" fill="none" />
              </svg>
            </div>
            {profile?.location && (
              <p className="text-xs text-white/80 mt-4 mb-2 drop-shadow flex items-center justify-center gap-1">
                <MapPin className="w-3 h-3" />
                {profile.location}
              </p>
            )}
            {profile?.bio && (
              <p className="text-sm text-white/90 max-w-xs mx-auto mb-4 drop-shadow">{profile.bio}</p>
            )}

            {/* Social Links - Story bubbles style */}
            {activeSocials.length > 0 && (
              <>
                <div className="flex justify-center gap-3 mb-4">
                  {activeSocials.map(([platform, url]) => {
                    const platformConfig = socialPlatforms[platform];
                    if (!platformConfig) return null;
                    return (
                      <motion.button
                        key={platform}
                        type="button"
                        onClick={() => handleSocialClick(url)}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-xl shadow-lg ring-2 ring-white/30 hover:ring-white/60 transition-all"
                        title={platformConfig.label}
                      >
                        <span className="text-white">{platformConfig.icon}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Tabs Links/Content */}
            {(links.length > 0 || publicContent.length > 0) && (
              <div className="relative mb-6">
                <div className="flex justify-center gap-12 relative">
                  <button
                    onClick={() => setActiveTab('links')}
                    className={`relative py-3 text-sm font-medium transition-colors ${
                      activeTab === 'links'
                        ? 'text-white'
                        : 'text-white/50 hover:text-white/70'
                    }`}
                  >
                    Links
                    {activeTab === 'links' && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-white rounded-full z-10"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('content')}
                    className={`relative py-3 text-sm font-medium transition-colors ${
                      activeTab === 'content'
                        ? 'text-white'
                        : 'text-white/50 hover:text-white/70'
                    }`}
                  >
                    Content
                    {activeTab === 'content' && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-white rounded-full z-10"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                  </button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/20" />
              </div>
            )}
          </motion.div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {isLoading && (
              <p className="text-sm text-white/60 text-center py-4">Loading content…</p>
            )}

            {/* Links Tab */}
            {!isLoading && activeTab === 'links' && (
              <>
                {/* Exclusive content button */}
                {profile?.exclusive_content_text && (profile.exclusive_content_url || profile.exclusive_content_link_id) && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (profile.exclusive_content_url) {
                        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                        if (isMobile) {
                          window.location.href = profile.exclusive_content_url;
                        } else {
                          window.open(profile.exclusive_content_url, '_blank', 'noopener,noreferrer');
                        }
                        return;
                      }
                      const targetLink = profile.exclusive_content_link_id
                        ? links.find((l) => l.id === profile.exclusive_content_link_id)
                        : links[0];
                      if (targetLink) handleLinkClick(targetLink);
                    }}
                    className={profile.exclusive_content_image_url
                      ? 'w-full rounded-2xl overflow-hidden shadow-lg transition-shadow relative'
                      : 'w-full h-14 rounded-full flex items-center justify-center gap-2 shadow-lg transition-shadow'
                    }
                    style={!profile.exclusive_content_image_url ? { background: `linear-gradient(to right, ${theme.stops[0]}, ${theme.stops[1]})` } : undefined}
                  >
                    {profile.exclusive_content_image_url ? (
                      <>
                        <img
                          src={profile.exclusive_content_image_url}
                          alt={profile.exclusive_content_text}
                          className="w-full h-44 object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                        <div className="absolute bottom-4 inset-x-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-white" />
                            <span className="text-sm font-bold text-white truncate max-w-[200px]">
                              {profile.exclusive_content_text}
                            </span>
                          </div>
                          <ArrowUpRight className="w-4 h-4 text-white/70" />
                        </div>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 text-white" />
                        <span className="text-sm font-bold text-white truncate max-w-[220px]">
                          {profile.exclusive_content_text}
                        </span>
                        <ArrowUpRight className="w-4 h-4 text-white/70" />
                      </>
                    )}
                  </motion.button>
                )}

                {/* Individual links */}
                {links.length > 0 ? (
                  links.map((link, index) => {
                    const priceLabel = `${(link.price_cents / 100).toFixed(2)} ${link.currency}`;
                    return (
                      <motion.button
                        key={link.id}
                        type="button"
                        onClick={() => handleLinkClick(link)}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 * (index + 1) }}
                        className={`w-full h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all flex items-center justify-between px-5 group`}
                      >
                        <div className="flex items-center gap-3">
                          <Lock className="w-4 h-4 text-white/60" />
                          <span className="text-white font-medium truncate max-w-[180px]">{link.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, ${theme.stops[0]}, ${theme.stops[1]})` }}>
                            {priceLabel}
                          </span>
                          <ArrowUpRight className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
                        </div>
                      </motion.button>
                    );
                  })
                ) : (
                  !(profile?.exclusive_content_text && (profile.exclusive_content_url || profile.exclusive_content_link_id)) && (
                    <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 text-sm text-white/70 text-center">
                      No exclusive content available yet.
                    </div>
                  )
                )}
              </>
            )}

            {/* Content Tab */}
            {!isLoading && activeTab === 'content' && publicContent.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {publicContent.map((content, index) => {
                    const isVideo = content.mime_type?.startsWith('video/');
                    return (
                      <motion.div
                        key={content.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: 0.05 * index }}
                        className="relative aspect-square rounded-2xl overflow-hidden bg-white/10 backdrop-blur-sm border border-white/20 group cursor-pointer"
                        onClick={() => setSelectedContent(content)}
                      >
                        {content.previewUrl ? (
                          isVideo ? (
                            <video
                              src={content.previewUrl}
                              className="w-full h-full object-cover"
                              muted
                              loop
                              playsInline
                            />
                          ) : (
                            <img
                              src={content.previewUrl}
                              alt={content.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-white/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        {isVideo && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm border border-white/20">
                              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}

            {!isLoading && activeTab === 'content' && publicContent.length === 0 && (
              <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 text-sm text-white/70 text-center">
                No public content available yet.
              </div>
            )}

            {error && !isLoading && (
              <p className="text-sm text-red-400 text-center py-4">{error}</p>
            )}
          </div>

          {/* Footer branding */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-6 text-center"
          >
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              Powered by <span className="font-semibold">Exclu</span>
            </a>
          </motion.div>
        </div>
      </main>
      {/* Exclu join banner */}
      {shouldShowJoinBanner && (
        <div className="fixed inset-x-4 bottom-4 z-30">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/85 border border-exclu-arsenic/60 px-4 py-3 backdrop-blur-md shadow-lg shadow-black/60">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <img src={logo} alt="Exclu" className="h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-white">
                  Start selling your own premium content without commission with Exclu.
                </span>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="rounded-full text-xs px-3 py-1.5 bg-white text-black hover:bg-slate-100"
              onClick={() => {
                window.location.href = '/auth?mode=signup';
              }}
            >
              Join now
            </Button>
          </div>
        </div>
      )}

      {/* Content Lightbox Modal */}
      {selectedContent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setSelectedContent(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedContent(null)}
            className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <div
            className="max-w-3xl max-h-[85vh] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedContent.mime_type?.startsWith('video/') ? (
              <video
                src={selectedContent.previewUrl}
                className="w-full max-h-[85vh] rounded-2xl"
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={selectedContent.previewUrl}
                alt={selectedContent.title}
                className="w-full max-h-[85vh] object-contain rounded-2xl"
              />
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default CreatorPublic;
