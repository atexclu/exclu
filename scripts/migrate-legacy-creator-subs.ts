// scripts/migrate-legacy-creator-subs.ts
//
// For every creator still on legacy plan 11027:
//   1. Look up their initial Sale event from `payment_events`
//      (state=Sale, prefix sub_<user_id>) — this is the TID we'll rebill.
//   2. Cancel their plan 11027 enrollment on UG so UG stops auto-rebilling.
//   3. Write subscription_ugp_transaction_id + subscription_mid on profiles.
//
// Idempotent — safe to re-run; a creator with subscription_ugp_transaction_id
// already set is skipped.

import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient('https://qexnwezetjlbwltyccks.supabase.co', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const QUICKPAY_TOKEN = Deno.env.get('QUICKPAY_TOKEN')!; // still the INTL_3D token
const QUICKPAY_SITE_ID = Deno.env.get('QUICKPAY_SITE_ID') ?? '98845';

async function cancelUgPlan(username: string) {
  // Same shape as cancel-creator-subscription's Cancel form POST.
  const body = new URLSearchParams({
    QuickpayToken: QUICKPAY_TOKEN,
    username,
    SiteID: QUICKPAY_SITE_ID,
  });
  const res = await fetch('https://quickpay.ugpayments.ch/Cancel', { method: 'POST', body });
  if (!res.ok) throw new Error(`UG cancel failed: ${res.status} ${await res.text()}`);
}

const { data: subs } = await sb.from('profiles')
  .select('id, subscription_plan, subscription_ugp_transaction_id, subscription_ugp_username, is_creator_subscribed')
  .eq('is_creator_subscribed', true)
  .is('subscription_ugp_transaction_id', null);

console.log('Migrating', subs?.length, 'creators');

for (const s of subs ?? []) {
  // 1) Find the initial Sale event (ORIGINAL TID only — Rebill events are skipped).
  const { data: event } = await sb.from('payment_events')
    .select('transaction_id, raw_payload, processed, transaction_state, created_at')
    .eq('merchant_reference', `sub_${s.id}`)
    .eq('transaction_state', 'Sale')
    .eq('processed', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!event?.transaction_id) {
    console.log('❌ no initial Sale event for', s.id);
    continue;
  }

  // 2) Cancel the UG-side plan enrollment. Safe before the TID is moved to
  //    /recurringtransactions — Derek confirmed this doesn't break rebillability.
  const username = (s.subscription_ugp_username ?? s.id) as string;
  try {
    await cancelUgPlan(username);
    console.log('   UG plan cancelled for', s.id);
  } catch (err) {
    console.error(`   UG cancel failed for ${s.id}:`, err);
    continue; // don't record TID if we couldn't cancel — we'd double-bill
  }

  // 3) Write the ORIGINAL Sale TID + MID on the profile.
  const siteId = String((event.raw_payload as any)?.SiteID ?? '');
  const us2dSite = Deno.env.get('QUICKPAY_SITE_ID_US_2D') ?? '';
  const mid = siteId && us2dSite && siteId === us2dSite ? 'us_2d' : 'intl_3d';

  await sb.from('profiles').update({
    subscription_ugp_transaction_id: event.transaction_id,
    subscription_mid: mid,
    subscription_amount_cents: 3900, // legacy base; the new cron recomputes per cycle
  }).eq('id', s.id);

  console.log('✅', s.id, 'TID', event.transaction_id, 'MID', mid);
}
