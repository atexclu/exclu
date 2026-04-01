import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { GripVertical, Plus, X, Lock, ArrowUpRight, ExternalLink, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { getAuroraGradient } from '@/lib/auroraGradients';
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
  exclusiveContentUrl?: string | null;
  exclusiveContentImageUrl?: string | null;
  auroraGradient?: string;
  links?: CreatorLink[];
  userId?: string | null;
  onUpdate: (updates: Partial<{ social_links: Record<string, string>; exclusive_content_text: string | null; exclusive_content_link_id: string | null; exclusive_content_url: string | null; exclusive_content_image_url: string | null }>) => void;
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

export function SocialSection({ socialLinks, exclusiveContentText, exclusiveContentLinkId, exclusiveContentUrl, exclusiveContentImageUrl, auroraGradient, links = [], userId, onUpdate }: SocialSectionProps) {
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be less than 5MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return; }
    setIsUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop() ?? 'jpg';
      const filePath = `avatars/${userId}/exclusive-content.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });
      if (uploadError) { toast.error('Failed to upload image'); return; }
      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const newUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      onUpdate({ exclusive_content_image_url: newUrl });
      toast.success('Image uploaded!');
    } catch { toast.error('Upload failed'); } finally { setIsUploadingImage(false); }
  };

  const handleImageRemove = async () => {
    if (!userId) return;
    // Delete all possible extensions from storage
    const extensions = ['jpg', 'jpeg', 'png', 'webp'];
    const paths = extensions.map((ext) => `avatars/${userId}/exclusive-content.${ext}`);
    await supabase.storage.from('avatars').remove(paths);
    onUpdate({ exclusive_content_image_url: null });
    toast.success('Image removed');
  };
  const auroraColors = getAuroraGradient(auroraGradient || 'purple_dream').colors;
  const themeStyle = { stops: [auroraColors[0], auroraColors[2]] as [string, string], shadowColor: `${auroraColors[0]}33` };
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

        {/* Redirect URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            Redirect URL
          </label>
          <Input
            value={exclusiveContentUrl || ''}
            onChange={(e) => onUpdate({ exclusive_content_url: e.target.value || null })}
            placeholder="https://example.com/my-content"
            className="h-10 bg-muted/50 border-border text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            URL to open when the button is clicked.
          </p>
        </div>

        {/* Preview image upload */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <ImageIcon className="w-3 h-3" />
            Preview image (optional)
          </label>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          {exclusiveContentImageUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-border">
              <img src={exclusiveContentImageUrl} alt="Exclusive content preview" className="w-full h-40 object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-3 inset-x-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-white" />
                  <span className="text-sm font-bold text-white truncate max-w-[160px]">
                    {exclusiveContentText || 'Exclusive content'}
                  </span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-white/70" />
              </div>
              <button
                type="button"
                onClick={handleImageRemove}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploadingImage}
              className="w-full h-24 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/20 flex flex-col items-center justify-center gap-1.5 transition-colors"
            >
              {isUploadingImage ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Upload preview image</span>
                </>
              )}
            </button>
          )}
          <p className="text-[10px] text-muted-foreground">
            If set, displays as a clickable image card instead of the gradient button.
          </p>
        </div>

        {/* Live preview (gradient button — only shown when no image) */}
        {!exclusiveContentImageUrl && (
          <>
            <div className="flex justify-center pt-2">
              <div className="w-full h-12 rounded-full flex items-center justify-center gap-2 shadow-lg" style={{ background: `linear-gradient(to right, ${themeStyle.stops[0]}, ${themeStyle.stops[1]})`, boxShadow: `0 10px 15px -3px ${themeStyle.shadowColor}` }}>
                <Lock className="w-4 h-4 text-white" />
                <span className="text-sm font-bold text-white truncate max-w-[200px]">
                  {exclusiveContentText || 'Exclusive content'}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Preview of how it will look on your profile
            </p>
          </>
        )}
      </div>

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
