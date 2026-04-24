import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

const sbUrl = Deno.env.get('PROJECT_URL')!;
const sbKey = Deno.env.get('SERVICE_ROLE_KEY')!;
const sb = createClient(sbUrl, sbKey);

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const auth = req.headers.get('Authorization') || '';
  const { data: { user }, error } = await sb.auth.getUser(auth.replace('Bearer ', ''));
  if (error || !user) return new Response('Unauthorized', { status: 401, headers: cors });

  const body = await req.json().catch(() => ({}));
  const reactivate = body?.reactivate === true;

  await sb.from('profiles').update({
    subscription_cancel_at_period_end: !reactivate,
  }).eq('id', user.id);

  return new Response(
    JSON.stringify({ ok: true, cancel_at_period_end: !reactivate }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
