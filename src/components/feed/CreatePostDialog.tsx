/**
 * CreatePostDialog — Inline post composer for the creator's /app/home tab.
 *
 * UX is modelled on the OnlyFans post composer:
 *   1. The creator picks one or more assets from their existing library.
 *   2. They write a short caption (required — populates `links.title` so the
 *      feed has something to render).
 *   3. They choose visibility:
 *        Public         → free, visible to everyone (no fan subscription needed)
 *        Subscribers    → only fans who subscribed via the creator's fan-sub plan
 *   4. On submit, we insert a price=0 row in `links` (allowed since migration 191
 *      `links_price_minimum_check` carved out price_cents = 0), attach the
 *      selected assets via `link_media`, and flip status to 'published'. The
 *      existing trigger `links_require_content` still enforces that we can't
 *      publish without media in storage.
 *
 * No price field, no chatter attribution — this is purely a feed post, not a
 * paid link.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Check, Plus, Image as ImageIcon, Globe, Lock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { getSignedUrl } from '@/lib/storageUtils';

interface CreatePostDialogProps {
  open: boolean;
  onClose: () => void;
  /** The creator's user_id (links.creator_id). */
  creatorUserId: string;
  /** Active creator_profile id, used to scope the post to the right profile in agency setups. */
  profileId: string | null;
  /** Called after a post is successfully published so the parent can refetch the feed. */
  onPosted?: () => void;
}

interface AssetRow {
  id: string;
  title: string | null;
  storage_path: string;
  mime_type: string | null;
  created_at: string;
  previewUrl: string | null;
}

type Visibility = 'public' | 'subscribers';

const generateSlug = (title: string): string => {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
    .replace(/^-+|-+$/g, '') || 'post';
  // 6-char suffix to avoid collisions on the unique slug index.
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
};

