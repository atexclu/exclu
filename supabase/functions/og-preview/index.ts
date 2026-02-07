import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface CreatorProfile {
  id: string;
  display_name: string | null;
  handle: string | null;
  bio: string | null;
  avatar_url: string | null;
  theme_color: string | null;
}

interface LinkData {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  creator_id: string;
  preview_image_url?: string | null;
}

serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const userAgent = req.headers.get('user-agent') || '';
    
    // Detect social media bots
    const isBot = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|linkedin|pinterest|slack|discord/i.test(userAgent);
    
    // If not a bot, redirect to the main app
    if (!isBot) {
      return new Response(null, {
        status: 302,
        headers: { 
          'Location': `${url.pathname}${url.search}`,
          'Cache-Control': 'no-cache'
        }
      });
    }

    const path = url.pathname;
    
    // Handle creator profile pages (/@handle)
    if (path.startsWith('/@')) {
      const handle = path.slice(2).split('/')[0];
      return await handleCreatorProfile(handle);
    }
    
    // Handle public link pages (/l/slug)
    if (path.startsWith('/l/')) {
      const slug = path.slice(3).split('/')[0];
      return await handlePublicLink(slug);
    }
    
    // Default fallback
    return generateDefaultHTML();
    
  } catch (error) {
    console.error('Error in og-preview:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

async function handleCreatorProfile(handle: string): Promise<Response> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, display_name, handle, bio, avatar_url, theme_color')
      .eq('handle', handle)
      .maybeSingle();

    if (error || !profile) {
      return generateDefaultHTML();
    }

    const html = generateCreatorProfileHTML(profile);
    
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Error fetching creator profile:', error);
    return generateDefaultHTML();
  }
}

async function handlePublicLink(slug: string): Promise<Response> {
  try {
    const { data: link, error: linkError } = await supabase
      .from('links')
      .select('id, title, description, slug, creator_id')
      .eq('slug', slug)
      .eq('is_public', true)
      .maybeSingle();

    if (linkError || !link) {
      return generateDefaultHTML();
    }

    // Get preview image from assets
    const { data: assets } = await supabase
      .from('assets')
      .select('storage_path, type')
      .eq('link_id', link.id)
      .order('created_at', { ascending: true })
      .limit(1);

    let previewImageUrl = null;
    if (assets && assets.length > 0) {
      const { data: publicUrl } = supabase.storage
        .from('assets')
        .getPublicUrl(assets[0].storage_path);
      previewImageUrl = publicUrl.publicUrl;
    }

    const html = generatePublicLinkHTML({
      ...link,
      preview_image_url: previewImageUrl
    });
    
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Error fetching public link:', error);
    return generateDefaultHTML();
  }
}

function generateCreatorProfileHTML(profile: CreatorProfile): string {
  const displayName = profile.display_name || profile.handle || 'Creator';
  const handle = profile.handle || 'creator';
  const bio = profile.bio || 'Check out my exclusive content on Exclu';
  const avatarUrl = profile.avatar_url || 'https://exclu.at/og-profile-default.png';
  const profileUrl = `https://exclu.at/@${handle}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${displayName} (@${handle}) — Exclu</title>
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="profile">
  <meta property="og:url" content="${profileUrl}">
  <meta property="og:title" content="${escapeHtml(displayName)} (@${handle})">
  <meta property="og:description" content="${escapeHtml(bio)}">
  <meta property="og:image" content="${generateCreatorOGImage(profile)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${profileUrl}">
  <meta name="twitter:title" content="${escapeHtml(displayName)} (@${handle})">
  <meta name="twitter:description" content="${escapeHtml(bio)}">
  <meta name="twitter:image" content="${generateCreatorOGImage(profile)}">
  
  <!-- WhatsApp / Telegram -->
  <meta property="og:site_name" content="Exclu">
  
  <meta http-equiv="refresh" content="0; url=${profileUrl}">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="min-height: 100vh; background: #0A0A0F; display: flex; align-items: center; justify-content: center; padding: 20px;">
    <div style="text-align: center; max-width: 600px;">
      <img src="${avatarUrl}" alt="${escapeHtml(displayName)}" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; margin-bottom: 20px;">
      <h1 style="color: white; font-size: 32px; margin: 0 0 10px 0;">@${handle}</h1>
      <p style="color: #A0A0B0; font-size: 16px; margin: 0 0 30px 0;">${escapeHtml(bio)}</p>
      <a href="${profileUrl}" style="display: inline-block; background: #22C55E; color: white; padding: 12px 32px; border-radius: 9999px; text-decoration: none; font-weight: 600;">Access my profile</a>
    </div>
  </div>
</body>
</html>`;
}

function generatePublicLinkHTML(link: LinkData & { preview_image_url?: string | null }): string {
  const title = link.title || 'Exclusive Content';
  const previewImage = link.preview_image_url || 'https://exclu.at/default-link-og.png';
  const linkUrl = `https://exclu.at/l/${link.slug}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Exclu</title>
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${linkUrl}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="Unlock exclusive content on Exclu">
  <meta property="og:image" content="${generateLinkOGImage(link)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${linkUrl}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="Unlock exclusive content on Exclu">
  <meta name="twitter:image" content="${generateLinkOGImage(link)}">
  
  <!-- WhatsApp / Telegram -->
  <meta property="og:site_name" content="Exclu">
  
  <meta http-equiv="refresh" content="0; url=${linkUrl}">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="min-height: 100vh; background: #0A0A0F; display: flex; align-items: center; justify-content: center; padding: 20px;">
    <div style="text-align: center; max-width: 600px;">
      <h1 style="color: white; font-size: 32px; margin: 0 0 30px 0;">${escapeHtml(title)}</h1>
      <p style="color: #A0A0B0; font-size: 14px; margin: 0;">Exclu — Sell your content with 0% commission</p>
    </div>
  </div>
</body>
</html>`;
}

function generateCreatorOGImage(profile: CreatorProfile): string {
  // Use creator's avatar if available, otherwise use default profile OG image
  if (profile.avatar_url) {
    return profile.avatar_url;
  }
  return 'https://exclu.at/og-profile-default.png';
}

function generateLinkOGImage(link: LinkData & { preview_image_url?: string | null }): string {
  // Use link's preview image if available, otherwise use default link OG image
  if (link.preview_image_url) {
    return link.preview_image_url;
  }
  return 'https://exclu.at/og-link-default.png';
}

function generateDefaultHTML(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exclu — Sell your content with 0% commission</title>
  
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://exclu.at">
  <meta property="og:title" content="Exclu — Your Content. Your Revenue. No Middleman.">
  <meta property="og:description" content="Sell exclusive content with 0% commission. Keep 100% of your earnings.">
  <meta property="og:image" content="https://exclu.at/og-link-default.png">
  
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Exclu — Your Content. Your Revenue. No Middleman.">
  <meta name="twitter:description" content="Sell exclusive content with 0% commission. Keep 100% of your earnings.">
  <meta name="twitter:image" content="https://exclu.at/og-link-default.png">
  
  <meta http-equiv="refresh" content="0; url=https://exclu.at">
</head>
<body>
  <p>Redirecting to Exclu...</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
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
