/**
 * Shared CORS helpers for Supabase Edge Functions.
 * Matches the existing pattern used in create-link-checkout-session etc.
 */

const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';
const normalizedSiteOrigin = siteUrl.replace(/\/$/, '');

const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:8084',
  'http://localhost:5173',
];

/**
 * Matches Vercel preview deployments of the `exclu` project under the
 * `atexclus-projects` team, e.g.:
 *   https://exclu-git-feature-mailing-overhaul-atexclus-projects.vercel.app
 *   https://exclu-abc123-atexclus-projects.vercel.app
 *
 * Scoped to our team prefix (`atexclus-projects`) so unrelated Vercel
 * apps cannot pass CORS by accident. Does NOT match unrelated projects
 * under the same team (must start with `exclu-`).
 */
const vercelPreviewRegex =
  /^https:\/\/exclu-[a-z0-9-]+-atexclus-projects\.vercel\.app$/;

function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  if (vercelPreviewRegex.test(origin)) return true;
  return false;
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = isOriginAllowed(origin) ? origin : normalizedSiteOrigin;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
    'Vary': 'Origin',
  };
}

export function jsonOk(data: Record<string, unknown>, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export function jsonError(msg: string, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  return null;
}
