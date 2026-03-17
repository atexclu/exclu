/**
 * ChatSettingsPanel
 *
 * Panneau latéral de paramètres du chat créateur :
 *  - Toggle chat_enabled sur le profil actif
 *  - Liste des chatters actifs avec bouton de révocation
 *  - Bouton "Inviter un chatter" → InviteChatterModal
 */

import { useEffect, useState, useCallback } from 'react';
import { UserPlus, X, Loader2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InviteChatterModal } from './InviteChatterModal';

interface ChatterEntry {
  id: string | null;
  invitation_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  accepted_at: string | null;
  status: 'pending' | 'accepted' | 'revoked';
}

interface ChatSettingsPanelProps {
  profileId: string;
  onClose: () => void;
}

export function ChatSettingsPanel({ profileId, onClose }: ChatSettingsPanelProps) {
  const [chatters, setChatters] = useState<ChatterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Charger les chatters via RPC
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
      <div className="flex flex-col h-full bg-card border-l border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Paramètres du chat</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Section chatters */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Chatters ({chatters.filter((c) => c.status === 'accepted').length})
                  </p>
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
