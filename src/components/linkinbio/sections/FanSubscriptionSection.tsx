import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { DollarSign, Users } from 'lucide-react';

type Gender = 'female' | 'male' | 'other';

interface FanSubscriptionSectionProps {
  enabled: boolean;
  priceCents: number;
  gender: Gender | null;
  onUpdate: (updates: {
    fan_subscription_enabled?: boolean;
    fan_subscription_price_cents?: number;
    gender?: Gender;
  }) => void;
}

/**
 * Creator settings block for the fan→creator subscription feature:
 *   - Toggle to enable subscriptions on this profile
 *   - Price input ($5–$100, default $5)
 *   - Gender selector (used by the discovery carousel filter)
 */
export function FanSubscriptionSection({ enabled, priceCents, gender, onUpdate }: FanSubscriptionSectionProps) {
  const priceDollars = (priceCents / 100).toFixed(2);

  const handlePriceChange = (value: string) => {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(5, Math.min(100, parsed));
    onUpdate({ fan_subscription_price_cents: Math.round(clamped * 100) });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Fan subscription</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Let fans pay monthly to unlock your private feed. Cancel anytime — fans keep access until the end of the paid period.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => onUpdate({ fan_subscription_enabled: checked })}
          />
        </div>

        {enabled && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground block">Monthly price (USD)</label>
            <div className="relative">
              <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="number"
                min={5}
                max={100}
                step={0.5}
                value={priceDollars}
                onChange={(e) => handlePriceChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Minimum $5, maximum $100.</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Creator gender</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Used by the Discover carousel filter in the fan app.
        </p>
        <div className="flex gap-2">
          {(['female', 'male', 'other'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onUpdate({ gender: option })}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                gender === option
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {option === 'female' ? 'Female' : option === 'male' ? 'Male' : 'Other'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
