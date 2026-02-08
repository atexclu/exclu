import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Sparkles, Check, Download, Mail, ArrowUpRight, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import JSZip from 'jszip';
import PixelCard from '@/components/PixelCard';
import Aurora from '@/components/ui/Aurora';
import { getAuroraGradient } from '@/lib/auroraGradients';
import CircularText from '@/components/CircularText';

// Download a single file from a cross-origin signed URL
async function downloadFile(url: string, filename?: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || url.split('/').pop()?.split('?')[0] || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Download failed:', err);
    window.open(url, '_blank');
  }
}

// Download multiple files as a ZIP archive
async function downloadAllAsZip(items: { url: string; filename: string }[], zipName: string) {
  try {
    const zip = new JSZip();
    const fetches = items.map(async (item, idx) => {
      try {
        const res = await fetch(item.url);
        const blob = await res.blob();
        zip.file(item.filename || `file-${idx + 1}`, blob);
      } catch (err) {
        console.error('Failed to fetch for zip:', item.filename, err);
      }
    });
    await Promise.all(fetches);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const blobUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${zipName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('ZIP download failed:', err);
  }
}

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

// Poll for purchase record with exponential backoff.
// Returns the purchase row or null if not found after all retries.
const POLL_INTERVALS_MS = [1000, 2000, 4000, 8000, 16000] as const;

async function pollForPurchase(
  linkId: string,
  stripeSessionId: string,
  signal: AbortSignal,
): Promise<PurchaseData | null> {
  for (const delay of POLL_INTERVALS_MS) {
    if (signal.aborted) return null;
    await new Promise((r) => setTimeout(r, delay));
    if (signal.aborted) return null;

    const { data } = await supabase
      .from('purchases')
      .select('id, access_expires_at, amount_cents, currency, created_at, email_sent, download_count')
      .eq('link_id', linkId)
      .eq('stripe_session_id', stripeSessionId)
      .maybeSingle();

    if (data) return data as PurchaseData;
  }
  return null;
}

// Generate signed URLs via Edge Function (uses service_role_key server-side to bypass storage RLS).
async function generateSignedUrls(
  linkId: string,
  sessionId: string,
  items: ContentItem[],
): Promise<ContentItem[]> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-signed-urls', {
      body: { link_id: linkId, session_id: sessionId },
    });

    if (error || !data?.signedUrls) {
      console.error('[generateSignedUrls] Edge Function error:', error || 'no signedUrls');
      return items.map((item) => ({ ...item, previewUrl: undefined }));
    }

    const urlMap = new Map<string, { url: string | null; type: string }>();
    for (const entry of data.signedUrls) {
      urlMap.set(entry.path, { url: entry.url, type: entry.type });
    }

    return items.map((item) => {
      if (!item.storagePath) return item;
      const match = urlMap.get(item.storagePath);
      return match ? { ...item, previewUrl: match.url ?? undefined, type: match.type as 'image' | 'video' } : item;
    });
  } catch (err) {
    console.error('[generateSignedUrls] Unexpected error:', err);
    return items.map((item) => ({ ...item, previewUrl: undefined }));
  }
}

