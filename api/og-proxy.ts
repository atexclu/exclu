import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userAgent = req.headers['user-agent'] || '';
  const path = req.url || '/';
  
  // Detect social media bots
  const botPattern = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|linkedin|Twitterbot|facebookexternalhit|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot/i;
  
  if (!botPattern.test(userAgent)) {
    // For normal users, return 404 to let Vercel handle the SPA routing
    return res.status(404).send('Not found');
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Handle creator profile pages (/@handle)
    if (path.startsWith('/@')) {
      const handle = path.slice(2).split('/')[0].split('?')[0];
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, handle, bio, avatar_url')
        .eq('handle', handle)
        .maybeSingle();

      if (profile) {
        const displayName = profile.display_name || profile.handle || 'Creator';
        const bio = profile.bio || 'Check out my exclusive content on Exclu';
        const ogImage = profile.avatar_url || 'https://exclu.at/og-profile-default.png';
        
        const html = generateHTML({
          title: `${displayName} (@${profile.handle}) — Exclu`,
          description: bio,
          image: ogImage,
          url: `https://exclu.at/@${profile.handle}`
        });
        
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(html);
      }
    }
    
    // Handle public link pages (/l/slug)
    if (path.startsWith('/l/')) {
      const slug = path.slice(3).split('/')[0].split('?')[0];
      
      const { data: link } = await supabase
        .from('links')
        .select('title, description, storage_path')
        .eq('slug', slug)
        .maybeSingle();

      if (link) {
        let ogImage = 'https://exclu.at/og-link-default.png';
        
        // Try to get preview image if storage_path exists
        if (link.storage_path) {
          const { data: signedUrl } = await supabase.storage
            .from('paid-content')
            .createSignedUrl(link.storage_path, 3600);
          
          if (signedUrl?.signedUrl) {
            ogImage = signedUrl.signedUrl;
          }
        }
        
        const html = generateHTML({
          title: `${link.title} — Exclu`,
          description: link.description || 'Unlock exclusive content on Exclu',
          image: ogImage,
          url: `https://exclu.at/l/${slug}`
        });
        
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(html);
      }
    }
    
    // Default fallback
    const html = generateHTML({
      title: 'Exclu — Your Content. Your Revenue. No Middleman.',
      description: 'Sell exclusive content with 0% commission. Keep 100% of your earnings.',
      image: 'https://exclu.at/og-link-default.png',
      url: 'https://exclu.at'
    });
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(html);
    
  } catch (error) {
    console.error('Error generating OG preview:', error);
    return res.status(500).send('Error generating preview');
  }
}

function generateHTML({ title, description, image, url }: { title: string; description: string; image: string; url: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${url}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${image}">
  
  <meta property="og:site_name" content="Exclu">
  
  <meta http-equiv="refresh" content="0; url=${url}">
</head>
<body>
  <p>Redirecting to Exclu...</p>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
