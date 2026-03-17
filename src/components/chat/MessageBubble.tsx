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
  conversationId?: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message, isOwn, conversationId }: MessageBubbleProps) {
  if (message.content_type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-muted-foreground/60 italic px-3 py-1 rounded-full bg-muted/30">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[75%] flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>

        {/* Bulle principale */}
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isOwn
              ? 'bg-primary text-primary-foreground rounded-br-sm'
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
              isOwn ? 'border-white/20 bg-white/10' : 'border-border bg-background/60'
            }`}>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold truncate ${isOwn ? 'text-primary-foreground' : 'text-foreground'}`}>
                  {message.link.title || 'Contenu exclusif'}
                </p>
                {message.link.price_cents > 0 && (
                  <p className={`text-[11px] mt-0.5 ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    ${(message.link.price_cents / 100).toFixed(2)}
                  </p>
                )}
              </div>
              <a
                href={`/l/${message.link.slug}${conversationId ? `?from_conversation=${conversationId}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                  isOwn
                    ? 'bg-white/20 hover:bg-white/30 text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Horodatage */}
        <span className="text-[10px] text-muted-foreground/50 px-1">
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  );
}
