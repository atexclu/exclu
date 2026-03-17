/**
 * useMessages
 *
 * Charge les messages d'une conversation avec Supabase Realtime.
 * Marque automatiquement les messages non lus comme lus quand la conversation est ouverte.
 *
 * Usage :
 *   const { messages, isLoading, sendMessage } = useMessages(conversationId);
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Message, SenderType } from '@/types/chat';

interface SendMessageParams {
  content: string;
  senderType: SenderType;
  contentType?: Message['content_type'];
  paidContentId?: string | null;
  paidAmountCents?: number | null;
  tipLinkId?: string | null;
}

interface UseMessagesResult {
  messages: Message[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  sendMessage: (params: SendMessageParams) => Promise<boolean>;
}

export function useMessages(conversationId: string | null, viewerRole: 'fan' | 'creator' | 'chatter' = 'creator'): UseMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Charge les 100 derniers messages avec les liens optionnels joints
    const { data, error: fetchError } = await supabase
      .from('messages')
      .select(
        '*, link:links!messages_paid_content_id_fkey(id, title, slug, price_cents)'
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      setError(fetchError.message);
      setIsLoading(false);
      return;
    }

    setMessages((data ?? []) as Message[]);
    setIsLoading(false);

    // Marquer les messages de l'autre partie comme lus
    const typesToMarkRead = viewerRole === 'fan' ? ['creator', 'chatter'] : ['fan'];
    await supabase
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .in('sender_type', typesToMarkRead)
      .eq('is_read', false);

    // Marquer la conversation elle-même comme lue
    await supabase
      .from('conversations')
      .update({ is_read: true })
      .eq('id', conversationId);
  }, [conversationId, viewerRole]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime : écoute les nouveaux messages dans la conversation ouverte
  useEffect(() => {
    if (!conversationId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;

          // Charger le lien si le message contient du contenu payant
          if (newMsg.paid_content_id) {
            const { data: linkData } = await supabase
              .from('links')
              .select('id, title, slug, price_cents')
              .eq('id', newMsg.paid_content_id)
              .maybeSingle();
            setMessages((prev) => [...prev, { ...newMsg, link: linkData ?? null }]);
          } else {
            setMessages((prev) => [...prev, newMsg]);
          }

          // Marquer immédiatement comme lu si c'est un message de l'autre partie
          const isFromOtherSide = viewerRole === 'fan'
            ? ['creator', 'chatter'].includes(newMsg.sender_type)
            : newMsg.sender_type === 'fan';
          if (isFromOtherSide) {
            await supabase
              .from('messages')
              .update({ is_read: true, read_at: new Date().toISOString() })
              .eq('id', newMsg.id);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId]);

  /**
   * Envoie un message dans la conversation.
   * Retourne true si succès, false si erreur.
   */
  const sendMessage = useCallback(
    async ({
      content,
      senderType,
      contentType = 'text',
      paidContentId = null,
      paidAmountCents = null,
      tipLinkId = null,
    }: SendMessageParams): Promise<boolean> => {
      if (!conversationId) return false;

      const trimmed = content.trim();
      if (!trimmed && contentType === 'text') return false;

      setIsSending(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error: insertError } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_type: senderType,
          sender_id: user.id,
          content: trimmed || null,
          content_type: contentType,
          paid_content_id: paidContentId,
          paid_amount_cents: paidAmountCents,
          tip_link_id: tipLinkId,
        });

        if (insertError) throw insertError;

        // Mettre à jour le preview de la conversation (last_message_preview)
        await supabase.from('conversations').update({
          last_message_at: new Date().toISOString(),
          last_message_preview: trimmed ? trimmed.slice(0, 120) : '📎 Contenu',
          is_read: true,
        }).eq('id', conversationId);

        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        setError(msg);
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [conversationId]
  );

  return { messages, isLoading, isSending, error, sendMessage };
}
