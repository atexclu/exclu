// Client-side mirror of supabase/functions/_shared/email_templates.ts
// Used by the admin editor's live preview. Must stay in sync with the Deno
// version (Task 0.2): same regex, same escaping, same dot-notation behavior.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}

export interface ClientTemplate {
  subject: string;
  html_body: string;
  text_body: string | null;
  variables: Array<{ key: string; required?: boolean }>;
}

export interface ClientRendered {
  subject: string;
  html: string;
  text: string;
}

function substitute(
  source: string,
  data: Record<string, unknown>,
  escape: boolean,
): string {
  return source.replace(/\{\{\{?\s*([a-zA-Z0-9_]+)\s*\}?\}\}/g, (match, key) => {
    const raw = match.startsWith("{{{");
    const value = data[key];
    if (value === undefined || value === null) return "";
    const str = String(value);
    return escape && !raw ? escapeHtml(str) : str;
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function renderEmailTemplate(
  t: ClientTemplate,
  data: Record<string, unknown>,
): ClientRendered {
  return {
    subject: substitute(t.subject, data, false),
    html: substitute(t.html_body, data, true),
    text: substitute(t.text_body ?? stripHtml(t.html_body), data, false),
  };
}
