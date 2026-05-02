import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Lock, Star, BadgeCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useTheme } from '@/contexts/ThemeContext';
import logoBlack from '@/assets/logo-black.svg';
import logoWhite from '@/assets/logo-white.svg';

const LAST_SHOWN_KEY = 'exclu_linkme_popup_last_shown';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Module-level flag: prevents ProUpgradePopup from displaying in the same
// page lifecycle when LinkmePopup has just claimed the screen, since both
// fetch the same profile in parallel and the DB write below isn't guaranteed
// to land before the small popup reads the timestamp.
let linkmeShowedThisSession = false;
export const wasLinkmeShownThisSession = () => linkmeShowedThisSession;

type Plan = 'monthly' | 'yearly';

export function LinkmePopup() {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const [plan, setPlan] = useState<Plan>('yearly');
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (checked) return;
    (async () => {
      setChecked(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles')
        .select('subscription_plan, is_creator, linkme_popup_last_shown_at')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile) return;
      if (profile.is_creator === false) return;
      if (profile.subscription_plan !== 'free') return;

      const localLast = Number(localStorage.getItem(LAST_SHOWN_KEY) ?? 0);
      const dbLast = profile.linkme_popup_last_shown_at
        ? new Date(profile.linkme_popup_last_shown_at).getTime()
        : 0;
      const lastShown = Math.max(localLast, dbLast);

      // Show post-signup (never shown) OR weekly thereafter.
      if (lastShown > 0 && Date.now() - lastShown < WEEK_MS) return;

      linkmeShowedThisSession = true;
      setVisible(true);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
      await supabase.from('profiles')
        .update({
          linkme_popup_last_shown_at: now,
          // Suppress the small ProUpgradePopup for the same week to avoid stacking.
          subscription_last_pro_popup_at: now,
        })
        .eq('id', user.id);
    })();
  }, [checked]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible) return null;

  const close = () => setVisible(false);
  const goToCheckout = () => {
    close();
    navigate('/app/settings#payments');
  };

  const logoSrc = resolvedTheme === 'light' ? logoBlack : logoWhite;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={close}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-sm"
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="linkme-popup-title"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-[440px] max-h-[95vh] overflow-y-auto rounded-3xl bg-card text-foreground shadow-2xl px-4 sm:px-6 pt-3 pb-5"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 sm:right-4 sm:top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <img src={logoSrc} alt="Exclu" className="mx-auto block h-8 sm:h-10 w-auto max-w-[70%] mt-1 mb-2.5" />

          <p id="linkme-popup-title" className="text-center text-[15px] sm:text-base font-semibold leading-snug text-foreground mx-1 sm:mx-2 mb-4 sm:mb-5">
            <span className="inline-block rounded-md bg-primary px-2 py-0.5 text-[15px] sm:text-[17px] font-black tracking-tight text-primary-foreground">
              64%
            </span>{' '}
            of your fans will never visit your OnlyFans.{' '}
            <span className="font-extrabold text-foreground">Sell on top of your OnlyFans.</span>
          </p>

          {/* Features card */}
          <div className="mb-3.5 rounded-2xl bg-secondary px-3 sm:px-4 pt-2.5 pb-2">
            <div className="grid grid-cols-[1fr_44px_52px] sm:grid-cols-[1fr_58px_58px] items-center gap-x-1 pb-2 mb-1 border-b border-border/40">
              <div className="text-[18px] sm:text-[22px] font-bold text-muted-foreground">Features</div>
              <div className="text-center text-[15px] sm:text-[18px] font-medium text-muted-foreground">Free</div>
              <div className="text-center text-[15px] sm:text-[18px] font-black tracking-tight">
                <span className="inline-block rounded-md bg-primary px-2 sm:px-2.5 py-0.5 text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.4)]">
                  Pro
                </span>
              </div>
            </div>

            <FeatureRow
              name="#1 Ban-proof Link in Bio"
              desc="Remove Link.me, Beacons & co"
              free={<CheckCell />}
              pro={<CheckCell />}
            />
            <FeatureRow
              name="Sell PPV, customs & Tips"
              desc="Make more with 24/7 link in bio sales, direct tips, gifts and customs."
              free={<CheckCell />}
              pro={<CheckCell />}
            />
            <FeatureRow
              name="Lower creators fees"
              desc="Remove OnlyFans fees"
              free={
                <span className="text-xs sm:text-sm font-bold text-muted-foreground line-through">15%</span>
              }
              pro={
                <span className="inline-block whitespace-nowrap rounded-lg bg-primary px-2 sm:px-2.5 py-1 text-[13px] sm:text-[15px] font-black tracking-tight text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.4)]">
                  0%
                </span>
              }
            />
            <FeatureRow
              isLast
              name="Advanced features"
              desc="AI chat, In-app traffic, domains & more"
              free={<LockCell />}
              pro={<CheckCell />}
            />
          </div>

          {/* Pricing */}
          <div className="mb-3.5 grid grid-cols-2 gap-2 sm:gap-2.5">
            <PriceCard
              selected={plan === 'monthly'}
              onClick={() => setPlan('monthly')}
              badge="Flexible"
              badgeMuted
              title="Monthly"
              oldPrice="$39.99"
            />
            <PriceCard
              selected={plan === 'yearly'}
              onClick={() => setPlan('yearly')}
              badge="Best Offer · Save 55%"
              title="Yearly"
              oldPrice="$239.99"
            />
          </div>

          <button
            type="button"
            onClick={goToCheckout}
            className="mb-3.5 w-full rounded-2xl bg-primary px-4 py-3.5 sm:py-4 text-base sm:text-lg font-bold text-primary-foreground shadow-[0_4px_14px_hsl(var(--primary)/0.45)] transition-transform hover:brightness-95 active:scale-[0.98]"
          >
            Start 3-Day Free Trial
          </button>

          {/* Testimonial */}
          <div className="mb-3.5 rounded-2xl bg-secondary px-3 sm:px-4 pt-3.5 pb-3 text-center">
            <div className="mb-2.5 font-serif text-[clamp(13px,3.8vw,18px)] font-extrabold leading-tight tracking-tight text-foreground">
              "I am now making{' '}
              <span className="inline-block rounded-md bg-primary px-2 py-0.5 font-black tracking-tight text-primary-foreground">
                +$1,432/week
              </span>
              <br />
              on top of OnlyFans"
            </div>
            <div className="mb-2 italic text-[11.5px] leading-snug text-muted-foreground">
              It doesn't replace OnlyFans — it actually attracts more fans and unlocks new monetization opportunities for me.
            </div>
            <div className="inline-flex items-center gap-1 sm:gap-1.5 text-[10.5px] sm:text-[11px] font-semibold text-foreground flex-wrap justify-center">
              <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-card bg-gradient-to-br from-rose-300 to-orange-400 text-white font-serif text-xs font-bold">
                T
              </span>
              <BadgeCheck className="h-3.5 w-3.5 text-foreground" />
              <span>Tory L. · Creator</span>
              <span className="text-muted-foreground">·</span>
              <span className="inline-flex gap-px">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="inline-flex h-3 w-3 items-center justify-center bg-emerald-500 text-white"
                  >
                    <Star className="h-2 w-2 fill-current" />
                  </span>
                ))}
              </span>
              <strong className="font-bold text-foreground">Excellent</strong>
            </div>
          </div>

          <div className="mb-2.5 text-center text-[13px] leading-relaxed text-muted-foreground">
            No payment due now. Cancel anytime.
            <br />
            3-day free trial, then $39.99/month
          </div>

          <button
            type="button"
            onClick={close}
            className="w-full text-center text-[13px] text-muted-foreground underline hover:text-foreground transition-colors py-1.5"
          >
            Restore purchase
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function FeatureRow({
  name,
  desc,
  free,
  pro,
  isLast,
}: {
  name: string;
  desc: string;
  free: React.ReactNode;
  pro: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_44px_52px] sm:grid-cols-[1fr_58px_58px] items-center gap-x-1 py-2.5 ${isLast ? '' : 'border-b border-border/30'}`}
    >
      <div>
        <div className="text-[13.5px] sm:text-[15px] font-bold leading-tight text-foreground">{name}</div>
        <div className="mt-0.5 text-[11px] sm:text-xs text-muted-foreground leading-snug">{desc}</div>
      </div>
      <div className="text-center text-base sm:text-lg">{free}</div>
      <div className="text-center text-base sm:text-lg">{pro}</div>
    </div>
  );
}

function CheckCell() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full">
      <Check className="h-4 w-4 stroke-[3] text-emerald-500" />
    </span>
  );
}

function LockCell() {
  return (
    <span className="inline-block text-muted-foreground/70">
      <Lock className="h-4 w-4" />
    </span>
  );
}

function PriceCard({
  selected,
  onClick,
  badge,
  badgeMuted,
  title,
  oldPrice,
}: {
  selected: boolean;
  onClick: () => void;
  badge: string;
  badgeMuted?: boolean;
  title: string;
  oldPrice: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-2xl bg-secondary px-2 sm:px-2.5 py-3 sm:py-3.5 text-center transition-all border-2 ${
        selected ? 'border-primary' : 'border-transparent'
      }`}
    >
      <span
        className={`mb-2 inline-block max-w-full truncate rounded-full px-2.5 sm:px-3 py-1 text-[10px] sm:text-[11px] font-semibold ${
          badgeMuted && !selected
            ? 'bg-muted text-muted-foreground'
            : 'bg-primary text-primary-foreground'
        }`}
      >
        {badge}
      </span>
      <div
        className={`mb-1.5 text-base sm:text-lg font-extrabold ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {title}
      </div>
      <div className="text-xs sm:text-sm font-bold flex flex-wrap items-center justify-center gap-1">
        <span
          className={`line-through ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {oldPrice}
        </span>
        <span className="inline-block rounded bg-amber-300 px-1.5 py-0.5 text-[12px] sm:text-[13px] font-black text-black">
          FREE
        </span>
      </div>
    </button>
  );
}
