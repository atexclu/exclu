/**
 * ProDiscountOfferDialog
 *
 * Last-chance retention offer shown when a monthly Pro creator attempts to
 * cancel their subscription OR delete their account. One-time 50% off the
 * next monthly rebill. Once claimed, subscription_cancel_at_period_end is
 * cleared and the parent flow aborts (no cancel, no delete).
 *
 * Eligibility (all required, checked client-side AND enforced server-side):
 *   - subscription_plan === 'monthly'
 *   - subscription_suspended_at IS NULL
 *   - creator_pro_discount_used_at IS NULL
 *
 * The dialog accepts an `eligible` boolean from the parent — it only renders
 * when the parent confirms the user is in an eligible state. This prevents
 * showing the offer to non-monthly users or to monthly users who already
 * claimed.
 */

import { useState } from 'react';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: 'cancel_attempt' | 'delete_attempt';
  /** Current monthly amount in cents — used for the headline price. */
  monthlyAmountCents: number;
  /** Called when the user accepts and the discount is granted. Parent should
   *  abort the cancellation/deletion flow and refresh subscription state. */
  onAccepted: () => void;
  /** Called when the user declines (continues to cancel/delete). */
  onDeclined: () => void;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ProDiscountOfferDialog({
  open,
  onOpenChange,
  context,
  monthlyAmountCents,
  onAccepted,
  onDeclined,
}: Props) {
  const [busy, setBusy] = useState(false);
  const discountedCents = Math.floor(monthlyAmountCents / 2);

  const handleAccept = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('claim-creator-pro-discount', {
        body: { context },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) {
        const msg = error.message || 'Unable to claim discount';
        toast.error(msg);
        return;
      }
      const result = data as { success?: boolean; discounted_amount_cents?: number };
      if (result?.success) {
        toast.success(
          `50% off applied. Your next monthly bill will be ${formatUsd(result.discounted_amount_cents ?? discountedCents)}.`,
        );
        onOpenChange(false);
        onAccepted();
      } else {
        toast.error('Unable to claim discount');
      }
    } catch (e) {
      toast.error((e as Error).message || 'Unable to claim discount');
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = () => {
    onOpenChange(false);
    onDeclined();
  };

  const continueLabel =
    context === 'delete_attempt'
      ? 'Continue with deletion'
      : 'Continue with cancellation';

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Wait — a one-time gift before you go</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              <p>
                Get <strong>50% off your next month</strong> of Creator Pro. Your next bill drops from{' '}
                <span className="line-through text-muted-foreground">{formatUsd(monthlyAmountCents)}</span>{' '}
                to{' '}
                <strong className="text-emerald-400">{formatUsd(discountedCents)}</strong>.
              </p>
              <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
                <li>Applies automatically at your next monthly rebill.</li>
                <li>One-time offer — available once per account, ever.</li>
                <li>After that cycle, you go back to {formatUsd(monthlyAmountCents)}/month.</li>
                <li>You can still cancel anytime later.</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            onClick={handleDecline}
            disabled={busy}
            className="text-muted-foreground"
          >
            {continueLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleAccept}
            disabled={busy}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {busy ? 'Applying…' : `Claim 50% off — ${formatUsd(discountedCents)}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
