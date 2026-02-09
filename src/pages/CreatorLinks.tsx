import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Copy, Check, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface LinkRow {
  id: string;
  title: string;
  slug: string;
  price_cents: number;
  currency: string;
  status: string;
  show_on_profile: boolean;
  created_at: string;
  click_count?: number;
  storage_path: string | null;
  previewUrl?: string | null;
  isVideo?: boolean;
  is_public: boolean;
}

const CreatorLinks = () => {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadPrice, setUploadPrice] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canCreateLinks, setCanCreateLinks] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const fetchLinks = async () => {
      setIsLoading(true);
      setError(null);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!isMounted) return;
        setError('You must be signed in to view your links.');
        setLinks([]);
        setIsLoading(false);
        return;
      }

      // Check Stripe Connect status first
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('stripe_connect_status, stripe_account_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (profileError) {
        console.error('Error loading profile', profileError);
      }

      const connectStatus = profile?.stripe_connect_status ?? null;
      const hasStripeAccount = !!profile?.stripe_account_id;
      const isConnectComplete = connectStatus === 'complete';
      const canCreate = hasStripeAccount && isConnectComplete;
      setCanCreateLinks(canCreate);

      const { data, error } = await supabase
        .from('links')
        .select('id, title, slug, price_cents, currency, status, show_on_profile, created_at, click_count, storage_path, is_public')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (error) {
        console.error('Error loading links', error);
        setError('Unable to load your links. Please try again later.');
      } else {
        const baseLinks = (data ?? []) as LinkRow[];

        // Generate signed URLs for media previews
        const withPreviews = await Promise.all(
          baseLinks.map(async (link) => {
            // First try main storage_path
            if (link.storage_path) {
              const { data: signed, error: signedError } = await supabase.storage
                .from('paid-content')
                .createSignedUrl(link.storage_path, 60 * 60);

              if (!signedError && signed?.signedUrl) {
                const ext = link.storage_path.split('.').pop()?.toLowerCase() ?? '';
                const isVideo = ['mp4', 'mov', 'webm', 'mkv'].includes(ext);
                return { ...link, previewUrl: signed.signedUrl, isVideo };
              }
            }

            // If no main storage_path, try to get first attached asset from link_media
            const { data: linkMedia } = await supabase
              .from('link_media')
              .select('assets(storage_path, mime_type)')
              .eq('link_id', link.id)
              .order('position', { ascending: true })
              .limit(1);

            if (linkMedia && linkMedia.length > 0) {
              const asset = (linkMedia[0] as any).assets;
              if (asset?.storage_path) {
                const { data: signed } = await supabase.storage
                  .from('paid-content')
                  .createSignedUrl(asset.storage_path, 60 * 60);

                if (signed?.signedUrl) {
                  const isVideo = asset.mime_type?.startsWith('video/') || false;
                  return { ...link, previewUrl: signed.signedUrl, isVideo };
                }
              }
            }

            return { ...link, previewUrl: null, isVideo: false };
          })
        );

        setLinks(withPreviews);

        // Only redirect to /app/links/new if user has no links AND Stripe is connected
        if (withPreviews.length === 0 && canCreate) {
          navigate('/app/links/new', { replace: true });
        }
      }
      setIsLoading(false);
    };

    fetchLinks();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsUploading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('You must be logged in');
      setIsUploading(false);
      return;
    }

    const userId = user.id;
    const filePath = `paid-content/${userId}/${uploadFile.name}`;

    const { data, error } = await supabase.storage
      .from('paid-content')
      .upload(filePath, uploadFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      setIsUploading(false);
      toast.error('Failed to upload file');
      return;
    }

    const { data: insertData, error: insertError } = await supabase
      .from('links')
      .insert({
        creator_id: userId,
        title: uploadTitle,
        price: parseFloat(uploadPrice),
        description: uploadDescription || null,
        storage_path: filePath,
        mime_type: uploadFile.type,
        status: 'published',
        is_public: isPublic,
      })
      .select()
      .single();

    if (insertError) {
      setIsUploading(false);
      toast.error('Failed to create link');
      return;
    }

    toast.success('Content created successfully!');
    setUploadFile(null);
    setUploadTitle('');
    setUploadPrice('');
    setUploadDescription('');
    setIsPublic(false);
    setIsUploadModalOpen(false);
    setIsUploading(false);
    
    // Refresh the list
    window.location.reload();
  };

  return (
    <AppShell>
      <main className="px-4 pb-16 max-w-6xl mx-auto">
        <section className="mt-4 sm:mt-6 mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-1">
              Your links
            </h1>
            <p className="text-exclu-space text-xs sm:text-sm max-w-xl">
              Create and manage the links your fans will pay to unlock.
            </p>
          </div>
          <Button asChild variant="hero" size="sm">
            <RouterLink to="/app/links/new">New link</RouterLink>
          </Button>
        </section>

        {isLoading && (
          <p className="text-sm text-exclu-space">Loading your links...</p>
        )}

        {error && !isLoading && (
          <p className="text-sm text-red-400 mb-4">{error}</p>
        )}

        {!isLoading && !error && canCreateLinks === false && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mt-6 sm:mt-10 max-w-xl mx-auto"
          >
            <Card className="bg-exclu-ink/90 border border-exclu-arsenic/70 rounded-2xl shadow-lg">
              <CardHeader className="px-6 pt-6 pb-3 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-exclu-cloud/10 px-3 py-1 text-[11px] font-medium text-exclu-cloud">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Finish your payout setup first</span>
                </div>
                <CardTitle className="text-base text-exclu-cloud mt-1">
                  Connect Stripe to manage paid links
                </CardTitle>
                <CardDescription className="text-xs text-exclu-space/80">
                  You need to connect your Stripe account to create and manage paid content links that appear on your profile.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-5 space-y-4 text-[13px] text-exclu-space/85">
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>Open your dashboard and complete the Stripe Connect onboarding.</li>
                  <li>Stripe will ask for your legal name, address, and bank details.</li>
                  <li>Once your account is approved, you can create and sell paid links instantly.</li>
                </ul>
                <div className="flex flex-col sm:flex-row gap-3 mt-3">
                  <Button
                    asChild
                    variant="hero"
                    size="sm"
                    className="rounded-full flex-1"
                  >
                    <RouterLink to="/app">Go to dashboard</RouterLink>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="rounded-full border-exclu-arsenic/70 flex-1"
                  >
                    <RouterLink to="/app/settings">Open payouts & settings</RouterLink>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.section>
        )}

        {!isLoading && !error && links.length === 0 && canCreateLinks === true && (
          <p className="text-sm text-exclu-space/80">
            You don&apos;t have any links yet. Click "New link" to create your first one.
          </p>
        )}

        {!isLoading && !error && links.length > 0 && canCreateLinks === true && (
          <>
            {/* Mobile: Card layout */}
            <div className="sm:hidden space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  onClick={() => navigate(`/app/links/${link.id}`)}
                  className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 cursor-pointer hover:bg-exclu-ink"
                >
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    <div className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-exclu-arsenic/60 bg-exclu-ink/80">
                      {link.previewUrl ? (
                        link.isVideo ? (
                          <video
                            src={link.previewUrl}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={link.previewUrl}
                            className="w-full h-full object-cover"
                            alt={link.title}
                          />
                        )
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-exclu-phantom/30 via-exclu-ink to-exclu-phantom/20" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <RouterLink
                        to={`/app/links/${link.id}`}
                        className="text-sm font-medium text-exclu-cloud hover:underline truncate block"
                      >
                        {link.title}
                      </RouterLink>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-semibold text-exclu-cloud">
                          {link.price_cents / 100} {link.currency}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-exclu-space/70">
                        <span>{new Date(link.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{link.click_count ?? 0} clicks</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-exclu-arsenic/40">
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const url = `${window.location.origin}/l/${link.slug}`;
                        try {
                          await navigator.clipboard.writeText(url);
                          toast.success('Link copied!');
                        } catch {
                          toast.error('Failed to copy link');
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-exclu-arsenic/30 hover:bg-exclu-arsenic/50 text-xs text-exclu-space transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy link
                    </button>
                    <div 
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-exclu-ink border border-exclu-arsenic/40"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[10px] text-exclu-space/70">Visible</span>
                      <Switch
                        checked={link.show_on_profile}
                        onCheckedChange={async (checked) => {
                          const { error } = await supabase
                            .from('links')
                            .update({ show_on_profile: checked })
                            .eq('id', link.id);
                          if (error) {
                            toast.error('Failed to update visibility');
                          } else {
                            toast.success(checked ? 'Link is now visible' : 'Link is now hidden');
                            setLinks(links.map(l => l.id === link.id ? { ...l, show_on_profile: checked } : l));
                          }
                        }}
                      />
                    </div>
                    <RouterLink
                      to={`/app/links/${link.id}/edit`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-exclu-cloud/10 hover:bg-exclu-cloud/20 text-xs text-exclu-cloud transition-colors"
                    >
                      Edit
                    </RouterLink>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden sm:block overflow-x-auto rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-exclu-space/70 border-b border-exclu-arsenic/60">
                  <tr>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">Price</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3 text-left">Clicks</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr
                      key={link.id}
                      className="border-t border-exclu-arsenic/40 hover:bg-exclu-ink/60 cursor-pointer"
                      onClick={() => navigate(`/app/links/${link.id}`)}
                    >
                      <td className="px-4 py-3 text-exclu-cloud font-medium">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Thumbnail preview */}
                          <div className="relative flex-shrink-0 w-14 h-10 rounded-xl overflow-hidden border border-exclu-arsenic/60 bg-exclu-ink/80">
                            {link.previewUrl ? (
                              link.isVideo ? (
                                <video
                                  src={link.previewUrl}
                                  className="w-full h-full object-cover"
                                  muted
                                  loop
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={link.previewUrl}
                                  className="w-full h-full object-cover"
                                  alt={link.title}
                                />
                              )
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-exclu-phantom/30 via-exclu-ink to-exclu-phantom/20" />
                            )}
                          </div>

                          {/* Title */}
                          <RouterLink
                            to={`/app/links/${link.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="min-w-0 hover:underline hover:text-exclu-cloud/90 transition-colors"
                          >
                            <span className="truncate block max-w-[180px] sm:max-w-[220px]">{link.title}</span>
                          </RouterLink>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-exclu-space">
                        {link.price_cents / 100} {link.currency}
                      </td>
                      <td className="px-4 py-3 text-exclu-space/80">
                        {new Date(link.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-exclu-space">
                        {link.click_count ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div 
                            className="flex items-center gap-2 px-2 py-1 rounded-lg bg-exclu-ink border border-exclu-arsenic/40"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[10px] text-exclu-space/70">Visible</span>
                            <Switch
                              checked={link.show_on_profile}
                              onCheckedChange={async (checked) => {
                                const { error } = await supabase
                                  .from('links')
                                  .update({ show_on_profile: checked })
                                  .eq('id', link.id);
                                if (error) {
                                  toast.error('Failed to update visibility');
                                } else {
                                  toast.success(checked ? 'Link is now visible' : 'Link is now hidden');
                                  setLinks(links.map(l => l.id === link.id ? { ...l, show_on_profile: checked } : l));
                                }
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const url = `${window.location.origin}/l/${link.slug}`;
                              try {
                                await navigator.clipboard.writeText(url);
                                toast.success('Link copied!');
                              } catch {
                                toast.error('Failed to copy link');
                              }
                            }}
                            className="p-1.5 rounded-lg hover:bg-exclu-arsenic/30 transition-colors"
                            title="Copy link"
                          >
                            <Copy className="w-4 h-4 text-exclu-space hover:text-primary" />
                        </button>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="rounded-full border-exclu-arsenic/60 text-xs px-3 py-1 h-auto"
                        >
                          <RouterLink
                            to={`/app/links/${link.id}/edit`}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            Edit
                          </RouterLink>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </main>
    </AppShell>
  );
};

export default CreatorLinks;
