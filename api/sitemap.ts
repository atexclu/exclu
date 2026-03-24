import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG53ZXpldGpsYndsdHljY2tzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTcyNjcsImV4cCI6MjA4Mzg3MzI2N30.BwE47MEU7KVm3NWXbX7hK1osCc00dQ0s8Y0Qudh5eyE';
const SITE_URL = 'https://exclu.at';

async function supabaseFetch(path: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  return res.json();
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const [articles, categories, agencies, tools, creators] = await Promise.all([
      supabaseFetch('blog_articles?status=eq.published&select=slug,updated_at,published_at&order=published_at.desc') as Promise<any[]>,
      supabaseFetch('blog_categories?select=slug,updated_at&order=sort_order') as Promise<any[]>,
      supabaseFetch('directory_agencies?is_visible=eq.true&select=slug,updated_at&order=sort_order') as Promise<any[]>,
      supabaseFetch('tool_comparisons?is_visible=eq.true&select=slug,updated_at&order=sort_order') as Promise<any[]>,
      supabaseFetch('creator_profiles?is_directory_visible=eq.true&select=username,updated_at&order=profile_view_count.desc&limit=500') as Promise<any[]>,
    ]);

    const urls: { loc: string; lastmod?: string; changefreq: string; priority: string }[] = [];

    // Static pages
    urls.push({ loc: SITE_URL, changefreq: 'weekly', priority: '1.0' });
    urls.push({ loc: `${SITE_URL}/blog`, changefreq: 'daily', priority: '0.9' });
    urls.push({ loc: `${SITE_URL}/directory`, changefreq: 'weekly', priority: '0.8' });
    urls.push({ loc: `${SITE_URL}/directory/creators`, changefreq: 'weekly', priority: '0.7' });
    urls.push({ loc: `${SITE_URL}/directory/agencies`, changefreq: 'weekly', priority: '0.7' });
    urls.push({ loc: `${SITE_URL}/directory/tools`, changefreq: 'weekly', priority: '0.7' });
    urls.push({ loc: `${SITE_URL}/privacy`, changefreq: 'monthly', priority: '0.3' });
    urls.push({ loc: `${SITE_URL}/terms`, changefreq: 'monthly', priority: '0.3' });

    // Blog articles
    for (const a of articles || []) {
      urls.push({
        loc: `${SITE_URL}/blog/${esc(a.slug)}`,
        lastmod: a.updated_at || a.published_at,
        changefreq: 'weekly',
        priority: '0.8',
      });
    }

    // Blog categories
    for (const c of categories || []) {
      urls.push({
        loc: `${SITE_URL}/blog/category/${esc(c.slug)}`,
        lastmod: c.updated_at,
        changefreq: 'weekly',
        priority: '0.6',
      });
    }

    // Directory agencies
    for (const a of agencies || []) {
      urls.push({
        loc: `${SITE_URL}/directory/agencies/${esc(a.slug)}`,
        lastmod: a.updated_at,
        changefreq: 'monthly',
        priority: '0.6',
      });
    }

    // Tool comparisons
    for (const t of tools || []) {
      urls.push({
        loc: `${SITE_URL}/directory/tools/${esc(t.slug)}`,
        lastmod: t.updated_at,
        changefreq: 'monthly',
        priority: '0.7',
      });
    }

    // Creator profiles
    for (const c of creators || []) {
      urls.push({
        loc: `${SITE_URL}/@${esc(c.username)}`,
        lastmod: c.updated_at,
        changefreq: 'weekly',
        priority: '0.5',
      });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().split('T')[0]}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    return res.send(xml);
  } catch (error) {
    console.error('sitemap error:', error);
    res.setHeader('Content-Type', 'application/xml');
    return res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
}
