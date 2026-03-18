/**
 * ChatTipForm
 *
 * Inline modal for fans to send a tip from the chat interface.
 * Calls the same create-tip-checkout edge function as CreatorPublic.
 */

import { useState } from 'react';
import { X, Loader2, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

interface ChatTipFormProps {
  profileId: string;
  creatorName: string;
  onClose: () => void;
}

const TIP_PRESETS = [500, 1000, 2500, 5000];
const MIN_TIP_CENTS = 500;

export function ChatTipForm({ profileId, creatorName, onClose }: ChatTipFormProps) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const finalAmount = selectedPreset || Math.round(parseFloat(customAmount || '0') * 100);

    if (finalAmount < MIN_TIP_CENTS) {
      toast.error(`Minimum tip is $${(MIN_TIP_CENTS / 100).toFixed(2)}`);
      return;
    }

    if (finalAmount > 50000) {
      toast.error('Maximum tip is $500.00');
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

      const { data, error } = await supabase.functions.invoke('create-tip-checkout', {
        body: {
          creator_id: creatorId,
          profile_id: profileId,
          amount_cents: finalAmount,
          message: message || null,
          is_anonymous: anonymous,
        },
        headers,
      });

      if (error || !data?.url) {
        throw new Error(data?.error || 'Unable to start checkout');
      }

      window.open(data.url, '_blank');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process tip');
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
        className="w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl border border-white/10 bg-black/95 backdrop-blur-xl p-5 space-y-4 shadow-2xl overflow-y-auto max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#CFFF16]/15 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-[#CFFF16]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Send a Tip</h3>
              <p className="text-[10px] text-white/40">to {creatorName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>

        {/* Preset amounts */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-white/60">Choose an amount</label>
          <div className="grid grid-cols-4 gap-2">
            {TIP_PRESETS.map((cents) => (
              <button
                key={cents}
                type="button"
                onClick={() => { setSelectedPreset(cents); setCustomAmount(''); }}
                className={`h-10 rounded-xl text-sm font-bold transition-all ${
                  selectedPreset === cents
                    ? 'bg-[#CFFF16] text-black ring-2 ring-[#CFFF16]/40'
                    : 'bg-white/10 text-white/80 hover:bg-white/15'
                }`}
              >
                ${cents / 100}
              </button>
            ))}
          </div>
        </div>

        {/* Custom amount */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-white/60">Or enter a custom amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-medium">$</span>
            <Input
              type="number"
              min={MIN_TIP_CENTS / 100}
              step="0.01"
              value={customAmount}
              onChange={(e) => { setCustomAmount(e.target.value); setSelectedPreset(null); }}
              placeholder={`${(MIN_TIP_CENTS / 100).toFixed(2)} min`}
              className="h-10 text-sm rounded-xl pl-7 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#CFFF16]/50"
            />
          </div>
        </div>

        {/* Message */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-white/60">Message (optional)</label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Say something nice..."
            maxLength={500}
            rows={2}
            className="text-sm rounded-xl resize-none bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#CFFF16]/50"
          />
        </div>

        {/* Anonymous toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
              anonymous ? 'bg-white/20 border-white/40' : 'border-white/20'
            }`}
            onClick={() => setAnonymous(!anonymous)}
          >
            {anonymous && <span className="text-white text-xs font-bold">✓</span>}
          </div>
          <span className="text-sm text-white/70">Stay anonymous</span>
        </label>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || (!selectedPreset && !customAmount)}
          className="w-full h-10 rounded-xl text-sm font-bold text-black bg-[#CFFF16] hover:bg-[#d8ff4d] transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <DollarSign className="w-4 h-4" />
              Send Tip — ${selectedPreset ? (selectedPreset / 100).toFixed(2) : customAmount || '0.00'}
            </>
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}
