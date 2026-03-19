/**
 * ChatterContracts — /app/chatter/contracts
 *
 * Marketplace where chatters can discover creators seeking conversation managers.
 * Shows creator cards, detail view, and request-to-manage flow.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, MapPin, Send, Check, MessageSquare,
  Search, ExternalLink, User, ChevronLeft,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { getAuroraGradient } from '@/lib/auroraGradients';

interface CreatorContract {
  creator_id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  aurora_gradient: string | null;
  description: string | null;
  has_pending: boolean;
  is_managing: boolean;
}

const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export default function ChatterContracts() {
  const [isLoading, setIsLoading] = useState(true);
  const [creators, setCreators] = useState<CreatorContract[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCreator, setSelectedCreator] = useState<CreatorContract | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const loadCreators = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.rpc('get_creators_seeking_chatters');
    if (error) {
      console.error('Error loading contracts:', error);
      toast.error('Failed to load contracts');
    } else {
      setCreators((data ?? []) as CreatorContract[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadCreators();
  }, [loadCreators]);

  const filtered = creators.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.display_name || '').toLowerCase().includes(q) ||
      (c.handle || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    );
  });

  const handleSendRequest = async () => {
    if (!selectedCreator || isSending) return;
    setIsSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      console.log('[ChatterContracts] Sending request for creator:', {
        creator_id: selectedCreator.creator_id,
        display_name: selectedCreator.display_name,
        handle: selectedCreator.handle,
      });

      const resp = await fetch(`${SUPABASE_FUNCTIONS_URL}/handle-chatter-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'send',
          creator_id: selectedCreator.creator_id,
          message: requestMessage.trim() || null,
        }),
      });

      const result = await resp.json();
      if (!resp.ok) {
        throw new Error(result.message || result.error || 'Failed to send request');
      }

      toast.success('Request sent! The creator will be notified by email.');
      setCreators((prev) =>
        prev.map((c) =>
          c.creator_id === selectedCreator.creator_id ? { ...c, has_pending: true } : c
        )
      );
      setSelectedCreator((prev) => prev ? { ...prev, has_pending: true } : null);
      setRequestMessage('');
    } catch (err: any) {
      console.error('Error sending request:', err);
      toast.error(err?.message || 'Failed to send request');
    } finally {
      setIsSending(false);
    }
  };

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selectedCreator) {
    const aurora = getAuroraGradient(selectedCreator.aurora_gradient || 'purple_dream');
    const gradientStops: [string, string] = [aurora.colors[0], aurora.colors[2]];

    return (
      <div className="text-foreground">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {/* Back */}
          <button
            onClick={() => setSelectedCreator(null)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to contracts
          </button>

          {/* Profile card */}
          <div className="rounded-3xl border border-white/15 bg-black/60 backdrop-blur-xl overflow-hidden shadow-2xl">
            {/* Avatar */}
            <div className="relative h-64 overflow-hidden">
              {selectedCreator.avatar_url ? (
                <img
                  src={selectedCreator.avatar_url}
                  alt={selectedCreator.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${gradientStops[0]}40, ${gradientStops[1]}40)` }}
                >
                  <span className="text-6xl font-extrabold text-white/20">
                    {(selectedCreator.display_name || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

              <div className="absolute bottom-4 left-6 right-6">
                <h1 className="text-2xl font-extrabold text-white drop-shadow-lg">
                  {selectedCreator.display_name}
                </h1>
                {selectedCreator.handle && (
                  <p className="text-sm text-white/50 font-medium">@{selectedCreator.handle}</p>
                )}
                {selectedCreator.location && (
                  <p className="text-xs text-white/60 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {selectedCreator.location}
                  </p>
                )}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {selectedCreator.bio && (
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedCreator.bio}</p>
              )}

              {selectedCreator.description && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                    What they're looking for
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {selectedCreator.description}
                  </p>
                </div>
              )}

              {/* Request form */}
              {selectedCreator.is_managing ? (
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 flex items-center gap-3">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <p className="text-sm text-foreground">
                    You're already managing this creator's conversations.
                  </p>
                </div>
              ) : selectedCreator.has_pending ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
                  <Check className="w-5 h-5 text-primary flex-shrink-0" />
                  <p className="text-sm text-foreground">
                    Your request has been sent. The creator will review it and get back to you.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-xs font-medium text-muted-foreground">
                    Introduce yourself <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <textarea
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    placeholder="Tell the creator about your experience, availability, and why you'd be a great fit..."
                    rows={4}
                    maxLength={1000}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/60 resize-none"
                  />
                  <Button
                    variant="hero"
                    size="lg"
                    className="w-full rounded-xl"
                    onClick={handleSendRequest}
                    disabled={isSending}
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Request to manage conversations
                  </Button>
                </div>
              )}

              <a
                href={`/${selectedCreator.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View public profile
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Contracts</h1>
          <p className="text-xs text-muted-foreground">Creators looking for chatters to manage their conversations</p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search creators..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {search ? 'No creators match your search' : 'No creators are currently looking for chatters'}
            </p>
          </div>
        )}

        {/* Creator grid */}
        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((creator) => {
              const aurora = getAuroraGradient(creator.aurora_gradient || 'purple_dream');
              const gradientStops: [string, string] = [aurora.colors[0], aurora.colors[2]];

              return (
                <motion.button
                  key={creator.creator_id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedCreator(creator)}
                  className="relative group rounded-2xl border border-border/60 bg-card overflow-hidden hover:border-primary/30 transition-all text-left"
                >
                  {/* Avatar */}
                  <div className="relative aspect-[3/4] overflow-hidden">
                    {creator.avatar_url ? (
                      <img
                        src={creator.avatar_url}
                        alt={creator.display_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${gradientStops[0]}30, ${gradientStops[1]}30)` }}
                      >
                        <User className="w-10 h-10 text-muted-foreground/30" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                    {/* Status badge */}
                    {creator.has_pending && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-primary/90 text-[9px] font-bold text-primary-foreground">
                        Pending
                      </div>
                    )}

                    <div className="absolute bottom-3 left-3 right-3">
                      <p className="text-sm font-bold text-white truncate drop-shadow-lg">
                        {creator.display_name}
                      </p>
                      {creator.handle && (
                        <p className="text-[10px] text-white/50 truncate">@{creator.handle}</p>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
