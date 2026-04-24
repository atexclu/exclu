import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

type Row = {
  id: string;
  creator_handle: string | null;
  creator_name: string | null;
  price_cents: number;
  period_end: string;
  cancel_at_period_end: boolean;
  status: string;
};

export default function FanSubscriptions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase.from('fan_creator_subscriptions')
      .select('id, price_cents, period_end, cancel_at_period_end, status, creator_profile:creator_profiles!inner(handle, display_name)')
      .eq('fan_id', user.id)
      .in('status', ['active', 'past_due', 'cancelled'])
      .order('period_end', { ascending: false });
    setRows((data ?? []).map((r: any) => ({
      id: r.id,
      creator_handle: r.creator_profile?.handle ?? null,
      creator_name: r.creator_profile?.display_name ?? null,
      price_cents: r.price_cents,
      period_end: r.period_end,
      cancel_at_period_end: r.cancel_at_period_end,
      status: r.status,
    })));
    setLoading(false);
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancel at end of billing period? You keep access until then.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke('cancel-fan-subscription', {
      body: { subscription_id: id },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    if (error) return toast.error('Cancel failed');
    toast.success('Will end on period close');
    await load();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">My subscriptions</h1>
      {loading && <p className="text-muted-foreground mt-4">Loading…</p>}
      {!loading && rows.length === 0 && <p className="mt-4 text-muted-foreground">You're not subscribed to any creator yet.</p>}
      <ul className="mt-6 space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
            <div>
              <Link to={`/${r.creator_handle}`} className="font-semibold hover:underline">{r.creator_name || r.creator_handle}</Link>
              <p className="text-sm text-muted-foreground">${(r.price_cents/100).toFixed(2)}/mo • next charge {r.period_end?.slice(0, 10)}</p>
              {r.cancel_at_period_end && <p className="text-xs text-amber-400 mt-1">Ends on {r.period_end?.slice(0, 10)}</p>}
              {r.status === 'past_due' && <p className="text-xs text-red-400 mt-1">Payment failed — update your card</p>}
            </div>
            {r.status === 'active' && !r.cancel_at_period_end && (
              <Button variant="outline" size="sm" onClick={() => cancel(r.id)}>Cancel</Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
