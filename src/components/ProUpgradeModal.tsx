import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Lock, Zap, ArrowRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoWhite from '@/assets/logo-white.svg';

interface ProUpgradeModalProps {
  onClose: () => void;
}

const TIER_FREE = {
  name: 'Free',
  priceMonthly: 0,
  priceYearly: 0,
  badge: null,
  features: [
    { label: 'Link-in-Bio', description: 'Your personal landing page', included: true },
    { label: 'PPV & Tips', description: 'Sell content directly', included: true },
    { label: 'Chat & Wishlist', description: 'Engage with fans', included: true },
    { label: 'Basic Analytics', description: 'Views & clicks', included: true },
    { label: '1 Profile', description: 'One creator page', included: true },
    { label: 'Platform Fees', description: 'Standard fees apply', included: false },
  ],
};

const TIER_PRO = {
  name: 'Pro',
  priceMonthly: 19,
  priceYearly: 190,
  badge: null,
  features: [
    { label: 'Everything in Free', description: '', included: true },
    { label: 'Advanced Analytics', description: 'Revenue, retention, demographics', included: true },
    { label: 'Custom Domain', description: 'yourname.com', included: true },
    { label: 'Remove Exclu Branding', description: 'White-label experience', included: true },
    { label: '5 Profiles', description: 'Manage multiple creators', included: true },
    { label: 'Priority Support', description: 'Skip the queue', included: true },
    { label: 'Platform Fees', description: 'Standard fees apply', included: false },
  ],
};

const TIER_CREATOR = {
  name: 'Creator',
  priceMonthly: 59,
  priceYearly: 590,
  badge: 'BEST VALUE',
  badgeColor: 'bg-emerald-500',
  highlightBorder: 'border-emerald-500/50',
  highlightBg: 'from-emerald-500/10 to-transparent',
  features: [
    { label: 'Everything in Pro', description: '', included: true },
    { label: '0% Platform Fees', description: 'Keep 100% of your earnings', included: true },
    { label: 'Unlimited Profiles', description: 'Manage all your creators', included: true },
    { label: 'Early Access', description: 'New features first', included: true },
    { label: 'Creator Dashboard', description: 'Revenue & payout management', included: true },
    { label: 'White-label App', description: 'Your own branded app', included: true },
  ],
};

const ALL_TIERS = [TIER_FREE, TIER_PRO, TIER_CREATOR];

