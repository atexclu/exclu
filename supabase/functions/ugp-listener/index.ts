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
import { getMidConfirmKey, midFromSiteId } from '../_shared/ugRouting.ts';
import { reverseWalletTransaction } from '../_shared/ledger.ts';

// ─────────────────────────────────────────────────────────────────────────
// IMPORTANT — DO NOT add `is_user_active` checks or filter `deleted_at` here.
// Webhook callbacks for transactions initiated before the creator's account
// deletion (or refunds/chargebacks years later) must remain processable, or
// money is lost. The wallet ledger is the source of truth and is keyed by
// user_id regardless of deletion state.
// ─────────────────────────────────────────────────────────────────────────

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
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

  // ── Conditional per-MID Key validation (before any DB write) ─────────
  // UG only sends `Key` on Membership Postbacks. Listener callbacks for
  // Capture/Refund/Chargeback/Void/CBK1/Recurring may or may not include it
  // depending on the event. Policy: if a Key is provided it MUST match the
  // per-MID expected value; absence is accepted and logged (HTTPS is the
  // trust channel on the non-sub event path).
  const siteId = String(body?.SiteID ?? '');
  const midKey = midFromSiteId(siteId);
  const providedKey = String(body?.Key ?? '');

  if (providedKey) {
    let expectedKey: string;
    try {
      expectedKey = getMidConfirmKey(midKey);
    } catch (e) {
      console.error('[ugp-listener] Key provided but no env secret set for MID', { midKey, error: (e as Error).message });
      return new Response('Server misconfigured', { status: 503 });
    }
    if (providedKey !== expectedKey) {
      console.error('[ugp-listener] Key mismatch', {
        siteId,
        midKey,
        provided: providedKey.slice(0, 8) + '...',
      });
      return new Response('Unauthorized', { status: 401 });
    }
  } else {
    console.log('[ugp-listener] callback without Key', { siteId, midKey, state: transactionState });
  }

  // Log the event
  // Scrub CardMask (BIN+last4 masked PAN, fails merchant guideline #5) and
  // BankMessage (issuer decline detail) before persisting raw_payload.
  // Derive IsTestCard from CardMask before stripping so audit scripts keep
  // their test-card detection.
  const sanitizedPayload: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'CardMask' || k === 'BankMessage') continue;
    sanitizedPayload[k] = v;
  }
  if (typeof body.CardMask === 'string' && /^(4242|5555|0000)/.test(body.CardMask)) {
    sanitizedPayload.IsTestCard = '1';
  } else if (body.CardMask) {
    sanitizedPayload.IsTestCard = '0';
  }
  try {
    await supabase.from('payment_events').insert({
      transaction_id: `listener_${transactionId}_${transactionState}`,
      merchant_reference: merchantRef,
      amount_decimal: amount,
      transaction_state: transactionState,
      customer_email: body.CustomerEmail || null,
      raw_payload: sanitizedPayload,
      processed: false,
    });
  } catch (logErr) {
    // Duplicate = already handled
    if ((logErr as any)?.code === '23505') {
      console.log('Duplicate listener event, skipping');
      return new Response('OK', { status: 200 });
    }
  }

  // UG sends listener events for both Successful and Declined Sales.
  // Crediting on a Declined Sale is a false positive (same bug as ugp-confirm).
  // Gate Sale / Capture / Recurring on TransactionStatus='Successful'. Refund,
  // Chargeback, CBK1, Void are status-agnostic reversals and should run as-is.
  const txStatus = String(body.TransactionStatus ?? '');
  const statusGatedStates = new Set(['Sale', 'Capture', 'Recurring']);
  if (statusGatedStates.has(transactionState) && txStatus && txStatus !== 'Successful') {
    console.log(
      `[ugp-listener] Skipping non-successful ${transactionState}: status=${txStatus} ` +
      `txn=${transactionId} ref=${merchantRef}`,
    );
    await supabase.from('payment_events').update({
      processed: true,
      processing_result: `Skipped: TransactionStatus=${txStatus} on ${transactionState}`,
    }).eq('transaction_id', `listener_${transactionId}_${transactionState}`);
    return new Response('OK', { status: 200 });
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

      case 'Recurring':
        await handleRecurring(body);
        break;

      case 'Sale':
        await handleListenerSale(body);
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

  // Reverse every ledger credit tied to this transaction (creator AND chatter alike).
  const { data: credits } = await supabase
    .from('wallet_transactions')
    .select('id, owner_id, owner_kind, amount_cents, source_type')
    .eq('source_transaction_id', txnId)
    .eq('direction', 'credit');

  for (const c of credits ?? []) {
    try {
      await reverseWalletTransaction(supabase, {
        parentRowId: c.id,
        sourceType: 'refund',
        sourceTransactionId: txnId,
        metadata: { refund_amount_decimal: amount },
      });
    } catch (err) {
      console.error(`[listener] refund reversal failed for ledger row ${c.id}`, err);
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

  // Reverse every ledger credit tied to this transaction (chargebacks may drive balance negative — accepted).
  const { data: credits } = await supabase
    .from('wallet_transactions')
    .select('id, owner_id, owner_kind, amount_cents, source_type')
    .eq('source_transaction_id', txnId)
    .eq('direction', 'credit');

  for (const c of credits ?? []) {
    try {
      await reverseWalletTransaction(supabase, {
        parentRowId: c.id,
        sourceType: 'chargeback',
        sourceTransactionId: txnId,
        metadata: { chargeback_amount_decimal: amount },
      });
    } catch (err) {
      console.error(`[listener] chargeback reversal failed for ledger row ${c.id}`, err);
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

// ── RECURRING (server-initiated rebill postback) ──────────────────────────

async function handleRecurring(body: Record<string, string>) {
  const trackingId = body.TrackingId || '';
  const transactionStatus = body.TransactionStatus || '';
  const rebillTid = body.TransactionID || '';
  const referenceTid = body.ReferenceTransactionId || '';
  const amountCents = Math.round(parseFloat(body.Amount || '0') * 100);

  // Correlate back to our rebill_attempts row via TrackingId (we passed it as rebill_attempts.id)
  let attempt: any = null;
  if (trackingId) {
    const { data } = await supabase.from('rebill_attempts')
      .select('*')
      .eq('id', trackingId)
      .maybeSingle();
    attempt = data;
  }

  // Fallback: no TrackingId echoed — find the most recent pending/success attempt for this reference_transaction_id.
  if (!attempt && referenceTid) {
    const { data } = await supabase.from('rebill_attempts')
      .select('*')
      .eq('reference_transaction_id', referenceTid)
      .in('status', ['pending', 'success'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    attempt = data;
  }

  if (!attempt) {
    console.error('handleRecurring: no rebill_attempts match for TrackingId=%s ref=%s', trackingId, referenceTid);
    return;
  }

  const isSuccessful = (transactionStatus === 'Successful' || transactionStatus === 'Approved');
  const finalStatus = isSuccessful ? 'success' : 'declined';

  await supabase.from('rebill_attempts').update({
    status: finalStatus,
    ugp_transaction_id: rebillTid || attempt.ugp_transaction_id,
    listener_confirmed_at: new Date().toISOString(),
  }).eq('id', attempt.id);

  if (!isSuccessful) {
    console.log('handleRecurring: decline recorded for attempt', attempt.id);
    return;
  }

  // Safety-net: if the sync-response path failed to advance the period, do it here.
  if (attempt.subject_table === 'profiles') {
    const { data: creator } = await supabase.from('profiles')
      .select('subscription_plan, subscription_period_end')
      .eq('id', attempt.subject_id)
      .maybeSingle();
    if (creator && creator.subscription_period_end && new Date(creator.subscription_period_end) <= new Date()) {
      const now = new Date();
      const nextEnd = new Date(now);
      if (creator.subscription_plan === 'annual') nextEnd.setUTCDate(nextEnd.getUTCDate() + 365);
      else nextEnd.setUTCDate(nextEnd.getUTCDate() + 30);
      await supabase.from('profiles').update({
        subscription_amount_cents: amountCents,
        subscription_period_start: now.toISOString(),
        subscription_period_end: nextEnd.toISOString(),
        subscription_suspended_at: null,
      }).eq('id', attempt.subject_id);
      console.log('handleRecurring: advanced subscription_period_end for', attempt.subject_id);
    }
  } else if (attempt.subject_table === 'fan_creator_subscriptions') {
    const { data: sub } = await supabase.from('fan_creator_subscriptions')
      .select('next_rebill_at')
      .eq('id', attempt.subject_id)
      .maybeSingle();
    if (sub && sub.next_rebill_at && new Date(sub.next_rebill_at) <= new Date()) {
      const now = new Date();
      const nextEnd = new Date(now); nextEnd.setUTCDate(nextEnd.getUTCDate() + 30);
      await supabase.from('fan_creator_subscriptions').update({
        period_start: now.toISOString(),
        period_end: nextEnd.toISOString(),
        next_rebill_at: nextEnd.toISOString(),
        suspended_at: null,
      }).eq('id', attempt.subject_id);
    }
  }

  // NOTE: wallet credit for the creator on fan-sub rebills happens in Task 8.3
  // Step 4 (ledger integration). This listener is reconciliation-only until then.
}

// ── SALE (safety-net — Sales normally go through ConfirmURL) ─────────────

async function handleListenerSale(body: Record<string, string>) {
  // Safety net for Sales that hit the ListenerURL but never the ConfirmURL.
  //
  // Symptom we're fixing (observed 2026-04-27): some Sale callbacks arrive
  // ONLY on the listener (not on ConfirmURL). The previous implementation
  // just logged the event to payment_events and did nothing else, so the
  // ledger never received a credit row even though the fan's wallet/access
  // got updated by other paths (verify-payment, frontend fallbacks). Result:
  // hourly reconcile-payments emailing wallet drift.
  //
  // Fix: we replay ugp-confirm with the listener body. ugp-confirm has the
  // full handleLink/handleTip/handleGift/etc. logic; replaying it on a
  // listener-only Sale does exactly what the missing ConfirmURL would have
  // done, and re-runs are safe because applyWalletTransaction is idempotent
  // on (owner_id, source_type, direction, source_transaction_id).
  const transactionId = body.TransactionID || '';
  if (!transactionId) return;

  const { data: existing } = await supabase.from('payment_events')
    .select('id, processed')
    .eq('transaction_id', transactionId)
    .maybeSingle();
  if (existing?.processed) return;

  const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at').replace(/\/$/, '');
  const form = new URLSearchParams(body);
  try {
    const res = await fetch(`${siteUrl}/api/ugp-confirm`, {
      method: 'POST',
      body: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) {
      console.error(`[ugp-listener] re-fire of ugp-confirm returned ${res.status} for TID ${transactionId}`);
    } else {
      console.log(`[ugp-listener] re-fired ugp-confirm successfully for listener-only Sale TID ${transactionId}`);
    }
  } catch (err) {
    console.error('[ugp-listener] re-fire of ugp-confirm failed', transactionId, err);
  }
}
