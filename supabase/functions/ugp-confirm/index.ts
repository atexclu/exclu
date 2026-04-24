/**
 * ugp-confirm — UG Payments QuickPay ConfirmURL callback handler.
 *
 * Processes UGPayments payment confirmations.
 * Called by UGPayments via HTTP POST (application/x-www-form-urlencoded)
 * BEFORE the customer is redirected to the ApprovedURL.
 *
 * Handles transaction types based on MerchantReference prefix:
 *   link_<uuid> → Link purchase
 *   tip_<uuid>  → Tip
 *   gift_<uuid> → Gift wishlist purchase
 *   req_<uuid>  → Custom request (pre-auth Authorize)
 *   sub_<uuid>  → Creator subscription (handled but also goes to membership postback)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrevoEmail, escapeHtml, formatUSD } from '../_shared/brevo.ts';
import { getMidConfirmKey, midFromSiteId } from '../_shared/ugRouting.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// ── Helpers ──────────────────────────────────────────────────────────────

function parseMerchantRef(ref: string): { type: string; id: string; subPlan?: 'monthly' | 'annual' } | null {
  if (!ref) return null;
  // sub_monthly_<uuid> or sub_annual_<uuid> (new Phase 4 format)
  const subMatch = ref.match(/^sub_(monthly|annual)_(.+)$/);
  if (subMatch) return { type: 'sub', subPlan: subMatch[1] as 'monthly' | 'annual', id: subMatch[2] };
  // Legacy: sub_<uuid>, link_<uuid>, tip_<uuid>, gift_<uuid>, req_<uuid>, fsub_<uuid>
  const idx = ref.indexOf('_');
  if (idx === -1) return null;
  return { type: ref.slice(0, idx), id: ref.slice(idx + 1) };
}

function decimalToCents(d: string): number {
  return Math.round(parseFloat(d) * 100);
}

/**
 * Fire-and-forget upsert into mailing_contacts via the SECURITY DEFINER RPC.
 * Never fails the payment flow — on any error we just log and continue.
 * Phase 3 (mailing overhaul Part B.1).
 */
async function upsertMailingContactSafe(
  email: string | null | undefined,
  source: 'link_purchase' | 'tip' | 'gift' | 'custom_request',
  sourceRef: string,
  displayName?: string | null,
): Promise<void> {
  if (!email || !email.trim()) return;
  const { error } = await supabase.rpc('upsert_mailing_contact', {
    p_email: email.trim(),
    p_source: source,
    p_source_ref: sourceRef,
    p_role: 'fan',
    p_display_name: displayName ?? null,
  });
  if (error) {
    console.error(`[ugp-confirm] upsert_mailing_contact failed for ${source}`, {
      email,
      source_ref: sourceRef,
      error: error.message,
    });
  }
}

/**
 * First-success-wins: persist the fan's billing_country from a QuickPay
 * CustomerCountry field. Fire-and-forget — never blocks the credit path.
 *
 * Matches the fan by email via auth.admin.listUsers (Supabase SDK 2.43+
 * supports a `filter` arg of the form `email.eq.<value>`). If no account
 * exists for this email (guest checkout), silently skip — Task 1.1 will
 * re-capture the country on their next checkout via the PreCheckoutGate.
 *
 * Only writes when billing_country IS NULL so we don't clobber a value the
 * fan set explicitly during signup.
 */