export function CreatePostDialog({ open, onClose, creatorUserId, profileId, onPosted }: CreatePostDialogProps) {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('subscribers');
  const [isPublishing, setIsPublishing] = useState(false);

  // Reset state every time the dialog opens so a previous draft doesn't leak.
  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setCaption('');
    setVisibility('subscribers');
  }, [open]);

  // Fetch the asset library lazily (only when the dialog opens). Public + private
  // assets both eligible — the post's own visibility flag controls who sees it.
  useEffect(() => {
    if (!open || !creatorUserId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('assets')
        .select('id, title, storage_path, mime_type, created_at')
        .eq('creator_id', creatorUserId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(60);

      if (cancelled) return;
      if (error) {
        toast.error('Failed to load your library');
        setIsLoading(false);
        return;
      }

      // Sign in parallel so the grid populates fast.
      const enriched: AssetRow[] = await Promise.all(
        (data ?? []).map(async (a: any) => ({
          id: a.id,
          title: a.title,
          storage_path: a.storage_path,
          mime_type: a.mime_type,
          created_at: a.created_at,
          previewUrl: a.storage_path ? await getSignedUrl(a.storage_path, 60 * 60) : null,
        })),
      );
      if (!cancelled) {
        setAssets(enriched);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, creatorUserId]);

  const toggleAsset = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isValid = caption.trim().length > 0 && selectedIds.size > 0;

  const handlePublish = async () => {
    if (!isValid || isPublishing) return;
    setIsPublishing(true);
    try {
      const safeCaption = caption.trim();
      const slug = generateSlug(safeCaption);
      // Title doubles as the feed-post caption; description is reserved for an
      // optional longer body (we leave it null for posts to keep the schema lean).
      const { data: insertedLinks, error: insertError } = await supabase
        .from('links')
        .insert({
          creator_id: creatorUserId,
          profile_id: profileId,
          title: safeCaption,
          description: null,
          price_cents: 0,
          currency: 'USD',
          slug,
          status: 'draft', // becomes 'published' after media is attached, see below
          show_on_profile: true,
          is_public: visibility === 'public',
        })
        .select('id')
        .single();

      if (insertError || !insertedLinks?.id) {
        console.error('[CreatePostDialog] insert link failed', insertError);
        toast.error('Failed to create post');
        return;
      }

      const linkId = insertedLinks.id as string;
      const orderedSelected = assets.filter((a) => selectedIds.has(a.id));
      const linkMediaRows = orderedSelected.map((a, index) => ({
        link_id: linkId,
        asset_id: a.id,
        position: index,
      }));

      const { error: mediaError } = await supabase.from('link_media').insert(linkMediaRows);
      if (mediaError) {
        // Roll back the orphan link so we don't leave half-built rows behind.
        await supabase.from('links').delete().eq('id', linkId);
        console.error('[CreatePostDialog] link_media insert failed', mediaError);
        toast.error('Failed to attach media');
        return;
      }

      const { error: publishError } = await supabase
        .from('links')
        .update({ status: 'published' })
        .eq('id', linkId);

      if (publishError) {
        console.error('[CreatePostDialog] publish failed', publishError);
        toast.error('Post saved as draft — could not publish (storage missing?)');
        return;
      }

      toast.success(visibility === 'public' ? 'Post published publicly' : 'Post published for subscribers');
      onPosted?.();
      onClose();
    } catch (err) {
      console.error('[CreatePostDialog] unexpected error', err);
      toast.error('Something went wrong');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Create a new post"
            className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-[91] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              // bg-popover + text-foreground are the standard shadcn tokens for
              // floating UI: opaque in both light and dark, and they match the
              // rest of the app's modals (sub popup, fan signup, etc.) without
              // introducing a new colour. `border-border` follows suit.
              className="pointer-events-auto bg-popover text-foreground border border-border/60 sm:rounded-2xl rounded-t-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55)] w-full sm:max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
              initial={{ y: 40, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 40, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
                <h2 className="text-base font-bold">New post</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="w-7 h-7 rounded-full bg-muted hover:bg-muted/70 text-foreground flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Caption */}
              <div className="px-5 pt-4">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption…"
                  rows={2}
                  maxLength={280}
                  className="w-full px-3 py-2.5 text-sm bg-muted/50 border border-border/40 rounded-xl outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 text-foreground placeholder:text-muted-foreground resize-none"
                />
                <div className="mt-1 text-right text-[10px] text-muted-foreground tabular-nums">{caption.length}/280</div>
              </div>

              {/* Visibility toggle */}
              <div className="px-5 pb-3">
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: 'public', label: 'Public', icon: Globe, hint: 'Anyone can see' },
                    { key: 'subscribers', label: 'Subscribers', icon: Lock, hint: 'Subscribers only' },
                  ] as const).map(({ key, label, icon: Icon, hint }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setVisibility(key)}
                      className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border text-left transition-all ${
                        visibility === key
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-muted/40 border-border/40 text-foreground/80 hover:bg-muted/60'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Asset grid */}
              <div className="px-5 pb-3 flex-1 overflow-y-auto">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                  Choose from your library
                </div>
                {isLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : assets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <ImageIcon className="w-7 h-7 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">No content uploaded yet.</p>
                    <p className="text-[10px] text-muted-foreground/70">Upload from the Content tab first.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {assets.map((asset) => {
                      const isSelected = selectedIds.has(asset.id);
                      const isVideo = asset.mime_type?.startsWith('video/');
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => toggleAsset(asset.id)}
                          className={`relative aspect-square rounded-lg overflow-hidden border transition-all ${
                            isSelected ? 'border-primary ring-1 ring-primary/60' : 'border-border/40 hover:border-border'
                          }`}
                        >
                          {asset.previewUrl ? (
                            isVideo ? (
                              <video
                                src={asset.previewUrl}
                                muted
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <img
                                src={asset.previewUrl}
                                alt={asset.title ?? ''}
                                loading="lazy"
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.src = '/og-link-default.png'; }}
                              />
                            )
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-black/40 text-white/70'
                          }`}>
                            {isSelected ? <Check className="w-3 h-3" /> : <span className="w-2.5 h-2.5 rounded-full border border-white/60" />}
                          </div>
                          {isVideo && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[8px] font-bold">VIDEO</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer — same popover bg as the modal so it never flashes
                  a different colour when sticking to the bottom of the scroll. */}
              <div className="bg-popover px-5 py-3 border-t border-border/40 flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''} selected`
                    : 'Pick at least one item'}
                </p>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={!isValid || isPublishing}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isPublishing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing…</>
                  ) : (
                    <><Send className="w-3.5 h-3.5" /> Publish post</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * CreatePostTrigger — Sticky "+" pill rendered above the feed in /app/home only.
 * Visually styled to feel like an inline composer: subtle border, dashed
 * background, hover lift. Clicking opens <CreatePostDialog>.
 */
export function CreatePostTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full mb-4 rounded-2xl border-2 border-dashed border-white/15 hover:border-[#CFFF16]/50 bg-white/[0.02] hover:bg-[#CFFF16]/5 px-4 py-5 flex items-center gap-3 transition-all"
    >
      <span className="w-10 h-10 rounded-full bg-[#CFFF16]/10 group-hover:bg-[#CFFF16]/20 border border-[#CFFF16]/30 flex items-center justify-center text-[#CFFF16] transition-colors shrink-0">
        <Plus className="w-5 h-5" />
      </span>
      <span className="flex-1 text-left">
        <span className="block text-sm font-semibold text-white">New post</span>
        <span className="block text-[11px] text-white/50">Pick from your library, set visibility, publish.</span>
      </span>
    </button>
  );
}
