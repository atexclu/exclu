import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { QuickPayForm } from '@/components/payment/QuickPayForm';
import { PlanCard } from '@/components/pricing/PlanCard';
import { CountrySelect } from '@/components/checkout/CountrySelect';
import { getGeoCountry } from '@/lib/ipGeo';
import { cn } from '@/lib/utils';

type PlanKey = 'free' | 'monthly' | 'annual';

interface SubState {
  plan: PlanKey;
  amount_cents: number | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
}

interface RebillRow {
  id: string;
  created_at: string;
  status: 'pending' | 'success' | 'declined' | 'error' | 'transient';
  amount_cents: number;
  attempt_number: number;
  ugp_transaction_id: string | null;
  message: string | null;
}

type PendingAction =
  | { kind: 'subscribe'; target: 'monthly' | 'annual' }
  | { kind: 'switch'; target: 'monthly' | 'annual' }
  | { kind: 'cancel' }
  | { kind: 'reactivate' }
  | null;

const PLAN_LABEL: Record<PlanKey, string> = {
  free: 'Free',
  monthly: 'Pro Monthly',
  annual: 'Pro Annual',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function PlanManagement() {
  const [sub, setSub] = useState<SubState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFields, setPendingFields] = useState<Record<string, string> | null>(null);
  const [confirm, setConfirm] = useState<PendingAction>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [history, setHistory] = useState<RebillRow[]>([]);

  const loadSub = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles')
      .select('subscription_plan, subscription_amount_cents, subscription_period_end, subscription_cancel_at_period_end, country, billing_country')
      .eq('id', user.id).maybeSingle();
    if (data) {
      setSub({
        plan: (data.subscription_plan ?? 'free') as PlanKey,
        amount_cents: data.subscription_amount_cents,
        period_end: data.subscription_period_end,
        cancel_at_period_end: !!data.subscription_cancel_at_period_end,
      });
      // Prefill country from stored profile fields if we have one
      const profileCountry = (data.billing_country ?? data.country ?? null) as string | null;
      if (profileCountry) setCountry(profileCountry);
    }
  };

  const loadHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('rebill_attempts')
      .select('id, created_at, status, amount_cents, attempt_number, ugp_transaction_id, message')
      .eq('subject_table', 'profiles')
      .eq('subject_id', user.id)
      .order('created_at', { ascending: false })
      .limit(24);
    setHistory((data ?? []) as RebillRow[]);
  };

  useEffect(() => {
    loadSub();
    loadHistory();
  }, []);

  // Detect country via IP geo for the checkout dropdown default
  useEffect(() => {
    getGeoCountry().then((c) => {
      if (c) setDetectedCountry(c);
    });
  }, []);

  // When redirected from /pricing (?subscribe=monthly|annual) open the checkout dialog
  // with the right plan pre-selected. Country selection happens inside the dialog.
  useEffect(() => {
    if (!sub || busy || pendingFields || confirm) return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get('subscribe');
    if (target !== 'monthly' && target !== 'annual') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('subscribe');
    window.history.replaceState(null, '', url.toString());
    if (sub.plan === target) return;
    setConfirm(sub.plan === 'free' ? { kind: 'subscribe', target } : { kind: 'switch', target });
  }, [sub, busy, pendingFields, confirm]);

  const startCheckout = async (plan: 'monthly' | 'annual', checkoutCountry: string | null) => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('create-creator-subscription', {
        body: { plan, country: checkoutCountry },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) throw error;
      setPendingFields((data as { fields?: Record<string, string> }).fields ?? null);
    } catch (e) {
      toast.error((e as Error)?.message || 'Unable to start checkout');
    } finally {
      setBusy(false);
    }
  };

  const toggleCancel = async (reactivate: boolean) => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('cancel-creator-subscription', {
        body: { reactivate },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) throw error;
      toast.success(
        reactivate
          ? 'Your subscription will continue.'
          : `Your plan will end on ${formatDate(sub?.period_end ?? null)}.`,
      );
      await loadSub();
    } catch (e) {
      toast.error((e as Error)?.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  if (!sub) {
    return (
      <div className="space-y-4">
        <div className="h-16 rounded-xl border border-border/60 bg-card/40 animate-pulse" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 rounded-2xl border border-border/60 bg-card/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (pendingFields) {
    return <QuickPayForm fields={pendingFields} />;
  }

  const isPaid = sub.plan !== 'free';
  const cancelling = isPaid && sub.cancel_at_period_end;
  const renewalLabel = formatDate(sub.period_end);

  const priceLine = (() => {
    if (!isPaid) return 'No subscription — keep 85% of every sale.';
    const amt = sub.amount_cents ? `$${(sub.amount_cents / 100).toFixed(2)}` : '—';
    if (cancelling) return `${amt} · Access ends ${renewalLabel}`;
    return `${amt} · Renews ${renewalLabel}`;
  })();

  const handleCta = (target: PlanKey) => {
    if (target === sub.plan) return;
    if (target === 'free') {
      setConfirm({ kind: 'cancel' });
      return;
    }
    if (sub.plan === 'free') {
      setConfirm({ kind: 'subscribe', target });
      return;
    }
    // Already paid, switching between monthly/annual
    setConfirm({ kind: 'switch', target });
  };

  const ctaFor = (target: PlanKey) => {
    if (target === sub.plan) return 'Current plan';
    if (target === 'free') return 'Downgrade to Free';
    if (!isPaid) return target === 'monthly' ? 'Upgrade to Monthly' : 'Upgrade to Annual';
    return target === 'monthly' ? 'Switch to Monthly' : 'Switch to Annual';
  };

  const checkoutTarget = confirm?.kind === 'subscribe' || confirm?.kind === 'switch' ? confirm.target : null;
  const canProceedToCheckout = !!country && !busy;

  return (
    <div className="space-y-6">
      {/* Status summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current plan</span>
          <span className="text-sm font-semibold text-foreground">{PLAN_LABEL[sub.plan]}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              cancelling
                ? 'bg-amber-500/15 text-amber-300'
                : isPaid
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {cancelling ? (
              <>
                <AlertTriangle className="h-3 w-3" />
                Cancelling
              </>
            ) : isPaid ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Active
              </>
            ) : (
              'Default'
            )}
          </span>
          <span className="text-xs text-muted-foreground">· {priceLine}</span>
        </div>
        {cancelling && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirm({ kind: 'reactivate' })}
            disabled={busy}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Keep subscription
          </Button>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <PlanCard
          name="Free"
          priceLabel="$0"
          priceSuffix="/forever"
          description="Start selling with no upfront cost."
          features={[
            '15% platform commission',
            '15% processing fee paid by the fan',
            'Unlimited links, tips, custom requests, and gifts',
            'Single creator profile',
          ]}
          isCurrentPlan={sub.plan === 'free'}
          ctaLabel={ctaFor('free')}
          onCta={() => handleCta('free')}
          ctaDisabled={busy || sub.plan === 'free' || cancelling}
        />
        <PlanCard
          name="Pro Monthly"
          priceLabel="$39.99"
          priceSuffix="/month"
          description="Keep 100% of your sales. Up to 2 profiles included."
          features={[
            '0% platform commission on every sale',
            'Up to 2 profiles included',
            'Additional profiles $10/mo each',
            'All Free features',
          ]}
          badge="Popular"
          highlighted={sub.plan !== 'monthly'}
          isCurrentPlan={sub.plan === 'monthly'}
          ctaLabel={ctaFor('monthly')}
          onCta={() => handleCta('monthly')}
          ctaDisabled={busy || sub.plan === 'monthly'}
        />
        <PlanCard
          name="Pro Annual"
          priceLabel="$239.99"
          priceSuffix="/year"
          description="Best value. Unlimited profiles, save 50% vs monthly."
          features={[
            '0% platform commission',
            'Unlimited profiles (up to 50)',
            '2 months free vs monthly billing',
            'All Free features',
          ]}
          badge="Best value"
          isCurrentPlan={sub.plan === 'annual'}
          ctaLabel={ctaFor('annual')}
          onCta={() => handleCta('annual')}
          ctaDisabled={busy || sub.plan === 'annual'}
        />
      </div>

      {/* Subtle cancel link — only when active and not already cancelling */}
      {isPaid && !cancelling && (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setConfirm({ kind: 'cancel' })}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive transition-colors"
            disabled={busy}
          >
            Cancel subscription
          </button>
        </div>
      )}

      {/* Billing history — recurring charges on the subscription card */}
      {isPaid && (
        <div className="rounded-xl border border-border/70 bg-card/40 overflow-hidden">
          <div className="border-b border-border/60 px-4 py-3">
            <h4 className="text-sm font-semibold text-foreground">Billing history</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Recurring charges on your subscription card. Your next charge is scheduled for {renewalLabel}.
            </p>
          </div>
          {history.length === 0 ? (
            <div className="px-4 py-5 text-xs text-muted-foreground text-center">
              No recurring charges yet. Your first automatic renewal will appear here.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {history.map((row) => {
                const date = (() => {
                  try {
                    return new Date(row.created_at).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                    });
                  } catch {
                    return row.created_at.slice(0, 10);
                  }
                })();
                const statusStyles: Record<RebillRow['status'], string> = {
                  success: 'bg-emerald-500/15 text-emerald-300',
                  declined: 'bg-rose-500/15 text-rose-300',
                  error: 'bg-rose-500/15 text-rose-300',
                  transient: 'bg-amber-500/15 text-amber-300',
                  pending: 'bg-muted text-muted-foreground',
                };
                const statusLabels: Record<RebillRow['status'], string> = {
                  success: 'Charged',
                  declined: 'Declined',
                  error: 'Error',
                  transient: 'Retrying',
                  pending: 'Pending',
                };
                return (
                  <li key={row.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {PLAN_LABEL[sub.plan]} renewal
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {date}
                        {row.attempt_number > 1 && ` · Attempt ${row.attempt_number}`}
                        {row.message && row.status !== 'success' && ` · ${row.message}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        ${(row.amount_cents / 100).toFixed(2)}
                      </span>
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                        statusStyles[row.status],
                      )}>
                        {statusLabels[row.status]}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Confirm dialogs */}
      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          {confirm?.kind === 'cancel' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                <AlertDialogDescription>
                  You&apos;ll keep Pro access until {renewalLabel}. After that, your account reverts to Free
                  and a 15% platform commission will apply to new sales. You can resubscribe anytime.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep my plan</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setConfirm(null);
                    toggleCancel(false);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Cancel subscription
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {confirm?.kind === 'reactivate' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Keep your subscription active?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your {PLAN_LABEL[sub.plan]} plan will continue and renew automatically on {renewalLabel}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Not now</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setConfirm(null);
                    toggleCancel(true);
                  }}
                >
                  Yes, keep it
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {(confirm?.kind === 'subscribe' || confirm?.kind === 'switch') && checkoutTarget && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirm.kind === 'subscribe'
                    ? `Subscribe to ${PLAN_LABEL[checkoutTarget]}`
                    : `Switch to ${PLAN_LABEL[checkoutTarget]}`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirm.kind === 'switch'
                    ? `Your new plan starts immediately. Your current ${PLAN_LABEL[sub.plan]} subscription stops renewing and ends naturally on ${renewalLabel}, so you won't be double-charged.`
                    : 'Select your billing country so we route your payment through the correct card network. You can change it now or keep the detected value.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="my-4 space-y-1.5">
                <label htmlFor="sub-checkout-country" className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground block">
                  Billing country <span className="text-destructive">*</span>
                </label>
                <CountrySelect
                  id="sub-checkout-country"
                  value={country}
                  autoDetectedCountry={detectedCountry}
                  onChange={setCountry}
                  required
                  placeholder="Select your country"
                />
                <p className="text-[11px] text-muted-foreground">
                  US and Canada cards route through our 2D network; every other country uses 3D Secure.
                </p>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Not now</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!canProceedToCheckout}
                  onClick={() => {
                    const target = checkoutTarget;
                    setConfirm(null);
                    startCheckout(target, country);
                  }}
                >
                  Continue to checkout
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
