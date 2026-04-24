import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { MessageSquare, Send, X, Loader2, User, DollarSign, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageBubble } from '@/components/chat/MessageBubble';
import type { Message } from '@/types/chat';

interface GuestChatProps {
  profileId: string;
  creatorUserId: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  tipsEnabled?: boolean;
  minTipAmountCents?: number;
  variant?: 'floating' | 'inline';
  onClose?: () => void;
  gradientStops?: string[];
  /** When true, the inline variant fills 100% of its parent (used for mobile fullscreen overlay). */
  fullHeight?: boolean;
}

const POLL_INTERVAL_MS = 4000;

const TIP_PRESETS = [500, 1000, 2500, 5000];

// Global lock to prevent double-init when mobile and desktop components mount simultaneously.
const initLocks = new Map<string, Promise<any>>();

export default function GuestChat({ profileId, creatorUserId, creatorName, creatorAvatarUrl, tipsEnabled, minTipAmountCents, variant = 'floating', onClose, gradientStops = ['#CFFF16', '#CFFF16'], fullHeight = false }: GuestChatProps) {
  const isInline = variant === 'inline';
  const [isOpen, setIsOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [showTipForm, setShowTipForm] = useState(false);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [tipCustom, setTipCustom] = useState('');
  const [tipMessage, setTipMessage] = useState('');
  const [isTipSubmitting, setIsTipSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasScrolledRef = useRef(false);
  const isInitializingRef = useRef(false);

  const storageKey = `exclu_guest_session_${profileId}`;

  // Scroll to bottom of messages — instant on first load, smooth after.
  // Double rAF ensures layout is computed after render.
  const scrollToBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        if (hasScrolledRef.current) {
          scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        } else {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        hasScrolledRef.current = true;
      });
    });
  }, []);

  // Initialize or resume guest session
  const initChat = useCallback(async () => {
    const lockKey = profileId;

    if (initLocks.has(lockKey)) {
      setIsInitializing(true);
      try {
        const data = await initLocks.get(lockKey);
        setSessionToken(data.session_token);
        setConversationId(data.conversation_id);
        setMessages((data.messages ?? []) as Message[]);
      } catch (err: any) {
        setError(err.message || 'Unable to start chat');
      } finally {
        setIsInitializing(false);
      }
      return;
    }

    if (isInitializingRef.current) return;
    isInitializingRef.current = true;
    setIsInitializing(true);
    setError(null);

    const promise = (async () => {
      const existingToken = localStorage.getItem(storageKey);
      const { data, error: invokeError } = await supabase.functions.invoke('guest-chat-init', {
        body: {
          profile_id: profileId,
          session_token: existingToken || undefined,
        },
      });

      if (invokeError || !data) {
        throw new Error(data?.error || invokeError?.message || 'Failed to initialize chat');
      }
      
      localStorage.setItem(storageKey, data.session_token);
      return data;
    })();

    initLocks.set(lockKey, promise);

    try {
      const data = await promise;
      setSessionToken(data.session_token);
      setConversationId(data.conversation_id);
      setMessages((data.messages ?? []) as Message[]);
    } catch (err: any) {
      console.error('Guest chat init error:', err);
      setError(err.message || 'Unable to start chat');
    } finally {
      setIsInitializing(false);
      isInitializingRef.current = false;
      setTimeout(() => initLocks.delete(lockKey), 500);
    }
  }, [profileId, storageKey]);

  // Open chat → init if needed
  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setHasUnread(false);
    if (!conversationId && !isInitializingRef.current) {
      initChat();
    }
  }, [conversationId, initChat]);

  // Send a message
  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || !sessionToken || !conversationId) return;

    setDraft('');
    setIsSending(true);

    // Optimistic local append
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      sender_type: 'fan',
      sender_id: null,
      guest_session_id: sessionToken,
      content: trimmed,
      content_type: 'text',
      paid_content_id: null,
      paid_amount_cents: null,
      tip_link_id: null,
      wishlist_item_id: null,
      custom_request_id: null,
      chatter_ref: null,
      is_read: false,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToBottom();

    try {
      const { data, error: sendError } = await supabase.functions.invoke('guest-chat-send', {
        body: {
          session_token: sessionToken,
          conversation_id: conversationId,
          content: trimmed,
          content_type: 'text',
        },
      });

      if (sendError || !data?.message) {
        throw new Error(data?.error || sendError?.message || 'Failed to send');
      }

      // Replace optimistic message with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMsg.id ? (data.message as Message) : m))
      );
    } catch (err: any) {
      console.error('Guest chat send error:', err);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setError('Failed to send message');
    } finally {
      setIsSending(false);
    }
  }, [draft, sessionToken, conversationId, scrollToBottom]);

  // Send a tip
  const handleTipSubmit = useCallback(async () => {
    const finalAmount = tipAmount || Math.round(parseFloat(tipCustom || '0') * 100);
    const minAmount = minTipAmountCents || 500;

    if (finalAmount < minAmount) {
      toast.error(`Minimum tip is $${(minAmount / 100).toFixed(2)}`);
      return;
    }
    if (finalAmount > 50000) {
      toast.error('Maximum tip is $500.00');
      return;
    }

    setIsTipSubmitting(true);
    try {
      const tipBody: Record<string, unknown> = {
        creator_id: creatorUserId,
        profile_id: profileId,
        amount_cents: finalAmount,
        message: tipMessage || null,
        is_anonymous: false,
        conversation_id: conversationId,
      };

      const { data, error: invokeErr } = await supabase.functions.invoke('create-tip-checkout', {
        body: tipBody,
      });

      if (invokeErr || !data?.fields) {
        throw new Error(data?.error || (invokeErr as any)?.message || 'Unable to start checkout');
      }

      // Submit QuickPay form
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://quickpay.ugpayments.ch/';
      form.style.display = 'none';
      Object.entries(data.fields as Record<string, string>).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process tip');
    } finally {
      setIsTipSubmitting(false);
    }
  }, [tipAmount, tipCustom, tipMessage, creatorUserId, profileId, conversationId, minTipAmountCents]);

  // Poll for new messages
  const pollMessages = useCallback(async () => {
    if (!sessionToken || !conversationId) return;

    try {
      const lastMsg = messages[messages.length - 1];
      const { data, error: pollError } = await supabase.functions.invoke('guest-chat-messages', {
        body: {
          session_token: sessionToken,
          conversation_id: conversationId,
          after_id: lastMsg?.id?.startsWith('temp-') ? undefined : lastMsg?.id,
        },
      });

      if (pollError || !data?.messages) return;

      const newMessages = (data.messages as Message[]).filter(
        (m) => !messages.some((existing) => existing.id === m.id)
      );

      if (newMessages.length > 0) {
        setMessages((prev) => {
          const merged = [...prev];
          for (const nm of newMessages) {
            if (!merged.some((m) => m.id === nm.id)) {
              merged.push(nm);
            }
          }
          return merged;
        });

        // Check for unread messages from creator/chatter when chat is closed
        const hasCreatorMessages = newMessages.some(
          (m) => m.sender_type === 'creator' || m.sender_type === 'chatter'
        );
        if (hasCreatorMessages && !isOpen) {
          setHasUnread(true);
        }

        scrollToBottom();
      }
    } catch {
      // Silent fail for polling
    }
  }, [sessionToken, conversationId, messages, isOpen, scrollToBottom]);

  // Start/stop polling when chat is open and session is active
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (sessionToken && conversationId) {
      pollRef.current = setInterval(pollMessages, POLL_INTERVAL_MS);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [sessionToken, conversationId, pollMessages]);

  // Scroll to bottom whenever the messages list changes (initial load + new messages).
  useEffect(() => {
    if (!messages.length) return;
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Reset scroll state when switching conversation (so next load scrolls instantly).
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [conversationId]);

  // Check if there's an existing session on mount (for unread indicator)
  useEffect(() => {
    const existingToken = localStorage.getItem(storageKey);
    if (existingToken) {
      setSessionToken(existingToken);
    }
  }, [storageKey]);

  // Inline mode: auto-init on mount
  useEffect(() => {
    if (isInline && !conversationId && !isInitializingRef.current) {
      initChat();
    }
  }, [isInline, conversationId, initChat]);

  // ── Shared UI fragments ──────────────────────────────────────────────

  const headerUI = (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0 ${isInline ? '' : ''}`}>
      {isInline && onClose && (
        <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-neutral-400" />
        </button>
      )}
      <div className="w-9 h-9 rounded-full overflow-hidden bg-neutral-800 border border-white/10 flex-shrink-0">
        {creatorAvatarUrl ? (
          <img src={creatorAvatarUrl} alt={creatorName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="w-4 h-4 text-neutral-500" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{creatorName}</p>
        <p className="text-[10px] text-neutral-400">Usually replies within minutes</p>
      </div>
      {!isInline && (
        <button type="button" onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors">
          <X className="w-4 h-4 text-neutral-400" />
        </button>
      )}
    </div>
  );

  const messagesUI = (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-1">
      {isInitializing && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
        </div>
      )}

      {error && !isInitializing && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <p className="text-xs text-red-400">{error}</p>
          <button type="button" onClick={initChat} className="text-xs text-[#CFFF16] hover:underline">Try again</button>
        </div>
      )}

      {!isInitializing && !error && messages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-neutral-500" />
          </div>
          <p className="text-xs text-neutral-500">Send a message to start the conversation</p>
        </div>
      )}

      {!isInitializing && messages.map((msg) => {
        const isTeam = ['creator', 'chatter'].includes(msg.sender_type);
        const isOwn = msg.sender_type === 'fan';
        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={isOwn}
            isTeam={isTeam}
            conversationId={conversationId || undefined}
            viewerRole="fan"
          />
        );
      })}
    </div>
  );

  const tipFormUI = showTipForm && conversationId && (
    <div className="flex-shrink-0 border-t border-white/10 px-3 py-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setShowTipForm(false)} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors">
          <ArrowLeft className="w-3 h-3" /> Back to chat
        </button>
        <span className="text-xs text-neutral-500">Send a Tip</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {TIP_PRESETS.map((cents) => (
          <button key={cents} type="button" onClick={() => { setTipAmount(cents); setTipCustom(''); }}
            className={`h-8 rounded-lg text-xs font-medium transition-all ${tipAmount === cents ? 'bg-[#CFFF16] text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            ${(cents / 100).toFixed(0)}
          </button>
        ))}
      </div>
      <input type="number" value={tipCustom} onChange={(e) => { setTipCustom(e.target.value); setTipAmount(null); }}
        placeholder="Custom amount ($)" min="1" step="0.01"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[#CFFF16]/50 transition-colors" />
      <input type="text" value={tipMessage} onChange={(e) => setTipMessage(e.target.value)}
        placeholder="Add a message (optional)" maxLength={500}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[#CFFF16]/50 transition-colors" />
      <button type="button" onClick={handleTipSubmit} disabled={isTipSubmitting || (!tipAmount && !tipCustom)}
        className="w-full h-10 rounded-xl bg-[#CFFF16] text-black text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#d8ff4d] disabled:opacity-40 transition-all">
        {isTipSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
        {isTipSubmitting ? 'Processing...' : `Send Tip${tipAmount ? ` — $${((tipAmount * 1.15) / 100).toFixed(2)}` : tipCustom ? ` — $${(parseFloat(tipCustom) * 1.15).toFixed(2)}` : ''}`}
      </button>
    </div>
  );

  const composerUI = conversationId && !error && !showTipForm && (
    <div className="flex-shrink-0 border-t border-white/10 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {tipsEnabled && (
          <button type="button" onClick={() => setShowTipForm(true)}
            className="w-9 h-9 rounded-full bg-white/10 text-neutral-400 hover:bg-white/20 hover:text-white flex items-center justify-center transition-all flex-shrink-0"
            title="Send a tip">
            <DollarSign className="w-4 h-4" />
          </button>
        )}
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a message…"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[#CFFF16]/50 transition-colors"
          disabled={isSending} />
        <button type="button" onClick={handleSend} disabled={!draft.trim() || isSending}
          className="w-9 h-9 rounded-full bg-[#CFFF16] text-black flex items-center justify-center hover:bg-[#d8ff4d] disabled:opacity-40 disabled:hover:bg-[#CFFF16] transition-all flex-shrink-0">
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  // ── Inline variant ──────────────────────────────────────────────────
  // Always fills 100% of its parent (height & width) — caller controls sizing.
  // `fullHeight` toggles the visual style (no border/rounded for the mobile
  // fullscreen overlay; bordered + rounded for the desktop card).

  if (isInline) {
    const containerClass = fullHeight
      ? 'relative overflow-hidden bg-black flex flex-col h-full w-full'
      : 'relative overflow-hidden rounded-3xl border border-white/15 bg-black/60 backdrop-blur-xl shadow-xl flex flex-col h-full w-full';

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={containerClass}
      >
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full opacity-15 blur-3xl pointer-events-none"
          style={{ background: `radial-gradient(circle, ${gradientStops[1]}, transparent)` }} />
        <div className="relative z-10 flex flex-col flex-1 min-h-0">
          {headerUI}
          {messagesUI}
          {tipFormUI}
          {composerUI}
        </div>
      </motion.div>
    );
  }

  // ── Floating variant (original) ─────────────────────────────────────

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            type="button"
            onClick={handleOpen}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#CFFF16] text-black shadow-[0_0_30px_8px_rgba(207,255,22,0.25)] hover:shadow-[0_0_40px_12px_rgba(207,255,22,0.35)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
          >
            <MessageSquare className="w-6 h-6" />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-black flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-6rem)] rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
          >
            {headerUI}
            {messagesUI}
            {tipFormUI}
            {composerUI}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
