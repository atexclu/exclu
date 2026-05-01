// supabase/functions/update-platform-setting/index.ts
//
// Admin-only upsert for global platform settings stored in the
// `platform_settings` table. The set of allowed keys is enforced in code so
// unrelated settings can't be silently introduced through this endpoint.
//
// Body: { key: 'next_payout_date', value: { date: 'YYYY-MM-DD' | null } }
// Returns: { ok: true }
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

// Allow-list of keys writable through this endpoint, with a small validator
// per key. Adding a new key is intentional — keep this strict.
const ALLOWED_KEYS: Record<string, (value: unknown) => string | null> = {
  next_payout_date: (value) => {
    if (typeof value !== 'object' || value === null) return 'value must be an object';
    const v = value as Record<string, unknown>;
    if (!('date' in v)) return 'missing "date" field';
    const d = v.date;
    if (d === null) return null;
    if (typeof d !== 'string') return 'date must be a string or null';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'date must be YYYY-MM-DD';
    return null;
  },
};

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
    const { data: adminProfile } = await sb
      .from('profiles')
      .select('id, is_admin')
      .eq('id', user.id)
      .single();
    if (!adminProfile?.is_admin) return jsonError('Admin access required', 403, cors);

    const body = await req.json().catch(() => null) as { key?: string; value?: unknown } | null;
    const key = body?.key?.trim();
    const value = body?.value;
    if (!key) return jsonError('Missing key', 400, cors);
    const validator = ALLOWED_KEYS[key];
    if (!validator) return jsonError(`Key "${key}" is not allowed`, 400, cors);
    const validationError = validator(value);
    if (validationError) return jsonError(validationError, 400, cors);

    const { error: upsertErr } = await sb
      .from('platform_settings')
      .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: user.id });

    if (upsertErr) {
      console.error('[update-platform-setting] upsert failed', upsertErr);
      return jsonError('Failed to save setting', 500, cors);
    }

    return jsonOk({ ok: true }, cors);
  } catch (err) {
    console.error('[update-platform-setting] uncaught', err);
    return jsonError('Internal server error', 500, cors);
  }
});
