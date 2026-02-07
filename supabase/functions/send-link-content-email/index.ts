import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

if (!brevoApiKey) {
  throw new Error('Missing BREVO_API_KEY environment variable');
}

if (!brevoSenderEmail) {
  throw new Error('Missing BREVO_SENDER_EMAIL environment variable');
}
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// CORS: restrict to the main site URL + local dev origins instead of wildcard "*".
const normalizedSiteOrigin = siteUrl.replace(/\/$/, '');
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080',
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

    // Find the purchase based on Stripe session id
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
      .select('id, title, description, storage_path')
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

    // Build HTML email (based on the provided style)
    const linksListHtml = downloadLinks
      .map((url, index) => `<li><a href="${url}" style="color:#a3e635;text-decoration:none;">Télécharger le contenu ${index + 1}</a></li>`)
      .join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Votre contenu Exclu est débloqué</title>
<style>
  body {
    margin: 0;
    padding: 0;
    background-color: #020617;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #e2e8f0;
    text-align: left;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    background: linear-gradient(135deg, #020617 0%, #020617 40%, #0b1120 100%);
    border-radius: 16px;
    border: 1px solid #1e293b;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }
  .header {
    padding: 28px 28px 18px 28px;
    text-align: left;
    border-bottom: 1px solid #1e293b;
  }
  .header h1 {
    font-size: 26px;
    color: #f9fafb;
    margin: 0;
    line-height: 1.3;
    font-weight: 700;
  }
  .content {
    padding: 26px 28px 30px 28px;
    text-align: justify;
  }
  .content p {
    font-size: 15px;
    line-height: 1.7;
    color: #cbd5e1;
    margin: 0 0 16px 0;
  }
  .content strong {
    color: #ffffff;
    font-weight: 600;
  }
  .features {
    background-color: #020617;
    border-radius: 10px;
    padding: 18px 18px 18px 18px;
    margin: 20px 0;
    border: 1px solid #1e293b;
  }
  .features h3 {
    font-size: 16px;
    color: #f9fafb;
    margin: 0 0 10px 0;
    font-weight: 600;
  }
  .features ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .features li {
    font-size: 14px;
    color: #cbd5e1;
    margin-bottom: 8px;
    position: relative;
    padding-left: 20px;
  }
  .features li:before {
    content: "✓";
    position: absolute;
    left: 0;
    color: #a3e635;
    font-weight: bold;
  }
  .footer {
    font-size: 12px;
    color: #64748b;
    text-align: center;
    padding: 18px;
    border-top: 1px solid #1e293b;
    background-color: #020617;
  }
  .footer a {
    color: #a3e635;
    text-decoration: none;
  }
  .footer a:hover {
    text-decoration: underline;
  }
  @media (max-width:480px) {
    .container {
      margin: 0 10px;
    }
    .content {
      padding: 20px;
    }
    .header {
      padding: 20px 20px 16px 20px;
    }
    .header h1 {
      font-size: 22px;
    }
    .content p {
      font-size: 14px;
    }
  }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Votre contenu Exclu est prêt</h1>
    </div>
    <div class="content">
      <p>Merci pour votre achat sur <strong>Exclu</strong>. Votre contenu premium est maintenant débloqué.</p>
      <p>Vous pouvez le télécharger à tout moment en cliquant sur les liens ci‑dessous :</p>
      <div class="features">
        <h3>Vos liens de téléchargement :</h3>
        <ul>
          ${linksListHtml}
        </ul>
      </div>
      <p style="margin-top: 20px; font-size: 13px; color: #94a3b8;">Si vous n'êtes pas à l'origine de cet achat, vous pouvez ignorer cet e‑mail en toute sécurité.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — Tous droits réservés<br>
      <a href="${siteUrl}">exclu</a> • <a href="${siteUrl}/terms">Conditions d’utilisation</a> • <a href="${siteUrl}/privacy">Confidentialité</a>
    </div>
  </div>
</body>
</html>`;

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        sender: {
          email: brevoSenderEmail,
          name: brevoSenderName,
        },
        to: [
          {
            email: finalEmail,
          },
        ],
        subject: `Votre contenu Exclu est disponible`,
        htmlContent,
      }),
    });

    if (!brevoResponse.ok) {
      const text = await brevoResponse.text();
      console.error('Error sending email via Brevo:', text);
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
