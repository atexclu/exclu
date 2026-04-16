// supabase/functions/_shared/campaign_send.ts
//
// Shared helpers for rendering a campaign's HTML before handing it to
// Brevo's transactional API:
//
//   1. Replace `{{ unsubscribe }}` (or `{{unsubscribe}}`) with a per-
//      recipient HMAC-signed URL pointing at /unsubscribe?t=<token>.
//   2. Rewrite every <a href="http..."> to append UTM params tying back
//      to the campaign (utm_source=email, utm_medium=campaign,
//      utm_campaign=<slug>). External links only; internal mailto:/tel:/
//      anchor #fragments are left alone.
//   3. Replace `{{ email }}` with the recipient's email (optional, for
//      personalization).
//   4. Replace `{{ preheader }}` with the campaign's preheader text.
//
// All string replacements use global regex (not template literals) so
// they're safe against malformed `{{` sequences in user-authored HTML.

import { signUnsubscribeToken } from "./unsubscribe_token.ts";

const SITE_BASE = "https://exclu.at";

export interface CampaignRenderInput {
  html: string;
  email: string;
  campaignSlug: string;    // Used for utm_campaign. Fallback: campaign.name
  preheader?: string | null;
  unsubscribeSecret: string;
}

export async function renderCampaignHtml(input: CampaignRenderInput): Promise<string> {
  const { html, email, campaignSlug, preheader, unsubscribeSecret } = input;

  // 1. Unsub token
  const token = await signUnsubscribeToken(email, unsubscribeSecret);
  const unsubUrl = `${SITE_BASE}/unsubscribe?t=${token}`;

  // 2. UTM injection
  const slug = (campaignSlug || "exclu").toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 64);
  const utmParams = `utm_source=email&utm_medium=campaign&utm_campaign=${encodeURIComponent(slug)}`;

  let rendered = html;

  // Replace placeholders first so injected URLs don't get re-processed by UTM pass.
  rendered = rendered.replace(/\{\{\s*unsubscribe\s*\}\}/gi, unsubUrl);
  rendered = rendered.replace(/\{\{\s*email\s*\}\}/gi, escapeHtml(email));
  if (preheader !== undefined && preheader !== null) {
    rendered = rendered.replace(/\{\{\s*preheader\s*\}\}/gi, escapeHtml(preheader));
  }

  // 3. UTM pass — append utm params to every absolute http(s) href.
  // Skip mailto:, tel:, fragment (#), and already-unsubscribe links (the
  // unsub URL goes straight to our page, no UTM noise there).
  rendered = rendered.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (match, url: string) => {
      if (url.startsWith(`${SITE_BASE}/unsubscribe`)) return match;
      const separator = url.includes("?") ? "&" : "?";
      // Don't double-inject if utm_source is already present.
      if (/[?&]utm_source=/.test(url)) return match;
      return `href="${url}${separator}${utmParams}"`;
    },
  );

  return rendered;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
