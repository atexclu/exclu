import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useProfiles } from '@/contexts/ProfileContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Link2, ShoppingCart, Instagram, X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  done: boolean;
  icon: React.ReactNode;
  href?: string;
}

const ActivationChecklist = () => {
  const { activeProfile } = useProfiles();
  const [steps, setSteps] = useState<ChecklistStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const loadChecklist = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const profileId = activeProfile?.id ?? null;

      // Step 1: Instagram link added — check creator_profiles.instagram_verified or instagram_link_added
      const { data: cp } = await supabase
        .from('creator_profiles')
        .select('instagram_verified')
        .eq('user_id', user.id)
        .maybeSingle();

      const instagramDone = Boolean(cp?.instagram_verified);

      // Step 2: At least one published link
      let linksQuery = supabase
        .from('links')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .eq('status', 'published');
      if (profileId) linksQuery = linksQuery.eq('profile_id', profileId);
      const { count: linksCount } = await linksQuery;
      const hasLink = (linksCount ?? 0) > 0;

      // Step 3: At least one sale
      // Check if any link by this creator has purchases
      const { data: creatorLinks } = await supabase
        .from('links')
        .select('id')
        .eq('creator_id', user.id)
        .limit(100);

      let hasSale = false;
      if (creatorLinks && creatorLinks.length > 0) {
        const linkIds = creatorLinks.map((l) => l.id);
        const { count: salesCount } = await supabase
          .from('purchases')
          .select('id', { count: 'exact', head: true })
          .in('link_id', linkIds)
          .eq('status', 'succeeded');
        hasSale = (salesCount ?? 0) > 0;
      }

      setSteps([
        {
          id: 'link_in_bio',
          label: 'Add your link in bio',
          description: 'Share your Exclu link on Instagram',
          done: instagramDone,
          icon: <Instagram className="w-4 h-4" />,
        },
        {
          id: 'first_link',
          label: 'Create your first payment link',
          description: 'Upload content and set a price',
          done: hasLink,
          icon: <Link2 className="w-4 h-4" />,
          href: '/app/links/create',
        },
        {
          id: 'first_sale',
          label: 'Sell your first payment link',
          description: 'Share your link and get your first sale',
          done: hasSale,
          icon: <ShoppingCart className="w-4 h-4" />,
        },
      ]);

      setIsLoading(false);
    };

    loadChecklist();
  }, [activeProfile?.id]);

  if (isLoading || dismissed) return null;

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  if (allDone) return null;

  const progressPct = (completedCount / steps.length) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="relative rounded-2xl border border-exclu-arsenic/60 bg-gradient-to-br from-exclu-ink via-exclu-ink/95 to-primary/5 p-5 shadow-lg shadow-black/20"
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-exclu-space/40 hover:text-exclu-space transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="mb-4">
        <h3 className="text-sm font-bold text-exclu-cloud">Activation checklist for Exclu</h3>
        <p className="text-[11px] text-exclu-space/70 mt-0.5">
          {completedCount}/{steps.length} steps to earn more
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-exclu-arsenic/40 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-lime-400"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => {
          const Wrapper = step.href && !step.done ? Link : 'div';
          const wrapperProps = step.href && !step.done ? { to: step.href } : {};

          return (
            <Wrapper
              key={step.id}
              {...(wrapperProps as any)}
              className={`flex items-center gap-3 rounded-xl p-3 transition-all ${
                step.done
                  ? 'bg-primary/5 border border-primary/20'
                  : 'bg-exclu-arsenic/10 border border-exclu-arsenic/30 hover:border-exclu-arsenic/50'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                  step.done
                    ? 'bg-primary/20 text-primary'
                    : 'bg-exclu-arsenic/30 text-exclu-space/50'
                }`}
              >
                {step.done ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20, delay: i * 0.1 }}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </motion.div>
                ) : (
                  step.icon
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-semibold ${step.done ? 'text-primary line-through' : 'text-exclu-cloud'}`}>
                  {step.label}
                </p>
                <p className="text-[10px] text-exclu-space/60 mt-0.5">{step.description}</p>
              </div>
            </Wrapper>
          );
        })}
      </div>

    </motion.div>
  );
};

export default ActivationChecklist;
