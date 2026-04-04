import { useState } from 'react';
import { Gift, Eye, EyeOff, GripVertical, ExternalLink, Pencil, Plus, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
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

interface WishlistItem {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  image_url: string | null;
  gift_url: string | null;
  price_cents: number;
  max_quantity: number | null;
  gifted_count: number;
  is_visible: boolean;
  sort_order: number;
}

interface WishlistSectionProps {
  items: WishlistItem[];
  onUpdate: () => void;
}

interface SortableItemProps {
  item: WishlistItem;
  onToggle: (id: string, show: boolean) => void;
}

function SortableItem({ item, onToggle }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : 'hover:border-primary/50'
      } ${!item.is_visible ? 'opacity-60 border-border/30' : 'border-border'} bg-card p-4`}
    >
      <div className="flex items-center gap-3">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Image / Emoji */}
        <div className="w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden bg-muted flex items-center justify-center">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl">{item.emoji || '🎁'}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground truncate">{item.name}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-bold text-primary">
              ${(item.price_cents / 100).toLocaleString()}
            </span>
            {item.description && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground truncate">{item.description}</span>
              </>
            )}
          </div>
        </div>

        {/* Gift URL */}
        {item.gift_url && (
          <button
            onClick={() => window.open(item.gift_url!, '_blank', 'noopener')}
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
            title="Open gift link"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}

        {/* Visibility Toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            {item.is_visible ? (
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
            checked={item.is_visible}
            onCheckedChange={(checked) => onToggle(item.id, checked)}
          />
        </div>
      </div>
    </div>
  );
}

export function WishlistSection({ items, onUpdate }: WishlistSectionProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [orderedItems, setOrderedItems] = useState<WishlistItem[]>(items);

  const wishlistSuggestions = [
    { emoji: '📱', name: 'iPhone', price: 99900 },
    { emoji: '👗', name: 'Cosplay Outfit', price: 15000 },
    { emoji: '🩱', name: 'Gym Wear', price: 8000 },
    { emoji: '🧴', name: 'Lingerie', price: 12000 },
    { emoji: '🍽️', name: 'Restaurant', price: 10000 },
    { emoji: '💅', name: 'Nails', price: 6000 },
    { emoji: '💐', name: 'Flowers', price: 5000 },
    { emoji: '💆', name: 'Spa', price: 15000 },
    { emoji: '✈️', name: 'Trip', price: 50000 },
  ];

  // Sync when parent items change
  if (items.length !== orderedItems.length || items.some((it, i) => it.id !== orderedItems[i]?.id)) {
    setOrderedItems(items);
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedItems.findIndex((i) => i.id === active.id);
    const newIndex = orderedItems.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(reordered);

    // Persist new sort order
    const updates = reordered.map((item, idx) => ({
      id: item.id,
      sort_order: idx,
    }));

    for (const u of updates) {
      await supabase
        .from('wishlist_items')
        .update({ sort_order: u.sort_order })
        .eq('id', u.id);
    }

    onUpdate();
  };

  const handleToggleVisibility = async (itemId: string, show: boolean) => {
    setIsUpdating(true);

    const { error } = await supabase
      .from('wishlist_items')
      .update({ is_visible: show })
      .eq('id', itemId);

    if (error) {
      console.error('Error updating visibility', error);
      toast.error('Failed to update visibility');
    } else {
      toast.success(show ? 'Item is now visible on your profile' : 'Item hidden from profile');
      setOrderedItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, is_visible: show } : i))
      );
      onUpdate();
    }

    setIsUpdating(false);
  };

  const visibleCount = orderedItems.filter((i) => i.is_visible).length;
  const hiddenCount = orderedItems.length - visibleCount;

  const quickAddSuggestion = async (suggestion: { emoji: string; name: string; price: number }) => {
    setIsUpdating(true);
    const { data, error } = await supabase
      .from('wishlist_items')
      .insert({
        name: suggestion.name,
        emoji: suggestion.emoji,
        price_cents: suggestion.price,
        is_visible: true,
        sort_order: orderedItems.length,
      })
      .select()
      .single();

    if (error) {
      toast.error(`Failed to add ${suggestion.name}`);
    } else {
      toast.success(`${suggestion.emoji} ${suggestion.name} added!`);
      onUpdate();
    }
    setIsUpdating(false);
  };

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

      {/* Quick Ideas */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Quick Ideas</h3>
          <span className="text-xs text-muted-foreground ml-auto">Tap to add</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {wishlistSuggestions.map((suggestion) => {
            const alreadyAdded = orderedItems.some(
              (i) => i.name.toLowerCase() === suggestion.name.toLowerCase()
            );
            return (
              <button
                key={suggestion.name}
                type="button"
                disabled={isUpdating || alreadyAdded}
                onClick={() => quickAddSuggestion(suggestion)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-medium transition-all ${
                  alreadyAdded
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 cursor-default'
                    : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5 text-foreground hover:text-primary'
                }`}
              >
                <span>{suggestion.emoji}</span>
                <span>{suggestion.name}</span>
                <span className="text-xs opacity-60">${(suggestion.price / 100).toLocaleString()}</span>
                {!alreadyAdded && <Plus className="w-3 h-3 opacity-60" />}
                {alreadyAdded && <span className="text-[10px]">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Items List */}
      {orderedItems.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Your Wishlist Items</h3>
            <p className="text-xs text-muted-foreground">Drag to reorder • Toggle to show/hide</p>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedItems.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {orderedItems.map((item) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    onToggle={handleToggleVisibility}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => window.location.href = '/app/wishlist'}
            >
              <Pencil className="w-3.5 h-3.5 mr-2" />
              Edit items
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-12 text-center">
          <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No wishlist items yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            Create your first gift item to let fans treat you
          </p>
          <a
            href="/app/wishlist"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Create Item
          </a>
        </div>
      )}
    </div>
  );
}
