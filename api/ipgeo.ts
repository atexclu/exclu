import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const country = (req.headers['x-vercel-ip-country'] as string) || null;
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({ country });
}
