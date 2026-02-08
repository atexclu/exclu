import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL/PROJECT_URL or SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY');
}

if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// CORS: restrict to the main site URL + local dev origins instead of wildcard "*".
const normalizedSiteOrigin = siteUrl.replace(/\/$/, '');
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
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

// Very lightweight in-memory rate limiting per IP and function instance.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // per IP per window
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
  created_at: string | null;
  is_creator: boolean | null;
  is_admin: boolean | null;
  links_count: number;
  assets_count: number;
  total_sales: number;
  total_revenue_cents: number;
  profile_view_count: number;
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
    let search: string | null = null;
    let page = 1;
    let pageSize = 50;
    let sortBy: 'created_desc' | 'created_asc' | 'best_sellers' | 'most_viewed' | 'most_content' | 'most_links' = 'created_desc';

    try {
      const rawBody = await req.text();
      if (rawBody) {
        const body = JSON.parse(rawBody);

        if (typeof body.search === 'string') {
          const trimmed = body.search.trim();
          search = trimmed.length > 0 ? trimmed : null;
        }

        if (typeof body.page === 'number' && body.page > 0) {
          page = body.page;
        }

        if (typeof body.pageSize === 'number' && body.pageSize > 0) {
          pageSize = Math.min(body.pageSize, 200);
        }

        if (typeof body.sortBy === 'string') {
          sortBy = body.sortBy as any;
        }
      }
    } catch {
      // Ignore body parse errors and fall back to defaults
    }

    const normalizedSearch = search ? search.toLowerCase() : null;

    // Get the user from a dedicated header carrying the Supabase access token.
    // We use a custom header (x-supabase-auth) so that the Functions gateway
    // can continue to use the project key for its own Authorization header.
    const rawToken = req.headers.get('x-supabase-auth') ?? '';
    const token = rawToken.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use an anon client to resolve the current user from the JWT.
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

    // Ensure the caller is an admin according to the profiles table
    const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_admin')
      .eq('id', user.id)
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

    // Fetch user profiles for the admin dashboard with optional search and pagination.
    let users: any[] = [];
    let totalUsers = 0;

    // Sorts that depend on aggregated data (links, assets, sales) need all profiles first
    const needsFullFetch = ['most_content', 'most_links', 'best_sellers'].includes(sortBy);

    if (!normalizedSearch) {
      let query = supabaseAdmin
        .from('profiles')
        .select('id, display_name, handle, created_at, is_creator, is_admin, profile_view_count', { count: 'exact' });

      // For aggregated sorts, fetch all profiles (override default 1000 row limit)
      if (needsFullFetch) {
        query = query.range(0, 9999);
      }

      // Apply DB-level sorting only for sorts that don't depend on aggregated data
      if (!needsFullFetch) {
        if (sortBy === 'created_asc') {
          query = query.order('created_at', { ascending: true });
        } else if (sortBy === 'most_viewed') {
          query = query.order('profile_view_count', { ascending: false, nullsLast: true });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      }

      const { data: usersPage, error: usersError, count } = await query;

      if (usersError) {
        console.error('Error loading users in admin-get-users', usersError);
        return new Response(JSON.stringify({ error: 'Failed to load users' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      users = usersPage ?? [];
      totalUsers = typeof count === 'number' ? count : users.length;
    } else {
      // Search across profiles (display_name, handle, id when search looks like a UUID)
      const searchTerm = normalizedSearch;

      const orParts: string[] = [
        `display_name.ilike.%${searchTerm}%`,
        `handle.ilike.%${searchTerm}%`,
      ];

      // Only add an id equality filter if the search string looks like a UUID.
      // This avoids Postgres errors like "invalid input syntax for type uuid" when the
      // search term is an email or arbitrary text.
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(searchTerm)) {
        orParts.push(`id.eq.${searchTerm}`);
      }

      const orFilters = orParts.join(',');

      const { data: matchedProfiles, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name, handle, created_at, is_creator, is_admin, profile_view_count')
        .or(orFilters);

      if (profilesError) {
        console.error('Error searching profiles in admin-get-users', profilesError);
        return new Response(JSON.stringify({ error: 'Failed to load users' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Additionally search by email via auth users
      const matchingEmailUserIds: string[] = [];
      try {
        const { data: authUsersData, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

        if (authUsersError) {
          console.error('Error loading auth users for search in admin-get-users', authUsersError);
        } else {
          const authUsers = authUsersData?.users ?? [];
          for (const au of authUsers) {
            const email = (au.email ?? '').toLowerCase();
            if (email && email.includes(searchTerm) && au.id) {
              matchingEmailUserIds.push(au.id);
            }
          }
        }
      } catch (e) {
        console.error('Unexpected error while listing auth users for search in admin-get-users', e);
      }

      const existingIds = new Set((matchedProfiles ?? []).map((u: any) => u.id as string));
      const extraIds = matchingEmailUserIds.filter((id) => !existingIds.has(id));

      let extraProfiles: any[] = [];
      if (extraIds.length > 0) {
        const { data: extraProfilesData, error: extraProfilesError } = await supabaseAdmin
          .from('profiles')
          .select('id, display_name, handle, created_at, is_creator, is_admin, profile_view_count')
          .in('id', extraIds);

        if (extraProfilesError) {
          console.error(
            'Error loading extra profiles for email search in admin-get-users',
            extraProfilesError,
          );
        } else {
          extraProfiles = extraProfilesData ?? [];
        }
      }

      const allMatched = [...(matchedProfiles ?? []), ...extraProfiles];

      totalUsers = allMatched.length;

      const fromIndex = (page - 1) * pageSize;
      const toIndex = fromIndex + pageSize;
      users = allMatched.slice(fromIndex, toIndex);
    }

    let userIds = (users ?? []).map((u: any) => u.id as string).filter(Boolean);

    // Fetch aggregated metrics from profile_analytics
    const { data: analytics, error: analyticsError } = await supabaseAdmin
      .from('profile_analytics')
      .select('profile_id, sales_count, revenue_cents, profile_views, link_clicks');

    if (analyticsError) {
      console.error('Error loading analytics in admin-get-users', analyticsError);
      return new Response(JSON.stringify({ error: 'Failed to load analytics' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load auth users to hydrate emails in the summary
    const emailByUserId = new Map<string, string | null>();
    if (userIds.length > 0) {
      try {
        const { data: authUsersData, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

        if (authUsersError) {
          console.error('Error loading auth users in admin-get-users', authUsersError);
        } else {
          const authUsers = authUsersData?.users ?? [];
          for (const au of authUsers) {
            // Only keep emails for users we care about
            if (au.id && userIds.includes(au.id)) {
              emailByUserId.set(au.id, au.email ?? null);
            }
          }
        }
      } catch (e) {
        console.error('Unexpected error while listing auth users in admin-get-users', e);
      }
    }

    // Compute per-user link counts and map link_id -> creator_id
    const linksCountByUser = new Map<string, number>();
    const linkOwnerById = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: linksAll, error: linksError } = await supabaseAdmin
        .from('links')
        .select('id, creator_id')
        .in('creator_id', userIds);

      if (linksError) {
        console.error('Error loading links in admin-get-users', linksError);
      } else {
        for (const link of linksAll ?? []) {
          const creatorId = (link as any).creator_id as string | null;
          const linkId = (link as any).id as string | null;
          if (!creatorId || !linkId) continue;
          linkOwnerById.set(linkId, creatorId);
          linksCountByUser.set(creatorId, (linksCountByUser.get(creatorId) ?? 0) + 1);
        }
      }
    }

    // Compute per-user asset counts
    const assetsCountByUser = new Map<string, number>();
    if (userIds.length > 0) {
      const { data: assetsAll, error: assetsError } = await supabaseAdmin
        .from('assets')
        .select('id, creator_id')
        .in('creator_id', userIds);

      if (assetsError) {
        console.error('Error loading assets in admin-get-users', assetsError);
      } else {
        for (const asset of assetsAll ?? []) {
          const creatorId = (asset as any).creator_id as string | null;
          if (!creatorId) continue;
          assetsCountByUser.set(creatorId, (assetsCountByUser.get(creatorId) ?? 0) + 1);
        }
      }
    }

    // Build maps for aggregated metrics from profile_analytics
    const salesCountByUser = new Map<string, number>();
    const revenueByUser = new Map<string, number>();
    const profileViewsByUser = new Map<string, number>();
    const linkClicksByUser = new Map<string, number>();

    for (const analytic of (analytics ?? []) as any[]) {
      const profileId = analytic.profile_id as string;
      
      // Aggregate metrics for each profile (user)
      const currentSales = salesCountByUser.get(profileId) ?? 0;
      salesCountByUser.set(profileId, currentSales + (analytic.sales_count ?? 0));

      const currentRevenue = revenueByUser.get(profileId) ?? 0;
      revenueByUser.set(profileId, currentRevenue + (analytic.revenue_cents ?? 0));

      const currentViews = profileViewsByUser.get(profileId) ?? 0;
      profileViewsByUser.set(profileId, currentViews + (analytic.profile_views ?? 0));

      const currentClicks = linkClicksByUser.get(profileId) ?? 0;
      linkClicksByUser.set(profileId, currentClicks + (analytic.link_clicks ?? 0));
    }

    const safeUsers: AdminUserSummary[] = (users ?? []).map((u: any) => {
      const userId = u.id as string;
      return {
        id: userId,
        display_name: u.display_name ?? null,
        handle: u.handle ?? null,
        email: emailByUserId.get(userId) ?? null,
        created_at: u.created_at ?? null,
        is_creator: u.is_creator ?? null,
        is_admin: u.is_admin ?? null,
        links_count: linksCountByUser.get(userId) ?? 0,
        assets_count: assetsCountByUser.get(userId) ?? 0,
        total_sales: salesCountByUser.get(userId) ?? 0,
        total_revenue_cents: revenueByUser.get(userId) ?? 0,
        profile_view_count: u.profile_view_count ?? 0,
      };
    });

    // Apply sorting on aggregated data, then paginate
    if (sortBy === 'best_sellers') {
      safeUsers.sort((a, b) => {
        if (b.total_sales !== a.total_sales) {
          return b.total_sales - a.total_sales;
        }
        return b.total_revenue_cents - a.total_revenue_cents;
      });
    } else if (sortBy === 'most_content') {
      safeUsers.sort((a, b) => b.assets_count - a.assets_count);
    } else if (sortBy === 'most_links') {
      safeUsers.sort((a, b) => b.links_count - a.links_count);
    }

    // For aggregated sorts, paginate after sorting
    let paginatedUsers = safeUsers;
    if (needsFullFetch) {
      totalUsers = safeUsers.length;
      const fromIndex = (page - 1) * pageSize;
      paginatedUsers = safeUsers.slice(fromIndex, fromIndex + pageSize);
    }

    return new Response(JSON.stringify({ users: paginatedUsers, page, pageSize, total: totalUsers }), {
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
