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

// Known app routes that should NOT be treated as creator handles
const APP_ROUTES = new Set([
  'auth', 'app', 'admin', 'onboarding', 'help-center',
  'contact', 'privacy', 'terms', 'cookies', 'l', 'api',
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
        `${SUPABASE_URL}/rest/v1/profiles?handle=eq.${encodeURIComponent(handle)}&select=display_name,handle,bio,avatar_url&limit=1`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      const profiles = await profileRes.json();
      const profile = profiles?.[0];

      if (profile) {
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
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(link.creator_id)}&select=avatar_url&limit=1`,
            {
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              },
            }
          );
          const creators = await creatorRes.json();
          if (creators?.[0]?.avatar_url) {
            ogImage = creators[0].avatar_url;
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
