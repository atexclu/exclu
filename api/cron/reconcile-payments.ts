import type { VercelRequest, VercelResponse } from '@vercel/node';

const URL = 'https://qexnwezetjlbwltyccks.supabase.co/functions/v1/reconcile-payments';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RECONCILE_CRON_SECRET}` },
  });
  res.status(r.status).send(await r.text());
}
