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

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate caller via custom header
    const rawToken = req.headers.get('x-supabase-auth') ?? '';
    const token = rawToken.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuthClient = createClient(supabaseUrl!, supabaseAnonKey!);
    const {
      data: { user },
      error: userError,
    } = await supabaseAuthClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify admin status
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (!adminProfile || adminProfile.is_admin !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse requested columns from body
    const ALL_COLUMNS = [
      'username', 'display_name', 'handle', 'email', 'account_type', 'country',
      'created_at', 'wallet_balance', 'total_earned', 'total_withdrawn',
      'subscription', 'links_count', 'total_sales', 'total_revenue',
      'profile_views', 'bank_country', 'phone',
    ];

    let requestedColumns: string[] = ALL_COLUMNS;
    let format: 'csv' | 'xlsx' = 'csv';
    try {
      const rawBody = await req.text();
      if (rawBody) {
        const body = JSON.parse(rawBody);
        if (Array.isArray(body.columns) && body.columns.length > 0) {
          requestedColumns = body.columns.filter((c: string) => ALL_COLUMNS.includes(c));
          if (requestedColumns.length === 0) requestedColumns = ALL_COLUMNS;
        }
        if (body.format === 'xlsx') format = 'xlsx';
      }
    } catch { /* ignore parse errors */ }

    // 1. Load all profiles with relevant columns
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, handle, display_name, country, is_creator, is_admin, agency_name, created_at, wallet_balance_cents, total_earned_cents, total_withdrawn_cents, is_creator_subscribed, bank_country, role, phone')
      .order('created_at', { ascending: false })
      .range(0, 99999);

    if (profilesError) {
      console.error('Error loading profiles', profilesError);
      return new Response(JSON.stringify({ error: 'Failed to load profiles' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Load emails from auth if needed
    const needsEmail = requestedColumns.includes('email');
    const emailByUserId = new Map<string, string>();
    if (needsEmail) {
      let currentPage = 1;
      let hasMore = true;
      while (hasMore) {
        const { data: authUsersData, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers({
          page: currentPage,
          perPage: 1000,
        });
        if (authUsersError) {
          console.error('Error loading auth users', authUsersError);
          break;
        }
        const authUsers = authUsersData?.users ?? [];
        for (const au of authUsers) {
          if (au.id && au.email) emailByUserId.set(au.id, au.email);
        }
        hasMore = authUsers.length === 1000;
        currentPage++;
      }
    }

    // 3. Load analytics if needed
    const needsAnalytics = ['links_count', 'total_sales', 'total_revenue', 'profile_views'].some(c => requestedColumns.includes(c));
    const analyticsMap = new Map<string, { sales: number; revenue: number; views: number; links: number }>();
    if (needsAnalytics) {
      const { data: analytics } = await supabaseAdmin
        .from('profile_analytics')
        .select('profile_id, sales_count, revenue_cents, profile_views, link_clicks');
      for (const a of (analytics ?? []) as any[]) {
        const pid = a.profile_id as string;
        const existing = analyticsMap.get(pid) ?? { sales: 0, revenue: 0, views: 0, links: 0 };
        existing.sales += a.sales_count ?? 0;
        existing.revenue += a.revenue_cents ?? 0;
        existing.views += a.profile_views ?? 0;
        analyticsMap.set(pid, existing);
      }
      // links count
      if (requestedColumns.includes('links_count')) {
        const { data: links } = await supabaseAdmin.from('links').select('id, creator_id').range(0, 99999);
        for (const l of (links ?? []) as any[]) {
          const cid = l.creator_id as string;
          if (!cid) continue;
          const existing = analyticsMap.get(cid) ?? { sales: 0, revenue: 0, views: 0, links: 0 };
          existing.links += 1;
          analyticsMap.set(cid, existing);
        }
      }
    }

    // 4. Build column value getters
    const getAccountType = (p: any): string => {
      if (p.is_admin) return 'Admin';
      if (p.agency_name) return 'Agency';
      if (p.is_creator) return 'Creator';
      return 'Fan';
    };

    const getColumnValue = (col: string, p: any): string => {
      const a = analyticsMap.get(p.id);
      switch (col) {
        case 'username': return p.handle || p.display_name || '';
        case 'display_name': return p.display_name || '';
        case 'handle': return p.handle || '';
        case 'email': return emailByUserId.get(p.id) || '';
        case 'account_type': return getAccountType(p);
        case 'country': return p.country || '';
        case 'created_at': return p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : '';
        case 'wallet_balance': return ((p.wallet_balance_cents ?? 0) / 100).toFixed(2);
        case 'total_earned': return ((p.total_earned_cents ?? 0) / 100).toFixed(2);
        case 'total_withdrawn': return ((p.total_withdrawn_cents ?? 0) / 100).toFixed(2);
        case 'subscription': return p.is_creator_subscribed ? 'Premium' : 'Free';
        case 'links_count': return String(a?.links ?? 0);
        case 'total_sales': return String(a?.sales ?? 0);
        case 'total_revenue': return ((a?.revenue ?? 0) / 100).toFixed(2);
        case 'profile_views': return String(a?.views ?? 0);
        case 'bank_country': return p.bank_country || '';
        case 'phone': return p.phone || '';
        default: return '';
      }
    };

    // 5. Build CSV
    const header = requestedColumns.join(',');
    const rows = (profiles ?? []).map((p: any) =>
      requestedColumns.map(col => escapeCsvField(getColumnValue(col, p))).join(',')
    );
    const csv = [header, ...rows].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="exclu-users-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('Unexpected error in admin-export-users-csv', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
