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

interface AdminUserSummary {
  id: string;
  display_name: string | null;
  handle: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string | null;
  is_creator: boolean | null;
  is_admin: boolean | null;
  is_agency: boolean | null;
  links_count: number;
  assets_count: number;
  total_sales: number;
  total_revenue_cents: number;
  profile_view_count: number;
}

type SortBy = 'created_desc' | 'created_asc' | 'best_sellers' | 'most_viewed' | 'most_content' | 'most_links';
const ALLOWED_SORTS: SortBy[] = ['created_desc', 'created_asc', 'best_sellers', 'most_viewed', 'most_content', 'most_links'];

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
    let search: string | null = null;
    let page = 1;
    let pageSize = 50;
    let sortBy: SortBy = 'created_desc';

    try {
      const rawBody = await req.text();
      if (rawBody) {
        const body = JSON.parse(rawBody);

        if (typeof body.search === 'string') {
          const trimmed = body.search.trim();
          search = trimmed.length > 0 ? trimmed : null;
        }
        if (typeof body.page === 'number' && body.page > 0) {
          page = Math.floor(body.page);
        }
        if (typeof body.pageSize === 'number' && body.pageSize > 0) {
          pageSize = Math.min(Math.floor(body.pageSize), 200);
        }
        if (typeof body.sortBy === 'string' && ALLOWED_SORTS.includes(body.sortBy as SortBy)) {
          sortBy = body.sortBy as SortBy;
        }
      }
    } catch {
      // Fall back to defaults
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
      console.error('Error resolving user in admin-get-users', userError);
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_admin')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (adminProfileError) {
      console.error('Error loading admin profile in admin-get-users', adminProfileError);
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

    // Single round-trip: admin_list_users does the join + aggregation + pagination
    // server-side and returns one extra column `total_count` (same on every row).
    const { data: rows, error: rpcError } = await supabaseAdmin.rpc('admin_list_users', {
      p_search: search,
      p_page: page,
      p_page_size: pageSize,
      p_sort_by: sortBy,
    });

    if (rpcError) {
      console.error('admin_list_users RPC failed', rpcError);
      return new Response(JSON.stringify({ error: 'Failed to load users' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const list = (rows ?? []) as Array<any>;
    const total = list.length > 0 ? Number(list[0].total_count) : 0;

    const users: AdminUserSummary[] = list.map((r) => ({
      id: r.id,
      display_name: r.display_name ?? null,
      handle: r.handle ?? null,
      email: r.email ?? null,
      avatar_url: r.avatar_url ?? null,
      created_at: r.created_at ?? null,
      is_creator: r.is_creator ?? null,
      is_admin: r.is_admin ?? null,
      is_agency: r.is_agency ?? null,
      links_count: Number(r.links_count ?? 0),
      assets_count: Number(r.assets_count ?? 0),
      total_sales: Number(r.total_sales ?? 0),
      total_revenue_cents: Number(r.total_revenue_cents ?? 0),
      profile_view_count: Number(r.profile_view_count ?? 0),
    }));

    return new Response(JSON.stringify({ users, page, pageSize, total }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error in admin-get-users', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
