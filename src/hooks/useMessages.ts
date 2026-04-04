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
import { supabase, supabaseAnon } from '@/lib/supabaseClient';
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
  const appendMessageIfMissing = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Charge les 100 derniers messages
    const { data, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      setError(fetchError.message);
      setIsLoading(false);
      return;
    }

    // Load link data separately via anon client (bypasses RLS on links for fans)
    const msgs = (data ?? []) as Message[];
    const paidContentIds = [...new Set(msgs.filter(m => m.paid_content_id).map(m => m.paid_content_id!))];
    if (paidContentIds.length > 0) {
      const { data: links } = await supabaseAnon
        .from('links')
        .select('id, title, slug, price_cents')
        .in('id', paidContentIds);
      const linkMap = new Map((links ?? []).map(l => [l.id, l]));
      for (const msg of msgs) {
        if (msg.paid_content_id && linkMap.has(msg.paid_content_id)) {
          (msg as any).link = linkMap.get(msg.paid_content_id);
        }
      }
    }

    setMessages(msgs);
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

          // Charger le lien si le message contient du contenu payant (via anon client for RLS bypass)
          if (newMsg.paid_content_id) {
            const { data: linkData } = await supabaseAnon
              .from('links')
              .select('id, title, slug, price_cents')
              .eq('id', newMsg.paid_content_id)
              .maybeSingle();
            appendMessageIfMissing({ ...newMsg, link: linkData ?? null });
          } else {
            appendMessageIfMissing(newMsg);
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
  }, [conversationId, viewerRole, appendMessageIfMissing]);

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

        // Generate a unique chatter_ref when a chatter sends paid content
        // This code is embedded in the link URL for revenue attribution tracking
        const chatterRef =
          senderType === 'chatter' && contentType === 'paid_content' && paidContentId
            ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')
            : null;

        const { data: insertedMessage, error: insertError } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_type: senderType,
          sender_id: user.id,
          content: trimmed || null,
          content_type: contentType,
          paid_content_id: paidContentId,
          paid_amount_cents: paidAmountCents,
          tip_link_id: tipLinkId,
          ...(chatterRef ? { chatter_ref: chatterRef } : {}),
        }).select('*').single();

        if (insertError) throw insertError;

        if (insertedMessage) {
          let msgWithLink = insertedMessage as Message;
          if (insertedMessage.paid_content_id) {
            const { data: linkData } = await supabase
              .from('links')
              .select('id, title, slug, price_cents')
              .eq('id', insertedMessage.paid_content_id)
              .maybeSingle();
            msgWithLink = { ...(insertedMessage as Message), link: linkData ?? null };
          }
          appendMessageIfMissing(msgWithLink);
        }

        // Mettre à jour le preview de la conversation (last_message_preview)
        const conversationUpdate: Record<string, unknown> = {
          last_message_at: new Date().toISOString(),
          last_message_preview: trimmed ? trimmed.slice(0, 120) : '📎 Content',
          is_read: true,
        };
        if (senderType === 'creator' || senderType === 'chatter') {
          conversationUpdate.status = 'active';
        }

        await supabase.from('conversations').update(conversationUpdate).eq('id', conversationId);

        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Send failed';
        setError(msg);
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, appendMessageIfMissing]
  );

  return { messages, isLoading, isSending, error, sendMessage };
}
