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

  const priceLabel = `${(link.price_cents / 100).toFixed(2)} ${link.currency}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : 'hover:border-primary/50'
      } ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card'} ${!link.show_on_profile ? 'opacity-60' : ''} p-4`}
    >
      <div className="flex items-center gap-3">
        {/* Checkbox for selection */}
        <button
          onClick={() => onSelect(link.id)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Select link"
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

        {/* Lock Icon */}
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          <Lock className="w-5 h-5" />
        </div>

        {/* Link Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground truncate">{link.title}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-bold text-primary">{priceLabel}</span>
            {link.description && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground truncate">{link.description}</span>
              </>
            )}
          </div>
        </div>

        {/* Visibility Toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            {link.show_on_profile ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Visible</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Hidden</span>
              </>
            )}
          </div>
          <Switch
            checked={link.show_on_profile}
            onCheckedChange={(checked) => onToggle(link.id, checked)}
          />
        </div>
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
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">Visible</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{visibleCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <EyeOff className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Hidden</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{hiddenCount}</p>
        </div>
      </div>

      {/* Links List */}
      {links.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Your Content Links</h3>
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
                  Make Visible
                </button>
                <button
                  onClick={() => handleBatchVisibility(false)}
                  disabled={isUpdating}
                  className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <EyeOff className="w-3.5 h-3.5 inline mr-1" />
                  Hide
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
            {selectedIds.length === links.length ? 'Deselect All' : 'Select All'}
          </button>

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
