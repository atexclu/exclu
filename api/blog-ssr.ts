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

async function supabaseFetch(path: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  return res.json();
}

function htmlShell({
  title,
  description,
  url,
  image,
  body,
  jsonLd,
  canonical,
}: {
  title: string;
  description: string;
  url: string;
  image: string;
  body: string;
  jsonLd?: string;
  canonical?: string;
}): string {
  const canonicalUrl = canonical || url;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${canonicalUrl}" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="Exclu" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@exclu" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${image}" />

  ${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}

  <link rel="icon" href="/Logo-mini.svg" />
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#020617;color:#e2e8f0;line-height:1.7}
    a{color:#bef264;text-decoration:none}
    a:hover{text-decoration:underline}
    .container{max-width:800px;margin:0 auto;padding:2rem 1.5rem}
    .nav{padding:1rem 1.5rem;border-bottom:1px solid rgba(255,255,255,0.05)}
    .nav-inner{max-width:800px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
    .nav a{color:#e2e8f0;font-weight:600;font-size:0.875rem}
    .breadcrumb{font-size:0.75rem;color:#64748b;margin-bottom:1.5rem}
    .breadcrumb a{color:#94a3b8}
    .cover{width:100%;max-height:400px;object-fit:cover;border-radius:12px;margin-bottom:2rem}
    .category{display:inline-block;padding:0.25rem 0.75rem;border-radius:9999px;font-size:0.75rem;font-weight:500;background:rgba(190,242,100,0.1);color:#bef264;margin-bottom:1rem}
    h1{font-size:2.25rem;font-weight:800;line-height:1.2;margin-bottom:1rem;color:#f8fafc}
    .meta{font-size:0.8rem;color:#64748b;margin-bottom:2rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center}
    .content{font-size:1rem;line-height:1.8;color:#cbd5e1}
    .content h2{font-size:1.5rem;font-weight:700;color:#f8fafc;margin:2rem 0 1rem}
    .content h3{font-size:1.25rem;font-weight:600;color:#f1f5f9;margin:1.5rem 0 0.75rem}
    .content p{margin-bottom:1rem}
    .content img{max-width:100%;border-radius:8px;margin:1rem 0}
    .content blockquote{border-left:3px solid #bef264;padding-left:1rem;margin:1rem 0;color:#94a3b8;font-style:italic}
    .content ul,.content ol{padding-left:1.5rem;margin-bottom:1rem}
    .content li{margin-bottom:0.5rem}
    .content code{background:rgba(255,255,255,0.05);padding:0.125rem 0.375rem;border-radius:4px;font-size:0.875rem}
    .content pre{background:rgba(255,255,255,0.05);padding:1rem;border-radius:8px;overflow-x:auto;margin:1rem 0}
    .content pre code{background:none;padding:0}
    .author-box{margin-top:3rem;padding-top:2rem;border-top:1px solid rgba(255,255,255,0.05);font-size:0.875rem;color:#94a3b8}
    .author-box strong{color:#e2e8f0}
    .tags{display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:1.5rem}
    .tag{padding:0.25rem 0.75rem;border-radius:9999px;font-size:0.7rem;background:rgba(255,255,255,0.05);color:#94a3b8}
    .footer{margin-top:4rem;padding:2rem 1.5rem;border-top:1px solid rgba(255,255,255,0.05);text-align:center;font-size:0.75rem;color:#475569}
    .card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem;margin-top:2rem}
    .card{border:1px solid rgba(255,255,255,0.05);border-radius:12px;overflow:hidden;transition:border-color 0.2s}
    .card:hover{border-color:rgba(255,255,255,0.1)}
    .card img{width:100%;height:180px;object-fit:cover}
    .card-body{padding:1rem}
    .card-body h3{font-size:1rem;font-weight:600;color:#f8fafc;margin-bottom:0.5rem;line-height:1.3}
    .card-body p{font-size:0.8rem;color:#94a3b8;line-height:1.5}
    .card-meta{font-size:0.7rem;color:#64748b;margin-top:0.5rem}
    @media(max-width:640px){h1{font-size:1.75rem}.container{padding:1.5rem 1rem}}
  </style>
</head>
<body>
  <nav class="nav">
    <div class="nav-inner">
      <a href="/">Exclu</a>
      <div style="display:flex;gap:1.5rem">
        <a href="/blog">Blog</a>
        <a href="/directory">Directory</a>
      </div>
    </div>
  </nav>
  ${body}
  <footer class="footer">
    <p>&copy; ${new Date().getFullYear()} Exclu. All rights reserved.</p>
    <p style="margin-top:0.5rem">
      <a href="/privacy" style="color:#64748b">Privacy</a> &middot;
      <a href="/terms" style="color:#64748b">Terms</a> &middot;
      <a href="/contact" style="color:#64748b">Contact</a>
    </p>
  </footer>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.url || '/blog';

  try {
    // ── ARTICLE PAGE: /blog/:slug ───────────────────────────────────
    const articleMatch = path.match(/^\/blog\/(?!category\/)([^/?]+)/);
    if (articleMatch) {
      const slug = decodeURIComponent(articleMatch[1]);

      const articles = (await supabaseFetch(
        `blog_articles?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*,blog_categories(name,slug)&limit=1`
      )) as any[];

      if (!articles?.length) {
        res.writeHead(302, { Location: '/blog' });
        return res.end();
      }

      const article = articles[0];
      const category = article.blog_categories;
      const title = article.meta_title || article.title;
      const description = article.meta_description || article.excerpt || `Read "${article.title}" on the Exclu blog.`;
      const image = article.og_image_url || article.cover_image_url || `${SITE_URL}/og-blog-default.png`;
      const canonical = article.canonical_url || `${SITE_URL}/blog/${article.slug}`;
      const publishedDate = article.published_at ? new Date(article.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

      const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: article.title,
        description: article.excerpt || '',
        image: image,
        datePublished: article.published_at,
        dateModified: article.updated_at,
        author: {
          '@type': article.author_url ? 'Person' : 'Organization',
          name: article.author_name || 'Exclu Team',
          ...(article.author_url ? { url: article.author_url } : {}),
        },
        publisher: {
          '@type': 'Organization',
          name: 'Exclu',
          url: SITE_URL,
          logo: { '@type': 'ImageObject', url: `${SITE_URL}/Logo-mini.svg` },
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        wordCount: article.content_html ? article.content_html.replace(/<[^>]*>/g, '').split(/\s+/).length : 0,
        ...(article.tags?.length ? { keywords: article.tags.join(', ') } : {}),
      });

      // Track view (fire-and-forget)
      fetch(`${SUPABASE_URL}/rest/v1/blog_article_views`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          article_id: article.id,
          referrer: (req.headers['referer'] || '').slice(0, 2000) || null,
          device_type: /mobile/i.test(req.headers['user-agent'] || '') ? 'mobile' : /tablet|ipad/i.test(req.headers['user-agent'] || '') ? 'tablet' : 'desktop',
        }),
      }).catch(() => {});

      const body = `
  <div class="container">
    <div class="breadcrumb">
      <a href="/blog">Blog</a>${category ? ` &rsaquo; <a href="/blog/category/${category.slug}">${esc(category.name)}</a>` : ''} &rsaquo; ${esc(article.title)}
    </div>
    ${article.cover_image_url ? `<img class="cover" src="${article.cover_image_url}" alt="${esc(article.cover_image_alt || article.title)}" />` : ''}
    ${category ? `<span class="category">${esc(category.name)}</span>` : ''}
    <h1>${esc(article.title)}</h1>
    <div class="meta">
      ${publishedDate ? `<span>${publishedDate}</span>` : ''}
      ${article.reading_time_minutes ? `<span>${article.reading_time_minutes} min read</span>` : ''}
      ${article.author_name ? `<span>By ${article.author_url ? `<a href="${article.author_url}">${esc(article.author_name)}</a>` : esc(article.author_name)}</span>` : ''}
    </div>
    <div class="content">
      ${article.content_html || '<p>Content coming soon.</p>'}
    </div>
    ${article.tags?.length ? `<div class="tags">${article.tags.map((t: string) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    ${article.author_name ? `
    <div class="author-box">
      Written by <strong>${article.author_url ? `<a href="${article.author_url}">${esc(article.author_name)}</a>` : esc(article.author_name)}</strong>
    </div>` : ''}
  </div>`;

      const html = htmlShell({ title, description, url: `${SITE_URL}/blog/${article.slug}`, image, body, jsonLd, canonical });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=300');
      return res.send(html);
    }

    // ── CATEGORY PAGE: /blog/category/:slug ─────────────────────────
    const categoryMatch = path.match(/^\/blog\/category\/([^/?]+)/);
    if (categoryMatch) {
      const catSlug = decodeURIComponent(categoryMatch[1]);

      const categories = (await supabaseFetch(
        `blog_categories?slug=eq.${encodeURIComponent(catSlug)}&select=id,name,slug,description,meta_title,meta_description&limit=1`
      )) as any[];

      if (!categories?.length) {
        res.writeHead(302, { Location: '/blog' });
        return res.end();
      }

      const cat = categories[0];

      const articles = (await supabaseFetch(
        `blog_articles?category_id=eq.${cat.id}&status=eq.published&select=id,slug,title,excerpt,cover_image_url,published_at,reading_time_minutes&order=published_at.desc`
      )) as any[];

      const title = cat.meta_title || `${cat.name} — Exclu Blog`;
      const description = cat.meta_description || cat.description || `Articles about ${cat.name} on the Exclu blog.`;

      const cardsHtml = (articles || []).map((a: any) => `
        <a href="/blog/${a.slug}" class="card">
          ${a.cover_image_url ? `<img src="${a.cover_image_url}" alt="${esc(a.title)}" loading="lazy" />` : `<div style="height:180px;background:linear-gradient(135deg,rgba(190,242,100,0.1),rgba(139,92,246,0.1))"></div>`}
          <div class="card-body">
            <h3>${esc(a.title)}</h3>
            ${a.excerpt ? `<p>${esc(a.excerpt.slice(0, 150))}${a.excerpt.length > 150 ? '...' : ''}</p>` : ''}
            <div class="card-meta">
              ${a.published_at ? new Date(a.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
              ${a.reading_time_minutes ? ` &middot; ${a.reading_time_minutes} min read` : ''}
            </div>
          </div>
        </a>`).join('');

      const body = `
  <div class="container">
    <div class="breadcrumb"><a href="/blog">Blog</a> &rsaquo; ${esc(cat.name)}</div>
    <h1>${esc(cat.name)}</h1>
    ${cat.description ? `<p style="color:#94a3b8;margin-bottom:1rem">${esc(cat.description)}</p>` : ''}
    ${articles?.length ? `<div class="card-grid">${cardsHtml}</div>` : '<p style="color:#64748b;margin-top:2rem">No articles in this category yet.</p>'}
  </div>`;

      const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: cat.name,
        description: description,
        url: `${SITE_URL}/blog/category/${cat.slug}`,
        isPartOf: { '@type': 'Blog', name: 'Exclu Blog', url: `${SITE_URL}/blog` },
        publisher: { '@type': 'Organization', name: 'Exclu', url: SITE_URL },
      });

      const html = htmlShell({ title, description, url: `${SITE_URL}/blog/category/${catSlug}`, image: `${SITE_URL}/og-blog-default.png`, body, jsonLd });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=300');
      return res.send(html);
    }

    // ── BLOG INDEX: /blog ───────────────────────────────────────────
    const articles = (await supabaseFetch(
      'blog_articles?status=eq.published&select=id,slug,title,excerpt,cover_image_url,published_at,reading_time_minutes,blog_categories(name,slug)&order=published_at.desc&limit=50'
    )) as any[];

    const categories = (await supabaseFetch(
      'blog_categories?select=id,name,slug&order=sort_order'
    )) as any[];

    const catNav = (categories || []).map((c: any) =>
      `<a href="/blog/category/${c.slug}" style="padding:0.375rem 1rem;border-radius:9999px;font-size:0.8rem;background:rgba(255,255,255,0.05);color:#94a3b8;white-space:nowrap">${esc(c.name)}</a>`
    ).join('');

    const cardsHtml = (articles || []).map((a: any) => {
      const cat = a.blog_categories;
      return `
      <a href="/blog/${a.slug}" class="card">
        ${a.cover_image_url ? `<img src="${a.cover_image_url}" alt="${esc(a.title)}" loading="lazy" />` : `<div style="height:180px;background:linear-gradient(135deg,rgba(190,242,100,0.1),rgba(139,92,246,0.1))"></div>`}
        <div class="card-body">
          ${cat ? `<span style="font-size:0.65rem;color:#bef264;text-transform:uppercase;letter-spacing:0.05em">${esc(cat.name)}</span>` : ''}
          <h3>${esc(a.title)}</h3>
          ${a.excerpt ? `<p>${esc(a.excerpt.slice(0, 150))}${a.excerpt.length > 150 ? '...' : ''}</p>` : ''}
          <div class="card-meta">
            ${a.published_at ? new Date(a.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
            ${a.reading_time_minutes ? ` &middot; ${a.reading_time_minutes} min read` : ''}
          </div>
        </div>
      </a>`;
    }).join('');

    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Exclu Blog',
      description: 'Insights, guides, and news for content creators building their business with Exclu.',
      url: `${SITE_URL}/blog`,
      publisher: { '@type': 'Organization', name: 'Exclu', url: SITE_URL },
    });

    const body = `
  <div class="container">
    <h1 style="margin-bottom:0.5rem">Blog</h1>
    <p style="color:#94a3b8;margin-bottom:1.5rem">Insights, guides, and news for content creators.</p>
    ${catNav ? `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:2rem">${catNav}</div>` : ''}
    ${articles?.length ? `<div class="card-grid">${cardsHtml}</div>` : '<p style="color:#64748b;margin-top:2rem">No articles yet. Check back soon!</p>'}
  </div>`;

    const html = htmlShell({
      title: 'Blog — Exclu',
      description: 'Insights, guides, and news for content creators building their business with Exclu.',
      url: `${SITE_URL}/blog`,
      image: `${SITE_URL}/og-blog-default.png`,
      body,
      jsonLd,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=300');
    return res.send(html);
  } catch (error) {
    console.error('blog-ssr error:', error);
    res.writeHead(302, { Location: '/' });
    return res.end();
  }
}
