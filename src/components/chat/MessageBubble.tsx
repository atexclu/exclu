/**
 * MessageBubble
 *
 * Affiche un seul message dans la fenêtre de chat.
 * - Messages du fan : alignés à gauche, fond noir (dark) / blanc (light)
 * - Messages du créateur/chatter : alignés à droite, fond primary
 * - Messages système : centrés, italique, discrets
 */

import { ExternalLink, UserCircle, Check, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Message } from '@/types/chat';
import StarBorder from '@/components/ui/StarBorder';
import { CustomRequestCard } from './CustomRequestCard';
import { supabaseAnon } from '@/lib/supabaseClient';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  /** Right-align this message (creator/chatter = team side) */
  isTeam?: boolean;
  /** Avatar/name for team messages not sent by the current user */
  teamSenderInfo?: { display_name: string | null; avatar_url: string | null } | null;
  conversationId?: string;
  viewerRole?: 'fan' | 'creator' | 'chatter';
  onDeliver?: (requestId: string) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function useLinkPurchaseStatus(linkId: string | null | undefined): 'pending' | 'purchased' | null {
  const [status, setStatus] = useState<'pending' | 'purchased' | null>(null);
  useEffect(() => {
    if (!linkId) return;
    supabaseAnon
      .from('purchases')
      .select('status')
      .eq('link_id', linkId)
      .eq('status', 'succeeded')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setStatus(data ? 'purchased' : 'pending');
      });
  }, [linkId]);
  return status;
}

export function MessageBubble({ message, isOwn, isTeam, teamSenderInfo, conversationId, viewerRole = 'fan', onDeliver }: MessageBubbleProps) {
  const linkPurchaseStatus = useLinkPurchaseStatus(
    message.content_type === 'paid_content' ? message.link?.id : undefined
  );
  const rightAligned = isTeam ?? isOwn;

  // Custom request rich card
  if (message.content_type === 'custom_request' && message.custom_request_id) {
    return (
      <div className="flex justify-center my-3">
        <CustomRequestCard
          requestId={message.custom_request_id}
          viewerRole={viewerRole}
          fallbackContent={message.content}
          onDeliver={onDeliver}
        />
      </div>
    );
  }

  if (message.content_type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-muted-foreground/60 italic px-3 py-1 rounded-full bg-muted/30">
          {message.content}
        </span>
      </div>
    );
  }

  const showTeamAvatar = rightAligned && !isOwn && !!teamSenderInfo;
  const senderInitial = (teamSenderInfo?.display_name ?? '?').charAt(0).toUpperCase();

  return (
    <div className={`flex ${rightAligned ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[75%] min-w-0 flex flex-col ${rightAligned ? 'items-end' : 'items-start'}`}>

        {/* Image / video content */}
        {message.content_type === 'image' && message.content && (
          <div className="rounded-2xl overflow-hidden max-w-[260px]">
            {message.content.match(/\.(mp4|mov|webm|avi)$/i) ? (
              <video src={message.content} controls className="w-full rounded-2xl" preload="metadata" />
            ) : (
              <a href={message.content} target="_blank" rel="noopener noreferrer">
                <img src={message.content} alt="" className="w-full rounded-2xl object-cover" loading="lazy" />
              </a>
            )}
          </div>
        )}

        {/* Bulle principale (text only) */}
        {message.content_type !== 'image' && message.content_type !== 'custom_request' && message.content && (
          <div
            className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed bg-black text-white border border-white/20 ${
              rightAligned ? 'rounded-br-sm' : 'rounded-bl-sm'
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        )}

        {/* Contenu payant attaché - Link preview image with StarBorder */}
        {(message.content_type === 'paid_content' || message.content_type === 'tip_link') && message.link && (
          <StarBorder
            as="a"
            href={`/l/${message.link.slug}${conversationId ? `?from_conversation=${conversationId}` : ''}${message.chatter_ref ? `${conversationId ? '&' : '?'}chtref=${message.chatter_ref}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-2xl max-w-[260px] hover:opacity-90 transition-opacity mt-1 border border-white/30"
            color="white"
            speed="6s"
            thickness={2}
          >
            <img 
              src="/og-link-default.png" 
              alt="" 
              className="w-full rounded-2xl"
            />
          </StarBorder>
        )}

        {/* Footer: avatar + sender name + time — inline row below the bubble */}
        <div className={`flex items-center gap-1 mt-0.5 px-0.5 ${rightAligned ? 'flex-row-reverse' : 'flex-row'}`}>
          {showTeamAvatar && (
            <div className="w-3 h-3 rounded-full flex-shrink-0 overflow-hidden bg-muted border border-border flex items-center justify-center" title={teamSenderInfo?.display_name ?? undefined}>
              {teamSenderInfo?.avatar_url ? (
                <img src={teamSenderInfo.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[6px] font-bold text-muted-foreground">{senderInitial}</span>
              )}
            </div>
          )}
          {showTeamAvatar && teamSenderInfo?.display_name && (
            <span className="text-[10px] font-medium text-muted-foreground/60">
              {teamSenderInfo.display_name}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/50">
            {formatTime(message.created_at)}
          </span>
          {message.content_type === 'paid_content' && linkPurchaseStatus && (
            <span className={`text-[9px] flex items-center gap-0.5 ${
              linkPurchaseStatus === 'purchased' ? 'text-green-400' : 'text-muted-foreground/40'
            }`}>
              {linkPurchaseStatus === 'purchased' ? <><Check className="w-2.5 h-2.5" /> Purchased</> : <><Clock className="w-2.5 h-2.5" /> Pending</>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
