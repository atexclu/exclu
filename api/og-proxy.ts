import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

// Supabase public anon key — safe to expose, only reads public data
const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG53ZXpldGpsYndsdHljY2tzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTcyNjcsImV4cCI6MjA4Mzg3MzI2N30.BwE47MEU7KVm3NWXbX7hK1osCc00dQ0s8Y0Qudh5eyE';

let cachedIndexHtml: string | null = null;

function getIndexHtml(): string {
  if (!cachedIndexHtml) {
    const indexPath = join(process.cwd(), 'dist', 'index.html');
    cachedIndexHtml = readFileSync(indexPath, 'utf-8');
  }
  return cachedIndexHtml;
}

// Minimal HTML page returned with 410 Gone when a creator (or a creator-owned
// link) is soft-deleted, or when a handle does not exist. The response is
// crawler-safe (valid HTML, OG tags, generic image) and noindex.
function deletedCreatorHtml(kind: 'profile' | 'link'): string {
  const title = 'Creator not found · Exclu';
  const description = 'This creator is no longer on Exclu.';
  const image = 'https://exclu.at/og-profile-default.png';
  const url = kind === 'link' ? 'https://exclu.at' : 'https://exclu.at';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <meta name="description" content="${description}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="Exclu" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@exclu" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />

  <link rel="icon" href="/Logo-mini.svg" />
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#020617;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center}
    .wrap{max-width:480px}
    h1{font-size:1.75rem;font-weight:800;color:#f8fafc;margin-bottom:0.75rem}
    p{font-size:1rem;color:#94a3b8;line-height:1.6;margin-bottom:1.5rem}
    a{display:inline-block;padding:0.75rem 2rem;border-radius:9999px;font-weight:600;font-size:0.875rem;background:linear-gradient(135deg,#bef264,#a3e635);color:#020617;text-decoration:none}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Creator not found</h1>
    <p>This creator is no longer on Exclu.</p>
    <a href="/">Back to Exclu</a>
  </div>
</body>
</html>`;
}

function sendGone(res: VercelResponse, kind: 'profile' | 'link'): VercelResponse | void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=60');
  return res.status(410).send(deletedCreatorHtml(kind));
}

// Known app routes that should NOT be treated as creator handles
const APP_ROUTES = new Set([
  'auth', 'app', 'admin', 'onboarding', 'help-center',
  'contact', 'privacy', 'terms', 'cookies', 'l', 'api',
  'blog', 'directory', 'sitemap.xml', 'rss.xml',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.url || '/';

  try {
    let ogData: { title: string; description: string; image: string; url: string } | null = null;

    // Handle referral invite links (/auth?mode=signup&ref=...)
    // Must be checked before handle extraction since /auth is an app route
    if (path.startsWith('/auth') && path.includes('ref=')) {
      ogData = {
        title: 'Mystery invite 👀',
        description: 'Someone invited you to join Exclu — the creator platform with 0% commission.',
        image: 'https://exclu.at/og_invit.png',
        url: `https://exclu.at${path}`,
      };
    }

    // Extract potential handle from path (supports both /@handle and /handle)
    let handle: string | null = null;
    if (!ogData && path.startsWith('/@')) {
      handle = path.slice(2).split('/')[0].split('?')[0];
    } else if (path.startsWith('/') && !path.startsWith('/l/')) {
      const segment = path.slice(1).split('/')[0].split('?')[0];
      if (segment && !APP_ROUTES.has(segment)) {
        handle = segment;
      }
    }

    // Handle creator profile pages
    if (handle) {

      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?handle=eq.${encodeURIComponent(handle)}&select=display_name,handle,bio,avatar_url,deleted_at&limit=1`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      const profiles = await profileRes.json();
      const profile = profiles?.[0];

      if (!profile) {
        // Unknown handle (typo, never existed) — fall through to default
        // index.html so the SPA renders its own 404. Do NOT return 410 here.
      } else if (profile.deleted_at) {
        // Soft-deleted creator — return 410 Gone with a minimal page.
        return sendGone(res, 'profile');
      } else {
        const displayName = profile.display_name || profile.handle || 'Creator';
        const ogImage = profile.avatar_url || 'https://exclu.at/og-profile-default.png';
        ogData = {
          title: `${displayName} - Check out my Exclu profile`,
          description: profile.bio || 'Check out my exclusive content on Exclu',
          image: ogImage,
          url: `https://exclu.at/@${profile.handle}`,
        };
      }
    }

    // Handle public link pages (/l/slug)
    if (!ogData && path.startsWith('/l/')) {
      const slug = path.slice(3).split('/')[0].split('?')[0];

      const linkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/links?slug=eq.${encodeURIComponent(slug)}&select=title,description,creator_id&limit=1`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      const links = await linkRes.json();
      const link = links?.[0];

      if (link) {
        let ogImage = 'https://exclu.at/og-link-default.png';
        if (link.creator_id) {
          const creatorRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(link.creator_id)}&select=avatar_url,deleted_at&limit=1`,
            {
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              },
            }
          );
          const creators = await creatorRes.json();
          const creator = creators?.[0];
          // If the link's owner has been soft-deleted, return 410 Gone — we
          // do not surface deleted creators' content via OG previews.
          if (creator && creator.deleted_at) {
            return sendGone(res, 'link');
          }
          if (creator?.avatar_url) {
            ogImage = creator.avatar_url;
          }
        }

        ogData = {
          title: `${link.title || 'Exclusive Content'} - Unlock now on Exclu`,
          description: link.description || 'Unlock exclusive content on Exclu. No account needed.',
          image: ogImage,
          url: `https://exclu.at/l/${slug}`,
        };
      }
    }

    // Read index.html and inject dynamic OG meta tags
    let html = getIndexHtml();

    if (ogData) {
      // Replace the entire OG + Twitter meta block with dynamic values
      // This is safer than individual regex replacements on multi-line tags
      html = html
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(ogData.title)}</title>`)
        .replace(
          /<!-- Open Graph -->[\s\S]*?<!-- Twitter -->[\s\S]*?<meta\s+name="twitter:image"[^>]*\/>/,
          `<!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(ogData.title)}" />
    <meta property="og:description" content="${esc(ogData.description)}" />
    <meta property="og:image" content="${ogData.image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${ogData.url}" />
    <meta property="og:site_name" content="Exclu" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@exclu" />
    <meta name="twitter:title" content="${esc(ogData.title)}" />
    <meta name="twitter:description" content="${esc(ogData.description)}" />
    <meta name="twitter:image" content="${ogData.image}" />`
        );
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=300');
    return res.send(html);
  } catch (error) {
    console.error('OG proxy error:', error);
    // On error, serve unmodified index.html
    try {
      const html = getIndexHtml();
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch {
      res.writeHead(302, { Location: 'https://exclu.at' });
      return res.end();
    }
  }
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
