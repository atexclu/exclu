// supabase/functions/reconcile-payments/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrevoEmail } from '../_shared/brevo.ts';
import { ugpRefund, UgpApiError } from '../_shared/ugp-api.ts';

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

  // 3. Custom request expiry — refund any pending request whose 6-day
  //    window elapsed without a creator response. Sale model: we issue a
  //    full REST refund and flip status to 'expired'. The fan is notified
  //    via email by the existing helper inside manage-request, but we
  //    emit our own minimal email here since we don't go through that
  //    function (this is a service-role path).
  let expiredRefunded = 0;
  let expiredFailed = 0;
  const { data: expired } = await sb.from('custom_requests')
    .select('id, ugp_transaction_id, ugp_mid, proposed_amount_cents, fan_id, fan_email, description, creator_id')
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .limit(50);

  for (const req of expired ?? []) {
    if (!req.ugp_transaction_id) {
      // No payment ever confirmed — just mark expired, no refund needed.
      await sb.from('custom_requests')
        .update({ status: 'expired', read_at: new Date().toISOString() })
        .eq('id', req.id);
      continue;
    }

    const refundAmount = (req.proposed_amount_cents + Math.round(req.proposed_amount_cents * 0.15)) / 100;
    try {
      await ugpRefund(req.ugp_transaction_id, refundAmount, req.ugp_mid as 'us_2d' | 'intl_3d' | null);
    } catch (err) {
      const ugpErr = err as UgpApiError;
      if (!ugpErr.isAlreadyProcessed) {
        expiredFailed++;
        anomalies.push(`Custom request ${req.id} expiry refund failed: ${ugpErr.message}`);
        continue;
      }
    }

    await sb.from('custom_requests')
      .update({ status: 'expired', read_at: new Date().toISOString() })
      .eq('id', req.id);
    expiredRefunded++;

    // Notify fan (guest or registered) — registered fans get the auth email,
    // guests get fan_email straight from the row.
    let toEmail: string | null = req.fan_email ?? null;
    if (!toEmail && req.fan_id) {
      const { data: fanAuth } = await sb.auth.admin.getUserById(req.fan_id);
      toEmail = fanAuth?.user?.email ?? null;
    }
    if (toEmail) {
      const amount = `$${(req.proposed_amount_cents / 100).toFixed(2)}`;
      const desc = (req.description || '').slice(0, 100);
      try {
        await sendBrevoEmail({
          to: toEmail,
          subject: `Your custom request (${amount}) expired — refund issued`,
          htmlContent: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#020617;color:#e2e8f0;padding:32px"><div style="max-width:560px;margin:0 auto;background:#0b1120;border:1px solid #1e293b;border-radius:16px;padding:28px"><h1 style="font-size:20px;color:#f9fafb;margin:0 0 16px">Your request expired ⏱️</h1><p style="font-size:14px;line-height:1.7;color:#cbd5e1">The creator did not respond to your <strong>${amount}</strong> request within 6 days. We have refunded your card in full — the amount should reappear on your statement within a few business days.</p><p style="font-size:13px;color:#94a3b8">Request: &ldquo;${desc.replace(/[<>"&]/g, '')}&rdquo;</p></div></body></html>`,
        });
      } catch (mailErr) {
        console.error('[reconcile] expiry email failed', req.id, mailErr);
      }
    }
  }

  // 4. Admin alert
  if (anomalies.length > 0) {
    await sendBrevoEmail({
      to: 'atexclu@gmail.com',
      subject: `🚨 Wallet reconciliation — ${anomalies.length} anomalies`,
      htmlContent: `<p>Ledger reconciliation detected ${anomalies.length} anomalies:</p><pre>${anomalies.join('\n')}</pre>`,
    });
  }

  return new Response(JSON.stringify({
    stuckRequeued: stuck?.length ?? 0,
    expiredRefunded,
    expiredFailed,
    anomalies: anomalies.length,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
