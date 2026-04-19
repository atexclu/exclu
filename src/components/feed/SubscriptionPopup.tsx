import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface SubscriptionPopupProps {
  open: boolean;
  onClose: () => void;
  creator: {
    profileId: string;
    displayName: string;
    handle: string;
    avatarUrl: string | null;
    priceCents: number;
  };
  gradientStops: [string, string];
}

/**
 * "Discover all [Name]'s exclusive contents" modal.
 *
 * Flow on Subscribe:
 *  1. If no session → redirect to /fan/signup with redirect_sub=1 so the user
 *     lands back on the creator profile after signup.
 *  2. Else invoke `create-fan-subscription-checkout` which returns QuickPay
 *     form fields; we POST them via a dynamically-created form (same pattern
 *     used across link/tip/gift checkouts in the codebase).
 *  3. On `alreadySubscribed: true`, simply toast + close.
 */
export function SubscriptionPopup({ open, onClose, creator, gradientStops }: SubscriptionPopupProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // We preserve the creator handle so FanSignup can deep-link back and
        // optionally auto-reopen this popup after the first session.
        navigate(`/fan/signup?creator=${encodeURIComponent(creator.handle)}&redirect_sub=1`);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-fan-subscription-checkout', {
        body: { creator_profile_id: creator.profileId },
      });

      if (error) {
        console.error('create-fan-subscription-checkout error', error);
        toast.error('Unable to start checkout. Please try again later.');
        return;
      }

      if (data?.alreadySubscribed) {
        toast.success('You already subscribe to this creator');
        onClose();
        return;
      }

      if (!data?.fields) {
        toast.error('Unable to reach the payment processor');
        return;
      }

      // Build a form and POST to QuickPay. We cannot use `supabase.functions.invoke`
      // to follow the redirect (that would require server-side fetch semantics the
      // hosted checkout doesn't support), so we submit from the browser.
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://quickpay.ugpayments.ch/';
      form.style.display = 'none';
      for (const [name, value] of Object.entries(data.fields as Record<string, string>)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black p-6 text-white"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div
                className="w-20 h-20 rounded-full overflow-hidden border-2 mb-4"
                style={{ borderColor: gradientStops[0] }}
              >
                {creator.avatarUrl ? (
                  <img src={creator.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/10 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-white/60" />
                  </div>
                )}
              </div>

              <h2 className="text-lg font-bold mb-1">
                Discover all {creator.displayName}'s exclusive contents
              </h2>
              {creator.handle && <p className="text-sm text-white/60 mb-6">@{creator.handle}</p>}

              <div className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 mb-6">
                <div className="flex items-baseline justify-center gap-1 mb-1">
                  <span
                    className="text-3xl font-extrabold bg-clip-text text-transparent"
                    style={{ backgroundImage: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
                  >
                    ${(creator.priceCents / 100).toFixed(2)}
                  </span>
                  <span className="text-sm text-white/60">/ month</span>
                </div>
                <p className="text-[11px] text-white/50">Cancel anytime — access stays until the end of the period.</p>
              </div>

              <button
                type="button"
                onClick={handleSubscribe}
                disabled={isSubmitting}
                className="w-full h-12 rounded-full text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 inline-flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Subscribe for ${(creator.priceCents / 100).toFixed(2)}/mo
              </button>

              <p className="text-[11px] text-white/40 mt-3">
                Paid links still need to be purchased individually. This unlocks the feed.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
