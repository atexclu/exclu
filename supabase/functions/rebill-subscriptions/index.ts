// supabase/functions/rebill-subscriptions/index.ts
//
// Daily cron: finds creator subs and fan subs whose period ends today or
// earlier, rebills them via /recurringtransactions on the MID used for the
// original Sale, and updates state accordingly.
//
// Auth: requires Authorization: Bearer <REBILL_CRON_SECRET>

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getMidCredentials } from '../_shared/ugRouting.ts';
import { rebillTransaction } from '../_shared/ugRebill.ts';
import { emailRebillFailedRetry, emailRebillSuspended, emailFanSubSuspended } from '../_shared/rebillEmails.ts';
import { applyWalletTransaction } from '../_shared/ledger.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('REBILL_CRON_SECRET');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_DAYS = [0, 3, 4]; // total ~7 days across 3 attempts
const BASE_MONTHLY_CENTS = 3999;    // $39.99
const ADDON_PER_PROFILE_CENTS = 1000;
const INCLUDED_PROFILES = 2;
const ANNUAL_CENTS = 23999;         // $239.99

async function computeCreatorMonthlyAmount(userId: string): Promise<number> {
  const { data: profiles } = await supabase.from('creator_profiles')
    .select('id').eq('user_id', userId).eq('is_active', true);
  const count = Math.max(1, profiles?.length ?? 1);
  const extras = Math.max(0, count - INCLUDED_PROFILES);
  return BASE_MONTHLY_CENTS + extras * ADDON_PER_PROFILE_CENTS;
}

