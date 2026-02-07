import AppShell from '@/components/AppShell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { motion } from 'framer-motion';
import { useEffect, useState, FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { UploadCloud, Film, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { AttachedContentManager, AttachedMedia } from '@/components/AttachedContentManager';

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
  const [attachedMedia, setAttachedMedia] = useState<AttachedMedia[]>([]);
  const [initialAttachedMedia, setInitialAttachedMedia] = useState<AttachedMedia[]>([]);
  const [showOnProfile, setShowOnProfile] = useState(false);

  useEffect(() => {
    const fetchLink = async () => {
      if (!id) return;
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('links')
        .select('title, description, price_cents, currency, storage_path, show_on_profile')
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
      setShowOnProfile(data.show_on_profile ?? false);

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
        // Generate previews for attached assets
        const attachedWithPreviews = await Promise.all(
          linkMedia.map(async (lm: any) => {
            const asset = lm.assets;
            if (!asset || !asset.storage_path) return null;

            const { data: signed } = await supabase.storage
              .from('paid-content')
              .createSignedUrl(asset.storage_path, 60 * 60);

            return {
              id: asset.id,
              asset_id: asset.id,
              storage_path: asset.storage_path,
              mime_type: asset.mime_type,
              title: asset.title,
              previewUrl: signed?.signedUrl || null,
            } as AttachedMedia;
          })
        );

        const validMedia = attachedWithPreviews.filter(Boolean) as AttachedMedia[];
        setAttachedMedia(validMedia);
        setInitialAttachedMedia(validMedia);
      }

      setIsLoading(false);
    };

    fetchLink();
  }, [id, navigate]);


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

    const safeTitle = title.trim().replace(/[\u0000-\u001F\u007F]/g, '');

    if (!safeTitle) {
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
          title: safeTitle,
          description: description.trim() || null,
          price_cents: Math.round(priceNumber * 100),
          show_on_profile: showOnProfile,
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

      // 3. Update link_media based on attachedMedia changes
      const initialAssetIds = initialAttachedMedia.map((m) => m.asset_id).filter(Boolean) as string[];
      const currentAssetIds = attachedMedia.map((m) => m.asset_id).filter(Boolean) as string[];
      
      const addedAssets = currentAssetIds.filter((assetId) => !initialAssetIds.includes(assetId));
      const removedAssets = initialAssetIds.filter((assetId) => !currentAssetIds.includes(assetId));
      const hasOrderChanged = JSON.stringify(initialAssetIds) !== JSON.stringify(currentAssetIds);

      // Delete all existing link_media entries if there are changes
      if (removedAssets.length > 0 || hasOrderChanged) {
        const { error: deleteError } = await supabase
          .from('link_media')
          .delete()
          .eq('link_id', id);

        if (deleteError) {
          console.error('Error removing link_media', deleteError);
        }
      }

      // Re-insert all current attachments with correct positions
      if (attachedMedia.length > 0 && (addedAssets.length > 0 || hasOrderChanged)) {
        const rows = attachedMedia
          .filter((m) => m.asset_id)
          .map((media, index) => ({
            link_id: id,
            asset_id: media.asset_id!,
            position: index,
          }));

        if (rows.length > 0) {
          const { error: insertError } = await supabase.from('link_media').insert(rows);

          if (insertError) {
            console.error('Error adding link_media', insertError);
            toast.error('Some media could not be attached.');
          }
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

                      {/* Attached Content Manager */}
                      {id && (
                        <AttachedContentManager
                          linkId={id}
                          attachedMedia={attachedMedia}
                          onMediaChange={setAttachedMedia}
                          disabled={isSubmitting}
                        />
                      )}
                    </div>

                    {/* Visibility settings */}
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
