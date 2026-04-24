import { Check } from 'lucide-react';
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
}

export function PlanCard({ name, priceLabel, priceSuffix, description, features, highlighted, badge, ctaLabel, onCta, ctaDisabled }: PlanCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border bg-card p-6',
        highlighted ? 'border-primary shadow-glow-strong' : 'border-border',
      )}
    >
      {badge && (
        <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
          {badge}
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
        variant={highlighted ? 'hero' : 'outline'}
        disabled={ctaDisabled}
        className="mt-6 w-full"
      >
        {ctaLabel}
      </Button>
    </div>
  );
}
