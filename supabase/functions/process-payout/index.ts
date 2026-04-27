/**
 * process-payout — Admin marks a payout as completed or rejected.
 *
 * When completed: sends confirmation email to creator, updates payout status + processed_at.
 * When rejected: re-credits the wallet, sends notification email, updates payout status.
 *
 * Request body: { payout_id, action: 'complete' | 'reject', admin_notes? }
 * Auth: Required (admin only — checked via profiles.role or hardcoded admin list)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrevoEmail, formatUSD } from '../_shared/brevo.ts';
import { reverseWalletTransaction } from '../_shared/ledger.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');
const allowedOrigins = [
  siteUrl,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const isAllowed = allowedOrigins.includes(origin)
    || /^https:\/\/exclu-[a-z0-9-]+-atexclus-projects\.vercel\.app$/.test(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : siteUrl,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonOk(data: Record<string, unknown>, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function jsonError(msg: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return jsonError('Authentication required', 401, corsHeaders);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return jsonError('Authentication required', 401, corsHeaders);

    // Admin check — use profiles.is_admin (same pattern as every other
    // admin-* edge function) instead of a hardcoded email list.
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('id, is_admin')
      .eq('id', user.id)
      .single();
    if (!adminProfile || adminProfile.is_admin !== true) {
      return jsonError('Admin access required', 403, corsHeaders);
    }

    const body = await req.json();
    const payoutId = body?.payout_id as string;
    const action = body?.action as string; // 'complete' | 'reject'
    const adminNotes = typeof body?.admin_notes === 'string' ? body.admin_notes.trim().slice(0, 500) : null;

    if (!payoutId) return jsonError('Missing payout_id', 400, corsHeaders);
    if (!['complete', 'reject'].includes(action)) return jsonError('Invalid action (complete or reject)', 400, corsHeaders);

    // Fetch the payout
    const { data: payout, error: payoutErr } = await supabase
      .from('payouts')
      .select('id, creator_id, amount_cents, status, bank_iban, bank_holder_name, bank_account_type, bank_account_number, bank_routing_number, bank_bsb, bank_bic, bank_country')
      .eq('id', payoutId)
      .single();

    if (payoutErr || !payout) return jsonError('Payout not found', 404, corsHeaders);
    if (!['pending', 'approved', 'processing'].includes(payout.status)) {
      return jsonError(`Payout is already ${payout.status}`, 400, corsHeaders);
    }

    // Get creator info for email
    const { data: creatorAuth } = await supabase.auth.admin.getUserById(payout.creator_id);
    const creatorEmail = creatorAuth?.user?.email;
    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('display_name, handle')
      .eq('id', payout.creator_id)
      .single();
    const creatorName = creatorProfile?.display_name || creatorProfile?.handle || creatorEmail || 'Creator';

    if (action === 'complete') {
      // Detect legacy payouts (created before the wallet_transactions ledger
      // existed). Migration 160 (`reconcile_wallets_ug_truth`) already
      // counted these pending payouts into profiles.total_withdrawn_cents,
      // so calling increment_total_withdrawn now would DOUBLE-COUNT and
      // inflate total_withdrawn by the payout amount.
      //
      // We detect "legacy" via the absence of a `payout_hold` ledger row —
      // post-refonte request-withdrawal always writes one before issuing
      // the payout. If it's missing, the payout pre-dates the ledger.
      const { data: holdRow } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('source_type', 'payout_hold')
        .eq('source_id', payoutId)
        .eq('direction', 'debit')
        .maybeSingle();

      if (holdRow) {
        // Modern payout: bump the cumulative tracker. Wallet debit already
        // happened at request-withdrawal time via the payout_hold row.
        await supabase.rpc('increment_total_withdrawn', {
          p_user_id: payout.creator_id,
          p_amount_cents: payout.amount_cents,
        });
      } else {
        console.warn(
          `[process-payout] complete: no payout_hold ledger row for ${payoutId} ` +
          `— skipping increment_total_withdrawn to avoid double-counting (migration 160 already reconciled).`,
        );
      }

      // Mark as completed
      const { error: updateErr } = await supabase
        .from('payouts')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          admin_notes: adminNotes,
        })
        .eq('id', payoutId);

      if (updateErr) {
        console.error('Error updating payout:', updateErr);
        return jsonError('Failed to update payout', 500, corsHeaders);
      }

      // Email creator
      if (creatorEmail) {
        const maskedIban = payout.bank_iban
          ? `${payout.bank_iban.slice(0, 4)} ${'••••'.repeat(3)} ${payout.bank_iban.slice(-4)}`
          : '••••';
        await sendBrevoEmail({
          to: creatorEmail,
          subject: `Your withdrawal of ${formatUSD(payout.amount_cents)} has been processed`,
          htmlContent: `<div style="font-family:system-ui;padding:20px;background:#020617;color:#f9fafb;border-radius:12px;">
            <h2>Withdrawal completed ✅</h2>
            <p style="color:#cbd5e1;">Your withdrawal of <strong style="color:#a3e635;">${formatUSD(payout.amount_cents)}</strong> has been transferred to your bank account (${maskedIban}).</p>
            <p style="color:#cbd5e1;">Please allow up to <strong>7 business days</strong> for the funds to appear on your account.</p>
            <p style="color:#64748b;font-size:13px;margin-top:20px;">If you have questions, contact us at contact@exclu.at.</p>
          </div>`,
        });
      }

      console.log('Payout completed:', payoutId, formatUSD(payout.amount_cents), 'for', creatorName);
      return jsonOk({ success: true, status: 'completed' }, corsHeaders);
    }

    if (action === 'reject') {
      // Find the payout_hold ledger row so we can reverse it (credit funds back).
      const { data: holdRow } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('source_type', 'payout_hold')
        .eq('source_id', payoutId)
        .eq('direction', 'debit')
        .maybeSingle();

      if (holdRow) {
        try {
          await reverseWalletTransaction(supabase, {
            parentRowId: holdRow.id,
            sourceType: 'payout_failure',
            metadata: { rejection_reason: adminNotes ?? null },
          });
          console.log('Wallet re-credited via ledger reversal for rejected payout:', payoutId);
        } catch (creditErr) {
          console.error('CRITICAL: Failed to reverse ledger hold on payout rejection:', creditErr);
          return jsonError('Failed to re-credit wallet', 500, corsHeaders);
        }
      } else {
        // Legacy payout that pre-dates the ledger — no hold row to reverse.
        // Skip ledger reversal; reconciliation cron (Task 8.7) handles these.
        console.warn(`[process-payout] reject: no payout_hold ledger row for payout ${payoutId} — legacy row?`);
      }

      // Mark as rejected
      const { error: updateErr } = await supabase
        .from('payouts')
        .update({
          status: 'rejected',
          processed_at: new Date().toISOString(),
          admin_notes: adminNotes,
          rejection_reason: adminNotes || 'Rejected by admin',
        })
        .eq('id', payoutId);

      if (updateErr) {
        console.error('Error updating payout after rejection:', updateErr);
      }

      // Email creator
      if (creatorEmail) {
        await sendBrevoEmail({
          to: creatorEmail,
          subject: `Your withdrawal request has been declined`,
          htmlContent: `<div style="font-family:system-ui;padding:20px;background:#020617;color:#f9fafb;border-radius:12px;">
            <h2>Withdrawal declined</h2>
            <p style="color:#cbd5e1;">Your withdrawal request of <strong>${formatUSD(payout.amount_cents)}</strong> has been declined. The funds have been returned to your wallet.</p>
            ${adminNotes ? `<p style="color:#cbd5e1;">Reason: <em>${adminNotes}</em></p>` : ''}
            <p style="color:#64748b;font-size:13px;margin-top:20px;">If you have questions, contact us at contact@exclu.at.</p>
          </div>`,
        });
      }

      console.log('Payout rejected:', payoutId, 'for', creatorName, 'wallet re-credited');
      return jsonOk({ success: true, status: 'rejected' }, corsHeaders);
    }

    return jsonError('Invalid action', 400, corsHeaders);
  } catch (error) {
    console.error('Error in process-payout:', error);
    return jsonError('Internal server error', 500, corsHeaders);
  }
});