interface PurchaseData {
  id: string;
  access_expires_at: string | null;
  amount_cents: number;
  currency: string;
  created_at: string;
  email_sent: boolean;
  download_count: number;
}

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
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [paymentNotFound, setPaymentNotFound] = useState(false);
  const [unlockedContent, setUnlockedContent] = useState<ContentItem[]>([]);
  const [creator, setCreator] = useState<CreatorProfileData | null>(null);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  const [purchaseData, setPurchaseData] = useState<PurchaseData | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;
    
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
          .abortSignal(signal)
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
          .abortSignal(signal)
          .maybeSingle();
        if (creatorProfile) {
          setCreator(creatorProfile as CreatorProfileData);
        }
      }

      // Check if user has purchased this link (via session_id in URL)
      let hasPurchased = false;
      if (sessionId) {
        // First attempt: immediate lookup
        const { data: purchase } = await supabase
          .from('purchases')
          .select('id, access_expires_at, amount_cents, currency, created_at, email_sent, download_count')
          .eq('link_id', data.id)
          .eq('stripe_session_id', sessionId)
          .maybeSingle();

        if (purchase) {
          const pd = purchase as PurchaseData;
          hasPurchased = true;
          setIsUnlocked(true);
          setAccessExpiresAt(pd.access_expires_at ?? null);
          setPurchaseData(pd);
        } else {
          // Race condition: webhook hasn't created the purchase yet.
          // Show a "verifying payment" state and poll with exponential backoff.
          setIsVerifyingPayment(true);
          setIsLoading(false);

          const polledPurchase = await pollForPurchase(data.id, sessionId, signal);

          if (signal.aborted) return;

          if (polledPurchase) {
            hasPurchased = true;
            setIsUnlocked(true);
            setAccessExpiresAt(polledPurchase.access_expires_at ?? null);
            setPurchaseData(polledPurchase);
          } else {
            setPaymentNotFound(true);
          }
          setIsVerifyingPayment(false);
        }
      }

      // Fetch attached media from link_media
      const { data: linkMedia } = await supabase
        .from('link_media')
        .select('asset_id, assets(storage_path, mime_type)')
        .eq('link_id', data.id)
        .abortSignal(signal)
        .order('position', { ascending: true });

      const items: ContentItem[] = [];

      // Add main content if exists
      if (data.storage_path) {
        const ext = data.storage_path.split('.').pop()?.toLowerCase() ?? '';
        const isVideo = ['mp4', 'mov', 'webm', 'mkv'].includes(ext);
        items.push({ id: 'main', type: isVideo ? 'video' : 'image', storagePath: data.storage_path });
      }

      // Add linked assets
      if (linkMedia && linkMedia.length > 0) {
        for (const lm of linkMedia) {
          const asset = (lm as any).assets;
          items.push({
            id: lm.asset_id || `asset-${items.length}`,
            type: (asset?.mime_type || '').startsWith('video/') ? 'video' : 'image',
            storagePath: asset?.storage_path,
          });
        }
      }

      // If no content, show at least one placeholder card
      if (items.length === 0) {
        items.push({ id: 'placeholder', type: 'image' });
      }

      setContentItems(items);

      // Generate signed URLs only if purchased (via Edge Function with service_role_key)
      if (hasPurchased && sessionId) {
        const unlocked = await generateSignedUrls(data.id, sessionId, items);
        setUnlockedContent(unlocked);
      }

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

      if (error || !(data as any)?.url) {
        console.error('Error invoking create-link-checkout-session', error, data);
        const serverMsg = (data as any)?.error;
        throw new Error(
          serverMsg || 'Unable to start checkout. Please try again later.',
        );
      }

      const url = (data as any).url as string;

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
          colorStops={getAuroraGradient(creator?.aurora_gradient || creator?.theme_color || 'purple_dream').colors}
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
          {/* VERIFYING PAYMENT STATE */}
          {isVerifyingPayment && link && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center py-32 gap-6"
            >
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-2 border-white/20 bg-black/40 backdrop-blur-xl flex items-center justify-center">
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-white">Verifying your payment…</h2>
                <p className="text-sm text-white/60 max-w-xs">This usually takes a few seconds. Please don't close this page.</p>
              </div>
            </motion.div>
          )}

          {/* PAYMENT NOT FOUND — polling exhausted */}
          {paymentNotFound && !isVerifyingPayment && link && !isUnlocked && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center py-32 gap-6 max-w-md mx-auto"
            >
              <div className="w-20 h-20 rounded-full border-2 border-white/20 bg-black/40 backdrop-blur-xl flex items-center justify-center">
                <Lock className="w-8 h-8 text-white/60" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-white">Access expired</h2>
                <p className="text-sm text-white/60 leading-relaxed">
                  Your session has expired. If you purchased this content, check your email for a direct access link. Otherwise, you can purchase it again below.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-white/20 text-white hover:bg-white/10 mt-2"
                onClick={() => {
                  window.location.href = `/l/${slug}`;
                }}
              >
                Back to content page
              </Button>
            </motion.div>
          )}

          {/* LOCKED STATE - New Grid Layout */}
          {!isLoading && !isVerifyingPayment && !paymentNotFound && link && !isUnlocked && contentItems.length > 0 && contentItems[0].storagePath && (
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
                          background: getAuroraGradient(creator?.aurora_gradient || creator?.theme_color || 'purple_dream').preview
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
                        <div className="flex items-center justify-center gap-3 mt-3">
                          <a href="/terms" className="text-[10px] text-white/30 hover:text-white/60 transition-colors">Terms</a>
                          <span className="text-white/15">·</span>
                          <a href="/privacy" className="text-[10px] text-white/30 hover:text-white/60 transition-colors">Privacy</a>
                          <span className="text-white/15">·</span>
                          <a href="/cookies" className="text-[10px] text-white/30 hover:text-white/60 transition-colors">Cookies</a>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          )}

          {/* UNLOCKED STATE - Modern Layout */}
          {!isLoading && link && isUnlocked && (
            <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
              {/* Success Header */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/40">
                    <Check className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs font-medium text-green-400">Unlocked</span>
                  </div>
                  <h1 className="text-lg sm:text-xl font-bold text-white truncate">{link.title}</h1>
                </div>
                <button
                  onClick={() => {
                    const downloadable = unlockedContent.filter((i) => i.previewUrl);
                    if (downloadable.length === 0) return;
                    if (downloadable.length === 1) {
                      downloadFile(downloadable[0].previewUrl!);
                    } else {
                      downloadAllAsZip(
                        downloadable.map((item, idx) => ({
                          url: item.previewUrl!,
                          filename: `${link.title || 'content'}-${idx + 1}.${item.previewUrl!.split('/').pop()?.split('?')[0]?.split('.').pop() || 'jpg'}`,
                        })),
                        link.title || 'exclu-content',
                      );
                    }
                  }}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-white/90 transition-all active:scale-95 shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download{unlockedContent.filter((i) => i.previewUrl).length > 1 ? ` (${unlockedContent.filter((i) => i.previewUrl).length})` : ''}</span>
                </button>
              </motion.div>

              {/* Media Gallery */}
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="relative rounded-3xl border border-exclu-arsenic/60 bg-exclu-ink/80 backdrop-blur-xl overflow-hidden"
              >
                {unlockedContent.length > 0 ? (
                  <div className="relative">
                    {/* Current media item */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeMediaIndex}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="relative"
                      >
                        {unlockedContent[activeMediaIndex]?.type === 'video' ? (
                          <video
                            controls
                            className="w-full block"
                            src={unlockedContent[activeMediaIndex]?.previewUrl}
                          />
                        ) : (
                          <img
                            src={unlockedContent[activeMediaIndex]?.previewUrl}
                            alt={`${link.title} — ${activeMediaIndex + 1}`}
                            className="w-full block"
                          />
                        )}
                      </motion.div>
                    </AnimatePresence>

                    {/* Navigation arrows (only if multiple items) */}
                    {unlockedContent.length > 1 && (
                      <>
                        <button
                          onClick={() => setActiveMediaIndex((prev) => (prev - 1 + unlockedContent.length) % unlockedContent.length)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-all z-10"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setActiveMediaIndex((prev) => (prev + 1) % unlockedContent.length)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-all z-10"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    )}

                    {/* Bottom bar: dots navigation */}
                    {unlockedContent.length > 1 && (
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-8 flex items-end justify-center z-10">
                        <div className="flex items-center gap-1.5">
                          {unlockedContent.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => setActiveMediaIndex(idx)}
                              className={`rounded-full transition-all ${idx === activeMediaIndex ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/60'}`}
                            />
                          ))}
                          <span className="text-[11px] text-white/50 ml-2">
                            {activeMediaIndex + 1}/{unlockedContent.length}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-20">
                    <p className="text-sm text-white/40">No media attached to this content yet.</p>
                  </div>
                )}
              </motion.div>

              {/* Mobile Download Button — below gallery */}
              <button
                onClick={() => {
                  const downloadable = unlockedContent.filter((i) => i.previewUrl);
                  if (downloadable.length === 0) return;
                  if (downloadable.length === 1) {
                    downloadFile(downloadable[0].previewUrl!);
                  } else {
                    downloadAllAsZip(
                      downloadable.map((item, idx) => ({
                        url: item.previewUrl!,
                        filename: `${link.title || 'content'}-${idx + 1}.${item.previewUrl!.split('/').pop()?.split('?')[0]?.split('.').pop() || 'jpg'}`,
                      })),
                      link.title || 'exclu-content',
                    );
                  }
                }}
                className="sm:hidden flex items-center justify-center gap-2 w-full py-3 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Download{unlockedContent.filter((i) => i.previewUrl).length > 1 ? ` (${unlockedContent.filter((i) => i.previewUrl).length})` : ''}</span>
              </button>

              {/* Info Row: Purchase Recap + Creator */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Purchase Summary Card */}
                {purchaseData && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 backdrop-blur-xl p-5 space-y-3"
                  >
                    <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Purchase Summary</h3>
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-bold text-white">
                        ${(purchaseData.amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs text-white/40">
                        {new Date(purchaseData.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className={`flex items-center gap-1 ${purchaseData.email_sent ? 'text-green-400' : 'text-white/30'}`}>
                        {purchaseData.email_sent ? <Check className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                        {purchaseData.email_sent ? 'Email sent' : 'No email'}
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Creator Card */}
                {creator && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 backdrop-blur-xl p-5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 bg-exclu-ink flex-shrink-0">
                        {creator.avatar_url ? (
                          <img src={creator.avatar_url} alt={creator.display_name || ''} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white/60">
                            {(creator.display_name || creator.handle || 'C').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{creator.display_name || creator.handle}</p>
                        {creator.handle && <p className="text-xs text-white/40">@{creator.handle}</p>}
                      </div>
                    </div>
                    {link.description && (
                      <p className="text-xs text-white/50 mt-3 leading-relaxed line-clamp-3">{link.description}</p>
                    )}
                    {creator.handle && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full border-exclu-arsenic/60 bg-black/40 hover:bg-black/60 text-white text-xs h-8 px-3 flex items-center gap-1.5 transition-all mt-3 w-full justify-center sm:w-auto"
                        onClick={() => { window.location.href = `/${creator.handle}`; }}
                      >
                        <span>View Profile</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Button>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Info Footer */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 backdrop-blur-xl p-5 space-y-4"
              >
                {hasTemporaryAccess && expiresDate && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                    <p className="text-xs text-amber-300/90 text-center">
                      ⏰ Temporary access expires on{' '}
                      <span className="font-semibold">{expiresDate.toLocaleString()}</span>
                    </p>
                  </div>
                )}

                <div className="space-y-1.5 text-[11px] text-white">
                  <p>✓ Download links expire after 15 minutes — revisit this page to regenerate</p>
                  <p>✓ Bookmark this page to access your content anytime</p>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PublicLink;
