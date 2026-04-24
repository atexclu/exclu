import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sbUrl = Deno.env.get('PROJECT_URL')!;
const sbKey = Deno.env.get('SERVICE_ROLE_KEY')!;
const sb = createClient(sbUrl, sbKey);

const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at').replace(/\/$/, '');

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowed = ['http://localhost:8080', 'http://localhost:5173', siteUrl];
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : siteUrl,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const auth = req.headers.get('Authorization') || '';
  const { data: { user }, error } = await sb.auth.getUser(auth.replace('Bearer ', ''));
  if (error || !user) return new Response('Unauthorized', { status: 401, headers: cors });

  await sb.from('profiles').update({
    subscription_cancel_at_period_end: true,
  }).eq('id', user.id);

  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
