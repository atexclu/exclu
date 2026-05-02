import AppShell from '@/components/AppShell';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { X, Plus, ChevronDown, Check, Eye, EyeOff, Trash2, Link2 as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { maybeConvertHeic } from '@/lib/convertHeic';
import { getSignedUrl } from '@/lib/storageUtils';
import { generateBlurThumbnail } from '@/lib/blurThumbnail';
import { useProfiles } from '@/contexts/ProfileContext';
import { toast } from 'sonner';

type LibraryAsset = {
  id: string;
  title: string | null;
  created_at: string;
  storage_path: string;
  mime_type: string | null;
  previewUrl?: string | null;
  in_feed: boolean;
  is_public: boolean;
  feed_caption: string | null;
  feed_blur_path: string | null;
};

const ContentLibrary = () => {
  const { activeProfile } = useProfiles();
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [assetTitle, setAssetTitle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<LibraryAsset | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [feedFilter, setFeedFilter] = useState<'all' | 'in_feed' | 'not_in_feed'>('all');
  const location = useLocation();
  const navigate = useNavigate();

  // Handle URL actions
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new') {
      setShowUploadModal(true);
      // Clean up URL
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  useEffect(() => {
    let isMounted = true;

    const fetchAssets = async () => {
      setIsLoading(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!isMounted) return;
        setError('Unable to load your content library. Please sign in again.');
        setIsLoading(false);
        return;
      }

      const assetsQuery = supabase
        .from('assets')
        .select('id, title, created_at, storage_path, mime_type, in_feed, is_public, feed_caption, feed_blur_path')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const { data, error } = activeProfile?.id
        ? await assetsQuery.eq('profile_id', activeProfile.id)
        : await assetsQuery.eq('creator_id', user.id);

      if (!isMounted) return;

      if (error) {
        console.error('Error loading assets', error);
        setError('Unable to load your content library right now.');
        setAssets([]);
      } else {
        const baseAssets = (data ?? []) as LibraryAsset[];

        // Generate signed URLs for previews so we can display a media mosaic
        const withPreviews = await Promise.all(
          baseAssets.map(async (asset) => {
            if (!asset.storage_path) return { ...asset, previewUrl: null };

            const previewUrl = await getSignedUrl(asset.storage_path, 60 * 60);
            return { ...asset, previewUrl };
          })
        );

        // Self-heal orphans: an asset whose storage_path resolves to no signed
        // URL means the underlying storage file is gone (deleted manually or by
        // a past bug). The DB row is now useless — soft-delete it so it stops
        // showing up here and stops generating 400s. RLS allows creators to
        // update their own assets.
        const orphanIds = withPreviews
          .filter((a) => a.storage_path && !a.previewUrl)
          .map((a) => a.id);
        if (orphanIds.length > 0) {
          const { error: cleanErr } = await supabase
            .from('assets')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', orphanIds);
          if (cleanErr) {
            console.warn('[ContentLibrary] Failed to soft-delete orphan assets', cleanErr);
          } else {
            console.warn(`[ContentLibrary] Auto-cleaned ${orphanIds.length} orphan asset row(s) whose storage files were missing.`);
          }
        }

        // Hide assets without a usable preview from the library.
        const displayed = withPreviews.filter((a) => !a.storage_path || a.previewUrl);
        setAssets(displayed);
      }

      setIsLoading(false);
    };

    fetchAssets();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAssetFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      setSelectedFiles([]);
      setPreviewUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      return;
    }

    const MAX_FILE_SIZE_MB = 500;
    const videoExtensions = ['.mp4', '.mov', '.webm', '.m4v', '.hevc', '.avi', '.mkv'];
    const accepted: File[] = [];
    let hadInvalid = false;
    let hadZip = false;

    for (const file of files) {
      const fileName = file.name.toLowerCase();
      const isZip = fileName.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
      const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || fileName.endsWith('.heic') || fileName.endsWith('.heif');
      const isImage = file.type.startsWith('image/') || isHeic;
      const isVideo = file.type.startsWith('video/') || videoExtensions.some(ext => fileName.endsWith(ext));

      if (isZip) {
        hadZip = true;
        continue;
      }

      if (!isImage && !isVideo) {
        hadInvalid = true;
        continue;
      }

      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        hadInvalid = true;
        continue;
      }

      accepted.push(file);
    }

    if (hadZip) {
      setError('ZIP files are not supported. Please upload the photos and videos individually (you can select multiple files at once).');
    } else if (hadInvalid) {
      setError(
        'Some files were skipped because they are not supported images/videos or are larger than 500 MB.',
      );
    } else {
      setError(null);
    }

    setSelectedFiles(accepted);

    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return accepted.map((file) => URL.createObjectURL(file));
    });
  };

  useEffect(() => {
    return () => {
      setPreviewUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
    };
  }, []);

  const handleAssetUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedFiles.length === 0) return;

    setIsUploadingAsset(true);
    setUploadProgress({ current: 0, total: selectedFiles.length });

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to upload content.');
      }

      const newAssets: LibraryAsset[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const rawFile = selectedFiles[i];
        setUploadProgress({ current: i + 1, total: selectedFiles.length });
        const file = await maybeConvertHeic(rawFile);
        const assetId = crypto.randomUUID();
        const ext = file.name.split('.').pop() ?? 'bin';
        const objectName = `${user.id}/assets/${assetId}/original/content.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('paid-content')
          .upload(objectName, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          console.error(uploadError);
          throw new Error('Upload failed for one of the files. Please try again.');
        }

        const trimmedTitle = assetTitle.trim() || null;
        const { data: inserted, error: insertError } = await supabase
          .from('assets')
          .insert({
            id: assetId,
            creator_id: user.id,
            profile_id: activeProfile?.id || null,
            title: trimmedTitle,
            storage_path: objectName,
            mime_type: file.type || rawFile.type || null,
            in_feed: false,
            is_public: false,
            // Title doubles as the feed caption — what appears above the post
            // when the asset is shown in the feed. The creator can edit it
            // later via the inline caption editor.
            feed_caption: trimmedTitle ? trimmedTitle.slice(0, 500) : null,
            feed_blur_path: null,
          })
          .select('id, title, created_at, storage_path, mime_type, in_feed, is_public, feed_caption, feed_blur_path')
          .single();

        if (insertError || !inserted) {
          console.error(insertError);
          throw new Error('Content was uploaded but could not be saved.');
        }

        // Create a signed URL for immediate preview of the newly uploaded asset
        let previewUrl: string | null = null;
        if (inserted.storage_path) {
          previewUrl = await getSignedUrl(inserted.storage_path as string, 60 * 60);
        }

        newAssets.push({ ...(inserted as LibraryAsset), previewUrl });
      }

      setAssets((prev) => [...newAssets, ...prev]);
      setAssetTitle('');
      setSelectedFiles([]);
      setPreviewUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      setShowUploadModal(false);
    } catch (err: any) {
      console.error('Error uploading asset', err);
      setError(err?.message || 'Unable to upload content right now.');
    } finally {
      setIsUploadingAsset(false);
    }
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setAssetTitle('');
    setSelectedFiles([]);
    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
  };

  // Lazy: when an asset enters the feed, make sure its server-side blur
  // thumbnail exists. Subs-only posts use this thumbnail as the locked
  // preview shown to non-subscribers, so we always need one.
  const ensureBlurForAsset = async (asset: LibraryAsset): Promise<string | null> => {
    if (asset.feed_blur_path || !asset.storage_path) return asset.feed_blur_path ?? null;
    try {
      const signedUrl = await getSignedUrl(asset.storage_path, 60);
      if (!signedUrl) return null;
      const res = await fetch(signedUrl);
      if (!res.ok) return null;
      const blob = await res.blob();
      const mime = asset.mime_type ?? blob.type ?? 'image/jpeg';
      const file = new File([blob], `source-${asset.id}`, { type: mime });
      const blurBlob = await generateBlurThumbnail(file);
      if (!blurBlob) return null;

      const BUCKET_PREFIX = 'paid-content/';
      const relative = asset.storage_path.startsWith(BUCKET_PREFIX)
        ? asset.storage_path.slice(BUCKET_PREFIX.length)
        : asset.storage_path;
      const [ownerId] = relative.split('/');
      if (!ownerId) return null;
      const blurPath = `${ownerId}/assets/${asset.id}/preview/blur.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('paid-content')
        .upload(blurPath, blurBlob, { cacheControl: '31536000', upsert: true, contentType: 'image/jpeg' });
      if (uploadErr) throw uploadErr;
      await supabase.from('assets').update({ feed_blur_path: blurPath }).eq('id', asset.id);
      return blurPath;
    } catch (err) {
      console.warn('[ContentLibrary] Unable to generate blur preview', err);
      return null;
    }
  };

  // When an asset enters the feed, prepend its id to creator_profiles.content_order
  // (or profiles.content_order in legacy single-profile mode) so it shows up at
  // the very top of /app/home and the public profile feed. Filters out the id
  // first to avoid duplicates if it was already in the array.
  // Prepend the given asset ids to the creator's content_order so they show
  // up at the top of /app/home and the public profile feed. Filters duplicates
  // so re-toggling doesn't pollute the array. Returns true on success, false
  // on failure — caller surfaces the toast so the creator knows whether the
  // promotion stuck.
  const promoteToTopOfOrder = async (assetIds: string[], userId: string, profileId: string | null): Promise<boolean> => {
    if (assetIds.length === 0) return true;
    const targetTable = profileId ? 'creator_profiles' : 'profiles';
    const targetId = profileId ?? userId;
    const { data, error: readErr } = await supabase
      .from(targetTable)
      .select('content_order')
      .eq('id', targetId)
      .maybeSingle();
    if (readErr) {
      console.warn('[ContentLibrary] Could not read content_order', readErr);
      return false;
    }
    const existing = ((data as any)?.content_order ?? []) as string[];
    const next = [...assetIds, ...existing.filter((id) => !assetIds.includes(id))];
    const { error: writeErr } = await supabase
      .from(targetTable)
      .update({ content_order: next })
      .eq('id', targetId);
    if (writeErr) {
      console.warn('[ContentLibrary] Could not persist new content_order', writeErr);
      return false;
    }
    return true;
  };

  const handleToggleInFeed = async (assetId: string, currentInFeed: boolean) => {
    const newInFeed = !currentInFeed;

    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId ? { ...asset, in_feed: newInFeed } : asset,
      ),
    );

    const { error } = await supabase
      .from('assets')
      .update({ in_feed: newInFeed })
      .eq('id', assetId);

    if (error) {
      console.error('Error updating in_feed', error);
      toast.error('Failed to update feed visibility');
      setAssets((prev) =>
        prev.map((asset) =>
          asset.id === assetId ? { ...asset, in_feed: currentInFeed } : asset,
        ),
      );
      return;
    }

    if (newInFeed) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Await so the write is durable before we hint at the result. If the
        // creator navigates to /app/home immediately after the toast, the
        // fresh fetch there will already see the updated content_order.
        const ok = await promoteToTopOfOrder([assetId], user.id, activeProfile?.id || null);
        if (ok) {
          toast.success('Added to feed — top position');
        } else {
          toast.error("Added, but couldn't pin to top — drag in Profile → Feed if needed");
        }
      }
      const target = assets.find((a) => a.id === assetId);
      if (target && !target.feed_blur_path) {
        ensureBlurForAsset(target).then((blurPath) => {
          if (blurPath) {
            setAssets((prev) =>
              prev.map((a) => (a.id === assetId ? { ...a, feed_blur_path: blurPath } : a)),
            );
          }
        });
      }
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  };

  const selectAllVisible = () => {
    const visibleAssets = getFilteredAssets();
    setSelectedAssets(new Set(visibleAssets.map(a => a.id)));
  };

  const deselectAll = () => {
    setSelectedAssets(new Set());
  };

  const handleBulkInFeedChange = async (makeInFeed: boolean) => {
    const assetIds = Array.from(selectedAssets);
    if (assetIds.length === 0) return;

    const { error } = await supabase
      .from('assets')
      .update({ in_feed: makeInFeed })
      .in('id', assetIds);

    if (error) {
      console.error('Error updating bulk in_feed', error);
      toast.error('Failed to update feed visibility');
      return;
    }

    setAssets((prev) =>
      prev.map((asset) =>
        assetIds.includes(asset.id) ? { ...asset, in_feed: makeInFeed } : asset,
      ),
    );
    setSelectedAssets(new Set());

    if (makeInFeed) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const ok = await promoteToTopOfOrder(assetIds, user.id, activeProfile?.id || null);
        if (ok) {
          toast.success(`${assetIds.length} content${assetIds.length > 1 ? 's' : ''} added to your feed — top position`);
        } else {
          toast.success(`${assetIds.length} content${assetIds.length > 1 ? 's' : ''} added to your feed`);
        }
      }
      assets
        .filter((a) => assetIds.includes(a.id) && !a.feed_blur_path)
        .forEach((asset) => {
          ensureBlurForAsset(asset).then((blurPath) => {
            if (blurPath) {
              setAssets((prev) =>
                prev.map((a) => (a.id === asset.id ? { ...a, feed_blur_path: blurPath } : a)),
              );
            }
          });
        });
    } else {
      toast.success(`${assetIds.length} content${assetIds.length > 1 ? 's' : ''} removed from your feed.`);
    }
  };

  const handleBulkDelete = async () => {
    const assetIds = Array.from(selectedAssets);
    if (assetIds.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${assetIds.length} content${assetIds.length > 1 ? 's' : ''}? Links that already use this content will keep working.`
    );

    if (!confirmed) return;

    // Soft-delete so any link_media / purchase that references the asset
    // keeps resolving. The row + storage file stay; only the library hides it.
    const { error } = await supabase
      .from('assets')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', assetIds);

    if (error) {
      console.error('Error deleting assets', error);
      toast.error('Failed to delete content. Please try again.');
      return;
    }

    setAssets((prev) => prev.filter((asset) => !assetIds.includes(asset.id)));
    setSelectedAssets(new Set());
    toast.success(`${assetIds.length} content${assetIds.length > 1 ? 's' : ''} removed from your library.`);
  };

  const getFilteredAssets = () => {
    if (feedFilter === 'all') return assets;
    if (feedFilter === 'in_feed') return assets.filter((a) => a.in_feed);
    return assets.filter((a) => !a.in_feed);
  };

  return (
    <AppShell>
      <main className="px-4 lg:px-6 pb-16 w-full overflow-x-hidden">
        {/* Header with New content button */}
        <section className="mt-4 sm:mt-6 mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-1">Content</h1>
            <p className="text-exclu-space text-xs sm:text-sm max-w-xl">
              Your media library. Click on any item to view it in full size.
            </p>
          </div>
          <Button variant="hero" size="sm" onClick={() => setShowUploadModal(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New content
          </Button>
        </section>

        {error && (
          <p className="text-sm text-red-400 mb-4 max-w-xl">{error}</p>
        )}

        {/* Upload Section - Slides down from top */}
        <AnimatePresence>
          {showUploadModal && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden mb-6"
            >
              <div className="rounded-2xl border border-border bg-card shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-foreground">Upload new content</h2>
                  <button
                    type="button"
                    onClick={closeUploadModal}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                    aria-label="Close upload form"
                  >
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                <form className="space-y-6" onSubmit={handleAssetUpload}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground" htmlFor="asset-title">
                      Caption <span className="text-muted-foreground font-normal">(optional)</span>
                    </label>
                    <p className="text-[11px] text-muted-foreground -mt-1">
                      What's shown above the post in your feed. You can edit it later.
                    </p>
                    <Input
                      id="asset-title"
                      value={assetTitle}
                      onChange={(e) => setAssetTitle(e.target.value.slice(0, 500))}
                      placeholder="Example: Behind the scenes shot"
                      className="h-11 bg-primary/10 border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  <div className="relative rounded-2xl border-2 border-dashed border-border bg-muted/50 px-6 py-8 flex flex-col items-center justify-center text-center gap-4">
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary">
                      <Plus className="w-7 h-7" />
                    </div>
                    <div className="space-y-2 w-full">
                      <p className="text-sm font-semibold text-foreground">
                        {selectedFiles.length === 0
                          ? 'Choose one or more files'
                          : selectedFiles.length === 1
                            ? selectedFiles[0].name
                            : `${selectedFiles[0].name} + ${selectedFiles.length - 1} more`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        MP4, MOV, JPG, PNG supported
                      </p>
                      {previewUrls[0] && (
                        <div className="mt-4 rounded-xl overflow-hidden border border-border bg-muted max-h-48">
                          {selectedFiles[0] && selectedFiles[0].type.startsWith('video/') ? (
                            <video src={previewUrls[0]} className="w-full h-48 object-cover" muted loop autoPlay />
                          ) : (
                            <img
                              src={previewUrls[0]}
                              className="w-full h-48 object-cover"
                              alt={selectedFiles[0]?.name || 'Preview'}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      onChange={handleAssetFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeUploadModal}
                      className="rounded-full"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="hero"
                      disabled={isUploadingAsset || selectedFiles.length === 0}
                      className="rounded-full"
                    >
                      {isUploadingAsset
                      ? `Uploading ${uploadProgress.current}/${uploadProgress.total}…`
                      : 'Upload'}
                    </Button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gallery */}
        <section>
          {isLoading && <p className="text-sm text-exclu-space">Loading your content…</p>}

          {!isLoading && assets.length === 0 && (
            <div className="text-center py-16">
              <p className="text-exclu-space/80 mb-4">
                You haven&apos;t added anything to your library yet.
              </p>
              <Button variant="hero" size="sm" onClick={() => setShowUploadModal(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                Upload your first content
              </Button>
            </div>
          )}

          {!isLoading && assets.length > 0 && (
            <>
              {/* Toolbar with filters and bulk actions */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-exclu-space/70">{getFilteredAssets().length} item{getFilteredAssets().length > 1 ? 's' : ''}</p>

                    {/* Feed filter */}
                    <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80">
                      <button
                        onClick={() => setFeedFilter('all')}
                        className={`px-4 py-1.5 rounded-full font-medium transition-all ${feedFilter === 'all'
                          ? 'bg-primary text-white dark:text-black shadow-sm'
                          : 'hover:text-exclu-cloud'
                          }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFeedFilter('in_feed')}
                        className={`px-4 py-1.5 rounded-full font-medium transition-all flex items-center gap-1 ${feedFilter === 'in_feed'
                          ? 'bg-primary text-white dark:text-black shadow-sm'
                          : 'hover:text-exclu-cloud'
                          }`}
                      >
                        <Eye className="w-3 h-3" />
                        In feed
                      </button>
                      <button
                        onClick={() => setFeedFilter('not_in_feed')}
                        className={`px-4 py-1.5 rounded-full font-medium transition-all flex items-center gap-1 ${feedFilter === 'not_in_feed'
                          ? 'bg-primary text-white dark:text-black shadow-sm'
                          : 'hover:text-exclu-cloud'
                          }`}
                      >
                        <EyeOff className="w-3 h-3" />
                        Not in feed
                      </button>
                    </div>
                  </div>

                  {/* Select all - visible inline on mobile */}
                  <div className="sm:hidden">
                    {selectedAssets.size === 0 && getFilteredAssets().length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllVisible}
                        className="rounded-full text-xs h-8"
                      >
                        Select all
                      </Button>
                    )}
                  </div>
                </div>

                {/* Bulk actions */}
                {selectedAssets.size > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-exclu-cloud font-medium">{selectedAssets.size} selected</span>
                    <Button
                      size="sm"
                      onClick={() => {
                        const ids = Array.from(selectedAssets).join(',');
                        navigate(`/app/create-link?prefill_asset_ids=${encodeURIComponent(ids)}`);
                      }}
                      className="rounded-full text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <LinkIcon className="w-3 h-3 mr-1" />
                      Create payment link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBulkInFeedChange(true)}
                      className="rounded-full text-xs h-8"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Add to feed
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBulkInFeedChange(false)}
                      className="rounded-full text-xs h-8"
                    >
                      <EyeOff className="w-3 h-3 mr-1" />
                      Remove from feed
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBulkDelete}
                      className="rounded-full text-xs h-8 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={deselectAll}
                      className="rounded-full text-xs h-8"
                    >
                      Clear
                    </Button>
                  </div>
                )}

                {/* Select all button - desktop only (mobile version is inline above) */}
                {selectedAssets.size === 0 && getFilteredAssets().length > 0 && (
                  <div className="hidden sm:block">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllVisible}
                      className="rounded-full text-xs h-8"
                    >
                      Select all
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {getFilteredAssets().map((asset) => (
                  <div
                    key={asset.id}
                    className={`group relative overflow-hidden rounded-2xl border bg-exclu-ink/80 shadow-glow-sm transition-all ${selectedAssets.has(asset.id)
                      ? 'border-primary ring-2 ring-primary/50'
                      : 'border-exclu-arsenic/60 hover:border-primary/50'
                      }`}
                  >
                    {/* Selection checkbox */}
                    <div
                      className="absolute top-2 left-2 z-20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => toggleAssetSelection(asset.id)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedAssets.has(asset.id)
                          ? 'bg-primary border-primary'
                          : 'bg-black/60 border-white/40 backdrop-blur-sm hover:border-white/60'
                          }`}
                      >
                        {selectedAssets.has(asset.id) && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </button>
                    </div>

                    {/* In-feed switch — top-right, stops propagation so the click
                        doesn't open the preview modal. */}
                    <div
                      className="absolute top-2 right-2 z-20 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/85">
                        {asset.in_feed ? 'In feed' : 'Hidden'}
                      </span>
                      <Switch
                        checked={asset.in_feed}
                        onCheckedChange={() => handleToggleInFeed(asset.id, asset.in_feed)}
                        aria-label={asset.in_feed ? 'Remove from feed' : 'Add to feed'}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setPreviewAsset(asset)}
                      className="w-full text-left cursor-pointer"
                    >
                      <div className="relative w-full aspect-square">
                        {asset.previewUrl ? (
                          asset.mime_type?.startsWith('video/') ? (
                            <video
                              src={asset.previewUrl}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              muted
                              loop
                              playsInline
                            />
                          ) : (
                            <img
                              src={asset.previewUrl}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              alt={asset.title || 'Library asset'}
                            />
                          )
                        ) : (
                          <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-exclu-phantom/30 via-exclu-ink to-exclu-phantom/20" />
                        )}

                        {/* Permanent bottom gradient for text readability */}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />

                        {/* Hover gradient overlay */}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                        {/* Bottom text overlay */}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 sm:p-2.5 flex flex-col">
                          <p className="text-[11px] sm:text-xs font-medium text-white truncate">
                            {asset.feed_caption || asset.title || 'Untitled'}
                          </p>
                          <p className="text-[10px] text-white/70">
                            {new Date(asset.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {/* Preview Modal */}
      {previewAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={() => setPreviewAsset(null)}
          />
          {/* Column: caption input (top) → media (constrained so the bottom never
              touches the viewport edge). max-h on the column itself keeps the
              whole stack inside the screen on mobile and desktop. */}
          <div className="relative w-full max-w-[680px] flex flex-col items-stretch gap-4 max-h-[calc(100vh-3rem)]">
            <button
              onClick={() => setPreviewAsset(null)}
              className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 p-2 rounded-full bg-exclu-ink/90 hover:bg-exclu-arsenic/50 transition-colors z-10 border border-white/15"
              aria-label="Close preview"
            >
              <X className="w-5 h-5 text-exclu-cloud" />
            </button>

            {/* Caption editor — above the photo */}
            <div className="w-full">
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-white/55 mb-1.5">
                Caption (shown above the post in feed)
              </label>
              <textarea
                key={previewAsset.id}
                defaultValue={previewAsset.feed_caption ?? previewAsset.title ?? ''}
                onBlur={async (e) => {
                  const next = e.target.value.trim().slice(0, 500) || null;
                  if ((previewAsset.feed_caption ?? null) === next && (previewAsset.title ?? null) === next) return;
                  // Title and feed_caption are the same concept since the
                  // refonte. Write both so the library card label updates too.
                  const { error } = await supabase
                    .from('assets')
                    .update({ feed_caption: next, title: next })
                    .eq('id', previewAsset.id);
                  if (error) {
                    console.error('Failed to save caption', error);
                    toast.error('Failed to save caption');
                    return;
                  }
                  setAssets((prev) =>
                    prev.map((a) => (a.id === previewAsset.id ? { ...a, feed_caption: next, title: next } : a)),
                  );
                  setPreviewAsset((prev) => (prev ? { ...prev, feed_caption: next, title: next } : prev));
                  toast.success('Caption saved');
                }}
                rows={2}
                maxLength={500}
                placeholder="What appears above this post in your feed…"
                className="w-full resize-none rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Media — flex-1 lets it shrink to fill the remaining height; the
                inner img/video carries object-contain so it never overflows. */}
            <div className="flex-1 min-h-0 flex items-center justify-center">
              {previewAsset.previewUrl ? (
                previewAsset.mime_type?.startsWith('video/') ? (
                  <video
                    src={previewAsset.previewUrl}
                    className="max-w-full max-h-full rounded-lg"
                    controls
                    autoPlay
                  />
                ) : (
                  <img
                    src={previewAsset.previewUrl}
                    className="max-w-full max-h-full rounded-lg object-contain"
                    alt={previewAsset.feed_caption || previewAsset.title || 'Preview'}
                  />
                )
              ) : (
                <div className="w-64 h-64 bg-exclu-ink rounded-lg flex items-center justify-center">
                  <p className="text-exclu-space">No preview available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default ContentLibrary;
