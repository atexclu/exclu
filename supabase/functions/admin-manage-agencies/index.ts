import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}
if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY');
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

async function verifyAdmin(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  const rawToken = req.headers.get('x-supabase-auth') ?? '';
  const token = rawToken.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing authorization token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAuthClient = createClient(supabaseUrl!, supabaseAnonKey!);
  const { data: { user }, error: userError } = await supabaseAuthClient.auth.getUser(token);

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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

  return null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authError = await verifyAdmin(req, corsHeaders);
    if (authError) return authError;

    const body = await req.json();
    const { action } = body;

    // ── LIST ──────────────────────────────────────────────────────────
    if (action === 'list') {
      const { data: agencies, error } = await supabaseAdmin
        .from('directory_agencies')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('admin-manage-agencies list error', error);
        return new Response(JSON.stringify({ error: 'Failed to list agencies' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ agencies: agencies ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── CREATE ────────────────────────────────────────────────────────
    if (action === 'create') {
      const {
        slug, name, logo_url, description, website_url, contact_email,
        country, city, services, creator_profile_ids, agency_id,
        meta_title, meta_description, is_visible, is_featured, sort_order,
      } = body;

      if (!name || !country) {
        return new Response(JSON.stringify({ error: 'Name and country are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const finalSlug = slug || name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 200);

      const { data: existing } = await supabaseAdmin
        .from('directory_agencies')
        .select('id')
        .eq('slug', finalSlug)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: 'Slug already exists' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: agency, error } = await supabaseAdmin
        .from('directory_agencies')
        .insert({
          slug: finalSlug,
          name,
          logo_url: logo_url || null,
          description: description || null,
          website_url: website_url || null,
          contact_email: contact_email || null,
          country,
          city: city || null,
          services: services || [],
          creator_profile_ids: creator_profile_ids || [],
          agency_id: agency_id || null,
          meta_title: meta_title || null,
          meta_description: meta_description || null,
          is_visible: is_visible !== false,
          is_featured: is_featured === true,
          sort_order: sort_order || 0,
        })
        .select()
        .single();

      if (error) {
        console.error('admin-manage-agencies create error', error);
        return new Response(JSON.stringify({ error: 'Failed to create agency: ' + error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ agency }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── UPDATE ────────────────────────────────────────────────────────
    if (action === 'update') {
      const { id, ...updates } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'Missing agency id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      delete updates.action;

      if (updates.slug) {
        const { data: existing } = await supabaseAdmin
          .from('directory_agencies')
          .select('id')
          .eq('slug', updates.slug)
          .neq('id', id)
          .maybeSingle();

        if (existing) {
          return new Response(JSON.stringify({ error: 'Slug already exists' }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      updates.updated_at = new Date().toISOString();

      const { data: agency, error } = await supabaseAdmin
        .from('directory_agencies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('admin-manage-agencies update error', error);
        return new Response(JSON.stringify({ error: 'Failed to update agency: ' + error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ agency }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── DELETE ─────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { id } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'Missing agency id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabaseAdmin
        .from('directory_agencies')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('admin-manage-agencies delete error', error);
        return new Response(JSON.stringify({ error: 'Failed to delete' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action: ' + action }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error in admin-manage-agencies', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
