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

interface PublicContent {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  is_public: boolean;
  is_feed_preview: boolean;
  feed_caption: string | null;
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
    opacity: isDragging ? 0.5 : 1,
  };

  const isVideo = content.mime_type?.startsWith('video/');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : 'hover:border-primary/50'
      } ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card'} ${!content.is_public ? 'opacity-60' : ''} p-4`}
    >
      <div className="flex items-center gap-3">
        {/* Checkbox for selection */}
        <button
          onClick={() => onSelect(content.id)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Select content"
        >
          {isSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5" />}
        </button>
        
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Preview Thumbnail */}
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
          {content.previewUrl ? (
            isVideo ? (
              <video
                src={content.previewUrl}
                className="w-full h-full object-cover"
                muted
              />
            ) : (
              <img
                src={content.previewUrl}
                alt={content.title}
                className="w-full h-full object-cover"
              />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Content Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground truncate">{content.title}</h4>
          <p className="text-xs text-muted-foreground">
            {isVideo ? 'Video' : 'Image'}
          </p>
        </div>

        {/* Visibility + free preview */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              {content.is_public ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>Public</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Private</span>
                </>
              )}
            </div>
            <Switch
              checked={content.is_public}
              onCheckedChange={(checked) => onToggle(content.id, checked)}
            />
          </div>
          {content.is_public && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
              <input
                type="radio"
                name={`feed-preview-${content.id}`}
                checked={content.is_feed_preview}
                onChange={() => onSetPreview(content.id)}
                className="accent-primary cursor-pointer"
              />
              Free preview
            </label>
          )}
        </div>
      </div>

      {content.is_public && (
        <textarea
          defaultValue={content.feed_caption ?? ''}
          onBlur={(e) => onCaptionChange(content.id, e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Feed caption (optional, shown above this post)…"
          className="w-full resize-none rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground mt-3 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      )}
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
      .select('id, title, storage_path, mime_type, is_public, is_feed_preview, feed_caption, feed_blur_path')
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

    // Generate signed URLs for previews
    const withPreviews = await Promise.all(
      (assetsData || []).map(async (content) => {
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setContents((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
      
      // TODO: Save order to content_order in profiles
      toast.success('Content reordered');
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

  const publicCount = contents.filter((c) => c.is_public).length;
  const privateCount = contents.length - publicCount;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">Public</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{publicCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <EyeOff className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Private</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{privateCount}</p>
        </div>
      </div>

      {/* Content List */}
      {contents.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Public Content Gallery</h3>
            <p className="text-xs text-muted-foreground">Drag to reorder • Toggle to show/hide</p>
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
