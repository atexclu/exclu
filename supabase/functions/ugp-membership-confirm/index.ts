/**
 * ugp-membership-confirm — UG Payments Member Postback URL handler.
 *
 * Called by UGPayments for subscription lifecycle events:
 *   Action = 'Add'      → First subscription activation
 *   Action = 'Rebill'   → Monthly renewal
 *   Action = 'Cancel'   → Subscription cancelled
 *   Action = 'Inactive' → Subscription deactivated
 *
 * Handles legacy plan 11027 creator Pro postbacks and fan→creator subscription
 * postbacks. New creators go through rebill-subscriptions cron (Phase 4 Task 4.3)
 * which bills base + extras at source — no wallet debit needed here.
 *
 * Handles:
 *   - Activating/deactivating premium status
 *   - First-time subscription flags (certification, deeplinks, etc.)
 *   - Referral commission (35% of $39.99 at each renewal)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getMidConfirmKey, midFromSiteId } from '../_shared/ugRouting.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
// Plan IDs used to disambiguate creator-premium vs fan→creator subscriptions.
// Creator plan id is the legacy one (defaults to '11027'); fan plan id is
// provisioned with UG Payment and may be unset during rollout (we just skip fan handling then).
const creatorPlanId = Deno.env.get('QUICKPAY_SUB_PLAN_ID') || '11027';
const fanPlanId = Deno.env.get('QUICKPAY_FAN_SUB_PLAN_ID') || '';

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

  const action = body.Action || '';
  const username = body.Username || ''; // This is the user.id we set as MembershipUsername
  const memberId = body.MemberId || '';
  const subscriptionPlanId = body.SubscriptionPlanId || '';
  const merchantRef = body.MerchantReference || '';
  const email = body.Email || '';

  console.log(`Membership postback: action=${action} username=${username} memberId=${memberId} planId=${subscriptionPlanId}`);

  // ── Conditional per-MID Key validation ─────────────────────────────
  // Membership Postbacks usually include `Key`, but UG portal Key fields can
  // be empty and some postbacks ship without it. Policy: if provided, MUST
  // match the per-MID expected; if absent, accept and log.
  const siteId = String(body?.SiteID ?? '');
  const midKey = midFromSiteId(siteId);
  const providedKey = String(body?.Key ?? '');

  if (providedKey) {
    let expectedKey: string;
    try {
      expectedKey = getMidConfirmKey(midKey);
    } catch (e) {
      console.error('[ugp-membership-confirm] Key provided but no env secret set for MID', { midKey, error: (e as Error).message });
      return new Response('Server misconfigured', { status: 503 });
    }
    if (providedKey !== expectedKey) {
      console.error('[ugp-membership-confirm] Key mismatch', {
        siteId,
        midKey,
        provided: providedKey.slice(0, 8) + '...',
      });
      return new Response('Unauthorized', { status: 401 });
    }
  } else {
    console.log('[ugp-membership-confirm] postback without Key', { siteId, midKey, action });
  }

  // The Username is the Supabase user.id (set during subscription checkout)
  const userId = username;
  if (!userId) {
    console.error('Missing Username (userId) in membership postback');
    return new Response('OK', { status: 200 });
  }

  // Route by SubscriptionPlanId: our creator Pro plan uses its own id, fan subs use fanPlanId.
  // If fanPlanId is unset (rollout in progress), fan postbacks fall through to the default
  // creator handler — harmless since their Username isn't a profile id and handleActivation
  // bails gracefully when no profile is found.
  const isFanSubPlan = !!fanPlanId && subscriptionPlanId === fanPlanId;

  try {
    if (isFanSubPlan) {
      // Fan → creator subscription. Username = fan_creator_subscriptions.id.
      switch (action) {
        case 'Add':
        case 'Rebill':
          await handleFanActivation(userId, memberId, action);
          break;
        case 'Cancel':
        case 'Inactive':
          await handleFanDeactivation(userId, action);
          break;
        default:
          console.warn('Unknown fan-sub membership action:', action);
      }
    } else {
      // Creator Pro subscription (existing behaviour).
      switch (action) {
        case 'Add':
        case 'Rebill':
          await handleActivation(userId, memberId, action);
          break;
        case 'Cancel':
        case 'Inactive':
          await handleDeactivation(userId, action);
          break;
        default:
          console.warn('Unknown membership action:', action);
      }
    }
  } catch (err) {
    console.error('Error processing membership postback:', err);
  }

  return new Response('OK', { status: 200 });
});

// ── ACTIVATION (Add = first sub, Rebill = renewal) ───────────────────────

async function handleActivation(userId: string, memberId: string, action: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_creator_subscribed')
    .eq('id', userId)
    .single();

  if (!profile) {
    console.error('Profile not found for subscription:', userId);
    return;
  }

  const wasSubscribed = profile.is_creator_subscribed;

  const updatePayload: Record<string, unknown> = {
    is_creator_subscribed: true,
    subscription_ugp_member_id: memberId,
    subscription_ugp_username: userId,
  };

  // First-time subscription: activate premium features
  if (!wasSubscribed) {
    updatePayload.show_join_banner = false;
    updatePayload.show_certification = true;
    updatePayload.show_deeplinks = true;
    updatePayload.show_available_now = true;
    console.log('First-time subscription activation for:', userId);
  }

  await supabase.from('profiles').update(updatePayload).eq('id', userId);

  // ── Referral commission (35% of $39.99 = 1400 cents) ──────────────
  await creditReferralCommission(userId);

  console.log(`Subscription ${action}:`, userId);
}

// ── DEACTIVATION (Cancel/Inactive) ───────────────────────────────────────

async function handleDeactivation(userId: string, action: string) {
  await supabase.from('profiles').update({
    is_creator_subscribed: false,
    show_join_banner: true,
    show_certification: false,
    show_deeplinks: false,
    show_available_now: false,
    subscription_expires_at: new Date().toISOString(),
  }).eq('id', userId);

  console.log(`Subscription ${action}:`, userId);
}

// ── Referral commission ──────────────────────────────────────────────────

async function creditReferralCommission(subscriberId: string) {
  const { data: referral } = await supabase
    .from('referrals')
    .select('id, referrer_id, commission_earned_cents')
    .eq('referred_id', subscriberId)
    .neq('status', 'inactive')
    .maybeSingle();

  if (!referral) return;

  const commissionCents = Math.round(3999 * 0.35); // $14.00

  // Increment referral commission
  await supabase.from('referrals').update({
    commission_earned_cents: (referral.commission_earned_cents || 0) + commissionCents,
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

  console.log('Referral commission:', referral.referrer_id, '+', commissionCents, 'cents');
}

// ── FAN → CREATOR SUBSCRIPTION HANDLERS ─────────────────────────────────

/**
 * Add (first activation) or Rebill (monthly renewal) on a fan subscription.
 * We extend period_end by 30 days from now. cancel_at_period_end is reset
 * because a rebill implicitly means the fan didn't cancel.
 */
