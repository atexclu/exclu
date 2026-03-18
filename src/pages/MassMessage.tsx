/**
 * MassMessage / BroadcastPanel
 *
 * Composant permettant au créateur d'envoyer un message en masse à ses fans.
 * Filtre par tags, statut de conversation, et génère un message individuel
 * pour chaque fan concerné (via la table mass_messages + messages).
 *
 * Exporté en tant que :
 *  - BroadcastPanel : composant autonome (pas d'AppShell)
 *  - default : wrapper page avec AppShell (legacy)
 */

import { useEffect, useState, useCallback } from 'react';
import { Send, Users, Tag, Filter, Loader2, CheckCircle2, History, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useProfiles } from '@/contexts/ProfileContext';
import AppShell from '@/components/AppShell';
import { motion, AnimatePresence } from 'framer-motion';

const TAG_COLORS: Record<string, string> = {
  gray:   'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
  blue:   'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
  green:  'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30',
  orange: 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
  red:    'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30',
  purple: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
  pink:   'bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30',
};

type AudienceFilter = 'all' | 'active' | 'unclaimed' | 'tagged';

interface TagOption {
  tag: string;
  color: string;
  count: number;
}

interface MassMessageRecord {
  id: string;
  content: string;
  target_filter: { audience?: string; tag?: string | null };
  recipient_count: number;
  created_at: string;
  status: string;
}

interface BroadcastPanelProps {
  profileId?: string;
  senderType?: 'creator' | 'chatter';
}

