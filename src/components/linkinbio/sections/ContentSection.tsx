import { useState } from 'react';
import { Lock, Eye, EyeOff, GripVertical, CheckSquare, Square } from 'lucide-react';
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

interface CreatorLink {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  slug: string;
  show_on_profile: boolean;
}

interface ContentSectionProps {
  links: CreatorLink[];
  onUpdate: () => void;
}

interface SortableItemProps {
  link: CreatorLink;
  onToggle: (id: string, show: boolean) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SortableItem({ link, onToggle, isSelected, onSelect }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const priceLabel = `$${(link.price_cents / 100).toFixed(2)}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-2xl border p-3 transition-all ${
        isDragging ? 'shadow-xl ring-2 ring-[#CFFF16]' : 'hover:border-[#CFFF16]/40'
      } ${isSelected ? 'border-[#CFFF16]/50 bg-[#CFFF16]/5' : 'border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10]'} ${!link.show_on_profile ? 'opacity-60' : ''}`}
    >
      {/* Top row — drag · preview tile · title · select checkbox */}
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-5 cursor-grab active:cursor-grabbing text-foreground/30 dark:text-white/30 hover:text-[#CFFF16] transition-colors flex-shrink-0 self-stretch"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Lime preview tile with lock + price */}
        <div className="relative w-14 h-14 flex-shrink-0 overflow-hidden rounded-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-[#CFFF16]/25 via-[#CFFF16]/10 to-[#CFFF16]/5" />
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(207,255,22,0.3),transparent_60%)]" />
          <div className="relative h-full flex flex-col items-center justify-center gap-0.5">
            <Lock className="w-4 h-4 text-[#4a6304] dark:text-[#CFFF16]" />
            <span className="text-[9px] font-bold text-[#4a6304] dark:text-[#CFFF16] tabular-nums tracking-tight">{priceLabel}</span>
          </div>
        </div>

        {/* Title only — wraps on 2 lines */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm sm:text-[15px] font-semibold text-foreground dark:text-white leading-snug line-clamp-2">
            {link.title}
          </h4>
        </div>

        {/* Selection checkbox — subtle, right edge */}
        <button
          onClick={() => onSelect(link.id)}
          className="flex-shrink-0 text-foreground/30 dark:text-white/30 hover:text-foreground dark:hover:text-white transition-colors"
          aria-label="Select link"
        >
          {isSelected ? <CheckSquare className="w-4 h-4 text-[#CFFF16]" /> : <Square className="w-4 h-4" />}
        </button>
      </div>

      {/* Bottom row — visibility switch */}
      <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground/70 dark:text-white/70 inline-flex items-center gap-1.5">
          {link.show_on_profile ? (
            <><Eye className="w-3 h-3 text-[#4a6304] dark:text-[#CFFF16]" /> Visible on your profile</>
          ) : (
            <><EyeOff className="w-3 h-3" /> Hidden</>
          )}
        </span>
        <Switch
          checked={link.show_on_profile}
          onCheckedChange={(checked) => onToggle(link.id, checked)}
        />
      </div>
    </div>
  );
}

export function ContentSection({ links, onUpdate }: ContentSectionProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const linkIds = links.map((l) => l.id);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = linkIds.indexOf(active.id as string);
      const newIndex = linkIds.indexOf(over.id as string);
      
      // Reorder is handled visually
      // In a real implementation, you would save the order to link_order in profiles
      arrayMove(linkIds, oldIndex, newIndex);
    }
  };

  const handleToggleVisibility = async (linkId: string, show: boolean) => {
    setIsUpdating(true);

    const { error } = await supabase
      .from('links')
      .update({ show_on_profile: show })
      .eq('id', linkId);

    if (error) {
      console.error('Error updating link visibility', error);
      toast.error('Failed to update visibility');
    } else {
      toast.success(show ? 'Link is now visible on your profile' : 'Link hidden from profile');
      onUpdate();
    }

    setIsUpdating(false);
  };

  const handleSelectLink = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === links.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(links.map(l => l.id));
    }
  };

  const handleBatchVisibility = async (show: boolean) => {
    if (selectedIds.length === 0) return;
    
    setIsUpdating(true);

    const { error } = await supabase
      .from('links')
      .update({ show_on_profile: show })
      .in('id', selectedIds);

    if (error) {
      console.error('Error updating batch visibility', error);
      toast.error('Failed to update visibility');
    } else {
      toast.success(`${selectedIds.length} link(s) ${show ? 'made visible' : 'hidden'}`);
      setSelectedIds([]);
      onUpdate();
    }

    setIsUpdating(false);
  };

  const visibleCount = links.filter((l) => l.show_on_profile).length;
  const hiddenCount = links.length - visibleCount;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-[#CFFF16]" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60 dark:text-white/60">Visible</span>
          </div>
          <p className="text-2xl font-bold text-foreground dark:text-white tabular-nums">{visibleCount}</p>
        </div>
        <div className="rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10] p-4">
          <div className="flex items-center gap-2 mb-1">
            <EyeOff className="w-4 h-4 text-foreground/50 dark:text-white/50" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60 dark:text-white/60">Hidden</span>
          </div>
          <p className="text-2xl font-bold text-foreground dark:text-white tabular-nums">{hiddenCount}</p>
        </div>
      </div>

      {/* Links List */}
      {links.length > 0 ? (
        <div className="space-y-3">
          {/* Batch actions + select-all (merged into a single compact bar) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs text-foreground/60 dark:text-white/60 hover:text-foreground dark:hover:text-white transition-colors font-medium"
            >
              {selectedIds.length === links.length ? 'Deselect all' : 'Select all'}
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
                    <Eye className="w-3 h-3" /> Show
                  </button>
                  <button
                    onClick={() => handleBatchVisibility(false)}
                    disabled={isUpdating}
                    className="px-2.5 py-1 rounded-full bg-foreground/10 dark:bg-white/10 hover:bg-foreground/15 dark:hover:bg-white/15 text-foreground dark:text-white text-[11px] font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <EyeOff className="w-3 h-3" /> Hide
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
              items={linkIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {links.map((link) => (
                  <SortableItem
                    key={link.id}
                    link={link}
                    onToggle={handleToggleVisibility}
                    isSelected={selectedIds.includes(link.id)}
                    onSelect={handleSelectLink}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-12 text-center">
          <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No content links yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            Create your first paid content link to get started
          </p>
          <a
            href="/app/links/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Create Link
          </a>
        </div>
      )}
    </div>
  );
}
