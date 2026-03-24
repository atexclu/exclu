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

function estimateReadingTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, '').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 250));
}

function sanitizeString(val: unknown, maxLen: number): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
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
      const { data: articles, error } = await supabaseAdmin
        .from('blog_articles')
        .select('id, slug, title, status, category_id, published_at, scheduled_at, view_count, created_at, updated_at, blog_categories(name)')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('admin-blog-manage list error', error);
        return new Response(JSON.stringify({ error: 'Failed to list articles' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ articles: articles ?? [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── GET ───────────────────────────────────────────────────────────
    if (action === 'get') {
      const { id } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'Missing article id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: article, error } = await supabaseAdmin
        .from('blog_articles')
        .select('*, blog_categories(name, slug)')
        .eq('id', id)
        .maybeSingle();

      if (error || !article) {
        return new Response(JSON.stringify({ error: 'Article not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ article }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── CREATE ────────────────────────────────────────────────────────
    if (action === 'create') {
      const {
        title, slug, excerpt, content, content_html, cover_image_url, cover_image_alt,
        category_id, tags, meta_title, meta_description, canonical_url, og_image_url,
        focus_keyword, author_name, author_url, status: articleStatus, published_at, scheduled_at,
      } = body;

      if (!title || !slug) {
        return new Response(JSON.stringify({ error: 'Title and slug are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: existing } = await supabaseAdmin
        .from('blog_articles')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: 'Slug already exists' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const readingTime = content_html ? estimateReadingTime(content_html) : 0;

      const insertData: Record<string, unknown> = {
        title,
        slug,
        excerpt: excerpt || null,
        content: content || {},
        content_html: content_html || null,
        cover_image_url: cover_image_url || null,
        cover_image_alt: sanitizeString(cover_image_alt, 300),
        category_id: category_id || null,
        tags: tags || [],
        meta_title: sanitizeString(meta_title, 70),
        meta_description: sanitizeString(meta_description, 170),
        canonical_url: canonical_url || null,
        og_image_url: og_image_url || null,
        focus_keyword: sanitizeString(focus_keyword, 100),
        author_name: author_name || 'Exclu Team',
        author_url: author_url || null,
        reading_time_minutes: readingTime,
        status: articleStatus || 'draft',
      };

      if (articleStatus === 'published') {
        insertData.published_at = published_at || new Date().toISOString();
      }
      if (articleStatus === 'scheduled' && scheduled_at) {
        insertData.scheduled_at = scheduled_at;
      }

      const { data: article, error } = await supabaseAdmin
        .from('blog_articles')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('admin-blog-manage create error', error);
        return new Response(JSON.stringify({ error: 'Failed to create article: ' + error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ article }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── UPDATE ────────────────────────────────────────────────────────
    if (action === 'update') {
      const { id, ...updates } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'Missing article id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      delete updates.action;

      if ('meta_title' in updates) updates.meta_title = sanitizeString(updates.meta_title, 70);
      if ('meta_description' in updates) updates.meta_description = sanitizeString(updates.meta_description, 170);
      if ('focus_keyword' in updates) updates.focus_keyword = sanitizeString(updates.focus_keyword, 100);
      if ('cover_image_alt' in updates) updates.cover_image_alt = sanitizeString(updates.cover_image_alt, 300);

      if (updates.slug) {
        const { data: existing } = await supabaseAdmin
          .from('blog_articles')
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

      if (updates.content_html) {
        updates.reading_time_minutes = estimateReadingTime(updates.content_html);
      }

      if (updates.status === 'published' && !updates.published_at) {
        const { data: current } = await supabaseAdmin
          .from('blog_articles')
          .select('published_at')
          .eq('id', id)
          .maybeSingle();
        if (!current?.published_at) {
          updates.published_at = new Date().toISOString();
        }
      }

      updates.updated_at = new Date().toISOString();

      const { data: article, error } = await supabaseAdmin
        .from('blog_articles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('admin-blog-manage update error', error);
        return new Response(JSON.stringify({ error: 'Failed to update article: ' + error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ article }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── ARCHIVE ───────────────────────────────────────────────────────
    if (action === 'archive') {
      const { id } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'Missing article id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabaseAdmin
        .from('blog_articles')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error('admin-blog-manage archive error', error);
        return new Response(JSON.stringify({ error: 'Failed to archive' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── DELETE ─────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { id } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'Missing article id' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabaseAdmin
        .from('blog_articles')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('admin-blog-manage delete error', error);
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
    console.error('Unexpected error in admin-blog-manage', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
