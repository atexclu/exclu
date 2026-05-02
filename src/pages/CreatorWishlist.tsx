import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { maybeConvertHeic } from '@/lib/convertHeic';
import { useProfiles } from '@/contexts/ProfileContext';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift, Plus, Pencil, Trash2, Loader2, Eye, EyeOff,
  GripVertical, Check, X, Image as ImageIcon, DollarSign,
  Sparkles, Package, Upload, Link as LinkIcon, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PresetItem {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  image_url: string | null;
  default_price_cents: number;
  currency: string;
}

interface WishlistItem {
  id: string;
  preset_id: string | null;
  name: string;
  description: string | null;
  emoji: string;
  image_url: string | null;
  gift_url: string | null;
  price_cents: number;
  currency: string;
  max_quantity: number | null;
  gifted_count: number;
  sort_order: number;
  is_visible: boolean;
}

interface GiftRecord {
  id: string;
  amount_cents: number;
  creator_net_cents: number;
  is_anonymous: boolean;
  message: string | null;
  created_at: string;
  paid_at: string | null;
  read_at: string | null;
  status: string;
  wishlist_item_id: string;
  itemName?: string;
  itemEmoji?: string;
}

const DEFAULT_EMOJI = '🎁';

const EMOJI_OPTIONS = ['🎁', '💻', '👠', '🛍️', '🛒', '🍽️', '💆', '💐', '🌸', '✈️', '🥂', '💄', '👜', '💎', '🎀', '🌴', '🎧', '👟'];

type Tab = 'manage' | 'received';

interface SortableWishlistItemProps {
  item: WishlistItem;
  togglingId: string | null;
  deletingId: string | null;
  onToggleVisibility: (item: WishlistItem) => void;
  onEdit: (item: WishlistItem) => void;
  onDelete: (id: string) => void;
  formatPrice: (cents: number) => string;
}

