/**
 * ugp-membership-confirm — UG Payments Member Postback URL handler.
 *
 * Called by UGPayments for subscription lifecycle events:
 *   Action = 'Add'      → First subscription activation
 *   Action = 'Rebill'   → Monthly renewal
 *   Action = 'Cancel'   → Subscription cancelled
 *   Action = 'Inactive' → Subscription deactivated
 *
 * Handles:
 *   - Activating/deactivating premium status
 *   - First-time subscription flags (certification, deeplinks, etc.)
 *   - Referral commission (35% of $39 at each renewal)
 *   - Multi-profile addon charges (debit wallet for extra profiles)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const confirmKey = Deno.env.get('QUICKPAY_CONFIRM_KEY');

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
  const key = body.Key || '';
  const username = body.Username || ''; // This is the user.id we set as MembershipUsername
  const memberId = body.MemberId || '';
  const subscriptionPlanId = body.SubscriptionPlanId || '';
  const merchantRef = body.MerchantReference || '';
  const email = body.Email || '';

  console.log(`Membership postback: action=${action} username=${username} memberId=${memberId} planId=${subscriptionPlanId}`);

  // Verify Key (only reject if both confirmKey is set AND Key is provided but mismatched)
  if (confirmKey && key && key !== confirmKey) {
    console.error('Invalid Key in membership postback');
    return new Response('Unauthorized', { status: 401 });
  }

  // The Username is the Supabase user.id (set during subscription checkout)
  const userId = username;
  if (!userId) {
    console.error('Missing Username (userId) in membership postback');
    return new Response('OK', { status: 200 });
  }

  try {
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

  // ── Referral commission (35% of $39 = 1365 cents) ─────────────────
  await creditReferralCommission(userId);

  // ── Multi-profile addon charge (at each renewal) ──────────────────
  if (action === 'Rebill') {
    await chargeProfileAddons(userId);
  }

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

  const commissionCents = Math.round(3900 * 0.35); // $13.65

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

// ── Multi-profile addon charges ──────────────────────────────────────────

async function chargeProfileAddons(userId: string) {
  const { data: profiles } = await supabase
    .from('creator_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true);

  const profileCount = profiles?.length || 1;
  const includedProfiles = 2;
  const extraProfiles = Math.max(0, profileCount - includedProfiles);
  const addonCents = extraProfiles * 1000; // $10 per extra profile

  if (addonCents <= 0) return;

  console.log(`Addon charge: ${extraProfiles} extra profiles = ${addonCents} cents for user ${userId}`);

  try {
    await supabase.rpc('debit_creator_wallet', {
      p_creator_id: userId,
      p_amount_cents: addonCents,
    });

    await supabase.from('addon_charges').insert({
      creator_id: userId,
      amount_cents: addonCents,
      profile_count: profileCount,
      extra_profiles: extraProfiles,
      period_start: new Date().toISOString().slice(0, 10),
      period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: 'charged',
      charged_at: new Date().toISOString(),
    });

    console.log('Addon charge successful:', userId, addonCents, 'cents');
  } catch (err) {
    console.error('Addon charge failed (insufficient wallet?):', err);

    await supabase.from('addon_charges').insert({
      creator_id: userId,
      amount_cents: addonCents,
      profile_count: profileCount,
      extra_profiles: extraProfiles,
      period_start: new Date().toISOString().slice(0, 10),
      period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: 'failed',
    });

    // Send warning email to creator
    const { data: creatorAuth } = await supabase.auth.admin.getUserById(userId);
    if (creatorAuth?.user?.email) {
      const { sendBrevoEmail, formatUSD } = await import('../_shared/brevo.ts');
      await sendBrevoEmail({
        to: creatorAuth.user.email,
        subject: `⚠️ Profile addon charge failed — ${formatUSD(addonCents)}`,
        htmlContent: `<p>Your monthly addon charge of <strong>${formatUSD(addonCents)}</strong> for ${extraProfiles} additional profile(s) could not be deducted from your wallet.</p>
          <p>Please add funds to your wallet to avoid service interruption.</p>`,
      });
    }
  }
}
