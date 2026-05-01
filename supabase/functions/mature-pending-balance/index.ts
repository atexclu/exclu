// supabase/functions/mature-pending-balance/index.ts
//
// Daily cron entrypoint. Calls mature_wallet_transactions(now()) which moves
// every newly-matured pending credit into the creator's current balance and
// advances the platform-wide frontier marker.
//
// Auth: shared with reconcile-payments (RECONCILE_CRON_SECRET) — the Vercel
// cron handler forwards that bearer token. Treating both crons as the same
// trust boundary avoids juggling another secret.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('PROJECT_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);
const secret = Deno.env.get('RECONCILE_CRON_SECRET');

serve(async (req) => {
  if (req.headers.get('Authorization')?.replace('Bearer ', '') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const startedAt = new Date().toISOString();

  const { data, error } = await sb.rpc('mature_wallet_transactions', { p_now: startedAt });
  if (error) {
    console.error('[mature-pending-balance] RPC failed', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = (data ?? []) as Array<{ creator_id: string; moved_cents: number }>;
  const total = rows.reduce((sum, r) => sum + Number(r.moved_cents ?? 0), 0);

  console.log(
    `[mature-pending-balance] swept at ${startedAt}: ${rows.length} creator(s), ${total} cents matured`,
  );

  return new Response(
    JSON.stringify({ ok: true, started_at: startedAt, creators_count: rows.length, total_cents: total }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
