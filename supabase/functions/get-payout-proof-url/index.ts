// supabase/functions/get-payout-proof-url/index.ts
//
// Returns a 5-minute signed download URL for a payout proof. Only the creator
// who owns the payout (or an admin) can call this. The bucket is private so
// the only way to read a proof is through this function.
//
// Body: { payout_id: string }
// Returns: { ok: true, url: string, expiresAt: string }
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('PROJECT_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);

const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');
const allowedOrigins = [
  siteUrl,
  'http://localhost:8080', 'http://localhost:8081', 'http://localhost:8082',
  'http://localhost:8083', 'http://localhost:8084', 'http://localhost:5173',
];
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (allowedOrigins.includes(origin) ||
    /^https:\/\/exclu-[a-z0-9-]+-atexclus-projects\.vercel\.app$/.test(origin)) ? origin : siteUrl;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const SIGNED_URL_TTL_SECONDS = 60 * 5;

function jsonOk(data: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
function jsonError(message: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonError('Method not allowed', 405, cors);

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim() ?? '';
    if (!token) return jsonError('Authentication required', 401, cors);
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return jsonError('Authentication required', 401, cors);

    const body = await req.json().catch(() => null) as { payout_id?: string } | null;
    const payoutId = body?.payout_id?.trim();
    if (!payoutId) return jsonError('Missing payout_id', 400, cors);

    const { data: payout, error: payoutErr } = await sb
      .from('payouts')
      .select('id, creator_id, proof_path')
      .eq('id', payoutId)
      .single();
    if (payoutErr || !payout) return jsonError('Payout not found', 404, cors);
    if (!payout.proof_path) return jsonError('No proof attached to this payout', 404, cors);

    // Authorization: the requesting user must be the creator OR an admin.
    let allowed = payout.creator_id === user.id;
    if (!allowed) {
      const { data: adminProfile } = await sb
        .from('profiles')
        .select('id, is_admin')
        .eq('id', user.id)
        .single();
      allowed = adminProfile?.is_admin === true;
    }
    if (!allowed) return jsonError('Forbidden', 403, cors);

    const { data: signed, error: signErr } = await sb.storage
      .from('payout-proofs')
      .createSignedUrl(payout.proof_path, SIGNED_URL_TTL_SECONDS);

    if (signErr || !signed?.signedUrl) {
      console.error('[get-payout-proof-url] createSignedUrl failed', signErr);
      return jsonError('Failed to sign proof URL', 500, cors);
    }

    return jsonOk({
      ok: true,
      url: signed.signedUrl,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    }, cors);
  } catch (err) {
    console.error('[get-payout-proof-url] uncaught', err);
    return jsonError('Internal server error', 500, cors);
  }
});
