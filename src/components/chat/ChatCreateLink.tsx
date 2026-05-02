/**
 * ChatCreateLink
 *
 * Inline panel for creators/chatters to create a paid content link directly from the chat.
 * Steps: select (or upload, creator-only) assets from the creator's library → set title & price → create + send.
 * Chatters get attribution-tagged hidden links; creators get regular owned links.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2, Check, DollarSign, Send, Eye, EyeOff, Type, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { maybeConvertHeic } from '@/lib/convertHeic';

interface ContentAsset {
  id: string;
  title: string | null;
  storage_path: string;
  mime_type: string | null;
  is_public: boolean;
  previewUrl?: string | null;
  isVideo?: boolean;
}

interface CreatedLink {
  id: string;
  title: string | null;
  slug: string;
  price_cents: number;
  description: string | null;
}

interface ChatCreateLinkProps {
  profileId: string;
  onLinkCreated: (link: CreatedLink) => void;
  onClose: () => void;
  /**
   * 'chatter' (default) tags the created link with `created_by_chatter_id`
   * for revenue split tracking and hides it from the public profile.
   * 'creator' creates a regular owned link with no chatter attribution.
   */
  senderType?: 'creator' | 'chatter';
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base || 'drop'}-${rand}`;
}

export function ChatCreateLink({ profileId, onLinkCreated, onClose, senderType = 'chatter' }: ChatCreateLinkProps) {
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visFilter, setVisFilter] = useState<'all' | 'public' | 'private'>('all');

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');

  // Creator user_id (owner of the profile) — needed for link creation
  const [creatorUserId, setCreatorUserId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canUpload = senderType === 'creator';

  useEffect(() => {
    let mounted = true;
    const fetchAssets = async () => {
      setIsLoading(true);

      const { data: profileRow } = await supabase
        .from('creator_profiles')
        .select('user_id')
        .eq('id', profileId)
        .single();

      if (!profileRow || !mounted) { setIsLoading(false); return; }
      setCreatorUserId(profileRow.user_id);

      const { data } = await supabase
        .from('assets')
        .select('id, title, storage_path, mime_type, is_public')
        .eq('profile_id', profileId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!mounted) return;

      const rawAssets = (data ?? []) as ContentAsset[];

      const withPreviews = await Promise.all(
        rawAssets.map(async (asset) => {
          if (!asset.storage_path) return { ...asset, previewUrl: null, isVideo: false };
          const { data: signed } = await supabase.storage
            .from('paid-content')
            .createSignedUrl(asset.storage_path, 600);
          const ext = asset.storage_path.split('.').pop()?.toLowerCase() ?? '';
          const isVideo = ['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(ext)
            || (asset.mime_type?.startsWith('video/') ?? false);
          return { ...asset, previewUrl: signed?.signedUrl ?? null, isVideo };
        })
      );

      if (mounted) {
        setAssets(withPreviews);
        setIsLoading(false);
      }
    };

    fetchAssets();
    return () => { mounted = false; };
  }, [profileId]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filtered = assets.filter((a) => {
    if (visFilter === 'public' && !a.is_public) return false;
    if (visFilter === 'private' && a.is_public) return false;
    if (search.trim()) {
      return (a.title ?? '').toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  const selectedCount = selectedIds.size;
  const priceNumber = parseFloat(price);
  const isValid = selectedCount > 0 && title.trim().length > 0 && Number.isFinite(priceNumber) && priceNumber >= 5;

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length || !creatorUserId || isUploading) return;

    const MAX_SIZE_MB = 500;
    const videoExtensions = ['.mp4', '.mov', '.webm', '.m4v', '.hevc', '.avi', '.mkv'];

    setIsUploading(true);
    const newAssets: ContentAsset[] = [];

    try {
      for (const rawFile of files) {
        const lowerName = rawFile.name.toLowerCase();
        const isHeic = rawFile.type === 'image/heic' || rawFile.type === 'image/heif'
          || lowerName.endsWith('.heic') || lowerName.endsWith('.heif');
        const isImage = rawFile.type.startsWith('image/') || isHeic;
        const isVideo = rawFile.type.startsWith('video/') || videoExtensions.some((ext) => lowerName.endsWith(ext));
        if (!isImage && !isVideo) {
          toast.error(`${rawFile.name}: only images and videos are supported.`);
          continue;
        }
        if (rawFile.size > MAX_SIZE_MB * 1024 * 1024) {
          toast.error(`${rawFile.name}: file is too large (max ${MAX_SIZE_MB} MB).`);
          continue;
        }

        const file = await maybeConvertHeic(rawFile);
        const assetId = crypto.randomUUID();
        const ext = file.name.split('.').pop() ?? 'bin';
        const objectName = `${creatorUserId}/assets/${assetId}/original/content.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('paid-content')
          .upload(objectName, file, { cacheControl: '3600', upsert: true });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast.error(`${rawFile.name}: upload failed.`);
          continue;
        }

        const { data: inserted, error: insertError } = await supabase
          .from('assets')
          .insert({
            id: assetId,
            creator_id: creatorUserId,
            profile_id: profileId,
            title: file.name,
            storage_path: objectName,
            mime_type: file.type || null,
            is_public: false,
          })
          .select('id, title, storage_path, mime_type, is_public')
          .single();

        if (insertError || !inserted) {
          console.error('Asset insert error:', insertError);
          toast.error(`${rawFile.name}: could not save asset record.`);
          continue;
        }

        const { data: signed } = await supabase.storage
          .from('paid-content')
          .createSignedUrl(inserted.storage_path, 600);

        newAssets.push({
          ...(inserted as ContentAsset),
          previewUrl: signed?.signedUrl ?? null,
          isVideo,
        });
      }

      if (newAssets.length > 0) {
        setAssets((prev) => [...newAssets, ...prev]);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          newAssets.forEach((a) => next.add(a.id));
          return next;
        });
        toast.success(`${newAssets.length} file${newAssets.length > 1 ? 's' : ''} uploaded`);
      }
    } catch (err: any) {
      console.error('ChatCreateLink upload error:', err);
      toast.error(err?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!isValid || !creatorUserId || isCreating) return;

    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const safeTitle = title.trim();
      const slug = generateSlug(safeTitle);
      const priceCents = Math.round(priceNumber * 100);

      // 1. Create link as draft (the links_require_content DB trigger lets
      // drafts through; we flip to 'published' after the media is attached).
      const { data: insertedLinks, error: insertError } = await supabase
        .from('links')
        .insert({
          creator_id: creatorUserId,
          profile_id: profileId,
          title: safeTitle,
          description: null,
          price_cents: priceCents,
          currency: 'USD',
          slug,
          status: 'draft',
          // Chatters create non-public attribution-tagged links; creators
          // create regular profile links (visible by default).
          show_on_profile: senderType === 'creator',
          created_by_chatter_id: senderType === 'chatter' ? user.id : null,
        })
        .select('id, title, slug, price_cents');

      if (insertError || !insertedLinks?.length) {
        console.error('Error creating link:', insertError);
        throw new Error('Failed to create link');
      }

      const linkId = insertedLinks[0].id;

      // 2. Attach selected assets via link_media junction table
      const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
      const linkMediaRows = selectedAssets.map((asset, index) => ({
        link_id: linkId,
        asset_id: asset.id,
        position: index,
      }));

      if (linkMediaRows.length > 0) {
        const { error: mediaError } = await supabase
          .from('link_media')
          .insert(linkMediaRows);

        if (mediaError) {
          console.error('Error attaching media to link:', mediaError);
          await supabase.from('links').delete().eq('id', linkId);
          throw new Error('Failed to attach selected content to the link.');
        }
      }

      // 3. Publish now that the link has content attached.
      const { error: publishError } = await supabase
        .from('links')
        .update({ status: 'published' })
        .eq('id', linkId);

      if (publishError) {
        console.error('Error publishing link:', publishError);
        throw new Error('Link created but could not be published.');
      }

      const createdLink: CreatedLink = {
        id: linkId,
        title: safeTitle,
        slug,
        price_cents: priceCents,
        description: null,
      };

      toast.success('Link created and sent!');
      onLinkCreated(createdLink);
    } catch (err: any) {
      console.error('Error in ChatCreateLink:', err);
      toast.error(err?.message || 'Failed to create link');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
      className="border-t border-border bg-card overflow-hidden"
    >
      <div className="max-h-[400px] flex flex-col">
        {/* Header with inline filters */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-[#CFFF16]" />
              <span className="text-xs font-semibold text-foreground">Create paid link</span>
            </div>
            <div className="flex gap-1">
              {(['all', 'public', 'private'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setVisFilter(f)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                    visFilter === f
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  {f === 'public' && <Eye className="w-2.5 h-2.5" />}
                  {f === 'private' && <EyeOff className="w-2.5 h-2.5" />}
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Title + Price inputs */}
        <div className="px-3 py-2 border-b border-border/50 flex-shrink-0 flex items-center gap-2">
          <div className="relative flex-1">
            <Type className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Link title…"
              maxLength={100}
              className="w-full pl-8 pr-3 py-2.5 text-xs bg-muted/50 border border-white/20 rounded-lg outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="relative w-28">
            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#CFFF16]" />
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price ($5+)"
              min="5"
              step="0.01"
              className="w-full pl-7 pr-2 py-2.5 text-xs bg-muted/50 border border-white/20 rounded-lg outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Asset grid */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && !canUpload && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <DollarSign className="w-5 h-5 text-muted-foreground/30" />
              <p className="text-[11px] text-muted-foreground/60">
                {search ? 'No matching content' : 'No content available'}
              </p>
            </div>
          )}

          {!isLoading && (filtered.length > 0 || canUpload) && (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
              {canUpload && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="relative aspect-square rounded-lg border-2 border-dashed border-white/20 hover:border-[#CFFF16]/60 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-[#CFFF16] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      <span className="text-[9px] font-medium">Upload</span>
                    </>
                  )}
                </button>
              )}
              {filtered.map((asset) => {
                const isSelected = selectedIds.has(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggleSelect(asset.id)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? 'border-[#CFFF16] ring-1 ring-[#CFFF16]/30'
                        : 'border-transparent hover:border-border'
                    }`}
                  >
                    {asset.previewUrl ? (
                      asset.isVideo ? (
                        <video src={asset.previewUrl} className="w-full h-full object-cover" muted playsInline />
                      ) : (
                        <img
                          src={asset.previewUrl}
                          className="w-full h-full object-cover"
                          alt={asset.title ?? ''}
                          loading="lazy"
                          onError={(e) => { e.currentTarget.src = '/og-link-default.png'; }}
                        />
                      )
                    ) : (
                      <img src="/og-link-default.png" className="w-full h-full object-cover opacity-50" alt="" />
                    )}

                    <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-[#CFFF16] text-black scale-100'
                        : 'bg-black/40 text-white/60 scale-90'
                    }`}>
                      {isSelected ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-white/60" />
                      )}
                    </div>

                    {asset.isVideo && (
                      <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center">
                        <span className="text-[7px] text-white font-bold">▶</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: Create + Send button */}
        <div className="px-3 py-2 border-t border-border/50 flex-shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} content${selectedCount > 1 ? 's' : ''} selected`
              : 'Select content to include'}
          </p>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!isValid || isCreating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#CFFF16] text-black text-[11px] font-bold hover:bg-[#CFFF16]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isCreating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            Create & Send
          </button>
        </div>

        {canUpload && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.heic,.heif"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        )}
      </div>
    </motion.div>
  );
}
