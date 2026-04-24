import { Check, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PlanCardProps {
  name: string;
  priceLabel: string;
  priceSuffix?: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  ctaLabel: string;
  onCta: () => void;
  ctaDisabled?: boolean;
  isCurrentPlan?: boolean;
}

export function PlanCard({
  name,
  priceLabel,
  priceSuffix,
  description,
  features,
  highlighted,
  badge,
  ctaLabel,
  onCta,
  ctaDisabled,
  isCurrentPlan,
}: PlanCardProps) {
  const displayBadge = isCurrentPlan ? 'Current plan' : badge;
  const accent = isCurrentPlan
    ? 'border-emerald-500/60 ring-1 ring-emerald-500/20 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]'
    : highlighted
    ? 'border-primary shadow-glow-strong'
    : 'border-border';

  return (
    <div className={cn('relative flex flex-col rounded-2xl border bg-card p-6', accent)}>
      {displayBadge && (
        <span
          className={cn(
            'absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-semibold',
            isCurrentPlan
              ? 'bg-emerald-500 text-emerald-950'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {isCurrentPlan && <CheckCircle2 className="h-3 w-3" />}
          {displayBadge}
        </span>
      )}
      <h3 className="text-lg font-bold text-foreground">{name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-foreground">{priceLabel}</span>
        {priceSuffix && <span className="text-sm text-muted-foreground">{priceSuffix}</span>}
      </div>
      <ul className="mt-6 space-y-3 text-sm flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground/90">{f}</span>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        onClick={onCta}
        variant={isCurrentPlan ? 'ghost' : highlighted ? 'hero' : 'outline'}
        disabled={ctaDisabled}
        className="mt-6 w-full"
      >
        {ctaLabel}
      </Button>
    </div>
  );
}
