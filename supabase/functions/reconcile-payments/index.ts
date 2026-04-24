// supabase/functions/reconcile-payments/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrevoEmail } from '../_shared/brevo.ts';

const sb = createClient(Deno.env.get('PROJECT_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);
const secret = Deno.env.get('RECONCILE_CRON_SECRET');

serve(async (req) => {
  if (req.headers.get('Authorization')?.replace('Bearer ', '') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const anomalies: string[] = [];

  // 1. Stuck events — older than 5 minutes, still unprocessed, with an actionable state.
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: stuck } = await sb.from('payment_events')
    .select('transaction_id, merchant_reference, transaction_state, created_at')
    .eq('processed', false)
    .is('processing_error', null)
    .lt('created_at', cutoff)
    .limit(50);

  for (const e of stuck ?? []) {
    const { data: full } = await sb.from('payment_events').select('raw_payload').eq('transaction_id', e.transaction_id).single();
    if (!full?.raw_payload) continue;
    const form = new URLSearchParams(full.raw_payload as Record<string, string>);
    const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at').replace(/\/$/, '');
    try {
      await fetch(`${siteUrl}/api/ugp-confirm`, {
        method: 'POST',
        body: form.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      console.error('[reconcile] re-fire of ugp-confirm failed', e.transaction_id, err);
    }
  }

  // 2. Balance drift detection.
  const { data: drifts } = await sb.rpc('find_wallet_drift', { p_tolerance_cents: 1 });
  for (const d of drifts ?? []) {
    anomalies.push(`Wallet drift: user ${d.user_id}, projected ${d.projection_cents}, ledger ${d.ledger_cents}`);
  }

  // 3. Admin alert
  if (anomalies.length > 0) {
    await sendBrevoEmail({
      to: 'atexclu@gmail.com',
      subject: `🚨 Wallet reconciliation — ${anomalies.length} anomalies`,
      htmlContent: `<p>Ledger reconciliation detected ${anomalies.length} anomalies:</p><pre>${anomalies.join('\n')}</pre>`,
    });
  }

  return new Response(JSON.stringify({ stuckRequeued: stuck?.length ?? 0, anomalies: anomalies.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
