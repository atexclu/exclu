/**
 * useFanUnread
 *
 * Counts conversations with unread messages for a fan.
 * A fan has "unread" if the latest message in a conversation was NOT sent by them.
 * Uses Realtime to stay up-to-date.
 */

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useFanUnread(fanId: string | null): number {
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!fanId) {
      setUnreadCount(0);
      return;
    }

    const fetchUnread = async () => {
      // Get conversations for this fan that have messages
      const { data: convos } = await supabase
        .from('conversations')
        .select('id, last_message_at')
        .eq('fan_id', fanId)
        .is('fan_deleted_at', null)
        .not('last_message_at', 'is', null);

      if (!convos || convos.length === 0) {
        setUnreadCount(0);
        return;
      }

      // For each conversation, check if the last message was NOT from the fan
      let unread = 0;
      for (const conv of convos) {
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('sender_type')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastMsg && lastMsg.sender_type !== 'fan') {
          // Check if fan has any unread messages in this conv
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('is_read', false)
            .neq('sender_type', 'fan');

          if (count && count > 0) unread++;
        }
      }

      setUnreadCount(unread);
    };

    fetchUnread();

    // Listen for new messages
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`fan-unread:${fanId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          // Re-fetch on new messages (not from fan)
          if ((payload.new as any)?.sender_type !== 'fan') {
            fetchUnread();
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [fanId]);

  return unreadCount;
}
