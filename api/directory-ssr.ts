import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG53ZXpldGpsYndsdHljY2tzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTcyNjcsImV4cCI6MjA4Mzg3MzI2N30.BwE47MEU7KVm3NWXbX7hK1osCc00dQ0s8Y0Qudh5eyE';
const SITE_URL = 'https://exclu.at';

let cachedIndexHtml: string | null = null;
function getIndexHtml(): string {
  if (!cachedIndexHtml) {
    const indexPath = join(process.cwd(), 'dist', 'index.html');
    cachedIndexHtml = readFileSync(indexPath, 'utf-8');
  }
  return cachedIndexHtml;
}

// Inject SEO meta + a crawler-only noscript summary into the SPA shell so
// /directory/creators is fully indexable while keeping the React app's
// interactivity for real users.
function injectCreatorsSEO(
  html: string,
  ogTitle: string,
  ogDescription: string,
  ogImage: string,
  ogUrl: string,
  noscriptHtml: string,
): string {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(ogTitle)}</title>`)
    .replace(
      /<!-- Open Graph -->[\s\S]*?<!-- Twitter -->[\s\S]*?<meta\s+name="twitter:image"[^>]*\/>/,
      `<!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(ogTitle)}" />
    <meta property="og:description" content="${esc(ogDescription)}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:url" content="${ogUrl}" />
    <meta property="og:site_name" content="Exclu" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@exclu" />
    <meta name="twitter:title" content="${esc(ogTitle)}" />
    <meta name="twitter:description" content="${esc(ogDescription)}" />
    <meta name="twitter:image" content="${ogImage}" />`,
    )
    .replace('</body>', `<noscript>${noscriptHtml}</noscript></body>`);
}

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
}: {
  title: string;
  description: string;
  url: string;
  image: string;
  body: string;
  jsonLd?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${url}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="Exclu" />

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
    h1{font-size:2.25rem;font-weight:800;line-height:1.2;margin-bottom:1rem;color:#f8fafc}
    .meta{font-size:0.8rem;color:#64748b;margin-bottom:1.5rem}
    .content{font-size:1rem;line-height:1.8;color:#cbd5e1}
    .content h2{font-size:1.5rem;font-weight:700;color:#f8fafc;margin:2rem 0 1rem}
    .content h3{font-size:1.25rem;font-weight:600;color:#f1f5f9;margin:1.5rem 0 0.75rem}
    .content p{margin-bottom:1rem}
    .content ul,.content ol{padding-left:1.5rem;margin-bottom:1rem}
    .content li{margin-bottom:0.5rem}
    .logo-box{width:80px;height:80px;border-radius:16px;object-fit:cover;margin-bottom:1.5rem}
    .service-tag{display:inline-block;padding:0.25rem 0.75rem;border-radius:9999px;font-size:0.7rem;background:rgba(255,255,255,0.05);color:#94a3b8;margin-right:0.5rem;margin-bottom:0.5rem}
    .info-row{display:flex;flex-wrap:wrap;gap:1.5rem;margin-bottom:1.5rem;font-size:0.85rem;color:#94a3b8}
    .cta{display:inline-block;padding:0.75rem 2rem;border-radius:9999px;font-weight:600;font-size:0.875rem;background:linear-gradient(135deg,#bef264,#a3e635);color:#020617;margin-top:1rem}
    .comparison-table{width:100%;border-collapse:collapse;margin:2rem 0}
    .comparison-table th,.comparison-table td{padding:0.75rem 1rem;text-align:left;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.85rem}
    .comparison-table th{color:#94a3b8;font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em}
    .footer{margin-top:4rem;padding:2rem 1.5rem;border-top:1px solid rgba(255,255,255,0.05);text-align:center;font-size:0.75rem;color:#475569}
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
  const path = req.url || '/';

  try {
    // ── CREATORS LIST: /directory/creators ──────────────────────────
    // Renders the SPA shell with custom OG + a crawler-friendly noscript
    // listing the top creators (resolved through v_directory_creators).
    if (path.match(/^\/directory\/creators(\/?$|\?)/)) {
      const creators = (await supabaseFetch(
        'v_directory_creators?category=is.null&is_hidden_for_category=eq.false&order=display_rank.asc,position.asc.nullslast,profile_view_count.desc&limit=60'
      )) as any[];

      const title = 'Discover creators on Exclu — Creator Directory';
      const description =
        'Browse independent creators on Exclu. No account required to unlock content. Tip, subscribe, or chat with creators directly.';
      const url = `${SITE_URL}/directory/creators`;
      const image = `${SITE_URL}/og-directory-default.png`;

      const noscript = `
  <header><h1>Creators on Exclu</h1><p>${esc(description)}</p></header>
  <ul>${(creators || [])
    .map((c) => {
      const name = c.display_name || c.username || '';
      const loc = [c.city, c.country].filter(Boolean).join(', ');
      return `<li><a href="${SITE_URL}/${esc(c.username || '')}">${esc(name)}</a>${
        c.niche ? ` · ${esc(c.niche)}` : ''
      }${loc ? ` · ${esc(loc)}` : ''}</li>`;
    })
    .join('')}</ul>`;

      const html = injectCreatorsSEO(getIndexHtml(), title, description, image, url, noscript);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.send(html);
    }

    // ── AGENCY DETAIL: /directory/agencies/:slug ────────────────────
    const agencyMatch = path.match(/^\/directory\/agencies\/([^/?]+)/);
    if (agencyMatch) {
      const slug = decodeURIComponent(agencyMatch[1]);

      const agencies = (await supabaseFetch(
        `directory_agencies?slug=eq.${encodeURIComponent(slug)}&is_visible=eq.true&select=*&limit=1`
      )) as any[];

      if (!agencies?.length) {
        res.writeHead(302, { Location: '/directory/agencies' });
        return res.end();
      }

      const agency = agencies[0];
      const title = agency.meta_title || `${agency.name} — Exclu Directory`;
      const description = agency.meta_description || agency.description || `Learn about ${agency.name}, a creator management agency on Exclu.`;
      const image = agency.logo_url || `${SITE_URL}/og-directory-default.png`;

      const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: agency.name,
        description: agency.description || '',
        url: agency.website_url || `${SITE_URL}/directory/agencies/${agency.slug}`,
        ...(agency.logo_url ? { logo: agency.logo_url } : {}),
        address: {
          '@type': 'PostalAddress',
          addressCountry: agency.country,
          ...(agency.city ? { addressLocality: agency.city } : {}),
        },
      });

      const body = `
  <div class="container">
    <div class="breadcrumb">
      <a href="/directory">Directory</a> &rsaquo; <a href="/directory/agencies">Agencies</a> &rsaquo; ${esc(agency.name)}
    </div>
    ${agency.logo_url ? `<img class="logo-box" src="${agency.logo_url}" alt="${esc(agency.name)}" />` : ''}
    <h1>${esc(agency.name)}</h1>
    <div class="info-row">
      <span>${esc(agency.country)}${agency.city ? `, ${esc(agency.city)}` : ''}</span>
      ${agency.website_url ? `<a href="${agency.website_url}" target="_blank" rel="noopener">${esc(agency.website_url.replace(/^https?:\/\//, ''))}</a>` : ''}
      ${agency.contact_email ? `<a href="mailto:${agency.contact_email}">${esc(agency.contact_email)}</a>` : ''}
    </div>
    ${agency.services?.length ? `<div style="margin-bottom:1.5rem">${agency.services.map((s: string) => `<span class="service-tag">${esc(s)}</span>`).join('')}</div>` : ''}
    ${agency.description ? `<div class="content"><p>${esc(agency.description)}</p></div>` : ''}
    ${agency.creator_profile_ids?.length ? `<p style="color:#94a3b8;margin-top:1.5rem;font-size:0.85rem">${agency.creator_profile_ids.length} creator${agency.creator_profile_ids.length !== 1 ? 's' : ''} managed on Exclu</p>` : ''}
    ${agency.website_url ? `<a href="${agency.website_url}" class="cta" target="_blank" rel="noopener">Visit Website</a>` : ''}
  </div>`;

      const html = htmlShell({ title, description, url: `${SITE_URL}/directory/agencies/${agency.slug}`, image, body, jsonLd });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
      return res.send(html);
    }

    // ── TOOL COMPARISON DETAIL: /directory/tools/:slug ──────────────
    const toolMatch = path.match(/^\/directory\/tools\/([^/?]+)/);
    if (toolMatch) {
      const slug = decodeURIComponent(toolMatch[1]);

      const tools = (await supabaseFetch(
        `tool_comparisons?slug=eq.${encodeURIComponent(slug)}&is_visible=eq.true&select=*&limit=1`
      )) as any[];

      if (!tools?.length) {
        res.writeHead(302, { Location: '/directory/tools' });
        return res.end();
      }

      const tool = tools[0];
      const title = tool.meta_title || tool.title;
      const description = tool.meta_description || `Compare Exclu with ${tool.tool_name}. See features, pricing, and more.`;
      const image = tool.tool_logo_url || `${SITE_URL}/og-directory-default.png`;

      const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: tool.title,
        description: description,
        publisher: { '@type': 'Organization', name: 'Exclu', url: SITE_URL },
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/directory/tools/${tool.slug}` },
      });

      // Build comparison table from comparison_data if available
      let comparisonHtml = '';
      if (tool.comparison_data?.length) {
        const rows = tool.comparison_data.map((row: any) =>
          `<tr><td style="color:#f8fafc;font-weight:500">${esc(row.feature || '')}</td><td>${esc(row.exclu || '')}</td><td>${esc(row.competitor || '')}</td></tr>`
        ).join('');
        comparisonHtml = `
        <table class="comparison-table">
          <thead><tr><th>Feature</th><th>Exclu</th><th>${esc(tool.tool_name)}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      }

      const body = `
  <div class="container">
    <div class="breadcrumb">
      <a href="/directory">Directory</a> &rsaquo; <a href="/directory/tools">Tools</a> &rsaquo; ${esc(tool.title)}
    </div>
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem">
      <img src="/Logo-mini.svg" alt="Exclu" style="width:48px;height:48px" />
      <span style="font-size:1.5rem;font-weight:800;color:#64748b">vs</span>
      ${tool.tool_logo_url ? `<img src="${tool.tool_logo_url}" alt="${esc(tool.tool_name)}" style="width:48px;height:48px;border-radius:12px;object-fit:cover" />` : `<div style="width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:1.25rem;font-weight:700;color:rgba(255,255,255,0.5)">${tool.tool_name[0]}</div>`}
    </div>
    <h1>${esc(tool.title)}</h1>
    ${tool.tool_website ? `<p class="meta"><a href="${tool.tool_website}" target="_blank" rel="noopener">${esc(tool.tool_website.replace(/^https?:\/\//, ''))}</a></p>` : ''}
    ${comparisonHtml}
    ${tool.content_html ? `<div class="content">${tool.content_html}</div>` : ''}
    <a href="/" class="cta">Try Exclu Free</a>
  </div>`;

      const html = htmlShell({ title, description, url: `${SITE_URL}/directory/tools/${tool.slug}`, image, body, jsonLd });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
      return res.send(html);
    }

    // Fallback — redirect to directory hub
    res.writeHead(302, { Location: '/directory' });
    return res.end();
  } catch (error) {
    console.error('directory-ssr error:', error);
    res.writeHead(302, { Location: '/directory' });
    return res.end();
  }
}
