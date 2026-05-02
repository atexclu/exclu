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
import { UploadCloud, Film, Sparkles, X, Trash2, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { maybeConvertHeic } from '@/lib/convertHeic';
import { getSignedUrl } from '@/lib/storageUtils';
import { AttachedContentManager, AttachedMedia } from '@/components/AttachedContentManager';
import { useProfiles } from '@/contexts/ProfileContext';

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
  const { activeProfile } = useProfiles();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('5');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [attachedMedia, setAttachedMedia] = useState<AttachedMedia[]>([]);
  const [initialAttachedMedia, setInitialAttachedMedia] = useState<AttachedMedia[]>([]);
  const [showOnProfile, setShowOnProfile] = useState(false);
  const [isSupportLink, setIsSupportLink] = useState(false);
  const [initialStoragePath, setInitialStoragePath] = useState<string | null>(null);

  useEffect(() => {
    const fetchLink = async () => {
      if (!id) return;
      setIsLoading(true);

      const { data, error } = await supabase
        .from('links')
        .select('title, description, price_cents, currency, storage_path, show_on_profile, is_support_link')
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
      setIsSupportLink(data.is_support_link === true);
      setInitialStoragePath(data.storage_path ?? null);

      // Build a unified gallery: the legacy primary file (storage_path) is
      // injected as the first item of attachedMedia, flagged isPrimary so it
      // shows the badge and isn't draggable / removable. The remaining
      // link_media rows follow in their saved order.
      const unified: AttachedMedia[] = [];

      if (data.storage_path) {
        const ext = data.storage_path.split('.').pop()?.toLowerCase() ?? '';
        const isVideo = ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'hevc', 'avi'].includes(ext);
        const signedUrl = await getSignedUrl(data.storage_path, 60 * 60);
        unified.push({
          id: 'primary',
          isPrimary: true,
          storage_path: data.storage_path,
          mime_type: isVideo ? 'video/mp4' : 'image/jpeg',
          previewUrl: signedUrl || null,
          title: 'Primary content',
        });
      }

      // Load existing link_media attachments with their asset details
      const { data: linkMedia } = await supabase
        .from('link_media')
        .select('asset_id, assets(id, title, created_at, storage_path, mime_type)')
        .eq('link_id', id)
        .order('position', { ascending: true });

      if (linkMedia && linkMedia.length > 0) {
        const attachedWithPreviews = await Promise.all(
          linkMedia.map(async (lm: any) => {
            const asset = lm.assets;
            if (!asset || !asset.storage_path) return null;

            const signedUrl = await getSignedUrl(asset.storage_path, 60 * 60);

            return {
              id: asset.id,
              asset_id: asset.id,
              storage_path: asset.storage_path,
              mime_type: asset.mime_type,
              title: asset.title,
              previewUrl: signedUrl || null,
            } as AttachedMedia;
          })
        );

        unified.push(...(attachedWithPreviews.filter(Boolean) as AttachedMedia[]));
      }

      setAttachedMedia(unified);
      setInitialAttachedMedia(unified);

      setIsLoading(false);
    };

    fetchLink();
  }, [id, navigate]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;

    if (selected) {
      const MAX_FILE_SIZE_MB = 500;
      const fileName = selected.name.toLowerCase();
      const videoExtensions = ['.mp4', '.mov', '.webm', '.m4v', '.hevc', '.avi', '.mkv'];
      const isZip = fileName.endsWith('.zip') || selected.type === 'application/zip' || selected.type === 'application/x-zip-compressed';
      const isHeic = selected.type === 'image/heic' || selected.type === 'image/heif' || fileName.endsWith('.heic') || fileName.endsWith('.heif');
      const isImage = selected.type.startsWith('image/') || isHeic;
      const isVideo = selected.type.startsWith('video/') || videoExtensions.some(ext => fileName.endsWith(ext));

      if (isZip) {
        toast.error('ZIP files are not supported. Please upload the photos and videos individually (you can select multiple files at once).');
        event.target.value = '';
        setFile(null);
        return;
      }

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
    if (!Number.isFinite(priceNumber) || priceNumber < 5) {
      toast.error('Minimum price is $5.00.');
      return;
    }

    // Mirrors the links_require_content DB trigger so users get a friendly
    // error instead of a raw 23514 check_violation.
    const willHaveContent = Boolean(
      file || attachedMedia.length > 0 || initialStoragePath,
    );
    if (!isSupportLink && !willHaveContent) {
      toast.error('This link has no content attached. Upload a file or attach a library asset before saving.');
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
          is_support_link: isSupportLink,
        })
        .eq('id', id)
        .eq('creator_id', user.id);

      if (updateLinkError) {
        console.error(updateLinkError);
        throw new Error('Unable to save changes. Please try again.');
      }

      // 2. Build the canonical save list. If the user picked a "Replace
      // primary content" file, upload it and replace the synthetic primary
      // entry in attachedMedia. The new primary keeps the index it had in
      // the gallery (the synthetic primary the user can drag).
      const saveOrder: AttachedMedia[] = [...attachedMedia];

      if (file) {
        const convertedFile = await maybeConvertHeic(file);
        const fileExtension = convertedFile.name.split('.').pop() ?? 'bin';
        const objectName = `${user.id}/${id}/original/content.${fileExtension}`;

        const { error: uploadError } = await supabase.storage
          .from('paid-content')
          .upload(objectName, convertedFile, { cacheControl: '3600', upsert: true });

        if (uploadError) {
          console.error(uploadError);
          throw new Error('Upload failed. Please try again.');
        }

        const replacement: AttachedMedia = {
          id: 'primary',
          isPrimary: true,
          storage_path: objectName,
          mime_type: convertedFile.type || null,
          previewUrl: null,
          title: 'Primary content',
        };

        const oldPrimaryIdx = saveOrder.findIndex((m) => m.isPrimary);
        if (oldPrimaryIdx >= 0) saveOrder[oldPrimaryIdx] = replacement;
        else saveOrder.unshift(replacement);
      }

      if (saveOrder.length === 0 && !isSupportLink) {
        throw new Error('A link must have at least one piece of content.');
      }

      // 3. Promote any synthetic primary that's no longer at index 0 into a
      // real `assets` row so it can be attached via link_media.
      for (let i = 1; i < saveOrder.length; i++) {
        const item = saveOrder[i];
        if (item.isPrimary && !item.asset_id) {
          const { data: assetRow, error: assetErr } = await supabase
            .from('assets')
            .insert({
              creator_id: user.id,
              profile_id: activeProfile?.id ?? null,
              title: item.title || 'Primary content',
              storage_path: item.storage_path,
              mime_type: item.mime_type,
            })
            .select('id')
            .single();
          if (assetErr || !assetRow) {
            console.error('Error promoting primary to asset', assetErr);
            throw new Error('Could not save the new content order. Please try again.');
          }
          saveOrder[i] = { ...item, asset_id: assetRow.id, isPrimary: false };
        }
      }

      // 4. Whatever sits at index 0 becomes the new `links.storage_path`.
      const newPrimary = saveOrder[0];
      if (newPrimary && newPrimary.storage_path !== initialStoragePath) {
        const { error: updateStorageError } = await supabase
          .from('links')
          .update({ storage_path: newPrimary.storage_path })
          .eq('id', id)
          .eq('creator_id', user.id);
        if (updateStorageError) {
          console.error(updateStorageError);
          throw new Error('Could not update the primary content reference.');
        }
      }

      // 5. Replace link_media with everything past index 0 in current order.
      const { error: deleteError } = await supabase
        .from('link_media')
        .delete()
        .eq('link_id', id);
      if (deleteError) {
        console.error('Error clearing link_media', deleteError);
      }

      const linkMediaRows = saveOrder
        .slice(1)
        .filter((m) => m.asset_id)
        .map((m, index) => ({ link_id: id, asset_id: m.asset_id!, position: index }));

      if (linkMediaRows.length > 0) {
        const { error: insertError } = await supabase.from('link_media').insert(linkMediaRows);
        if (insertError) {
          console.error('Error adding link_media', insertError);
          toast.error('Some media could not be attached.');
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

  const handleDelete = async () => {
    if (!id || !window.confirm('Are you sure you want to delete this link? This action is permanent and will remove all attached media.')) {
      return;
    }

    setIsSubmitting(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to delete a link.');
      }

      // 1. Get storage path before deleting to cleanup storage
      const { data: linkData } = await supabase
        .from('links')
        .select('storage_path')
        .eq('id', id)
        .single();

      // 2. Delete the link (CASCADE should handle link_media)
      const { error: deleteError } = await supabase
        .from('links')
        .delete()
        .eq('id', id)
        .eq('creator_id', user.id);

      if (deleteError) throw deleteError;

      // 3. Cleanup storage if path exists
      if (linkData?.storage_path) {
        await supabase.storage.from('paid-content').remove([linkData.storage_path]);
      }

      toast.success('Link deleted successfully.');
      navigate('/app/links');
    } catch (error: any) {
      console.error('Error deleting link:', error);
      toast.error(error?.message || 'Failed to delete link.');
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
                            min={5}
                            step={0.5}
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="h-10 bg-white border-exclu-arsenic/70 text-black text-sm"
                          />
                          <span className="text-xs text-exclu-space">USD</span>
                        </div>
                      </div>

                      {/* Attached Content Manager */}
                      {!isSupportLink && id && (
                        <AttachedContentManager
                          linkId={id}
                          attachedMedia={attachedMedia}
                          onMediaChange={setAttachedMedia}
                          disabled={isSubmitting}
                        />
                      )}
                    </div>

                    {/* Options */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-exclu-space">Options</p>
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
                      <div className="flex items-center justify-between p-3 rounded-xl border border-exclu-arsenic/70 bg-exclu-ink/50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Heart className="w-4 h-4 text-pink-400" />
                            <p className="text-sm font-medium text-exclu-space">Support link</p>
                          </div>
                          <p className="text-xs text-exclu-space/60 mt-0.5">No content attached — fans pay to support you directly</p>
                        </div>
                        <Switch
                          checked={isSupportLink}
                          onCheckedChange={setIsSupportLink}
                        />
                      </div>
                    </div>

                    {/* Replace primary file (hidden for support links) */}
                    {!isSupportLink && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-exclu-space">Replace primary content</p>
                      <div className="rounded-2xl border border-dashed border-exclu-arsenic/70 bg-exclu-ink/80 p-4 flex flex-col items-center justify-center text-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary">
                          {file ? <Film className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
                        </div>
                        <div className="space-y-1 w-full">
                          <p className="text-sm font-medium text-exclu-cloud">
                            {file ? file.name : 'Upload a new file to replace the primary'}
                          </p>
                          <p className="text-[11px] text-exclu-space/80">
                            Leave empty to keep the current primary. Use the gallery above to add or reorder additional content. MP4, MOV, JPG, PNG, HEIC supported.
                          </p>
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
                          <span>{file ? 'Choose another' : 'Choose file'}</span>
                          <input
                            type="file"
                            accept="image/*,video/*,.heic,.heif"
                            className="hidden"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>
                    </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-6 border-t border-exclu-arsenic/30">
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded-full inline-flex items-center gap-2 px-4 transition-all"
                        onClick={handleDelete}
                        disabled={isSubmitting}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Delete link</span>
                      </Button>
                      <p className="hidden sm:block text-[11px] text-exclu-space/60 max-w-[150px]">
                        This link will be permanently removed.
                      </p>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      <Button
                        asChild
                        type="button"
                        variant="outline"
                        size="lg"
                        className="flex-1 sm:flex-none rounded-full border-exclu-arsenic/70 text-exclu-space hover:bg-exclu-arsenic/20"
                      >
                        <RouterLink to="/app/links">Cancel</RouterLink>
                      </Button>
                      <Button
                        type="submit"
                        variant="hero"
                        size="lg"
                        className="flex-1 sm:flex-none inline-flex items-center gap-2"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Saving...' : 'Save changes'}
                      </Button>
                    </div>
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
