// supabase/functions/_shared/campaign_send.ts
//
// Shared helpers for rendering a campaign's HTML + building the Brevo
// transactional payload with all the deliverability headers mail providers
// now expect on bulk mail (Gmail Feb 2024 rules, RFC 8058 one-click unsub,
// Google Postmaster Feedback-ID).
//
// Render pipeline:
//   1. Replace `{{ unsubscribe }}` with a per-recipient HMAC-signed URL
//      pointing at /unsubscribe?t=<token>.
//   2. Rewrite every <a href="http..."> to append UTM params tying back
//      to the campaign (utm_source=email, utm_medium=campaign,
//      utm_campaign=<slug>). External http(s) links only; mailto:/tel:/
//      anchor #fragments are left alone, and the unsubscribe URL is
//      excluded to keep UTM noise out of it.
//   3. Replace `{{ email }}` with the recipient's email (escaped).
//   4. Replace `{{ preheader }}` with the campaign's preheader (escaped).
//
// Headers pipeline (buildCampaignHeaders):
//   - Message-ID: <idempotency_key@exclu.at> — stable across Brevo retries
//   - List-Id: <slug.campaign.exclu.at> — Gmail groups campaigns by this
//   - List-Unsubscribe: <https unsub URL>, <mailto:unsubscribe@...>
//   - List-Unsubscribe-Post: List-Unsubscribe=One-Click (RFC 8058)
//   - Feedback-ID: <campaign_id>:exclu:campaign:<pool> — Google Postmaster
//   - Precedence: bulk
//   - X-Exclu-Idempotency-Key: idempotency_key — visible in Brevo logs
//     for spot-checking duplicate deliveries across our retries.

import { signUnsubscribeToken } from "./unsubscribe_token.ts";

const SITE_BASE = "https://exclu.at";
const MAILTO_UNSUBSCRIBE = "unsubscribe@exclu.at";
const MESSAGE_ID_DOMAIN = "exclu.at";

// ========================================================================
// HTML render
// ========================================================================

export interface CampaignRenderInput {
  html: string;
  email: string;
  campaignSlug: string;    // Used for utm_campaign. Fallback: campaign.name
  preheader?: string | null;
  unsubscribeSecret: string;
}

export interface CampaignRenderOutput {
  html: string;
  unsubscribeUrl: string;
}

export async function renderCampaignHtml(
  input: CampaignRenderInput,
): Promise<CampaignRenderOutput> {
  const { html, email, campaignSlug, preheader, unsubscribeSecret } = input;

  const token = await signUnsubscribeToken(email, unsubscribeSecret);
  const unsubscribeUrl = `${SITE_BASE}/unsubscribe?t=${token}`;

  const slug = slugifyForUtm(campaignSlug || "exclu");
  const utmParams = `utm_source=email&utm_medium=campaign&utm_campaign=${encodeURIComponent(slug)}`;

  let rendered = html;

  // Placeholders first so injected URLs are not re-processed by UTM pass.
  rendered = rendered.replace(/\{\{\s*unsubscribe\s*\}\}/gi, unsubscribeUrl);
  rendered = rendered.replace(/\{\{\s*email\s*\}\}/gi, escapeHtml(email));
  if (preheader !== undefined && preheader !== null) {
    rendered = rendered.replace(/\{\{\s*preheader\s*\}\}/gi, escapeHtml(preheader));
  }

  // Append UTM params to every absolute http(s) href. Skip mailto:/tel:/
  // fragments and the unsub URL (which goes to our page; UTM is noise there).
  rendered = rendered.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (match, url: string) => {
      if (url.startsWith(`${SITE_BASE}/unsubscribe`)) return match;
      if (/[?&]utm_source=/.test(url)) return match;
      const separator = url.includes("?") ? "&" : "?";
      return `href="${url}${separator}${utmParams}"`;
    },
  );

  return { html: rendered, unsubscribeUrl };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slugifyForUtm(s: string): string {
  return (s || "campaign").toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 64);
}

// ========================================================================
// Deliverability headers
// ========================================================================

export interface CampaignHeadersInput {
  idempotencyKey: string;       // UUID from email_campaign_sends.idempotency_key
  campaignId: string;           // email_campaigns.id
  campaignSlug: string;         // already slugified (slugifyForUtm)
  unsubscribeUrl: string;       // from renderCampaignHtml
  pool?: string;                // 'marketing' | 'tx' — defaults to 'campaign'
}

/**
 * Build the RFC-822 + deliverability headers for a CAMPAIGN (bulk) send.
 * For transactional sends, use buildTransactionalHeaders() instead — it
 * omits Precedence: bulk and the campaign-specific List-Id.
 */
