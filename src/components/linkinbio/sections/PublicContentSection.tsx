import { useState, useEffect } from 'react';
import { Eye, EyeOff, GripVertical, CheckSquare, Square, Image as ImageIcon, ArrowUpRight, Globe, Lock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { generateBlurThumbnail } from '@/lib/blurThumbnail';
import { getSignedUrl, getSignedUrls } from '@/lib/storageUtils';

interface PublicContent {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  in_feed: boolean;
  is_public: boolean;
  feed_caption: string | null;
  feed_blur_path: string | null;
  previewUrl?: string;
}

interface PublicContentSectionProps {
  userId: string | null;
  profileId?: string | null;
  onUpdate: () => void;
  onContentUpdate?: () => void;
}

interface SortableItemProps {
  content: PublicContent;
  onToggleIsPublic: (id: string, isPublic: boolean) => void;
  onCaptionChange: (id: string, caption: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SortableItem({ content, onToggleIsPublic, onCaptionChange, isSelected, onSelect }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: content.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const isVideo = content.mime_type?.startsWith('video/');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-2xl border p-3 transition-colors ${
        isDragging ? 'ring-2 ring-[#CFFF16] shadow-xl' : 'hover:border-[#CFFF16]/40'
      } ${isSelected ? 'border-[#CFFF16]/50 bg-[#CFFF16]/5' : 'border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10]'}`}
    >
      {/* Top row — drag handle · thumbnail · [switch + free preview] */}
      <div className="flex gap-3 items-center">
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 flex w-6 cursor-grab items-center justify-center text-foreground/35 dark:text-white/35 hover:text-[#CFFF16] active:cursor-grabbing self-stretch"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => onSelect(content.id)}
          className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-foreground/5 dark:bg-white/5"
          aria-label="Select content"
        >
          {content.previewUrl ? (
            isVideo ? (
              <video src={content.previewUrl} className="h-full w-full object-cover" muted playsInline />
            ) : (
              <img src={content.previewUrl} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-6 w-6 text-foreground/40 dark:text-white/40" />
            </div>
          )}
          {isSelected && (
            <div className="absolute inset-0 bg-[#CFFF16]/30 flex items-center justify-center">
              <CheckSquare className="h-6 w-6 text-white drop-shadow" />
            </div>
          )}
        </button>

        {/* Public / Subs switch — aligned right of the thumbnail row. */}
        <div className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/70 dark:text-white/70">
            {content.is_public ? (
              <><Globe className="h-3 w-3 text-[#4a6304] dark:text-[#CFFF16]" /> Public</>
            ) : (
              <><Lock className="h-3 w-3" /> Subs only</>
            )}
          </span>
          <Switch
            checked={content.is_public}
            onCheckedChange={(checked) => onToggleIsPublic(content.id, checked)}
            aria-label={content.is_public ? 'Make subscribers-only' : 'Make public'}
          />
        </div>
      </div>

      {/* Bottom row — caption textarea below the thumbnail (spans full width) */}
      <div className="mt-3">
        <textarea
          defaultValue={content.feed_caption ?? ''}
          onBlur={(e) => onCaptionChange(content.id, e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Write a caption for this post…"
          className="w-full resize-none rounded-lg border border-black/5 dark:border-white/10 bg-foreground/[0.02] dark:bg-white/[0.03] px-3 py-2 text-sm text-foreground dark:text-white placeholder:text-foreground/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#CFFF16]/40"
        />
      </div>
    </div>
  );
}

export function PublicContentSection({ userId, profileId, onUpdate, onContentUpdate }: PublicContentSectionProps) {
  const [contents, setContents] = useState<PublicContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const contentIds = contents.map((c) => c.id);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchContents();
  }, [userId, profileId]);

  const fetchContents = async () => {
    if (!userId) return;

    setIsLoading(true);

    // Fetch assets (content from ContentLibrary). Profile → Feed only shows
    // in-feed assets; the Content tab is the place to flip in_feed.
    const assetsQuery = supabase
      .from('assets')
      .select('id, title, storage_path, mime_type, in_feed, is_public, feed_caption, feed_blur_path, created_at')
      .eq('in_feed', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    const { data: assetsData, error: assetsError } = profileId
      ? await assetsQuery.eq('profile_id', profileId)
      : await assetsQuery.eq('creator_id', userId);

    if (assetsError) {
      console.error('Error loading public content', assetsError);
      toast.error('Failed to load content');
      setIsLoading(false);
      return;
    }

    // Fetch saved display order (creator_profiles.content_order) so the editor
    // renders in the same order the public profile uses. Missing / new assets
    // fall back to created_at desc.
    let savedOrder: string[] = [];
    if (profileId) {
      const { data: cp } = await supabase
        .from('creator_profiles')
        .select('content_order')
        .eq('id', profileId)
        .maybeSingle();
      savedOrder = (cp?.content_order ?? []) as string[];
    } else {
      const { data: p } = await supabase
        .from('profiles')
        .select('content_order')
        .eq('id', userId)
        .maybeSingle();
      savedOrder = (p?.content_order ?? []) as string[];
    }

    const sorted = [...(assetsData ?? [])].sort((a: any, b: any) => {
      const ai = savedOrder.indexOf(a.id);
      const bi = savedOrder.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });

    // Single round-trip for every preview URL via the batched signing helper.
    const paths = sorted.map((c) => c.storage_path).filter(Boolean) as string[];
    const signed = await getSignedUrls(paths, 60 * 60);
    const withPreviews = sorted.map((content) => ({
      ...content,
      previewUrl: content.storage_path ? signed[content.storage_path] ?? undefined : undefined,
    }));

    // Hide orphan assets whose storage file is missing (the cleanup happens in
    // ContentLibrary.tsx; here we just don't render them in the editor panel).
    const visible = (withPreviews as PublicContent[]).filter(
      (c) => !c.storage_path || c.previewUrl,
    );

    setContents(visible);
    setIsLoading(false);

    // Backfill blur previews for any in-feed asset missing a blur path.
    // The blur is the locked preview shown to non-subscribers, so it's
    // needed regardless of public/subs state. Fire-and-forget: each
    // generation runs in the background and updates local state as it
    // completes so the panel reflects reality.
    const missingBlur = visible.filter(
      (c) => c.in_feed && !c.feed_blur_path && c.storage_path,
    );
    if (missingBlur.length > 0) {
      missingBlur.forEach((asset) => {
        ensureBlurForAsset(asset).catch(() => {});
      });
    }
  };

  /**
   * Persist the new order to `content_order` so the public profile picks it up.
   *
   * Critical: this section only renders assets, but content_order is the
   * canonical feed order which can ALSO carry link IDs (zero-price posts
   * created from /app/home composer). Naively writing only the asset IDs
   * would clobber the post positions. We do a read-modify-write that
   * preserves non-asset IDs from the existing array.
   */
  const persistOrder = async (assetIdsInNewOrder: string[]) => {
    const targetTable = profileId ? 'creator_profiles' : 'profiles';
    const targetId = profileId ?? userId;
    if (!targetId) return;

    const { data: existing, error: readErr } = await supabase
      .from(targetTable)
      .select('content_order')
      .eq('id', targetId)
      .maybeSingle();
    if (readErr) throw readErr;

    const existingArr = ((existing as any)?.content_order ?? []) as string[];
    const assetIdSet = new Set(assetIdsInNewOrder);

    // Preserve link IDs (anything in existing that isn't one of our assets).
    // We append them after the new asset order so /app/home arrows can still
    // bring them back into position later.
    const otherIds = existingArr.filter((id) => !assetIdSet.has(id));
    const merged = [...assetIdsInNewOrder, ...otherIds];

    const { error: writeErr, data: updated } = await supabase
      .from(targetTable)
      .update({ content_order: merged })
      .eq('id', targetId)
      .select('id');
    if (writeErr) throw writeErr;
    if (!updated || updated.length === 0) {
      throw new Error('Order update affected 0 rows (RLS or row missing)');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = contents.findIndex((item) => item.id === active.id);
    const newIndex = contents.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(contents, oldIndex, newIndex);
    setContents(next); // optimistic UI
    try {
      await persistOrder(next.map((c) => c.id));
      onContentUpdate?.();
      toast.success('Feed order saved');
    } catch (err) {
      console.error('Error saving content_order', err);
      toast.error("Couldn't save the new order");
      setContents(contents); // rollback
    }
  };

  /**
   * Lazily generate a feed_blur_path for an existing asset that was toggled
   * public but never went through the upload pipeline. Downloads the
   * original via a signed URL, runs it through the blur generator and
   * uploads the result to <user>/assets/<id>/preview/blur.jpg.
   *
   * Fire-and-forget: any error is logged, never surfaced — we don't want to
   * block the visibility toggle.
   */
  const ensureBlurForAsset = async (asset: PublicContent) => {
    try {
      if (!asset.storage_path) return;
      // Download the original via getSignedUrl — handles legacy paths that
      // still carry the `paid-content/` prefix.
      const signedUrl = await getSignedUrl(asset.storage_path, 60);
      if (!signedUrl) return;
      const res = await fetch(signedUrl);
      if (!res.ok) return;
      const blob = await res.blob();
      const mime = asset.mime_type ?? blob.type ?? 'image/jpeg';
      const file = new File([blob], `source-${asset.id}`, { type: mime });
      const blurBlob = await generateBlurThumbnail(file);
      if (!blurBlob) return;

      // Work out the owner folder from the original path. Legacy rows may
      // still be prefixed with `paid-content/<uuid>/…`; strip the bucket so
      // the first segment is always the user UUID.
      const BUCKET_PREFIX = 'paid-content/';
      const relative = asset.storage_path.startsWith(BUCKET_PREFIX)
        ? asset.storage_path.slice(BUCKET_PREFIX.length)
        : asset.storage_path;
      const [ownerId] = relative.split('/');
      if (!ownerId) return;
      const blurPath = `${ownerId}/assets/${asset.id}/preview/blur.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('paid-content')
        .upload(blurPath, blurBlob, { cacheControl: '31536000', upsert: true, contentType: 'image/jpeg' });
      if (uploadErr) throw uploadErr;
      await supabase.from('assets').update({ feed_blur_path: blurPath }).eq('id', asset.id);

      // Patch local state so the creator sees the backfilled blur without
      // needing to reload the page, then poke the parent so the mobile
      // preview (fed by the editor's copy) re-signs and renders it too.
      setContents((prev) => prev.map((c) => (c.id === asset.id ? { ...c, feed_blur_path: blurPath } : c)));
      onContentUpdate?.();
    } catch (err) {
      console.warn('[PublicContentSection] Unable to backfill blur preview', err);
    }
  };

  const handleToggleIsPublic = async (contentId: string, isPublic: boolean) => {
    setIsUpdating(true);

    // Optimistic local update — feels instant. Preserve previous state so we
    // can rollback on error.
    const previous = contents;
    setContents((prev) =>
      prev.map((c) => (c.id === contentId ? { ...c, is_public: isPublic } : c)),
    );
    // Poke the parent preview so the mobile phone reflects the change right away.
    onContentUpdate?.();

    const { error } = await supabase
      .from('assets')
      .update({ is_public: isPublic })
      .eq('id', contentId);

    if (error) {
      console.error('Error updating asset is_public', error);
      toast.error('Failed to update visibility');
      setContents(previous); // rollback
      setIsUpdating(false);
      return;
    }

    onUpdate();
    onContentUpdate?.();
    setIsUpdating(false);
  };

  const handleCaptionChange = async (contentId: string, caption: string) => {
    const trimmed = caption.trim().slice(0, 500);
    // Avoid a pointless write if caption is unchanged (uses existing state).
    const existing = contents.find((c) => c.id === contentId);
    if (existing && (existing.feed_caption ?? '') === trimmed) return;

    const { error } = await supabase
      .from('assets')
      .update({ feed_caption: trimmed || null })
      .eq('id', contentId);
    if (error) {
      console.error('Error saving caption', error);
      toast.error('Failed to save caption');
      return;
    }
    // Locally patch so the next render doesn't trigger a redundant write.
    setContents((prev) => prev.map((c) => (c.id === contentId ? { ...c, feed_caption: trimmed || null } : c)));
  };

  const handleSelectContent = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === contents.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contents.map(c => c.id));
    }
  };

  const handleBatchVisibility = async (isPublic: boolean) => {
    if (selectedIds.length === 0) return;

    setIsUpdating(true);

    // Optimistic update
    const previous = contents;
    const ids = new Set(selectedIds);
    setContents((prev) =>
      prev.map((c) => (ids.has(c.id) ? { ...c, is_public: isPublic } : c)),
    );
    setSelectedIds([]);
    onContentUpdate?.();

    const { error } = await supabase
      .from('assets')
      .update({ is_public: isPublic })
      .in('id', Array.from(ids));

    if (error) {
      console.error('Error updating batch visibility', error);
      toast.error('Failed to update visibility');
      setContents(previous); // rollback
    } else {
      onUpdate();
      onContentUpdate?.();
    }

    setIsUpdating(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const publicCount = contents.filter((c) => c.is_public).length;
  const subsOnlyCount = contents.length - publicCount;

  return (
    <div className="space-y-4">
      {/* Feed composition stats */}
      {contents.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-foreground/55 dark:text-white/55">In feed</p>
            <p className="text-xl font-bold text-foreground dark:text-white mt-0.5 tabular-nums">{contents.length}</p>
          </div>
          <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-foreground/55 dark:text-white/55">Public</p>
            <p className="text-xl font-bold text-foreground dark:text-white mt-0.5 tabular-nums">{publicCount}</p>
          </div>
          <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-foreground/55 dark:text-white/55">Subs only</p>
            <p className="text-xl font-bold text-foreground dark:text-white mt-0.5 tabular-nums">{subsOnlyCount}</p>
          </div>
        </div>
      )}

      {contents.length > 0 ? (
        <div className="space-y-3">
          {/* Select all + batch actions in a single compact bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs font-medium text-foreground/60 dark:text-white/60 hover:text-foreground dark:hover:text-white transition-colors"
            >
              {selectedIds.length === contents.length ? 'Deselect all' : 'Select all'}
            </button>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#CFFF16]/10 border border-[#CFFF16]/30">
                <span className="text-xs font-semibold text-[#4a6304] dark:text-[#CFFF16]">{selectedIds.length} selected</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleBatchVisibility(true)}
                    disabled={isUpdating}
                    className="px-2.5 py-1 rounded-full bg-[#CFFF16] hover:bg-[#bef200] text-black text-[11px] font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Globe className="w-3 h-3" /> Public
                  </button>
                  <button
                    onClick={() => handleBatchVisibility(false)}
                    disabled={isUpdating}
                    className="px-2.5 py-1 rounded-full bg-foreground/10 dark:bg-white/10 hover:bg-foreground/15 dark:hover:bg-white/15 text-foreground dark:text-white text-[11px] font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Lock className="w-3 h-3" /> Subs only
                  </button>
                  <button
                    onClick={() => setSelectedIds([])}
                    className="px-2.5 py-1 rounded-full bg-foreground/10 dark:bg-white/10 hover:bg-foreground/15 dark:hover:bg-white/15 text-foreground dark:text-white text-[11px] font-semibold transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={contentIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {contents.map((content) => (
                  <SortableItem
                    key={content.id}
                    content={content}
                    onToggleIsPublic={handleToggleIsPublic}
                    onCaptionChange={handleCaptionChange}
                    isSelected={selectedIds.includes(content.id)}
                    onSelect={handleSelectContent}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-black/10 dark:border-white/15 bg-foreground/[0.02] dark:bg-white/[0.03] p-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#CFFF16]/15 border border-[#CFFF16]/30 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-[#4a6304] dark:text-[#CFFF16]" />
          </div>
          <p className="text-sm font-semibold text-foreground dark:text-white mb-1">Your Feed is empty</p>
          <p className="text-xs text-foreground/60 dark:text-white/60 mb-4 max-w-xs mx-auto leading-relaxed">
            Upload files in Content library, then make them public to fill up your Feed.
          </p>
          <a
            href="/app/content"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#CFFF16] text-black text-sm font-bold hover:bg-[#bef200] transition-colors shadow-[0_8px_24px_-8px_rgba(207,255,22,0.55)]"
          >
            Go to Content library
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
