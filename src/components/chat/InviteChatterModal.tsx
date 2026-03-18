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
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from 'framer-motion';

interface InviteChatterModalProps {
  profileId: string;
  onClose: () => void;
  onInvited: () => void;
}

export function InviteChatterModal({ profileId, onClose, onInvited }: InviteChatterModalProps) {
  const [email, setEmail] = useState('');
  const [customMessage, setCustomMessage] = useState('');
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
        body: { 
          profile_id: profileId, 
          to_email: email.trim(),
          custom_message: customMessage.trim() || null,
        },
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Email du chatter
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="chatter@example.com"
                className="h-11 bg-primary/10 border-border text-foreground placeholder:text-muted-foreground"
                disabled={isSending}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Message personnalisé (optionnel)
              </label>
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Présentation, guidelines pour gérer les conversations, ton à adopter, etc."
                rows={4}
                maxLength={1000}
                className="min-h-[100px] bg-primary/10 border-border text-foreground placeholder:text-muted-foreground resize-none"
                disabled={isSending}
              />
              <p className="text-xs text-muted-foreground">
                Ce message sera inclus dans l'email d'invitation pour donner du contexte au chatter.
              </p>
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
