/**
 * ChatWindow
 *
 * Panneau droit du chat : liste des messages + compositeur.
 * Gère le scroll automatique vers le bas à chaque nouveau message.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { Loader2, User, Paperclip } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useMessages } from '@/hooks/useMessages';
import { MessageBubble } from './MessageBubble';
import { RichMessageComposer } from './RichMessageComposer';
import { ChatContentPicker } from './ChatContentPicker';
import { FanTagsRow } from './FanTagsRow';
import type { Conversation } from '@/types/chat';

interface SenderProfile {
  display_name: string | null;
  avatar_url: string | null;
}

interface ChatWindowProps {
  conversation: Conversation;
  currentUserId: string;
  senderType: 'creator' | 'chatter' | 'fan';
}

export function ChatWindow({ conversation, currentUserId, senderType }: ChatWindowProps) {
  const { messages, isLoading, isSending, sendMessage } = useMessages(conversation.id, senderType);
  const [draft, setDraft] = useState('');
  const [showContentPicker, setShowContentPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [senderProfiles, setSenderProfiles] = useState<Map<string, SenderProfile>>(new Map());
  const fan = conversation.fan;
  const fanName = fan?.display_name || 'Fan';

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Fetch profiles for team members (creator/chatter) other than current user
  const otherTeamSenderIds = useMemo(() => {
    const ids = messages
      .filter(m => ['creator', 'chatter'].includes(m.sender_type) && m.sender_id !== currentUserId)
      .map(m => m.sender_id);
    return [...new Set(ids)];
  }, [messages, currentUserId]);

  useEffect(() => {
    if (otherTeamSenderIds.length === 0) return;
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', otherTeamSenderIds)
      .then(({ data }) => {
        const map = new Map<string, SenderProfile>();
        (data ?? []).forEach((p: any) => map.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url }));
        setSenderProfiles(map);
      });
  }, [otherTeamSenderIds.join(',')]);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft('');
    await sendMessage({ content: trimmed, senderType });
  };

  const handleAttachContent = async (link: { id: string; title: string | null; price_cents: number }) => {
    setShowContentPicker(false);
    await sendMessage({
      content: link.title || 'Exclusive content',
      senderType,
      contentType: 'paid_content',
      paidContentId: link.id,
      paidAmountCents: link.price_cents,
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Conversation header */}
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
          {senderType !== 'chatter' && (
            <p className="text-[11px] text-muted-foreground/60">
              {conversation.status === 'unclaimed' ? '⏳ Pending' : '● Active'}
              {conversation.total_revenue_cents > 0 && (
                <span className="ml-2 text-green-400/70">
                  ${(conversation.total_revenue_cents / 100).toFixed(2)} earned
                </span>
              )}
            </p>
          )}
          {conversation.total_revenue_cents > 0 && senderType === 'chatter' && (
            <p className="text-[11px] text-green-400/70">
              ${(conversation.total_revenue_cents / 100).toFixed(2)} earned
            </p>
          )}
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

      {/* Messages — scrollable */}
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
            <p className="text-sm text-muted-foreground/60">Start of conversation</p>
          </div>
        )}

        {!isLoading && messages.map((msg) => {
          const isTeam = ['creator', 'chatter'].includes(msg.sender_type);
          const isOwn = msg.sender_id === currentUserId;
          const teamSenderInfo = isTeam && !isOwn ? senderProfiles.get(msg.sender_id) ?? null : null;
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={isOwn}
              isTeam={isTeam}
              teamSenderInfo={teamSenderInfo}
              conversationId={senderType === 'fan' ? conversation.id : undefined}
            />
          );
        })}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Composer + action buttons */}
      <div className="border-t border-border">
        {senderType !== 'fan' && (
          <div className="flex items-center gap-1 px-3 pt-2">
            <button
              type="button"
              onClick={() => setShowContentPicker(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Attach paid content"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Attach content
            </button>
          </div>
        )}
        <RichMessageComposer
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          isSending={isSending}
          placeholder={`Reply to ${fanName}…`}
        />
      </div>

      {/* Content picker modal */}
      <AnimatePresence>
        {showContentPicker && (
          <ChatContentPicker
            profileId={conversation.profile_id}
            onSelect={handleAttachContent}
            onClose={() => setShowContentPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
