import { useState, useEffect } from 'react';
import { Eye, EyeOff, GripVertical, CheckSquare, Square, Image as ImageIcon } from 'lucide-react';
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

interface PublicContent {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  is_public: boolean;
  is_feed_preview: boolean;
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
  onToggle: (id: string, isPublic: boolean) => void;
  onSetPreview: (id: string) => void;
  onCaptionChange: (id: string, caption: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SortableItem({ content, onToggle, onSetPreview, onCaptionChange, isSelected, onSelect }: SortableItemProps) {
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
      className={`group relative flex gap-4 rounded-2xl border bg-card p-3 transition-colors ${
        isDragging ? 'ring-2 ring-primary shadow-xl' : 'hover:border-primary/40'
      } ${isSelected ? 'border-primary/60 bg-primary/5' : 'border-border'} ${
        !content.is_public ? 'opacity-70' : ''
      }`}
    >
      {/* Drag handle — full-height strip on the left, easy to grab */}
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 -ml-1 flex w-6 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Preview thumbnail — large square so creators recognise the content */}
      <button
        type="button"
        onClick={() => onSelect(content.id)}
        className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-muted"
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
            <ImageIcon className="h-7 w-7 text-muted-foreground" />
          </div>
        )}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
            <CheckSquare className="h-6 w-6 text-white drop-shadow" />
          </div>
        )}
      </button>

      {/* Right side: caption + visibility controls */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          {/* Visibility pill + Free preview radio in a tidy cluster */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onToggle(content.id, !content.is_public)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                content.is_public
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {content.is_public ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {content.is_public ? 'In feed' : 'Hidden'}
            </button>
            {content.is_public && (
              <button
                type="button"
                onClick={() => onSetPreview(content.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  content.is_feed_preview
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    content.is_feed_preview ? 'bg-primary-foreground' : 'bg-muted-foreground/40'
                  }`}
                />
                {content.is_feed_preview ? 'Free preview' : 'Set as free preview'}
              </button>
            )}
          </div>
        </div>

        {/* Caption editor — always visible when public, full-width, 2 rows */}
        {content.is_public ? (
          <textarea
            defaultValue={content.feed_caption ?? ''}
            onBlur={(e) => onCaptionChange(content.id, e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Write a caption for this post…"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Hidden from your profile. Toggle "In feed" to show it (blurred for non-subscribers).
          </p>
        )}
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

    // Fetch assets (content from ContentLibrary)
    const assetsQuery = supabase
      .from('assets')
      .select('id, title, storage_path, mime_type, is_public, is_feed_preview, feed_caption, feed_blur_path, created_at')
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

    // Generate signed URLs for previews
    const withPreviews = await Promise.all(
      sorted.map(async (content) => {
        if (!content.storage_path) return { ...content, previewUrl: undefined };

        const { data: signed, error: signedError } = await supabase.storage
          .from('paid-content')
          .createSignedUrl(content.storage_path, 60 * 60); // 1 hour

        if (signedError || !signed?.signedUrl) {
          console.error('Error generating preview URL', signedError);
          return { ...content, previewUrl: undefined };
        }

        return { ...content, previewUrl: signed.signedUrl };
      })
    );

    setContents(withPreviews as PublicContent[]);
    setIsLoading(false);
  };

  /**
   * Persist the new order to `content_order` so the public profile picks it up.
   * We store ALL visible asset IDs (not only public), so toggling an asset from
   * private → public doesn't surprise the creator by placing it at an arbitrary
   * position.
   */
  const persistOrder = async (orderedIds: string[]) => {
    if (profileId) {
      const { error } = await supabase
        .from('creator_profiles')
        .update({ content_order: orderedIds })
        .eq('id', profileId);
      if (error) throw error;
    } else if (userId) {
      const { error } = await supabase
        .from('profiles')
        .update({ content_order: orderedIds })
        .eq('id', userId);
      if (error) throw error;
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
      // Download the original
      const { data: signed } = await supabase.storage
        .from('paid-content')
        .createSignedUrl(asset.storage_path, 60);
      if (!signed?.signedUrl) return;
      const res = await fetch(signed.signedUrl);
      if (!res.ok) return;
      const blob = await res.blob();
      const mime = asset.mime_type ?? blob.type ?? 'image/jpeg';
      const file = new File([blob], `source-${asset.id}`, { type: mime });
      const blurBlob = await generateBlurThumbnail(file);
      if (!blurBlob) return;

      // Upload to the conventional preview path under the owning user
      const [ownerId] = asset.storage_path.split('/');
      const blurPath = `${ownerId}/assets/${asset.id}/preview/blur.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('paid-content')
        .upload(blurPath, blurBlob, { cacheControl: '31536000', upsert: true, contentType: 'image/jpeg' });
      if (uploadErr) throw uploadErr;
      await supabase.from('assets').update({ feed_blur_path: blurPath }).eq('id', asset.id);
    } catch (err) {
      console.warn('[PublicContentSection] Unable to backfill blur preview', err);
    }
  };

  const handleToggleVisibility = async (contentId: string, isPublic: boolean) => {
    setIsUpdating(true);

    // When making private, also clear the feed preview flag so the profile
    // doesn't keep pointing at a hidden asset as the "free preview".
    const updatePayload: Record<string, unknown> = { is_public: isPublic };
    if (!isPublic) updatePayload.is_feed_preview = false;

    const { error } = await supabase
      .from('assets')
      .update(updatePayload)
      .eq('id', contentId);

    if (error) {
      console.error('Error updating content visibility', error);
      toast.error('Failed to update visibility');
    } else {
      toast.success(isPublic ? 'Content is now public' : 'Content is now private');

      // If we just flipped an asset public and it has no blur preview yet,
      // generate one. We await it so the subsequent fetchContents() picks
      // up the new feed_blur_path in one render.
      if (isPublic) {
        const target = contents.find((c) => c.id === contentId);
        if (target && !target.feed_blur_path) {
          await ensureBlurForAsset(target);
        }
      }

      fetchContents();
      onUpdate();
      onContentUpdate?.();
    }

    setIsUpdating(false);
  };

  /**
   * Marks a single asset as the free feed preview (the one unblurred post
   * visible to non-subscribers). Clears the flag on any other asset in the
   * same scope first — the DB constraint would reject otherwise, but we
   * also want instant local feedback.
   */
  const handleSetPreview = async (contentId: string) => {
    setIsUpdating(true);

    // Reset existing preview in this scope (profile_id OR legacy creator_id).
    if (profileId) {
      await supabase
        .from('assets')
        .update({ is_feed_preview: false })
        .eq('profile_id', profileId)
        .eq('is_feed_preview', true);
    } else if (userId) {
      await supabase
        .from('assets')
        .update({ is_feed_preview: false })
        .is('profile_id', null)
        .eq('creator_id', userId)
        .eq('is_feed_preview', true);
    }

    const { error } = await supabase
      .from('assets')
      .update({ is_feed_preview: true })
      .eq('id', contentId);

    if (error) {
      console.error('Error setting feed preview', error);
      toast.error('Failed to set preview');
    } else {
      toast.success('Set as free preview');
      await fetchContents();
      onContentUpdate?.();
    }
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

    const { error } = await supabase
      .from('assets')
      .update({ is_public: isPublic })
      .in('id', selectedIds);

    if (error) {
      console.error('Error updating batch visibility', error);
      toast.error('Failed to update visibility');
    } else {
      toast.success(`${selectedIds.length} content(s) ${isPublic ? 'made public' : 'made private'}`);
      setSelectedIds([]);
      fetchContents();
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

  return (
    <div className="space-y-5">
      {contents.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Posts</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Drag to reorder — the order here is the order your fans see on your profile.
              </p>
            </div>
          </div>

          {/* Batch actions */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/30">
              <span className="text-sm font-medium text-primary">{selectedIds.length} selected</span>
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => handleBatchVisibility(true)}
                  disabled={isUpdating}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Eye className="w-3.5 h-3.5 inline mr-1" />
                  Make Public
                </button>
                <button
                  onClick={() => handleBatchVisibility(false)}
                  disabled={isUpdating}
                  className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <EyeOff className="w-3.5 h-3.5 inline mr-1" />
                  Make Private
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Select all button */}
          <button
            onClick={handleSelectAll}
            className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
          >
            {selectedIds.length === contents.length ? 'Deselect All' : 'Select All'}
          </button>

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
                    onToggle={handleToggleVisibility}
                    onSetPreview={handleSetPreview}
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
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-12 text-center">
          <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No content yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            Create content and mark it as "public" to display it in your public gallery
          </p>
          <a
            href="/app/content"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Create Content
          </a>
        </div>
      )}
    </div>
  );
}
