import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Sparkles } from 'lucide-react';

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
}

const BlurredCard = ({ index, isUnlocked }: { index: number; isUnlocked: boolean }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="relative aspect-[4/5] rounded-2xl overflow-hidden"
    >
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-exclu-phantom via-exclu-ink to-exclu-phantom">
        <div
          className="absolute inset-0 animate-gradient-shift"
          style={{
            background: `linear-gradient(${45 + index * 30}deg, 
              rgba(236,72,153,0.3) 0%, 
              rgba(168,85,247,0.3) 25%, 
              rgba(236,72,153,0.2) 50%, 
              rgba(139,92,246,0.3) 75%, 
              rgba(236,72,153,0.3) 100%)`,
            backgroundSize: '400% 400%',
            animation: `gradient-shift ${8 + index}s ease infinite`,
          }}
        />
      </div>

      {/* Blur overlay with glass effect */}
      <div className="absolute inset-0 backdrop-blur-xl bg-black/20" />

      {/* Animated glow orbs */}
      <div
        className="absolute w-32 h-32 rounded-full blur-3xl opacity-60"
        style={{
          background: 'radial-gradient(circle, rgba(236,72,153,0.6) 0%, transparent 70%)',
          top: `${20 + (index * 15) % 40}%`,
          left: `${10 + (index * 20) % 60}%`,
          animation: `float ${6 + index}s ease-in-out infinite`,
        }}
      />
      <div
        className="absolute w-24 h-24 rounded-full blur-2xl opacity-50"
        style={{
          background: 'radial-gradient(circle, rgba(168,85,247,0.5) 0%, transparent 70%)',
          bottom: `${15 + (index * 10) % 30}%`,
          right: `${15 + (index * 25) % 50}%`,
          animation: `float ${7 + index}s ease-in-out infinite reverse`,
        }}
      />

      {/* Lock icon overlay */}
      <AnimatePresence>
        {!isUnlocked && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <Lock className="w-7 h-7 text-white/80" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shimmer effect */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 55%, transparent 60%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s infinite',
        }}
      />

      {/* Content number badge */}
      <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10">
        <span className="text-[10px] font-medium text-white/80">Content {index + 1}</span>
      </div>
    </motion.div>
  );
};

const PublicLink = () => {
  const { slug } = useParams<{ slug: string }>();
  const [link, setLink] = useState<PublicLinkData | null>(null);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    const fetchLink = async () => {
      if (!slug) return;
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('links')
        .select('id, title, description, price_cents, currency, status, storage_path')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

      if (error || !data) {
        console.error('Error loading public link', error);
        setError('This link is not available or no longer exists.');
        setLink(null);
      } else {
        setLink({
          id: data.id,
          title: data.title,
          description: data.description,
          price_cents: data.price_cents,
          currency: data.currency,
        });

        // Fetch attached media count from link_media
        const { data: linkMedia } = await supabase
          .from('link_media')
          .select('asset_id, assets(mime_type)')
          .eq('link_id', data.id);

        const items: ContentItem[] = [];

        // Add main content if exists
        if (data.storage_path) {
          const ext = data.storage_path.split('.').pop()?.toLowerCase() ?? '';
          const isVideo = ['mp4', 'mov', 'webm', 'mkv'].includes(ext);
          items.push({ id: 'main', type: isVideo ? 'video' : 'image' });
        }

        // Add linked assets
        if (linkMedia && linkMedia.length > 0) {
          linkMedia.forEach((lm: any, idx: number) => {
            const mimeType = lm.assets?.mime_type || '';
            items.push({
              id: lm.asset_id || `asset-${idx}`,
              type: mimeType.startsWith('video/') ? 'video' : 'image',
            });
          });
        }

        // If no content, show at least one placeholder card
        if (items.length === 0) {
          items.push({ id: 'placeholder', type: 'image' });
        }

        setContentItems(items);
      }

      setIsLoading(false);
    };

    fetchLink();
  }, [slug]);

  const handleUnlockClick = async () => {
    if (!slug || !link) return;

    setIsUnlocking(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-link-checkout-session', {
        body: { slug },
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

  return (
    <div className="min-h-screen bg-black text-foreground flex flex-col">
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

      <Navbar />
      <main className="flex-1 flex flex-col">
        <div className="px-4 pt-28 pb-16 max-w-4xl mx-auto w-full">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="text-center mb-10"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">Exclusive Content</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-exclu-cloud mb-3">
              {isLoading ? 'Loading…' : link ? link.title : 'Link unavailable'}
            </h1>
            {!isLoading && link && (
              <p className="text-exclu-space text-sm sm:text-base max-w-xl mx-auto">
                {link.description || 'Unlock this exclusive content from the creator.'}
              </p>
            )}
            {error && !isLoading && (
              <p className="text-sm text-red-400 mt-3">{error}</p>
            )}
          </motion.div>

          {/* Content Cards Grid */}
          {!isLoading && link && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mb-8"
              >
                <div className={`grid gap-4 ${
                  contentItems.length === 1 
                    ? 'grid-cols-1 max-w-sm mx-auto' 
                    : contentItems.length === 2 
                    ? 'grid-cols-2 max-w-lg mx-auto'
                    : 'grid-cols-2 sm:grid-cols-3'
                }`}>
                  {contentItems.map((item, index) => (
                    <BlurredCard key={item.id} index={index} isUnlocked={false} />
                  ))}
                </div>
              </motion.div>

              {/* Unlock CTA */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.4 }}
                className="rounded-2xl border border-exclu-arsenic/50 bg-gradient-to-br from-exclu-ink/80 via-exclu-phantom/20 to-exclu-ink/80 backdrop-blur-sm p-6 sm:p-8"
              >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="text-center sm:text-left">
                    <p className="text-xs text-exclu-space/70 mb-1 uppercase tracking-wider">
                      {contentItems.length} {contentItems.length === 1 ? 'item' : 'items'} to unlock
                    </p>
                    <p className="text-3xl font-bold text-exclu-cloud">{priceLabel}</p>
                  </div>
                  <Button
                    variant="hero"
                    size="lg"
                    className="rounded-full w-full sm:w-auto px-8 py-6 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow"
                    disabled={isUnlocking}
                    onClick={handleUnlockClick}
                  >
                    {isUnlocking ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processing…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        Unlock for {priceLabel}
                      </span>
                    )}
                  </Button>
                </div>
              </motion.div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PublicLink;
