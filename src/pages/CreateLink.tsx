import AppShell from '@/components/AppShell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { motion } from 'framer-motion';
import { useState, FormEvent, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { UploadCloud, Image as ImageIcon, Film, Sparkles, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

type LibraryAsset = {
  id: string;
  title: string | null;
  created_at: string;
  storage_path: string;
  mime_type: string | null;
  previewUrl?: string | null;
};

const CreateLink = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('5');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [hasExistingLinks, setHasExistingLinks] = useState(false);
  const [canCreateLinks, setCanCreateLinks] = useState<boolean | null>(null);
  const [stripeConnectStatus, setStripeConnectStatus] = useState<string | null>(null);
  const [showOnProfile, setShowOnProfile] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectStripe = async () => {
    setIsConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please sign in again to connect Stripe.');
        return;
      }
      const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
        headers: { Authorization: '', 'x-supabase-auth': session.access_token },
      });
      if (error) throw new Error('Unable to start Stripe Connect onboarding.');
      const url = (data as any)?.url;
      if (!url) throw new Error('Stripe Connect URL not available.');
      window.location.href = url;
    } catch (err: any) {
      console.error('Error during Stripe Connect', err);
      toast.error(err?.message || 'Unable to connect Stripe. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;

    if (selected) {
      const MAX_FILE_SIZE_MB = 500;
      const isImage = selected.type.startsWith('image/');
      const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
      const isVideo = allowedVideoTypes.includes(selected.type);

      if (!isImage && !isVideo) {
        toast.error('Please upload an image or a supported video file (MP4, MOV, WebM).');
        event.target.value = '';
        setFile(null);
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return null;
        });
        return;
      }

      if (selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error('This file is too large. Please upload a file under 500 MB.');
        event.target.value = '';
        setFile(null);
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return null;
        });
        return;
      }
    }

    setFile(selected);

    if (selected) {
      const nextUrl = URL.createObjectURL(selected);
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
    } else {
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    }
  };

  useEffect(() => {
    let isMounted = true;

    const fetchLibraryAssets = async () => {
      setIsLoadingLibrary(true);
      setLibraryError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setIsLoadingLibrary(false);
        return;
      }

      // Check creator's Stripe Connect status before allowing link creation
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('stripe_connect_status, stripe_account_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (profileError) {
        console.error('Error loading profile for link creation', profileError);
      }

      const connectStatus = profile?.stripe_connect_status ?? null;
      setStripeConnectStatus(connectStatus);

      const hasStripeAccount = !!profile?.stripe_account_id;
      const isConnectComplete = connectStatus === 'complete';

      // Creators can only create paid links once their Stripe Connect account is fully onboarded
      setCanCreateLinks(hasStripeAccount && isConnectComplete);

      // Check if user has existing links (for copywriting in the header)
      const { count: linksCount } = await supabase
        .from('links')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', user.id);

      if (!isMounted) return;
      setHasExistingLinks((linksCount ?? 0) > 0);

      const { data, error } = await supabase
        .from('assets')
        .select('id, title, created_at, storage_path, mime_type')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12);

      if (!isMounted) return;

      if (error) {
        console.error('Error loading assets for link creation', error);
        setLibraryError('Unable to load your library right now.');
      } else {
        const baseAssets = (data ?? []) as LibraryAsset[];

        // Generate signed URLs for previews so we can display a mosaic
        const withPreviews = await Promise.all(
          baseAssets.map(async (asset) => {
            if (!asset.storage_path) return { ...asset, previewUrl: null };

            const { data: signed, error: signedError } = await supabase.storage
              .from('paid-content')
              .createSignedUrl(asset.storage_path, 60 * 60);

            if (signedError || !signed?.signedUrl) {
              console.error('Error generating preview URL for asset', asset.id, signedError);
              return { ...asset, previewUrl: null };
            }

            return { ...asset, previewUrl: signed.signedUrl };
          })
        );

        setLibraryAssets(withPreviews);
      }

      setIsLoadingLibrary(false);
    };

    fetchLibraryAssets();

    return () => {
      isMounted = false;
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    };
  }, []);

  const generateSlug = (base: string) => {
    const normalized = base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${normalized || 'link'}-${suffix}`;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const safeTitle = title.trim().replace(/[\u0000-\u001F\u007F]/g, '');

    if (!safeTitle) {
      toast.error('Please enter a title for your link.');
      return;
    }

    const priceNumber = Number(price);
    if (!Number.isFinite(priceNumber) || priceNumber < 5) {
      toast.error('Minimum price is $5.00.');
      return;
    }

    if (!file && selectedAssetIds.length === 0) {
      toast.error('Please upload or attach at least one media file for this link.');
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to create a link.');
      }

      const slug = generateSlug(safeTitle);

      // 1. Create the link row with status 'published'
      const { data: insertedLinks, error: insertError } = await supabase
        .from('links')
        .insert({
          creator_id: user.id,
          title: safeTitle,
          description: description.trim() || null,
          price_cents: Math.round(priceNumber * 100),
          currency: 'USD',
          slug,
          status: 'published',
          show_on_profile: showOnProfile,
        })
        .select();

      if (insertError) {
        console.error(insertError);
        throw new Error('Unable to create link. Please try again.');
      }

      const linkId = insertedLinks[0].id as string;
      let storagePath: string | null = null;

      // 2. Upload primary file if present (kept as main media)
      if (file) {
        const fileExtension = file.name.split('.').pop() ?? 'bin';
        const objectName = `paid-content/${user.id}/${linkId}/original/content.${fileExtension}`;

        const { error: uploadError } = await supabase.storage
          .from('paid-content')
          .upload(objectName, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          console.error(uploadError);
          throw new Error('Upload failed. Please try again.');
        }

        storagePath = objectName;

        const { error: updateError } = await supabase
          .from('links')
          .update({ storage_path: storagePath })
          .eq('id', linkId);

        if (updateError) {
          console.error(updateError);
          throw new Error('Link was created but media could not be attached.');
        }
      }

      // 3. Attach assets from library via link_media
      if (selectedAssetIds.length > 0) {
        const rows = selectedAssetIds.map((assetId, index) => ({
          link_id: linkId,
          asset_id: assetId,
          position: index,
        }));

        const { error: linkMediaError } = await supabase.from('link_media').insert(rows);

        if (linkMediaError) {
          console.error(linkMediaError);
          toast.error('Link was created but some library media could not be attached.');
        }
      }

      toast.success('Your premium link has been created.');
      navigate('/app/links');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Something went wrong while creating your link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <main className="px-4 pb-16 max-w-5xl mx-auto">
        {canCreateLinks === false ? (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mt-6 sm:mt-10 max-w-xl mx-auto"
          >
            <div className="rounded-2xl border-2 border-dashed border-border bg-muted/20 p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Connect Stripe to start selling
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Connect your Stripe account to create and sell paid content links.
                </p>
                <Button
                  variant="hero"
                  disabled={isConnecting}
                  onClick={handleConnectStripe}
                  className="rounded-full"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {isConnecting ? 'Loading...' : 'Connect Stripe'}
                </Button>
              </div>
            </div>
          </motion.section>
        ) : (
          <>
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="mt-4 sm:mt-6 mb-8 flex items-start justify-between gap-4"
            >
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-exclu-ink/80 px-3 py-1 text-[11px] font-medium text-exclu-cloud/80 mb-3">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>Create a premium link</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-1">
                  Turn a media into a paid link
                </h1>
              </div>
              {hasExistingLinks && (
                <Button asChild variant="outline" size="sm" className="rounded-full border-exclu-arsenic/70">
                  <RouterLink to="/app/links">Back to links</RouterLink>
                </Button>
              )}
            </motion.section>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
            >
              <Card className="bg-gradient-to-br from-exclu-ink/95 via-exclu-phantom/40 to-exclu-ink/95 border border-exclu-arsenic/70 shadow-glow-lg rounded-2xl backdrop-blur-2xl">
                <CardHeader className="px-6 pt-6 pb-3 space-y-1">
                  <CardTitle className="text-base text-exclu-cloud">Link details</CardTitle>
                  <CardDescription className="text-xs text-exclu-space/80">
                    Your link will only be visible to fans once you publish it or share the URL directly.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-6">
                  <form className="space-y-6" onSubmit={handleSubmit}>
                    <div className="space-y-6">
                  {/* Text fields */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-exclu-space" htmlFor="title">
                        Title
                      </label>
                      <Input
                        id="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Example: Full HD teaser video"
                        className="h-10 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-sm"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-exclu-space" htmlFor="description">
                        Description (optional)
                      </label>
                      <Textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Give fans a short, enticing description of what they will unlock."
                        className="min-h-[96px] bg-black/60 border-exclu-arsenic/70 text-exclu-cloud placeholder:text-exclu-space/50 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-exclu-space" htmlFor="price">
                        Price
                      </label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="price"
                          type="number"
                          min={5}
                          step={0.5}
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          className="h-10 bg-white border-exclu-arsenic/70 text-black text-sm"
                        />
                        <span className="text-xs text-exclu-space">USD</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-medium text-exclu-space">Visibility</p>
                      <div className="flex items-center justify-between p-3 rounded-xl border border-exclu-arsenic/70 bg-exclu-ink/50">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-exclu-space">Visible on public page</p>
                          <p className="text-xs text-exclu-space/60 mt-0.5">This link will appear on your public profile</p>
                        </div>
                        <Switch
                          checked={showOnProfile}
                          onCheckedChange={setShowOnProfile}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Upload + preview */}
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-exclu-space">Content source</p>
                    <div className="rounded-2xl border border-dashed border-exclu-arsenic/70 bg-exclu-ink/80 p-3 sm:p-4 flex flex-col items-center justify-center text-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary mb-1">
                        {file ? <Film className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
                      </div>
                      <div className="space-y-1 w-full">
                        <p className="text-sm font-medium text-exclu-cloud">
                          {file ? file.name : 'Upload a photo or video'}
                        </p>
                        <p className="text-[11px] text-exclu-space/80">
                          Drag & drop a file here, or click to browse. MP4, MOV, JPG, PNG are supported.
                        </p>
                        {previewUrl && (
                          <div className="mt-3 rounded-2xl overflow-hidden border border-exclu-arsenic/60 bg-black/40">
                            {file && file.type.startsWith('video/') ? (
                              <video
                                src={previewUrl}
                                className="w-full h-40 object-cover"
                                muted
                                loop
                                autoPlay
                              />
                            ) : (
                              <img src={previewUrl} className="w-full h-40 object-cover" alt={file?.name || 'Preview'} />
                            )}
                          </div>
                        )}
                      </div>
                      <label className="inline-flex items-center justify-center px-3 py-1.5 rounded-full bg-exclu-cloud text-[11px] font-medium text-black cursor-pointer hover:bg-white transition-colors">
                        <span>Choose file</span>
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </label>
                    </div>

                    {/* Library selection */}
                    <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/70 p-3 flex flex-col gap-2 text-[11px] text-exclu-space/80">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="h-4 w-4 text-exclu-space/80" />
                          <p className="font-medium text-exclu-cloud text-xs">Or attach media from your library</p>
                        </div>
                        {selectedAssetIds.length > 0 && (
                          <span className="text-[10px] text-exclu-space/70">
                            {selectedAssetIds.length} selected
                          </span>
                        )}
                      </div>

                      {isLoadingLibrary && (
                        <p className="text-[11px] text-exclu-space/80">Loading your library…</p>
                      )}

                      {libraryError && !isLoadingLibrary && (
                        <p className="text-[11px] text-red-400">{libraryError}</p>
                      )}

                      {!isLoadingLibrary && !libraryError && libraryAssets.length === 0 && (
                        <p className="text-[11px] text-exclu-space/80">
                          You haven&apos;t added anything to your library yet. Upload content in the Content tab.
                        </p>
                      )}

                      {!isLoadingLibrary && !libraryError && libraryAssets.length > 0 && (
                        <div className="max-h-52 overflow-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {libraryAssets.map((asset) => {
                            const isSelected = selectedAssetIds.includes(asset.id);
                            return (
                              <button
                                key={asset.id}
                                type="button"
                                onClick={() => {
                                  setSelectedAssetIds((prev) =>
                                    prev.includes(asset.id)
                                      ? prev.filter((id) => id !== asset.id)
                                      : [...prev, asset.id]
                                  );
                                }}
                                className={`group relative overflow-hidden rounded-xl border text-left transition-all duration-200 ${
                                  isSelected
                                    ? 'border-primary/80 bg-exclu-ink'
                                    : 'border-exclu-arsenic/60 bg-exclu-ink/80 hover:bg-exclu-ink'
                                }`}
                              >
                                {asset.previewUrl ? (
                                  asset.mime_type?.startsWith('video/') ? (
                                    <video
                                      src={asset.previewUrl}
                                      className="w-full h-24 object-cover transition-transform duration-300 group-hover:scale-105"
                                      muted
                                      loop
                                      playsInline
                                    />
                                  ) : (
                                    <img
                                      src={asset.previewUrl}
                                      className="w-full h-24 object-cover transition-transform duration-300 group-hover:scale-105"
                                      alt={asset.title || 'Library asset'}
                                    />
                                  )
                                ) : (
                                  <div className="w-full h-24 bg-gradient-to-br from-exclu-phantom/30 via-exclu-ink to-exclu-phantom/20" />
                                )}

                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                <div className="pointer-events-none absolute inset-x-0 bottom-0 p-1.5 flex flex-col">
                                  <p className="text-[10px] font-medium text-exclu-cloud truncate">
                                    {asset.title || 'Untitled asset'}
                                  </p>
                                  <p className="text-[9px] text-exclu-space/80">
                                    {new Date(asset.created_at).toLocaleDateString()}
                                  </p>
                                </div>

                                {isSelected && (
                                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary shadow-lg shadow-primary/50" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Preview of selected library assets */}
                      {selectedAssetIds.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-exclu-arsenic/40">
                          <p className="text-[10px] text-exclu-space/70 mb-2">Selected content preview:</p>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {selectedAssetIds.map((assetId) => {
                              const asset = libraryAssets.find((a) => a.id === assetId);
                              if (!asset) return null;
                              return (
                                <div key={assetId} className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-exclu-arsenic/60">
                                  {asset.previewUrl ? (
                                    asset.mime_type?.startsWith('video/') ? (
                                      <video src={asset.previewUrl} className="w-full h-full object-cover" muted playsInline />
                                    ) : (
                                      <img src={asset.previewUrl} className="w-full h-full object-cover" alt={asset.title || 'Selected'} />
                                    )
                                  ) : (
                                    <div className="w-full h-full bg-exclu-phantom/30" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 pt-2">
                  <p className="text-[11px] text-exclu-space/80">
                    You can change the price at any time.
                  </p>
                  <Button
                    type="submit"
                    variant="hero"
                    disabled={isSubmitting}
                    className="rounded-full px-6"
                  >
                    {isSubmitting ? 'Creating…' : 'Create link'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </>
    )}
  </main>
</AppShell>
);
};

export default CreateLink;
