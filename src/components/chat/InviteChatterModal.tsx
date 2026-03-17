/**
 * InviteChatterModal
 *
 * Modal permettant au créateur d'inviter un nouveau chatter par email.
 * Appelle l'edge function `send-chatter-invitation`.
 */

import { useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';

interface InviteChatterModalProps {
  profileId: string;
  onClose: () => void;
  onInvited: () => void;
}

export function InviteChatterModal({ profileId, onClose, onInvited }: InviteChatterModalProps) {
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      toast.error('Adresse email invalide');
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-chatter-invitation', {
        body: { profile_id: profileId, to_email: email.trim() },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Erreur lors de l\'envoi');
      }

      toast.success(`Invitation envoyée à ${email}`);
      onInvited();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Impossible d\'envoyer l\'invitation');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Overlay */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          className="relative z-10 w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-6"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Inviter un chatter</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                La personne recevra un email avec un lien d'activation
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Email du chatter
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="chatter@example.com"
                className="h-9 text-sm"
                disabled={isSending}
                autoFocus
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={onClose}
                disabled={isSending}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                className="flex-1 gap-2"
                disabled={!email.trim() || isSending}
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Envoyer l'invitation
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
