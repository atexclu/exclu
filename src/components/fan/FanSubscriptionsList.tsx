import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowUpRight, Heart, Sparkles } from 'lucide-react';
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
import { cn } from '@/lib/utils';

type SubStatus = 'active' | 'past_due' | 'cancelled' | 'pending' | string;

type SubRow = {
  id: string;
  price_cents: number;
  period_end: string;
  cancel_at_period_end: boolean;
  status: SubStatus;
  creator_handle: string | null;
  creator_name: string | null;
  creator_avatar_url: string | null;
};

type Variant = 'active' | 'cancelling' | 'past_due';

const VARIANT_THEME: Record<Variant, {
  rail: string;
  label: string;
  labelText: string;
  glow: string;
  dot: string;
}> = {
  active: {
    rail: 'bg-gradient-to-b from-emerald-300/80 via-emerald-400/60 to-emerald-500/40',
    label: 'Active',
    labelText: 'text-emerald-300',
    glow: 'hover:shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_18px_40px_-24px_rgba(16,185,129,0.45)]',
    dot: 'bg-emerald-400',
  },
  cancelling: {
    rail: 'bg-gradient-to-b from-amber-300/80 via-amber-400/60 to-amber-500/40',
    label: 'Ending',
    labelText: 'text-amber-300',
    glow: 'hover:shadow-[0_0_0_1px_rgba(245,158,11,0.35),0_18px_40px_-24px_rgba(245,158,11,0.35)]',
    dot: 'bg-amber-400',
  },
  past_due: {
    rail: 'bg-gradient-to-b from-rose-300/80 via-rose-400/60 to-rose-500/40',
    label: 'Payment failed',
    labelText: 'text-rose-300',
    glow: 'hover:shadow-[0_0_0_1px_rgba(244,63,94,0.35),0_18px_40px_-24px_rgba(244,63,94,0.35)]',
    dot: 'bg-rose-400',
  },
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
    });
  } catch {
    return iso.slice(0, 5);
  }
}

function centsToPrice(cents: number): { dollars: string; cents: string } {
  const value = (cents / 100).toFixed(2);
  const [d, c] = value.split('.');
  return { dollars: d, cents: c };
}

