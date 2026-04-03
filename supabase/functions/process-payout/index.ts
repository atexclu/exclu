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

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const ADMIN_EMAILS = ['atexclu@gmail.com', 'contact@exclu.at'];

const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');
const allowedOrigins = [
  siteUrl,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = allowedOrigins.includes(origin) ? origin : siteUrl;
  return {
    'Access-Control-Allow-Origin': allowed,
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

    // Admin check
    if (!ADMIN_EMAILS.includes(user.email ?? '')) {
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
      .select('id, creator_id, amount_cents, status, bank_iban, bank_holder_name')
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
      // Re-credit the wallet
      try {
        await supabase.rpc('credit_creator_wallet', {
          p_creator_id: payout.creator_id,
          p_amount_cents: payout.amount_cents,
        });
        console.log('Wallet re-credited for rejected payout:', payout.creator_id, '+', payout.amount_cents);
      } catch (creditErr) {
        console.error('CRITICAL: Failed to re-credit wallet on payout rejection:', creditErr);
        return jsonError('Failed to re-credit wallet', 500, corsHeaders);
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
