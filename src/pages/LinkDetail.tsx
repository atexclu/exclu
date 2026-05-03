import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { AdaptiveVideo } from '@/components/ui/AdaptiveVideo';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { getSignedUrl, getSignedUrls } from '@/lib/storageUtils';
import { useEffect, useState } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Eye, Coins, ArrowRight, MessageCircle, Image as ImageIcon, Video, X, Plus, Trash2, Users } from 'lucide-react';

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
  created_by_chatter_id: string | null;
}

interface PurchaseRow {
  id: string;
  buyer_email: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: string;
  created_at: string;
  access_expires_at: string | null;
  chat_chatter_id: string | null;
  chatter_earnings_cents: number | null;
  creator_net_cents: number | null;
  platform_fee_cents: number | null;
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
  const [contentItems, setContentItems] = useState<Array<{ id: string; url: string; isVideo: boolean }>>([]);
  const [chatterInfo, setChatterInfo] = useState<{ display_name: string | null; email: string | null } | null>(null);
  const [chatterProfiles, setChatterProfiles] = useState<Map<string, string>>(new Map());

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
          .select('id, title, description, price_cents, currency, status, slug, click_count, created_at, storage_path, mime_type, created_by_chatter_id')
          .eq('id', id)
          .eq('creator_id', user.id)
          .single();

        if (linkError || !data) {
          throw linkError || new Error('Link not found');
        }

        // Only show captured purchases (succeeded + refunded for history).
        // `pending` = fan pre-created a checkout then never completed it — showing
        // those as "buyers" misleads creators into thinking they have unpaid sales.
        const { data: purchasesData, error: purchasesError } = await supabase
          .from('purchases')
          .select('id, buyer_email, amount_cents, currency, status, created_at, access_expires_at, chat_chatter_id, chatter_earnings_cents, creator_net_cents, platform_fee_cents')
          .eq('link_id', id)
          .in('status', ['succeeded', 'refunded'])
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
        const commissionRate = isPremium ? 0 : 0.15;

        const safePurchases = (purchasesData ?? []) as PurchaseRow[];
        const succeededPurchases = safePurchases.filter((p) => p.status === 'succeeded');
        const sales = succeededPurchases.length;
        // Creator net: strip 15% fan fee, then deduct 15% platform commission if not premium
        const revenue = succeededPurchases.reduce(
          (sum: number, p: PurchaseRow) => sum + Math.round((p.amount_cents ?? 0) / 1.15 * (1 - commissionRate)),
          0
        );

        if (!isMounted) return;

        setLink(data as LinkDetailData);
        setSalesCount(sales);
        setRevenueCents(revenue);
        setPurchases(safePurchases);
        setIsPremium(isPremium);

        // Fetch chatter profiles for purchases made by chatters
        const chatterIds = [...new Set(safePurchases.filter(p => p.chat_chatter_id).map(p => p.chat_chatter_id!))];
        if (chatterIds.length > 0) {
          const { data: chattersData } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', chatterIds);
          
          if (chattersData && isMounted) {
            const chattersMap = new Map<string, string>();
            chattersData.forEach((c: any) => {
              chattersMap.set(c.id, c.display_name || 'Chatter');
            });
            setChatterProfiles(chattersMap);
          }
        }

        // Fetch chatter profile if link was created by a chatter
        if (data.created_by_chatter_id) {
          const { data: chatterProfile } = await supabase
            .from('profiles')
            .select('display_name, email')
            .eq('id', data.created_by_chatter_id)
            .single();
          if (chatterProfile && isMounted) {
            setChatterInfo(chatterProfile);
          }
        }

        // Load every attached piece of content — main storage_path + every
        // link_media row joined with its asset. Sign all of them in a single
        // batched round-trip so the gallery shows the full set, not just the
        // first file.
        const { data: mediaRows } = await supabase
          .from('link_media')
          .select('asset_id, position, assets(storage_path, mime_type)')
          .eq('link_id', data.id)
          .order('position', { ascending: true });

        const sources: Array<{ id: string; storagePath: string; mimeType: string | null }> = [];
        if (data.storage_path) {
          sources.push({ id: 'main', storagePath: data.storage_path, mimeType: data.mime_type });
        }
        for (const row of (mediaRows ?? []) as Array<{ asset_id: string | null; assets: { storage_path: string; mime_type: string | null } | null }>) {
          if (row.assets?.storage_path) {
            sources.push({
              id: row.asset_id || `media-${sources.length}`,
              storagePath: row.assets.storage_path,
              mimeType: row.assets.mime_type ?? null,
            });
          }
        }

