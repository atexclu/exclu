import { forwardRef, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ProfileHealthStep, ProfileHealthStepId } from '@/hooks/useProfileHealth';

interface ProfileHealthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: ProfileHealthStep[];
  percent: number;
  completedCount: number;
  totalCount: number;
  /** When set, the dialog scrolls that step into view and pulses it. */
  highlightStepId: ProfileHealthStepId | null;
}

/**
 * Modal listing the eight Profile Health steps. Done steps display a spring-animated
 * check; pending steps deep-link to the right tab in /app/profile.
 *
 * The component is intentionally dumb: state lives in the parent (AppShell),
 * which owns the auto-open trigger and the `highlightStepId` derived from
 * `useProfileHealth().justCompletedStepId`.
 */
export function ProfileHealthDialog({
  open,
  onOpenChange,
  steps,
  percent,
  completedCount,
  totalCount,
  highlightStepId,
}: ProfileHealthDialogProps) {
  const navigate = useNavigate();
  const stepRefs = useRef<Map<ProfileHealthStepId, HTMLButtonElement | null>>(new Map());
  const isComplete = completedCount === totalCount;

  // When the dialog opens with a highlighted step (auto-popup after a save),
  // scroll the step into view. Delayed by one frame so the dialog has finished
  // mounting / measuring before we scroll.
  useEffect(() => {
    if (!open || !highlightStepId) return;
    const node = stepRefs.current.get(highlightStepId);
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [open, highlightStepId]);

  // Both pending AND done steps are navigable — done steps still take the
  // creator to the editor tab so they can review or edit their answer.
  // Steps with an absolute `targetUrl` (e.g. /app/links) bypass the focus
  // deep-link so they can send the user outside the Link-in-Bio editor.
  const goToStep = (step: ProfileHealthStep) => {
    onOpenChange(false);
    navigate(step.targetUrl ?? `/app/profile?focus=${step.targetTab}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-hidden rounded-3xl border-border/60 bg-card p-0">
        {/* Aurora-flavoured header — same lime accent as the Earnings hero. */}
        <div className="relative overflow-hidden px-6 pt-6 pb-5">
          <div
            aria-hidden
            className="absolute -top-20 -right-16 h-48 w-48 rounded-full bg-primary/30 blur-3xl"
          />
          <div className="relative flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
                Profile health
              </p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-foreground">
                {isComplete ? 'Profile complete' : 'Complete your profile'}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {completedCount} of {totalCount} steps done
              </p>
            </div>
            <motion.div
              key={percent}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 18 }}
              className="text-right text-5xl font-black tracking-tight text-foreground"
            >
              {percent}
              <span className="text-2xl text-muted-foreground">%</span>
            </motion.div>
          </div>

          {/* Progress bar — animates on open and on every percent change. */}
          <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-lime-400"
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Steps list */}
        <div className="max-h-[60vh] overflow-y-auto px-3 pb-5">
          <ul className="space-y-2">
            {steps.map((step, index) => (
              <li key={step.id}>
                <StepRow
                  ref={(node) => {
                    stepRefs.current.set(step.id, node);
                  }}
                  step={step}
                  index={index}
                  isHighlighted={highlightStepId === step.id}
                  onClick={() => goToStep(step)}
                />
              </li>
            ))}
          </ul>

          <AnimatePresence>
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-primary/10 py-3 text-sm font-semibold text-primary"
              >
                <Sparkles className="h-4 w-4" />
                Your profile is ready to convert.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface StepRowProps {
  step: ProfileHealthStep;
  index: number;
  isHighlighted: boolean;
  onClick: () => void;
}

/**
 * Single row. Always rendered as a `<button>` so done steps remain navigable
 * (the creator can re-open a finished section to review or edit). Done rows
 * keep their celebratory styling but the chevron stays so hover affordance
 * is consistent across the list.
 */
const StepRow = forwardRef<HTMLButtonElement, StepRowProps>(
  ({ step, index, isHighlighted, onClick }, ref) => {
    return (
      <motion.button
        ref={ref}
        type="button"
        data-step-id={step.id}
        onClick={onClick}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
        className={cn(
          'group relative flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all',
          step.done
            ? 'border-primary/25 bg-primary/5 hover:border-primary/40 hover:bg-primary/10'
            : 'border-border/60 bg-muted/30 hover:border-border hover:bg-muted/60'
        )}
      >
        <StepIcon done={step.done} highlight={isHighlighted} index={index} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm font-semibold',
              step.done ? 'text-foreground/70 line-through decoration-primary/60' : 'text-foreground'
            )}
          >
            {step.label}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{step.description}</p>
        </div>
        <ChevronRight
          className={cn(
            'h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5',
            step.done
              ? 'text-primary/60 group-hover:text-primary'
              : 'text-muted-foreground group-hover:text-foreground'
          )}
        />
      </motion.button>
    );
  }
);
StepRow.displayName = 'StepRow';

interface StepIconProps {
  done: boolean;
  highlight: boolean;
  index: number;
}

/** Circular badge: filled lime when done (with spring check), muted otherwise. */
function StepIcon({ done, highlight, index }: StepIconProps) {
  return (
    <div
      className={cn(
        'relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
        done ? 'bg-primary/15 text-primary ring-1 ring-primary/40' : 'bg-muted text-muted-foreground'
      )}
    >
      {done ? (
        <motion.span
          key="check"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        >
          <Check className="h-4 w-4" />
        </motion.span>
      ) : (
        <span>{index + 1}</span>
      )}

      {/* Single-burst pulse ring for the just-completed step (auto-popup). */}
      {highlight && done && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full ring-2 ring-primary"
          initial={{ opacity: 0.6, scale: 1 }}
          animate={{ opacity: 0, scale: 1.6 }}
          transition={{ duration: 1.1, repeat: 1, ease: 'easeOut' }}
        />
      )}
    </div>
  );
}