export function ProUpgradeModal({ onClose }: ProUpgradeModalProps) {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  const [selectedTier, setSelectedTier] = useState<string>(TIER_PRO.name);

  const getPrice = (tier: typeof TIER_FREE) =>
    billing === 'monthly' ? tier.priceMonthly : tier.priceYearly;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', duration: 0.4 }}
          className="relative w-full max-w-2xl rounded-2xl bg-[#0D0D14] border border-white/10 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors z-10"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="px-6 pt-6 pb-4 text-center">
            <img
              src={logoWhite}
              alt="Exclu"
              className="h-8 w-auto object-contain mx-auto mb-3"
            />
            <h2 className="text-xl font-bold text-white mb-1">Choose your plan</h2>
            <p className="text-sm text-white/50">Start free, upgrade when you're ready</p>
          </div>

          {/* Billing toggle */}
          <div className="px-6 pb-4">
            <div className="flex items-center gap-2 p-1 rounded-full bg-white/5 w-fit mx-auto">
              <button
                type="button"
                onClick={() => setBilling('monthly')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billing === 'monthly' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling('yearly')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all relative ${
                  billing === 'yearly' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                Yearly
                <span className="absolute -top-2 right-0 px-1.5 py-0.5 rounded-full bg-yellow-400 text-black text-[9px] font-bold">
                  SAVE 20%
                </span>
              </button>
            </div>
          </div>

          {/* Tier cards */}
          <div className="px-6 pb-4">
            <div className="grid grid-cols-3 gap-3">
              {ALL_TIERS.map((tier) => {
                const price = getPrice(tier);
                const isSelected = selectedTier === tier.name;
                const isFree = tier.priceMonthly === 0;

                return (
                  <button
                    key={tier.name}
                    type="button"
                    onClick={() => setSelectedTier(tier.name)}
                    className={`relative flex flex-col rounded-xl p-4 text-left transition-all border ${
                      isSelected
                        ? `border-[#E11D6E] bg-gradient-to-b from-[#E11D6E]/20 to-transparent ${tier.highlightBorder ? '' : ''}`
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    } ${(tier as typeof TIER_CREATOR).highlightBorder ? (tier as typeof TIER_CREATOR).highlightBorder : ''}`}
                  >
                    {/* Badge */}
                    {(tier as typeof TIER_CREATOR).badge && (
                      <div className={`absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-bold text-white ${(tier as typeof TIER_CREATOR).badgeColor}`}>
                        {(tier as typeof TIER_CREATOR).badge}
                      </div>
                    )}

                    <p className="text-sm font-bold text-white mb-1">{tier.name}</p>

                    <div className="mb-3">
                      {isFree ? (
                        <span className="text-lg font-bold text-white">Free</span>
                      ) : (
                        <>
                          <span className="text-lg font-bold text-white">${price}</span>
                          <span className="text-white/40 text-xs">/{billing === 'monthly' ? 'mo' : 'yr'}</span>
                        </>
                      )}
                    </div>

                    {/* Features mini-list */}
                    <div className="space-y-1.5">
                      {tier.features.slice(0, 5).map((f) => (
                        <div key={f.label} className="flex items-start gap-1.5">
                          {f.included ? (
                            <Check className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                          ) : (
                            <Lock className="w-3 h-3 text-white/20 flex-shrink-0 mt-0.5" />
                          )}
                          <span className={`text-[11px] leading-tight ${f.included ? 'text-white/70' : 'text-white/20'}`}>
                            {f.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {isSelected && (
                      <div className="absolute bottom-3 left-4 right-4">
                        <div className="w-2 h-2 rounded-full bg-[#E11D6E] mx-auto" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected tier CTA */}
          <div className="px-6 pb-6">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-white">{selectedTier === 'Free' ? 'Free' : `${selectedTier} — $${getPrice(ALL_TIERS.find(t => t.name === selectedTier)! as typeof TIER_PRO)}/${billing === 'monthly' ? 'mo' : 'yr'}`}</p>
                  {selectedTier === 'Free' && (
                    <p className="text-xs text-white/40 mt-0.5">No credit card needed</p>
                  )}
                  {selectedTier === 'Pro' && (
                    <p className="text-xs text-white/40 mt-0.5">Billed {billing}</p>
                  )}
                  {selectedTier === 'Creator' && (
                    <p className="text-xs text-emerald-400 mt-0.5">0% platform fees included</p>
                  )}
                </div>
                {selectedTier !== 'Free' && (
                  <div className="text-right">
                    <p className="text-xs text-white/40 line-through">${billing === 'monthly' ? 49 : 490}/mo</p>
                    <p className="text-xs text-emerald-400">You save ${billing === 'monthly' ? 30 : 300}/yr</p>
                  </div>
                )}
              </div>

              <Button
                variant={selectedTier === 'Free' ? 'outline' : 'hero'}
                className={`w-full rounded-xl font-semibold ${selectedTier === 'Free' ? 'border-white/20 text-white/60' : ''}`}
                onClick={() => {
                  if (selectedTier === 'Free') { onClose(); return; }
                  alert(`${selectedTier} plan — Stripe checkout coming soon!`);
                }}
              >
                {selectedTier === 'Free'
                  ? 'Continue Free'
                  : selectedTier === 'Creator'
                  ? <>Start 7-Day Free Trial <ArrowRight className="w-4 h-4 ml-2" /></>
                  : <>Get {selectedTier} <ArrowRight className="w-4 h-4 ml-2" /></>
                }
              </Button>

              {selectedTier !== 'Free' && (
                <p className="text-center text-[10px] text-white/30 mt-2">
                  No credit card required • Cancel anytime
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

const STORAGE_KEY = 'exclu_pro_modal_shown';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldShowProModal(): boolean {
  try {
    const lastShown = localStorage.getItem(STORAGE_KEY);
    if (!lastShown) return true;
    const elapsed = Date.now() - parseInt(lastShown, 10);
    return elapsed > WEEK_MS;
  } catch {
    return true;
  }
}

export function markProModalShown(): void {
  try {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  } catch {}
}
