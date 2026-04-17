// src/lib/emailLint.ts
//
// Client-side mirror of supabase/functions/_shared/email_lint.ts. The
// server is authoritative — it re-runs the same checks before INSERT.
// This file exists so the admin UI can surface issues instantly as the
// admin types in the block editor or Monaco pane, without a round-trip.
//
// KEEP IN SYNC with the Deno version. Both files are pure TypeScript with
// zero imports so the body can be copied verbatim; the only diff is that
// the Deno version relies on TextEncoder (available globally in both runtimes).

export type LintSeverity = "error" | "warning" | "info";

export interface LintIssue {
  code: string;
  severity: LintSeverity;
  message: string;
  detail?: string;
}

export interface LintResult {
  issues: LintIssue[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

export interface LintInput {
  subject: string;
  html: string;
  declaredVariables?: Array<{ key: string } | string>;
  category?: string;
}

const LIMITS = {
  HTML_BYTES_WARN: 102_400,
  HTML_BYTES_ERROR: 250_000,
  SUBJECT_CHARS_WARN: 80,
  SUBJECT_CHARS_ERROR: 200,
  TEXT_IMAGE_RATIO_WARN: 0.2,
};

export function lintEmail(input: LintInput): LintResult {
  const issues: LintIssue[] = [];
  const html = input.html ?? "";
  const subject = (input.subject ?? "").trim();
  const category = (input.category ?? "transactional").toLowerCase();
  const declared = normalizeDeclared(input.declaredVariables);

  if (!subject) {
    issues.push({ code: "subject_empty", severity: "error", message: "Subject cannot be empty." });
  } else if (subject.length > LIMITS.SUBJECT_CHARS_ERROR) {
    issues.push({
      code: "subject_too_long",
      severity: "error",
      message: `Subject is ${subject.length} chars (max ${LIMITS.SUBJECT_CHARS_ERROR}).`,
    });
  } else if (subject.length > LIMITS.SUBJECT_CHARS_WARN) {
    issues.push({
      code: "subject_long",
      severity: "warning",
      message: `Subject is ${subject.length} chars — will be truncated in most inboxes past ${LIMITS.SUBJECT_CHARS_WARN}.`,
    });
  }

  const htmlBytes = byteLength(html);
  if (htmlBytes > LIMITS.HTML_BYTES_ERROR) {
    issues.push({
      code: "html_too_large",
      severity: "error",
      message: `HTML is ${Math.round(htmlBytes / 1024)}KB — refusing to send above ${Math.round(LIMITS.HTML_BYTES_ERROR / 1024)}KB.`,
    });
  } else if (htmlBytes > LIMITS.HTML_BYTES_WARN) {
    issues.push({
      code: "html_large",
      severity: "warning",
      message: `HTML is ${Math.round(htmlBytes / 1024)}KB — Gmail clips emails over ~${Math.round(LIMITS.HTML_BYTES_WARN / 1024)}KB.`,
      detail: "Consider moving background images to URL references instead of inline base64.",
    });
  }

  if (!html.trim()) {
    issues.push({ code: "html_empty", severity: "error", message: "HTML body cannot be empty." });
    return finalize(issues);
  }

  const unbalanced = findUnbalancedTags(html);
  for (const tag of unbalanced.unclosed) {
    issues.push({
      code: "unclosed_tag",
      severity: isCriticalTag(tag) ? "error" : "warning",
      message: `Unclosed <${tag}>. Mail clients may render this incorrectly.`,
    });
  }
  for (const tag of unbalanced.stray) {
    issues.push({
      code: "stray_close_tag",
      severity: "warning",
      message: `Stray closing </${tag}> without a matching opener.`,
    });
  }

  const imgs = findTags(html, "img");
  let imagesWithoutAlt = 0;
  for (const img of imgs) {
    if (!/\balt\s*=/i.test(img.raw)) imagesWithoutAlt++;
  }
  if (imagesWithoutAlt > 0) {
    issues.push({
      code: "images_missing_alt",
      severity: "warning",
      message: `${imagesWithoutAlt} <img> tag${imagesWithoutAlt > 1 ? "s" : ""} missing alt="". Accessibility + spam score penalty.`,
    });
  }

  const hrefs = extractAttrValues(html, "href");
  const relatives: string[] = [];
  for (const href of hrefs) {
    if (isRelativeOrEmpty(href)) relatives.push(href);
  }
  if (relatives.length > 0) {
    issues.push({
      code: "relative_hrefs",
      severity: "warning",
      message: `${relatives.length} link${relatives.length > 1 ? "s" : ""} use relative or empty href. Emails need absolute https:// URLs.`,
      detail: relatives.slice(0, 3).map((h) => `"${h.slice(0, 60)}"`).join(", "),
    });
  }

  const usedVars = extractUsedVariables(html, subject);
  const reserved = new Set(["unsubscribe", "email", "preheader"]);
  const orphans = [...usedVars].filter((v) => !reserved.has(v) && !declared.has(v));
  if (orphans.length > 0) {
    issues.push({
      code: "undeclared_variables",
      severity: "error",
      message: `Template uses ${orphans.length} undeclared variable${orphans.length > 1 ? "s" : ""}: ${orphans.map((v) => `{{ ${v} }}`).join(", ")}.`,
      detail: "Declare them in the Variables tab, or remove the placeholder.",
    });
  }
  const unused = [...declared].filter((v) => !usedVars.has(v));
  if (unused.length > 0) {
    issues.push({
      code: "unused_variables",
      severity: "info",
      message: `${unused.length} declared variable${unused.length > 1 ? "s" : ""} never used in subject or body.`,
      detail: unused.slice(0, 5).join(", "),
    });
  }

  const textBytes = byteLength(stripHtmlForRatio(html));
  const htmlBytesForRatio = byteLength(stripStyleAttrs(html));
  const ratio = htmlBytesForRatio === 0 ? 1 : textBytes / htmlBytesForRatio;
  if (ratio < LIMITS.TEXT_IMAGE_RATIO_WARN) {
    issues.push({
      code: "low_text_ratio",
      severity: "warning",
      message: `Visible text is only ${(ratio * 100).toFixed(0)}% of the HTML — image-heavy emails often land in Promotions or spam.`,
      detail: "Add at least one paragraph of copy so providers can parse the message.",
    });
  }

  if (category === "campaign") {
    if (!/\{\{\s*unsubscribe\s*\}\}/i.test(html)) {
      issues.push({
        code: "missing_unsubscribe",
        severity: "error",
        message: "Campaign body must contain {{ unsubscribe }}. Required by CAN-SPAM / RGPD.",
      });
    }
  }

  return finalize(issues);
}

function finalize(issues: LintIssue[]): LintResult {
  return {
    issues,
    hasErrors: issues.some((i) => i.severity === "error"),
    hasWarnings: issues.some((i) => i.severity === "warning"),
  };
}

function normalizeDeclared(declared: LintInput["declaredVariables"]): Set<string> {
  const out = new Set<string>();
  if (!declared) return out;
  for (const d of declared) {
    const key = typeof d === "string" ? d : d?.key;
    if (typeof key === "string" && key.trim()) out.add(key.trim());
  }
  return out;
}

function byteLength(s: string): number {
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length;
  }
}

function stripStyleAttrs(html: string): string {
  return html
    .replace(/\sstyle\s*=\s*"[^"]*"/gi, "")
    .replace(/\sstyle\s*=\s*'[^']*'/gi, "");
}

function stripHtmlForRatio(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/g, " ")
       .replace(/&amp;/g, "&")
       .replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'");
  return s.replace(/\s+/g, " ").trim();
}

