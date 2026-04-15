import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { loadTemplate, renderTemplate } from '../_shared/email_templates.ts';
import { sendBrevoEmail } from '../_shared/brevo.ts';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// CORS: restrict to the main site URL + local dev origins instead of wildcard "*".
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

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

// Very lightweight in-memory rate limiting per IP and function instance.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // per IP per window
const ipHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const existing = ipHits.get(ip);

  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }

  existing.count += 1;
  ipHits.set(ip, existing);
  return existing.count > RATE_LIMIT_MAX_REQUESTS;
}

interface Purchase {
  id: string;
  link_id: string;
  buyer_email: string | null;
  fan_email: string | null;
}

interface LinkRow {
  id: string;
  title: string;
  description: string | null;
  storage_path: string | null;
  creator_id: string | null;
}

interface LinkMediaRow {
  asset_id: string;
  assets: {
    storage_path: string | null;
    mime_type: string | null;
  } | null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown';

  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { session_id, email } = await req.json();

    if (!session_id || typeof session_id !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid session_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the purchase based on session id (legacy pre-UGP purchases)
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('id, link_id, buyer_email, fan_email')
      .eq('stripe_session_id', session_id)
      .maybeSingle<Purchase>();

    if (purchaseError || !purchase) {
      console.error('Purchase not found for session', session_id, purchaseError);
      return new Response(JSON.stringify({ error: 'Purchase not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const finalEmail: string | null = (email && typeof email === 'string' && email.trim())
      ? email.trim()
      : purchase.buyer_email || purchase.fan_email;

    if (!finalEmail) {
      return new Response(JSON.stringify({ error: 'No email available to send content to' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Basic email validation to avoid sending to clearly malformed addresses.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(finalEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch link information
    const { data: link, error: linkError } = await supabase
      .from('links')
      .select('id, title, description, storage_path, creator_id')
      .eq('id', purchase.link_id)
      .single<LinkRow>();

    if (linkError || !link) {
      console.error('Link not found for purchase', purchase.id, linkError);
      return new Response(JSON.stringify({ error: 'Link not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect all storage paths (main link + linked assets)
    const paths: string[] = [];

    if (link.storage_path) {
      paths.push(link.storage_path);
    }

    const { data: linkMedia, error: mediaError } = await supabase
      .from('link_media')
      .select('asset_id, assets(storage_path, mime_type)')
      .eq('link_id', link.id)
      .order('position', { ascending: true })
      .returns<LinkMediaRow[]>();

    if (!mediaError && linkMedia) {
      for (const lm of linkMedia) {
        const storagePath = lm.assets?.storage_path;
        if (storagePath) {
          paths.push(storagePath);
        }
      }
    }

    // Generate signed URLs for all paths
    const downloadLinks: string[] = [];
    for (const path of paths) {
      const { data: signed, error: signedError } = await supabase.storage
        .from('paid-content')
        .createSignedUrl(path, 60 * 60); // 1 hour (email links)

      if (signedError) {
        console.error('Error creating signed URL for', path, signedError);
        continue;
      }

      if (signed?.signedUrl) {
        downloadLinks.push(signed.signedUrl);
      }
    }

    if (downloadLinks.length === 0) {
      return new Response(JSON.stringify({ error: 'No downloadable content available' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch creator display name / handle for the template header.
    let creatorName = 'Exclu';
    if (link.creator_id) {
      const { data: creator } = await supabase
        .from('profiles')
        .select('display_name, handle')
        .eq('id', link.creator_id)
        .maybeSingle();
      if (creator) {
        creatorName = creator.display_name || creator.handle || 'Exclu';
      }
    }

    const downloadLinksHtml = downloadLinks
      .map((url, index) => `<li><a href="${url}">Download file ${index + 1}</a></li>`)
      .join('');

    const template = await loadTemplate(supabase, 'link_content_delivery');
    const rendered = renderTemplate(template, {
      creator_name: creatorName,
      link_title: link.title,
      // Template already wraps this in <ul>...</ul>, so we only emit <li> items.
      download_links_html: downloadLinksHtml,
      site_url: siteUrl,
    });

    const sent = await sendBrevoEmail({
      to: finalEmail,
      subject: rendered.subject,
      htmlContent: rendered.html,
    });

    if (!sent) {
      console.error('Error sending email via Brevo');
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in send-link-content-email function', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
