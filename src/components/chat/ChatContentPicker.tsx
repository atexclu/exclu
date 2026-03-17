/**
 * ChatContentPicker
 *
 * Inline panel above the message composer. Shows the profile's uploaded
 * assets (public + private) from the content library. Supports multi-select
 * and sends selected files directly as image/video messages in the chat.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Loader2, Paperclip, FileText, Check, Send, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';

export interface ContentAsset {
  id: string;
  title: string | null;
  storage_path: string;
  mime_type: string | null;
  is_public: boolean;
  previewUrl?: string | null;
  isVideo?: boolean;
}

interface ChatContentPickerProps {
  profileId: string;
  onSendAssets: (assets: ContentAsset[]) => void;
  onClose: () => void;
}

export function ChatContentPicker({ profileId, onSendAssets, onClose }: ChatContentPickerProps) {
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visFilter, setVisFilter] = useState<'all' | 'public' | 'private'>('all');

  useEffect(() => {
    let mounted = true;
    const fetchAssets = async () => {
      setIsLoading(true);

      // Get the creator user_id owning this profile
      const { data: profileRow } = await supabase
        .from('creator_profiles')
        .select('user_id')
        .eq('id', profileId)
        .single();

      if (!profileRow || !mounted) { setIsLoading(false); return; }

      const { data } = await supabase
        .from('assets')
        .select('id, title, storage_path, mime_type, is_public')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!mounted) return;

      const rawAssets = (data ?? []) as ContentAsset[];

      // Generate signed preview URLs (batch)
      const withPreviews = await Promise.all(
        rawAssets.map(async (asset) => {
          if (!asset.storage_path) return { ...asset, previewUrl: null, isVideo: false };
          const { data: signed } = await supabase.storage
            .from('paid-content')
            .createSignedUrl(asset.storage_path, 600);
          const ext = asset.storage_path.split('.').pop()?.toLowerCase() ?? '';
          const isVideo = ['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(ext)
            || (asset.mime_type?.startsWith('video/') ?? false);
          return { ...asset, previewUrl: signed?.signedUrl ?? null, isVideo };
        })
      );

      if (mounted) {
        setAssets(withPreviews);
        setIsLoading(false);
      }
    };

    fetchAssets();
    return () => { mounted = false; };
  }, [profileId]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSend = () => {
    const selected = assets.filter((a) => selectedIds.has(a.id));
    if (selected.length > 0) onSendAssets(selected);
  };

  const filtered = assets.filter((a) => {
    if (visFilter === 'public' && !a.is_public) return false;
    if (visFilter === 'private' && a.is_public) return false;
    if (search.trim()) {
      return (a.title ?? '').toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  const selectedCount = selectedIds.size;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
      className="border-t border-border bg-card overflow-hidden"
    >
      <div className="max-h-[360px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Paperclip className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">Attach content</span>
            <span className="text-[10px] text-muted-foreground">({assets.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={handleSend}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition-colors"
              >
                <Send className="w-3 h-3" />
                Send {selectedCount}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filters + Search */}
        <div className="px-3 py-2 border-b border-border/50 flex-shrink-0 flex items-center gap-2">
          <div className="flex gap-1">
            {(['all', 'public', 'private'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setVisFilter(f)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  visFilter === f
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60'
                }`}
              >
                {f === 'public' && <Eye className="w-2.5 h-2.5" />}
                {f === 'private' && <EyeOff className="w-2.5 h-2.5" />}
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-muted/50 border-0 rounded-lg outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Asset grid */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <Paperclip className="w-5 h-5 text-muted-foreground/30" />
              <p className="text-[11px] text-muted-foreground/60">
                {search ? 'No matching content' : 'No content uploaded yet'}
              </p>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {filtered.map((asset) => {
                const isSelected = selectedIds.has(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggleSelect(asset.id)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? 'border-primary ring-1 ring-primary/30'
                        : 'border-transparent hover:border-border'
                    }`}
                  >
                    {asset.previewUrl ? (
                      asset.isVideo ? (
                        <video
                          src={asset.previewUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={asset.previewUrl}
                          className="w-full h-full object-cover"
                          alt={asset.title ?? ''}
                          loading="lazy"
                        />
                      )
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <FileText className="w-5 h-5 text-muted-foreground/30" />
                      </div>
                    )}

                    {/* Selection checkmark */}
                    <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground scale-100'
                        : 'bg-black/40 text-white/60 scale-90'
                    }`}>
                      {isSelected ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-white/60" />
                      )}
                    </div>

                    {/* Visibility badge */}
                    <div className="absolute bottom-1 left-1">
                      {asset.is_public ? (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-green-500/80 text-white">Public</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-black/60 text-white/80">Private</span>
                      )}
                    </div>

                    {/* Video indicator */}
                    {asset.isVideo && (
                      <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center">
                        <span className="text-[7px] text-white font-bold">▶</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
