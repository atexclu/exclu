import { escapeHtml } from "./brevo.ts";

export interface EmailTemplateVariable {
  key: string;
  required?: boolean;
  description?: string;
}

export interface EmailTemplateRow {
  slug: string;
  subject: string;
  html_body: string;
  text_body?: string | null;
  variables: EmailTemplateVariable[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function validateRequired(
  template: EmailTemplateRow,
  data: Record<string, unknown>,
): void {
  for (const v of template.variables ?? []) {
    if (v.required && (data[v.key] === undefined || data[v.key] === null)) {
      throw new Error(`Missing required variable: ${v.key}`);
    }
  }
}

function substitute(
  source: string,
  data: Record<string, unknown>,
  escape: boolean,
): string {
  return source.replace(/\{\{\{?\s*([a-zA-Z0-9_]+)\s*\}?\}\}/g, (match, key) => {
    const raw = match.startsWith("{{{"); // triple = no escape
    const value = data[key];
    if (value === undefined || value === null) return "";
    const str = String(value);
    return escape && !raw ? escapeHtml(str) : str;
  });
}

export function renderTemplate(
  template: EmailTemplateRow,
  data: Record<string, unknown>,
): RenderedEmail {
  validateRequired(template, data);
  return {
    subject: substitute(template.subject, data, false),
    html: substitute(template.html_body, data, true),
    text: substitute(template.text_body ?? stripHtml(template.html_body), data, false),
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function loadTemplate(
  supabase: { from: (t: string) => any },
  slug: string,
): Promise<EmailTemplateRow> {
  const { data, error } = await supabase
    .from("email_templates")
    .select("slug, subject, html_body, text_body, variables, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (error || !data) {
    throw new Error(`Template not found: ${slug}`);
  }
  return data as EmailTemplateRow;
}
