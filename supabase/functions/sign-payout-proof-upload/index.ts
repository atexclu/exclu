// supabase/functions/sign-payout-proof-upload/index.ts
//
// Returns a Supabase Storage *signed upload URL* for the payout-proofs bucket.
// The path is derived server-side from (creator_id, payout_id, extension) so
// admins can't write outside the convention. Only callable by admins.
//
// Body: { payout_id: string, extension: 'png' | 'jpg' | 'jpeg' | 'webp' | 'pdf' }
// Returns: { ok: true, path, signedUrl, token }
//
// AdminPayments.tsx flow:
//   1. user picks a file
//   2. front calls this function with the file extension
//   3. front uploads using `supabase.storage.from(...).uploadToSignedUrl(path, token, file)`
//   4. front passes the returned `path` into process-payout's `proof_path`
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL')!;
const serviceKey  = Deno.env.get('SERVICE_ROLE_KEY')!;
const sb = createClient(supabaseUrl, serviceKey);

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

const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'pdf']);

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
    // Auth → admin check.
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim() ?? '';
    if (!token) return jsonError('Authentication required', 401, cors);
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return jsonError('Authentication required', 401, cors);
    const { data: adminProfile } = await sb
      .from('profiles')
      .select('id, is_admin')
      .eq('id', user.id)
      .single();
    if (!adminProfile?.is_admin) return jsonError('Admin access required', 403, cors);

    const body = await req.json().catch(() => null) as { payout_id?: string; extension?: string } | null;
    const payoutId = body?.payout_id?.trim();
    const ext = body?.extension?.trim().toLowerCase();
    if (!payoutId) return jsonError('Missing payout_id', 400, cors);
    if (!ext || !ALLOWED_EXT.has(ext)) {
      return jsonError(`Invalid extension (allowed: ${Array.from(ALLOWED_EXT).join(', ')})`, 400, cors);
    }

    // Fetch payout to derive the creator_id (path enforcement).
    const { data: payout, error: payoutErr } = await sb
      .from('payouts')
      .select('id, creator_id, status')
      .eq('id', payoutId)
      .single();
    if (payoutErr || !payout) return jsonError('Payout not found', 404, cors);

    const path = `${payout.creator_id}/${payout.id}.${ext}`;

    const { data: signed, error: signErr } = await sb.storage
      .from('payout-proofs')
      .createSignedUploadUrl(path, { upsert: true });

    if (signErr || !signed) {
      console.error('[sign-payout-proof-upload] createSignedUploadUrl failed', signErr);
      return jsonError('Failed to create upload URL', 500, cors);
    }

    return jsonOk({
      ok: true,
      path,
      signedUrl: signed.signedUrl,
      token: signed.token,
    }, cors);
  } catch (err) {
    console.error('[sign-payout-proof-upload] uncaught', err);
    return jsonError('Internal server error', 500, cors);
  }
});
