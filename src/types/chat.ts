/**
 * Types partagés du système de chat.
 * Utilisés par les hooks, context et composants chat.
 */

export interface FanProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  deleted_at?: string | null;
}

export interface Conversation {
  id: string;
  fan_id: string | null;
  profile_id: string;
  assigned_chatter_id: string | null;
  guest_session_id: string | null;
  status: 'unclaimed' | 'active' | 'archived' | 'transferred';
  is_pinned: boolean;
  is_read: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  total_revenue_cents: number;
  created_at: string;
  archived_at: string | null;
  fan?: FanProfile | null;
  guest_display_name?: string | null;
  is_guest?: boolean;
}

export type MessageContentType =
  | 'text'
  | 'paid_content'
  | 'tip_link'
  | 'wishlist_link'
  | 'image'
  | 'system'
  | 'custom_request';

export type SenderType = 'fan' | 'creator' | 'chatter' | 'system';

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_id: string | null;
  guest_session_id?: string | null;
  content: string | null;
  content_type: MessageContentType;
  paid_content_id: string | null;
  paid_amount_cents: number | null;
  tip_link_id: string | null;
  wishlist_item_id: string | null;
  custom_request_id: string | null;
  chatter_ref: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  link?: {
    id: string;
    title: string | null;
    slug: string;
    price_cents: number;
  } | null;
}
