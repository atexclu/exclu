/**
 * CreatorChat — /app/chat
 *
 * Interface de chat du créateur.
 * Layout split-pane : liste des conversations à gauche, fenêtre de chat à droite.
 * Responsive : sur mobile, la liste et la fenêtre s'affichent en alternance.
 *
 * Statuts supportés :
 *   - unclaimed : conversation créée par un fan, en attente de traitement
 *   - active    : conversation prise en charge par le créateur ou un chatter
 *   - archived  : filtre optionnel (onglet archives)
 */

import { useState, useEffect, useMemo } from 'react';
import { MessageSquare, Search, Loader2, MessagesSquare, ArrowLeft, Users, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '@/components/AppShell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useProfiles } from '@/contexts/ProfileContext';
import { useConversations } from '@/hooks/useConversations';
import { ConversationListItem } from '@/components/chat/ConversationListItem';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ChatSettingsPanel } from '@/components/chat/ChatSettingsPanel';
import { BroadcastPanel } from '@/pages/MassMessage';
import { supabase } from '@/lib/supabaseClient';
import Aurora from '@/components/ui/Aurora';
import { getAuroraGradient } from '@/lib/auroraGradients';
import type { Conversation } from '@/types/chat';

type StatusFilter = 'active' | 'unclaimed' | 'archived' | 'all';

export default function CreatorChat() {
  const { activeProfile } = useProfiles();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileList, setShowMobileList] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);

  const statusesToFetch = useMemo<Conversation['status'][]>(() => {
    return ['unclaimed', 'active'];
  }, []);

  const { conversations, isLoading } = useConversations({
    profileId: activeProfile?.id ?? null,
    statusFilter: statusesToFetch,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => {
      const name = c.fan?.display_name?.toLowerCase() ?? '';
      const preview = c.last_message_preview?.toLowerCase() ?? '';
      return name.includes(q) || preview.includes(q);
    });
  }, [conversations, searchQuery]);

  // Auto-select the first conversation when loaded
  useEffect(() => {
    if (!selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0]);
    }
  }, [conversations]);

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setShowMobileList(false);
  };

  const handleBackToList = () => {
    setShowMobileList(true);
  };

  return (
    <AppShell>
      <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] overflow-hidden max-w-6xl mx-auto w-full p-0 md:px-6 md:py-4">
        <div className="flex flex-1 overflow-hidden rounded-none md:rounded-2xl border-0 md:border border-border/60 md:shadow-[0_0_40px_-12px_rgba(0,0,0,0.3)]">

          {/* ── Panneau gauche : liste des conversations ─────────────────── */}
          <div className={`
            flex flex-col border-r border-border/60 bg-card
            w-full md:w-80 lg:w-96 flex-shrink-0
            ${showMobileList ? 'flex' : 'hidden md:flex'}
          `}>
            <div className="px-4 pt-4 pb-3 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <h1 className="text-lg font-bold text-foreground">Conversations</h1>
                <div className="flex items-center gap-1">
                  {activeProfile && (
                    <button
                      type="button"
                      onClick={() => setShowBroadcast(true)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
                      title="Broadcast message"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                  {activeProfile && (
                    <button
                      type="button"
                      onClick={() => setShowSettings((s) => !s)}
                      className={`h-7 px-2.5 rounded-lg flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                        showSettings ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                      }`}
                      title="Chatters"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Chatters
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* Sliding content: conversations list vs settings panel */}
            <AnimatePresence mode="wait" initial={false}>
              {showSettings && activeProfile ? (
                <motion.div
                  key="settings"
                  initial={{ x: '100%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: '100%', opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.8 }}
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  <ChatSettingsPanel
                    profileId={activeProfile.id}
                    onClose={() => setShowSettings(false)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="conversations"
                  initial={{ x: '-100%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: '-100%', opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.8 }}
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  <div className="px-4 pt-4 pb-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search…"
                        className="pl-8 h-8 text-xs bg-muted/50 border-0 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {isLoading && (
                      <div className="flex justify-center py-10">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}

                    {!isLoading && filteredConversations.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
                        <MessagesSquare className="w-8 h-8 text-muted-foreground/20" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground/60">
                            {searchQuery ? 'No results' : 'No conversations'}
                          </p>
                          <p className="text-xs text-muted-foreground/40">
                            {searchQuery
                              ? 'Try a different search'
                              : 'Fan conversations will appear here'}
                          </p>
                        </div>
                      </div>
                    )}

                    {!isLoading && filteredConversations.map((conv) => (
                      <ConversationListItem
                        key={conv.id}
                        conversation={conv}
                        isSelected={selectedConversation?.id === conv.id}
                        onClick={() => handleSelectConversation(conv)}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Panneau droit : fenêtre de chat ──────────────────────────── */}
          <div className={`
            flex-1 flex flex-col overflow-hidden bg-card/80 relative
            ${!showMobileList ? 'flex' : 'hidden md:flex'}
          `}>
            {/* Aurora background with creator theme colors */}
            {activeProfile && (
              <div className="fixed inset-0 opacity-10 pointer-events-none">
                <Aurora
                  colorStops={getAuroraGradient(activeProfile.aurora_gradient || 'purple_dream').colors}
                  amplitude={0.8}
                  blend={0.6}
                  speed={0.5}
                />
              </div>
            )}
            <AnimatePresence mode="wait">
              {selectedConversation && currentUserId ? (
                <motion.div
                  key={selectedConversation.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col h-full"
                >
                  <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs h-8 px-2"
                      onClick={handleBackToList}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back
                    </Button>
                  </div>

                  <ChatWindow
                    conversation={selectedConversation}
                    currentUserId={currentUserId}
                    senderType="creator"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8"
                >
                  <div className="w-16 h-16 rounded-2xl border border-border bg-muted/30 flex items-center justify-center">
                    <MessageSquare className="w-7 h-7 text-muted-foreground/30" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-base font-semibold text-foreground/60">
                      Select a conversation
                    </p>
                    <p className="text-sm text-muted-foreground/40 max-w-xs">
                      Pick a conversation from the list to start replying to fans
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>

      {/* ── Broadcast modal overlay ────────────────────────────────────── */}
      <AnimatePresence>
        {showBroadcast && activeProfile && (
          <motion.div
            key="broadcast-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto pt-16 sm:pt-24 pb-8"
            onClick={(e) => { if (e.target === e.currentTarget) setShowBroadcast(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-2xl mx-4 bg-card rounded-2xl border border-border shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setShowBroadcast(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>
              <BroadcastPanel profileId={activeProfile.id} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
