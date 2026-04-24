// supabase/functions/_shared/rebillEmails.ts
import { sendBrevoEmail, formatUSD } from './brevo.ts';
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at';

export async function emailRebillFailedRetry(toEmail: string, name: string, amountCents: number, attempt: number, nextAttemptAt: Date) {
  return sendBrevoEmail({
    to: toEmail,
    subject: `⚠️ Subscription renewal couldn't be charged (attempt ${attempt})`,
    htmlContent: `<p>Hi ${name},</p>
      <p>Your Exclu Pro subscription renewal for ${formatUSD(amountCents)} could not be charged on your card. We'll try again on ${nextAttemptAt.toUTCString()}.</p>
      <p>If you've changed cards recently, please update your payment method in <a href="${siteUrl}/app/settings">Settings</a>.</p>`,
  });
}

export async function emailRebillSuspended(toEmail: string, name: string, amountCents: number) {
  return sendBrevoEmail({
    to: toEmail,
    subject: `Your Exclu Pro subscription has been paused`,
    htmlContent: `<p>Hi ${name},</p>
      <p>After 3 failed attempts to renew your Pro subscription (${formatUSD(amountCents)}), we've paused your plan. Your Pro features are temporarily disabled until you resubscribe.</p>
      <p><a href="${siteUrl}/pricing">Reactivate my Pro plan</a></p>`,
  });
}

export async function emailFanSubSuspended(toEmail: string, creatorName: string, amountCents: number) {
  return sendBrevoEmail({
    to: toEmail,
    subject: `Your subscription to ${creatorName} has been paused`,
    htmlContent: `<p>We couldn't renew your ${formatUSD(amountCents)}/month subscription to ${creatorName}. Your access is paused until you update your payment method.</p>
      <p><a href="${siteUrl}/fan/subscriptions">Manage my subscriptions</a></p>`,
  });
}