async function persistFanBillingCountry(email: string | null, country: string | null): Promise<void> {
  if (!email) return;
  if (!country || country.length !== 2) return;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCountry = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedCountry)) return;

  try {
    const { data, error } = await supabase.auth.admin.listUsers({
      // @ts-expect-error — `filter` is supported since SDK 2.43 but types lag.
      filter: `email.eq.${normalizedEmail}`,
      perPage: 1,
    });
    if (error) {
      console.warn('[ugp-confirm] listUsers failed while persisting billing_country', error.message);
      return;
    }
    const userId = data?.users?.[0]?.id;
    if (!userId) return;
    // Defensive check: only update when the returned user email matches exactly
    if (data?.users?.[0]?.email?.toLowerCase() !== normalizedEmail) return;

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ billing_country: normalizedCountry })
      .eq('id', userId)
      .is('billing_country', null);
    if (updErr) {
      console.warn('[ugp-confirm] profiles.billing_country update failed', updErr.message);
    }
  } catch (e) {
    console.warn('[ugp-confirm] persistFanBillingCountry exception', (e as Error).message);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: Record<string, string>;
  try {
    body = Object.fromEntries(new URLSearchParams(await req.text()));
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // ── 1. Mandatory per-MID Key validation ─────────────────────────────
  const siteId = String(body?.SiteID ?? '');
  const midKey = midFromSiteId(siteId);

  let expectedKey: string;
  try {
    expectedKey = getMidConfirmKey(midKey);
  } catch (e) {
    console.error('[ugp-confirm] Missing confirm key env var', { midKey, error: (e as Error).message });
    return new Response('Server misconfigured', { status: 503 });
  }

  if (String(body?.Key ?? '') !== expectedKey) {
    console.error('[ugp-confirm] Key mismatch', {
      siteId,
      midKey,
      provided: String(body?.Key ?? '').slice(0, 8) + '...',
    });
    return new Response('Unauthorized', { status: 401 });
  }

  // ── 2. Log raw event (after key validation) ─────────────────────────
  const transactionId = body.TransactionID || '';
  const merchantRef = body.MerchantReference || '';
  const amount = body.Amount || '0';
  try {
    await supabase.from('payment_events').insert({
      transaction_id: transactionId,
      merchant_reference: merchantRef,
      amount_decimal: amount,
      transaction_state: body.TransactionState || null,
      customer_email: body.CustomerEmail || null,
      raw_payload: body,
      processed: false,
    });
  } catch (logErr) {
    // Unique constraint violation = duplicate TransactionID = already processed
    if ((logErr as any)?.code === '23505') {
      console.log('Duplicate TransactionID, already processed:', transactionId);
      return new Response('OK', { status: 200 });
    }
    console.error('Error logging payment event:', logErr);
  }

  // ── 3. Parse MerchantReference ─────────────────────────────────────
  const parsed = parseMerchantRef(merchantRef);
  if (!parsed) {
    console.error('Invalid MerchantReference format:', merchantRef);
    await markEventError(transactionId, 'Invalid MerchantReference');
    return new Response('OK', { status: 200 }); // Don't retry
  }

  const transactionState = body.TransactionState || 'Sale';
  console.log(`Processing: type=${parsed.type} id=${parsed.id} state=${transactionState} amount=${amount}`);

  // ── 3b. Filter on TransactionState — only actionable states per flow ─
  //
  // UG QuickPay POSTs ConfirmURL for multiple TransactionState values including
  // `Verify` (3DS/AVS check, before capture) and sometimes for declined attempts.
  // Prior to this filter the handler treated every callback as a successful sale,
  // crediting wallets and unlocking content for non-captured/declined payments.
  //
  // Appendix A of the UG spec: Sale | Authorize | Capture | Void | Refund |
  // Chargeback | Credit | CBK1 | Verify | Recurring
  //
  // `Capture`, `Refund`, `Chargeback`, `Void`, `CBK1` arrive via the Listener URL
  // (see ugp-listener). The ConfirmURL should only ever actually mutate state for:
  //   - Sale      → direct one-time capture (link / tip / gift / initial sub)
  //   - Authorize → pre-auth hold for custom requests (captured later)
  //
  // NOTE: Recurring (rebill) postbacks fire on the ListenerURL, NOT ConfirmURL.
  // Server-initiated /recurringtransactions calls use the async listener path.
  // A Recurring callback arriving at ConfirmURL would be a misconfiguration; it
  // will hit the non-actionable guard below and be logged + no-op'd.
  const actionableStatesByType: Record<string, ReadonlySet<string>> = {
    link: new Set(['Sale']),
    tip: new Set(['Sale']),
    gift: new Set(['Sale']),
    req: new Set(['Authorize']),
    sub: new Set(['Sale']),   // initial Sale only; rebills go to ugp-listener
    fsub: new Set(['Sale']),  // initial Sale only; rebills go to ugp-listener
  };
  const allowedStates = actionableStatesByType[parsed.type];
  if (allowedStates && !allowedStates.has(transactionState)) {
    console.log(
      `[ugp-confirm] Skipping non-actionable state: type=${parsed.type} ` +
      `state=${transactionState} ref=${merchantRef} txn=${transactionId}`,
    );
    await supabase.from('payment_events').update({
      processed: true,
      processing_result: `Skipped: state=${transactionState} not actionable for ${parsed.type}`,
    }).eq('transaction_id', transactionId);
    return new Response('OK', { status: 200 });
  }

  try {
    switch (parsed.type) {
      case 'link':
        await handleLinkPurchase(parsed.id, body);
        break;
      case 'tip':
        await handleTip(parsed.id, body);
        break;
      case 'gift':
        await handleGift(parsed.id, body);
        break;
      case 'req':
        await handleRequest(parsed.id, body, transactionState);
        break;
      case 'sub':
        await handleSubscription(parsed.id, body, parsed.subPlan ?? 'monthly');
        break;
      case 'fsub':
        await handleFanSubscription(parsed.id, body);
        break;
      default:
        console.warn('Unknown transaction type:', parsed.type);
    }

    await supabase.from('payment_events').update({
      processed: true,
      processing_result: `${parsed.type} processed successfully (state=${transactionState})`,
    }).eq('transaction_id', transactionId);

  } catch (err) {
    console.error('Error processing payment:', err);
    await markEventError(transactionId, (err as Error).message);
  }

  // Always return 200 to UGPayments (no retry mechanism)
  return new Response('OK', { status: 200 });
});

// ── Mark event as errored ────────────────────────────────────────────────

