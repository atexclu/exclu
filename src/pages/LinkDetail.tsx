import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Eye, Coins, ArrowRight, MessageCircle, Image as ImageIcon, Video, X, Plus, Trash2 } from 'lucide-react';

interface LinkDetailData {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  status: string;
  slug: string;
  click_count?: number;
  created_at: string;
  storage_path: string | null;
  mime_type: string | null;
}

interface PurchaseRow {
  id: string;
  buyer_email: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: string;
  created_at: string;
  access_expires_at: string | null;
}

const LinkDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [link, setLink] = useState<LinkDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesCount, setSalesCount] = useState(0);
  const [revenueCents, setRevenueCents] = useState(0);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [contentPreviewUrl, setContentPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchDetail = async () => {
      if (!id) return;
      setIsLoading(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!isMounted) return;
        setError('Unable to load this link. Please sign in again.');
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: linkError } = await supabase
          .from('links')
          .select('id, title, description, price_cents, currency, status, slug, click_count, created_at, storage_path, mime_type')
          .eq('id', id)
          .eq('creator_id', user.id)
          .single();

        if (linkError || !data) {
          throw linkError || new Error('Link not found');
        }

        const { data: purchasesData, error: purchasesError } = await supabase
          .from('purchases')
          .select('id, buyer_email, amount_cents, currency, status, created_at, access_expires_at')
          .eq('link_id', id)
          .order('created_at', { ascending: false });

        if (purchasesError) {
          throw purchasesError;
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('is_creator_subscribed')
          .eq('id', user.id)
          .single();
        const isPremium = profileData?.is_creator_subscribed === true;
        const commissionRate = isPremium ? 0 : 0.10;

        const safePurchases = (purchasesData ?? []) as PurchaseRow[];
        const sales = safePurchases.length;
        // Creator net: strip 5% fan fee, then deduct 10% platform commission if not premium
        const revenue = safePurchases.reduce(
          (sum: number, p: PurchaseRow) => sum + Math.round((p.amount_cents ?? 0) / 1.05 * (1 - commissionRate)),
          0
        );

        if (!isMounted) return;

        setLink(data as LinkDetailData);
        setSalesCount(sales);
        setRevenueCents(revenue);
        setPurchases(safePurchases);
        setIsPremium(isPremium);

        // Load content preview if storage_path exists
        if (data.storage_path) {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('paid-content')
            .createSignedUrl(data.storage_path, 60 * 60);
          
          if (!signedError && signedData?.signedUrl) {
            setContentPreviewUrl(signedData.signedUrl);
          }
        }
      } catch (err) {
        console.error('Error loading link detail', err);
        if (!isMounted) return;
        setError('Unable to load this link right now.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchDetail();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const copyPublicUrl = async () => {
    if (!link) return;
    const url = `${window.location.origin}/l/${link.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Public link copied to clipboard');
    } catch {
      toast.info('Here is your public URL:', {
        description: url,
      });
    }
  };

  const formattedPrice = link
    ? `${(link.price_cents / 100).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${link.currency}`
    : '';

  const formattedRevenue = (revenueCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handleStatusChange = async (nextStatus: string) => {
    if (!link || !id || nextStatus === link.status) return;
    setIsUpdatingStatus(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to update the status.');
      }

      const { error: updateError } = await supabase
        .from('links')
        .update({ status: nextStatus })
        .eq('id', id)
        .eq('creator_id', user.id);

      if (updateError) {
        console.error(updateError);
        throw new Error('Unable to update status. Please try again.');
      }

      setLink((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      toast.success('Status updated.');
    } catch (err: any) {
      console.error('Error updating status', err);
      toast.error(err?.message || 'Unable to update status right now.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!link || !id) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${link.title}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to delete this link.');
      }

      const { error: deleteError } = await supabase
        .from('links')
        .delete()
        .eq('id', id)
        .eq('creator_id', user.id);

      if (deleteError) {
        console.error(deleteError);
        throw new Error('Unable to delete link. Please try again.');
      }

      toast.success('Link deleted successfully.');
      navigate('/app/links');
    } catch (err: any) {
      console.error('Error deleting link', err);
      toast.error(err?.message || 'Unable to delete link right now.');
    }
  };

  return (
    <AppShell>
      <main className="px-4 pb-16 max-w-5xl mx-auto">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mt-4 sm:mt-6 mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.2em] text-exclu-space/70 mb-2">Link overview</p>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-exclu-cloud mb-1">
                {isLoading ? 'Loading…' : link ? link.title : 'Link not found'}
              </h1>
              {link && (
                <p className="text-exclu-space text-sm max-w-xl">
                  {link.description || 'This is one of your premium pieces of content. Here you can see how it performs.'}
                </p>
              )}
            </div>

            {link && (
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-exclu-arsenic/70 w-full sm:w-auto"
                  onClick={copyPublicUrl}
                >
                  Copy public link
                </Button>
                <Button asChild variant="ghost" size="sm" className="rounded-full text-xs text-exclu-space w-full sm:w-auto">
                  <RouterLink to={`/app/links/${link.id}/edit`}>
                    Edit link
                  </RouterLink>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 w-full sm:w-auto"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        </motion.section>

        {error && !isLoading && (
          <p className="text-sm text-red-400 mb-6 max-w-xl">{error}</p>
        )}

        {link && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
            className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)] items-start"
          >
            {/* Stats card */}
            <Card className="bg-gradient-to-br from-exclu-ink/95 via-exclu-phantom/40 to-exclu-ink/95 border border-exclu-arsenic/70 shadow-glow-lg rounded-2xl">
              <CardContent className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[11px] text-exclu-space/80 mb-1">Price</p>
                    <p className="text-lg font-semibold text-exclu-cloud">{formattedPrice}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-exclu-space/80 mb-1">Status</p>
                    <select
                      value={link.status}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      disabled={isUpdatingStatus}
                      className="text-xs px-2.5 py-1 rounded-full bg-white text-black border border-exclu-arsenic/60 capitalize focus:outline-none focus:ring-1 focus:ring-primary/60 disabled:opacity-60"
                    >
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                      <option value="archived">archived</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-[11px] text-exclu-space/80 mb-1 flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> Clicks
                    </p>
                    <p className="text-lg font-semibold text-exclu-cloud">{link.click_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-exclu-space/80 mb-1 flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5" /> Sales
                    </p>
                    <p className="text-lg font-semibold text-exclu-cloud">{salesCount}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-exclu-arsenic/60 mt-2">
                  <p className="text-[11px] text-exclu-space/80 mb-1">Revenue (gross)</p>
                  <p className="text-xl font-semibold text-exclu-cloud">${formattedRevenue} USD</p>
                  <p className="text-[11px] text-exclu-space/70 mt-1">
                    This is the total amount paid by fans for this link, in USD. Payouts and fees will be handled in the payments phase.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Content preview card */}
            <Card className="relative overflow-hidden rounded-3xl border border-exclu-arsenic/70 bg-gradient-to-br from-exclu-ink via-exclu-phantom/20 to-exclu-ink shadow-glow-lg">
              <CardContent className="p-0">
                <p className="text-[11px] uppercase tracking-[0.22em] text-exclu-space/70 px-4 pt-4 pb-2">Content</p>
                
                {contentPreviewUrl ? (
                    <div className="relative h-64 sm:h-72 md:h-80">
                      {link?.mime_type?.startsWith('video/') ? (
                        <video
                          src={contentPreviewUrl}
                          className="w-full h-full object-cover"
                          controls
                        />
                      ) : (
                        <img
                          src={contentPreviewUrl}
                          className="w-full h-full object-cover"
                          alt={link?.title || 'Content'}
                        />
                      )}
                      <div className="absolute top-2 right-2 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full bg-black/60 backdrop-blur-sm border-white/20 text-white hover:bg-black/80"
                          onClick={() => {
                            // TODO: Implémenter la suppression du contenu
                            toast.info('Delete content feature coming soon');
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-64 sm:h-72 md:h-80 flex items-center justify-center bg-exclu-phantom/20">
                      <div className="flex flex-col items-center text-center gap-3 px-6">
                        <div className="w-16 h-16 rounded-full bg-exclu-arsenic/30 flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-exclu-space" />
                        </div>
                        <p className="text-sm font-medium text-exclu-cloud">No content attached</p>
                        <p className="text-xs text-exclu-space/80 max-w-sm">
                          Add photos or videos to this link from the edit page
                        </p>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="mt-2 rounded-full"
                        >
                          <RouterLink to={`/app/links/${link?.id}/edit`}>
                            <Plus className="w-4 h-4 mr-1.5" />
                            Add content
                          </RouterLink>
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="px-6 py-4 border-t border-exclu-arsenic/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-exclu-space/80">
                    <Eye className="w-4 h-4" />
                    <span>Preview how fans will see this content</span>
                  </div>
                  <Button
                    asChild
                    variant="hero"
                    size="sm"
                    className="rounded-full"
                  >
                    <RouterLink to={link ? `/l/${link.slug}` : '#'} target="_blank" rel="noreferrer">
                      View public page
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </RouterLink>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Buyers list / purchases timeline */}
            <Card className="bg-gradient-to-br from-exclu-ink/95 via-exclu-phantom/30 to-exclu-ink/95 border border-exclu-arsenic/70 shadow-glow-lg rounded-2xl md:col-span-2">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-exclu-space/70 mb-1">Buyers</p>
                    <p className="text-sm text-exclu-space/80">
                      {salesCount > 0
                        ? 'See who unlocked this content and when they purchased it.'
                        : 'No fans have purchased this link yet.'}
                    </p>
                  </div>
                </div>

                {purchases.length > 0 && (
                  <div className="mt-2 space-y-3 max-h-64 overflow-y-auto pr-1">
                    {purchases.map((purchase, index) => {
                      const emailLabel = purchase.buyer_email || 'Unknown buyer';
                      const amountLabel = purchase.amount_cents
                        ? `$${(Math.round(purchase.amount_cents / 1.05 * (1 - (isPremium ? 0 : 0.10))) / 100).toFixed(2)} USD`
                        : '—';
                      const dateLabel = new Date(purchase.created_at).toLocaleString();
                      const isRefunded = purchase.status === 'refunded';
                      const isPending = purchase.status === 'pending';
                      const isSucceeded = purchase.status === 'succeeded';

                      return (
                        <motion.div
                          key={purchase.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.03 * index }}
                          className="flex items-start justify-between gap-3 rounded-xl border border-exclu-arsenic/60 bg-black/40 px-3 py-2.5"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="flex flex-col items-center mt-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                              {index < purchases.length - 1 && (
                                <div className="flex-1 w-px bg-exclu-arsenic/60 mt-1" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-exclu-cloud truncate">
                                {emailLabel}
                              </p>
                              <p className="text-[11px] text-exclu-space/70">{dateLabel}</p>
                              {purchase.access_expires_at && (
                                <p className="text-[11px] text-amber-300/80 mt-0.5">
                                  Temporary access until{' '}
                                  {new Date(purchase.access_expires_at).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-xs font-semibold text-exclu-cloud">{amountLabel}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${
                                isRefunded
                                  ? 'bg-red-500/15 text-red-300'
                                  : isPending
                                  ? 'bg-yellow-500/15 text-yellow-300'
                                  : isSucceeded
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-exclu-arsenic/50 text-exclu-space/80'
                              }`}
                            >
                              {purchase.status}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </main>
    </AppShell>
  );
};

export default LinkDetail;
