import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface PublicLinkData {
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
}

const PublicLink = () => {
  const { slug } = useParams<{ slug: string }>();
  const [link, setLink] = useState<PublicLinkData | null>(null);
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
        .select('title, description, price_cents, currency, status')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

      if (error || !data) {
        console.error('Error loading public link', error);
        setError('This link is not available or no longer exists.');
        setLink(null);
      } else {
        setLink({
          title: data.title,
          description: data.description,
          price_cents: data.price_cents,
          currency: data.currency,
        });
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
    <div className="min-h-screen bg-gradient-to-b from-black via-exclu-ink to-black text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col">
        <div className="px-4 pt-28 pb-16 max-w-3xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mb-8"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-exclu-space/70 mb-3">Premium content</p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-exclu-cloud mb-2">
              {isLoading ? 'Loading link…' : link ? link.title : 'Link unavailable'}
            </h1>
            {!isLoading && link && (
              <p className="text-exclu-space text-sm sm:text-base max-w-2xl">
                {link.description || 'This is a premium piece of content shared by the creator.'}
              </p>
            )}
            {error && !isLoading && (
              <p className="text-sm text-red-400 mt-3 max-w-2xl">{error}</p>
            )}
          </motion.div>

          {!isLoading && link && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 }}
              className="rounded-3xl border border-exclu-arsenic/70 bg-gradient-to-br from-exclu-ink/90 via-exclu-phantom/30 to-exclu-ink/95 shadow-glow-lg p-6 sm:p-8 flex flex-col gap-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-exclu-space/80 mb-1">Unlock this exclusive content</p>
                  <p className="text-2xl font-semibold text-exclu-cloud">{priceLabel}</p>
                </div>
                <Button
                  variant="hero"
                  size="lg"
                  className="rounded-full w-full sm:w-auto"
                  disabled={isUnlocking}
                  onClick={handleUnlockClick}
                >
                  {isUnlocking ? 'Redirecting to checkout…' : `Unlock for ${priceLabel}`}
                </Button>
              </div>

              <p className="text-[11px] text-exclu-space/80">
                Le paiement sera bientôt disponible sur Exclu. Pour l’instant, cette page est une prévisualisation du lien que
                verront tes fans.
              </p>
            </motion.div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PublicLink;
