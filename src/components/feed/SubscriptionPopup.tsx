import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { CountrySelect } from '@/components/checkout/CountrySelect';
import { getGeoCountry } from '@/lib/ipGeo';

interface SubscriptionPopupProps {
  open: boolean;
  onClose: () => void;
  creator: {
    profileId: string;
    displayName: string;
    handle: string;
    avatarUrl: string | null;
  };
  gradientStops: [string, string];
}

/**
 * "Discover all [Name]'s exclusive contents" modal.
 *
 * Flow on Subscribe:
 *  1. If no session → redirect to /fan/signup with redirect_sub=1 so the user
 *     lands back on the creator profile after signup.
 *  2. We require a billing country before starting checkout so we can route
 *     the payment through the correct MID (US_2D for US/CA, INTL_3D otherwise).
 *     Prefill order: profiles.billing_country → profiles.country → IP geo.
 *  3. Invoke `create-fan-subscription-checkout` which returns QuickPay form
 *     fields; we POST them via a dynamically-created form (same pattern used
 *     across link/tip/gift checkouts in the codebase).
 *  4. On `alreadySubscribed: true`, simply toast + close.
 */
export function SubscriptionPopup({ open, onClose, creator, gradientStops }: SubscriptionPopupProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [profileCountryLoaded, setProfileCountryLoaded] = useState(false);
  // Live price fetched the moment the popup opens — the only source of truth
  // we trust for the displayed amount. Stays `null` (loading skeleton) until
  // the SELECT returns so the user never sees a stale fallback price flash
  // before the real one. Note: the actual charge is set server-side by
  // create-fan-subscription-checkout reading creator_profiles directly, so
  // tampering with this state in DevTools cannot lower the amount charged.
  // This is the creator's chosen base price; the fan is charged base + 15%
  // processing fee at checkout (and on every renewal).
  const [livePriceCents, setLivePriceCents] = useState<number | null>(null);
  const fanTotalCents = livePriceCents === null
    ? null
    : livePriceCents + Math.round(livePriceCents * 0.15);

  // Prefill country on open: profiles table first, then IP geo as fallback.
  // Also re-fetch the creator's live fan-sub price so the modal never
  // displays a stale amount.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    // Reset to the loading state every time the popup opens so a previous
    // creator's price doesn't flash before the new one is fetched.
    setLivePriceCents(null);

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setProfileCountryLoaded(true); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('billing_country, country')
        .eq('id', user.id)
        .maybeSingle();
      const profileCountry = (profile?.billing_country ?? profile?.country ?? null) as string | null;
      if (cancelled) return;
      if (profileCountry) setCountry(profileCountry);
      setProfileCountryLoaded(true);
    })();

    (async () => {
      const { data } = await supabase
        .from('creator_profiles')
        .select('fan_subscription_price_cents')
        .eq('id', creator.profileId)
        .maybeSingle();
      if (cancelled) return;
      const fresh = data?.fan_subscription_price_cents;
      if (typeof fresh === 'number' && fresh > 0) {
        setLivePriceCents(fresh);
      }
    })();

    getGeoCountry().then((c) => {
      if (!cancelled && c) setDetectedCountry(c);
    });

    return () => { cancelled = true; };
  }, [open, creator.profileId]);

  const handleSubscribe = async () => {
    if (!country) {
      toast.error('Please select your billing country');
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate(`/fan/signup?creator=${encodeURIComponent(creator.handle)}&redirect_sub=1`);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-fan-subscription-checkout', {
        body: { creator_profile_id: creator.profileId, country },
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
                Discover all {creator.displayName}&apos;s exclusive contents
              </h2>
              {creator.handle && <p className="text-sm text-white/60 mb-6">@{creator.handle}</p>}

              <div className="w-full rounded-2xl bg-white/5 border border-white/10 p-4 mb-4">
                <div className="flex items-baseline justify-center gap-1 mb-1 min-h-[36px]">
                  {fanTotalCents === null ? (
                    <span className="inline-block h-7 w-20 rounded-md bg-white/10 animate-pulse" />
                  ) : (
                    <>
                      <span
                        className="text-3xl font-extrabold bg-clip-text text-transparent"
                        style={{ backgroundImage: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
                      >
                        ${(fanTotalCents / 100).toFixed(2)}
                      </span>
                      <span className="text-sm text-white/60">/ month</span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-white/50">Includes 15% processing fee. Cancel anytime — access stays until the end of the period.</p>
              </div>

              <div className="w-full text-left mb-4">
                <label htmlFor="sub-popup-country" className="text-[10px] uppercase tracking-[0.22em] text-white/60 block mb-1.5">
                  Billing country <span className="text-red-400">*</span>
                </label>
                <CountrySelect
                  id="sub-popup-country"
                  value={country}
                  autoDetectedCountry={detectedCountry}
                  onChange={setCountry}
                  required
                  placeholder={profileCountryLoaded ? 'Select your country' : 'Loading…'}
                />
                <p className="text-[10px] text-white/40 mt-1.5">
                  We route your payment through the correct card network for your bank.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSubscribe}
                disabled={isSubmitting || !country || fanTotalCents === null}
                className="w-full h-12 rounded-full text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 inline-flex items-center justify-center gap-2"
                style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
              >
                {isSubmitting || fanTotalCents === null ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {fanTotalCents === null ? 'Loading…' : `Subscribe for $${(fanTotalCents / 100).toFixed(2)}/mo`}
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
