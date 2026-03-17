/**
 * MessageBubble
 *
 * Affiche un seul message dans la fenêtre de chat.
 * - Messages du fan : alignés à gauche, fond muted
 * - Messages du créateur/chatter : alignés à droite, fond primary
 * - Messages système : centrés, italique, discrets
 */

import { ExternalLink } from 'lucide-react';
import type { Message } from '@/types/chat';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  /** Right-align this message (creator/chatter = team side) */
  isTeam?: boolean;
  /** Avatar/name for team messages not sent by the current user */
  teamSenderInfo?: { display_name: string | null; avatar_url: string | null } | null;
  conversationId?: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message, isOwn, isTeam, teamSenderInfo, conversationId }: MessageBubbleProps) {
  const rightAligned = isTeam ?? isOwn;
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
      <div className={`max-w-[75%] flex gap-1.5 ${rightAligned ? 'flex-row-reverse items-end' : 'flex-row items-end'}`}>

        {/* Team member avatar (only for non-own team messages) */}
        {showTeamAvatar && (
          <div className="w-5 h-5 rounded-full flex-shrink-0 overflow-hidden bg-muted border border-border flex items-center justify-center" title={teamSenderInfo?.display_name ?? undefined}>
            {teamSenderInfo?.avatar_url ? (
              <img src={teamSenderInfo.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[9px] font-bold text-muted-foreground">{senderInitial}</span>
            )}
          </div>
        )}

        <div className={`flex flex-col gap-0.5 ${rightAligned ? 'items-end' : 'items-start'}`}>

        {/* Sender name for non-own team messages */}
        {showTeamAvatar && teamSenderInfo?.display_name && (
          <span className="text-[10px] font-medium text-muted-foreground/70 px-1 mb-0.5">
            {teamSenderInfo.display_name}
          </span>
        )}

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

        {/* Bulle principale (text / paid content) */}
        {message.content_type !== 'image' && (
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
            rightAligned
              ? isOwn
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-primary/60 text-primary-foreground rounded-br-sm'
              : 'bg-muted text-foreground rounded-bl-sm'
          }`}
        >
          {/* Contenu texte */}
          {message.content && (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}

          {/* Contenu payant attaché */}
          {(message.content_type === 'paid_content' || message.content_type === 'tip_link') && message.link && (
            <div className={`mt-2 rounded-xl border p-3 flex items-center gap-3 ${
              rightAligned ? 'border-white/20 bg-white/10' : 'border-border bg-background/60'
            }`}>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold truncate ${rightAligned ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {message.link.title || 'Exclusive content'}
                </p>
                {message.link.price_cents > 0 && (
                  <p className={`text-[11px] mt-0.5 ${rightAligned ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    ${(message.link.price_cents / 100).toFixed(2)}
                  </p>
                )}
              </div>
              <a
                href={`/l/${message.link.slug}${conversationId ? `?from_conversation=${conversationId}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                  rightAligned
                    ? 'bg-white/20 hover:bg-white/30 text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
        )}

        {/* Horodatage */}
        <span className="text-[10px] text-muted-foreground/50 px-1">
          {formatTime(message.created_at)}
        </span>
        </div>
      </div>
    </div>
  );
}