        if (sources.length > 0) {
          const signedMap = await getSignedUrls(sources.map((s) => s.storagePath), 60 * 60);
          const items = sources
            .map((s) => {
              const url = signedMap[s.storagePath];
              if (!url) return null;
              const ext = s.storagePath.split('.').pop()?.toLowerCase() ?? '';
              const isVideo = (s.mimeType?.startsWith('video/') ?? false) || ['mp4', 'mov', 'webm', 'mkv'].includes(ext);
              return { id: s.id, url, isVideo };
            })
            .filter(Boolean) as Array<{ id: string; url: string; isVideo: boolean }>;
          if (isMounted) {
            setContentItems(items);
            setContentPreviewUrl(items[0]?.url ?? null);
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
              {link?.created_by_chatter_id && chatterInfo && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs">
                  <Users className="w-3 h-3 text-primary" />
                  <span className="text-exclu-space">Created by chatter</span>
                  <span className="font-semibold text-exclu-cloud">{chatterInfo.display_name || chatterInfo.email || 'Unknown'}</span>
                </div>
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
                  className="hidden sm:inline-flex rounded-full text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10"
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
                <p className="text-[11px] uppercase tracking-[0.22em] text-exclu-space/70 px-4 pt-4 pb-2">
                  Content{contentItems.length > 1 ? ` · ${contentItems.length} items` : ''}
                </p>

                {contentItems.length > 1 ? (
                  <div className="relative">
                    <div className="flex overflow-x-auto snap-x snap-mandatory gap-2 px-4 pb-3 scroll-smooth [scrollbar-width:thin]">
                      {contentItems.map((item) => (
                        <div
                          key={item.id}
                          className="snap-start flex-shrink-0 w-[85%] sm:w-[60%] md:w-[48%] rounded-2xl overflow-hidden border border-exclu-arsenic/60 bg-black/30"
                        >
                          {item.isVideo ? (
                            <AdaptiveVideo src={item.url} controls maxHeight="55vh" />
                          ) : (
                            <div className="relative h-64 sm:h-72 md:h-80">
                              <img src={item.url} className="w-full h-full object-cover" alt={link?.title || 'Content'} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : contentPreviewUrl ? (
                    <div className="relative">
                      {link?.mime_type?.startsWith('video/') ? (
                        <AdaptiveVideo
                          src={contentPreviewUrl}
                          controls
                          maxHeight="60vh"
                        />
                      ) : (
                        <div className="relative h-64 sm:h-72 md:h-80">
                          <img
                            src={contentPreviewUrl}
                            className="w-full h-full object-cover"
                            alt={link?.title || 'Content'}
                          />
                        </div>
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
                      const chatterName = purchase.chat_chatter_id ? chatterProfiles.get(purchase.chat_chatter_id) : null;
                      
                      // If chatter sale, use creator_net_cents (60%), otherwise calculate from amount_cents
                      const creatorNetAmount = purchase.chat_chatter_id && purchase.creator_net_cents
                        ? purchase.creator_net_cents
                        : purchase.amount_cents
                        ? Math.round(purchase.amount_cents / 1.15 * (1 - (isPremium ? 0 : 0.15)))
                        : 0;
                      
                      const amountLabel = creatorNetAmount > 0
                        ? `$${(creatorNetAmount / 100).toFixed(2)} USD`
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
                              {chatterName && (
                                <p className="text-[11px] text-primary/80 mt-0.5">
                                  💬 Sale by {chatterName}
                                </p>
                              )}
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
                            {chatterName && (
                              <span className="text-[10px] text-primary/60">
                                (60% net)
                              </span>
                            )}
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

        {link && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 mt-6 sm:hidden">
            <h2 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h2>
            <p className="text-xs text-red-300/70 mb-5">
              Deleting this link is permanent and cannot be undone. The associated content remains in your library.
            </p>
            <Button
              variant="outline"
              onClick={handleDelete}
              className="rounded-full border-red-500/40 text-red-300 hover:bg-red-500/10 w-full"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete this link
            </Button>
          </div>
        )}
      </main>
    </AppShell>
  );
};

export default LinkDetail;
