/**
 * ConversationListItem
 *
 * Un élément de la liste des conversations dans le panneau gauche du chat.
 * Affiche l'avatar du fan, son nom, le dernier message, et les indicateurs de statut.
 */

import { Pin, DollarSign } from 'lucide-react';
import type { Conversation } from '@/types/chat';

interface ConversationListItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}

export function ConversationListItem({
  conversation,
  isSelected,
  onClick,
}: ConversationListItemProps) {
  const fan = conversation.fan;
  const isGuest = !conversation.fan_id && !!conversation.guest_session_id;
  const fanName = isGuest
    ? (conversation.guest_display_name || 'Guest')
    : (fan?.display_name || 'Fan');
  const initial = fanName.charAt(0).toUpperCase();
  const isUnread = !conversation.is_read;
  const isUnclaimed = conversation.status === 'unclaimed';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
        isSelected
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-muted/60 border border-transparent'
      }`}
    >
      {/* Avatar fan */}
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-muted border border-border">
          {fan?.avatar_url ? (
            <img src={fan.avatar_url} alt={fanName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-sm font-bold text-muted-foreground">{initial}</span>
            </div>
          )}
        </div>
        {/* Indicateur unclaimed */}
        {isUnclaimed && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-yellow-400 border-2 border-background" />
        )}
      </div>

      {/* Contenu */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={`text-sm truncate ${isUnread ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
            {fanName}
          </span>
          {isGuest && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 flex-shrink-0">
              Guest
            </span>
          )}
          <div className="flex items-center gap-1 flex-shrink-0">
            {conversation.is_pinned && (
              <Pin className="w-3 h-3 text-muted-foreground/50" />
            )}
            <span className="text-[10px] text-muted-foreground/60">
              {formatRelativeTime(conversation.last_message_at)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 mt-0.5">
          <p className={`text-xs truncate flex-1 ${isUnread ? 'text-foreground/70' : 'text-muted-foreground/60'}`}>
            {isUnclaimed
              ? '⏳ Pending'
              : (conversation.last_message_preview || 'Start of conversation')}
          </p>

          {/* Revenus générés si > 0 */}
          {conversation.total_revenue_cents > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-400/70 flex-shrink-0">
              <DollarSign className="w-2.5 h-2.5" />
              {(conversation.total_revenue_cents / 100).toFixed(0)}
            </span>
          )}

          {/* Badge non-lu */}
          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
          )}
        </div>
      </div>
    </button>
  );
}
