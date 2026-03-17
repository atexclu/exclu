/**
 * ChatWindow
 *
 * Panneau droit du chat : liste des messages + compositeur.
 * Gère le scroll automatique vers le bas à chaque nouveau message.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, User } from 'lucide-react';
import { useMessages } from '@/hooks/useMessages';
import { MessageBubble } from './MessageBubble';
import { RichMessageComposer } from './RichMessageComposer';
import { FanTagsRow } from './FanTagsRow';
import type { Conversation } from '@/types/chat';

interface ChatWindowProps {
  conversation: Conversation;
  currentUserId: string;
  senderType: 'creator' | 'chatter' | 'fan';
}

export function ChatWindow({ conversation, currentUserId, senderType }: ChatWindowProps) {
  const { messages, isLoading, isSending, sendMessage } = useMessages(conversation.id, senderType);
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fan = conversation.fan;
  const fanName = fan?.display_name || 'Fan';

  // Scroll automatique vers le bas à chaque nouveau message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    await sendMessage({ content: trimmed, senderType });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header de la conversation */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
        <div className="w-9 h-9 rounded-full overflow-hidden bg-muted border border-border flex-shrink-0">
          {fan?.avatar_url ? (
            <img src={fan.avatar_url} alt={fanName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{fanName}</p>
          <p className="text-[11px] text-muted-foreground/60">
            {conversation.status === 'unclaimed' ? '⏳ Non prise en charge' : '● Actif'}
            {conversation.total_revenue_cents > 0 && (
              <span className="ml-2 text-green-400/70">
                ${(conversation.total_revenue_cents / 100).toFixed(2)} générés
              </span>
            )}
          </p>
          {senderType !== 'fan' && (
            <div className="mt-1">
              <FanTagsRow
                fanId={conversation.fan_id}
                profileId={conversation.profile_id}
                readOnly={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* Zone des messages — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <User className="w-5 h-5 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground/60">Début de la conversation</p>
          </div>
        )}

        {!isLoading && messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.sender_id === currentUserId}
            conversationId={senderType === 'fan' ? conversation.id : undefined}
          />
        ))}

        {/* Ancre de scroll */}
        <div ref={bottomRef} />
      </div>

      {/* Compositeur */}
      <RichMessageComposer
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        isSending={isSending}
        placeholder={`Répondre à ${fanName}…`}
      />
    </div>
  );
}
