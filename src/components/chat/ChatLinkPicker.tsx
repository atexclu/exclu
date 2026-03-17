/**
 * ChatLinkPicker
 *
 * Inline panel that slides up above the message composer, showing
 * the creator's published links as modern WhatsApp-style preview cards.
 * Creator/chatter can select a link to send it in the conversation.
 */

import { useState, useEffect } from 'react';
import { X, Search, Loader2, Link2, ExternalLink, Image, Video, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';

interface LinkItem {
  id: string;
  title: string | null;
  slug: string;
  price_cents: number;
  previewUrl: string | null;
  isVideo: boolean;
}

interface CreatorInfo {
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
}

interface ChatLinkPickerProps {
  profileId: string;
  onSelect: (link: LinkItem) => void;
  onClose: () => void;
}

export function ChatLinkPicker({ profileId, onSelect, onClose }: ChatLinkPickerProps) {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      // Fetch creator profile info for the avatar on cards
      const { data: profileData } = await supabase
        .from('creator_profiles')
        .select('display_name, avatar_url, username')
        .eq('id', profileId)
        .single();

      if (profileData) {
        setCreator(profileData as CreatorInfo);
      }

      // Fetch published links for this profile
      const { data: linksData } = await supabase
        .from('links')
        .select('id, title, slug, price_cents, storage_path')
        .eq('profile_id', profileId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50);

      const rawLinks = (linksData ?? []) as any[];

      // Generate signed preview URLs
      const withPreviews = await Promise.all(
        rawLinks.map(async (link) => {
          if (link.storage_path) {
            const { data: signed } = await supabase.storage
              .from('content')
              .createSignedUrl(link.storage_path, 300);
            if (signed?.signedUrl) {
              const ext = link.storage_path.split('.').pop()?.toLowerCase() ?? '';
              const isVideo = ['mp4', 'mov', 'webm', 'mkv'].includes(ext);
              return { id: link.id, title: link.title, slug: link.slug, price_cents: link.price_cents, previewUrl: signed.signedUrl, isVideo };
            }
          }

          // Try link_media for first asset
          const { data: linkMedia } = await supabase
            .from('link_media')
            .select('assets(storage_path, mime_type)')
            .eq('link_id', link.id)
            .order('position', { ascending: true })
            .limit(1);

          if (linkMedia?.[0]) {
            const asset = (linkMedia[0] as any).assets;
            if (asset?.storage_path) {
              const { data: signed } = await supabase.storage
                .from('content')
                .createSignedUrl(asset.storage_path, 300);
              if (signed?.signedUrl) {
                const isVideo = asset.mime_type?.startsWith('video/') || false;
                return { id: link.id, title: link.title, slug: link.slug, price_cents: link.price_cents, previewUrl: signed.signedUrl, isVideo };
              }
            }
          }

          return { id: link.id, title: link.title, slug: link.slug, price_cents: link.price_cents, previewUrl: null, isVideo: false };
        })
      );

      setLinks(withPreviews);
      setIsLoading(false);
    };

    fetchData();
  }, [profileId]);

  const filtered = search.trim()
    ? links.filter((l) => (l.title ?? '').toLowerCase().includes(search.toLowerCase()))
    : links;

  const creatorName = creator?.display_name || creator?.username || 'Creator';

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
      className="border-t border-border bg-card overflow-hidden"
    >
      <div className="max-h-[320px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">Add link</span>
            <span className="text-[10px] text-muted-foreground">({links.length})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search */}
        {links.length > 5 && (
          <div className="px-3 py-2 border-b border-border/50 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search links…"
                className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-muted/50 border-0 rounded-lg outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        )}

        {/* Links grid */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <Link2 className="w-5 h-5 text-muted-foreground/30" />
              <p className="text-[11px] text-muted-foreground/60">
                {search ? 'No matching links' : 'No published links yet'}
              </p>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="space-y-1.5">
              {filtered.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => onSelect(link)}
                  className="w-full rounded-xl border border-border/60 bg-background hover:bg-muted/40 hover:border-primary/30 transition-all group overflow-hidden"
                >
                  {/* WhatsApp-style link card */}
                  <div className="flex gap-3 p-2.5">
                    {/* Thumbnail */}
                    <div className="relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-muted border border-border/40">
                      {link.previewUrl ? (
                        link.isVideo ? (
                          <video
                            src={link.previewUrl}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={link.previewUrl}
                            className="w-full h-full object-cover"
                            alt={link.title ?? ''}
                            loading="lazy"
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileText className="w-5 h-5 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {link.title || 'Untitled link'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {/* Creator avatar */}
                        <div className="w-4 h-4 rounded-full overflow-hidden bg-muted border border-border/40 flex-shrink-0">
                          {creator?.avatar_url ? (
                            <img src={creator.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[7px] font-bold text-muted-foreground">
                              {creatorName.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate">{creatorName}</span>
                      </div>
                    </div>

                    {/* Price + send indicator */}
                    <div className="flex flex-col items-end justify-center gap-1 flex-shrink-0">
                      <span className="text-[11px] font-bold text-[#CFFF16]">
                        {link.price_cents > 0 ? `$${(link.price_cents / 100).toFixed(2)}` : 'Free'}
                      </span>
                      <span className="text-[9px] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Send →
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
