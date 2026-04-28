import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { ProDiscountOfferDialog } from '@/components/settings/ProDiscountOfferDialog';

type AccountType = 'creator' | 'fan' | 'chatter' | 'agency';

interface Block {
  type: 'pending_custom_requests' | 'in_flight_payouts' | 'chatter_wallet_nonzero';
  count?: number;
  amount_cents?: number;
  cta_label: string;
  cta_url: string;
  message: string;
}

interface Warning {
  type:
    | 'wallet_forfeit'
    | 'active_fan_subs'
    | 'creator_pro_active'
    | 'legal_retention'
    | 'fan_active_subs'
    | 'handle_reservation';
  message: string;
  metadata?: Record<string, unknown>;
}

interface RetentionOffer {
  eligible: boolean;
  monthly_amount_cents: number;
}

interface PreDeleteResult {
  account_type: AccountType;
  email: string;
  handle: string | null;
  can_delete: boolean;
  blocks: Block[];
  warnings: Warning[];
  retention_offer?: RetentionOffer;
}

interface DeleteAccountFlowProps {
  backUrl: string;
}

export function DeleteAccountFlow({ backUrl }: DeleteAccountFlowProps) {
  const navigate = useNavigate();
  const [check, setCheck] = useState<PreDeleteResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [acks, setAcks] = useState<Record<string, boolean>>({});
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRetentionOffer, setShowRetentionOffer] = useState(false);

  const loadCheck = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.functions.invoke('pre-delete-check', {
        body: {},
      });
      if (error) {
        const msg = (error as { message?: string })?.message || 'Failed to load deletion preflight';
        setLoadError(msg);
        return;
      }
      const result = data as PreDeleteResult;
      setCheck(result);
      // Reset acknowledgements whenever we re-fetch
      setAcks({});
    } catch (e) {
      setLoadError((e as Error)?.message || 'Failed to load deletion preflight');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usesHandleConfirm = useMemo(() => {
    if (!check) return false;
    return check.account_type === 'creator' || check.account_type === 'agency';
  }, [check]);

  const expectedConfirmation = useMemo(() => {
    if (!check) return '';
    if (usesHandleConfirm) return check.handle ?? '';
    return check.email ?? '';
  }, [check, usesHandleConfirm]);

  const allWarningsAcked = useMemo(() => {
    if (!check) return false;
    return check.warnings.every((w) => acks[w.type]);
  }, [check, acks]);

  const confirmationMatches = useMemo(() => {
    if (!check) return false;
    const normalized = confirmation.trim().toLowerCase();
    if (!normalized) return false;
    if (usesHandleConfirm) {
      const stripped = normalized.startsWith('@') ? normalized.slice(1) : normalized;
      return stripped === expectedConfirmation.toLowerCase();
    }
    return normalized === expectedConfirmation.toLowerCase();
  }, [check, confirmation, expectedConfirmation, usesHandleConfirm]);

  const canDelete =
    !!check && check.can_delete && allWarningsAcked && confirmationMatches && !isDeleting;

  /** Click handler on the "Permanently delete" button. If the user is a
   *  monthly Pro creator who never claimed the retention discount, intercept
   *  with the offer dialog before submitting. The dialog's onDeclined runs
   *  the actual deletion. */
  const handleDeleteClick = () => {
    if (!canDelete) return;
    if (check?.retention_offer?.eligible) {
      setShowRetentionOffer(true);
      return;
    }
    void handleDelete();
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirmation: confirmation.trim() },
      });

      if (error) {
        // Supabase functions client surfaces non-2xx as `error` with FunctionsHttpError.
        // 409 indicates new blocks appeared between preflight and submit — re-fetch.
        const ctx = (error as { context?: Response })?.context;
        let status: number | undefined;
        let serverMsg: string | undefined;
        if (ctx && typeof ctx.status === 'number') {
          status = ctx.status;
          try {
            const cloned = ctx.clone();
            const body = await cloned.json();
            serverMsg = (body as { error?: string })?.error;
          } catch {
            // ignore JSON parse error
          }
        }
        if (status === 409) {
          toast.error(
            serverMsg
              ? `Cannot delete yet: ${serverMsg}. We refreshed the checks above.`
              : 'New blocks appeared. Please review and try again.',
          );
          await loadCheck();
          setConfirmation('');
          return;
        }
        toast.error(serverMsg || (error as Error).message || 'Failed to delete account');
        return;
      }

      const ok = (data as { success?: boolean } | null)?.success;
      if (!ok) {
        toast.error('Delete request did not complete. Please try again.');
        return;
      }

      try {
        await supabase.auth.signOut();
      } catch {
        // ignore — server already banned the user
      }
      toast.success('Your account has been deleted.');
      navigate('/', { replace: true });
    } catch (e) {
      toast.error((e as Error)?.message || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Back link */}
        <button
          type="button"
          onClick={() => navigate(backUrl)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <header className="mb-8">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full border border-red-500/30 bg-red-500/10 text-red-300 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            Danger zone
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Delete your account
          </h1>
          <p className="text-sm text-muted-foreground">
            This action is permanent. Your personal data will be hidden everywhere on Exclu and
            you will be signed out immediately.
          </p>
        </header>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Checking your account…
          </div>
        )}

        {!isLoading && loadError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300">
            <p className="font-medium mb-2">We couldn&apos;t check your account.</p>
            <p className="text-red-300/80 mb-4">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadCheck}
              className="rounded-full border-red-500/40 text-red-300 hover:bg-red-500/10"
            >
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !loadError && check && (
          <div className="space-y-6">
            {/* Account summary */}
            <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Account
              </p>
              <p className="text-sm font-medium text-foreground">{check.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                {check.account_type}
                {check.handle ? ` · @${check.handle}` : ''}
              </p>
            </div>

            {/* Blocks */}
            {check.blocks.length > 0 && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-5 sm:p-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-red-300 mb-1">
                    Resolve these before deleting
                  </h2>
                  <p className="text-xs text-red-300/70">
                    Each item below blocks deletion. Resolve them, then come back to this page.
                  </p>
                </div>
                <ul className="space-y-3">
                  {check.blocks.map((b) => (
                    <li
                      key={b.type}
                      className="rounded-xl border border-red-500/30 bg-red-500/5 p-4"
                    >
                      <p className="text-sm text-red-200 mb-3">{b.message}</p>
                      <a
                        href={b.cta_url}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-200 underline underline-offset-4 hover:text-red-100"
                      >
                        {b.cta_label}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadCheck}
                  className="rounded-full border-red-500/40 text-red-300 hover:bg-red-500/10"
                >
                  Re-check
                </Button>
              </div>
            )}

            {/* Warnings (only shown when no blocks remain) */}
            {check.can_delete && check.warnings.length > 0 && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 sm:p-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-amber-300 mb-1">
                    Please confirm you understand
                  </h2>
                  <p className="text-xs text-amber-300/70">
                    Tick every item below to acknowledge the consequences of deleting your
                    account.
                  </p>
                </div>
                <ul className="space-y-3">
                  {check.warnings.map((w) => {
                    const id = `ack-${w.type}`;
                    return (
                      <li key={w.type} className="flex items-start gap-3">
                        <Checkbox
                          id={id}
                          checked={!!acks[w.type]}
                          onCheckedChange={(value) =>
                            setAcks((prev) => ({ ...prev, [w.type]: value === true }))
                          }
                          className="mt-0.5 border-amber-500/50 data-[state=checked]:bg-amber-500 data-[state=checked]:text-amber-950"
                        />
                        <label
                          htmlFor={id}
                          className="text-sm text-amber-100/90 cursor-pointer leading-relaxed"
                        >
                          {w.message}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Confirm + delete (only when no blocks) */}
            {check.can_delete && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-5 sm:p-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-red-300 mb-1">
                    Final confirmation
                  </h2>
                  <p className="text-xs text-red-300/80">
                    Type{' '}
                    <span className="font-mono font-semibold">
                      {usesHandleConfirm ? `@${expectedConfirmation}` : expectedConfirmation}
                    </span>{' '}
                    below to confirm. This cannot be undone.
                  </p>
                </div>
                <Input
                  type={usesHandleConfirm ? 'text' : 'email'}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={
                    usesHandleConfirm ? `@${expectedConfirmation}` : expectedConfirmation
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="h-11 bg-background border-red-500/30 text-foreground"
                />
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(backUrl)}
                    className="rounded-full"
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={!canDelete}
                    className="rounded-full bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/30 disabled:text-red-100/60"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      'Permanently delete my account'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {check?.retention_offer?.eligible && (
        <ProDiscountOfferDialog
          open={showRetentionOffer}
          onOpenChange={setShowRetentionOffer}
          context="delete_attempt"
          monthlyAmountCents={check.retention_offer.monthly_amount_cents}
          onAccepted={() => {
            // Discount granted — abort deletion entirely. The RPC has already
            // cleared subscription_cancel_at_period_end and stamped the
            // discount flags. Send the user back to where they came from.
            toast.success('Account kept active. Discount applies at next monthly rebill.');
            navigate(backUrl);
          }}
          onDeclined={() => {
            // User declined the retention offer — proceed with deletion.
            void handleDelete();
          }}
        />
      )}
    </div>
  );
}
