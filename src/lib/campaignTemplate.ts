/**
 * Simple-mode content blocks ↔ HTML serializer.
 *
 * Simple mode lets a non-technical admin edit a campaign through 5
 * structured fields (headline, intro, CTA, outro, signature). On save,
 * we render those fields into a production-grade responsive HTML
 * template and prepend an `<!--EXCLU_BLOCKS:...-->` comment containing
 * the raw JSON. On re-open we extract the comment and hydrate the
 * simple form.
 *
 * Advanced HTML mode writes raw HTML to the same `html_content` column;
 * if the user edits the HTML without removing the comment, the next
 * "switch back to simple" still works. If they removed/modified the
 * comment, simple mode falls back to empty blocks and HTML becomes the
 * source of truth.
 */

export interface SimpleContent {
  headline: string;
  intro: string;
  cta?: { text: string; url: string };
  outro: string;
  signature: string;
}

export const EMPTY_SIMPLE_CONTENT: SimpleContent = {
  headline: "",
  intro: "",
  cta: { text: "", url: "" },
  outro: "",
  signature: "— Maria, équipe Exclu",
};

const BLOCKS_COMMENT_RE = /<!--\s*EXCLU_BLOCKS:([\s\S]*?)-->/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:#333333;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n");
}

export function renderSimpleTemplate(c: SimpleContent, preheader: string): string {
  const preheaderText = preheader.trim() || c.headline || "Exclu";
  const headlineBlock = c.headline
    ? `<h1 style="margin:0 0 16px 0;font-size:26px;line-height:32px;font-weight:700;color:#1a1a1a;">${escapeHtml(c.headline)}</h1>`
    : "";
  const introBlock = c.intro ? paragraphs(c.intro) : "";
  const outroBlock = c.outro ? paragraphs(c.outro) : "";
  const signatureBlock = c.signature
    ? `<p style="margin:24px 0 0 0;font-size:16px;line-height:24px;color:#333333;">${escapeHtml(c.signature).replace(/\n/g, "<br>")}</p>`
    : "";

  const ctaBlock = c.cta && c.cta.text && c.cta.url
    ? `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td align="center" style="padding:8px 0 24px 0;">
              <a class="btn" href="${escapeHtml(c.cta.url)}" style="display:inline-block;padding:14px 32px;background-color:#7c3aed;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">${escapeHtml(c.cta.text)}</a>
            </td>
          </tr>
        </table>`
    : "";

  const blocksComment = `<!--EXCLU_BLOCKS:${JSON.stringify(c)}-->`;

  return `${blocksComment}
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(preheaderText)}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .content { padding: 24px 20px !important; }
      h1 { font-size: 22px !important; line-height: 28px !important; }
      .btn { width: 100% !important; box-sizing: border-box; }
    }
    a { color: #7c3aed; text-decoration: underline; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    {{ preheader }}
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="container" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:32px 24px 16px 24px;">
              <a href="https://exclu.at" style="text-decoration:none;">
                <span style="font-size:24px;font-weight:700;color:#1a1a1a;letter-spacing:-0.5px;">Exclu</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px;">
              <div style="height:1px;background-color:#eaeaef;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="content" style="padding:32px 40px;color:#1a1a1a;">
              ${headlineBlock}
              ${introBlock}
              ${ctaBlock}
              ${outroBlock}
              ${signatureBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px 32px 40px;background-color:#fafafa;border-top:1px solid #eaeaef;">
              <p style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:#6b6b75;">
                Tu reçois cet email parce que tu es inscrit sur Exclu ou que tu as effectué un achat via un lien Exclu. FRANCEPRODUCT SAS, France.
              </p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#6b6b75;">
                <a href="https://exclu.at" style="color:#6b6b75;text-decoration:underline;">exclu.at</a>
                &nbsp;·&nbsp;
                <a href="https://exclu.at/privacy" style="color:#6b6b75;text-decoration:underline;">Confidentialité</a>
                &nbsp;·&nbsp;
                <a href="{{ unsubscribe }}" style="color:#6b6b75;text-decoration:underline;">Se désabonner</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Parse an html_content string and return its simple-mode content if the
 * leading EXCLU_BLOCKS comment is present and parseable. If not, returns
 * null — caller should switch to HTML-only mode.
 */
export function parseSimpleContent(html: string | null | undefined): SimpleContent | null {
  if (!html) return null;
  const m = html.match(BLOCKS_COMMENT_RE);
  if (!m) return null;
  try {
    const data = JSON.parse(m[1].trim()) as SimpleContent;
    // Shallow validation — the shape may evolve; we tolerate missing keys.
    return {
      headline: typeof data.headline === "string" ? data.headline : "",
      intro: typeof data.intro === "string" ? data.intro : "",
      cta: data.cta && typeof data.cta === "object"
        ? { text: data.cta.text ?? "", url: data.cta.url ?? "" }
        : { text: "", url: "" },
      outro: typeof data.outro === "string" ? data.outro : "",
      signature: typeof data.signature === "string"
        ? data.signature
        : EMPTY_SIMPLE_CONTENT.signature,
    };
  } catch {
    return null;
  }
}