export function buildCampaignHeaders(input: CampaignHeadersInput): Record<string, string> {
  const { idempotencyKey, campaignId, campaignSlug, unsubscribeUrl, pool = "campaign" } = input;

  return {
    // RFC 5322 Message-ID. Overriding Brevo's auto-generated value lets us
    // correlate logs across our DB + Brevo + any bounce report.
    "Message-ID": `<${idempotencyKey}@${MESSAGE_ID_DOMAIN}>`,
    // Gmail groups threads by List-Id. One per campaign keeps threading sane.
    "List-Id": `<${campaignSlug}.campaign.${MESSAGE_ID_DOMAIN}>`,
    // RFC 2369 + RFC 8058 one-click unsubscribe.
    "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${MAILTO_UNSUBSCRIBE}?subject=unsub-${idempotencyKey}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    // Google Postmaster Tools format: <id>:<domain>:<pool>:<ipid>.
    // The <ipid> slot is Brevo's shared pool; leaving it stable across sends
    // so Postmaster can attribute reputation cleanly per campaign.
    "Feedback-ID": `${campaignId}:exclu:${pool}:brevo`,
    "Precedence": "bulk",
    "X-Exclu-Idempotency-Key": idempotencyKey,
    "X-Exclu-Campaign-Id": campaignId,
  };
}

/**
 * Headers for a TRANSACTIONAL send (password reset, receipts, content
 * access, etc). Intentionally lighter than campaign headers:
 *   - No List-Id (single transactional stream, not a newsletter).
 *   - No Precedence: bulk (mailers treat transactional differently).
 *   - No List-Unsubscribe (transactional = no opt-out; user isn't on a list).
 *   - Message-ID + Feedback-ID still set for traceability.
 */
export function buildTransactionalHeaders(input: {
  idempotencyKey: string;
  entityKind: string;           // 'purchase' | 'tip' | 'auth' | ...
  entityId: string;
}): Record<string, string> {
  return {
    "Message-ID": `<${input.idempotencyKey}@${MESSAGE_ID_DOMAIN}>`,
    "Feedback-ID": `${input.entityKind}:exclu:tx:brevo`,
    "X-Exclu-Idempotency-Key": input.idempotencyKey,
    "X-Exclu-Entity": `${input.entityKind}:${input.entityId}`,
  };
}

// ========================================================================
// Brevo transactional API — thin wrapper
// ========================================================================

export interface BrevoSendInput {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  replyToEmail?: string;
  replyToName?: string;
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
  tags?: string[];
  headers?: Record<string, string>;
}

export interface BrevoSendResult {
  ok: true;
  messageId: string;
}

export interface BrevoSendFailure {
  ok: false;
  status: number;
  reason: string;
  retryable: boolean;
}

/**
 * POST https://api.brevo.com/v3/smtp/email
 * Returns { ok: true, messageId } on 2xx. Never throws — maps errors to
 * { ok: false, status, reason, retryable } so the caller can decide to
 * retry the send or mark it failed.
 */
export async function sendTransactionalEmail(
  input: BrevoSendInput,
): Promise<BrevoSendResult | BrevoSendFailure> {
  const payload: Record<string, unknown> = {
    sender: { email: input.senderEmail, name: input.senderName },
    to: [input.to],
    subject: input.subject,
    htmlContent: input.htmlContent,
  };
  if (input.replyToEmail) {
    payload.replyTo = {
      email: input.replyToEmail,
      name: input.replyToName ?? input.senderName,
    };
  }
  if (input.tags && input.tags.length > 0) {
    payload.tags = input.tags;
  }
  if (input.headers && Object.keys(input.headers).length > 0) {
    payload.headers = input.headers;
  }

  let res: Response;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": input.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      reason: `fetch_failed: ${(err as Error).message}`,
      retryable: true,
    };
  }

  if (res.status >= 200 && res.status < 300) {
    const json = (await res.json().catch(() => ({}))) as { messageId?: string };
    if (!json.messageId) {
      return { ok: false, status: res.status, reason: "missing_message_id", retryable: false };
    }
    return { ok: true, messageId: json.messageId };
  }

  const text = await res.text().catch(() => "");
  // 4xx → permanent (malformed / invalid recipient). 5xx + 429 → retryable.
  const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
  return {
    ok: false,
    status: res.status,
    reason: text.slice(0, 400) || `brevo_status_${res.status}`,
    retryable,
  };
}

// ========================================================================
// Warmup cap — pure function
// ========================================================================

/**
 * Given the warmup start date and current date, returns the max number
 * of sends allowed today.
 *
 * Formula:
 *   days_since_start <= 14 → max(50, 100 * floor(days_since_start / 2))
 *     i.e. J1=50, J2=50, J3=100, J5=200, J7=300, J9=400, J11=500, J13=600, J14=700
 *   days_since_start  > 14 → fallback (default 5000, override via arg)
 */
export function warmupCapForToday(
  warmupStartIso: string,
  nowIso: string = new Date().toISOString(),
  normalCap = 5000,
): number {
  const start = Date.parse(warmupStartIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(start) || !Number.isFinite(now)) return normalCap;
  const msPerDay = 86_400_000;
  const days = Math.floor((now - start) / msPerDay);
  if (days <= 14) {
    return Math.max(50, 100 * Math.floor(Math.max(0, days) / 2));
  }
  return normalCap;
}
