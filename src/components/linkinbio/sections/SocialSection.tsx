import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { GripVertical, Plus, X, Lock, ChevronDown, ArrowUpRight } from 'lucide-react';
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

interface CreatorLink {
  id: string;
  title: string;
  description?: string | null;
  price_cents: number;
  currency: string;
  slug: string;
  show_on_profile?: boolean;
}

interface SocialSectionProps {
  socialLinks: Record<string, string>;
  exclusiveContentText?: string | null;
  exclusiveContentLinkId?: string | null;
  themeColor?: string;
  links?: CreatorLink[];
  onUpdate: (updates: Partial<{ social_links: Record<string, string>; exclusive_content_text: string | null; exclusive_content_link_id: string | null }>) => void;
}

const themeGradients: Record<string, { gradient: string; shadow: string }> = {
  pink: { gradient: 'from-pink-500 via-rose-400 to-pink-500', shadow: 'shadow-pink-500/20' },
  purple: { gradient: 'from-purple-500 via-violet-400 to-purple-500', shadow: 'shadow-purple-500/20' },
  blue: { gradient: 'from-blue-500 via-cyan-400 to-blue-500', shadow: 'shadow-blue-500/20' },
  orange: { gradient: 'from-orange-500 via-amber-400 to-orange-500', shadow: 'shadow-orange-500/20' },
  green: { gradient: 'from-green-500 via-emerald-400 to-green-500', shadow: 'shadow-green-500/20' },
  red: { gradient: 'from-red-500 via-rose-400 to-red-500', shadow: 'shadow-red-500/20' },
};

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

export function SocialSection({ socialLinks, exclusiveContentText, exclusiveContentLinkId, themeColor, links = [], onUpdate }: SocialSectionProps) {
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const themeStyle = themeGradients[themeColor || 'pink'] || themeGradients.pink;
  const selectedLink = links.find((l) => l.id === exclusiveContentLinkId);
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
      {/* Exclusive content button customization */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Exclusive Content Button</h3>
        <p className="text-xs text-muted-foreground">
          This gradient button appears at the top of your public profile. Customize the text and choose which link it opens.
        </p>

        {/* Button label */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Button label</label>
          <Input
            value={exclusiveContentText || ''}
            onChange={(e) => onUpdate({ exclusive_content_text: e.target.value || null })}
            placeholder="e.g. Unlock My VIP Content"
            maxLength={50}
            className="h-10 bg-muted/50 border-border text-sm"
          />
        </div>

        {/* Link picker */}
        {links.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Opens link</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLinkPicker(!showLinkPicker)}
                className="w-full h-10 px-3 rounded-md border border-border bg-muted/50 text-sm flex items-center justify-between hover:border-primary/50 transition-colors"
              >
                <span className={selectedLink ? 'text-foreground' : 'text-muted-foreground'}>
                  {selectedLink ? selectedLink.title : 'Select a link...'}
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showLinkPicker ? 'rotate-180' : ''}`} />
              </button>
              {showLinkPicker && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                  {links.map((link) => {
                    const priceLabel = `${(link.price_cents / 100).toFixed(2)} ${link.currency}`;
                    return (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => {
                          onUpdate({ exclusive_content_link_id: link.id });
                          setShowLinkPicker(false);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm flex items-center justify-between hover:bg-muted/50 transition-colors ${
                          exclusiveContentLinkId === link.id ? 'bg-primary/10 text-primary' : 'text-foreground'
                        }`}
                      >
                        <span className="truncate">{link.title}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">{priceLabel}</span>
                      </button>
                    );
                  })}
                  {exclusiveContentLinkId && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdate({ exclusive_content_link_id: null });
                        setShowLinkPicker(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-red-500 hover:bg-red-500/10 border-t border-border"
                    >
                      Remove link
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live preview */}
        <div className="flex justify-center pt-2">
          <div className={`w-full h-12 rounded-full bg-gradient-to-r ${themeStyle.gradient} flex items-center justify-center gap-2 shadow-lg ${themeStyle.shadow}`}>
            <Lock className="w-4 h-4 text-white" />
            <span className="text-sm font-bold text-white truncate max-w-[200px]">
              {exclusiveContentText || 'Exclusive content'}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Preview of how it will look on your profile
        </p>
      </div>

      {/* Configured Exclusive Link card */}
      {exclusiveContentText && selectedLink && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Exclusive Link</h3>
          <div className={`w-full h-12 rounded-full bg-gradient-to-r ${themeStyle.gradient} flex items-center justify-between px-5 ${themeStyle.shadow} shadow-lg`}>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-white" />
              <span className="text-sm font-bold text-white truncate max-w-[160px]">
                {exclusiveContentText}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-white/80">
                {(selectedLink.price_cents / 100).toFixed(2)} {selectedLink.currency}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 text-white/70" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Opens → {selectedLink.title}
          </p>
        </div>
      )}

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
