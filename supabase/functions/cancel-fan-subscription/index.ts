import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const sb = createClient(Deno.env.get('PROJECT_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const { data: { user } } = await sb.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

  const body = await req.json().catch(() => ({}));
  const subId = body?.subscription_id;
  if (!subId) return new Response(JSON.stringify({ error: 'Missing subscription_id' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

  const { data: sub } = await sb.from('fan_creator_subscriptions')
    .select('id, fan_id, status').eq('id', subId).maybeSingle();
  if (!sub || sub.fan_id !== user.id) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (sub.status !== 'active') return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  await sb.from('fan_creator_subscriptions').update({
    cancel_at_period_end: true,
  }).eq('id', subId);

  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
