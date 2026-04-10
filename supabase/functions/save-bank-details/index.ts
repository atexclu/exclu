/**
 * save-bank-details — Save creator's bank account details for payouts.
 *
 * Supports multiple account types based on country:
 *   - iban  (EU/EEA): { account_type: 'iban', iban, holder_name, bic? }
 *   - us    (USA):     { account_type: 'us', account_number, routing_number, holder_name }
 *   - au    (Australia):{ account_type: 'au', account_number, bsb, bic?, holder_name }
 *   - other:           { account_type: 'other', account_number, bic, holder_name }
 *
 * Auth: Required (creator)
 * Returns: { success: true, country?: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

// Rate limiting: 5 req/min/IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, { count: number; windowStart: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const e = ipHits.get(ip);
  if (!e || now - e.windowStart > RATE_LIMIT_WINDOW_MS) { ipHits.set(ip, { count: 1, windowStart: now }); return false; }
  e.count++;
  return e.count > RATE_LIMIT_MAX;
}

/**
 * Validate IBAN format using ISO 13616 mod-97 check.
 */
function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) return false;

  // Mod-97 verification
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = '';
  for (const digit of numeric) {
    remainder = String(Number(remainder + digit) % 97);
  }
  return Number(remainder) === 1;
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

    const body = await req.json();
    const accountType: string = (typeof body?.account_type === 'string' ? body.account_type : 'iban').toLowerCase();
    const holderName = typeof body?.holder_name === 'string' ? body.holder_name.trim() : '';

    // Common validation
    if (!holderName) return jsonError('Account holder name is required', 400, corsHeaders);
    if (holderName.length > 100) return jsonError('Holder name must be under 100 characters', 400, corsHeaders);

    // Build update payload based on account type
    const updatePayload: Record<string, unknown> = {
      bank_holder_name: holderName,
      bank_account_type: accountType,
      payout_setup_complete: true,
      // Clear all bank fields first so old data doesn't persist
      bank_iban: null,
      bank_bic: null,
      bank_account_number: null,
      bank_routing_number: null,
      bank_bsb: null,
      bank_country: null,
    };

    if (accountType === 'iban') {
      const rawIban = typeof body?.iban === 'string' ? body.iban.trim() : '';
      const bic = typeof body?.bic === 'string' ? body.bic.trim().toUpperCase() : null;

      if (!rawIban) return jsonError('IBAN is required', 400, corsHeaders);
      const cleanedIban = rawIban.replace(/\s/g, '').toUpperCase();
      if (!validateIBAN(cleanedIban)) return jsonError('Invalid IBAN format. Please check and try again.', 400, corsHeaders);
      if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) return jsonError('Invalid BIC/SWIFT format', 400, corsHeaders);

      updatePayload.bank_iban = cleanedIban;
      updatePayload.bank_bic = bic || null;
      updatePayload.bank_country = cleanedIban.slice(0, 2);

    } else if (accountType === 'us') {
      const accountNumber = typeof body?.account_number === 'string' ? body.account_number.trim() : '';
      const routingNumber = typeof body?.routing_number === 'string' ? body.routing_number.trim() : '';

      if (!accountNumber) return jsonError('Account number is required', 400, corsHeaders);
      if (!routingNumber) return jsonError('Routing number (ABA) is required', 400, corsHeaders);
      if (!/^\d{4,17}$/.test(accountNumber)) return jsonError('Invalid account number format', 400, corsHeaders);
      if (!/^\d{9}$/.test(routingNumber)) return jsonError('Routing number must be exactly 9 digits', 400, corsHeaders);

      updatePayload.bank_account_number = accountNumber;
      updatePayload.bank_routing_number = routingNumber;
      updatePayload.bank_country = 'US';

    } else if (accountType === 'au') {
      const accountNumber = typeof body?.account_number === 'string' ? body.account_number.trim() : '';
      const bsb = typeof body?.bsb === 'string' ? body.bsb.trim().replace(/-/g, '') : '';
      const bic = typeof body?.bic === 'string' ? body.bic.trim().toUpperCase() : null;

      if (!accountNumber) return jsonError('Account number is required', 400, corsHeaders);
      if (!bsb) return jsonError('BSB is required', 400, corsHeaders);
      if (!/^\d{4,10}$/.test(accountNumber)) return jsonError('Invalid account number format', 400, corsHeaders);
      if (!/^\d{6}$/.test(bsb)) return jsonError('BSB must be exactly 6 digits', 400, corsHeaders);
      if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) return jsonError('Invalid BIC/SWIFT format', 400, corsHeaders);

      updatePayload.bank_account_number = accountNumber;
      updatePayload.bank_bsb = bsb;
      updatePayload.bank_bic = bic || null;
      updatePayload.bank_country = 'AU';

    } else if (accountType === 'other') {
      const accountNumber = typeof body?.account_number === 'string' ? body.account_number.trim() : '';
      const bic = typeof body?.bic === 'string' ? body.bic.trim().toUpperCase() : null;

      if (!accountNumber) return jsonError('Account number is required', 400, corsHeaders);
      if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) return jsonError('Invalid BIC/SWIFT format', 400, corsHeaders);

      updatePayload.bank_account_number = accountNumber;
      updatePayload.bank_bic = bic || null;
      updatePayload.bank_country = typeof body?.country === 'string' ? body.country.trim().toUpperCase().slice(0, 2) : null;

    } else {
      return jsonError('Invalid account_type. Must be: iban, us, au, or other', 400, corsHeaders);
    }

    // Update profile
    const { error: updateErr } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', user.id);

    if (updateErr) {
      console.error('Error saving bank details:', updateErr);
      return jsonError('Failed to save bank details', 500, corsHeaders);
    }

    console.log('Bank details saved for user:', user.id, 'type:', accountType, 'country:', updatePayload.bank_country);

    return jsonOk({ success: true, country: updatePayload.bank_country as string }, corsHeaders);

  } catch (error) {
    console.error('Error in save-bank-details:', error);
    return jsonError('Internal server error', 500, corsHeaders);
  }
});
