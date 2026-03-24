import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG53ZXpldGpsYndsdHljY2tzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTcyNjcsImV4cCI6MjA4Mzg3MzI2N30.BwE47MEU7KVm3NWXbX7hK1osCc00dQ0s8Y0Qudh5eyE';
const SITE_URL = 'https://exclu.at';

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const articlesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/blog_articles?status=eq.published&select=slug,title,excerpt,published_at,author_name,blog_categories(name)&order=published_at.desc&limit=50`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    const articles = (await articlesRes.json()) as any[];

    const now = new Date().toUTCString();
    const lastBuildDate = articles?.[0]?.published_at
      ? new Date(articles[0].published_at).toUTCString()
      : now;

    const items = (articles || []).map((a: any) => {
      const pubDate = a.published_at ? new Date(a.published_at).toUTCString() : now;
      const category = a.blog_categories?.name;
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${SITE_URL}/blog/${esc(a.slug)}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${esc(a.slug)}</guid>
      <pubDate>${pubDate}</pubDate>
      ${a.excerpt ? `<description>${esc(a.excerpt)}</description>` : ''}
      ${a.author_name ? `<author>${esc(a.author_name)}</author>` : ''}
      ${category ? `<category>${esc(category)}</category>` : ''}
    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Exclu Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>Insights, guides, and news for content creators building their business with Exclu.</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    return res.send(xml);
  } catch (error) {
    console.error('rss error:', error);
    res.setHeader('Content-Type', 'application/rss+xml');
    return res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Exclu Blog</title></channel></rss>');
  }
}
