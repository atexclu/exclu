import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { GripVertical, Plus, X } from 'lucide-react';
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
import {
  SiX,
  SiInstagram,
  SiTiktok,
  SiTelegram,
  SiOnlyfans,
  SiYoutube,
  SiSnapchat,
  SiLinktree,
} from 'react-icons/si';

interface SocialSectionProps {
  socialLinks: Record<string, string>;
  onUpdate: (updates: { social_links: Record<string, string> }) => void;
}

const socialPlatforms = [
  { id: 'instagram', label: 'Instagram', icon: <SiInstagram className="w-5 h-5" />, placeholder: 'https://instagram.com/yourhandle', gradient: 'from-[#f97316] to-[#ec4899]' },
  { id: 'twitter', label: 'X (Twitter)', icon: <SiX className="w-5 h-5" />, placeholder: 'https://x.com/yourhandle', gradient: 'from-slate-900 to-slate-700' },
  { id: 'tiktok', label: 'TikTok', icon: <SiTiktok className="w-5 h-5" />, placeholder: 'https://tiktok.com/@yourhandle', gradient: 'from-[#ff0050] to-[#00f2ea]' },
  { id: 'onlyfans', label: 'OnlyFans', icon: <SiOnlyfans className="w-5 h-5" />, placeholder: 'https://onlyfans.com/yourhandle', gradient: 'from-sky-500 to-cyan-400' },
  { id: 'fansly', label: 'Fansly', icon: <SiOnlyfans className="w-5 h-5" />, placeholder: 'https://fansly.com/yourhandle', gradient: 'from-sky-500 to-blue-600' },
  { id: 'youtube', label: 'YouTube', icon: <SiYoutube className="w-5 h-5" />, placeholder: 'https://youtube.com/@yourhandle', gradient: 'from-red-500 to-red-700' },
  { id: 'telegram', label: 'Telegram', icon: <SiTelegram className="w-5 h-5" />, placeholder: 'https://t.me/yourhandle', gradient: 'from-sky-500 to-cyan-500' },
  { id: 'snapchat', label: 'Snapchat', icon: <SiSnapchat className="w-5 h-5" />, placeholder: 'https://snapchat.com/add/yourhandle', gradient: 'from-yellow-300 to-yellow-500' },
  { id: 'linktree', label: 'Linktree', icon: <SiLinktree className="w-5 h-5" />, placeholder: 'https://linktr.ee/yourhandle', gradient: 'from-emerald-400 to-emerald-600' },
];

interface SortableItemProps {
  id: string;
  platform: typeof socialPlatforms[0];
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}

function SortableItem({ id, platform, value, onChange, onRemove }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border border-border bg-card p-4 transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : 'hover:border-primary/50'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Drag Handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </button>

        {/* Platform Icon */}
        <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${platform.gradient} flex items-center justify-center text-white flex-shrink-0`}>
          {platform.icon}
        </div>

        {/* Input */}
        <div className="flex-1 min-w-0">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            {platform.label}
          </label>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={platform.placeholder}
            className="h-9 bg-muted/50 border-border text-sm"
          />
        </div>

        {/* Remove Button */}
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Remove link"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function SocialSection({ socialLinks, onUpdate }: SocialSectionProps) {
  // Track platforms being edited (just added with empty URL)
  const [editingPlatforms, setEditingPlatforms] = useState<string[]>([]);
  
  // Une plateforme est "active" si elle a une URL non-vide OU si elle est en cours d'édition
  const activePlatforms = socialPlatforms.filter((p) => 
    (socialLinks[p.id] && socialLinks[p.id].trim() !== '') || editingPlatforms.includes(p.id)
  );
  const activePlatformIds = activePlatforms.map((p) => p.id);
  
  // Une plateforme est "disponible" si elle n'existe pas OU (a une valeur vide ET n'est pas en cours d'édition)
  const availablePlatforms = socialPlatforms.filter((p) => 
    (!socialLinks[p.id] || socialLinks[p.id].trim() === '') && !editingPlatforms.includes(p.id)
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activePlatformIds.indexOf(active.id as string);
      const newIndex = activePlatformIds.indexOf(over.id as string);
      const newOrder = arrayMove(activePlatformIds, oldIndex, newIndex);

      // Reorder is handled visually, actual order can be saved in link_order
      // For now, we just keep the same social_links object
    }
  };

  const handleAddPlatform = (platformId: string) => {
    console.log('handleAddPlatform called with:', platformId);
    console.log('Current socialLinks:', socialLinks);
    const newLinks = { ...socialLinks, [platformId]: '' };
    console.log('New socialLinks:', newLinks);
    onUpdate({ social_links: newLinks });
    // Add to editing platforms so it shows up in "Your Social Links"
    setEditingPlatforms([...editingPlatforms, platformId]);
  };

  const handleRemovePlatform = (platformId: string) => {
    const newLinks = { ...socialLinks };
    delete newLinks[platformId];
    onUpdate({ social_links: newLinks });
    // Remove from editing platforms
    setEditingPlatforms(editingPlatforms.filter(id => id !== platformId));
  };

  const handleUpdateLink = (platformId: string, value: string) => {
    const newLinks = { ...socialLinks, [platformId]: value };
    onUpdate({ social_links: newLinks });
  };

  return (
    <div className="space-y-6">
      {/* Active Social Links */}
      {activePlatforms.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Your Social Links</h3>
            <p className="text-xs text-muted-foreground">Drag to reorder</p>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={activePlatformIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {activePlatforms.map((platform) => (
                  <SortableItem
                    key={platform.id}
                    id={platform.id}
                    platform={platform}
                    value={socialLinks[platform.id]}
                    onChange={(value) => handleUpdateLink(platform.id, value)}
                    onRemove={() => handleRemovePlatform(platform.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Add New Platform */}
      {availablePlatforms.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Add Social Link</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {availablePlatforms.map((platform) => (
              <button
                type="button"
                key={platform.id}
                onClick={() => handleAddPlatform(platform.id)}
                className="flex items-center gap-2 p-3 rounded-xl border border-border bg-muted/30 hover:bg-muted hover:border-primary/50 transition-all group"
              >
                <div className={`w-8 h-8 rounded-full bg-gradient-to-r ${platform.gradient} flex items-center justify-center text-white flex-shrink-0`}>
                  {platform.icon}
                </div>
                <span className="text-sm font-medium text-foreground truncate">{platform.label}</span>
                <Plus className="w-4 h-4 ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {activePlatforms.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No social links added yet. Add your first platform above!
          </p>
        </div>
      )}
    </div>
  );
}
