/**
 * request-withdrawal — Creator requests a payout from their wallet.
 *
 * Validates balance, creates a payout record, debits the wallet atomically,
 * and notifies admin via email.
 *
 * Request body: { amount_cents }
 * Auth: Required (creator)
 * Returns: { success: true, payout_id, new_balance }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrevoEmail, formatUSD } from '../_shared/brevo.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const MIN_WITHDRAWAL_CENTS = 5000; // $50 minimum

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

// Rate limiting: 3 req/min/IP (stricter for withdrawals)
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;
const ipHits = new Map<string, { count: number; windowStart: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const e = ipHits.get(ip);
  if (!e || now - e.windowStart > RATE_LIMIT_WINDOW_MS) { ipHits.set(ip, { count: 1, windowStart: now }); return false; }
  e.count++;
  return e.count > RATE_LIMIT_MAX;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) return jsonError('Too many requests', 429, corsHeaders);

  try {
    // Auth required
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return jsonError('Authentication required', 401, corsHeaders);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return jsonError('Authentication required', 401, corsHeaders);

    // Fetch profile with bank details — balance comes from DB, not from frontend
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, wallet_balance_cents, payout_setup_complete, bank_iban, bank_holder_name, bank_bic, bank_account_type, bank_account_number, bank_routing_number, bank_bsb, bank_country, display_name, handle')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) return jsonError('Profile not found', 400, corsHeaders);

    if (!profile.payout_setup_complete) {
      return jsonError('Please set up your bank details before requesting a withdrawal', 400, corsHeaders);
    }

    // Amount to withdraw = entire wallet balance (server-side, not from client)
    const amountCents = profile.wallet_balance_cents as number;

    if (!amountCents || amountCents < MIN_WITHDRAWAL_CENTS) {
      return jsonError(`Minimum withdrawal is ${formatUSD(MIN_WITHDRAWAL_CENTS)}. Your balance: ${formatUSD(amountCents)}`, 400, corsHeaders);
    }

    // Check for existing pending/approved withdrawal
    const { data: pendingPayout } = await supabase
      .from('payouts')
      .select('id')
      .eq('creator_id', user.id)
      .in('status', ['pending', 'approved', 'processing'])
      .limit(1);

    if (pendingPayout && pendingPayout.length > 0) {
      return jsonError('You already have a pending withdrawal. Please wait for it to be processed.', 400, corsHeaders);
    }

    // Debit wallet atomically (FOR UPDATE prevents race conditions)
    let newBalance: number;
    try {
      const { data: balance, error: debitErr } = await supabase.rpc('debit_creator_wallet', {
        p_creator_id: user.id,
        p_amount_cents: amountCents,
      });

      if (debitErr) throw debitErr;
      newBalance = balance as number;
    } catch (debitErr: any) {
      console.error('Wallet debit failed:', debitErr);
      if (debitErr.message?.includes('insufficient')) {
        return jsonError('Insufficient balance', 400, corsHeaders);
      }
      return jsonError('Failed to process withdrawal', 500, corsHeaders);
    }

    // Create payout record (snapshot bank details at time of request)
    const { data: payout, error: payoutErr } = await supabase
      .from('payouts')
      .insert({
        creator_id: user.id,
        amount_cents: amountCents,
        currency: 'USD',
        status: 'pending',
        bank_account_type: profile.bank_account_type || 'iban',
        bank_iban: profile.bank_iban,
        bank_holder_name: profile.bank_holder_name,
        bank_bic: profile.bank_bic,
        bank_account_number: profile.bank_account_number,
        bank_routing_number: profile.bank_routing_number,
        bank_bsb: profile.bank_bsb,
        bank_country: profile.bank_country,
        requested_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (payoutErr || !payout) {
      console.error('Error creating payout record:', payoutErr);
      // Critical: wallet was debited but payout record failed — try to re-credit
      try {
        await supabase.rpc('credit_creator_wallet', {
          p_creator_id: user.id,
          p_amount_cents: amountCents,
        });
        console.log('Wallet re-credited after payout record failure');
      } catch (recreditErr) {
        console.error('CRITICAL: Failed to re-credit wallet after payout failure:', recreditErr);
      }
      return jsonError('Failed to create withdrawal request', 500, corsHeaders);
    }

    // Notify admin via email
    const creatorName = profile.display_name || profile.handle || user.email || 'Unknown';
    await sendBrevoEmail({
      to: 'contact@exclu.at',
      subject: `💸 Withdrawal request — ${formatUSD(amountCents)} from ${creatorName}`,
      htmlContent: `<div style="font-family:system-ui;padding:20px;background:#020617;color:#f9fafb;border-radius:12px;">
        <h2>New withdrawal request</h2>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          <tr><td style="padding:8px;color:#94a3b8;">Creator</td><td style="padding:8px;font-weight:600;">${creatorName}</td></tr>
          <tr><td style="padding:8px;color:#94a3b8;">Amount</td><td style="padding:8px;font-weight:600;color:#a3e635;">${formatUSD(amountCents)}</td></tr>
          <tr><td style="padding:8px;color:#94a3b8;">Account type</td><td style="padding:8px;">${(profile.bank_account_type || 'iban').toUpperCase()}</td></tr>
          <tr><td style="padding:8px;color:#94a3b8;">Holder</td><td style="padding:8px;">${profile.bank_holder_name}</td></tr>
          <tr><td style="padding:8px;color:#94a3b8;">Bank details</td><td style="padding:8px;font-family:monospace;">${profile.bank_iban ? 'IBAN: ' + profile.bank_iban.slice(0, 4) + ' •••• ' + profile.bank_iban.slice(-4) : profile.bank_account_number ? 'Acct: ••••' + (profile.bank_account_number as string).slice(-4) : '—'}</td></tr>
          <tr><td style="padding:8px;color:#94a3b8;">New wallet balance</td><td style="padding:8px;">${formatUSD(newBalance)}</td></tr>
          <tr><td style="padding:8px;color:#94a3b8;">User ID</td><td style="padding:8px;font-family:monospace;font-size:12px;">${user.id}</td></tr>
          <tr><td style="padding:8px;color:#94a3b8;">Payout ID</td><td style="padding:8px;font-family:monospace;font-size:12px;">${payout.id}</td></tr>
        </table>
        <p style="color:#64748b;font-size:13px;">Process this withdrawal via bank transfer, then mark as completed in the admin panel.</p>
      </div>`,
    });

    // Confirm to creator via email
    if (user.email) {
      await sendBrevoEmail({
        to: user.email,
        subject: `Withdrawal request received — ${formatUSD(amountCents)}`,
        htmlContent: `<div style="font-family:system-ui;padding:20px;background:#020617;color:#f9fafb;border-radius:12px;">
          <h2>Your withdrawal request has been submitted ✅</h2>
          <p style="color:#cbd5e1;">We've received your request to withdraw <strong style="color:#a3e635;">${formatUSD(amountCents)}</strong> to your bank account${profile.bank_iban ? ' ending in ****' + profile.bank_iban.slice(-4) : profile.bank_account_number ? ' ending in ****' + (profile.bank_account_number as string).slice(-4) : ''}.</p>
          <p style="color:#cbd5e1;">Withdrawals are typically processed within 1-3 business days. You'll receive a confirmation once the transfer is complete.</p>
          <p style="color:#64748b;font-size:13px;margin-top:20px;">If you didn't request this, please contact support immediately.</p>
        </div>`,
      });
    }

    console.log('Withdrawal requested:', user.id, formatUSD(amountCents), 'payout:', payout.id);

    return jsonOk({
      success: true,
      payout_id: payout.id,
      new_balance: newBalance,
    }, corsHeaders);

  } catch (error) {
    console.error('Error in request-withdrawal:', error);
    return jsonError('Internal server error', 500, corsHeaders);
  }
});