async function rebillCreatorSubscription(creator: any): Promise<void> {
  const mid = creator.subscription_mid as 'us_2d' | 'intl_3d' | null;
  const tid = creator.subscription_ugp_transaction_id as string | null;
  if (!mid || !tid) {
    console.error(`[rebill] creator ${creator.id}: missing mid or tid, skipping`);
    return;
  }

  const plan = creator.subscription_plan as 'monthly' | 'annual';
  const amount = plan === 'annual'
    ? ANNUAL_CENTS
    : await computeCreatorMonthlyAmount(creator.id);

  const creds = getMidCredentials(mid);

  // ── Idempotency guard (D8 — UG does NOT dedupe /recurringtransactions)
  //
  // We compute a cycle bucket from the subscription_period_end date. A unique
  // constraint on (subject_table, subject_id, cycle_bucket) on rebill_attempts
  // ensures only one in-flight attempt per billing cycle. We INSERT with
  // status='pending' BEFORE calling /recurringtransactions and skip on conflict.
  // The row id is used as TrackingId so the async listener postback can
  // correlate back (D9).
  const cycleBucket = String(creator.subscription_period_end).slice(0, 10); // YYYY-MM-DD

  const { data: attemptInsert, error: attemptInsertErr } = await supabase
    .from('rebill_attempts')
    .insert({
      subject_table: 'profiles',
      subject_id: creator.id,
      ugp_mid: mid,
      reference_transaction_id: tid,
      amount_cents: amount,
      cycle_bucket: cycleBucket,
      status: 'pending',
    })
    .select('id')
    .single();

  if (attemptInsertErr) {
    // 23505 = unique_violation → another cron run is already working this cycle.
    if ((attemptInsertErr as any).code === '23505') {
      console.log(`[rebill] creator ${creator.id} cycle ${cycleBucket} already in flight, skipping`);
      return;
    }
    throw attemptInsertErr;
  }
  const attemptId = (attemptInsert as any).id as string;

  // Count REAL historical attempts (pending excluded — same as declined/error/transient)
  const { count: priorFinal } = await supabase.from('rebill_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('subject_table', 'profiles').eq('subject_id', creator.id)
    .neq('id', attemptId)
    .in('status', ['declined', 'error']);
  const attemptNumber = (priorFinal ?? 0) + 1;

  // Pass TrackingId = attemptId so the listener postback echoes it back.
  const result = await rebillTransaction(creds, tid, amount, attemptId);

  await supabase.from('rebill_attempts').update({
    attempt_number: attemptNumber,
    status: result.classification,
    ugp_response: result.raw,
    ugp_transaction_id: result.transactionId,
    reason_code: result.reasonCode,
    message: result.message,
    responded_at: new Date().toISOString(),
  }).eq('id', attemptId);

  if (result.success) {
    const now = new Date();
    const nextEnd = new Date(now);
    if (plan === 'annual') nextEnd.setUTCDate(nextEnd.getUTCDate() + 365);
    else nextEnd.setUTCDate(nextEnd.getUTCDate() + 30);

    // Referral commission on rebill — 35% of the actual rebill amount.
    // LEDGER FIRST — before advancing the period.
    try {
      const { data: referral } = await supabase
        .from('referrals')
        .select('id, referrer_id')
        .eq('referred_id', creator.id)
        .neq('status', 'inactive')
        .maybeSingle();

      if (referral) {
        const commissionCents = Math.round(amount * 0.35);
        await applyWalletTransaction(supabase, {
          ownerId: referral.referrer_id,
          ownerKind: 'creator',
          direction: 'credit',
          amountCents: commissionCents,
          sourceType: 'creator_subscription',
          sourceId: referral.id,
          sourceTransactionId: result.transactionId ?? null,
          metadata: { kind: 'referral_commission_rebill', subscriber_id: creator.id, rebill_amount_cents: amount },
        });
        console.log(`[rebill] referral commission credited: ${referral.referrer_id} +${commissionCents}`);
      }
    } catch (refErr) {
      // Non-fatal: log and continue — period advance must not be blocked by referral
      console.error('[rebill] referral commission failed (non-fatal):', (refErr as Error).message);
    }

    await supabase.from('profiles').update({
      subscription_amount_cents: amount,
      subscription_period_start: now.toISOString(),
      subscription_period_end: nextEnd.toISOString(),
      subscription_suspended_at: null,
      // NEVER overwrite subscription_ugp_transaction_id — only the ORIGINAL Sale TID is rebillable.
    }).eq('id', creator.id);
    console.log(`[rebill] creator ${creator.id} accepted, next: ${nextEnd.toISOString()}`);
    return;
  }

  // Transient failure (network / UG 5xx / Pending status) — do NOT count
  // against the attempt cap. Just leave period_end untouched so next cron
  // run tries again. We still log the attempt for observability.
  if (result.classification === 'transient') {
    console.warn(`[rebill] creator ${creator.id} transient failure, will retry next cron run`, result.message);
    return;
  }

  // Real decline / error — retry N times, then suspend.
  if (attemptNumber >= MAX_ATTEMPTS) {
    await supabase.from('profiles').update({
      is_creator_subscribed: false,
      subscription_plan: 'free',
      subscription_suspended_at: new Date().toISOString(),
      show_certification: false,
      show_deeplinks: false,
      show_available_now: false,
    }).eq('id', creator.id);
    const { data: authUser } = await supabase.auth.admin.getUserById(creator.id);
    const creatorEmail = authUser?.user?.email;
    if (creatorEmail) {
      await emailRebillSuspended(creatorEmail, '', amount).catch((e) => console.warn('[rebill] emailRebillSuspended failed', e));
    }
    console.log(`[rebill] creator ${creator.id} suspended after ${attemptNumber} attempts`);
    return;
  }

  // Schedule retry
  const retryIn = RETRY_DELAY_DAYS[Math.min(attemptNumber, RETRY_DELAY_DAYS.length - 1)];
  const nextTry = new Date(Date.now() + retryIn * 86400000);
  await supabase.from('profiles').update({
    subscription_period_end: nextTry.toISOString(),
  }).eq('id', creator.id);
  const { data: authUser } = await supabase.auth.admin.getUserById(creator.id);
  const creatorEmail = authUser?.user?.email;
  if (creatorEmail) {
    await emailRebillFailedRetry(creatorEmail, '', amount, attemptNumber, nextTry).catch((e) => console.warn('[rebill] emailRebillFailedRetry failed', e));
  }
  console.log(`[rebill] creator ${creator.id} retry scheduled for ${nextTry.toISOString()}`);
}

async function rebillFanSubscription(sub: any): Promise<void> {
  const mid = sub.ugp_mid as 'us_2d' | 'intl_3d' | null;
  const tid = sub.ugp_transaction_id as string | null;
  if (!mid || !tid) {
    console.error(`[rebill] fan sub ${sub.id}: missing mid or tid, skipping`);
    return;
  }
  const amount = sub.price_cents as number; // grandfathered — locked at subscribe time
  const creds = getMidCredentials(mid);

  // Idempotency guard — same pattern as creator rebill (see D8).
  const cycleBucket = String(sub.next_rebill_at).slice(0, 10);

  const { data: attemptInsert, error: attemptInsertErr } = await supabase
    .from('rebill_attempts')
    .insert({
      subject_table: 'fan_creator_subscriptions',
      subject_id: sub.id,
      ugp_mid: mid,
      reference_transaction_id: tid,
      amount_cents: amount,
      cycle_bucket: cycleBucket,
      status: 'pending',
    })
    .select('id')
    .single();

  if (attemptInsertErr) {
    if ((attemptInsertErr as any).code === '23505') {
      console.log(`[rebill] fan sub ${sub.id} cycle ${cycleBucket} already in flight, skipping`);
      return;
    }
    throw attemptInsertErr;
  }
  const attemptId = (attemptInsert as any).id as string;

  const { count: priorFinal } = await supabase.from('rebill_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('subject_table', 'fan_creator_subscriptions').eq('subject_id', sub.id)
    .neq('id', attemptId)
    .in('status', ['declined', 'error']);
  const attemptNumber = (priorFinal ?? 0) + 1;

  const result = await rebillTransaction(creds, tid, amount, attemptId);

  await supabase.from('rebill_attempts').update({
    attempt_number: attemptNumber,
    status: result.classification,
    ugp_response: result.raw,
    ugp_transaction_id: result.transactionId,
    reason_code: result.reasonCode,
    message: result.message,
    responded_at: new Date().toISOString(),
  }).eq('id', attemptId);

  if (result.success) {
    const now = new Date();
    const nextEnd = new Date(now); nextEnd.setUTCDate(nextEnd.getUTCDate() + 30);

    // Fetch the creator's plan to compute commission rate — LEDGER FIRST.
    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('subscription_plan')
      .eq('id', sub.creator_user_id)
      .single();
    const platformRate = creatorProfile?.subscription_plan === 'free' ? 0.15 : 0;
    const creatorNetCents = Math.round(amount * (1 - platformRate));

    await applyWalletTransaction(supabase, {
      ownerId: sub.creator_user_id,
      ownerKind: 'creator',
      direction: 'credit',
      amountCents: creatorNetCents,
      sourceType: 'fan_subscription',
      sourceId: sub.id,
      sourceTransactionId: result.transactionId ?? null,
      sourceUgpMid: sub.ugp_mid ?? null,
      metadata: {
        fan_id: sub.fan_id,
        cycle_amount_cents: amount,
        platform_rate: platformRate,
        kind: 'rebill',
      },
    });
    console.log(`[rebill] fan sub ledger credited: creator=${sub.creator_user_id} +${creatorNetCents}`);

    await supabase.from('fan_creator_subscriptions').update({
      period_start: now.toISOString(),
      period_end: nextEnd.toISOString(),
      next_rebill_at: nextEnd.toISOString(),
      suspended_at: null,
    }).eq('id', sub.id);
    return;
  }

  // Transient failure — don't burn an attempt slot, just wait for the next cron.
  if (result.classification === 'transient') {
    console.warn(`[rebill] fan sub ${sub.id} transient failure, will retry next cron run`, result.message);
    return;
  }

  if (attemptNumber >= MAX_ATTEMPTS) {
    await supabase.from('fan_creator_subscriptions').update({
      status: 'past_due',
      suspended_at: new Date().toISOString(),
    }).eq('id', sub.id);
    const { data: fanUser } = await supabase.auth.admin.getUserById(sub.fan_id);
    const fanEmail = fanUser?.user?.email;
    const { data: creatorProfileRow } = await supabase.from('profiles').select('display_name, handle').eq('id', sub.creator_user_id).maybeSingle();
    const creatorName = creatorProfileRow?.display_name || creatorProfileRow?.handle || 'your creator';
    if (fanEmail) {
      await emailFanSubSuspended(fanEmail, creatorName, amount).catch((e) => console.warn('[rebill] emailFanSubSuspended failed', e));
    }
    return;
  }

  const retryIn = RETRY_DELAY_DAYS[Math.min(attemptNumber, RETRY_DELAY_DAYS.length - 1)];
  const next = new Date(Date.now() + retryIn * 86400000);
  await supabase.from('fan_creator_subscriptions').update({
    next_rebill_at: next.toISOString(),
  }).eq('id', sub.id);
}

serve(async (req) => {
  // Auth gate
  const providedSecret = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date().toISOString();

  // ── Creator subs ─────────────────────────────────────────────────
  const { data: creators } = await supabase.from('profiles')
    .select('id, subscription_plan, subscription_ugp_transaction_id, subscription_mid, subscription_period_end, subscription_cancel_at_period_end, subscription_suspended_at')
    .in('subscription_plan', ['monthly', 'annual'])
    .lte('subscription_period_end', now)
    .is('subscription_suspended_at', null);

  let creatorOk = 0, creatorFail = 0;
  for (const c of creators ?? []) {
    if (c.subscription_cancel_at_period_end) {
      await supabase.from('profiles').update({
        is_creator_subscribed: false,
        subscription_plan: 'free',
      }).eq('id', c.id);
      continue;
    }
    try {
      await rebillCreatorSubscription(c);
      creatorOk++;
    } catch (e) {
      console.error('rebill creator error', c.id, e);
      creatorFail++;
    }
  }

  // ── Fan subs ─────────────────────────────────────────────────────
  // NB: extra select fields needed by Task 8.3 Step 4 (ledger credit per cycle).
  // Also pull the creator_profile so we can skip subs whose creator has
  // disabled fan subscriptions or whose profile was deactivated mid-cycle.
  const { data: fanSubs } = await supabase.from('fan_creator_subscriptions')
    .select(`
      id, fan_id, creator_user_id, creator_profile_id, ugp_transaction_id, ugp_mid,
      price_cents, next_rebill_at, cancel_at_period_end,
      creator_profile:creator_profiles!fan_creator_subscriptions_creator_profile_id_fkey(
        is_active, fan_subscription_enabled
      )
    `)
    .eq('status', 'active')
    .lte('next_rebill_at', now)
    .is('suspended_at', null);

  let fanOk = 0, fanFail = 0, fanSkipped = 0;
  for (const s of fanSubs ?? []) {
    if (s.cancel_at_period_end) {
      await supabase.from('fan_creator_subscriptions').update({ status: 'cancelled' }).eq('id', s.id);
      continue;
    }
    // Creator took down their sub feature or deactivated the profile → skip
    // the rebill (their intent is "no more subs"). Mark the sub cancelled so
    // the fan doesn't keep seeing "active" in their dashboard.
    const creatorProfile = (s as any).creator_profile;
    if (!creatorProfile?.is_active || !creatorProfile?.fan_subscription_enabled) {
      await supabase.from('fan_creator_subscriptions')
        .update({ status: 'cancelled', cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
        .eq('id', s.id);
      fanSkipped++;
      continue;
    }
    try {
      await rebillFanSubscription(s);
      fanOk++;
    } catch (e) {
      console.error('rebill fan sub error', s.id, e);
      fanFail++;
    }
  }

  return new Response(JSON.stringify({ creatorOk, creatorFail, fanOk, fanFail, fanSkipped }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
