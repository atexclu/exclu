import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL/PROJECT_URL or SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

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

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const session_id = body.session_id as string | undefined;
    const link_id = body.link_id as string | undefined;

    if (!session_id || !link_id) {
      return new Response(JSON.stringify({ error: 'Missing session_id or link_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the purchase exists for this session_id + link_id
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('id')
      .eq('stripe_session_id', session_id)
      .eq('link_id', link_id)
      .maybeSingle();

    if (purchaseError || !purchase) {
      return new Response(JSON.stringify({ error: 'Purchase not found', detail: purchaseError?.message }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the link's main storage_path
    const { data: link, error: linkError } = await supabase
      .from('links')
      .select('id, storage_path')
      .eq('id', link_id)
      .single();

    if (linkError || !link) {
      return new Response(JSON.stringify({ error: 'Link not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect all storage paths with their mime types
    const pathEntries: { path: string; mimeType: string | null }[] = [];

    if (link.storage_path) {
      pathEntries.push({ path: link.storage_path as string, mimeType: null });
    }

    // Fetch linked assets via link_media
    const { data: linkMedia, error: mediaError } = await supabase
      .from('link_media')
      .select('asset_id, assets(storage_path, mime_type)')
      .eq('link_id', link_id)
      .order('position', { ascending: true });

    if (linkMedia) {
      for (const lm of linkMedia) {
        const asset = (lm as any).assets;
        if (asset?.storage_path) {
          pathEntries.push({ path: asset.storage_path, mimeType: asset.mime_type ?? null });
        }
      }
    }

    // Generate signed URLs using service role (bypasses RLS)
    const signedUrls: { path: string; url: string | null; type: string }[] = [];

    for (const entry of pathEntries) {
      const isVideo = entry.mimeType
        ? entry.mimeType.startsWith('video/')
        : ['mp4', 'mov', 'webm', 'mkv'].includes(entry.path.split('.').pop()?.toLowerCase() ?? '');

      const { data: signed, error: signedError } = await supabase.storage
        .from('paid-content')
        .createSignedUrl(entry.path, 15 * 60);

      if (signedError) {
        console.error('Error signing', entry.path, signedError.message);
        signedUrls.push({ path: entry.path, url: null, type: isVideo ? 'video' : 'image' });
      } else {
        signedUrls.push({ path: entry.path, url: signed?.signedUrl ?? null, type: isVideo ? 'video' : 'image' });
      }
    }

    return new Response(JSON.stringify({ signedUrls }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-signed-urls:', error);
    return new Response(JSON.stringify({ error: 'Internal error', detail: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
