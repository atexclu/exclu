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
import { UploadCloud, Image as ImageIcon, Film, Sparkles, Heart, X } from 'lucide-react';
import { toast } from 'sonner';
import { maybeConvertHeic } from '@/lib/convertHeic';
import { getSignedUrl } from '@/lib/storageUtils';
import { useProfiles } from '@/contexts/ProfileContext';

type LibraryAsset = {
  id: string;
  title: string | null;
  created_at: string;
  storage_path: string;
  mime_type: string | null;
  previewUrl?: string | null;
};

const CreateLink = () => {
  const { activeProfile } = useProfiles();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('5');
  type PendingFile = { id: string; file: File; previewUrl: string; isVideo: boolean };
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [hasExistingLinks, setHasExistingLinks] = useState(false);
  const [canCreateLinks, setCanCreateLinks] = useState<boolean | null>(null);
  const [showOnProfile, setShowOnProfile] = useState(true);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (selected.length === 0) return;

    const MAX_FILE_SIZE_MB = 500;
    const videoExtensions = ['.mp4', '.mov', '.webm', '.m4v', '.hevc', '.avi', '.mkv'];
    const accepted: PendingFile[] = [];

    for (const f of selected) {
      const fileName = f.name.toLowerCase();
      const isZip = fileName.endsWith('.zip') || f.type === 'application/zip' || f.type === 'application/x-zip-compressed';
      const isHeic = f.type === 'image/heic' || f.type === 'image/heif' || fileName.endsWith('.heic') || fileName.endsWith('.heif');
      const isImage = f.type.startsWith('image/') || isHeic;
      const isVideo = f.type.startsWith('video/') || videoExtensions.some((ext) => fileName.endsWith(ext));

      if (isZip) {
        toast.error(`${f.name}: ZIP files are not supported. Upload photos and videos individually.`);
        continue;
      }
      if (!isImage && !isVideo) {
        toast.error(`${f.name}: only images and videos are supported.`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`${f.name}: file is too large (max 500 MB).`);
        continue;
      }

      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        isVideo,
      });
    }

    if (accepted.length > 0) setPendingFiles((prev) => [...prev, ...accepted]);
  };

  const removePendingFile = (id: string) => {
    setPendingFiles((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  useEffect(() => {
    let isMounted = true;

    // Parse prefilled asset IDs from the URL — set when the user launched
    // "Create payment link" from ContentLibrary's bulk actions bar.
    const rawPrefill = new URLSearchParams(window.location.search).get('prefill_asset_ids') ?? '';
    const prefillIds = rawPrefill
      ? rawPrefill.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

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

      // Links are always accessible — payment provider will be configured separately
      setCanCreateLinks(true);

      // Check if user has existing links (for copywriting in the header)
      const linksCountQuery = supabase
        .from('links')
        .select('id', { count: 'exact', head: true });
      const { count: linksCount } = activeProfile?.id
        ? await linksCountQuery.eq('profile_id', activeProfile.id)
        : await linksCountQuery.eq('creator_id', user.id);

      if (!isMounted) return;
      setHasExistingLinks((linksCount ?? 0) > 0);

      // Fetch the top 12 most recent assets PLUS any pre-filled IDs that
      // aren't already in the top 12 (so the prefill always survives the
      // library pagination).
      const assetsQuery = supabase
        .from('assets')
        .select('id, title, created_at, storage_path, mime_type')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(12);
      const { data: topData, error } = activeProfile?.id
        ? await assetsQuery.eq('profile_id', activeProfile.id)
        : await assetsQuery.eq('creator_id', user.id);

      let data = topData ?? [];
      if (prefillIds.length > 0) {
        const existingIds = new Set(data.map((a: { id: string }) => a.id));
        const missingPrefill = prefillIds.filter((id) => !existingIds.has(id));
        if (missingPrefill.length > 0) {
          const extraQuery = supabase
            .from('assets')
            .select('id, title, created_at, storage_path, mime_type')
            .in('id', missingPrefill)
            .is('deleted_at', null);
          const { data: extraData } = activeProfile?.id
            ? await extraQuery.eq('profile_id', activeProfile.id)
            : await extraQuery.eq('creator_id', user.id);
          if (extraData) data = [...extraData, ...data];
        }
      }

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

            const previewUrl = await getSignedUrl(asset.storage_path, 60 * 60);

            if (!previewUrl) {
              console.error('Error generating preview URL for asset', asset.id);
              return { ...asset, previewUrl: null };
            }

            return { ...asset, previewUrl };
          })
        );

        setLibraryAssets(withPreviews);
        // Auto-select any prefilled IDs that are actually in the library
        if (prefillIds.length > 0) {
          const validIds = new Set(withPreviews.map((a) => a.id));
          setSelectedAssetIds(prefillIds.filter((id) => validIds.has(id)));
        }
      }

      setIsLoadingLibrary(false);
    };

    fetchLibraryAssets();

    return () => {
      isMounted = false;
      setPendingFiles((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return [];
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

    if (pendingFiles.length === 0 && selectedAssetIds.length === 0) {
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

      // 1. Create the link row as 'draft' first — will be published only after upload succeeds
      const { data: insertedLinks, error: insertError } = await supabase
        .from('links')
        .insert({
          creator_id: user.id,
          profile_id: activeProfile?.id ?? null,
          title: safeTitle,
          description: description.trim() || null,
          price_cents: Math.round(priceNumber * 100),
          currency: 'USD',
          slug,
          status: 'draft',
          show_on_profile: showOnProfile,
        })
        .select();

      if (insertError) {
        console.error(insertError);
        throw new Error('Unable to create link. Please try again.');
      }

      const linkId = insertedLinks[0].id as string;

      // 2. Convert HEIC + upload all pending files in parallel. The first
      // file becomes the legacy primary (`links.storage_path`); the rest
      // become new `assets` rows attached via `link_media`.
      const converted = await Promise.all(pendingFiles.map((p) => maybeConvertHeic(p.file)));

      const uploadResults = await Promise.all(
        converted.map(async (convertedFile, i) => {
          const ext = convertedFile.name.split('.').pop() ?? 'bin';
          const objectName =
            i === 0
              ? `${user.id}/${linkId}/original/content.${ext}`
              : `${user.id}/${linkId}/attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}.${ext}`;

          const { error } = await supabase.storage
            .from('paid-content')
            .upload(objectName, convertedFile, { cacheControl: '3600', upsert: i === 0 });

          return { i, objectName, convertedFile, rawName: pendingFiles[i].file.name, error };
        })
      );

      const primaryUpload = uploadResults.find((r) => r.i === 0);
      if (primaryUpload?.error) {
        console.error(primaryUpload.error);
        await supabase.from('links').delete().eq('id', linkId);
        throw new Error('Upload failed. Please try again.');
      }

      const successfulExtras = uploadResults.filter((r) => r.i > 0 && !r.error);
      uploadResults
        .filter((r) => r.i > 0 && r.error)
        .forEach((r) => {
          console.error(r.error);
          toast.error(`${r.rawName}: upload failed, skipped.`);
        });

      // 3. Update primary storage_path + batch-insert extra assets in parallel.
      const [updatePrimary, insertedAssets] = await Promise.all([
        primaryUpload
          ? supabase.from('links').update({ storage_path: primaryUpload.objectName }).eq('id', linkId)
          : Promise.resolve({ error: null } as { error: null }),
        successfulExtras.length > 0
          ? supabase
              .from('assets')
              .insert(
                successfulExtras.map((r) => ({
                  creator_id: user.id,
                  profile_id: activeProfile?.id ?? null,
                  title: r.rawName,
                  storage_path: r.objectName,
                  mime_type: r.convertedFile.type || null,
                }))
              )
              .select('id, storage_path')
          : Promise.resolve({ data: [] as { id: string; storage_path: string }[], error: null }),
      ]);

      if (updatePrimary.error) {
        console.error(updatePrimary.error);
        await supabase.from('links').delete().eq('id', linkId);
        throw new Error('Link was created but media could not be attached.');
      }

      if (insertedAssets.error) {
        console.error(insertedAssets.error);
        await supabase.from('links').delete().eq('id', linkId);
        throw new Error('Link was created but extra media could not be registered.');
      }

      // Re-order extras by upload index so positions stay deterministic.
      const assetByPath = new Map(
        ((insertedAssets.data ?? []) as { id: string; storage_path: string }[]).map((a) => [a.storage_path, a.id])
      );
      const extraAssetIds = successfulExtras
        .map((r) => assetByPath.get(r.objectName))
        .filter((id): id is string => Boolean(id));

      // 4. Attach library assets + extra uploads via link_media BEFORE
      // publishing so the `links_require_content` DB trigger sees the
      // content it requires.
      const allAttachedAssetIds = [...selectedAssetIds, ...extraAssetIds];
      if (allAttachedAssetIds.length > 0) {
        const rows = allAttachedAssetIds.map((assetId, index) => ({
          link_id: linkId,
          asset_id: assetId,
          position: index,
        }));

        const { error: linkMediaError } = await supabase.from('link_media').insert(rows);

        if (linkMediaError) {
          console.error(linkMediaError);
          await supabase.from('links').delete().eq('id', linkId);
          throw new Error('Link was created but library media could not be attached.');
        }
      }

      // 5. Publish the link now that content is guaranteed to be attached.
      const { error: publishError } = await supabase
        .from('links')
        .update({ status: 'published' })
        .eq('id', linkId);

      if (publishError) {
        console.error(publishError);
        throw new Error('Content was uploaded but the link could not be published.');
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
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {canCreateLinks && (
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
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground" htmlFor="title">
                            Title
                          </label>
                          <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Example: Full HD teaser video"
                            className="h-11 bg-primary/10 border-border text-foreground placeholder:text-muted-foreground"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground" htmlFor="description">
                            Description (optional)
                          </label>
                          <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Give fans a short, enticing description of what they will unlock."
                            className="min-h-[96px] bg-primary/10 border-border text-foreground placeholder:text-muted-foreground"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground" htmlFor="price">
                            Price (USD)
                          </label>
                          <Input
                            id="price"
                            type="number"
                            min={5}
                            step={0.5}
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="h-11 bg-primary/10 border-border text-foreground placeholder:text-muted-foreground"
                          />
                        </div>

                        <div className="space-y-3">
                          <p className="text-sm font-medium text-foreground">Options</p>
                          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">Visible on public page</p>
                              <p className="text-xs text-muted-foreground mt-0.5">This link will appear on your public profile</p>
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
                            {pendingFiles.length > 0 ? <Film className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
                          </div>
                          <div className="space-y-1 w-full">
                            <p className="text-sm font-medium text-exclu-cloud">
                              {pendingFiles.length > 0
                                ? `${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''} ready to upload`
                                : 'Upload photos or videos'}
                            </p>
                            <p className="text-[11px] text-exclu-space/80">
                              Drag & drop or click to browse. You can select several files at once. MP4, MOV, JPG, PNG, HEIC are supported.
                            </p>
                            {pendingFiles.length > 0 && (
                              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {pendingFiles.map((p) => (
                                  <div
                                    key={p.id}
                                    className="relative group rounded-xl overflow-hidden border border-exclu-arsenic/60 bg-black/40"
                                  >
                                    {p.isVideo ? (
                                      <video
                                        src={p.previewUrl}
                                        className="w-full h-28 object-cover"
                                        muted
                                        loop
                                        autoPlay
                                        playsInline
                                      />
                                    ) : (
                                      <img src={p.previewUrl} className="w-full h-28 object-cover" alt={p.file.name} />
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => removePendingFile(p.id)}
                                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500/80 transition-colors"
                                      aria-label={`Remove ${p.file.name}`}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                    <p className="absolute inset-x-0 bottom-0 px-2 py-1 text-[9px] text-exclu-cloud bg-gradient-to-t from-black/80 to-transparent truncate text-left">
                                      {p.file.name}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <label className="inline-flex items-center justify-center px-3 py-1.5 rounded-full bg-exclu-cloud text-[11px] font-medium text-black cursor-pointer hover:bg-white transition-colors">
                            <span>{pendingFiles.length > 0 ? 'Add more files' : 'Choose files'}</span>
                            <input
                              type="file"
                              accept="image/*,video/*,.heic,.heif"
                              multiple
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
                                    className={`group relative overflow-hidden rounded-xl border text-left transition-all duration-200 ${isSelected
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
