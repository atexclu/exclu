import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Sparkles, Check, Download, Mail, ArrowUpRight } from 'lucide-react';
import PixelCard from '@/components/PixelCard';
import Aurora from '@/components/ui/Aurora';
import { getAuroraGradient } from '@/lib/auroraGradients';
import CircularText from '@/components/CircularText';

interface PublicLinkData {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
}

interface ContentItem {
  id: string;
  type: 'image' | 'video';
  previewUrl?: string;
  storagePath?: string;
}

interface CreatorProfileData {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  theme_color: string | null;
  aurora_gradient?: string | null;
  bio?: string | null;
}

// Map theme colors to pixel colors for PixelCard
const getPixelColorsFromTheme = (themeColor: string): string => {
  const pixelColorMap: Record<string, string> = {
    pink: '#fecdd3,#fda4af,#e11d48',
    purple: '#e9d5ff,#d8b4fe,#a855f7',
    blue: '#bfdbfe,#93c5fd,#3b82f6',
    orange: '#fed7aa,#fdba74,#f97316',
    green: '#bbf7d0,#86efac,#22c55e',
    red: '#fecaca,#fca5a5,#ef4444',
  };
  return pixelColorMap[themeColor] || pixelColorMap.pink;
};

const themeColors: Record<string, { gradient: string; glow: string }> = {
  pink: {
    gradient: 'from-pink-500/40 via-rose-500/30 to-purple-500/40',
    glow: 'bg-pink-500/40',
  },
  purple: {
    gradient: 'from-purple-500/40 via-violet-500/30 to-fuchsia-500/40',
    glow: 'bg-purple-500/40',
  },
  blue: {
    gradient: 'from-sky-500/40 via-cyan-500/30 to-blue-500/40',
    glow: 'bg-sky-500/40',
  },
  orange: {
    gradient: 'from-orange-500/40 via-amber-500/30 to-pink-500/40',
    glow: 'bg-orange-400/40',
  },
  green: {
    gradient: 'from-emerald-500/40 via-lime-500/30 to-teal-500/40',
    glow: 'bg-emerald-400/40',
  },
  red: {
    gradient: 'from-rose-500/40 via-red-500/30 to-orange-500/40',
    glow: 'bg-rose-500/40',
  },
};

