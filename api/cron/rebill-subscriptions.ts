import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_FN_URL = 'https://qexnwezetjlbwltyccks.supabase.co/functions/v1/rebill-subscriptions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel signs cron invocations with a header matching CRON_SECRET
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const r = await fetch(SUPABASE_FN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.REBILL_CRON_SECRET}`,
      'apikey': process.env.SUPABASE_ANON_KEY ?? '',
    },
  });
  const body = await r.text();
  res.status(r.status).setHeader('Content-Type', 'application/json').send(body);
}
