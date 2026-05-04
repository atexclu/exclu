import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { DollarSign, Users, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const PRICE_MIN = 5;
const PRICE_MAX = 100;

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
  // Local string state for the price input. Clamping on every keystroke is
  // hostile (typing "1" would snap to "5" before you can finish "10"), so we
  // let the user type freely and only validate / clamp on blur. We also keep
  // the field as `.toFixed(2)` ONLY when displaying a server-confirmed value
  // — while the user is editing, we mirror their raw input.
  const [priceDraft, setPriceDraft] = useState<string>(() => (priceCents / 100).toFixed(2));

  // When the parent commits a new price (e.g. server reload, profile switch),
  // sync the draft back to the canonical value.
  useEffect(() => {
    setPriceDraft((priceCents / 100).toFixed(2));
  }, [priceCents]);

  const commitPrice = () => {
    const parsed = parseFloat(priceDraft);
    if (Number.isNaN(parsed)) {
      // Invalid input → revert to the last good server value.
      setPriceDraft((priceCents / 100).toFixed(2));
      return;
    }
    const clamped = Math.max(PRICE_MIN, Math.min(PRICE_MAX, parsed));
    const clampedCents = Math.round(clamped * 100);
    setPriceDraft(clamped.toFixed(2));
    if (clampedCents !== priceCents) {
      onUpdate({ fan_subscription_price_cents: clampedCents });
    }
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
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={0.01}
              inputMode="decimal"
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="pl-9"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">Minimum ${PRICE_MIN}, maximum ${PRICE_MAX}.</p>
        </div>
      )}
    </div>
  );
}