const PublicLink = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  
  const [link, setLink] = useState<PublicLinkData | null>(null);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockedContent, setUnlockedContent] = useState<ContentItem[]>([]);
  const [creator, setCreator] = useState<CreatorProfileData | null>(null);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    
    const fetchLink = async () => {
      if (!slug) return;
      setIsLoading(true);
      setError(null);

      try {
        const { data, error } = await supabase
          .from('links')
          .select('id, title, description, price_cents, currency, status, storage_path, creator_id, click_count')
          .eq('slug', slug)
          .eq('status', 'published')
          .abortSignal(abortController.signal)
          .single();

      if (error || !data) {
        console.error('Error loading public link', error);
        setError('This link is not available or no longer exists.');
        setLink(null);
        setIsLoading(false);
        return;
      }

      setLink({
        id: data.id,
        title: data.title,
        description: data.description,
        price_cents: data.price_cents,
        currency: data.currency,
      });

      // Increment click count (best-effort) via Edge Function to bypass RLS safely
      if (slug) {
        supabase.functions
          .invoke('increment-link-click', { body: { slug } })
          .catch((err) => {
            console.error('Error incrementing click count', err);
          });
      }

      if (data.creator_id) {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('id, display_name, handle, avatar_url, theme_color, aurora_gradient, bio')
          .eq('id', data.creator_id)
          .abortSignal(abortController.signal)
          .maybeSingle();
        if (creatorProfile) {
          setCreator(creatorProfile as CreatorProfileData);
        }
      }

      // Check if user has purchased this link (via session_id in URL)
      let hasPurchased = false;
      if (sessionId) {
        const { data: purchase } = await supabase
          .from('purchases')
          .select('id, access_expires_at')
          .eq('link_id', data.id)
          .eq('stripe_session_id', sessionId)
          .abortSignal(abortController.signal)
          .single();

        if (purchase) {
          hasPurchased = true;
          setIsUnlocked(true);
          setAccessExpiresAt((purchase as any).access_expires_at ?? null);
        }
      }

      // Fetch attached media from link_media
      const { data: linkMedia } = await supabase
        .from('link_media')
        .select('asset_id, assets(storage_path, mime_type)')
        .eq('link_id', data.id)
        .abortSignal(abortController.signal)
        .order('position', { ascending: true });

      const items: ContentItem[] = [];
      const unlocked: ContentItem[] = [];

      // Add main content if exists
      if (data.storage_path) {
        const ext = data.storage_path.split('.').pop()?.toLowerCase() ?? '';
        const isVideo = ['mp4', 'mov', 'webm', 'mkv'].includes(ext);
        const item: ContentItem = { id: 'main', type: isVideo ? 'video' : 'image', storagePath: data.storage_path };
        items.push(item);
        
        if (hasPurchased) {
          // Generate signed URL for unlocked content
          const { data: signed } = await supabase.storage
            .from('paid-content')
            .createSignedUrl(data.storage_path, 60 * 60);
          unlocked.push({ ...item, previewUrl: signed?.signedUrl });
        }
      }

      // Add linked assets
      if (linkMedia && linkMedia.length > 0) {
        for (const lm of linkMedia) {
          const asset = (lm as any).assets;
          const mimeType = asset?.mime_type || '';
          const storagePath = asset?.storage_path;
          const item: ContentItem = {
            id: lm.asset_id || `asset-${items.length}`,
            type: mimeType.startsWith('video/') ? 'video' : 'image',
            storagePath,
          };
          items.push(item);
          
          if (hasPurchased && storagePath) {
            const { data: signed } = await supabase.storage
              .from('paid-content')
              .createSignedUrl(storagePath, 60 * 60);
            unlocked.push({ ...item, previewUrl: signed?.signedUrl });
          }
        }
      }

      // If no content, show at least one placeholder card
      if (items.length === 0) {
        items.push({ id: 'placeholder', type: 'image' });
      }

      setContentItems(items);
      setUnlockedContent(unlocked);
      setIsLoading(false);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('Request was aborted');
        } else {
          console.error('Error in fetchLink:', err);
        }
      }
    };

    fetchLink();
    
    return () => {
      abortController.abort();
    };
  }, [slug, sessionId]);

  const handleUnlockClick = async () => {
    if (!slug || !link) return;

    setIsUnlocking(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-link-checkout-session', {
        body: { slug, buyerEmail: buyerEmail || null },
      });

      if (error) {
        console.error('Error invoking create-link-checkout-session', error);
        throw new Error('Unable to start checkout. Please try again.');
      }

      const url = (data as any)?.url as string | undefined;
      if (!url) {
        throw new Error('Checkout link is not available right now.');
      }

      window.location.href = url;
    } catch (err: any) {
      console.error('Error during unlock checkout', err);
      toast.error(err?.message || 'Unable to start checkout at the moment.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const priceLabel = link
    ? `$${(link.price_cents / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : '';

  const themeKey = creator?.theme_color || 'pink';
  const theme = themeColors[themeKey] || themeColors.pink;

  const expiresDate = accessExpiresAt ? new Date(accessExpiresAt) : null;
  const hasTemporaryAccess = !!expiresDate;

  return (
    <div className="min-h-screen bg-black text-foreground flex flex-col relative overflow-x-hidden">
      {/* Aurora animated background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Aurora
          colorStops={getAuroraGradient(creator?.aurora_gradient || creator?.theme_color || 'aurora').colors}
          blend={0.5}
          amplitude={1.0}
          speed={1}
        />
      </div>

      {/* Custom CSS for animations */}
      <style>{`
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); }
          33% { transform: translateY(-10px) translateX(5px); }
          66% { transform: translateY(5px) translateX(-5px); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-gradient-shift {
          animation: gradient-shift 8s ease infinite;
        }
      `}</style>

      <main className="flex-1 flex flex-col relative z-10">
        <div className="px-4 sm:px-6 lg:px-8 pt-16 pb-24 max-w-7xl mx-auto w-full">
          {/* LOCKED STATE - New Grid Layout */}
          {!isLoading && link && !isUnlocked && contentItems.length > 0 && contentItems[0].storagePath && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
              {/* LEFT: Card with Effects */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="flex items-center justify-center lg:sticky lg:top-24 lg:self-start"
              >
                <div className="relative w-full max-w-[400px] h-[600px]">
                  {/* Black background - z-0 (behind everything) */}
                  <div className="absolute inset-0 bg-black rounded-3xl z-0" />
                  
                  {/* PixelCard with canvas - z-10 (middle layer) */}
                  <div className="absolute inset-0 z-10">
                    <PixelCard 
                      variant="default" 
                      className="w-full h-full"
                      colors={getPixelColorsFromTheme(creator?.theme_color || 'pink')}
                      speed={80}
                      gap={6}
                    >
                      <div />
                    </PixelCard>
                  </div>
                  
                  {/* Title and Description - z-15 (below lock bubble) */}
                  <div className="absolute bottom-0 left-0 right-0 z-15 p-6 pb-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.4 }}
                      className="space-y-3"
                    >
                      <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                        {link?.title || 'Exclusive Content'}
                      </h1>
                      {link?.description && (
                        <p className="text-sm sm:text-base text-white/90 drop-shadow-md leading-relaxed">
                          {link.description}
                        </p>
                      )}
                    </motion.div>
                  </div>
                  
                  {/* Centered lock bubble with circular text - z-20 (on top of everything) */}
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ 
                        duration: 0.5, 
                        delay: 0.3,
                        type: "spring",
                        stiffness: 200,
                        damping: 15
                      }}
                      className="relative"
                    >
                      {/* Circular Text Animation */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <CircularText
                          text="EXCLUSIVE CONTENT • UNLOCK NOW • "
                          spinDuration={15}
                          onHover="speedUp"
                          className="w-48 h-48"
                        />
                      </div>
                      
                      {/* Glow effect */}
                      <div className={`absolute inset-0 rounded-full bg-gradient-to-r ${theme.gradient} blur-2xl opacity-60 animate-pulse`} />
                      
                      {/* Lock bubble */}
                      <div className="relative w-20 h-20 rounded-full border-2 border-white/30 backdrop-blur-xl bg-black/30 flex items-center justify-center shadow-2xl z-10">
                        <Lock className="w-10 h-10 text-white" strokeWidth={1.5} />
                      </div>
                    </motion.div>
                  </div>
                </div>
              </motion.div>

              {/* RIGHT: Two Stacked Cards */}
              <div className="flex flex-col gap-6">
                {/* TOP RIGHT: Creator Profile */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                  className="relative overflow-hidden rounded-3xl border border-white/20 bg-black p-6 sm:p-8"
                >
                  <div className="space-y-6">
                    {/* Creator Profile Section */}
                    {creator && (
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 sm:w-20 sm:h-20 overflow-hidden rounded-2xl border-2 border-white/20 bg-exclu-ink/80 shadow-xl">
                          <div className={`pointer-events-none absolute -inset-2 ${theme.glow} blur-2xl opacity-30`} />
                          <div className="relative z-10 w-full h-full flex items-center justify-center">
                            {creator.avatar_url ? (
                              <img
                                src={creator.avatar_url}
                                alt={creator.display_name || creator.handle || 'Creator'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-2xl font-bold text-white/80">
                                {(creator.display_name || creator.handle || 'C').charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                            {creator.display_name || creator.handle}
                          </h2>
                          {creator?.bio && (
                            <p className="text-sm text-white/70 mt-1 leading-relaxed">
                              {creator.bio}
                            </p>
                          )}
                        </div>

                        {creator.handle && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-full border-white/20 bg-black/40 hover:bg-white/10 text-white text-xs h-9 px-4 flex items-center gap-2 transition-all hover:scale-105"
                            onClick={() => {
                              window.location.href = `/${creator.handle}`;
                            }}
                          >
                            <span>Profile</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    )}

                    {error && !isLoading && (
                      <p className="text-sm text-red-400">{error}</p>
                    )}
                  </div>
                </motion.div>

                {/* BOTTOM RIGHT: Unlock CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.4 }}
                  className="relative overflow-hidden rounded-3xl border border-white/20 bg-black p-6 sm:p-8"
                >
                  <div>
                    <div className="space-y-6">
                      {/* Price Section */}
                      <div className="text-center">
                        <p className="text-xs text-white/60 mb-2 uppercase tracking-wider font-medium">
                          {contentItems.length} {contentItems.length === 1 ? 'item' : 'items'} to unlock
                        </p>
                        <motion.p
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.5, delay: 0.6 }}
                          className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight"
                        >
                          {priceLabel}
                        </motion.p>
                      </div>

                      {/* Unlock Button */}
                      <Button
                        variant="hero"
                        size="lg"
                        style={{
                          background: getAuroraGradient(creator?.aurora_gradient || creator?.theme_color || 'aurora').preview
                        }}
                        className="w-full rounded-2xl py-6 text-base font-bold shadow-2xl transition-all hover:scale-[1.02] active:scale-[0.98] hover:opacity-90"
                        disabled={isUnlocking}
                        onClick={handleUnlockClick}
                      >
                        {isUnlocking ? (
                          <span className="flex items-center justify-center gap-3">
                            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Processing…</span>
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-3">
                            <Lock className="w-5 h-5" />
                            <span>Unlock for {priceLabel}</span>
                          </span>
                        )}
                      </Button>

                      {/* Email Input */}
                      <div className="space-y-3">
                        <p className="text-xs text-white/60">
                          Optional: enter your email to receive a copy of the content link
                        </p>
                        <Input
                          type="email"
                          value={buyerEmail}
                          onChange={(e) => setBuyerEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="h-11 bg-black/40 border-white/20 text-white placeholder:text-white/50 text-sm rounded-xl focus:ring-2 focus:ring-primary/50 transition-all"
                        />
                      </div>

                      {/* Info Text */}
                      <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-[10px] sm:text-[11px] text-white/80">
                        <span className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-green-400" />
                          No account required
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-green-400" />
                          Instant access
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-green-400" />
                          Email copy (optional)
                        </span>
                      </div>

                      {/* Exclu Branding */}
                      <div className="pt-6 border-t border-white/10">
                        <a 
                          href="https://exclu.at" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-3 text-white/60 hover:text-white/90 transition-colors group"
                        >
                          <img 
                            src="/Logo white.png" 
                            alt="Exclu" 
                            className="h-5 w-auto opacity-60 group-hover:opacity-90 transition-opacity"
                          />
                        </a>
                        <p className="text-center text-[10px] text-white/40 mt-2 leading-relaxed">
                          Start selling your own premium content without commission with Exclu.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          )}

          {/* UNLOCKED STATE - Modern Layout */}
          {!isLoading && link && isUnlocked && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
              {/* LEFT: Unlocked Content */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="relative overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-exclu-ink/90 via-exclu-phantom/30 to-exclu-ink/90 backdrop-blur-xl p-6"
              >
                {/* Success indicator */}
                <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/40">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-medium text-green-400">Unlocked</span>
                </div>

                {unlockedContent.length > 0 ? (
                  <div className="space-y-4">
                    {unlockedContent.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-exclu-arsenic/60"
                      >
                        {item.type === 'video' ? (
                          <video
                            controls
                            className="w-full h-full object-contain bg-black"
                            src={item.previewUrl}
                          />
                        ) : (
                          <img
                            src={item.previewUrl}
                            alt={link.title}
                            className="w-full h-full object-contain bg-black"
                          />
                        )}
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-exclu-space/70 text-center py-12">
                    This content has been unlocked, but no media is attached yet.
                  </p>
                )}
              </motion.div>

              {/* RIGHT: Success Info */}
              <div className="flex flex-col gap-6">
                {/* Creator Profile Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
                  className="relative overflow-hidden rounded-3xl border border-exclu-arsenic/60 bg-gradient-to-br from-exclu-ink/90 via-exclu-phantom/30 to-exclu-ink/90 backdrop-blur-xl p-6 sm:p-8"
                >
                  <div className="pointer-events-none absolute inset-0 opacity-30">
                    <div className={`absolute -inset-x-24 -top-32 h-56 bg-gradient-to-r ${theme.gradient} blur-3xl animate-gradient-shift`} />
                  </div>

                  <div className="relative space-y-6">
                    {creator && (
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 sm:w-20 sm:h-20 overflow-hidden rounded-2xl border-2 border-white/20 bg-exclu-ink/80 shadow-xl">
                          <div className={`pointer-events-none absolute -inset-2 ${theme.glow} blur-2xl opacity-30`} />
                          <div className="relative z-10 w-full h-full flex items-center justify-center">
                            {creator.avatar_url ? (
                              <img
                                src={creator.avatar_url}
                                alt={creator.display_name || creator.handle || 'Creator'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-2xl font-bold text-white/80">
                                {(creator.display_name || creator.handle || 'C').charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <h2 className="text-lg sm:text-xl font-bold text-exclu-cloud truncate">
                            {creator.display_name || creator.handle}
                          </h2>
                          {creator.handle && (
                            <p className="text-sm text-exclu-space/70">@{creator.handle}</p>
                          )}
                        </div>

                        {creator.handle && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-full border-exclu-arsenic/60 bg-black/40 hover:bg-black/60 text-xs h-9 px-4 flex items-center gap-2 transition-all hover:scale-105"
                            onClick={() => {
                              window.location.href = `/${creator.handle}`;
                            }}
                          >
                            <span>Profile</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="h-px bg-gradient-to-r from-transparent via-exclu-arsenic/40 to-transparent" />

                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/40">
                        <Check className="w-3.5 h-3.5 text-green-400" />
                        <span className="text-[11px] font-medium text-green-400">
                          Purchase Confirmed
                        </span>
                      </div>

                      <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud tracking-tight leading-tight">
                        {link.title}
                      </h1>
                    </div>

                    {link.description && (
                      <p className="text-exclu-space/80 text-sm sm:text-base leading-relaxed">
                        {link.description}
                      </p>
                    )}
                  </div>
                </motion.div>

                {/* Download & Info Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.4 }}
                  className="relative overflow-hidden rounded-3xl border border-exclu-arsenic/60 bg-gradient-to-br from-exclu-ink/90 via-exclu-phantom/30 to-exclu-ink/90 backdrop-blur-xl p-6 sm:p-8"
                >
                  <div className="space-y-4">
                    {unlockedContent.length > 0 && unlockedContent[0].previewUrl && (
                      <>
                        <Button
                          variant="hero"
                          size="lg"
                          className="w-full rounded-2xl py-6 text-base font-bold shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = unlockedContent[0].previewUrl!;
                            link.download = '';
                            link.click();
                          }}
                        >
                          <span className="flex items-center justify-center gap-3">
                            <Download className="w-5 h-5" />
                            <span>Download Content</span>
                          </span>
                        </Button>

                        <p className="text-xs text-exclu-space/70 text-center">
                          Your purchase has been confirmed. The content is now unlocked on this device.
                        </p>
                      </>
                    )}

                    {hasTemporaryAccess && expiresDate && (
                      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <p className="text-xs text-amber-300/90 text-center">
                          ⏰ Temporary access expires on{' '}
                          <span className="font-semibold">
                            {expiresDate.toLocaleString()}
                          </span>
                        </p>
                      </div>
                    )}

                    <div className="pt-4 border-t border-exclu-arsenic/30 space-y-2 text-[11px] text-exclu-space/60">
                      <p>✓ Right-click or long-press to save media</p>
                      <p>✓ Email copy sent (if provided)</p>
                      <p>✓ Access link saved to this device</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PublicLink;