async function markEventError(txnId: string, error: string) {
  try {
    await supabase.from('payment_events').update({
      processed: false,
      processing_error: error,
    }).eq('transaction_id', txnId);
  } catch (e) {
    console.error('Failed to mark event error:', e);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// LINK PURCHASE
// ══════════════════════════════════════════════════════════════════════════

async function handleLinkPurchase(purchaseId: string, body: Record<string, string>) {
  // Load the pre-created purchase record
  const { data: purchase, error: fetchErr } = await supabase
    .from('purchases')
    .select('id, link_id, amount_cents, status, buyer_email, chat_chatter_id, chatter_earnings_cents, creator_net_cents, platform_fee_cents, chat_conversation_id')
    .eq('id', purchaseId)
    .single();

  if (fetchErr || !purchase) {
    console.error('Purchase not found:', purchaseId, fetchErr);
    return;
  }

  // Idempotency: already succeeded
  if (purchase.status === 'succeeded') {
    console.log('Purchase already succeeded:', purchaseId);
    return;
  }

  // Verify amount (tolerance of 2 cents for rounding)
  const receivedCents = decimalToCents(body.Amount);
  const expectedCents = purchase.amount_cents;
  if (Math.abs(receivedCents - expectedCents) > 2) {
    console.warn(`Amount mismatch for purchase ${purchaseId}: expected ${expectedCents}, received ${receivedCents}`);
  }

  const customerEmail = body.CustomerEmail || purchase.buyer_email || null;

  // Update purchase to succeeded (keep existing access_token from creation)
  const { error: updateErr } = await supabase.from('purchases').update({
    status: 'succeeded',
    ugp_transaction_id: body.TransactionID,
    ugp_merchant_reference: body.MerchantReference,
    buyer_email: customerEmail,
  }).eq('id', purchaseId);

  if (updateErr) {
    console.error('Error updating purchase:', updateErr);
    return;
  }

  // Phase 3: register the buyer in the mailing contacts registry
  void upsertMailingContactSafe(customerEmail, 'link_purchase', purchaseId);
  // Task 1.7: persist billing_country from CustomerCountry (first-success-wins)
  void persistFanBillingCountry(
    body.CustomerEmail ?? purchase.buyer_email ?? null,
    body.CustomerCountry ?? null,
  );

  // Load link info for email and wallet credit
  const { data: link } = await supabase
    .from('links')
    .select('id, title, slug, creator_id')
    .eq('id', purchase.link_id)
    .single();

  if (!link) {
    console.error('Link not found for purchase:', purchase.link_id);
    return;
  }

  // Credit creator wallet
  const creatorNet = purchase.creator_net_cents || 0;
  if (creatorNet > 0) {
    try {
      await supabase.rpc('credit_creator_wallet', {
        p_creator_id: link.creator_id,
        p_amount_cents: creatorNet,
      });
      console.log('Creator wallet credited:', link.creator_id, '+', creatorNet);
    } catch (walletErr) {
      console.error('Error crediting creator wallet:', walletErr);
    }
  }

  // Chatter earnings (60/25/15 split) — credit wallet + counter
  if (purchase.chat_chatter_id && purchase.chatter_earnings_cents > 0) {
    try {
      // Credit chatter's wallet (withdrawable balance)
      await supabase.rpc('credit_creator_wallet', {
        p_creator_id: purchase.chat_chatter_id,
        p_amount_cents: purchase.chatter_earnings_cents,
      });
      // Also update the chatter-specific counter
      await supabase.rpc('increment_chatter_earnings', {
        p_chatter_id: purchase.chat_chatter_id,
        p_amount_cents: purchase.chatter_earnings_cents,
      });
      console.log('Chatter wallet + earnings credited:', purchase.chat_chatter_id, '+', purchase.chatter_earnings_cents);
    } catch (err) {
      console.error('Error crediting chatter:', err);
    }
  }

  // Conversation revenue tracking
  // Track conversation revenue using base price (without fan processing fee)
  const basePriceCents = Math.round(purchase.amount_cents / 1.15);
  if (purchase.chat_conversation_id && basePriceCents > 0) {
    try {
      await supabase.rpc('increment_conversation_revenue', {
        p_conversation_id: purchase.chat_conversation_id,
        p_amount_cents: basePriceCents,
      });
    } catch (err) {
      console.error('Error incrementing conversation revenue:', err);
    }
  }

  // Send content access email via Brevo
  if (customerEmail && link.slug) {
    const accessUrl = `${siteUrl}/l/${encodeURIComponent(link.slug)}?ref=link_${purchaseId}`;
    const linkTitle = link.title || 'your exclusive content';

    const sent = await sendContentAccessEmail(customerEmail, linkTitle, accessUrl);
    if (sent) {
      await supabase.from('purchases').update({ email_sent: true }).eq('id', purchaseId);
    }
  }

  // Send creator notification email about the sale
  if (link.creator_id) {
    const { data: creator } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', link.creator_id)
      .single();

    if (creator) {
      const { data: creatorAuth } = await supabase.auth.admin.getUserById(link.creator_id);
      const creatorEmail = creatorAuth?.user?.email;
      if (creatorEmail) {
        await sendCreatorPurchaseEmail({
          creatorEmail,
          creatorName: creator.display_name || 'Creator',
          linkTitle: link.title || 'Untitled link',
          saleAmount: formatUSD(purchase.amount_cents),
          saleNet: formatUSD(creatorNet),
        });
      }
    }
  }

  // Post 'Paid' system message in chat if purchase originated from a conversation
  if (purchase.chat_conversation_id) {
    try {
      const paidMsg = `✅ Paid — "${escapeHtml(link.title || 'Link')}" purchased for ${formatUSD(purchase.amount_cents)}`;
      await supabase.from('messages').insert({
        conversation_id: purchase.chat_conversation_id,
        sender_type: 'system',
        sender_id: link.creator_id,
        content: paidMsg,
        content_type: 'system',
      });
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: paidMsg.slice(0, 100),
      }).eq('id', purchase.chat_conversation_id);
    } catch (err) {
      console.error('Error posting paid message to conversation (non-fatal):', err);
    }
  }

  // Check referral bonus ($100 when referred creator reaches $1k net in 90 days)
  await checkReferralBonus(link.creator_id);

  console.log('Link purchase completed:', purchaseId);
}

// ══════════════════════════════════════════════════════════════════════════
// TIP
// ══════════════════════════════════════════════════════════════════════════

