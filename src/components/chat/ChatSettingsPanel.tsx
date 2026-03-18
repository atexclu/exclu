/**
 * ChatSettingsPanel
 *
 * Panneau latéral de paramètres du chat créateur :
 *  - Toggle chat_enabled sur le profil actif
 *  - Liste des chatters actifs avec bouton de révocation
 *  - Bouton "Inviter un chatter" → InviteChatterModal
 */

import { useEffect, useState, useCallback } from 'react';
import { UserPlus, X, Loader2, Users, ArrowLeft, Info, Check, XCircle, Eye, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InviteChatterModal } from './InviteChatterModal';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ChatterEntry {
  id: string | null;
  invitation_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  accepted_at: string | null;
  status: 'pending' | 'accepted' | 'revoked';
}

interface ChatterRequest {
  id: string;
  chatter_id: string;
  message: string | null;
  status: string;
  created_at: string;
  chatter_display_name: string | null;
  chatter_email: string | null;
  chatter_avatar_url: string | null;
}

interface ChatSettingsPanelProps {
  profileId: string;
  onClose: () => void;
}

const SUPABASE_FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export function ChatSettingsPanel({ profileId, onClose }: ChatSettingsPanelProps) {
  const [chatters, setChatters] = useState<ChatterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [seekingChatters, setSeekingChatters] = useState(false);
  const [seekingToggling, setSeekingToggling] = useState(false);
  const [chatterRequests, setChatterRequests] = useState<ChatterRequest[]>([]);
  const [handlingRequestId, setHandlingRequestId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load chatters via RPC
      const { data: chattersData } = await supabase.rpc('get_profile_chatters', {
        p_profile_id: profileId,
      });

      if (chattersData) {
        setChatters(
          chattersData.map((c: any) => ({
            id: c.chatter_id ?? null,
            invitation_id: c.invitation_id,
            email: c.email,
            display_name: c.display_name ?? null,
            avatar_url: c.avatar_url ?? null,
            accepted_at: c.accepted_at ?? null,
            status: c.status ?? 'pending',
          }))
        );
      }

      // Load seeking_chatters status
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('seeking_chatters')
          .eq('id', user.id)
          .single();
        if (profileData) {
          setSeekingChatters(profileData.seeking_chatters ?? false);
        }

        // Load pending chatter requests
        const { data: requests } = await supabase
          .from('chatter_requests')
          .select('id, chatter_id, message, status, created_at')
          .eq('creator_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (requests && requests.length > 0) {
          // Fetch chatter profiles
          const chatterIds = requests.map((r: any) => r.chatter_id);
          const { data: chatterProfiles } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, email')
            .in('id', chatterIds);

          const profileMap = new Map<string, any>();
          (chatterProfiles ?? []).forEach((p: any) => profileMap.set(p.id, p));

          setChatterRequests(
            requests.map((r: any) => {
              const cp = profileMap.get(r.chatter_id);
              return {
                ...r,
                chatter_display_name: cp?.display_name ?? null,
                chatter_email: cp?.email ?? null,
                chatter_avatar_url: cp?.avatar_url ?? null,
              };
            })
          );
        } else {
          setChatterRequests([]);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRevoke = async (chatter: ChatterEntry) => {
    setRevokingId(chatter.invitation_id);
    try {
      if (chatter.id && chatter.status === 'accepted') {
        const { error } = await supabase.rpc('revoke_chatter_access', {
          p_profile_id: profileId,
          p_chatter_id: chatter.id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('chatter_invitations')
          .update({ status: 'revoked' })
          .eq('id', chatter.invitation_id);
        if (error) throw error;
      }
      toast.success('Accès chatter révoqué');
      setChatters((prev) => prev.filter((c) => c.invitation_id !== chatter.invitation_id));
    } catch {
      toast.error('Erreur lors de la révocation');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col h-full bg-card">
        {/* Header with back button */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Conversations
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Contracts visibility toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {seekingChatters ? (
                      <Eye className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Contracts visibility
                    </p>
                  </div>
                  <Switch
                    checked={seekingChatters}
                    disabled={seekingToggling}
                    onCheckedChange={async (checked) => {
                      setSeekingToggling(true);
                      try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) return;
                        const { error } = await supabase
                          .from('profiles')
                          .update({ seeking_chatters: checked })
                          .eq('id', user.id);
                        if (error) throw error;
                        setSeekingChatters(checked);
                        toast.success(checked ? 'Visible on Contracts marketplace' : 'Hidden from Contracts marketplace');
                      } catch {
                        toast.error('Failed to update visibility');
                      } finally {
                        setSeekingToggling(false);
                      }
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  {seekingChatters
                    ? 'Chatters can discover your profile and request to manage your conversations.'
                    : 'Enable to appear on the Contracts marketplace where chatters can find you.'}
                </p>
              </div>

              {/* Pending chatter requests */}
              {chatterRequests.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Pending requests ({chatterRequests.length})
                  </p>
                  {chatterRequests.map((req) => {
                    const name = req.chatter_display_name || req.chatter_email || 'Unknown';
                    const initial = name.charAt(0).toUpperCase();
                    const isHandling = handlingRequestId === req.id;

                    return (
                      <div
                        key={req.id}
                        className="rounded-xl border border-border bg-muted/20 p-3 space-y-2"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-muted border border-border flex-shrink-0">
                            {req.chatter_avatar_url ? (
                              <img src={req.chatter_avatar_url} alt={name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                                {initial}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{name}</p>
                            <p className="text-[10px] text-muted-foreground/60">
                              {new Date(req.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        {req.message && (
                          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-2 whitespace-pre-wrap">
                            {req.message}
                          </p>
                        )}

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="hero"
                            className="h-7 text-xs gap-1 rounded-lg flex-1"
                            disabled={isHandling}
                            onClick={async () => {
                              setHandlingRequestId(req.id);
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                if (!session?.access_token) throw new Error('Not authenticated');
                                const resp = await fetch(`${SUPABASE_FUNCTIONS_URL}/handle-chatter-request`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${session.access_token}`,
                                  },
                                  body: JSON.stringify({ action: 'accept', request_id: req.id }),
                                });
                                const result = await resp.json();
                                if (!resp.ok) throw new Error(result.error || 'Failed');
                                toast.success('Request accepted! Chatter has been granted access.');
                                setChatterRequests((prev) => prev.filter((r) => r.id !== req.id));
                                loadData();
                              } catch (err: any) {
                                toast.error(err?.message || 'Failed to accept request');
                              } finally {
                                setHandlingRequestId(null);
                              }
                            }}
                          >
                            {isHandling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 rounded-lg flex-1 text-red-400 hover:text-red-300 border-red-400/30 hover:border-red-400/50"
                            disabled={isHandling}
                            onClick={async () => {
                              setHandlingRequestId(req.id);
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                if (!session?.access_token) throw new Error('Not authenticated');
                                const resp = await fetch(`${SUPABASE_FUNCTIONS_URL}/handle-chatter-request`, {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${session.access_token}`,
                                  },
                                  body: JSON.stringify({ action: 'reject', request_id: req.id }),
                                });
                                const result = await resp.json();
                                if (!resp.ok) throw new Error(result.error || 'Failed');
                                toast.success('Request declined.');
                                setChatterRequests((prev) => prev.filter((r) => r.id !== req.id));
                              } catch (err: any) {
                                toast.error(err?.message || 'Failed to reject request');
                              } finally {
                                setHandlingRequestId(null);
                              }
                            }}
                          >
                            <XCircle className="w-3 h-3" />
                            Decline
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Section chatters */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Chatters ({chatters.filter((c) => c.status === 'accepted').length})
                    </p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          aria-label="Information sur les chatters"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80 p-4 bg-card border-border" align="start">
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1">À quoi servent les chatters ?</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Les chatters sont des membres de votre équipe qui peuvent gérer vos conversations avec les fans à votre place.
                            </p>
                          </div>
                          
                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1.5">Comment inviter un chatter</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              Cliquez sur "Inviter", entrez l'email du chatter et ajoutez un message personnalisé avec vos guidelines (ton à adopter, règles de conversation, etc.). Le chatter recevra un email d'invitation.
                            </p>
                          </div>

                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1.5">Accès du chatter</h4>
                            <ul className="text-xs text-muted-foreground space-y-1">
                              <li className="flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                <span>Gérer toutes les conversations en temps réel</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                <span>Envoyer des liens de contenu payant</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                <span>Taguer et organiser les fans</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                <span>Accéder à votre bibliothèque de contenu</span>
                              </li>
                            </ul>
                          </div>

                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-1.5">Répartition des paiements</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed mb-1.5">
                              Sur chaque vente de contenu générée par un chatter via le chat, une commission de 40% s'applique :
                            </p>
                            <ul className="text-xs text-muted-foreground space-y-1">
                              <li className="flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                <span><strong className="text-foreground">60%</strong> pour vous (créateur)</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                <span><strong className="text-foreground">25%</strong> pour le chatter</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                <span><strong className="text-foreground">15%</strong> pour Exclu</span>
                              </li>
                            </ul>
                            <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-relaxed">
                              +5% de frais de traitement à la charge du fan. Les ventes que vous réalisez vous-même ne sont pas soumises à cette commission.
                            </p>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5 rounded-lg"
                    onClick={() => setShowInviteModal(true)}
                  >
                    <UserPlus className="w-3 h-3" />
                    Inviter
                  </Button>
                </div>

                {chatters.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
                    <p className="text-xs text-muted-foreground/60">
                      Aucun chatter. Invites-en un pour déléguer les réponses.
                    </p>
                  </div>
                )}

                {chatters.map((chatter) => {
                  const name = chatter.display_name || chatter.email;
                  const initial = name.charAt(0).toUpperCase();
                  const isPending = chatter.status === 'pending';

                  return (
                    <div
                      key={chatter.invitation_id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/20"
                    >
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-muted border border-border flex-shrink-0">
                        {chatter.avatar_url ? (
                          <img src={chatter.avatar_url} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                            {initial}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{name}</p>
                        <p className="text-[10px] text-muted-foreground/60">
                          {isPending ? '⏳ Invitation en attente' : '✓ Actif'}
                        </p>
                      </div>

                      {/* Révoquer */}
                      {chatter.status !== 'revoked' && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(chatter)}
                          disabled={revokingId === chatter.invitation_id}
                          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Révoquer l'accès"
                        >
                          {revokingId === chatter.invitation_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <X className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {showInviteModal && (
        <InviteChatterModal
          profileId={profileId}
          onClose={() => setShowInviteModal(false)}
          onInvited={() => loadData()}
        />
      )}
    </>
  );
}
