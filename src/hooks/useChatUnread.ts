/**
 * useChatUnread
 *
 * Compte le nombre de conversations non lues pour le badge dans AppShell.
 * Écoute les changements Realtime pour maintenir le badge à jour.
 *
 * Usage :
 *   const unreadCount = useChatUnread(profileId);
 */

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useChatUnread(profileId: string | null): number {
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!profileId) {
      setUnreadCount(0);
      return;
    }

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('is_read', false)
        .is('creator_deleted_at', null)
        .in('status', ['unclaimed', 'active']);

      setUnreadCount(count ?? 0);
    };

    fetchUnread();

    // Écouter les changements sur les conversations pour mettre à jour le badge
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`chat-unread:${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `profile_id=eq.${profileId}`,
        },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [profileId]);

  return unreadCount;
}
