import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL/PROJECT_URL or SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Mirrored from src/lib/contentAccess.ts (can't cross-import src/ into Deno).
// Must stay in sync; if you touch either, touch both.
function canAccessPurchasedLink(p: { status?: string } | null | undefined): boolean {
  return !!p && p.status === 'succeeded';
}

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

    // Verify the purchase exists — supports:
    // - Direct purchase ID (UGPayments flow: session_id = purchase UUID)
    // - Legacy session ID (stripe_session_id field, pre-UGP purchases)
    // - Custom request delivery (session_id = "req_<request_id>")
    let purchase: { id: string; status?: string } | null = null;
    let purchaseError: any = null;

    // Custom request delivery: session_id starts with "req_"
    if (session_id.startsWith('req_')) {
      const requestId = session_id.slice(4);
      const { data: deliveredReq } = await supabase
        .from('custom_requests')
        .select('id')
        .eq('id', requestId)
        .eq('delivery_link_id', link_id)
        .eq('status', 'delivered')
        .maybeSingle();

      if (deliveredReq) {
        purchase = { id: deliveredReq.id };
      } else {
        // Also check if a purchase record exists for this delivery link
        const { data: deliveryPurchase } = await supabase
          .from('purchases')
          .select('id, status')
          .eq('link_id', link_id)
          .maybeSingle();
        if (canAccessPurchasedLink(deliveryPurchase)) purchase = deliveryPurchase;
      }
    } else {
      // Try by purchase ID first (UGPayments flow)
      const { data: byId } = await supabase
        .from('purchases')
        .select('id, status')
        .eq('id', session_id)
        .eq('link_id', link_id)
        .maybeSingle();

      if (canAccessPurchasedLink(byId)) {
        purchase = byId;
      } else {
        // Fallback: try by stripe_session_id (legacy pre-UGP purchases)
        const { data: byStripe, error: byStripeErr } = await supabase
          .from('purchases')
          .select('id, status')
          .eq('stripe_session_id', session_id)
          .eq('link_id', link_id)
          .maybeSingle();
        purchaseError = byStripeErr;
        if (canAccessPurchasedLink(byStripe)) purchase = byStripe;
      }
    }

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

    // Generate signed URLs using service role (bypasses RLS).
    // Parallelized so 20+ attached files don't accumulate sequential round-trips.
    const signedUrls = await Promise.all(
      pathEntries.map(async (entry) => {
        const isVideo = entry.mimeType
          ? entry.mimeType.startsWith('video/')
          : ['mp4', 'mov', 'webm', 'mkv'].includes(entry.path.split('.').pop()?.toLowerCase() ?? '');

        // Try path as-is, then fallback with/without 'paid-content/' prefix
        const candidates = [entry.path];
        if (entry.path.startsWith('paid-content/')) {
          candidates.push(entry.path.slice('paid-content/'.length));
        } else {
          candidates.push('paid-content/' + entry.path);
        }

        let signedUrl: string | null = null;
        for (const candidate of candidates) {
          const { data: signed, error: signedError } = await supabase.storage
            .from('paid-content')
            .createSignedUrl(candidate, 15 * 60);

          if (!signedError && signed?.signedUrl) {
            signedUrl = signed.signedUrl;
            break;
          }
        }

        if (!signedUrl) {
          console.error('Error signing (all variants failed)', entry.path);
        }

        return { path: entry.path, url: signedUrl, type: isVideo ? 'video' : 'image' };
      }),
    );

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