async function handleFanActivation(subId: string, memberId: string, action: string) {
  const { data: sub } = await supabase
    .from('fan_creator_subscriptions')
    .select('id, status, period_end')
    .eq('id', subId)
    .single();

  if (!sub) {
    console.error('Fan sub not found for activation:', subId);
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);

  const updatePayload: Record<string, unknown> = {
    status: 'active',
    period_start: now.toISOString(),
    period_end: periodEnd.toISOString(),
    ugp_member_id: memberId,
    cancel_at_period_end: false,
  };
  // Only stamp started_at on first activation (Add action or previously pending).
  if (!sub.status || sub.status === 'pending') {
    updatePayload.started_at = now.toISOString();
  }

  await supabase.from('fan_creator_subscriptions').update(updatePayload).eq('id', subId);
  console.log(`Fan sub ${action}:`, subId, 'period_end=', periodEnd.toISOString());
}

/**
 * Cancel/Inactive on a fan subscription. We flip status to 'cancelled' and
 * stamp cancelled_at, but KEEP period_end intact — has_active_fan_subscription
 * grants access until that date.
 */
async function handleFanDeactivation(subId: string, action: string) {
  await supabase
    .from('fan_creator_subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_at_period_end: true,
    })
    .eq('id', subId);

  console.log(`Fan sub ${action}:`, subId);
}