interface TagMatch {
  tag: string;
  raw: string;
}

function findTags(html: string, tagName: string): TagMatch[] {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const out: TagMatch[] = [];
  for (const m of html.matchAll(re)) out.push({ tag: tagName, raw: m[0] });
  return out;
}

function extractAttrValues(html: string, attr: string): string[] {
  const re = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, "gi");
  const out: string[] = [];
  for (const m of html.matchAll(re)) out.push(m[1]);
  return out;
}

function isRelativeOrEmpty(href: string): boolean {
  const h = href.trim();
  if (!h) return true;
  if (h.startsWith("#")) return false;
  if (/^(https?:|mailto:|tel:|cid:)/i.test(h)) return false;
  if (/\{\{[^}]+\}\}/.test(h)) return false;
  return true;
}

function extractUsedVariables(html: string, subject: string): Set<string> {
  const out = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  for (const source of [html, subject]) {
    for (const m of source.matchAll(re)) out.add(m[1]);
  }
  return out;
}

const VOID_TAGS = new Set([
  "area","base","br","col","embed","hr","img","input","link","meta",
  "param","source","track","wbr",
]);

function isCriticalTag(tag: string): boolean {
  return tag === "html" || tag === "body" || tag === "head";
}

interface BalanceReport {
  unclosed: string[];
  stray: string[];
}

function findUnbalancedTags(html: string): BalanceReport {
  const stack: string[] = [];
  const unclosed = new Set<string>();
  const stray = new Set<string>();

  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  const tagRe = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  for (const m of cleaned.matchAll(tagRe)) {
    const isClose = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? "";

    if (VOID_TAGS.has(tag)) continue;
    if (/\/\s*$/.test(attrs)) continue;

    if (isClose) {
      const topIdx = stack.lastIndexOf(tag);
      if (topIdx === -1) {
        stray.add(tag);
      } else {
        for (let i = stack.length - 1; i > topIdx; i--) {
          unclosed.add(stack[i]);
        }
        stack.length = topIdx;
      }
    } else {
      stack.push(tag);
    }
  }

  for (const t of stack) unclosed.add(t);

  return {
    unclosed: [...unclosed].filter((t) => !isIgnorableTag(t)),
    stray: [...stray].filter((t) => !isIgnorableTag(t)),
  };
}

function isIgnorableTag(tag: string): boolean {
  return tag === "li" || tag === "option" || tag === "tr" || tag === "td" || tag === "th" || tag === "p";
}
