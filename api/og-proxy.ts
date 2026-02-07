import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

// Supabase public anon key — safe to expose, only reads public data
const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG53ZXpldGpsYndsdHljY2tzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTcyNjcsImV4cCI6MjA4Mzg3MzI2N30.BwE47MEU7KVm3NWXbX7hK1osCc00dQ0s8Y0Qudh5eyE';

const BOT_PATTERN = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|bot\.html|Googlebot|bingbot|Baiduspider|yandex|embedly|quora|outbrain|pinterest|vkShare|W3C_Validator/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userAgent = req.headers['user-agent'] || '';
  const path = req.url || '/';

  // For normal users, serve the SPA index.html
  if (!BOT_PATTERN.test(userAgent)) {
    try {
      const indexPath = join(process.cwd(), 'dist', 'index.html');
      const html = readFileSync(indexPath, 'utf-8');
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    } catch {
      // Fallback: redirect to home
      res.writeHead(302, { Location: 'https://exclu.at' + path });
      return res.end();
    }
  }

  // For bots: fetch data from Supabase REST API and generate OG HTML
  try {
    // Handle creator profile pages (/@handle)
    if (path.startsWith('/@')) {
      const handle = path.slice(2).split('/')[0].split('?')[0];

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
        const bio = profile.bio || 'Check out my exclusive content on Exclu';
        const ogImage = profile.avatar_url || 'https://exclu.at/og-profile-default.png';

        return sendOGHTML(res, {
          title: `${displayName} - Check out my Exclu profile`,
          description: bio,
          image: ogImage,
          url: `https://exclu.at/@${profile.handle}`,
        });
      }
    }

    // Handle public link pages (/l/slug)
    if (path.startsWith('/l/')) {
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
        // Try to get creator avatar for the link preview
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

        return sendOGHTML(res, {
          title: `${link.title || 'Exclusive Content'} - Unlock now on Exclu`,
          description: link.description || 'Unlock exclusive content on Exclu. No account needed.',
          image: ogImage,
          url: `https://exclu.at/l/${slug}`,
        });
      }
    }

    // Default fallback
    return sendOGHTML(res, {
      title: 'Exclu — Your Content. Your Revenue. No Middleman.',
      description: 'Sell exclusive content with 0% commission. Keep 100% of your earnings.',
      image: 'https://exclu.at/og-link-default.png',
      url: 'https://exclu.at',
    });
  } catch (error) {
    console.error('OG proxy error:', error);
    // Even on error, return valid OG HTML so previews still work
    return sendOGHTML(res, {
      title: 'Exclu — Your Content. Your Revenue. No Middleman.',
      description: 'Sell exclusive content with 0% commission. Keep 100% of your earnings.',
      image: 'https://exclu.at/og-link-default.png',
      url: 'https://exclu.at',
    });
  }
}

function sendOGHTML(res: VercelResponse, { title, description, image, url }: { title: string; description: string; image: string; url: string }) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>

  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Exclu">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${image}">

  <meta http-equiv="refresh" content="0; url=${url}">
</head>
<body>
  <p>Redirecting to Exclu...</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=3600');
  return res.send(html);
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
