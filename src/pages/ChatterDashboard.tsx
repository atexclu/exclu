/**
 * ChatterDashboard — /app/chatter
 *
 * Interface pour les chatters :
 *  - Liste des conversations non-claimées (unclaimed) des profils assignés
 *  - Bouton "Prendre en charge" → RPC claim_conversation
 *  - Liste des conversations actives assignées au chatter
 *  - Fenêtre de chat une fois une conversation sélectionnée
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, MessagesSquare, UserCheck, Inbox, ArrowLeft,
  LogOut, CheckCircle2, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import logoWhite from '@/assets/logo-white.svg';
import logoBlack from '@/assets/logo-black.svg';
import type { Conversation } from '@/types/chat';

type TabKey = 'unclaimed' | 'mine';

export default function ChatterDashboard() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>('unclaimed');
  const [unclaimedConvs, setUnclaimedConvs] = useState<Conversation[]>([]);
  const [myConvs, setMyConvs] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [showMobileList, setShowMobileList] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const loadConversations = useCallback(async (uid: string) => {
    // Récupérer les profils autorisés pour ce chatter
    const { data: invitationsData } = await supabase
      .from('chatter_invitations')
      .select('profile_id')
      .eq('chatter_id', uid)
      .eq('status', 'accepted');

    const authorizedProfileIds = (invitationsData ?? []).map((i: any) => i.profile_id);

    if (authorizedProfileIds.length === 0) {
      setUnclaimedConvs([]);
      setMyConvs([]);
      return;
    }

    // Conversations unclaimed des profils où ce chatter est actif
    const { data: unclaimed } = await supabase
      .from('conversations')
      .select(`
        *,
        fan:profiles!conversations_fan_id_fkey(id, display_name, avatar_url),
        creator_profile:creator_profiles!conversations_profile_id_fkey(id, username, display_name, avatar_url)
      `)
      .eq('status', 'unclaimed')
      .in('profile_id', authorizedProfileIds)
      .order('created_at', { ascending: false })
      .limit(50);

    // Conversations actives assignées à ce chatter
    const { data: mine } = await supabase
      .from('conversations')
      .select(`
        *,
        fan:profiles!conversations_fan_id_fkey(id, display_name, avatar_url),
        creator_profile:creator_profiles!conversations_profile_id_fkey(id, username, display_name, avatar_url)
      `)
      .eq('assigned_chatter_id', uid)
      .eq('status', 'active')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50);

    setUnclaimedConvs((unclaimed as Conversation[]) ?? []);
    setMyConvs((mine as Conversation[]) ?? []);
  }, []);

  // ── Auth check ───────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/');
        return;
      }
      setCurrentUserId(user.id);

      const { data: invitations } = await supabase
        .from('chatter_invitations')
        .select('id')
        .eq('chatter_id', user.id)
        .eq('status', 'accepted')
        .limit(1);

      if (!invitations || invitations.length === 0) {
        setIsAuthorized(false);
        setIsLoading(false);
        return;
      }

      setIsAuthorized(true);
      await loadConversations(user.id);
      setIsLoading(false);
    };

    init();
  }, [loadConversations, navigate]);

  const handleClaim = async (conv: Conversation) => {
    if (!currentUserId) return;
    setClaimingId(conv.id);
    try {
      const { error } = await supabase.rpc('claim_conversation', {
        p_conversation_id: conv.id,
      });

      if (error) throw error;

      toast.success('Conversation prise en charge !');
      // Retirer de unclaimed et ajouter à mine
      setUnclaimedConvs((prev) => prev.filter((c) => c.id !== conv.id));
      const claimed = { ...conv, status: 'active' as const, assigned_chatter_id: currentUserId };
      setMyConvs((prev) => [claimed, ...prev]);
      setSelectedConv(claimed);
      setActiveTab('mine');
      setShowMobileList(false);
    } catch (err: any) {
      if (err?.message?.includes('conversation_already_claimed')) {
        toast.error('Cette conversation a déjà été prise en charge');
        setUnclaimedConvs((prev) => prev.filter((c) => c.id !== conv.id));
      } else {
        toast.error(err?.message || 'Impossible de prendre en charge la conversation');
      }
    } finally {
      setClaimingId(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const currentList = activeTab === 'unclaimed' ? unclaimedConvs : myConvs;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Non autorisé ─────────────────────────────────────────────────────────
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-6 p-8 text-center">
        <MessagesSquare className="w-12 h-12 text-muted-foreground/30" />
        <div>
          <h1 className="text-xl font-bold">Accès non autorisé</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Tu n'as pas encore été invité à rejoindre une équipe de chatters.
            Contacte le créateur pour recevoir une invitation.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/')}>
          Retour à l'accueil
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Topbar ─────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-30 border-b border-border/50 bg-card/80 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="/" className="inline-flex items-center flex-shrink-0">
            <img
              src={resolvedTheme === 'light' ? logoBlack : logoWhite}
              alt="Exclu"
              className="h-5 w-auto object-contain"
            />
          </a>

          {/* Tabs */}
          <nav className="flex-1 flex items-center justify-center">
            <div className="relative flex items-center gap-0.5 sm:gap-1 rounded-2xl bg-muted/50 dark:bg-muted/30 p-1">
              {([
                { key: 'unclaimed', label: 'À traiter', icon: Inbox, count: unclaimedConvs.length },
                { key: 'mine',      label: 'Mes convs', icon: UserCheck, count: myConvs.length },
              ] as const).map(({ key, label, icon: Icon, count }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setActiveTab(key); setSelectedConv(null); setShowMobileList(true); }}
                    className="relative z-10"
                  >
                    <motion.div
                      className={`relative z-10 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors duration-200 ${
                        active ? 'text-black dark:text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      whileHover={!active ? { scale: 1.04 } : {}}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="hidden sm:inline">{label}</span>
                      {count > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                          key === 'unclaimed' ? 'bg-yellow-400/20 text-yellow-400' : 'bg-primary/20 text-primary'
                        }`}>
                          {count}
                        </span>
                      )}
                    </motion.div>
                    {active && (
                      <motion.div
                        layoutId="chatter-nav-pill"
                        className="absolute inset-0 rounded-xl bg-background dark:bg-white/10 shadow-sm border border-border/60 dark:border-white/10"
                        transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.8 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          <Button
            variant="outline"
            size="icon"
            className="rounded-full h-8 w-8 border-border/60"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── Main: split-pane ────────────────────────────────────────────── */}
      <div className="pt-16 flex-1 flex overflow-hidden h-[calc(100vh-4rem)]">

        {/* Liste */}
        <div className={`
          flex flex-col border-r border-border bg-card
          w-full md:w-80 lg:w-96 flex-shrink-0 h-full overflow-hidden
          ${showMobileList ? 'flex' : 'hidden md:flex'}
        `}>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <AnimatePresence mode="wait">
              {currentList.length === 0 && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6"
                >
                  {activeTab === 'unclaimed' ? (
                    <>
                      <CheckCircle2 className="w-10 h-10 text-green-400/40" />
                      <p className="text-sm font-medium text-foreground/50">Tout est à jour !</p>
                      <p className="text-xs text-muted-foreground/40">Aucune conversation en attente</p>
                    </>
                  ) : (
                    <>
                      <MessagesSquare className="w-10 h-10 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground/50">Aucune conversation active</p>
                    </>
                  )}
                </motion.div>
              )}

              {currentList.map((conv, i) => {
                const fan = conv.fan;
                const fanName = fan?.display_name || 'Fan';
                const profile = (conv as any).creator_profile;
                const profileName = profile?.display_name || profile?.username || 'Créateur';
                const isSelected = selectedConv?.id === conv.id;
                const isClaiming = claimingId === conv.id;

                return (
                  <motion.div
                    key={conv.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ delay: i * 0.03 }}
                    className={`rounded-xl border p-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-primary/10 border-primary/20'
                        : 'bg-muted/20 border-border hover:border-border/80 hover:bg-muted/40'
                    }`}
                    onClick={() => {
                      if (activeTab === 'mine') {
                        setSelectedConv(conv);
                        setShowMobileList(false);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar fan */}
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-muted border border-border flex-shrink-0">
                        {fan?.avatar_url
                          ? <img src={fan.avatar_url} alt={fanName} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">{fanName.charAt(0)}</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground truncate">{fanName}</p>
                          {activeTab === 'unclaimed' && (
                            <span className="flex items-center gap-1 text-[10px] text-yellow-400 flex-shrink-0">
                              <Clock className="w-3 h-3" />
                              En attente
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground/60 truncate">
                          Profil : @{profileName}
                        </p>
                        {conv.last_message_preview && (
                          <p className="text-xs text-muted-foreground/50 truncate mt-0.5">
                            {conv.last_message_preview}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Bouton Claim */}
                    {activeTab === 'unclaimed' && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs gap-1.5 rounded-lg"
                          disabled={isClaiming}
                          onClick={(e) => { e.stopPropagation(); handleClaim(conv); }}
                        >
                          {isClaiming ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <UserCheck className="w-3 h-3" />
                          )}
                          Prendre en charge
                        </Button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Fenêtre de chat */}
        <div className={`flex-1 flex flex-col overflow-hidden ${
          !showMobileList ? 'flex' : 'hidden md:flex'
        }`}>
          {selectedConv && currentUserId ? (
            <>
              {/* Back button mobile */}
              <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-card flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs h-8 px-2"
                  onClick={() => { setShowMobileList(true); setSelectedConv(null); }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Retour
                </Button>
              </div>
              <ChatWindow
                conversation={selectedConv}
                currentUserId={currentUserId}
                senderType="chatter"
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
              <div className="w-16 h-16 rounded-2xl border border-border bg-muted/30 flex items-center justify-center">
                <MessagesSquare className="w-7 h-7 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground/50">
                {activeTab === 'unclaimed'
                  ? 'Prends en charge une conversation pour commencer'
                  : 'Sélectionne une conversation'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
