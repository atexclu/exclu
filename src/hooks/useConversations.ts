/**
 * useConversations
 *
 * Charge la liste des conversations d'un profil créateur avec Supabase Realtime.
 * Mise à jour automatique quand une nouvelle conversation ou un nouveau message arrive.
 *
 * Usage :
 *   const { conversations, isLoading, error } = useConversations(profileId);
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Conversation } from '@/types/chat';

interface UseConversationsOptions {
  profileId: string | null;
  statusFilter?: Conversation['status'][];
}

interface UseConversationsResult {
  conversations: Conversation[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useConversations({
  profileId,
  statusFilter = ['unclaimed', 'active'],
}: UseConversationsOptions): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!profileId) {
      setConversations([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from('conversations')
      .select('*, fan:profiles!conversations_fan_id_fkey(id, display_name, avatar_url)')
      .eq('profile_id', profileId)
      .in('status', statusFilter)
      .order('is_pinned', { ascending: false })
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200);

    if (fetchError) {
      setError(fetchError.message);
      setIsLoading(false);
      return;
    }

    setConversations((data ?? []) as Conversation[]);
    setIsLoading(false);
  }, [profileId, statusFilter.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charge les conversations au montage et quand profileId change
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime subscription sur les conversations du profil.
  // REPLICA IDENTITY FULL (migration 073) permet le filtre sur profile_id.
  useEffect(() => {
    if (!profileId) return;

    // Nettoyer l'abonnement précédent avant d'en créer un nouveau
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`conversations:${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `profile_id=eq.${profileId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Nouvelle conversation : refetch pour avoir le profil fan joint
            fetchConversations();
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Conversation;
            setConversations((prev) => {
              // Si le statut sort du filtre, retirer de la liste
              if (!statusFilter.includes(updated.status)) {
                return prev.filter((c) => c.id !== updated.id);
              }
              return prev
                .map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
                .sort((a, b) => {
                  // Pinned first, puis plus récent
                  if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
                  const ta = a.last_message_at ?? a.created_at;
                  const tb = b.last_message_at ?? b.created_at;
                  return tb > ta ? 1 : -1;
                });
            });
          } else if (payload.eventType === 'DELETE') {
            setConversations((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [profileId, fetchConversations, statusFilter.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { conversations, isLoading, error, refetch: fetchConversations };
}
