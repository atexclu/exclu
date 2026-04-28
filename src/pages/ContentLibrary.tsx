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
  is_public: boolean;
  feed_caption: string | null;
  is_feed_preview: boolean;
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
  // Default ON so the upload flow is feed-first; the creator still toggles it
  // off explicitly if they want the asset kept private for now.
  const [isPublic, setIsPublic] = useState(true);
  const [feedCaption, setFeedCaption] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
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
        .select('id, title, created_at, storage_path, mime_type, is_public, feed_caption, is_feed_preview, feed_blur_path')
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

        // Generate and upload a tiny pre-blurred thumbnail for the public feed.
        // The feed serves this path to non-subscribed viewers so the full-res
        // URL never appears in the page source. Failure is non-fatal.
        let blurPath: string | null = null;
        if (isPublic) {
          try {
            const blurBlob = await generateBlurThumbnail(file);
            if (blurBlob) {
              blurPath = `${user.id}/assets/${assetId}/preview/blur.jpg`;
              const { error: blurErr } = await supabase.storage
                .from('paid-content')
                .upload(blurPath, blurBlob, { cacheControl: '31536000', upsert: true, contentType: 'image/jpeg' });
              if (blurErr) {
                console.warn('Blur thumbnail upload failed — continuing without it', blurErr);
                blurPath = null;
              }
            }
          } catch (err) {
            console.warn('Blur thumbnail generation failed', err);
            blurPath = null;
          }
        }

        const { data: inserted, error: insertError } = await supabase
          .from('assets')
          .insert({
            id: assetId,
            creator_id: user.id,
            profile_id: activeProfile?.id || null,
            title: assetTitle.trim() || null,
            storage_path: objectName,
            mime_type: file.type || rawFile.type || null,
            is_public: isPublic,
            feed_caption: isPublic && feedCaption.trim() ? feedCaption.trim().slice(0, 500) : null,
            is_feed_preview: false,
            feed_blur_path: blurPath,
          })
          .select('id, title, created_at, storage_path, mime_type, is_public, feed_caption, is_feed_preview, feed_blur_path')
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
      setIsPublic(true);
      setFeedCaption('');
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
    setIsPublic(false);
    setFeedCaption('');
    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
  };

  const handleToggleVisibility = async (assetId: string, currentIsPublic: boolean) => {
    const newIsPublic = !currentIsPublic;

    const { error } = await supabase
      .from('assets')
      .update({ is_public: newIsPublic })
      .eq('id', assetId);

    if (error) {
      console.error('Error updating visibility', error);
      return;
    }

    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId ? { ...asset, is_public: newIsPublic } : asset
      )
    );
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

  const handleBulkVisibilityChange = async (makePublic: boolean) => {
    const assetIds = Array.from(selectedAssets);
    if (assetIds.length === 0) return;

    const { error } = await supabase
      .from('assets')
      .update({ is_public: makePublic })
      .in('id', assetIds);

    if (error) {
      console.error('Error updating bulk visibility', error);
      return;
    }

    setAssets((prev) =>
      prev.map((asset) =>
        assetIds.includes(asset.id) ? { ...asset, is_public: makePublic } : asset
      )
    );
    setSelectedAssets(new Set());
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
    if (visibilityFilter === 'all') return assets;
    if (visibilityFilter === 'public') return assets.filter(a => a.is_public);
    return assets.filter(a => !a.is_public);
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
                      Title (optional)
                    </label>
                    <Input
                      id="asset-title"
                      value={assetTitle}
                      onChange={(e) => setAssetTitle(e.target.value)}
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

                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Show in my feed</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Appears on your public profile. Non-subscribers see it blurred until they subscribe (or unblurred if you mark it as the free preview).
                      </p>
                    </div>
                    <Switch
                      checked={isPublic}
                      onCheckedChange={setIsPublic}
                    />
                  </div>

                  {isPublic && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground block">
                        Feed caption <span className="text-muted-foreground">(optional)</span>
                      </label>
                      <textarea
                        value={feedCaption}
                        onChange={(e) => setFeedCaption(e.target.value.slice(0, 500))}
                        rows={2}
                        placeholder="Legend shown above the post in your feed…"
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <p className="text-[10px] text-muted-foreground text-right">{feedCaption.length}/500</p>
                    </div>
                  )}

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

                    {/* Visibility filter */}
                    <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80">
                      <button
                        onClick={() => setVisibilityFilter('all')}
                        className={`px-4 py-1.5 rounded-full font-medium transition-all ${visibilityFilter === 'all'
                          ? 'bg-primary text-white dark:text-black shadow-sm'
                          : 'hover:text-exclu-cloud'
                          }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setVisibilityFilter('public')}
                        className={`px-4 py-1.5 rounded-full font-medium transition-all flex items-center gap-1 ${visibilityFilter === 'public'
                          ? 'bg-primary text-white dark:text-black shadow-sm'
                          : 'hover:text-exclu-cloud'
                          }`}
                      >
                        <Eye className="w-3 h-3" />
                        Public
                      </button>
                      <button
                        onClick={() => setVisibilityFilter('private')}
                        className={`px-4 py-1.5 rounded-full font-medium transition-all flex items-center gap-1 ${visibilityFilter === 'private'
                          ? 'bg-primary text-white dark:text-black shadow-sm'
                          : 'hover:text-exclu-cloud'
                          }`}
                      >
                        <EyeOff className="w-3 h-3" />
                        Private
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
                      onClick={() => handleBulkVisibilityChange(true)}
                      className="rounded-full text-xs h-8"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Make public
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBulkVisibilityChange(false)}
                      className="rounded-full text-xs h-8"
                    >
                      <EyeOff className="w-3 h-3 mr-1" />
                      Make private
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
                            {asset.title || 'Untitled asset'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={() => setPreviewAsset(null)}
          />
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setPreviewAsset(null)}
              className="absolute -top-12 right-0 p-2 rounded-full bg-exclu-ink/80 hover:bg-exclu-arsenic/50 transition-colors z-10"
            >
              <X className="w-6 h-6 text-exclu-cloud" />
            </button>
            {previewAsset.previewUrl ? (
              previewAsset.mime_type?.startsWith('video/') ? (
                <video
                  src={previewAsset.previewUrl}
                  className="max-w-full max-h-[85vh] rounded-lg"
                  controls
                  autoPlay
                />
              ) : (
                <img
                  src={previewAsset.previewUrl}
                  className="max-w-full max-h-[85vh] rounded-lg object-contain"
                  alt={previewAsset.title || 'Preview'}
                />
              )
            ) : (
              <div className="w-64 h-64 bg-exclu-ink rounded-lg flex items-center justify-center">
                <p className="text-exclu-space">No preview available</p>
              </div>
            )}
            {previewAsset.title && (
              <p className="mt-3 text-sm text-exclu-cloud font-medium">{previewAsset.title}</p>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default ContentLibrary;
