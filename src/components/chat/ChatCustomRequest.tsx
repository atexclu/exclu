/**
 * ChatCustomRequest
 *
 * Inline modal for fans to submit a custom request from the chat interface.
 * Calls the same create-request-checkout edge function as CreatorPublic.
 */

import { useState } from 'react';
import { X, Loader2, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

interface ChatCustomRequestProps {
  profileId: string;
  onClose: () => void;
}

export function ChatCustomRequest({ profileId, onClose }: ChatCustomRequestProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const MIN_AMOUNT_CENTS = 2000;

  const handleSubmit = async () => {
    const amountCents = Math.round(parseFloat(amount || '0') * 100);

    if (amountCents < MIN_AMOUNT_CENTS) {
      toast.error(`Minimum amount is $${(MIN_AMOUNT_CENTS / 100).toFixed(0)}`);
      return;
    }

    if (!description || description.length < 10) {
      toast.error('Please describe your request (at least 10 characters)');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Look up the creator's user_id from the profile_id
      const { data: profileData } = await supabase
        .from('creator_profiles')
        .select('user_id')
        .eq('id', profileId)
        .single();

      const creatorId = profileData?.user_id ?? profileId;

      const { data, error } = await supabase.functions.invoke('create-request-checkout', {
        body: {
          creator_id: creatorId,
          profile_id: profileId,
          description,
          proposed_amount_cents: amountCents,
        },
        headers,
      });

      if (error || !data?.url) {
        throw new Error(data?.error || 'Unable to start checkout');
      }

      window.open(data.url, '_blank');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl border border-border bg-card p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Custom Request</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Describe what you'd like</p>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="I'd love a custom photo of..."
            maxLength={2000}
            rows={3}
            className="text-sm rounded-xl resize-none"
          />
          <p className="text-[10px] text-muted-foreground/50 text-right">{description.length}/2000</p>
        </div>

        {/* Amount */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Your proposed price</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-sm font-medium">$</span>
            <Input
              type="number"
              min={MIN_AMOUNT_CENTS / 100}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`${(MIN_AMOUNT_CENTS / 100).toFixed(0)} min`}
              className="h-10 text-sm rounded-xl pl-7"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/50">
            Minimum: ${(MIN_AMOUNT_CENTS / 100).toFixed(0)} · A 5% processing fee is added at checkout
          </p>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !description || !amount}
          className="w-full h-10 rounded-xl text-sm font-medium"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : null}
          {isSubmitting ? 'Processing…' : 'Send Request'}
        </Button>
      </motion.div>
    </motion.div>
  );
}