export function BroadcastPanel({ profileId: propProfileId, senderType = 'creator' }: BroadcastPanelProps) {
  const { activeProfile } = useProfiles();
  const resolvedProfileId = propProfileId ?? activeProfile?.id ?? null;

  const [content, setContent] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<TagOption[]>([]);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState<MassMessageRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // ── Chargement des tags disponibles ─────────────────────────────────────
  useEffect(() => {
    if (!resolvedProfileId) return;
    const loadTags = async () => {
      const { data } = await supabase
        .from('fan_tags')
        .select('tag, color')
        .eq('profile_id', resolvedProfileId);

      if (!data) return;
      const tagMap = new Map<string, { color: string; count: number }>();
      for (const row of data) {
        const existing = tagMap.get(row.tag);
        tagMap.set(row.tag, {
          color: row.color,
          count: (existing?.count ?? 0) + 1,
        });
      }
      setAvailableTags(
        Array.from(tagMap.entries()).map(([tag, { color, count }]) => ({ tag, color, count }))
      );
    };
    loadTags();
  }, [resolvedProfileId]);

  // ── Calcul du nombre de destinataires ───────────────────────────────────
  const computeRecipientCount = useCallback(async () => {
    if (!resolvedProfileId) return;
    setIsLoadingCount(true);
    try {
      let query = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', resolvedProfileId);

      if (audienceFilter === 'active') {
        query = query.eq('status', 'active');
      } else if (audienceFilter === 'unclaimed') {
        query = query.eq('status', 'unclaimed');
      } else if (audienceFilter === 'tagged' && selectedTag) {
        const { data: taggedFans } = await supabase
          .from('fan_tags')
          .select('fan_id')
          .eq('profile_id', resolvedProfileId)
          .eq('tag', selectedTag);
        const fanIds = (taggedFans ?? []).map((f: any) => f.fan_id);
        if (fanIds.length === 0) {
          setRecipientCount(0);
          setIsLoadingCount(false);
          return;
        }
        query = query.in('fan_id', fanIds).neq('status', 'archived');
      } else if (audienceFilter === 'all') {
        query = query.neq('status', 'archived');
      }

      const { count } = await query;
      setRecipientCount(count ?? 0);
    } finally {
      setIsLoadingCount(false);
    }
  }, [resolvedProfileId, audienceFilter, selectedTag]);

  useEffect(() => {
    computeRecipientCount();
  }, [computeRecipientCount]);

  // ── Envoi du mass message ────────────────────────────────────────────────
  const handleSend = async () => {
    if (!resolvedProfileId || !content.trim()) return;
    if (!recipientCount || recipientCount === 0) {
      toast.error('Aucun destinataire correspondant');
      return;
    }

    setIsSending(true);
    try {
      const currentUser = await supabase.auth.getUser();
      if (!currentUser.data.user) throw new Error('Not authenticated');

      // Insérer l'entrée mass_messages
      const { data: massMsg, error: mmError } = await supabase
        .from('mass_messages')
        .insert({
          profile_id: resolvedProfileId,
          sent_by: currentUser.data.user.id,
          content: content.trim(),
          target_filter: {
            audience: audienceFilter,
            ...(audienceFilter === 'tagged' && selectedTag ? { tag: selectedTag } : {}),
          },
          recipient_count: recipientCount,
        })
        .select('id')
        .single();

      if (mmError || !massMsg) throw mmError ?? new Error('Failed to create mass message');

      // Récupérer les conversation_ids ciblées
      let convQuery = supabase
        .from('conversations')
        .select('id, fan_id')
        .eq('profile_id', resolvedProfileId);

      if (audienceFilter === 'active') {
        convQuery = convQuery.eq('status', 'active');
      } else if (audienceFilter === 'unclaimed') {
        convQuery = convQuery.eq('status', 'unclaimed');
      } else if (audienceFilter === 'tagged' && selectedTag) {
        const { data: taggedFans } = await supabase
          .from('fan_tags')
          .select('fan_id')
          .eq('profile_id', resolvedProfileId)
          .eq('tag', selectedTag);
        const fanIds = (taggedFans ?? []).map((f: any) => f.fan_id);
        convQuery = convQuery.in('fan_id', fanIds).neq('status', 'archived');
      } else {
        convQuery = convQuery.neq('status', 'archived');
      }

      const { data: conversations } = await convQuery;

      if (conversations && conversations.length > 0) {
        // Insérer un message dans chaque conversation (par batch de 100)
        const batchSize = 100;
        for (let i = 0; i < conversations.length; i += batchSize) {
          const batch = conversations.slice(i, i + batchSize);
          const messages = batch.map((conv: any) => ({
            conversation_id: conv.id,
            sender_type: senderType,
            sender_id: currentUser.data.user!.id,
            content: content.trim(),
            content_type: 'text',
          }));
          await supabase.from('messages').insert(messages);
        }

        // Mettre à jour sent_count
        await supabase
          .from('mass_messages')
          .update({ recipient_count: conversations.length, status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', massMsg.id);
      }

      toast.success(`Message envoyé à ${conversations?.length ?? 0} fans`);
      setContent('');
      await loadHistory();
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de l\'envoi');
    } finally {
      setIsSending(false);
    }
  };

  // ── Historique ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!resolvedProfileId) return;
    setIsLoadingHistory(true);
    const { data } = await supabase
      .from('mass_messages')
      .select('id, content, target_filter, recipient_count, created_at, status')
      .eq('profile_id', resolvedProfileId)
      .order('created_at', { ascending: false })
      .limit(20);
    setHistory((data as MassMessageRecord[]) ?? []);
    setIsLoadingHistory(false);
  }, [resolvedProfileId]);

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory, loadHistory]);

  const canSend = content.trim().length > 0 && (audienceFilter !== 'tagged' || selectedTag) && !isSending;

  return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground">Message en masse</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Envoie un message à un groupe de fans en une seule action
          </p>
        </div>

        {/* Composer card */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-5">

          {/* Audience filter */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              Audience
            </label>
            <div className="flex flex-wrap gap-2">
              {([
                { key: 'all',      label: 'Tous les fans' },
                { key: 'active',   label: 'Conversations actives' },
                { key: 'unclaimed', label: 'En attente' },
                { key: 'tagged',   label: 'Par tag' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setAudienceFilter(key); if (key !== 'tagged') setSelectedTag(null); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                    audienceFilter === key
                      ? 'bg-primary text-primary-foreground border-transparent'
                      : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tag picker */}
            {audienceFilter === 'tagged' && (
              <div className="mt-2">
                {availableTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 italic">Aucun tag créé</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map((t) => (
                      <button
                        key={t.tag}
                        type="button"
                        onClick={() => setSelectedTag(t.tag === selectedTag ? null : t.tag)}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                          selectedTag === t.tag
                            ? 'ring-2 ring-primary ring-offset-1 ring-offset-card'
                            : 'opacity-70 hover:opacity-100'
                        } ${TAG_COLORS[t.color] ?? TAG_COLORS.gray}`}
                      >
                        <Tag className="w-2.5 h-2.5 inline mr-1" />
                        {t.tag} ({t.count})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recipient count */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/30 border border-border">
            <Users className="w-4 h-4 text-muted-foreground" />
            {isLoadingCount ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-sm text-foreground font-medium">
                {recipientCount ?? 0} destinataire{(recipientCount ?? 0) !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Message composer */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-muted-foreground" />
              Message
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tape ton message ici…"
              rows={4}
              maxLength={2000}
              className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
            />
            <div className="flex justify-between items-center">
              <p className="text-[10px] text-muted-foreground/40">{content.length}/2000</p>
              <Button
                onClick={handleSend}
                disabled={!canSend}
                className="gap-2 h-9 px-5"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Envoyer
              </Button>
            </div>
          </div>
        </div>

        {/* Historique */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="w-4 h-4 text-muted-foreground" />
              Historique
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="border-t border-border px-5 py-3 space-y-2">
                  {isLoadingHistory && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!isLoadingHistory && history.length === 0 && (
                    <p className="text-xs text-muted-foreground/50 text-center py-4">
                      Aucun message envoyé
                    </p>
                  )}
                  {!isLoadingHistory && history.map((msg) => (
                    <div
                      key={msg.id}
                      className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-400/60 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground truncate">{msg.content}</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                          {msg.recipient_count} envoyé{msg.recipient_count !== 1 ? 's' : ''} ·{' '}
                          {msg.target_filter?.audience === 'tagged' && msg.target_filter?.tag ? `tag: ${msg.target_filter.tag}` : (msg.target_filter?.audience ?? 'all')} ·{' '}
                          {new Date(msg.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
  );
}

export default function MassMessage() {
  return (
    <AppShell>
      <BroadcastPanel />
    </AppShell>
  );
}
