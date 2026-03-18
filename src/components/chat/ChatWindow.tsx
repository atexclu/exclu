/**
 * ChatWindow
 *
 * Panneau droit du chat : liste des messages + compositeur.
 * Gère le scroll automatique vers le bas à chaque nouveau message.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, User, Paperclip, Link2, DollarSign, MapPin, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { maybeConvertHeic } from '@/lib/convertHeic';
import { AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import { useMessages } from '@/hooks/useMessages';
import { MessageBubble } from './MessageBubble';
import { RichMessageComposer } from './RichMessageComposer';
import { ChatContentPicker, type ContentAsset } from './ChatContentPicker';
import { ChatLinkPicker } from './ChatLinkPicker';
import { ChatCustomRequest } from './ChatCustomRequest';
import { ChatTipForm } from './ChatTipForm';
import { FanTagsRow } from './FanTagsRow';
import Aurora from '@/components/ui/Aurora';
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
  const navigate = useNavigate();
  const { messages, isLoading, isSending, sendMessage } = useMessages(conversation.id, senderType);
  const [draft, setDraft] = useState('');
  const [showContentPicker, setShowContentPicker] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [showCustomRequest, setShowCustomRequest] = useState(false);
  const [showTipForm, setShowTipForm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [senderProfiles, setSenderProfiles] = useState<Map<string, SenderProfile>>(new Map());
  const fan = conversation.fan;
  const fanName = fan?.display_name || 'Fan';

  // Creator profile info (fetched for fan senderType)
  const [creatorInfo, setCreatorInfo] = useState<{
    location: string | null;
    show_available_now: boolean;
    tips_enabled: boolean;
    custom_requests_enabled: boolean;
    display_name: string | null;
    is_premium: boolean;
  } | null>(null);

  useEffect(() => {
    if (senderType !== 'fan') return;
    supabase
      .from('creator_profiles')
      .select('location, show_available_now, tips_enabled, custom_requests_enabled, display_name, user_id')
      .eq('id', conversation.profile_id)
      .single()
      .then(async ({ data }) => {
        if (!data) return;
        const { data: parent } = await supabase
          .from('profiles')
          .select('is_creator_subscribed, stripe_connect_status')
          .eq('id', data.user_id)
          .single();
        setCreatorInfo({
          location: data.location,
          show_available_now: data.show_available_now === true,
          tips_enabled: data.tips_enabled === true && parent?.stripe_connect_status === 'complete',
          custom_requests_enabled: data.custom_requests_enabled === true,
          display_name: data.display_name,
          is_premium: parent?.is_creator_subscribed === true,
        });
      });
  }, [conversation.profile_id, senderType]);

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

  const handleMediaSelect = async (file: File) => {
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
      || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !isHeic) {
      toast.error('Please select an image or video file');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB');
      return;
    }
    try {
      toast.loading('Uploading media\u2026', { id: 'chat-media-upload' });
      const converted = await maybeConvertHeic(file);
      const ext = converted.name.split('.').pop() ?? 'bin';
      const path = `${conversation.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('chat-media')
        .upload(path, converted, { cacheControl: '3600', upsert: false });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      await sendMessage({
        content: publicUrl,
        senderType,
        contentType: 'image',
      });
      toast.dismiss('chat-media-upload');
      toast.success('Media sent');
    } catch (err) {
      console.error('Chat media upload error', err);
      toast.dismiss('chat-media-upload');
      toast.error('Failed to upload media. Please try again.');
    }
  };

  const handleSendAssets = async (assets: ContentAsset[]) => {
    setShowContentPicker(false);
    for (const asset of assets) {
      if (asset.previewUrl) {
        await sendMessage({
          content: asset.previewUrl,
          senderType,
          contentType: 'image',
        });
      }
    }
  };

  const handleAttachLink = async (link: { id: string; title: string | null; price_cents: number; description: string | null }) => {
    setShowLinkPicker(false);
    // Auto-fill message input with link description if available
    if (link.description) {
      setDraft(link.description);
    }
    await sendMessage({
      content: link.description || link.title || 'Exclusive content',
      senderType,
      contentType: 'paid_content',
      paidContentId: link.id,
      paidAmountCents: link.price_cents,
    });
  };

  const openLinkPicker = () => {
    setShowContentPicker(false);
    setShowLinkPicker(true);
  };

  const openContentPicker = () => {
    setShowLinkPicker(false);
    setShowContentPicker(true);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden overflow-x-hidden">
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
          {senderType !== 'fan' && conversation.total_revenue_cents > 0 && (
            <p className="text-[11px] text-green-400/70">
              ${(conversation.total_revenue_cents / 100).toFixed(2)} earned
            </p>
          )}
          {/* Creator info for fan view: location + available now */}
          {senderType === 'fan' && creatorInfo && (creatorInfo.location || (creatorInfo.show_available_now && creatorInfo.is_premium)) && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              {creatorInfo.location && (
                <>
                  <MapPin className="w-2.5 h-2.5" />
                  <span>{creatorInfo.location}</span>
                </>
              )}
              {creatorInfo.location && creatorInfo.show_available_now && creatorInfo.is_premium && (
                <span className="mx-0.5">·</span>
              )}
              {creatorInfo.show_available_now && creatorInfo.is_premium && (
                <span className="inline-flex items-center gap-1 text-green-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                  </span>
                  Available now
                </span>
              )}
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

        {/* Action buttons — for creator/chatter */}
        {senderType !== 'fan' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={openLinkPicker}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                showLinkPicker
                  ? 'bg-[#b8e614] text-black shadow-[0_0_30px_6px_rgba(207,255,22,0.25)] scale-[1.03]'
                  : 'bg-[#CFFF16] text-black shadow-[0_0_20px_4px_rgba(207,255,22,0.15)] hover:shadow-[0_0_30px_6px_rgba(207,255,22,0.2)] hover:bg-[#d8ff4d] hover:scale-[1.03] active:scale-[0.98]'
              }`}
            >
              <Link2 className="w-3 h-3" />
              Add link
            </button>
            <button
              type="button"
              onClick={openContentPicker}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                showContentPicker
                  ? 'bg-[#b8e614] text-black shadow-[0_0_30px_6px_rgba(207,255,22,0.25)] scale-[1.03]'
                  : 'bg-[#CFFF16] text-black shadow-[0_0_20px_4px_rgba(207,255,22,0.15)] hover:shadow-[0_0_30px_6px_rgba(207,255,22,0.2)] hover:bg-[#d8ff4d] hover:scale-[1.03] active:scale-[0.98]'
              }`}
            >
              <Paperclip className="w-3 h-3" />
              Attach content
            </button>
          </div>
        )}

        {/* Action buttons — for fan */}
        {senderType === 'fan' && creatorInfo && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {creatorInfo.custom_requests_enabled && (
              <button
                type="button"
                onClick={() => setShowCustomRequest(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all bg-[#CFFF16] text-black shadow-[0_0_20px_4px_rgba(207,255,22,0.15)] hover:shadow-[0_0_30px_6px_rgba(207,255,22,0.2)] hover:bg-[#d8ff4d] hover:scale-[1.03] active:scale-[0.98]"
              >
                <DollarSign className="w-3 h-3" />
                Request
              </button>
            )}
            {creatorInfo.tips_enabled && (
              <button
                type="button"
                onClick={() => setShowTipForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all bg-[#CFFF16] text-black shadow-[0_0_20px_4px_rgba(207,255,22,0.15)] hover:shadow-[0_0_30px_6px_rgba(207,255,22,0.2)] hover:bg-[#d8ff4d] hover:scale-[1.03] active:scale-[0.98]"
              >
                <Heart className="w-3 h-3" />
                Send tip
              </button>
            )}
          </div>
        )}
      </div>

      {/* Messages — scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-1 relative">
        {/* Aurora background */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <Aurora colorStops={['#5227FF', '#7cff67', '#5227FF']} amplitude={0.8} blend={0.6} speed={0.5} />
        </div>
        <div className="relative z-10">
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
      </div>

      {/* Composer + action buttons */}
      <div className="flex-shrink-0">
        {/* Inline link picker panel — above composer */}
        <AnimatePresence>
          {showLinkPicker && (
            <ChatLinkPicker
              profileId={conversation.profile_id}
              onSelect={handleAttachLink}
              onClose={() => setShowLinkPicker(false)}
              onCreateLink={senderType === 'creator' ? () => navigate('/app/links/new') : undefined}
            />
          )}
        </AnimatePresence>

        {/* Inline content picker panel — above composer */}
        <AnimatePresence>
          {showContentPicker && (
            <ChatContentPicker
              profileId={conversation.profile_id}
              onSendAssets={handleSendAssets}
              onClose={() => setShowContentPicker(false)}
            />
          )}
        </AnimatePresence>

        <RichMessageComposer
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          isSending={isSending}
          placeholder={`Reply to ${fanName}\u2026`}
          onMediaSelect={handleMediaSelect}
        />
      </div>

      {/* Custom request modal (fan only) */}
      <AnimatePresence>
        {showCustomRequest && (
          <ChatCustomRequest
            profileId={conversation.profile_id}
            onClose={() => setShowCustomRequest(false)}
          />
        )}
      </AnimatePresence>

      {/* Tip form modal (fan only) */}
      <AnimatePresence>
        {showTipForm && (
          <ChatTipForm
            profileId={conversation.profile_id}
            creatorName={fanName}
            onClose={() => setShowTipForm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
