// supabase/functions/_shared/ledger.ts
//
// Single entry point for every wallet mutation. All edge functions must use
// these helpers; direct UPDATEs against profiles.wallet_balance_cents /
// total_earned_cents / chatter_earnings_cents are forbidden (Task 8.6 CI check).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type LedgerSource =
  | 'link_purchase'
  | 'tip'
  | 'gift_purchase'
  | 'custom_request'
  | 'creator_subscription'
  | 'fan_subscription'
  | 'chatter_commission'
  | 'payout_hold'
  | 'payout_failure'
  | 'refund'
  | 'chargeback'
  | 'manual_adjustment';

interface ApplyArgs {
  ownerId: string;
  ownerKind: 'creator' | 'chatter';
  direction: 'credit' | 'debit';
  amountCents: number;
  sourceType: LedgerSource;
  sourceId?: string | null;
  sourceTransactionId?: string | null;
  sourceUgpMid?: string | null;
  parentId?: string | null;
  metadata?: Record<string, unknown> | null;
  adminNotes?: string | null;
}

/**
 * Apply a ledger row + projection update atomically.
 * Idempotent on (owner, source_type, direction, tid | source_id).
 * Returns the ledger row id (new or existing).
 */
const CHATTER_ALLOWED_SOURCES: LedgerSource[] = [
  'chatter_commission',
  'refund',
  'chargeback',
  'manual_adjustment',
];

export async function applyWalletTransaction(
  sb: SupabaseClient,
  args: ApplyArgs,
): Promise<string> {
  if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) {
    throw new Error(`applyWalletTransaction: invalid amount ${args.amountCents}`);
  }
  if (args.ownerKind === 'chatter' && !CHATTER_ALLOWED_SOURCES.includes(args.sourceType)) {
    throw new Error(
      `applyWalletTransaction: chatter credits not allowed on source_type=${args.sourceType}`,
    );
  }
  const { data, error } = await sb.rpc('apply_wallet_transaction', {
    p_owner_id: args.ownerId,
    p_owner_kind: args.ownerKind,
    p_direction: args.direction,
    p_amount_cents: args.amountCents,
    p_source_type: args.sourceType,
    p_source_id: args.sourceId ?? null,
    p_source_transaction_id: args.sourceTransactionId ?? null,
    p_source_ugp_mid: args.sourceUgpMid ?? null,
    p_parent_id: args.parentId ?? null,
    p_metadata: args.metadata ?? null,
    p_admin_notes: args.adminNotes ?? null,
  });
  if (error) throw new Error(`apply_wallet_transaction failed: ${error.message}`);
  return data as string;
}

/**
 * Reverse a previously applied ledger row. Writes a new row with opposite
 * direction + same amount, linked via parent_id. Idempotent — replaying the
 * reversal a second time short-circuits on the unique index.
 */
export async function reverseWalletTransaction(
  sb: SupabaseClient,
  args: {
    parentRowId: string;
    sourceType: LedgerSource;
    sourceTransactionId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<string> {
  const { data: parent, error: fetchErr } = await sb
    .from('wallet_transactions')
    .select('owner_id, owner_kind, direction, amount_cents, source_id, source_ugp_mid')
    .eq('id', args.parentRowId)
    .single();
  if (fetchErr || !parent) throw new Error(`parent row not found: ${args.parentRowId}`);
  if (parent.direction !== 'credit') throw new Error(`cannot reverse a non-credit row ${args.parentRowId}`);

  return applyWalletTransaction(sb, {
    ownerId: parent.owner_id,
    ownerKind: parent.owner_kind,
    direction: 'debit',
    amountCents: parent.amount_cents,
    sourceType: args.sourceType,
    sourceId: parent.source_id,
    sourceTransactionId: args.sourceTransactionId ?? null,
    sourceUgpMid: parent.source_ugp_mid,
    parentId: args.parentRowId,
    metadata: args.metadata ?? null,
  });
}
