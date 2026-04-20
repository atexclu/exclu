import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL/PROJECT_URL or SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY');
}

if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

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
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
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

interface MetricsBucket {
  cnt: number;
  gross_cents: number;
  net_cents: number;
}

interface AdminUserMetrics {
  purchases: MetricsBucket;
  tips: MetricsBucket;
  gifts: MetricsBucket;
  custom_requests: MetricsBucket;
  fan_subscriptions: {
    active_count: number;
    total_count: number;
    monthly_revenue_cents: number;
  };
  last_30d: {
    sales_count: number;
    revenue_cents: number;
  };
  top_links: Array<{
    id: string;
    title: string | null;
    slug: string | null;
    sales_count: number;
    revenue_cents: number;
  }>;
  totals: {
    count: number;
    gross_cents: number;
    net_cents: number;
  };
}

interface UserOverviewPayload {
  profile: {
    id: string;
    display_name: string | null;
    handle: string | null;
    created_at: string | null;
    is_creator: boolean | null;
    country: string | null;
    role: string | null;
    is_directory_visible: boolean | null;
    is_creator_subscribed: boolean;
    wallet_balance_cents: number;
    total_earned_cents: number;
    total_withdrawn_cents: number;
    bank_iban: string | null;
    bank_holder_name: string | null;
    bank_bic: string | null;
    bank_account_type: string | null;
    bank_account_number: string | null;
    bank_routing_number: string | null;
    bank_bsb: string | null;
    bank_country: string | null;
    payout_setup_complete: boolean;
  } | null;
  links: Array<{
    id: string;
    slug?: string | null;
    title: string | null;
    description: string | null;
    status: string | null;
    show_on_profile?: boolean | null;
    profile_id?: string | null;
    price_cents: number | null;
    created_at: string | null;
    published_at: string | null;
    storage_path: string | null;
    mime_type: string | null;
    previewUrl?: string | null;
    media: Array<{
      id: string;
      storage_path: string;
      mime_type: string | null;
      title: string | null;
      preview_url: string | null;
    }>;
  }>;
  assets: Array<{
    id: string;
    title: string | null;
    created_at: string | null;
    mime_type: string | null;
    is_public?: boolean | null;
    profile_id?: string | null;
    preview_url: string | null;
    storage_path?: string | null;
  }>;
  sales: Array<{
    id: string;
    link_id: string | null;
    link_title: string | null;
    buyer_email: string | null;
    amount_cents: number | null;
    currency: string | null;
    status: string;
    created_at: string | null;
  }>;
  payouts: Array<{
    id: string;
    amount_cents: number;
    status: string;
    created_at: string | null;
    requested_at: string | null;
    processed_at: string | null;
  }>;
  metrics: AdminUserMetrics | null;
}

function detectMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const videoExts = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'wmv'];
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'];

  if (videoExts.includes(ext)) return 'video/mp4';
  if (imageExts.includes(ext)) return 'image/jpeg';
  if (ext === 'zip') return 'application/zip';
  return 'application/octet-stream';
}

