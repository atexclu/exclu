import type { VercelRequest, VercelResponse } from '@vercel/node';

// Daily 08:30 UTC — moves matured pending credits to the current balance.
// The Supabase edge function reuses RECONCILE_CRON_SECRET as its bearer token
// (same trust boundary as the hourly reconciler).
const URL = 'https://qexnwezetjlbwltyccks.supabase.co/functions/v1/mature-pending-balance';

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
