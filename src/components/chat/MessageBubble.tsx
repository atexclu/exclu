/**
 * MessageBubble
 *
 * Affiche un seul message dans la fenêtre de chat.
 * - Messages du fan : alignés à gauche, fond noir (dark) / blanc (light)
 * - Messages du créateur/chatter : alignés à droite, fond primary
 * - Messages système : centrés, italique, discrets
 */

import { ExternalLink, UserCircle } from 'lucide-react';
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
      <div className={`max-w-[75%] flex flex-col ${rightAligned ? 'items-end' : 'items-start'}`}>

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
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-black text-white border border-white/10 rounded-bl-sm'
            }`}
          >
              {/* Contenu texte */}
              {message.content && (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              )}

              {/* Contenu payant attaché - Link preview card */}
              {(message.content_type === 'paid_content' || message.content_type === 'tip_link') && message.link && (
                <a
                  href={`/l/${message.link.slug}${conversationId ? `?from_conversation=${conversationId}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-2 block rounded-xl overflow-hidden border transition-all hover:scale-[1.02] ${
                    rightAligned 
                      ? 'border-white/20 bg-white/10 hover:bg-white/15' 
                      : 'border-white/20 bg-white/10 hover:bg-white/15'
                  }`}
                >
                  {/* Preview image */}
                  <div className="w-full aspect-video bg-muted/20 overflow-hidden">
                    <img 
                      src="/og-link-default.png" 
                      alt="" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* Link info */}
                  <div className="p-3">
                    <p className={`text-xs font-semibold line-clamp-2 ${
                      rightAligned 
                        ? 'text-primary-foreground' 
                        : 'text-white'
                    }`}>
                      {message.link.title || 'Exclusive content'}
                    </p>
                    {message.link.price_cents > 0 && (
                      <div className="flex items-center justify-between mt-1.5">
                        <p className={`text-sm font-bold ${
                          rightAligned 
                            ? 'text-primary-foreground' 
                            : 'text-primary'
                        }`}>
                          ${(message.link.price_cents / 100).toFixed(2)}
                        </p>
                        <ExternalLink className={`w-3.5 h-3.5 ${
                          rightAligned ? 'text-primary-foreground/70' : 'text-white/70'
                        }`} />
                      </div>
                    )}
                  </div>
                </a>
              )}
          </div>
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
        </div>
      </div>
    </div>
  );
}