// Sign a storage path, transparently retrying with/without the legacy "paid-content/" prefix.
async function signStoragePath(path: string): Promise<string | null> {
  const cleanPath = path.startsWith('paid-content/')
    ? path.slice('paid-content/'.length)
    : path;

  const candidates = cleanPath !== path ? [cleanPath, path] : [path, `paid-content/${path}`];

  for (const candidate of candidates) {
    const { data, error } = await supabaseAdmin.storage
      .from('paid-content')
      .createSignedUrl(candidate, 60 * 60);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
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
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawToken = req.headers.get('x-supabase-auth') ?? '';
    const token = rawToken.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: userError,
    } = await supabaseAuthClient.auth.getUser(token);

    if (userError || !user) {
      console.error('Error resolving user in admin-get-user-overview', userError);
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (adminProfileError) {
      console.error('Error loading admin profile in admin-get-user-overview', adminProfileError);
      return new Response(JSON.stringify({ error: 'Unable to verify admin status' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!adminProfile || adminProfile.is_admin !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    const targetUserId = body?.user_id as string | undefined;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'Missing user_id in request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fire every independent query in parallel ───────────────────────────
    const [
      profileRes,
      linksRes,
      assetsRes,
      payoutsRes,
      directoryVisRes,
      creatorLinkIdsRes,
      metricsRes,
      authUserRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select(
          'id, display_name, handle, created_at, is_creator, country, role, wallet_balance_cents, total_earned_cents, total_withdrawn_cents, bank_iban, bank_holder_name, bank_bic, bank_account_type, bank_account_number, bank_routing_number, bank_bsb, bank_country, payout_setup_complete, is_creator_subscribed',
        )
        .eq('id', targetUserId)
        .maybeSingle(),
      supabaseAdmin
        .from('links')
        .select(`
          id,
          slug,
          title,
          description,
          status,
          show_on_profile,
          price_cents,
          created_at,
          storage_path,
          mime_type,
          profile_id,
          link_media(
            asset_id,
            position,
            assets(id, title, storage_path, mime_type)
          )
        `)
        .eq('creator_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabaseAdmin
        .from('assets')
        .select('id, title, created_at, storage_path, mime_type, is_public, profile_id')
        .eq('creator_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabaseAdmin
        .from('payouts')
        .select('id, amount_cents, status, created_at, requested_at, processed_at')
        .eq('creator_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('creator_profiles')
        .select('is_directory_visible')
        .eq('user_id', targetUserId)
        .eq('is_active', true)
        .maybeSingle(),
      // All link IDs for this creator (used to scope the sales list properly).
      supabaseAdmin
        .from('links')
        .select('id')
        .eq('creator_id', targetUserId)
        .range(0, 99999),
      supabaseAdmin.rpc('admin_user_metrics', { p_user_id: targetUserId }),
      supabaseAdmin.auth.admin.getUserById(targetUserId),
    ]);

    if (profileRes.error) {
      console.error('Error loading target profile in admin-get-user-overview', profileRes.error);
      return new Response(JSON.stringify({ error: 'Failed to load user profile' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (linksRes.error) {
      console.error('Error loading target links in admin-get-user-overview', linksRes.error);
      return new Response(JSON.stringify({ error: 'Failed to load user links' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (metricsRes.error) {
      console.error('admin_user_metrics RPC failed', metricsRes.error);
    }

    const profile = profileRes.data as any;
    const linksData = linksRes.data ?? [];
    const assets = assetsRes.data ?? [];
    const payoutsData = payoutsRes.data ?? [];
    const isDirectoryVisible: boolean | null = directoryVisRes.data?.is_directory_visible ?? true;
    const allCreatorLinkIds = (creatorLinkIdsRes.data ?? []).map((r: any) => r.id as string);
    const metrics = (metricsRes.data ?? null) as AdminUserMetrics | null;

    if (authUserRes.error) {
      console.error('Error loading auth user in admin-get-user-overview', authUserRes.error);
    }

    // ── Sign all link media + asset previews in parallel ──────────────────
    type SignedMedia = {
      id: string;
      storage_path: string;
      mime_type: string | null;
      title: string | null;
      preview_url: string | null;
    };

    const signedLinks = await Promise.all(
      (linksData as any[]).map(async (link) => {
        const primaryStoragePath = link.storage_path as string | null;
        const linkMedia = (link.link_media ?? []) as any[];
        linkMedia.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

        const mediaTargets: Array<{ id: string; path: string; mime: string | null; label: string | null }> = [];
        for (const lm of linkMedia) {
          const asset = lm.assets;
          if (asset?.storage_path) {
            mediaTargets.push({
              id: asset.id,
              path: asset.storage_path,
              mime: asset.mime_type ?? null,
              label: asset.title ?? null,
            });
          }
        }
        if (mediaTargets.length === 0 && primaryStoragePath) {
          mediaTargets.push({
            id: 'primary',
            path: primaryStoragePath,
            mime: link.mime_type ?? null,
            label: 'Primary Content',
          });
        }

        const mediaItems: SignedMedia[] = await Promise.all(
          mediaTargets.map(async (t) => ({
            id: t.id,
            storage_path: t.path,
            mime_type: t.mime || detectMimeType(t.path),
            title: t.label,
            preview_url: await signStoragePath(t.path),
          })),
        );

        return {
          id: link.id as string,
          slug: (link.slug as string | null) ?? null,
          title: (link.title as string | null) ?? null,
          description: (link.description as string | null) ?? null,
          status: (link.status as string | null) ?? null,
          show_on_profile: (link.show_on_profile as boolean | null) ?? null,
          price_cents: (link.price_cents as number | null) ?? null,
          created_at: (link.created_at as string | null) ?? null,
          published_at: null as string | null,
          storage_path: primaryStoragePath,
          mime_type: (link.mime_type as string | null) ?? mediaItems[0]?.mime_type ?? null,
          profile_id: (link.profile_id as string | null) ?? null,
          previewUrl: mediaItems[0]?.preview_url ?? null,
          media: mediaItems,
        };
      }),
    );

    const safeAssets = await Promise.all(
      (assets as any[]).map(async (asset) => ({
        id: asset.id as string,
        title: (asset.title as string | null) ?? null,
        created_at: (asset.created_at as string | null) ?? null,
        mime_type: (asset.mime_type as string | null) ?? null,
        is_public: (asset.is_public as boolean | null) ?? false,
        profile_id: (asset.profile_id as string | null) ?? null,
        storage_path: (asset.storage_path as string | null) ?? null,
        preview_url: asset.storage_path ? await signStoragePath(asset.storage_path as string) : null,
      })),
    );

    // ── Sales list across ALL the creator's links (not just the 30 shown) ─
    const linkTitleById = new Map<string, string | null>();
    for (const l of signedLinks) {
      if (l.id) linkTitleById.set(l.id, l.title);
    }

    let sales: UserOverviewPayload['sales'] = [];
    if (allCreatorLinkIds.length > 0) {
      const { data: purchases, error: purchasesError } = await supabaseAdmin
        .from('purchases')
        .select('id, link_id, buyer_email, amount_cents, currency, status, created_at')
        .in('link_id', allCreatorLinkIds)
        .order('created_at', { ascending: false })
        .limit(100);

      if (purchasesError) {
        console.error('Error loading purchases in admin-get-user-overview', purchasesError);
      } else {
        sales = (purchases ?? []).map((p: any) => {
          const lid = (p.link_id as string | null) ?? null;
          return {
            id: p.id as string,
            link_id: lid,
            link_title: lid ? linkTitleById.get(lid) ?? null : null,
            buyer_email: (p.buyer_email as string | null) ?? null,
            amount_cents: typeof p.amount_cents === 'number' ? (p.amount_cents as number) : null,
            currency: (p.currency as string | null) ?? null,
            status: (p.status as string) ?? 'unknown',
            created_at: (p.created_at as string | null) ?? null,
          };
        });
      }
    }

    // ── Wallet totals reconciliation (keeps pre-wallet-migration parity) ──
    const computedEarnedCents = metrics?.totals?.net_cents ?? 0;
    const computedWithdrawnCents = (payoutsData as any[])
      .filter((p) => p.status === 'completed' || p.status === 'approved' || p.status === 'processing')
      .reduce((s, p) => s + (p.amount_cents || 0), 0);

    const finalEarned = Math.max(profile?.total_earned_cents ?? 0, computedEarnedCents);
    const finalWithdrawn = Math.max(profile?.total_withdrawn_cents ?? 0, computedWithdrawnCents);
    const finalBalance = finalEarned - finalWithdrawn;

    const payload: UserOverviewPayload = {
      profile: profile
        ? {
          id: profile.id,
          display_name: profile.display_name ?? null,
          handle: profile.handle ?? null,
          created_at: profile.created_at ?? null,
          is_creator: profile.is_creator ?? null,
          country: profile.country ?? null,
          role: profile.role ?? null,
          is_directory_visible: isDirectoryVisible,
          is_creator_subscribed: profile.is_creator_subscribed ?? false,
          wallet_balance_cents: Math.max(profile.wallet_balance_cents ?? 0, finalBalance),
          total_earned_cents: finalEarned,
          total_withdrawn_cents: finalWithdrawn,
          bank_iban: profile.bank_iban ?? null,
          bank_holder_name: profile.bank_holder_name ?? null,
          bank_bic: profile.bank_bic ?? null,
          bank_account_type: profile.bank_account_type ?? null,
          bank_account_number: profile.bank_account_number ?? null,
          bank_routing_number: profile.bank_routing_number ?? null,
          bank_bsb: profile.bank_bsb ?? null,
          bank_country: profile.bank_country ?? null,
          payout_setup_complete: profile.payout_setup_complete ?? false,
        }
        : null,
      links: signedLinks,
      assets: safeAssets,
      sales,
      payouts: payoutsData as any,
      metrics,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error in admin-get-user-overview', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
