import AppShell from '@/components/AppShell';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    setSelectedFiles(files);

    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return files.map((file) => URL.createObjectURL(file));
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
    } catch (err: any) {
      console.error('Error uploading asset', err);
      setError(err?.message || 'Unable to upload content right now.');
    } finally {
      setIsUploadingAsset(false);
    }
  };

  return (
    <AppShell>
      <main className="px-4 pb-16 max-w-6xl mx-auto">
        <section className="mb-8 flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-1">Content</h1>
            <p className="text-exclu-space text-sm max-w-xl">
              Upload and manage your media library. You&apos;ll soon be able to reuse these assets when creating links.
            </p>
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-400 mb-4 max-w-xl">{error}</p>
        )}

        {/* Upload zone */}
        <section className="mb-8">
          <div className="rounded-2xl border border-dashed border-exclu-arsenic/70 bg-gradient-to-br from-exclu-ink/95 via-exclu-phantom/30 to-exclu-ink/95 shadow-glow-lg p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-exclu-space/70 mb-3">Upload</p>
            <form className="space-y-4" onSubmit={handleAssetUpload}>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-exclu-space" htmlFor="asset-title">
                  Title (optional)
                </label>
                <Input
                  id="asset-title"
                  value={assetTitle}
                  onChange={(e) => setAssetTitle(e.target.value)}
                  placeholder="Example: Behind the scenes shot"
                  className="h-9 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-sm"
                />
              </div>

              <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 px-4 py-3 flex flex-col items-center justify-center text-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary mb-1">
                  <span className="text-[11px]">+</span>
                </div>
                <div className="space-y-1 w-full">
                  <p className="text-sm font-medium text-exclu-cloud">
                    {selectedFiles.length === 0
                      ? 'Choose one or more files to upload'
                      : selectedFiles.length === 1
                      ? selectedFiles[0].name
                      : `${selectedFiles[0].name} + ${selectedFiles.length - 1} more`}
                  </p>
                  <p className="text-[11px] text-exclu-space/80">
                    MP4, MOV, JPG, PNG. Max size depends on your Supabase Storage settings.
                  </p>
                  {previewUrls[0] && (
                    <div className="mt-3 rounded-xl overflow-hidden border border-exclu-arsenic/60 bg-black/40">
                      {selectedFiles[0] && selectedFiles[0].type.startsWith('video/') ? (
                        <video src={previewUrls[0]} className="w-full h-32 object-cover" muted loop autoPlay />
                      ) : (
                        <img
                          src={previewUrls[0]}
                          className="w-full h-32 object-cover"
                          alt={selectedFiles[0]?.name || 'Preview'}
                        />
                      )}
                    </div>
                  )}
                </div>
                <label className="inline-flex items-center justify-center px-3 py-1.5 rounded-full bg-exclu-cloud text-[11px] font-medium text-black cursor-pointer hover:bg-white transition-colors">
                  <span>Select file</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleAssetFileChange}
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-exclu-space/80">
                  Uploaded files are stored privately. Only you can see them.
                </p>
                <Button
                  type="submit"
                  variant="hero"
                  size="sm"
                  className="rounded-full text-xs px-4"
                  disabled={isUploadingAsset || selectedFiles.length === 0}
                >
                  {isUploadingAsset ? 'Uploading…' : 'Upload to library'}
                </Button>
              </div>
            </form>
          </div>
        </section>

        {/* Gallery */}
        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70">Gallery</p>
            {assets.length > 0 && (
              <p className="text-[11px] text-exclu-space/70">{assets.length} item{assets.length > 1 ? 's' : ''}</p>
            )}
          </div>

          {isLoading && <p className="text-sm text-exclu-space">Loading your content…</p>}

          {!isLoading && assets.length === 0 && (
            <p className="text-xs text-exclu-space/80">
              You haven&apos;t added anything to your library yet. Upload your first asset above.
            </p>
          )}

          {!isLoading && assets.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative overflow-hidden rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 shadow-glow-sm"
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
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
};

export default ContentLibrary;