async function handleTip(tipId: string, body: Record<string, string>) {
  const { data: tip, error: fetchErr } = await supabase
    .from('tips')
    .select('id, fan_id, creator_id, profile_id, amount_cents, status, message, is_anonymous, fan_name, creator_net_cents, platform_fee_cents')
    .eq('id', tipId)
    .single();

  if (fetchErr || !tip) {
    console.error('Tip not found:', tipId, fetchErr);
    return;
  }

  if (tip.status === 'succeeded') {
    console.log('Tip already succeeded:', tipId);
    return;
  }

  // Use pre-stored commission from tip creation (locked in at checkout time)
  // Falls back to recalculation only if values are missing (legacy records)
  const { data: creator } = await supabase
    .from('profiles')
    .select('id, is_creator_subscribed, display_name, handle')
    .eq('id', tip.creator_id)
    .single();

  let creatorNet = tip.creator_net_cents || 0;
  let totalPlatformFee = tip.platform_fee_cents || 0;

  // Fallback: recalculate if not pre-stored (e.g. legacy records)
  if (!creatorNet && tip.amount_cents > 0) {
    const commissionRate = creator?.is_creator_subscribed ? 0 : 0.15;
    const platformCommission = Math.round(tip.amount_cents * commissionRate);
    const fanFee = Math.round(tip.amount_cents * 0.15);
    creatorNet = tip.amount_cents - platformCommission;
    totalPlatformFee = platformCommission + fanFee;
  }

  const customerEmail = body.CustomerEmail || null;

  await supabase.from('tips').update({
    status: 'succeeded',
    paid_at: new Date().toISOString(),
    ugp_transaction_id: body.TransactionID,
    ugp_merchant_reference: body.MerchantReference,
    platform_fee_cents: totalPlatformFee,
    creator_net_cents: creatorNet,
    fan_email: customerEmail,
  }).eq('id', tipId);

  void upsertMailingContactSafe(customerEmail, 'tip', tipId, body.CustomerName ?? null);
  // Task 1.7: persist billing_country from CustomerCountry (first-success-wins)
  void persistFanBillingCountry(
    body.CustomerEmail ?? customerEmail ?? null,
    body.CustomerCountry ?? null,
  );

  // Credit creator wallet
  if (creatorNet > 0) {
    try {
      await supabase.rpc('credit_creator_wallet', {
        p_creator_id: tip.creator_id,
        p_amount_cents: creatorNet,
      });
    } catch (err) {
      console.error('Error crediting wallet for tip:', err);
    }
  }

  // Send creator notification email
  if (creator) {
    const { data: creatorAuth } = await supabase.auth.admin.getUserById(tip.creator_id);
    const creatorEmail = creatorAuth?.user?.email;

    if (creatorEmail) {
      await sendCreatorTipEmail({
        creatorEmail,
        creatorName: creator.display_name || 'Creator',
        tipAmount: formatUSD(tip.amount_cents),
        tipNet: formatUSD(creatorNet),
        message: tip.message,
        isAnonymous: tip.is_anonymous,
      });
    }
  }

  // Create conversation notification (non-anonymous tips)
  if (!tip.is_anonymous && tip.fan_id) {
    await ensureConversationAndNotify({
      fanId: tip.fan_id,
      creatorId: tip.creator_id,
      profileId: tip.profile_id,
      messageContent: `💰 Tip of ${formatUSD(tip.amount_cents)}${tip.message ? `: "${tip.message}"` : ''}`,
    });
  }

  console.log('Tip completed:', tipId);
}

// ══════════════════════════════════════════════════════════════════════════
// GIFT
// ══════════════════════════════════════════════════════════════════════════

async function handleGift(giftId: string, body: Record<string, string>) {
  const { data: gift, error: fetchErr } = await supabase
    .from('gift_purchases')
    .select('id, fan_id, creator_id, profile_id, wishlist_item_id, amount_cents, status, message, is_anonymous')
    .eq('id', giftId)
    .single();

  if (fetchErr || !gift) {
    console.error('Gift not found:', giftId, fetchErr);
    return;
  }

  if (gift.status === 'succeeded') {
    console.log('Gift already succeeded:', giftId);
    return;
  }

  const { data: creator } = await supabase
    .from('profiles')
    .select('id, is_creator_subscribed, display_name')
    .eq('id', gift.creator_id)
    .single();

  const commissionRate = creator?.is_creator_subscribed ? 0 : 0.15;
  const platformCommission = Math.round(gift.amount_cents * commissionRate);
  const fanFee = Math.round(gift.amount_cents * 0.15);
  const creatorNet = gift.amount_cents - platformCommission;
  const totalPlatformFee = platformCommission + fanFee;

  await supabase.from('gift_purchases').update({
    status: 'succeeded',
    paid_at: new Date().toISOString(),
    ugp_transaction_id: body.TransactionID,
    ugp_merchant_reference: body.MerchantReference,
    platform_fee_cents: totalPlatformFee,
    creator_net_cents: creatorNet,
    fan_email: body.CustomerEmail || null,
  }).eq('id', giftId);

  void upsertMailingContactSafe(body.CustomerEmail, 'gift', giftId, body.CustomerName ?? null);
  // Task 1.7: persist billing_country from CustomerCountry (first-success-wins)
  void persistFanBillingCountry(
    body.CustomerEmail ?? null,
    body.CustomerCountry ?? null,
  );

  // Increment wishlist gifted_count (read-then-write, single increment)
  const { data: item } = await supabase
    .from('wishlist_items')
    .select('gifted_count')
    .eq('id', gift.wishlist_item_id)
    .single();

  if (item) {
    await supabase.from('wishlist_items')
      .update({ gifted_count: (item.gifted_count || 0) + 1 })
      .eq('id', gift.wishlist_item_id);
  }

  // Credit creator wallet
  if (creatorNet > 0) {
    try {
      await supabase.rpc('credit_creator_wallet', {
        p_creator_id: gift.creator_id,
        p_amount_cents: creatorNet,
      });
    } catch (err) {
      console.error('Error crediting wallet for gift:', err);
    }
  }

  // Send creator notification
  if (creator) {
    const { data: creatorAuth } = await supabase.auth.admin.getUserById(gift.creator_id);
    const creatorEmail = creatorAuth?.user?.email;
    const { data: wishlistItem } = await supabase.from('wishlist_items')
      .select('name, emoji').eq('id', gift.wishlist_item_id).single();

    if (creatorEmail && wishlistItem) {
      await sendCreatorGiftEmail({
        creatorEmail,
        creatorName: creator.display_name || 'Creator',
        itemName: wishlistItem.name,
        itemEmoji: wishlistItem.emoji || '🎁',
        giftAmount: formatUSD(gift.amount_cents),
        giftNet: formatUSD(creatorNet),
        message: gift.message,
        isAnonymous: gift.is_anonymous,
      });
    }
  }

  console.log('Gift completed:', giftId);
}