function variantFor(row: SubRow): Variant {
  if (row.status === 'past_due') return 'past_due';
  if (row.status === 'cancelled' || row.cancel_at_period_end) return 'cancelling';
  return 'active';
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

    const { data: subs } = await supabase
      .from('fan_creator_subscriptions')
      .select('id, price_cents, period_end, cancel_at_period_end, status, creator_profile_id')
      .eq('fan_id', user.id)
      .in('status', ['active', 'past_due', 'cancelled'])
      .order('period_end', { ascending: false });

    const profileIds = (subs ?? []).map((s) => s.creator_profile_id).filter(Boolean) as string[];
    const profileMap = new Map<string, { handle: string | null; display_name: string | null; avatar_url: string | null }>();
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
        status: s.status as SubStatus,
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

  /* ── Loading ──────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <div className="space-y-1">
            <div className="h-3 w-24 rounded-full bg-foreground/10 animate-pulse" />
            <div className="h-6 w-44 rounded-md bg-foreground/10 animate-pulse" />
          </div>
        </header>
        <div className="h-[124px] rounded-2xl border border-border/60 bg-card/30 animate-pulse" />
      </section>
    );
  }

  /* ── Empty state ──────────────────────────────────────────────────── */
  if (rows.length === 0) {
    return (
      <section className="space-y-3">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground/80">
            Memberships
          </p>
          <h3 className="text-xl font-bold tracking-tight text-foreground mt-1">
            Your creator subscriptions
          </h3>
        </header>
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/40 px-6 py-10 text-center">
          {/* Soft radial backdrop */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 0%, rgba(207,255,22,0.08), transparent 70%)',
            }}
          />
          <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.04] ring-1 ring-foreground/10">
            <Heart className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="relative mt-4 text-[15px] font-semibold text-foreground">
            No memberships yet
          </p>
          <p className="relative mx-auto mt-1.5 max-w-[36ch] text-xs leading-relaxed text-muted-foreground">
            When you subscribe to a creator you love, they&apos;ll appear here.
            Their subscriber-only feed unlocks instantly.
          </p>
        </div>
      </section>
    );
  }

  /* ── List ─────────────────────────────────────────────────────────── */
  const totalMonthly = rows
    .filter((r) => r.status === 'active' && !r.cancel_at_period_end)
    .reduce((sum, r) => sum + r.price_cents, 0);

  return (
    <section className="space-y-4">
      {/* Editorial header */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground/80">
            Memberships · {rows.length}
          </p>
          <h3 className="text-xl font-bold tracking-tight text-foreground mt-1">
            Your creator subscriptions
          </h3>
        </div>
        {totalMonthly > 0 && (
          <div className="text-right leading-none">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
              Monthly
            </p>
            <p className="mt-1.5 text-lg font-bold tabular-nums text-foreground">
              ${(totalMonthly / 100).toFixed(2)}
              <span className="text-xs font-medium text-muted-foreground/80 ml-1">/mo</span>
            </p>
          </div>
        )}
      </header>

      <ul className="space-y-3">
        {rows.map((r, i) => {
          const variant = variantFor(r);
          const theme = VARIANT_THEME[variant];
          const label = r.creator_name || r.creator_handle || 'Creator';
          const { dollars, cents } = centsToPrice(r.price_cents);
          const inactive = variant !== 'active';
          const dateLabel = variant === 'cancelling' ? 'Access ends' : 'Next charge';

          return (
            <li
              key={r.id}
              className={cn(
                'group relative rounded-2xl border border-border/60 bg-card/50',
                'backdrop-blur-[2px] transition-all duration-300',
                'hover:-translate-y-[1px] hover:border-border',
                theme.glow,
              )}
              style={{ animation: `slideUp 0.45s ${i * 0.06}s cubic-bezier(0.16, 1, 0.3, 1) both` }}
            >
              {/* Left status rail */}
              <div className={cn('absolute left-0 top-4 bottom-4 w-[3px] rounded-full', theme.rail)} aria-hidden />

              <div className="flex items-stretch gap-4 px-5 py-4 pl-6">
                {/* Avatar block */}
                <Link
                  to={r.creator_handle ? `/${r.creator_handle}?tab=content` : '#'}
                  className="relative flex-shrink-0 self-center"
                  aria-label={`Open ${label}'s feed`}
                >
                  <div
                    className={cn(
                      'relative h-14 w-14 overflow-hidden rounded-xl ring-1 ring-foreground/10',
                      'transition-transform duration-300 group-hover:scale-[1.03]',
                    )}
                  >
                    {r.creator_avatar_url ? (
                      <img
                        src={r.creator_avatar_url}
                        alt=""
                        className={cn(
                          'h-full w-full object-cover',
                          inactive && 'grayscale-[0.4] opacity-90',
                        )}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-foreground/[0.04] text-foreground/40">
                        <span className="text-lg font-bold">
                          {(label || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                </Link>

                {/* Identity + meta */}
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      to={r.creator_handle ? `/${r.creator_handle}?tab=content` : '#'}
                      className="truncate text-[15px] font-bold tracking-tight text-foreground hover:underline decoration-foreground/40 underline-offset-[3px]"
                    >
                      {label}
                    </Link>
                    <span className={cn(
                      'inline-flex items-center gap-1.5 flex-shrink-0',
                      'text-[10px] font-semibold uppercase tracking-[0.16em]',
                      theme.labelText,
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', theme.dot, variant === 'active' && 'animate-pulse')} />
                      {theme.label}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    {r.creator_handle && (
                      <span className="font-mono tracking-tight">@{r.creator_handle}</span>
                    )}
                    <span className="h-3 w-px bg-border/80" aria-hidden />
                    <span className="tabular-nums">
                      <span className="text-muted-foreground/60">{dateLabel}</span>
                      <span className="ml-1 text-foreground/70">{formatShortDate(r.period_end)}</span>
                    </span>
                  </div>
                </div>

                {/* Price */}
                <div className="flex-shrink-0 self-center text-right leading-none">
                  <p className="font-bold tabular-nums text-foreground">
                    <span className="text-xs align-top mr-0.5 text-muted-foreground/80">$</span>
                    <span className="text-2xl tracking-tight">{dollars}</span>
                    <span className="text-sm text-muted-foreground/80">.{cents}</span>
                  </p>
                  <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                    per month
                  </p>
                </div>
              </div>

              {/* Action row */}
              <div className="flex items-center justify-between gap-3 border-t border-border/50 px-6 py-2.5">
                {r.creator_handle ? (
                  <Link
                    to={`/${r.creator_handle}?tab=content`}
                    className={cn(
                      'group/cta inline-flex items-center gap-1.5',
                      'text-[11px] font-semibold tracking-tight text-foreground/80 hover:text-foreground transition-colors',
                    )}
                  >
                    <Sparkles className="h-3 w-3 text-primary" />
                    <span>Open their feed</span>
                    <ArrowUpRight className="h-3 w-3 transition-transform group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
                  </Link>
                ) : (
                  <span />
                )}

                {r.status === 'active' && !r.cancel_at_period_end ? (
                  <button
                    type="button"
                    onClick={() => setCancelTarget(r)}
                    className="text-[11px] font-medium text-muted-foreground/70 hover:text-destructive transition-colors"
                  >
                    Cancel subscription
                  </button>
                ) : variant === 'cancelling' ? (
                  <span className="text-[11px] font-medium text-amber-300/80">
                    Ends {formatShortDate(r.period_end)}
                  </span>
                ) : variant === 'past_due' ? (
                  <Link
                    to={r.creator_handle ? `/${r.creator_handle}` : '#'}
                    className="text-[11px] font-semibold text-rose-300 hover:text-rose-200 transition-colors"
                  >
                    Update card →
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footnote */}
      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
        Cancelling keeps access until the end of the paid period. No refund for the unused portion.
      </p>

      {/* Confirm dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancel subscription to {cancelTarget?.creator_name || cancelTarget?.creator_handle || 'this creator'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your subscription will stop renewing. You keep access to their feed until{' '}
              <span className="font-semibold text-foreground/90">{formatDate(cancelTarget?.period_end)}</span>.
              No refund for the unused portion of the current period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={confirmCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? 'Cancelling…' : 'Confirm cancel'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Entrance animation */}
      <style>{`
        @keyframes slideUp {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
