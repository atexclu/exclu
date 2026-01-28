import AppShell from '@/components/AppShell';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus } from 'lucide-react';

type LibraryAsset = {
  id: string;
  title: string | null;
  created_at: string;
  storage_path: string;
  mime_type: string | null;
  previewUrl?: string | null;
};

const ContentLibrary = () => {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [assetTitle, setAssetTitle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<LibraryAsset | null>(null);

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

      const { data, error } = await supabase
        .from('assets')
        .select('id, title, created_at, storage_path, mime_type')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false });

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

            const { data: signed, error: signedError } = await supabase.storage
              .from('paid-content')
              .createSignedUrl(asset.storage_path, 60 * 60); // 1 hour

            if (signedError || !signed?.signedUrl) {
              console.error('Error generating preview URL for asset', asset.id, signedError);
              return { ...asset, previewUrl: null };
            }

            return { ...asset, previewUrl: signed.signedUrl };
          })
        );

        setAssets(withPreviews);
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
    const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    const accepted: File[] = [];
    let hadInvalid = false;

    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isVideo = allowedVideoTypes.includes(file.type);

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

    if (hadInvalid) {
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

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to upload content.');
      }

      const newAssets: LibraryAsset[] = [];

      for (const file of selectedFiles) {
        const assetId = crypto.randomUUID();
        const ext = file.name.split('.').pop() ?? 'bin';
        const objectName = `paid-content/${user.id}/assets/${assetId}/original/content.${ext}`;

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

        const { data: inserted, error: insertError } = await supabase
          .from('assets')
          .insert({
            id: assetId,
            creator_id: user.id,
            title: assetTitle.trim() || null,
            storage_path: objectName,
            mime_type: file.type || null,
          })
          .select('id, title, created_at, storage_path, mime_type')
          .single();

        if (insertError || !inserted) {
          console.error(insertError);
          throw new Error('Content was uploaded but could not be saved.');
        }

        // Create a signed URL for immediate preview of the newly uploaded asset
        let previewUrl: string | null = null;
        if (inserted.storage_path) {
          const { data: signed, error: signedError } = await supabase.storage
            .from('paid-content')
            .createSignedUrl(inserted.storage_path as string, 60 * 60);

          if (!signedError && signed?.signedUrl) {
            previewUrl = signed.signedUrl;
          }
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

  return (
    <AppShell>
      <main className="px-4 pb-16 max-w-6xl mx-auto">
        {/* Header with New content button */}
        <section className="mt-4 sm:mt-6 mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-1">Content</h1>
            <p className="text-exclu-space text-sm max-w-xl">
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
              <div className="flex items-center justify-between gap-3 mb-4">
                <p className="text-xs text-exclu-space/70">{assets.length} item{assets.length > 1 ? 's' : ''}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setPreviewAsset(asset)}
                    className="group relative overflow-hidden rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 shadow-glow-sm text-left cursor-pointer transition-all hover:border-primary/50"
                  >
                    {asset.previewUrl ? (
                      asset.mime_type?.startsWith('video/') ? (
                        <video
                          src={asset.previewUrl}
                          className="w-full h-32 sm:h-40 object-cover transition-transform duration-300 group-hover:scale-105"
                          muted
                          loop
                          playsInline
                        />
                      ) : (
                        <img
                          src={asset.previewUrl}
                          className="w-full h-32 sm:h-40 object-cover transition-transform duration-300 group-hover:scale-105"
                          alt={asset.title || 'Library asset'}
                        />
                      )
                    ) : (
                      <div className="w-full h-32 sm:h-40 bg-gradient-to-br from-exclu-phantom/30 via-exclu-ink to-exclu-phantom/20" />
                    )}

                    {/* Hover gradient overlay */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    {/* Bottom text overlay */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 sm:p-2.5 flex flex-col">
                      <p className="text-[11px] sm:text-xs font-medium text-exclu-cloud truncate">
                        {asset.title || 'Untitled asset'}
                      </p>
                      <p className="text-[10px] text-exclu-space/80">
                        {new Date(asset.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-gradient-to-br from-black/90 via-exclu-ink/90 to-purple-950/80 backdrop-blur-sm"
            onClick={closeUploadModal}
          />
          <div className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-exclu-arsenic/40">
              <h2 className="text-lg font-semibold text-exclu-cloud">Upload new content</h2>
              <button
                onClick={closeUploadModal}
                className="p-1.5 rounded-lg hover:bg-exclu-arsenic/30 transition-colors"
              >
                <X className="w-5 h-5 text-exclu-space" />
              </button>
            </div>
            <form className="p-4 space-y-4" onSubmit={handleAssetUpload}>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-exclu-space" htmlFor="asset-title">
                  Title (optional)
                </label>
                <Input
                  id="asset-title"
                  value={assetTitle}
                  onChange={(e) => setAssetTitle(e.target.value)}
                  placeholder="Example: Behind the scenes shot"
                  className="h-10 bg-white border-exclu-arsenic/60 text-black placeholder:text-slate-500"
                />
              </div>

              <div className="rounded-2xl border border-dashed border-exclu-arsenic/60 bg-exclu-ink/60 px-4 py-6 flex flex-col items-center justify-center text-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary">
                  <Plus className="w-6 h-6" />
                </div>
                <div className="space-y-1 w-full">
                  <p className="text-sm font-medium text-exclu-cloud">
                    {selectedFiles.length === 0
                      ? 'Choose one or more files'
                      : selectedFiles.length === 1
                      ? selectedFiles[0].name
                      : `${selectedFiles[0].name} + ${selectedFiles.length - 1} more`}
                  </p>
                  <p className="text-[11px] text-exclu-space/70">
                    MP4, MOV, JPG, PNG supported
                  </p>
                  {previewUrls[0] && (
                    <div className="mt-3 rounded-xl overflow-hidden border border-exclu-arsenic/60 bg-black/40 max-h-40">
                      {selectedFiles[0] && selectedFiles[0].type.startsWith('video/') ? (
                        <video src={previewUrls[0]} className="w-full h-40 object-cover" muted loop autoPlay />
                      ) : (
                        <img
                          src={previewUrls[0]}
                          className="w-full h-40 object-cover"
                          alt={selectedFiles[0]?.name || 'Preview'}
                        />
                      )}
                    </div>
                  )}
                </div>
                <label className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-exclu-cloud text-xs font-medium text-black cursor-pointer hover:bg-white transition-colors">
                  <span>Select files</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleAssetFileChange}
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full border-exclu-arsenic/60"
                  onClick={closeUploadModal}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="hero"
                  size="sm"
                  className="rounded-full"
                  disabled={isUploadingAsset || selectedFiles.length === 0}
                >
                  {isUploadingAsset ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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
