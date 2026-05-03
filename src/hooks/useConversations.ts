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

    // Single round-trip: join fan profile + guest session in one PostgREST query.
    let query = supabase
      .from('conversations')
      .select(`
        id, fan_id, profile_id, assigned_chatter_id, guest_session_id, status,
        is_pinned, is_read, last_message_at, last_message_preview,
        total_revenue_cents, created_at, archived_at,
        fan:profiles!conversations_fan_id_fkey(id, display_name, avatar_url, handle, deleted_at),
        guest_session:guest_sessions(id, display_name)
      `)
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

    const convs = ((data ?? []) as any[]).map((c) => {
      const isGuest = !c.fan_id && !!c.guest_session_id;
      return {
        ...c,
        is_guest: isGuest || undefined,
        guest_display_name: isGuest ? (c.guest_session?.display_name || 'Guest') : undefined,
      } as Conversation;
    });

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
        const updated = payload.new as Conversation & { creator_deleted_at?: string | null };
        setConversations((prev) => {
          // If the creator-side soft-deleted this conv, drop it locally so it
          // disappears from the list without waiting for a refetch.
          if (updated.creator_deleted_at) {
            return prev.filter((c) => c.id !== updated.id);
          }
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
