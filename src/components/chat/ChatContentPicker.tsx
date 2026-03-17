/**
 * ChatContentPicker
 *
 * Modal that displays the creator's published links so a creator or chatter
 * can attach paid content to a chat message.
 */

import { useState, useEffect } from 'react';
import { X, Search, Loader2, ExternalLink, Package, Image, Video, FileText, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';

interface LinkItem {
  id: string;
  title: string | null;
  slug: string;
  price_cents: number;
  storage_path: string | null;
  mime_type: string | null;
}

interface ChatContentPickerProps {
  profileId: string;
  onSelect: (link: LinkItem) => void;
  onClose: () => void;
}

export function ChatContentPicker({ profileId, onSelect, onClose }: ChatContentPickerProps) {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchLinks = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('links')
        .select('id, title, slug, price_cents, storage_path, mime_type')
        .eq('profile_id', profileId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(100);

      setLinks((data ?? []) as LinkItem[]);
      setIsLoading(false);
    };

    fetchLinks();
  }, [profileId]);

  const filtered = search.trim()
    ? links.filter((l) => (l.title ?? '').toLowerCase().includes(search.toLowerCase()))
    : links;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md max-h-[70vh] bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Attach content</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search links…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 border-0 rounded-lg outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Links list */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <Package className="w-6 h-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/60">
                {search ? 'No matching links' : 'No published links yet'}
              </p>
            </div>
          )}

          {!isLoading && filtered.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => onSelect(link)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/60 transition-colors text-left group"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-lg bg-muted border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                {link.mime_type?.startsWith('image/') ? (
                  <Image className="w-4 h-4 text-muted-foreground/60" />
                ) : link.mime_type?.startsWith('video/') ? (
                  <Video className="w-4 h-4 text-muted-foreground/60" />
                ) : (
                  <FileText className="w-4 h-4 text-muted-foreground/40" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {link.title || 'Untitled'}
                </p>
                <p className="text-[11px] text-muted-foreground/60">
                  {link.price_cents > 0
                    ? `$${(link.price_cents / 100).toFixed(2)}`
                    : 'Free'}
                </p>
              </div>

              {/* Select indicator */}
              <span className="text-[10px] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                Send
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