// ══════════════════════════════════════════════════════════════════════════
// CUSTOM REQUEST (Pre-auth: TransactionState = 'Authorize')
// ══════════════════════════════════════════════════════════════════════════

async function handleRequest(requestId: string, body: Record<string, string>, transactionState: string) {
  const { data: request, error: fetchErr } = await supabase
    .from('custom_requests')
    .select('id, fan_id, creator_id, profile_id, description, proposed_amount_cents, status, fan_email, is_new_account')
    .eq('id', requestId)
    .single();

  if (fetchErr || !request) {
    console.error('Custom request not found:', requestId, fetchErr);
    return;
  }

  // For pre-auth (Authorize): move from pending_payment → pending
  // For direct sale (fallback): same transition
  if (request.status !== 'pending_payment') {
    console.log('Request already processed:', requestId, 'status:', request.status);
    return;
  }

  // Store the TransactionID for later capture/void
  await supabase.from('custom_requests').update({
    status: 'pending',
    ugp_transaction_id: body.TransactionID,
    ugp_merchant_reference: body.MerchantReference,
  }).eq('id', requestId);

  void upsertMailingContactSafe(request.fan_email ?? body.CustomerEmail, 'custom_request', request.id, body.CustomerName ?? null);
  // Task 1.7: persist billing_country from CustomerCountry (first-success-wins)
  void persistFanBillingCountry(
    request.fan_email ?? body.CustomerEmail ?? null,
    body.CustomerCountry ?? null,
  );

  // DO NOT credit wallet here — funds are only held (Authorize), not captured yet
  // The wallet will be credited when the creator captures via manage-request

  // Send creator notification email
  const { data: creator } = await supabase
    .from('profiles')
    .select('id, display_name, handle')
    .eq('id', request.creator_id)
    .single();

  if (creator) {
    const { data: creatorAuth } = await supabase.auth.admin.getUserById(request.creator_id);
    const creatorEmail = creatorAuth?.user?.email;
    const amtFmt = formatUSD(request.proposed_amount_cents);
    const trimDesc = (request.description || '').slice(0, 100);

    if (creatorEmail) {
      await sendBrevoEmail({
        to: creatorEmail,
        subject: `📩 New paid request — ${amtFmt} on hold`,
        htmlContent: buildRequestNotificationHtml(creator.display_name || 'Creator', amtFmt, trimDesc),
      });
    }
  }

  // Create conversation notification with rich custom_request message
  if (request.fan_id) {
    const amtFmt = formatUSD(request.proposed_amount_cents);
    const trimDesc = (request.description || '').slice(0, 80);
    await ensureConversationAndNotify({
      fanId: request.fan_id,
      creatorId: request.creator_id,
      profileId: request.profile_id,
      messageContent: `📩 Custom request for ${amtFmt}: "${trimDesc}"`,
      contentType: 'custom_request',
      customRequestId: requestId,
    });
  }

  // Send confirmation email to new fan accounts
  if (request.is_new_account && request.fan_email) {
    try {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'signup',
        email: request.fan_email,
      });
      const confirmUrl = linkData?.properties?.action_link || `${siteUrl}/auth?mode=confirm`;
      await sendBrevoEmail({
        to: request.fan_email,
        subject: '🎉 Welcome to Exclu — confirm your account',
        htmlContent: buildNewAccountConfirmHtml(confirmUrl),
      });
    } catch (err) {
      console.error('Error sending new account confirmation (non-fatal):', err);
    }
  }

  console.log('Custom request confirmed (pre-auth):', requestId);
}

// ══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION (Sale for initial payment)
// Note: Renewals go to ugp-membership-confirm via Member Postback URL
// ══════════════════════════════════════════════════════════════════════════

async function handleSubscription(userId: string, body: Record<string, string>, subPlan: 'monthly' | 'annual' = 'monthly') {
  const { data: profile } = await supabase.from('profiles')
    .select('id, subscription_plan')
    .eq('id', userId).single();
  if (!profile) {
    console.error('Profile not found for subscription:', userId);
    return;
  }

  const amountCents = Math.round(parseFloat(body.Amount || '0') * 100);
  const now = new Date();
  const periodEnd = new Date(now);
  if (subPlan === 'annual') periodEnd.setUTCDate(periodEnd.getUTCDate() + 365);
  else periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);

  // MID: infer from SiteID on the callback — the SiteID unambiguously identifies the MID.
  const siteIdFromCallback = body.SiteID || '';
  const us2dSite = Deno.env.get('QUICKPAY_SITE_ID_US_2D') || '';
  const mid = siteIdFromCallback && siteIdFromCallback === us2dSite ? 'us_2d' : 'intl_3d';

  await supabase.from('profiles').update({
    is_creator_subscribed: true,
    subscription_plan: subPlan,
    subscription_ugp_transaction_id: body.TransactionID || null,
    subscription_mid: mid,
    subscription_amount_cents: amountCents,
    subscription_period_start: now.toISOString(),
    subscription_period_end: periodEnd.toISOString(),
    subscription_cancel_at_period_end: false,
    subscription_suspended_at: null,
    show_join_banner: false,
    show_certification: true,
    show_deeplinks: true,
    show_available_now: true,
  }).eq('id', userId);

  await creditReferralCommission(userId);

  console.log(`Creator sub activated: ${userId} plan=${subPlan} amount=${amountCents} period_end=${periodEnd.toISOString()}`);
}

