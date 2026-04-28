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
  profileIds?: string[];
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
  profileIds,
  statusFilter = ['unclaimed', 'active'],
}: UseConversationsOptions): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Determine effective IDs for multi-profile support
  const effectiveIds = profileIds && profileIds.length > 0 ? profileIds : profileId ? [profileId] : [];
  const effectiveKey = effectiveIds.sort().join(',');

  const fetchConversations = useCallback(async () => {
    if (effectiveIds.length === 0) {
      setConversations([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    let query = supabase
      .from('conversations')
      .select('*, fan:profiles!conversations_fan_id_fkey(id, display_name, avatar_url, deleted_at)')
      .in('status', statusFilter)
      .is('creator_deleted_at', null)
      .order('is_pinned', { ascending: false })
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200);

    if (effectiveIds.length === 1) {
      query = query.eq('profile_id', effectiveIds[0]);
    } else {
      query = query.in('profile_id', effectiveIds);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
      setIsLoading(false);
      return;
    }

    const convs = (data ?? []) as Conversation[];

    // Enrich guest conversations with display_name from guest_sessions
    const guestSessionIds = convs
      .filter((c) => c.guest_session_id && !c.fan_id)
      .map((c) => c.guest_session_id!);

    if (guestSessionIds.length > 0) {
      const { data: guestSessions } = await supabase
        .from('guest_sessions')
        .select('id, display_name')
        .in('id', guestSessionIds);

      if (guestSessions) {
        const guestMap = new Map(guestSessions.map((gs: any) => [gs.id, gs.display_name]));
        for (const conv of convs) {
          if (conv.guest_session_id && !conv.fan_id) {
            conv.is_guest = true;
            if (guestMap.has(conv.guest_session_id)) {
              conv.guest_display_name = guestMap.get(conv.guest_session_id) || 'Guest';
            }
          }
        }
      }
    }

    setConversations(convs);
    setIsLoading(false);
  }, [effectiveKey, statusFilter.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charge les conversations au montage et quand profileId change
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime subscription sur les conversations du profil.
  // REPLICA IDENTITY FULL (migration 073) permet le filtre sur profile_id.
  useEffect(() => {
    if (effectiveIds.length === 0) return;

    // Nettoyer l'abonnement précédent avant d'en créer un nouveau
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // For single profile, use server-side filter. For multi-profile, listen to all and filter client-side.
    const channelName = `conversations:${effectiveKey}`;
    const channel = effectiveIds.length === 1
      ? supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'conversations',
              filter: `profile_id=eq.${effectiveIds[0]}`,
            },
            handleRealtimePayload,
          )
          .subscribe()
      : supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'conversations',
            },
            (payload) => {
              const row = (payload.new ?? payload.old) as any;
              if (row?.profile_id && effectiveIds.includes(row.profile_id)) {
                handleRealtimePayload(payload);
              }
            },
          )
          .subscribe();

    function handleRealtimePayload(payload: any) {
      if (payload.eventType === 'INSERT') {
        fetchConversations();
      } else if (payload.eventType === 'UPDATE') {
        const updated = payload.new as Conversation;
        setConversations((prev) => {
          if (!statusFilter.includes(updated.status)) {
            return prev.filter((c) => c.id !== updated.id);
          }
          return prev
            .map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
            .sort((a, b) => {
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

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [effectiveKey, fetchConversations, statusFilter.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return { conversations, isLoading, error, refetch: fetchConversations };
}
