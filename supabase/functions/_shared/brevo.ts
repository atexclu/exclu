/**
 * Shared Brevo email sending helper.
 * Extracts the retry logic used across webhook/confirm handlers.
 */

const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';

export function isBrevoConfigured(): boolean {
  return !!(brevoApiKey && brevoSenderEmail);
}

export interface BrevoSendParams {
  to: string;
  subject: string;
  htmlContent: string;
  maxAttempts?: number;
  /** Extra RFC-822 headers (Message-ID, Feedback-ID, X-Exclu-*, List-Unsubscribe…). */
  headers?: Record<string, string>;
  /** Brevo transactional tags, surfaced in their logs + webhook events. */
  tags?: string[];
  /** Reply-To override for transactional branches that want a non-default address. */
  replyTo?: { email: string; name?: string };
}

export async function sendBrevoEmail(params: BrevoSendParams): Promise<boolean> {
  if (!brevoApiKey || !brevoSenderEmail) {
    console.warn('Brevo not configured; skipping email');
    return false;
  }

  const { to, subject, htmlContent, maxAttempts = 2, headers, tags, replyTo } = params;

  const payload: Record<string, unknown> = {
    sender: { email: brevoSenderEmail, name: brevoSenderName },
    to: [{ email: to }],
    subject,
    htmlContent,
  };
  if (headers && Object.keys(headers).length > 0) payload.headers = headers;
  if (tags && tags.length > 0) payload.tags = tags;
  if (replyTo?.email) {
    payload.replyTo = { email: replyTo.email, name: replyTo.name ?? brevoSenderName };
  }

  const bodyStr = JSON.stringify(payload);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
        body: bodyStr,
      });

      if (response.ok) {
        console.log(`Brevo email sent to ${to} (attempt ${attempt})`);
        return true;
      }

      const errorBody = await response.text();
      console.error(
        `Brevo email failed (attempt ${attempt}/${maxAttempts})`,
        response.status,
        errorBody,
      );

      // 4xx other than 429 is a permanent failure — retrying just burns quota.
      const retryable = response.status === 429 || (response.status >= 500 && response.status < 600);
      if (!retryable) return false;
    } catch (err) {
      console.error(`Brevo email error (attempt ${attempt}/${maxAttempts})`, err);
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return false;
}

/**
 * Deterministic idempotency key for transactional sends. Used as Message-ID
 * and X-Exclu-Idempotency-Key so retries across crashes / duplicate
 * triggers are traceable in Brevo logs without a second dispatch.
 *
 * Format: sha256(entityKind:entityId:recipientEmail) → first 32 hex chars
 * prefixed with kind so logs are human-readable.
 */
export async function makeTransactionalIdempotencyKey(
  entityKind: string,
  entityId: string,
  recipientEmail: string,
): Promise<string> {
  const input = `${entityKind}:${entityId}:${recipientEmail.trim().toLowerCase()}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${entityKind}-${hex.slice(0, 32)}`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatUSD(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
