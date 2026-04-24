import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { DollarSign, Users, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface FanSubscriptionSectionProps {
  enabled: boolean;
  priceCents: number;
  onUpdate: (updates: {
    fan_subscription_enabled?: boolean;
    fan_subscription_price_cents?: number;
  }) => void;
}

/**
 * Monetisation block shown at the top of the Feed tab:
 *   - Toggle to enable fan→creator subscriptions on this profile
 *   - Monthly price input ($5 – $100, default $5)
 *
 * Gender lives in the Info tab — it's a profile-identity field, not a feed
 * monetisation setting.
 */
export function FanSubscriptionSection({ enabled, priceCents, onUpdate }: FanSubscriptionSectionProps) {
  const priceDollars = (priceCents / 100).toFixed(2);

  const handlePriceChange = (value: string) => {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(5, Math.min(100, parsed));
    onUpdate({ fan_subscription_price_cents: Math.round(clamped * 100) });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Fan subscription</h3>
          <TooltipProvider delayDuration={120}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground/70 hover:text-foreground transition-colors focus:outline-none"
                  aria-label="About fan subscription"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" align="start" className="max-w-xs text-xs leading-relaxed">
                <p className="font-semibold mb-1">Fan subscription</p>
                <p className="text-muted-foreground">
                  Let fans pay monthly to unlock your private feed. Cancel anytime — fans keep access until the end of the paid period.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => onUpdate({ fan_subscription_enabled: checked })}
        />
      </div>

      {enabled && (
        <div className="space-y-2 mt-4">
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
  );
}
