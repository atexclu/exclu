/**
 * ugp-listener — UG Payments Listener URL for post-transaction status changes.
 *
 * Configured by UGPayments to receive POSTs for:
 *   - Refunds
 *   - Chargebacks (CBK1)
 *   - Voids (auto-void from expired pre-auth)
 *   - Captures (auto-capture if configured)
 *
 * Unlike ugp-confirm (called once at payment time), this is called
 * whenever a transaction status changes AFTER the initial payment.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrevoEmail, formatUSD } from '../_shared/brevo.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const confirmKey = Deno.env.get('QUICKPAY_CONFIRM_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: Record<string, string>;
  try {
    body = Object.fromEntries(new URLSearchParams(await req.text()));
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const transactionId = body.TransactionID || '';
  const transactionState = body.TransactionState || '';
  const merchantRef = body.MerchantReference || '';
  const amount = body.Amount || '0';

  console.log(`Listener event: state=${transactionState} txn=${transactionId} ref=${merchantRef} amount=${amount}`);

  // Log the event
  try {
    await supabase.from('payment_events').insert({
      transaction_id: `listener_${transactionId}_${transactionState}`,
      merchant_reference: merchantRef,
      amount_decimal: amount,
      transaction_state: transactionState,
      customer_email: body.CustomerEmail || null,
      raw_payload: body,
      processed: false,
    });
  } catch (logErr) {
    // Duplicate = already handled
    if ((logErr as any)?.code === '23505') {
      console.log('Duplicate listener event, skipping');
      return new Response('OK', { status: 200 });
    }
  }

  // Verify Key only when actually present in payload (standard callbacks don't include Key)
  if (confirmKey && body.Key && body.Key !== confirmKey) {
    console.error('Invalid Key in listener callback');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    switch (transactionState) {
      case 'Refund':
        await handleRefund(transactionId, merchantRef, amount);
        break;

      case 'Chargeback':
      case 'CBK1':
        await handleChargeback(transactionId, merchantRef, amount);
        break;

      case 'Void':
        await handleVoid(transactionId, merchantRef);
        break;

      case 'Capture':
        await handleCapture(transactionId, merchantRef, amount);
        break;

      default:
        console.warn('Unknown listener TransactionState:', transactionState);
    }

    // Mark event as processed
    await supabase.from('payment_events').update({
      processed: true,
      processing_result: `${transactionState} handled`,
    }).eq('transaction_id', `listener_${transactionId}_${transactionState}`);

  } catch (err) {
    console.error('Error handling listener event:', err);
    await supabase.from('payment_events').update({
      processing_error: (err as Error).message,
    }).eq('transaction_id', `listener_${transactionId}_${transactionState}`);
  }

  return new Response('OK', { status: 200 });
});

// ── Find the original transaction record ─────────────────────────────────

async function findRecordByTxnId(txnId: string): Promise<{ table: string; record: any } | null> {
  // Check purchases
  const { data: purchase } = await supabase
    .from('purchases')
    .select('id, link_id, creator_net_cents, status')
    .or(`ugp_transaction_id.eq.${txnId},stripe_session_id.eq.${txnId}`)
    .maybeSingle();
  if (purchase) return { table: 'purchases', record: purchase };

  // Check tips
  const { data: tip } = await supabase
    .from('tips')
    .select('id, creator_id, creator_net_cents, status')
    .eq('ugp_transaction_id', txnId)
    .maybeSingle();
  if (tip) return { table: 'tips', record: tip };

  // Check gifts
  const { data: gift } = await supabase
    .from('gift_purchases')
    .select('id, creator_id, creator_net_cents, status')
    .eq('ugp_transaction_id', txnId)
    .maybeSingle();
  if (gift) return { table: 'gift_purchases', record: gift };

  // Check custom requests
  const { data: request } = await supabase
    .from('custom_requests')
    .select('id, creator_id, creator_net_cents, status')
    .eq('ugp_transaction_id', txnId)
    .maybeSingle();
  if (request) return { table: 'custom_requests', record: request };

  return null;
}

async function getCreatorIdForPurchase(purchase: any): Promise<string | null> {
  const { data: link } = await supabase
    .from('links')
    .select('creator_id')
    .eq('id', purchase.link_id)
    .single();
  return link?.creator_id || null;
}

// ── REFUND ────────────────────────────────────────────────────────────────

async function handleRefund(txnId: string, merchantRef: string, amount: string) {
  const found = await findRecordByTxnId(txnId);
  if (!found) {
    console.error('Refund: could not find original transaction for:', txnId);
    return;
  }

  const { table, record } = found;

  // Update status to refunded
  await supabase.from(table).update({ status: 'refunded' }).eq('id', record.id);

  // Debit the creator's wallet for the refunded amount
  const creatorId = table === 'purchases'
    ? await getCreatorIdForPurchase(record)
    : record.creator_id;

  if (creatorId && record.creator_net_cents > 0) {
    try {
      await supabase.rpc('debit_creator_wallet', {
        p_creator_id: creatorId,
        p_amount_cents: record.creator_net_cents,
      });
      console.log('Wallet debited for refund:', creatorId, '-', record.creator_net_cents);
    } catch (err) {
      // Wallet might go negative if already withdrawn — log but continue
      console.error('Error debiting wallet for refund (may be negative):', err);
      // Force-update wallet even if it goes negative
      const { data: profile } = await supabase
        .from('profiles')
        .select('wallet_balance_cents')
        .eq('id', creatorId)
        .single();
      if (profile) {
        await supabase.from('profiles').update({
          wallet_balance_cents: profile.wallet_balance_cents - record.creator_net_cents,
        }).eq('id', creatorId);
      }
    }
  }

  // Notify admin
  await sendBrevoEmail({
    to: 'atexclu@gmail.com',
    subject: `⚠️ Refund processed — ${formatUSD(Math.round(parseFloat(amount) * 100))}`,
    htmlContent: `<p>A refund was processed for transaction ${txnId}.</p>
      <p>Table: ${table}, Record: ${record.id}</p>
      <p>Amount: $${amount}</p>
      <p>Creator wallet has been debited.</p>`,
  });

  console.log('Refund processed:', txnId, table, record.id);
}

// ── CHARGEBACK ────────────────────────────────────────────────────────────

async function handleChargeback(txnId: string, merchantRef: string, amount: string) {
  const found = await findRecordByTxnId(txnId);
  if (!found) {
    console.error('Chargeback: could not find original transaction:', txnId);
    return;
  }

  const { table, record } = found;

  await supabase.from(table).update({ status: 'refunded' }).eq('id', record.id);

  const creatorId = table === 'purchases'
    ? await getCreatorIdForPurchase(record)
    : record.creator_id;

  if (creatorId && record.creator_net_cents > 0) {
    // Force debit (chargebacks can make wallet negative)
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallet_balance_cents')
      .eq('id', creatorId)
      .single();
    if (profile) {
      await supabase.from('profiles').update({
        wallet_balance_cents: profile.wallet_balance_cents - record.creator_net_cents,
      }).eq('id', creatorId);
    }
  }

  // Alert admin immediately
  await sendBrevoEmail({
    to: 'atexclu@gmail.com',
    subject: `🚨 CHARGEBACK — ${formatUSD(Math.round(parseFloat(amount) * 100))}`,
    htmlContent: `<p><strong>A chargeback was filed!</strong></p>
      <p>Transaction: ${txnId}</p>
      <p>Table: ${table}, Record: ${record.id}</p>
      <p>Amount: $${amount}</p>
      <p>Creator ID: ${creatorId}</p>
      <p>Creator wallet has been debited. Review immediately in UGPayments merchant portal.</p>`,
  });

  console.log('Chargeback processed:', txnId);
}

// ── VOID (auto-void from expired pre-auth) ────────────────────────────────

async function handleVoid(txnId: string, merchantRef: string) {
  // Typically for custom requests that expired (6-day auto-void)
  const { data: request } = await supabase
    .from('custom_requests')
    .select('id, status')
    .eq('ugp_transaction_id', txnId)
    .maybeSingle();

  if (request && request.status === 'pending') {
    await supabase.from('custom_requests').update({
      status: 'expired',
    }).eq('id', request.id);
    console.log('Custom request auto-voided (expired):', request.id);
  } else {
    console.log('Void received but no matching pending request for:', txnId);
  }
}

// ── CAPTURE (auto-capture if configured — shouldn't happen in normal flow) ─

async function handleCapture(txnId: string, merchantRef: string, amount: string) {
  // Auto-capture from UGPayments. In normal flow, capture is done via manage-request.
  // This handles the edge case where UGPayments auto-captures before creator action.
  const { data: request } = await supabase
    .from('custom_requests')
    .select('id, creator_id, proposed_amount_cents, status')
    .eq('ugp_transaction_id', txnId)
    .maybeSingle();

  if (request && request.status === 'pending') {
    console.warn('Auto-capture received for request:', request.id, '— this should not happen in normal flow');
    // Don't credit wallet here — let manage-request handle it with proper commission calculation
  }

  console.log('Capture event received:', txnId);
}