// ══════════════════════════════════════════════════════════════════════════
// FAN → CREATOR SUBSCRIPTION (initial Sale only — renewals/cancels go to
// ugp-membership-confirm via the Member Postback URL)
// ══════════════════════════════════════════════════════════════════════════

async function handleFanSubscription(subscriptionId: string, body: Record<string, string>) {
  const { data: sub, error: fetchErr } = await supabase
    .from('fan_creator_subscriptions')
    .select('id, fan_id, creator_profile_id, status, price_cents, period_end')
    .eq('id', subscriptionId)
    .single();

  if (fetchErr || !sub) {
    console.error('Fan subscription not found:', subscriptionId, fetchErr);
    return;
  }

  // Idempotent: already active and period still valid
  if (sub.status === 'active' && sub.period_end && new Date(sub.period_end) > new Date()) {
    console.log('Fan subscription already active:', subscriptionId);
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 30); // 30-day cycle; membership-confirm extends on Rebill

  const updatePayload: Record<string, unknown> = {
    status: 'active',
    period_start: now.toISOString(),
    period_end: periodEnd.toISOString(),
    ugp_transaction_id: body.TransactionID,
    ugp_merchant_reference: body.MerchantReference,
    cancel_at_period_end: false,
  };
  // Only stamp started_at on first activation
  if (sub.status === 'pending' || !sub.status) {
    updatePayload.started_at = now.toISOString();
  }

  const { error: updateErr } = await supabase
    .from('fan_creator_subscriptions')
    .update(updatePayload)
    .eq('id', subscriptionId);

  if (updateErr) {
    console.error('Error activating fan subscription:', updateErr);
    return;
  }

  console.log('Fan subscription activated:', subscriptionId, 'period_end=', periodEnd.toISOString());
}

// ══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════════════════════

async function creditReferralCommission(subscriberId: string) {
  const { data: referral } = await supabase
    .from('referrals')
    .select('id, referrer_id, status')
    .eq('referred_id', subscriberId)
    .neq('status', 'inactive')
    .maybeSingle();

  if (!referral) return;

  const commissionCents = Math.round(3999 * 0.35); // $14.00

  // Update referral record
  const { data: currentRef } = await supabase
    .from('referrals')
    .select('commission_earned_cents')
    .eq('id', referral.id)
    .single();

  await supabase.from('referrals').update({
    commission_earned_cents: (currentRef?.commission_earned_cents || 0) + commissionCents,
    status: 'converted',
    converted_at: new Date().toISOString(),
  }).eq('id', referral.id);

  // Credit referrer's affiliate earnings
  const { data: referrer } = await supabase
    .from('profiles')
    .select('affiliate_earnings_cents')
    .eq('id', referral.referrer_id)
    .single();

  if (referrer) {
    await supabase.from('profiles').update({
      affiliate_earnings_cents: (referrer.affiliate_earnings_cents || 0) + commissionCents,
    }).eq('id', referral.referrer_id);
  }

  console.log('Referral commission credited:', referral.referrer_id, '+', commissionCents, 'cents');
}

async function checkReferralBonus(creatorId: string) {
  try {
    const { data: referral } = await supabase
      .from('referrals')
      .select('id, referrer_id, created_at, bonus_paid_to_referred')
      .eq('referred_id', creatorId)
      .neq('status', 'inactive')
      .maybeSingle();

    if (!referral || referral.bonus_paid_to_referred) return;

    // Check if within 90 days
    const refCreated = new Date(referral.created_at);
    const now = new Date();
    const daysSince = (now.getTime() - refCreated.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 90) return;

    // Sum creator's net revenue from purchases
    const { data: creatorLinks } = await supabase
      .from('links')
      .select('id')
      .eq('creator_id', creatorId);

    if (!creatorLinks?.length) return;

    const linkIds = creatorLinks.map((l: any) => l.id);
    const { data: purchases } = await supabase
      .from('purchases')
      .select('creator_net_cents')
      .in('link_id', linkIds)
      .eq('status', 'succeeded');

    const totalNet = (purchases || []).reduce((sum: number, p: any) => sum + (p.creator_net_cents || 0), 0);

    if (totalNet >= 100000) { // $1000
      await supabase.from('referrals').update({
        bonus_paid_to_referred: true,
      }).eq('id', referral.id);

      // Credit $100 to the referred creator
      const { data: referred } = await supabase
        .from('profiles')
        .select('affiliate_earnings_cents')
        .eq('id', creatorId)
        .single();

      if (referred) {
        await supabase.from('profiles').update({
          affiliate_earnings_cents: (referred.affiliate_earnings_cents || 0) + 10000,
        }).eq('id', creatorId);
      }

      console.log('Referral $100 bonus paid to:', creatorId);
    }
  } catch (err) {
    console.error('Error checking referral bonus (non-fatal):', err);
  }
}

async function ensureConversationAndNotify(params: {
  fanId: string;
  creatorId: string;
  profileId: string | null;
  messageContent: string;
  contentType?: string;
  customRequestId?: string;
}) {
  try {
    const { fanId, creatorId, profileId, messageContent, contentType, customRequestId } = params;

    if (!profileId) return;

    // Find or create conversation
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('fan_id', fanId)
      .eq('profile_id', profileId)
      .maybeSingle();

    let conversationId = conv?.id;

    if (!conversationId) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          fan_id: fanId,
          profile_id: profileId,
          status: 'active',
          last_message_at: new Date().toISOString(),
          last_message_preview: messageContent.slice(0, 100),
        })
        .select('id')
        .single();
      conversationId = newConv?.id;
    }

    if (conversationId) {
      const msgPayload: Record<string, unknown> = {
        conversation_id: conversationId,
        sender_type: 'system',
        sender_id: creatorId,
        content: messageContent,
        content_type: contentType || 'system',
      };
      if (customRequestId) msgPayload.custom_request_id = customRequestId;

      await supabase.from('messages').insert(msgPayload);

      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messageContent.slice(0, 100),
      }).eq('id', conversationId);
    }
  } catch (err) {
    console.error('Error in ensureConversationAndNotify (non-fatal):', err);
  }
}

