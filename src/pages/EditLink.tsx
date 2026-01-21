import AppShell from '@/components/AppShell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { useEffect, useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { UploadCloud, Image as ImageIcon, Film, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

type LibraryAsset = {
  id: string;
  title: string | null;
  created_at: string;
  storage_path: string;
  mime_type: string | null;
  previewUrl?: string | null;
};

const EditLink = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('5');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(null);
  const [existingMediaIsVideo, setExistingMediaIsVideo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [existingAssetIds, setExistingAssetIds] = useState<string[]>([]);
  const [attachedAssets, setAttachedAssets] = useState<LibraryAsset[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLink = async () => {
      if (!id) return;
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('links')
        .select('title, description, price_cents, currency, storage_path')
        .eq('id', id)
        .single();

      if (error) {
        console.error(error);
        toast.error('Unable to load this link.');
        navigate('/app/links', { replace: true });
        return;
      }

      setTitle(data.title ?? '');
      setDescription(data.description ?? '');
      setPrice(String((data.price_cents ?? 0) / 100 || 0));

      // Load existing media preview if storage_path exists
      if (data.storage_path) {
        const ext = data.storage_path.split('.').pop()?.toLowerCase() ?? '';
        const isVideo = ['mp4', 'mov', 'webm', 'mkv'].includes(ext);
        setExistingMediaIsVideo(isVideo);

        const { data: signed } = await supabase.storage
          .from('paid-content')
          .createSignedUrl(data.storage_path, 60 * 60);

        if (signed?.signedUrl) {
          setExistingMediaUrl(signed.signedUrl);
        }
      }

      // Load existing link_media attachments with their asset details
      const { data: linkMedia } = await supabase
        .from('link_media')
        .select('asset_id, assets(id, title, created_at, storage_path, mime_type)')
        .eq('link_id', id)
        .order('position', { ascending: true });

      if (linkMedia && linkMedia.length > 0) {
        const assetIds = linkMedia.map((lm) => lm.asset_id);
        setExistingAssetIds(assetIds);
        setSelectedAssetIds(assetIds);

        // Generate previews for attached assets
        const attachedWithPreviews = await Promise.all(
          linkMedia.map(async (lm: any) => {
            const asset = lm.assets;
            if (!asset || !asset.storage_path) return null;

            const { data: signed } = await supabase.storage
              .from('paid-content')
              .createSignedUrl(asset.storage_path, 60 * 60);

            return {
              ...asset,
              previewUrl: signed?.signedUrl || null,
            } as LibraryAsset;
          })
        );

        setAttachedAssets(attachedWithPreviews.filter(Boolean) as LibraryAsset[]);
      }

      setIsLoading(false);
    };

    fetchLink();
  }, [id, navigate]);

  // Fetch library assets
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

      const { data, error } = await supabase
        .from('assets')
        .select('id, title, created_at, storage_path, mime_type')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12);

      if (!isMounted) return;

      if (error) {
        console.error('Error loading assets for link editing', error);
        setLibraryError('Unable to load your library right now.');
      } else {
        const baseAssets = (data ?? []) as LibraryAsset[];

        const withPreviews = await Promise.all(
          baseAssets.map(async (asset) => {
            if (!asset.storage_path) return { ...asset, previewUrl: null };

            const { data: signed, error: signedError } = await supabase.storage
              .from('paid-content')
              .createSignedUrl(asset.storage_path, 60 * 60);

            if (signedError || !signed?.signedUrl) {
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
    };
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
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
    return () => {
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;

    if (!title.trim()) {
      toast.error('Please enter a title for your link.');
      return;
    }

    const priceNumber = Number(price);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      toast.error('Please enter a valid price greater than 0.');
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to edit a link.');
      }

      // 1. Update link fields
      const { error: updateLinkError } = await supabase
        .from('links')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          price_cents: Math.round(priceNumber * 100),
        })
        .eq('id', id)
        .eq('creator_id', user.id);

      if (updateLinkError) {
        console.error(updateLinkError);
        throw new Error('Unable to save changes. Please try again.');
      }

      // 2. Upload new media if provided
      if (file) {
        const fileExtension = file.name.split('.').pop() ?? 'bin';
        const objectName = `paid-content/${user.id}/${id}/original/content.${fileExtension}`;

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

        const { error: updateStorageError } = await supabase
          .from('links')
          .update({ storage_path: objectName })
          .eq('id', id)
          .eq('creator_id', user.id);

        if (updateStorageError) {
          console.error(updateStorageError);
          throw new Error('The file was uploaded but could not be attached to the link.');
        }
      }

      // 3. Update link_media if selection changed
      const addedAssets = selectedAssetIds.filter((assetId) => !existingAssetIds.includes(assetId));
      const removedAssets = existingAssetIds.filter((assetId) => !selectedAssetIds.includes(assetId));

      if (removedAssets.length > 0) {
        const { error: deleteError } = await supabase
          .from('link_media')
          .delete()
          .eq('link_id', id)
          .in('asset_id', removedAssets);

        if (deleteError) {
          console.error('Error removing link_media', deleteError);
        }
      }

      if (addedAssets.length > 0) {
        const existingCount = existingAssetIds.length - removedAssets.length;
        const rows = addedAssets.map((assetId, index) => ({
          link_id: id,
          asset_id: assetId,
          position: existingCount + index,
        }));

        const { error: insertError } = await supabase.from('link_media').insert(rows);

        if (insertError) {
          console.error('Error adding link_media', insertError);
          toast.error('Some library media could not be attached.');
        }
      }

      toast.success('Your link has been updated.');
      navigate('/app/links');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Something went wrong while updating your link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <main className="px-4 pb-16 max-w-5xl mx-auto">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mt-4 sm:mt-6 mb-8 flex items-start justify-between gap-4"
        >
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-exclu-ink/80 px-3 py-1 text-[11px] font-medium text-exclu-cloud/80 mb-3">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Edit your link</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-1">
              Adjust details or update the media
            </h1>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full border-exclu-arsenic/70">
            <RouterLink to="/app/links">Back to links</RouterLink>
          </Button>
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
                Edit the information your fans will see and optionally replace the attached media.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-6">
              {isLoading ? (
                <p className="text-sm text-exclu-space">Loading link details...</p>
              ) : (
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
                          className="min-h-[96px] bg-exclu-ink border-exclu-arsenic/70 text-exclu-cloud placeholder:text-exclu-space/70 text-sm"
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
                            min={1}
                            step={0.5}
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="h-10 bg-white border-exclu-arsenic/70 text-black text-sm"
                          />
                          <span className="text-xs text-exclu-space">EUR</span>
                        </div>
                      </div>
                    </div>

                    {/* Upload + preview + library info */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-exclu-space">Content source</p>
                      <div className="rounded-2xl border border-dashed border-exclu-arsenic/70 bg-exclu-ink/80 p-4 flex flex-col items-center justify-center text-center gap-3">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-1">
                          {file ? <Film className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
                        </div>
                        <div className="space-y-1 w-full">
                          <p className="text-sm font-medium text-exclu-cloud">
                            {file ? file.name : 'Upload a new photo or video (optional)'}
                          </p>
                          <p className="text-[11px] text-exclu-space/80">
                            If you don&apos;t upload anything, the existing media will be kept. MP4, MOV, JPG, PNG are supported.
                          </p>
                          {/* Show existing media if no new file selected */}
                          {!previewUrl && existingMediaUrl && (
                            <div className="mt-3 rounded-xl overflow-hidden border border-exclu-arsenic/60 bg-black/40 relative">
                              <p className="absolute top-2 left-2 text-[10px] bg-black/60 text-exclu-cloud px-2 py-0.5 rounded-full">Current media</p>
                              {existingMediaIsVideo ? (
                                <video
                                  src={existingMediaUrl}
                                  className="w-full h-40 object-cover"
                                  muted
                                  loop
                                  autoPlay
                                  playsInline
                                />
                              ) : (
                                <img src={existingMediaUrl} className="w-full h-40 object-cover" alt="Current media" />
                              )}
                            </div>
                          )}
                          {previewUrl && (
                            <div className="mt-3 rounded-xl overflow-hidden border border-exclu-arsenic/60 bg-black/40">
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
                                        ? prev.filter((aid) => aid !== asset.id)
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

                        {/* Preview of selected/attached assets */}
                        {selectedAssetIds.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-exclu-arsenic/40">
                            <p className="text-[10px] text-exclu-space/70 mb-2">Attached content:</p>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {selectedAssetIds.map((assetId) => {
                                const asset = libraryAssets.find((a) => a.id === assetId) || attachedAssets.find((a) => a.id === assetId);
                                if (!asset) return null;
                                return (
                                  <div key={assetId} className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-exclu-arsenic/60">
                                    {asset.previewUrl ? (
                                      asset.mime_type?.startsWith('video/') ? (
                                        <video src={asset.previewUrl} className="w-full h-full object-cover" muted playsInline />
                                      ) : (
                                        <img src={asset.previewUrl} className="w-full h-full object-cover" alt={asset.title || 'Attached'} />
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
                      You can change these settings at any time.
                    </p>
                    <Button
                      type="submit"
                      variant="hero"
                      size="lg"
                      className="inline-flex items-center gap-2"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Saving changes...' : 'Save changes'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </AppShell>
  );
};

export default EditLink;
