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

export async function sendBrevoEmail(params: {
  to: string;
  subject: string;
  htmlContent: string;
  maxAttempts?: number;
}): Promise<boolean> {
  if (!brevoApiKey || !brevoSenderEmail) {
    console.warn('Brevo not configured; skipping email');
    return false;
  }

  const { to, subject, htmlContent, maxAttempts = 2 } = params;

  const payload = JSON.stringify({
    sender: { email: brevoSenderEmail, name: brevoSenderName },
    to: [{ email: to }],
    subject,
    htmlContent,
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
        body: payload,
      });

      if (response.ok) {
        console.log(`Brevo email sent to ${to} (attempt ${attempt})`);
        return true;
      }

      const errorBody = await response.text();
      console.error(`Brevo email failed (attempt ${attempt}/${maxAttempts})`, response.status, errorBody);
    } catch (err) {
      console.error(`Brevo email error (attempt ${attempt}/${maxAttempts})`, err);
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return false;
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