// ── Email templates (reusing the existing Exclu dark theme) ──────────────

async function sendContentAccessEmail(toEmail: string, linkTitle: string, accessUrl: string): Promise<boolean> {
  return sendBrevoEmail({
    to: toEmail,
    subject: `Your access to "${linkTitle}" on Exclu`,
    htmlContent: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your content is unlocked</title>
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;box-shadow:0 12px 30px rgba(0,0,0,0.55);overflow:hidden}.header{padding:28px 28px 18px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;line-height:1.3;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff;font-weight:600}.button{display:inline-block;background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.link-box{background-color:#020617;border-radius:10px;padding:14px 18px;margin:4px 0 20px;border:1px solid #1e293b;word-break:break-all}.link-box a{font-size:13px;color:#a3e635;text-decoration:none;font-family:monospace}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b;background-color:#020617}.footer a{color:#a3e635;text-decoration:none}@media(max-width:480px){.container{margin:0 10px}.content{padding:20px}.header{padding:20px}.header h1{font-size:22px}.button{padding:12px 24px;font-size:14px}}</style></head>
<body><div class="container"><div class="header"><h1>Your exclusive content is unlocked 🎉</h1></div>
<div class="content"><p>Thank you for your purchase on <strong>Exclu</strong>. Your premium content is now available.</p>
<p>Click the button below to access it instantly:</p>
<a href="${accessUrl}" class="button">Open my content</a>
<p style="font-size:13px;color:#94a3b8;margin-bottom:8px;">Or copy this link in your browser:</p>
<div class="link-box"><a href="${accessUrl}">${accessUrl}</a></div>
<p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you didn't make this purchase, you can safely ignore this email.</p></div>
<div class="footer">© 2026 Exclu — All rights reserved<br><a href="${siteUrl}">exclu</a> • <a href="${siteUrl}/terms">Terms</a> • <a href="${siteUrl}/privacy">Privacy</a></div></div></body></html>`,
  });
}

async function sendCreatorPurchaseEmail(params: {
  creatorEmail: string;
  creatorName: string;
  linkTitle: string;
  saleAmount: string;
  saleNet: string;
}): Promise<boolean> {
  const { creatorEmail, creatorName, linkTitle, saleAmount, saleNet } = params;
  return sendBrevoEmail({
    to: creatorEmail,
    subject: `🎉 New sale — "${linkTitle}" on Exclu`,
    htmlContent: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>New sale!</title>
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;overflow:hidden}.header{padding:28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff}.button{display:inline-block;background:linear-gradient(135deg,#bef264,#a3e635,#bbf7d0);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.details{background-color:#020617;border-radius:10px;border:1px solid #1e293b;overflow:hidden;margin:4px 0 24px}.detail-row{padding:14px 18px;border-bottom:1px solid #1e293b}.detail-row:last-child{border-bottom:none}.detail-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px}.detail-value{font-size:15px;color:#f1f5f9;font-weight:600;margin:0}.amount{font-size:22px;font-weight:800;color:#a3e635}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b;background-color:#020617}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>New sale! 🎉</h1></div>
<div class="content"><p>Hey <strong>${escapeHtml(creatorName)}</strong>, someone just purchased your content on <strong>Exclu</strong>.</p>
<div class="details"><div class="detail-row"><p class="detail-label">Content</p><p class="detail-value">${escapeHtml(linkTitle)}</p></div>
<div class="detail-row"><p class="detail-label">Sale amount</p><p class="detail-value amount">${saleAmount}</p></div>
<div class="detail-row"><p class="detail-label">Your earnings (after fees)</p><p class="detail-value">${saleNet}</p></div></div>
<a href="${siteUrl}/app" class="button">View in dashboard</a></div>
<div class="footer">© 2026 Exclu — All rights reserved<br><a href="${siteUrl}">exclu</a></div></div></body></html>`,
  });
}

async function sendCreatorTipEmail(params: {
  creatorEmail: string;
  creatorName: string;
  tipAmount: string;
  tipNet: string;
  message: string | null;
  isAnonymous: boolean;
}): Promise<boolean> {
  const { creatorEmail, creatorName, tipAmount, tipNet, message, isAnonymous } = params;
  const senderLabel = isAnonymous ? 'An anonymous fan' : 'A fan';
  const msgBlock = message
    ? `<div style="background-color:#020617;border-radius:10px;padding:18px;margin:20px 0;border:1px solid #1e293b;">
        <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">Message</p>
        <p style="font-size:15px;color:#f1f5f9;margin:0;line-height:1.6;font-style:italic;">"${escapeHtml(message)}"</p></div>`
    : '';

  return sendBrevoEmail({
    to: creatorEmail,
    subject: `💰 You received a tip of ${tipAmount} on Exclu`,
    htmlContent: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>You received a tip!</title>
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;overflow:hidden}.header{padding:28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff}.button{display:inline-block;background:linear-gradient(135deg,#bef264,#a3e635,#bbf7d0);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.details{background-color:#020617;border-radius:10px;border:1px solid #1e293b;overflow:hidden;margin:4px 0 24px}.detail-row{padding:14px 18px;border-bottom:1px solid #1e293b}.detail-row:last-child{border-bottom:none}.detail-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px}.detail-value{font-size:15px;color:#f1f5f9;font-weight:600;margin:0}.amount{font-size:22px;font-weight:800;color:#a3e635}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b;background-color:#020617}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>You received a tip! 💰</h1></div>
<div class="content"><p>Hey <strong>${escapeHtml(creatorName)}</strong>, great news! ${senderLabel} just sent you a tip on <strong>Exclu</strong>.</p>
<div class="details"><div class="detail-row"><p class="detail-label">Tip amount</p><p class="detail-value amount">${tipAmount}</p></div>
<div class="detail-row"><p class="detail-label">Your earnings (after fees)</p><p class="detail-value">${tipNet}</p></div>
<div class="detail-row"><p class="detail-label">From</p><p class="detail-value">${senderLabel}</p></div></div>
${msgBlock}
<a href="${siteUrl}/app" class="button">View in dashboard</a></div>
<div class="footer">© 2026 Exclu — All rights reserved<br><a href="${siteUrl}">exclu</a></div></div></body></html>`,
  });
}

async function sendCreatorGiftEmail(params: {
  creatorEmail: string;
  creatorName: string;
  itemName: string;
  itemEmoji: string;
  giftAmount: string;
  giftNet: string;
  message: string | null;
  isAnonymous: boolean;
}): Promise<boolean> {
  const { creatorEmail, creatorName, itemName, itemEmoji, giftAmount, giftNet, message, isAnonymous } = params;
  const senderLabel = isAnonymous ? 'An anonymous fan' : 'A fan';
  const msgBlock = message
    ? `<div style="background-color:#020617;border-radius:10px;padding:18px;margin:20px 0;border:1px solid #1e293b;">
        <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">Message</p>
        <p style="font-size:15px;color:#f1f5f9;margin:0;line-height:1.6;font-style:italic;">"${escapeHtml(message)}"</p></div>`
    : '';

  return sendBrevoEmail({
    to: creatorEmail,
    subject: `${itemEmoji} A fan gifted you ${escapeHtml(itemName)} on Exclu!`,
    htmlContent: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>You received a gift!</title>
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;overflow:hidden}.header{padding:28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff}.button{display:inline-block;background:linear-gradient(135deg,#bef264,#a3e635,#bbf7d0);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.details{background-color:#020617;border-radius:10px;border:1px solid #1e293b;overflow:hidden;margin:4px 0 24px}.detail-row{padding:14px 18px;border-bottom:1px solid #1e293b}.detail-row:last-child{border-bottom:none}.detail-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px}.detail-value{font-size:15px;color:#f1f5f9;font-weight:600;margin:0}.amount{font-size:22px;font-weight:800;color:#a3e635}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b;background-color:#020617}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>You received a gift! ${itemEmoji}</h1></div>
<div class="content"><p>Hey <strong>${escapeHtml(creatorName)}</strong>! ${senderLabel} just gifted you <strong>${escapeHtml(itemName)}</strong> on <strong>Exclu</strong>.</p>
<div class="details"><div class="detail-row"><p class="detail-label">Gift</p><p class="detail-value">${itemEmoji} ${escapeHtml(itemName)}</p></div>
<div class="detail-row"><p class="detail-label">Amount received</p><p class="detail-value amount">${giftAmount}</p></div>
<div class="detail-row"><p class="detail-label">Your earnings (after fees)</p><p class="detail-value">${giftNet}</p></div>
<div class="detail-row"><p class="detail-label">From</p><p class="detail-value">${senderLabel}</p></div></div>
${msgBlock}
<a href="${siteUrl}/app/wishlist" class="button">View my wishlist</a></div>
<div class="footer">© 2026 Exclu — All rights reserved<br><a href="${siteUrl}">exclu</a></div></div></body></html>`,
  });
}

function buildRequestNotificationHtml(creatorName: string, amount: string, description: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617,#0b1120);border-radius:16px;border:1px solid #1e293b;overflow:hidden}.header{padding:28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff}.button{display:inline-block;background:linear-gradient(135deg,#bef264,#a3e635,#bbf7d0);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>New paid request 📩</h1></div>
<div class="content"><p>Hey <strong>${escapeHtml(creatorName)}</strong>, a fan sent you a custom request with <strong>${amount}</strong> on hold.</p>
<p style="background:#020617;border:1px solid #1e293b;border-radius:10px;padding:14px 18px;color:#f1f5f9;font-style:italic;">"${escapeHtml(description)}"</p>
<p style="font-size:13px;color:#94a3b8;">You have 6 days to accept or decline. If you don't respond, the hold will be automatically released.</p>
<a href="${siteUrl}/app/chat" class="button">Review request in chat</a></div>
<div class="footer">© 2026 Exclu<br><a href="${siteUrl}">exclu</a></div></div></body></html>`;
}

function buildNewAccountConfirmHtml(confirmUrl: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617,#0b1120);border-radius:16px;border:1px solid #1e293b;overflow:hidden}.header{padding:28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff}.button{display:inline-block;background:linear-gradient(135deg,#bef264,#a3e635,#bbf7d0);color:#020617!important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>Welcome to Exclu 🎉</h1></div>
<div class="content"><p>Your account has been created and your custom request has been submitted!</p>
<p>Please confirm your email to access your account and track your request:</p>
<a href="${confirmUrl}" class="button">Confirm my email</a>
<p style="font-size:13px;color:#94a3b8;">If you didn't create this account, you can ignore this email.</p></div>
<div class="footer">© 2026 Exclu<br><a href="${siteUrl}">exclu</a></div></div></body></html>`;
}
