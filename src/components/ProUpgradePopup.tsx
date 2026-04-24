import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';

const LAST_SHOWN_KEY = 'exclu_pro_popup_last_shown';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function ProUpgradePopup() {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (checked) return;
    (async () => {
      setChecked(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles')
        .select('subscription_plan, subscription_last_pro_popup_at')
        .eq('id', user.id)
        .maybeSingle();
      if (!profile || profile.subscription_plan !== 'free') return;

      const localLast = Number(localStorage.getItem(LAST_SHOWN_KEY) ?? 0);
      const dbLast = profile.subscription_last_pro_popup_at
        ? new Date(profile.subscription_last_pro_popup_at).getTime()
        : 0;
      const lastShown = Math.max(localLast, dbLast);
      if (Date.now() - lastShown < WEEK_MS) return;

      setVisible(true);
      localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
      await supabase.from('profiles')
        .update({ subscription_last_pro_popup_at: new Date().toISOString() })
        .eq('id', user.id);
    })();
  }, [checked]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-primary/40 bg-card p-5 shadow-glow-strong"
      >
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="text-[11px] uppercase tracking-widest font-semibold">Keep 100% of sales</span>
        </div>
        <h4 className="mt-2 text-lg font-bold text-foreground">Go Pro today</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          From $39.99/month. Zero commission on every sale — pays for itself after $267 of monthly revenue.
        </p>
        <Button
          type="button"
          variant="hero"
          className="mt-4 w-full"
          onClick={() => { setVisible(false); navigate('/pricing'); }}
        >
          See plans
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}
