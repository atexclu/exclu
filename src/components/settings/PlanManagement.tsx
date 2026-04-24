import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { QuickPayForm } from '@/components/payment/QuickPayForm';

interface SubState {
  plan: 'free' | 'monthly' | 'annual';
  amount_cents: number | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
}

export function PlanManagement() {
  const [sub, setSub] = useState<SubState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFields, setPendingFields] = useState<Record<string, string> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('profiles')
        .select('subscription_plan, subscription_amount_cents, subscription_period_end, subscription_cancel_at_period_end')
        .eq('id', user.id).maybeSingle();
      if (data) setSub({
        plan: data.subscription_plan,
        amount_cents: data.subscription_amount_cents,
        period_end: data.subscription_period_end,
        cancel_at_period_end: data.subscription_cancel_at_period_end,
      });
    });
  }, []);

  const startCheckout = async (plan: 'monthly' | 'annual') => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('create-creator-subscription', {
        body: { plan, country: null /* UI will prompt later via PreCheckoutGate */ },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) throw error;
      setPendingFields((data as any).fields);
    } catch (e: any) {
      toast.error(e?.message || 'Unable to start checkout');
    } finally {
      setBusy(false);
    }
  };

  const cancelAtEnd = async () => {
    if (!confirm('Cancel at end of period? You keep Pro until then.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke('cancel-creator-subscription', {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (error) return toast.error('Cancellation failed');
    toast.success('Your subscription will end on ' + sub?.period_end?.slice(0,10));
  };

  if (!sub) return null;

  if (pendingFields) {
    return <QuickPayForm fields={pendingFields} />;
  }

  if (sub.plan === 'free') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Button variant="hero" onClick={() => startCheckout('monthly')} disabled={busy}>
          Start Monthly — $39.99/mo
        </Button>
        <Button variant="outline" onClick={() => startCheckout('annual')} disabled={busy}>
          Start Annual — $239.99/yr
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold">{sub.plan === 'annual' ? 'Pro Annual' : 'Pro Monthly'}</h3>
        <span className="text-sm text-muted-foreground">
          {sub.amount_cents ? `$${(sub.amount_cents / 100).toFixed(2)}` : '—'} • renews {sub.period_end?.slice(0, 10)}
        </span>
      </div>
      {!sub.cancel_at_period_end ? (
        <Button variant="outline" onClick={cancelAtEnd}>Cancel at end of period</Button>
      ) : (
        <p className="text-sm text-amber-400">Your plan will end on {sub.period_end?.slice(0, 10)}. No further charges.</p>
      )}
      {sub.plan === 'monthly' && (
        <Button variant="ghost" onClick={() => navigate('/pricing')}>
          Switch to Annual (save 50%)
        </Button>
      )}
    </div>
  );
}