const SortableWishlistItem = ({ item, togglingId, deletingId, onToggleVisibility, onEdit, onDelete, formatPrice }: SortableWishlistItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-4 rounded-2xl border bg-card p-4 transition-colors ${item.is_visible ? 'border-border/50' : 'border-border/30 opacity-60'}`}
    >
      <button
        type="button"
        className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 cursor-grab active:cursor-grabbing hidden sm:block touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden bg-muted flex items-center justify-center">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl">{item.emoji || DEFAULT_EMOJI}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-foreground truncate">{item.name}</p>
          {!item.is_visible && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Hidden</span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-sm font-medium text-[#a3e635]">{formatPrice(item.price_cents)}</span>
          <span className="text-xs text-muted-foreground">
            {item.gifted_count} gifted
            {item.max_quantity !== null ? ` / ${item.max_quantity}` : ''}
            {item.max_quantity !== null && item.gifted_count >= item.max_quantity && (
              <span className="ml-1 text-green-400 font-medium">· Fulfilled ✓</span>
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {item.gift_url && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => window.open(item.gift_url!, '_blank', 'noopener')}
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Open gift link"
          >
            <ExternalLink className="w-4 h-4" />
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => onToggleVisibility(item)}
          disabled={togglingId === item.id}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={item.is_visible ? 'Hide from profile' : 'Show on profile'}
        >
          {togglingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : item.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => onEdit(item)}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Pencil className="w-4 h-4" />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => onDelete(item.id)}
          disabled={deletingId === item.id}
          className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          {deletingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </motion.button>
      </div>
    </div>
  );
};

const CreatorWishlist = () => {
  const { activeProfile } = useProfiles();
  const [isLoading, setIsLoading] = useState(true);
  const [creatorId, setCreatorId] = useState<string | null>(null);

  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [gifts, setGifts] = useState<GiftRecord[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('manage');

  // Add/Edit modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<WishlistItem | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEmoji, setFormEmoji] = useState(DEFAULT_EMOJI);
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImagePreview, setFormImagePreview] = useState<string | null>(null);
  const [formGiftUrl, setFormGiftUrl] = useState('');
  const [formPriceCents, setFormPriceCents] = useState('');
  const [formMaxQty, setFormMaxQty] = useState('');
  const [formUnlimited, setFormUnlimited] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Stats
  const [totalGiftsRevenue, setTotalGiftsRevenue] = useState(0);
  const [unreadGiftsCount, setUnreadGiftsCount] = useState(0);

  useEffect(() => {
    loadData();
  }, [activeProfile?.id]);

  const loadData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsLoading(false); return; }
    setCreatorId(user.id);

    const [presetsRes, itemsRes, giftsRes] = await Promise.all([
      supabase
        .from('wishlist_preset_items')
        .select('id, name, description, emoji, image_url, default_price_cents, currency')
        .order('sort_order'),
      activeProfile?.id
        ? supabase.from('wishlist_items').select('*').eq('profile_id', activeProfile.id).order('sort_order')
        : supabase.from('wishlist_items').select('*').eq('creator_id', user.id).order('sort_order'),
      activeProfile?.id
        ? supabase.from('gift_purchases').select('id, amount_cents, creator_net_cents, is_anonymous, message, created_at, paid_at, read_at, status, wishlist_item_id').eq('profile_id', activeProfile.id).eq('status', 'succeeded').order('created_at', { ascending: false }).limit(50)
        : supabase.from('gift_purchases').select('id, amount_cents, creator_net_cents, is_anonymous, message, created_at, paid_at, read_at, status, wishlist_item_id').eq('creator_id', user.id).eq('status', 'succeeded').order('created_at', { ascending: false }).limit(50),
    ]);

    if (presetsRes.data) setPresets(presetsRes.data);
    if (itemsRes.data) setItems(itemsRes.data);

    if (giftsRes.data) {
      const itemMap = new Map((itemsRes.data || []).map((i: WishlistItem) => [i.id, i]));
      const enriched = giftsRes.data.map((g: GiftRecord) => {
        const item = itemMap.get(g.wishlist_item_id);
        return { ...g, itemName: item?.name ?? '—', itemEmoji: item?.emoji ?? '🎁' };
      });
      setGifts(enriched);
      setTotalGiftsRevenue(enriched.reduce((acc: number, g: GiftRecord) => acc + (g.creator_net_cents || 0), 0));
      setUnreadGiftsCount(enriched.filter((g: GiftRecord) => !g.read_at).length);
    }

    setIsLoading(false);
  };

  const openAddCustom = () => {
    setEditingItem(null);
    setFormName('');
    setFormDescription('');
    setFormEmoji(DEFAULT_EMOJI);
    setFormImageUrl('');
    setFormImageFile(null);
    setFormImagePreview(null);
    setFormGiftUrl('');
    setFormPriceCents('');
    setFormMaxQty('1');
    setFormUnlimited(true);
    setShowAddModal(true);
  };

  const openEdit = (item: WishlistItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormDescription(item.description ?? '');
    setFormEmoji(item.emoji ?? DEFAULT_EMOJI);
    setFormImageUrl(item.image_url ?? '');
    setFormImageFile(null);
    setFormImagePreview(item.image_url ?? null);
    setFormGiftUrl(item.gift_url ?? '');
    setFormPriceCents(String(item.price_cents / 100));
    setFormMaxQty(item.max_quantity !== null ? String(item.max_quantity) : '1');
    setFormUnlimited(item.max_quantity === null);
    setShowAddModal(true);
  };

  const addFromPreset = (preset: PresetItem) => {
    setEditingItem(null);
    setFormName(preset.name);
    setFormDescription(preset.description ?? '');
    setFormEmoji(preset.emoji ?? DEFAULT_EMOJI);
    setFormImageUrl(preset.image_url ?? '');
    setFormImageFile(null);
    setFormImagePreview(preset.image_url ?? null);
    setFormGiftUrl('');
    setFormPriceCents(String(preset.default_price_cents / 100));
    setFormMaxQty('1');
    setFormUnlimited(true);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!creatorId) return;
    const name = formName.trim();
    if (!name) { toast.error('Item name is required'); return; }

    const priceRaw = parseFloat(formPriceCents);
    if (isNaN(priceRaw) || priceRaw < 1) { toast.error('Minimum price is $1.00'); return; }
    const priceCents = Math.round(priceRaw * 100);
    const maxQty = formUnlimited ? null : Math.max(1, parseInt(formMaxQty) || 1);

    setIsSaving(true);
    try {
      let finalImageUrl = formImageUrl.trim() || null;

      // Upload image if a file was selected
      if (formImageFile && creatorId) {
        const ext = formImageFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `wishlist/${creatorId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, formImageFile, { cacheControl: '3600', upsert: true });
        if (uploadErr) throw new Error('Image upload failed');
        const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(path);
        finalImageUrl = publicUrl?.publicUrl ?? null;
      }

      if (editingItem) {
        const { error } = await supabase
          .from('wishlist_items')
          .update({
            name,
            description: formDescription.trim() || null,
            emoji: formEmoji,
            image_url: finalImageUrl,
            gift_url: formGiftUrl.trim() || null,
            price_cents: priceCents,
            max_quantity: maxQty,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingItem.id);
        if (error) throw error;
        toast.success('Item updated');
      } else {
        const nextOrder = items.length;
        const { error } = await supabase.from('wishlist_items').insert({
          creator_id: creatorId,
          profile_id: activeProfile?.id || null,
          name,
          description: formDescription.trim() || null,
          emoji: formEmoji,
          image_url: finalImageUrl,
          gift_url: formGiftUrl.trim() || null,
          price_cents: priceCents,
          currency: 'USD',
          max_quantity: maxQty,
          sort_order: nextOrder,
          is_visible: true,
        });
        if (error) throw error;
        toast.success('Item added to your wishlist');
      }
      setShowAddModal(false);
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save item');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Remove this item from your wishlist?')) return;
    setDeletingId(itemId);
    const { error } = await supabase.from('wishlist_items').delete().eq('id', itemId);
    if (error) { toast.error('Failed to delete item'); } else { toast.success('Item removed'); await loadData(); }
    setDeletingId(null);
  };

  const handleToggleVisibility = async (item: WishlistItem) => {
    setTogglingId(item.id);
    const { error } = await supabase
      .from('wishlist_items')
      .update({ is_visible: !item.is_visible, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) { toast.error('Failed to update visibility'); } else { await loadData(); }
    setTogglingId(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    const updates = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    for (const u of updates) {
      await supabase.from('wishlist_items').update({ sort_order: u.sort_order }).eq('id', u.id);
    }
  };

  const markGiftsAsRead = async () => {
    if (!creatorId || unreadGiftsCount === 0) return;
    await supabase
      .from('gift_purchases')
      .update({ read_at: new Date().toISOString() })
      .eq('creator_id', creatorId)
      .is('read_at', null);
    await loadData();
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="px-4 lg:px-6 pb-16 w-full">
        {/* Header */}
        <section className="mt-4 sm:mt-6 mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-1">Wishlist</h1>
            <p className="text-exclu-space text-xs sm:text-sm max-w-xl">
              Let your fans treat you — they gift, the money goes straight to your wallet.
            </p>
          </div>
          <Button
            onClick={openAddCustom}
            variant="hero"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            New item
          </Button>
        </section>

        {/* Tabs */}
        <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80 mb-6">
          {([{ key: 'manage' as Tab, label: 'Manage' }, { key: 'received' as Tab, label: 'Gifts received' }]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setActiveTab(key); if (key === 'received') markGiftsAsRead(); }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full font-medium transition-all ${
                activeTab === key
                  ? 'bg-primary text-white dark:text-black shadow-sm'
                  : 'hover:text-exclu-cloud text-exclu-space/80'
              }`}
            >
              {label}
              {key === 'received' && unreadGiftsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary-foreground/20 text-[10px] font-bold min-w-[18px] text-center">
                  {unreadGiftsCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'manage' && (
            <motion.div key="manage" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>

              {/* ── Inline Add / Edit form ── */}
              {showAddModal && (
                <motion.div
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mb-6"
                >
                  <Card className="bg-gradient-to-br from-exclu-ink/95 via-exclu-phantom/40 to-exclu-ink/95 border border-exclu-arsenic/70 shadow-glow-lg rounded-2xl backdrop-blur-2xl">
                    <CardHeader className="px-6 pt-6 pb-3 space-y-1">
                      <CardTitle className="text-base text-exclu-cloud">
                        {editingItem ? 'Edit Item' : 'New Wishlist Item'}
                      </CardTitle>
                      <CardDescription className="text-xs text-exclu-space/80">
                        {editingItem ? 'Update the details below.' : 'Fill in the details for your new wishlist item.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="px-6 pb-6 space-y-5">
                      {/* Quick-fill from catalogue */}
                      {!editingItem && presets.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-exclu-space mb-2 block">Quick add from catalogue</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {presets
                              .slice(0, Math.min(presets.length, 6))
                              .map((preset, idx) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => addFromPreset(preset)}
                                className={`flex items-center gap-2.5 p-2.5 rounded-xl border border-exclu-arsenic/50 bg-exclu-ink/60 hover:border-primary/50 hover:bg-primary/5 transition-all text-left ${idx === 5 ? 'hidden sm:flex' : ''}`}
                              >
                                {preset.image_url ? (
                                  <img src={preset.image_url} alt={preset.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                                ) : (
                                  <span className="text-xl sm:text-2xl flex-shrink-0">{preset.emoji}</span>
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-exclu-cloud truncate">{preset.name}</p>
                                  <p className="text-[11px] text-primary">{formatPrice(preset.default_price_cents)}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                          <div className="border-b border-exclu-arsenic/40 mt-4 mb-1" />
                          <p className="text-[11px] text-exclu-space/50 text-center">Or fill in the details manually below</p>
                        </div>
                      )}

                      {/* Emoji picker */}
                      <div>
                        <label className="text-xs font-medium text-exclu-space mb-2 block">Emoji</label>
                        <div className="flex flex-wrap gap-2">
                          {EMOJI_OPTIONS.map((e) => (
                            <button
                              key={e}
                              type="button"
                              onClick={() => setFormEmoji(e)}
                              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl text-lg sm:text-xl flex items-center justify-center border transition-all ${formEmoji === e ? 'border-primary bg-primary/20' : 'border-exclu-arsenic/50 hover:border-exclu-arsenic'}`}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Name */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-exclu-space" htmlFor="wl-name">Item name</label>
                        <Input
                          id="wl-name"
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="e.g. MacBook, Spa Day, Dinner..."
                          maxLength={100}
                          className="h-10 bg-black/60 border-exclu-arsenic/70 text-exclu-cloud placeholder:text-exclu-space/50 text-sm"
                        />
                      </div>

                      {/* Description */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-exclu-space" htmlFor="wl-desc">Description (optional)</label>
                        <Textarea
                          id="wl-desc"
                          value={formDescription}
                          onChange={(e) => setFormDescription(e.target.value)}
                          placeholder="Optional short description..."
                          rows={2}
                          maxLength={500}
                          className="min-h-[64px] bg-black/60 border-exclu-arsenic/70 text-exclu-cloud placeholder:text-exclu-space/50 text-sm"
                        />
                      </div>

                      {/* Price */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-exclu-space" htmlFor="wl-price">Price (USD)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-exclu-space/60" />
                          <Input
                            id="wl-price"
                            value={formPriceCents}
                            onChange={(e) => setFormPriceCents(e.target.value)}
                            placeholder="0"
                            type="number"
                            min="1"
                            step="0.01"
                            className="pl-9 h-10 bg-black/60 border-exclu-arsenic/70 text-exclu-cloud text-sm"
                          />
                        </div>
                      </div>

                      {/* Photo upload */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-exclu-space">Photo (optional)</label>
                        <p className="text-[11px] text-exclu-space/60 mb-1">Upload a photo or leave empty to use the emoji.</p>
                        {(formImagePreview || formImageUrl) ? (
                          <div className="relative w-full h-32 rounded-xl overflow-hidden border border-exclu-arsenic/60 bg-exclu-ink">
                            <img src={formImagePreview || formImageUrl} alt="Preview" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => { setFormImageFile(null); setFormImagePreview(null); setFormImageUrl(''); }}
                              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-exclu-arsenic/60 bg-exclu-ink/80 cursor-pointer hover:border-primary/50 transition-colors">
                            <Upload className="w-5 h-5 text-exclu-space/60" />
                            <span className="text-xs text-exclu-space/60">Click to upload</span>
                            <input
                              type="file"
                              accept="image/*,.heic,.heif"
                              className="hidden"
                              onChange={async (e) => {
                                const raw = e.target.files?.[0];
                                if (!raw) return;
                                if (raw.size > 10 * 1024 * 1024) { toast.error('Image must be under 10 MB'); return; }
                                const f = await maybeConvertHeic(raw);
                                setFormImageFile(f);
                                setFormImagePreview(URL.createObjectURL(f));
                              }}
                            />
                          </label>
                        )}
                      </div>

                      {/* Gift URL */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-exclu-space" htmlFor="wl-url">Gift link (optional)</label>
                        <div className="relative">
                          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-exclu-space/60" />
                          <Input
                            id="wl-url"
                            value={formGiftUrl}
                            onChange={(e) => setFormGiftUrl(e.target.value)}
                            placeholder="https://amazon.com/..."
                            className="pl-9 h-10 bg-black/60 border-exclu-arsenic/70 text-exclu-cloud placeholder:text-exclu-space/50 text-sm"
                          />
                        </div>
                        <p className="text-[10px] text-exclu-space/50">Informational link shown to fans (e.g. Amazon, brand website)</p>
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="text-xs font-medium text-exclu-space mb-2 block">Max quantity</label>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <div
                              onClick={() => setFormUnlimited(true)}
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${formUnlimited ? 'border-primary bg-primary' : 'border-exclu-arsenic'}`}
                            >
                              {formUnlimited && <Check className="w-3 h-3 text-black" />}
                            </div>
                            <span className="text-sm text-exclu-cloud">Unlimited</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <div
                              onClick={() => setFormUnlimited(false)}
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${!formUnlimited ? 'border-primary bg-primary' : 'border-exclu-arsenic'}`}
                            >
                              {!formUnlimited && <Check className="w-3 h-3 text-black" />}
                            </div>
                            <span className="text-sm text-exclu-cloud">Limited</span>
                          </label>
                          {!formUnlimited && (
                            <Input
                              value={formMaxQty}
                              onChange={(e) => setFormMaxQty(e.target.value)}
                              type="number"
                              min="1"
                              className="w-20 h-10 bg-black/60 border-exclu-arsenic/70 text-exclu-cloud text-sm"
                              placeholder="1"
                            />
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between gap-4 pt-2">
                        <Button variant="outline" onClick={() => setShowAddModal(false)} className="rounded-full border-exclu-arsenic/70">
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSave}
                          disabled={isSaving || !formName.trim() || !formPriceCents}
                          variant="hero"
                          className="rounded-full px-6"
                        >
                          {isSaving ? 'Saving…' : editingItem ? 'Save changes' : 'Add to wishlist'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {!showAddModal && items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="w-16 h-16 rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 flex items-center justify-center">
                    <Gift className="w-7 h-7 text-exclu-space/50" />
                  </div>
                  <div className="text-center space-y-1.5">
                    <p className="text-base font-semibold text-foreground">Your wishlist is empty</p>
                    <p className="text-sm text-muted-foreground max-w-xs">Add items from our catalogue or create your own. Your fans will be able to gift them directly.</p>
                  </div>
                  <Button onClick={openAddCustom} variant="hero" size="sm">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Add your first item
                  </Button>
                </div>
              ) : !showAddModal && items.length > 0 ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {items.map((item) => (
                        <SortableWishlistItem
                          key={item.id}
                          item={item}
                          togglingId={togglingId}
                          deletingId={deletingId}
                          onToggleVisibility={handleToggleVisibility}
                          onEdit={openEdit}
                          onDelete={handleDelete}
                          formatPrice={formatPrice}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : null}
            </motion.div>
          )}

          {activeTab === 'received' && (
            <motion.div key="received" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              {gifts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="w-16 h-16 rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 flex items-center justify-center">
                    <Gift className="w-7 h-7 text-exclu-space/50" />
                  </div>
                  <div className="text-center space-y-1.5">
                    <p className="text-base font-semibold text-foreground">No gifts yet</p>
                    <p className="text-sm text-muted-foreground max-w-xs">Once a fan gifts an item from your wishlist, it will appear here.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {gifts.map((gift) => (
                    <motion.div
                      key={gift.id}
                      layout
                      className={`rounded-2xl border bg-card p-4 ${!gift.read_at ? 'border-[#E5FF7D]/30 bg-[#E5FF7D]/5' : 'border-border/50'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl mt-0.5">{gift.itemEmoji}</span>
                          <div>
                            <p className="font-semibold text-foreground">
                              {gift.is_anonymous ? 'An anonymous fan' : 'A fan'} gifted{' '}
                              <span className="text-[#a3e635]">{gift.itemName}</span>
                            </p>
                            {gift.message && (
                              <p className="text-sm text-muted-foreground mt-1 italic">"{gift.message}"</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(gift.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-bold text-[#a3e635]">{formatPrice(gift.amount_cents)}</p>
                          <p className="text-xs text-muted-foreground">You received {formatPrice(gift.creator_net_cents)}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

    </AppShell>
  );
};

export default CreatorWishlist;
