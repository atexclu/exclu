import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
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

type SubRow = {
  id: string;
  price_cents: number;
  period_end: string;
  cancel_at_period_end: boolean;
  status: 'active' | 'past_due' | 'cancelled' | 'pending' | string;
  creator_handle: string | null;
  creator_name: string | null;
  creator_avatar_url: string | null;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function FanSubscriptionsList() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<SubRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Separate fetches — avoids the `!inner` join quirks and RLS pitfalls
    // that were hiding the row even when it existed.
    const { data: subs } = await supabase
      .from('fan_creator_subscriptions')
      .select('id, price_cents, period_end, cancel_at_period_end, status, creator_profile_id')
      .eq('fan_id', user.id)
      .in('status', ['active', 'past_due', 'cancelled'])
      .order('period_end', { ascending: false });

    const profileIds = (subs ?? []).map((s) => s.creator_profile_id).filter(Boolean) as string[];
    let profileMap = new Map<string, { handle: string | null; display_name: string | null; avatar_url: string | null }>();
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('creator_profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', profileIds);
      (profiles ?? []).forEach((p: { id: string; username?: string | null; display_name?: string | null; avatar_url?: string | null }) => {
        profileMap.set(p.id, {
          handle: p.username ?? null,
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
        });
      });
    }

    setRows((subs ?? []).map((s) => {
      const profile = profileMap.get(s.creator_profile_id as string) ?? null;
      return {
        id: s.id as string,
        price_cents: s.price_cents as number,
        period_end: s.period_end as string,
        cancel_at_period_end: !!s.cancel_at_period_end,
        status: s.status as SubRow['status'],
        creator_handle: profile?.handle ?? null,
        creator_name: profile?.display_name ?? null,
        creator_avatar_url: profile?.avatar_url ?? null,
      };
    }));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('cancel-fan-subscription', {
        body: { subscription_id: cancelTarget.id },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) throw error;
      toast.success(`Cancelled. You keep access until ${formatDate(cancelTarget.period_end)}.`);
      setCancelTarget(null);
      await load();
    } catch (e) {
      toast.error((e as Error)?.message || 'Cancellation failed');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
        <div className="h-5 w-40 rounded bg-foreground/5 animate-pulse mb-2" />
        <div className="h-3 w-64 rounded bg-foreground/5 animate-pulse" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
        <h3 className="text-base font-semibold text-foreground">Creator subscriptions</h3>
        <p className="text-sm text-muted-foreground mt-1">
          You&apos;re not subscribed to any creator yet. Visit a creator&apos;s profile and click <span className="font-medium">Subscribe</span> to unlock their subscriber-only feed.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="text-base font-semibold text-foreground">Creator subscriptions</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage the creators you subscribe to. Cancelling keeps access until the end of the paid period.
        </p>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((r) => {
          const label = r.creator_name || r.creator_handle || 'Creator';
          const cancelled = r.status === 'cancelled' || r.cancel_at_period_end;
          const pastDue = r.status === 'past_due';
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {r.creator_avatar_url ? (
                  <img
                    src={r.creator_avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={r.creator_handle ? `/${r.creator_handle}` : '#'}
                      className="text-sm font-semibold text-foreground hover:underline truncate"
                    >
                      {label}
                    </Link>
                    {pastDue ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-300 px-2 py-0.5 text-[10px] font-medium">
                        <AlertTriangle className="w-3 h-3" /> Payment failed
                      </span>
                    ) : cancelled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-[10px] font-medium">
                        <AlertTriangle className="w-3 h-3" /> Ends {formatDate(r.period_end)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ${(r.price_cents / 100).toFixed(2)}/mo · {cancelled ? 'Access ends' : 'Next charge'} {formatDate(r.period_end)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {r.creator_handle && (
                  <Link
                    to={`/${r.creator_handle}?tab=feed`}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    Open feed <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
                {r.status === 'active' && !r.cancel_at_period_end && (
                  <Button variant="outline" size="sm" onClick={() => setCancelTarget(r)} className="h-7 text-xs">
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancel subscription to {cancelTarget?.creator_name || cancelTarget?.creator_handle || 'this creator'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your subscription will stop renewing. You keep access to the creator&apos;s feed until{' '}
              {formatDate(cancelTarget?.period_end)}. No refund for the unused portion of the current period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={confirmCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
