import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
// Optional: separate signing secret for the test-mode webhook endpoint in Stripe Dashboard.
// If set, the webhook will try the live secret first, then fall back to the test secret.
const stripeWebhookSecretTest = Deno.env.get('STRIPE_WEBHOOK_SECRET_TEST');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');

// Optional Brevo configuration for sending content access emails to buyers
const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

if (!stripeWebhookSecret) {
  throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function sendContentAccessEmail(toEmail: string, linkTitle: string, accessUrl: string): Promise<boolean> {
  if (!brevoApiKey || !brevoSenderEmail) {
    console.warn('Brevo not configured (BREVO_API_KEY or BREVO_SENDER_EMAIL missing); skipping email send');
    return false;
  }

  const subject = `Your access to "${linkTitle}" on Exclu`;
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your content is unlocked</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .button { display:inline-block; background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%); color:#020617 !important; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:600; font-size:15px; margin:8px 0 20px 0; box-shadow:0 6px 18px rgba(190,242,100,0.4); }
  .link-box { background-color:#020617; border-radius:10px; padding:14px 18px; margin:4px 0 20px 0; border:1px solid #1e293b; word-break:break-all; }
  .link-box a { font-size:13px; color:#a3e635; text-decoration:none; font-family:monospace; }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px 20px 16px 20px; } .header h1 { font-size:22px; } .button { padding:12px 24px; font-size:14px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your exclusive content is unlocked 🎉</h1>
    </div>
    <div class="content">
      <p>Thank you for your purchase on <strong>Exclu</strong>. Your premium content is now available.</p>
      <p>Click the button below to access it instantly:</p>
      <a href="${accessUrl}" class="button">Open my content</a>
      <p style="font-size:13px; color:#94a3b8; margin-bottom:8px;">Or copy this link in your browser:</p>
      <div class="link-box"><a href="${accessUrl}">${accessUrl}</a></div>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">If you didn't make this purchase, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — All rights reserved<br>
      <a href="https://exclu.at">exclu</a> • <a href="https://exclu.at/terms">Terms of Service</a> • <a href="https://exclu.at/privacy">Privacy Policy</a>
    </div>
  </div>
</body>
</html>`;

  const payload = JSON.stringify({
    sender: { email: brevoSenderEmail, name: brevoSenderName },
    to: [{ email: toEmail }],
    subject,
    htmlContent,
  });

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
        body: payload,
      });

      if (response.ok) {
        console.log(`Brevo email sent to ${toEmail} (attempt ${attempt})`);
        return true;
      }

      const errorBody = await response.text();
      console.error(`Brevo email failed (attempt ${attempt}/${MAX_ATTEMPTS})`, response.status, errorBody);
    } catch (err) {
      console.error(`Brevo email error (attempt ${attempt}/${MAX_ATTEMPTS})`, err);
    }

    // Wait 2s before retrying
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return false;
}

async function sendStripeVerifiedEmail(toEmail: string, displayName: string | null, paymentsUrl: string | null): Promise<boolean> {
  if (!brevoApiKey || !brevoSenderEmail) {
    console.warn('Brevo not configured (BREVO_API_KEY or BREVO_SENDER_EMAIL missing); skipping email send');
    return false;
  }

  const safeName = displayName?.trim() || 'creator';
  const subject = 'Your Stripe account is verified — payouts are ready';
  const ctaUrl = paymentsUrl || 'https://exclu.at';
  const htmlContent = `
    <html>
      <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #050816; color: #f9fafb; padding: 24px;">
        <div style="max-width: 480px; margin: 0 auto; background-color: #020617; border-radius: 16px; padding: 24px; border: 1px solid #1f2937;">
          <h1 style="font-size: 20px; margin: 0 0 12px 0;">Stripe verification complete ✅</h1>
          <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
            Hi ${safeName}, your Stripe Connect account has been verified and is now active. You can receive payouts from fans.
          </p>
          <p style="margin: 0 0 20px 0;">
            <a href="${ctaUrl}" style="display: inline-block; padding: 10px 18px; background-color: #f97316; color: #0b1120; text-decoration: none; border-radius: 999px; font-size: 14px; font-weight: 600;">Open payout settings</a>
          </p>
          <p style="font-size: 12px; line-height: 1.6; color: #9ca3af; margin: 0;">
            If you didn't request this, you can ignore this email.
          </p>
        </div>
        <p style="font-size: 11px; color: #4b5563; margin-top: 16px; text-align: center;">
          Sent by Exclu · Please do not reply directly to this automated email.
        </p>
      </body>
    </html>
  `;

  const payload = JSON.stringify({
    sender: { email: brevoSenderEmail, name: brevoSenderName },
    to: [{ email: toEmail }],
    subject,
    htmlContent,
  });

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
        body: payload,
      });

      if (response.ok) {
        console.log(`Brevo email sent to ${toEmail} (attempt ${attempt})`);
        return true;
      }

      const errorBody = await response.text();
      console.error(`Brevo email failed (attempt ${attempt}/${MAX_ATTEMPTS})`, response.status, errorBody);
    } catch (err) {
      console.error(`Brevo email error (attempt ${attempt}/${MAX_ATTEMPTS})`, err);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return false;
}

const normalizedSiteUrl = (siteUrl || 'https://exclu.at').replace(/\/$/, '');

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendCreatorTipNotificationEmail(params: {
  creatorEmail: string;
  creatorName: string;
  tipAmountFormatted: string;
  tipNetFormatted: string;
  tipMessage: string | null;
  isAnonymous: boolean;
  dashboardUrl: string;
}): Promise<boolean> {
  if (!brevoApiKey || !brevoSenderEmail) {
    console.warn('Brevo not configured; skipping tip notification email');
    return false;
  }

  const { creatorEmail, creatorName, tipAmountFormatted, tipNetFormatted, tipMessage, isAnonymous, dashboardUrl } = params;
  const safeCreatorName = escapeHtml(creatorName);
  const senderLabel = isAnonymous ? 'An anonymous fan' : 'A fan';
  const messageBlock = tipMessage
    ? `<div style="background-color:#020617;border-radius:10px;padding:18px;margin:20px 0;border:1px solid #1e293b;">
        <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px 0;">Message</p>
        <p style="font-size:15px;color:#f1f5f9;margin:0;line-height:1.6;font-style:italic;">"${escapeHtml(tipMessage)}"</p>
      </div>`
    : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You received a tip!</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; text-align:left; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .button { display:inline-block; background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%); color:#020617 !important; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:600; font-size:15px; margin:8px 0 20px 0; box-shadow:0 6px 18px rgba(190,242,100,0.4); }
  .details { background-color:#020617; border-radius:10px; border:1px solid #1e293b; overflow:hidden; margin:4px 0 24px 0; }
  .detail-row { padding:14px 18px; border-bottom:1px solid #1e293b; }
  .detail-row:last-child { border-bottom:none; }
  .detail-label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; margin:0 0 4px 0; }
  .detail-value { font-size:15px; color:#f1f5f9; font-weight:600; margin:0; }
  .detail-value.amount { font-size:22px; font-weight:800; color:#a3e635; }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  .footer a:hover { text-decoration:underline; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px 20px 16px 20px; } .header h1 { font-size:22px; } .button { padding:12px 24px; font-size:14px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>You received a tip! 💰</h1>
    </div>
    <div class="content">
      <p>Hey <strong>${safeCreatorName}</strong>, great news! ${senderLabel} just sent you a tip on <strong>Exclu</strong>.</p>
      <div class="details">
        <div class="detail-row">
          <p class="detail-label">Tip amount</p>
          <p class="detail-value amount">${tipAmountFormatted}</p>
        </div>
        <div class="detail-row">
          <p class="detail-label">Your earnings (after fees)</p>
          <p class="detail-value">${tipNetFormatted}</p>
        </div>
        <div class="detail-row">
          <p class="detail-label">From</p>
          <p class="detail-value">${senderLabel}</p>
        </div>
      </div>
      ${messageBlock}
      <a href="${dashboardUrl}" class="button">View in dashboard</a>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">You received this email because a fan tipped you on Exclu.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — All rights reserved<br>
      <a href="${normalizedSiteUrl}">exclu</a> • <a href="${normalizedSiteUrl}/terms">Terms of Service</a> • <a href="${normalizedSiteUrl}/privacy">Privacy Policy</a>
    </div>
  </div>
</body>
</html>`;

  const payload = JSON.stringify({
    sender: { email: brevoSenderEmail, name: brevoSenderName },
    to: [{ email: creatorEmail }],
    subject: `💰 You received a tip of ${tipAmountFormatted} on Exclu`,
    htmlContent,
  });

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey!, 'Content-Type': 'application/json' },
        body: payload,
      });

      if (response.ok) {
        console.log(`Tip notification email sent to ${creatorEmail} (attempt ${attempt})`);
        return true;
      }

      const errorBody = await response.text();
      console.error(`Tip notification email failed (attempt ${attempt}/${MAX_ATTEMPTS})`, response.status, errorBody);
    } catch (err) {
      console.error(`Tip notification email error (attempt ${attempt}/${MAX_ATTEMPTS})`, err);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return false;
}

async function sendCreatorGiftNotificationEmail(params: {
  creatorEmail: string;
  creatorName: string;
  itemName: string;
  itemEmoji: string;
  giftAmountFormatted: string;
  giftNetFormatted: string;
  giftMessage: string | null;
  isAnonymous: boolean;
  dashboardUrl: string;
}): Promise<boolean> {
  if (!brevoApiKey || !brevoSenderEmail) {
    console.warn('Brevo not configured; skipping gift notification email');
    return false;
  }

  const { creatorEmail, creatorName, itemName, itemEmoji, giftAmountFormatted, giftNetFormatted, giftMessage, isAnonymous, dashboardUrl } = params;
  const safeCreatorName = escapeHtml(creatorName);
  const safeItemName = escapeHtml(itemName);
  const senderLabel = isAnonymous ? 'An anonymous fan' : 'A fan';
  const messageBlock = giftMessage
    ? `<div style="background-color:#020617;border-radius:10px;padding:18px;margin:20px 0;border:1px solid #1e293b;">
        <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px 0;">Message</p>
        <p style="font-size:15px;color:#f1f5f9;margin:0;line-height:1.6;font-style:italic;">"${escapeHtml(giftMessage)}"</p>
      </div>`
    : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You received a gift!</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; text-align:left; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .button { display:inline-block; background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%); color:#020617 !important; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:600; font-size:15px; margin:8px 0 20px 0; box-shadow:0 6px 18px rgba(190,242,100,0.4); }
  .details { background-color:#020617; border-radius:10px; border:1px solid #1e293b; overflow:hidden; margin:4px 0 24px 0; }
  .detail-row { padding:14px 18px; border-bottom:1px solid #1e293b; }
  .detail-row:last-child { border-bottom:none; }
  .detail-label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.08em; margin:0 0 4px 0; }
  .detail-value { font-size:15px; color:#f1f5f9; font-weight:600; margin:0; }
  .detail-value.amount { font-size:22px; font-weight:800; color:#a3e635; }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px 20px 16px 20px; } .header h1 { font-size:22px; } .button { padding:12px 24px; font-size:14px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>You received a gift! ${itemEmoji}</h1>
    </div>
    <div class="content">
      <p>Hey <strong>${safeCreatorName}</strong>! ${senderLabel} just gifted you <strong>${safeItemName}</strong> on <strong>Exclu</strong>.</p>
      <div class="details">
        <div class="detail-row">
          <p class="detail-label">Gift</p>
          <p class="detail-value">${itemEmoji} ${safeItemName}</p>
        </div>
        <div class="detail-row">
          <p class="detail-label">Amount received</p>
          <p class="detail-value amount">${giftAmountFormatted}</p>
        </div>
        <div class="detail-row">
          <p class="detail-label">Your earnings (after fees)</p>
          <p class="detail-value">${giftNetFormatted}</p>
        </div>
        <div class="detail-row">
          <p class="detail-label">From</p>
          <p class="detail-value">${senderLabel}</p>
        </div>
      </div>
      ${messageBlock}
      <a href="${dashboardUrl}" class="button">View my wishlist</a>
      <p style="margin-top:20px; font-size:13px; color:#94a3b8;">You received this email because a fan gifted an item on your wishlist on Exclu.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — All rights reserved<br>
      <a href="${normalizedSiteUrl}">exclu</a> • <a href="${normalizedSiteUrl}/terms">Terms of Service</a> • <a href="${normalizedSiteUrl}/privacy">Privacy Policy</a>
    </div>
  </div>
</body>
</html>`;

  const payload = JSON.stringify({
    sender: { email: brevoSenderEmail, name: brevoSenderName },
    to: [{ email: creatorEmail }],
    subject: `${itemEmoji} ${senderLabel} gifted you ${safeItemName} on Exclu!`,
    htmlContent,
  });

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey!, 'Content-Type': 'application/json' },
        body: payload,
      });
      if (response.ok) {
        console.log(`Gift notification email sent to ${creatorEmail} (attempt ${attempt})`);
        return true;
      }
      const errorBody = await response.text();
      console.error(`Gift notification email failed (attempt ${attempt}/${MAX_ATTEMPTS})`, response.status, errorBody);
    } catch (err) {
      console.error(`Gift notification email error (attempt ${attempt}/${MAX_ATTEMPTS})`, err);
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return false;
}

/**
 * Find or create a conversation between a fan and a creator profile,
 * then insert a system message. Used after tip/request payments.
 */
async function ensureConversationAndNotify(params: {
  fanId: string;
  creatorId: string;
  profileId: string | null;
  messageContent: string;
}): Promise<void> {
  const { fanId, creatorId, profileId, messageContent } = params;
  if (!fanId || !creatorId) return;

  try {
    // Resolve profile_id: use provided or find the creator's default profile
    let resolvedProfileId = profileId;
    if (!resolvedProfileId) {
      const { data: defaultProfile } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('user_id', creatorId)
        .eq('is_active', true)
        .limit(1)
        .single();
      resolvedProfileId = defaultProfile?.id ?? null;
    }

    if (!resolvedProfileId) {
      console.warn('ensureConversationAndNotify: no profile_id found for creator', creatorId);
      return;
    }

    // Find existing conversation or create one
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('fan_id', fanId)
      .eq('profile_id', resolvedProfileId)
      .maybeSingle();

    let conversationId: string;

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          fan_id: fanId,
          profile_id: resolvedProfileId,
          status: 'active',
          last_message_at: new Date().toISOString(),
          last_message_preview: messageContent.slice(0, 100),
        })
        .select('id')
        .single();

      if (convErr || !newConv) {
        console.error('ensureConversationAndNotify: failed to create conversation', convErr);
        return;
      }
      conversationId = newConv.id;
    }

    // Insert system message
    const { error: msgErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'system',
        sender_id: fanId,
        content: messageContent,
        content_type: 'system',
      });

    if (msgErr) {
      console.error('ensureConversationAndNotify: failed to insert message', msgErr);
      return;
    }

    // Update conversation last_message fields
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messageContent.slice(0, 100),
      })
      .eq('id', conversationId);

    console.log('Conversation notification sent:', conversationId, messageContent.slice(0, 60));
  } catch (err) {
    console.error('ensureConversationAndNotify error (non-fatal):', err);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    // In the Edge runtime (Deno/Web Crypto), Stripe requires the async variant
    // of constructEvent to work with SubtleCryptoProvider.
    // Try the live secret first; if it fails and a test secret is configured, try that.
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret!);
    } catch (liveErr) {
      if (stripeWebhookSecretTest) {
        event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecretTest);
      } else {
        throw liveErr;
      }
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  console.log('Received Stripe event:', event.type);

  try {
    switch (event.type) {
      // Fan purchased a link
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Handle tip payments
        if (session.mode === 'payment' && session.metadata?.type === 'tip' && session.payment_status === 'paid') {
          const tipId = session.metadata.tip_id;
          const creatorId = session.metadata.creator_id;
          const fanId = session.metadata.fan_id;

          if (tipId) {
            // Check idempotency
            const { data: existingTip } = await supabase
              .from('tips')
              .select('id, status')
              .eq('id', tipId)
              .single();

            if (existingTip && existingTip.status !== 'succeeded') {
              const amountTotal = session.amount_total ?? 0;

              // Reverse-engineer the creator's base amount from the total (which includes 5% fee)
              const creatorBaseCents = Math.round(amountTotal / 1.05);
              const fanProcessingFeeCents = amountTotal - creatorBaseCents;

              // Determine platform commission (same logic as link checkout)
              let platformCommissionCents = 0;
              if (creatorId) {
                const { data: creatorProfile } = await supabase
                  .from('profiles')
                  .select('is_creator_subscribed')
                  .eq('id', creatorId)
                  .single();

                const commissionRate = creatorProfile?.is_creator_subscribed ? 0 : 0.1;
                platformCommissionCents = Math.round(creatorBaseCents * commissionRate);
              }

              const totalPlatformFee = platformCommissionCents + fanProcessingFeeCents;
              const creatorNetCents = creatorBaseCents - platformCommissionCents;

              const paymentIntentId = typeof session.payment_intent === 'string'
                ? session.payment_intent
                : (session.payment_intent as any)?.id ?? null;

              // Capture fan email from Stripe for potential account linking
              const tipFanEmail = session.customer_details?.email ?? null;

              const { error: tipUpdateError } = await supabase
                .from('tips')
                .update({
                  status: 'succeeded',
                  paid_at: new Date().toISOString(),
                  stripe_payment_intent_id: paymentIntentId,
                  platform_fee_cents: totalPlatformFee,
                  creator_net_cents: creatorNetCents,
                  ...(tipFanEmail ? { fan_email: tipFanEmail } : {}),
                })
                .eq('id', tipId);

              if (tipUpdateError) {
                console.error('Error updating tip status:', tipUpdateError);
              } else {
                console.log('Tip succeeded:', tipId, 'creator:', creatorId, 'fan:', fanId, 'net:', creatorNetCents);

                // Send creator notification email (best-effort)
                try {
                  // Fetch tip details (message, anonymous flag)
                  const { data: tipDetails } = await supabase
                    .from('tips')
                    .select('message, is_anonymous')
                    .eq('id', tipId)
                    .single();

                  // Fetch creator email from auth.users + display_name from profiles
                  const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(creatorId);
                  const { data: creatorProfileForEmail } = await supabase
                    .from('profiles')
                    .select('display_name, handle')
                    .eq('id', creatorId)
                    .single();

                  if (creatorUser?.email) {
                    const creatorDisplayName = creatorProfileForEmail?.display_name || creatorProfileForEmail?.handle || 'Creator';
                    await sendCreatorTipNotificationEmail({
                      creatorEmail: creatorUser.email,
                      creatorName: creatorDisplayName,
                      tipAmountFormatted: `$${(creatorBaseCents / 100).toFixed(2)}`,
                      tipNetFormatted: `$${(creatorNetCents / 100).toFixed(2)}`,
                      tipMessage: tipDetails?.message || null,
                      isAnonymous: tipDetails?.is_anonymous === true,
                      dashboardUrl: `${normalizedSiteUrl}/app/tips`,
                    });
                  }
                } catch (emailErr) {
                  console.error('Error sending tip notification email (non-fatal):', emailErr);
                }

                // Auto-create conversation + send notification (non-anonymous tips from logged-in fans)
                const tipProfileId = session.metadata?.profile_id || null;
                const { data: tipRow } = await supabase
                  .from('tips')
                  .select('is_anonymous, amount_cents')
                  .eq('id', tipId)
                  .single();

                if (fanId && tipRow && !tipRow.is_anonymous) {
                  const tipAmtFmt = `$${((tipRow.amount_cents || 0) / 100).toFixed(2)}`;
                  await ensureConversationAndNotify({
                    fanId,
                    creatorId,
                    profileId: tipProfileId,
                    messageContent: `💰 Sent a tip of ${tipAmtFmt}`,
                  });
                }
              }
            }
          }
        }

        // Handle gift purchases (wishlist gifting)
        if (session.mode === 'payment' && session.metadata?.type === 'gift' && session.payment_status === 'paid') {
          const giftPurchaseId = session.metadata.gift_purchase_id;
          const wishlistItemId = session.metadata.wishlist_item_id;
          const creatorId = session.metadata.creator_id;
          const fanId = session.metadata.fan_id;

          if (giftPurchaseId) {
            const { data: existingGift } = await supabase
              .from('gift_purchases')
              .select('id, status')
              .eq('id', giftPurchaseId)
              .single();

            if (existingGift && existingGift.status !== 'succeeded') {
              const amountTotal = session.amount_total ?? 0;
              const creatorBaseCents = Math.round(amountTotal / 1.05);
              const fanProcessingFeeCents = amountTotal - creatorBaseCents;

              let platformCommissionCents = 0;
              if (creatorId) {
                const { data: creatorProfile } = await supabase
                  .from('profiles')
                  .select('is_creator_subscribed')
                  .eq('id', creatorId)
                  .single();
                const commissionRate = creatorProfile?.is_creator_subscribed ? 0 : 0.1;
                platformCommissionCents = Math.round(creatorBaseCents * commissionRate);
              }

              const totalPlatformFee = platformCommissionCents + fanProcessingFeeCents;
              const creatorNetCents = creatorBaseCents - platformCommissionCents;

              const paymentIntentId = typeof session.payment_intent === 'string'
                ? session.payment_intent
                : (session.payment_intent as any)?.id ?? null;

              const { error: giftUpdateError } = await supabase
                .from('gift_purchases')
                .update({
                  status: 'succeeded',
                  paid_at: new Date().toISOString(),
                  stripe_payment_intent_id: paymentIntentId,
                  platform_fee_cents: totalPlatformFee,
                  creator_net_cents: creatorNetCents,
                })
                .eq('id', giftPurchaseId);

              if (giftUpdateError) {
                console.error('Error updating gift_purchase status:', giftUpdateError);
              } else {
                console.log('Gift succeeded:', giftPurchaseId, 'creator:', creatorId, 'fan:', fanId, 'net:', creatorNetCents);

                // Increment gifted_count on the wishlist item
                if (wishlistItemId) {
                  try {
                    const { data: wishlistItem } = await supabase
                      .from('wishlist_items')
                      .select('gifted_count')
                      .eq('id', wishlistItemId)
                      .single();
                    if (wishlistItem) {
                      await supabase
                        .from('wishlist_items')
                        .update({ gifted_count: (wishlistItem.gifted_count || 0) + 1 })
                        .eq('id', wishlistItemId);
                    }
                  } catch (countErr) {
                    console.error('Error incrementing gifted_count (non-fatal):', countErr);
                  }
                }

                // Send creator notification email (best-effort)
                try {
                  const { data: giftDetails } = await supabase
                    .from('gift_purchases')
                    .select('message, is_anonymous, wishlist_item_id')
                    .eq('id', giftPurchaseId)
                    .single();

                  const { data: itemDetails } = await supabase
                    .from('wishlist_items')
                    .select('name, emoji')
                    .eq('id', wishlistItemId)
                    .single();

                  const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(creatorId);
                  const { data: creatorProfileForEmail } = await supabase
                    .from('profiles')
                    .select('display_name, handle')
                    .eq('id', creatorId)
                    .single();

                  if (creatorUser?.email) {
                    const creatorDisplayName = creatorProfileForEmail?.display_name || creatorProfileForEmail?.handle || 'Creator';
                    await sendCreatorGiftNotificationEmail({
                      creatorEmail: creatorUser.email,
                      creatorName: creatorDisplayName,
                      itemName: itemDetails?.name ?? 'a gift',
                      itemEmoji: itemDetails?.emoji ?? '🎁',
                      giftAmountFormatted: `$${(creatorBaseCents / 100).toFixed(2)}`,
                      giftNetFormatted: `$${(creatorNetCents / 100).toFixed(2)}`,
                      giftMessage: giftDetails?.message || null,
                      isAnonymous: giftDetails?.is_anonymous === true,
                      dashboardUrl: `${normalizedSiteUrl}/app/wishlist`,
                    });
                  }
                } catch (emailErr) {
                  console.error('Error sending gift notification email (non-fatal):', emailErr);
                }
              }
            }
          }
        }

        // Handle custom request checkout (manual capture — payment_status is 'paid' even though intent is requires_capture)
        if (session.mode === 'payment' && session.metadata?.type === 'request' && session.payment_status === 'paid') {
          const requestId = session.metadata.request_id;
          const creatorId = session.metadata.creator_id;
          const fanEmail = session.metadata.fan_email || null;
          const isNewAccount = session.metadata.is_new_account === '1';

          if (requestId) {
            const { data: existingReq } = await supabase
              .from('custom_requests')
              .select('id, status, proposed_amount_cents, description')
              .eq('id', requestId)
              .single();

            if (existingReq && existingReq.status === 'pending_payment') {
              const paymentIntentId = typeof session.payment_intent === 'string'
                ? session.payment_intent
                : (session.payment_intent as any)?.id ?? null;

              const { error: reqUpdateErr } = await supabase
                .from('custom_requests')
                .update({
                  status: 'pending',
                  stripe_payment_intent_id: paymentIntentId,
                })
                .eq('id', requestId);

              if (reqUpdateErr) {
                console.error('Error updating request status to pending:', reqUpdateErr);
              } else {
                console.log('Request activated:', requestId, 'PI:', paymentIntentId);

                // Send creator notification email (best-effort)
                try {
                  const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(creatorId);
                  const { data: creatorProfileForEmail } = await supabase
                    .from('profiles')
                    .select('display_name, handle')
                    .eq('id', creatorId)
                    .single();

                  if (creatorUser?.email) {
                    const creatorDisplayName = creatorProfileForEmail?.display_name || creatorProfileForEmail?.handle || 'Creator';
                    const proposedFormatted = `$${((existingReq.proposed_amount_cents || 0) / 100).toFixed(2)}`;
                    const expiresDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
                    const trimmedDesc = (existingReq.description || '').length > 300
                      ? existingReq.description.slice(0, 300) + '…'
                      : existingReq.description;

                    const safeCreatorName = escapeHtml(creatorDisplayName);
                    const safeDescription = escapeHtml(trimmedDesc);
                    const dashboardUrl = `${normalizedSiteUrl}/app/chat`;

                    const requestEmailHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>New custom request</title>
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;text-align:left}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;box-shadow:0 12px 30px rgba(0,0,0,0.55);overflow:hidden}.header{padding:28px 28px 18px 28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;line-height:1.3;font-weight:700}.content{padding:26px 28px 30px 28px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px 0}.content strong{color:#fff;font-weight:600}.button{display:inline-block;background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%);color:#020617 !important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px 0;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.details{background-color:#020617;border-radius:10px;border:1px solid #1e293b;overflow:hidden;margin:4px 0 24px 0}.detail-row{padding:14px 18px;border-bottom:1px solid #1e293b}.detail-row:last-child{border-bottom:none}.detail-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px 0}.detail-value{font-size:15px;color:#f1f5f9;font-weight:600;margin:0}.detail-value.amount{font-size:22px;font-weight:800;color:#a3e635}.description-box{background-color:#020617;border-radius:10px;padding:18px;margin:20px 0;border:1px solid #1e293b}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b;background-color:#020617}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>New paid request 📩</h1></div><div class="content">
<p>Hey <strong>${safeCreatorName}</strong>, a fan just sent you a paid custom content request on <strong>Exclu</strong>.</p>
<p>The payment is <strong>on hold</strong> — you have 6 days to accept or decline.</p>
<div class="details"><div class="detail-row"><p class="detail-label">Amount (yours if accepted)</p><p class="detail-value amount">${proposedFormatted}</p></div><div class="detail-row"><p class="detail-label">Expires</p><p class="detail-value">${expiresDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p></div></div>
<div class="description-box"><p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px 0;">Request description</p><p style="font-size:15px;color:#f1f5f9;margin:0;line-height:1.6;">${safeDescription}</p></div>
<p>Upload your content and accept the request to get paid, or decline to release the hold.</p>
<a href="${dashboardUrl}" class="button">Review request</a>
<p style="margin-top:20px;font-size:13px;color:#94a3b8;">You received this email because a fan sent you a paid custom request on Exclu.</p>
</div><div class="footer">© 2025 Exclu — All rights reserved<br><a href="${normalizedSiteUrl}">exclu</a> • <a href="${normalizedSiteUrl}/terms">Terms</a> • <a href="${normalizedSiteUrl}/privacy">Privacy</a></div></div></body></html>`;

                    if (brevoApiKey && brevoSenderEmail) {
                      const emailPayload = JSON.stringify({
                        sender: { email: brevoSenderEmail, name: brevoSenderName },
                        to: [{ email: creatorUser.email }],
                        subject: `📩 New paid request — ${proposedFormatted} on hold`,
                        htmlContent: requestEmailHtml,
                      });
                      try {
                        await fetch('https://api.brevo.com/v3/smtp/email', {
                          method: 'POST',
                          headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
                          body: emailPayload,
                        });
                      } catch (e) { console.error('Request notification email failed:', e); }
                    }
                  }
                } catch (emailErr) {
                  console.error('Error sending request notification email (non-fatal):', emailErr);
                }

                // Auto-create conversation + send notification for custom request
                const reqFanId = session.metadata?.fan_id || null;
                const reqProfileId = session.metadata?.profile_id || null;
                if (reqFanId) {
                  const reqAmtFmt = `$${((existingReq.proposed_amount_cents || 0) / 100).toFixed(2)}`;
                  const trimDesc = (existingReq.description || '').slice(0, 80);
                  await ensureConversationAndNotify({
                    fanId: reqFanId,
                    creatorId,
                    profileId: reqProfileId,
                    messageContent: `📩 Custom request for ${reqAmtFmt}: "${trimDesc}"`,
                  });
                }

                // If new account was created, generate confirmation link and send via Brevo
                if (isNewAccount && fanEmail && brevoApiKey && brevoSenderEmail) {
                  try {
                    const { data: linkData } = await supabase.auth.admin.generateLink({
                      type: 'signup',
                      email: fanEmail,
                    });

                    const confirmUrl = linkData?.properties?.action_link || `${normalizedSiteUrl}/auth?mode=confirm`;

                    const confirmHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Confirm your account</title>
<style>body{margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0}.container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%);border-radius:16px;border:1px solid #1e293b;box-shadow:0 12px 30px rgba(0,0,0,0.55);overflow:hidden}.header{padding:28px;border-bottom:1px solid #1e293b}.header h1{font-size:26px;color:#f9fafb;margin:0;font-weight:700}.content{padding:26px 28px 30px}.content p{font-size:15px;line-height:1.7;color:#cbd5e1;margin:0 0 16px}.content strong{color:#fff;font-weight:600}.button{display:inline-block;background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%);color:#020617 !important;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:600;font-size:15px;margin:8px 0 20px;box-shadow:0 6px 18px rgba(190,242,100,0.4)}.footer{font-size:12px;color:#64748b;text-align:center;padding:18px;border-top:1px solid #1e293b;background-color:#020617}.footer a{color:#a3e635;text-decoration:none}</style></head>
<body><div class="container"><div class="header"><h1>Welcome to Exclu 🎉</h1></div><div class="content">
<p>Your account has been created and your custom request has been submitted!</p>
<p>Please confirm your email to access your account and track your request:</p>
<a href="${confirmUrl}" class="button">Confirm my email</a>
<p style="font-size:13px;color:#94a3b8;">If you didn't create this account, you can ignore this email.</p>
</div><div class="footer">© 2025 Exclu — All rights reserved<br><a href="${normalizedSiteUrl}">exclu</a></div></div></body></html>`;

                    await fetch('https://api.brevo.com/v3/smtp/email', {
                      method: 'POST',
                      headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        sender: { email: brevoSenderEmail, name: brevoSenderName },
                        to: [{ email: fanEmail }],
                        subject: '🎉 Welcome to Exclu — confirm your account',
                        htmlContent: confirmHtml,
                      }),
                    });
                    console.log('Confirmation email sent to new fan:', fanEmail);
                  } catch (confirmErr) {
                    console.error('Error sending confirmation email (non-fatal):', confirmErr);
                  }
                }
              }
            }
          }
        }

        // Only process one-time payments for link purchases (not subscriptions)
        // Verify payment_status to avoid granting access for unpaid sessions (e.g. delayed payments)
        if (session.mode === 'payment' && session.metadata?.link_id && session.payment_status === 'paid') {
          const linkId = session.metadata.link_id;
          const creatorId = session.metadata.creator_id;
          const amountTotal = session.amount_total ?? 0;
          const slug = session.metadata.slug as string | undefined;

          // Check if purchase already exists (idempotency)
          const { data: existingPurchase } = await supabase
            .from('purchases')
            .select('id')
            .eq('stripe_session_id', session.id)
            .single();

          if (!existingPurchase) {
            // Prefer an explicit buyer email captured before checkout if present in metadata,
            // otherwise fall back to the email on the Stripe Checkout session.
            const buyerEmailFromMetadata = (session.metadata as any)?.buyerEmail as string | undefined;
            const emailFromStripe = session.customer_details?.email ?? null;
            const customerEmail = (buyerEmailFromMetadata || emailFromStripe || null) as string | null;
            const chatConversationId = (session.metadata as any)?.conversation_id as string | undefined ?? null;

            // ── Chatter revenue attribution ──────────────────────────────────
            const chatChatterId = (session.metadata as any)?.chatter_id as string | undefined ?? null;
            const chatterEarningsCents = parseInt((session.metadata as any)?.chatter_earnings_cents ?? '0', 10);
            const creatorNetCents = parseInt((session.metadata as any)?.creator_net_cents ?? '0', 10);
            const platformFeeCents = parseInt((session.metadata as any)?.platform_fee_cents ?? '0', 10);

            const { error: insertError } = await supabase.from('purchases').insert({
              link_id: linkId,
              amount_cents: amountTotal,
              currency: session.currency?.toUpperCase() ?? 'USD',
              stripe_session_id: session.id,
              status: 'succeeded',
              buyer_email: customerEmail,
              access_token: crypto.randomUUID(),
              ...(chatConversationId ? { chat_conversation_id: chatConversationId } : {}),
              ...(chatChatterId ? {
                chat_chatter_id: chatChatterId,
                chatter_earnings_cents: chatterEarningsCents,
                creator_net_cents: creatorNetCents,
                platform_fee_cents: platformFeeCents,
              } : {}),
            });

            if (insertError) {
              console.error('Error inserting purchase:', insertError);
            } else {
              console.log('Purchase recorded for link:', linkId, chatChatterId ? `(chatter: ${chatChatterId})` : '');

              // ── Increment chatter wallet if sale is attributed ──────────
              if (chatChatterId && chatterEarningsCents > 0) {
                try {
                  await supabase.rpc('increment_chatter_earnings', {
                    p_chatter_id: chatChatterId,
                    p_amount_cents: chatterEarningsCents,
                  });
                  console.log('Chatter earnings incremented:', chatChatterId, '+', chatterEarningsCents, 'cents');
                } catch (earningsErr) {
                  console.error('Error incrementing chatter earnings:', earningsErr);
                }
              }

              // Incrémenter le revenu de la conversation si l'achat vient du chat
              if (chatConversationId && amountTotal > 0) {
                try {
                  await supabase.rpc('increment_conversation_revenue', {
                    p_conversation_id: chatConversationId,
                    p_amount_cents: amountTotal,
                  });
                } catch (revenueErr) {
                  console.error('Error incrementing conversation revenue:', revenueErr);
                }
              }

              // If we have both an email and a site URL, send the buyer a copy of the access link via Brevo.
              if (customerEmail && siteUrl && slug) {
                try {
                  const base = siteUrl.replace(/\/$/, '');
                  const accessUrl = `${base}/l/${encodeURIComponent(slug)}?session_id=${session.id}`;

                  let linkTitle = 'your exclusive content';
                  const { data: linkRecord } = await supabase
                    .from('links')
                    .select('title')
                    .eq('id', linkId)
                    .single();

                  if (linkRecord?.title) {
                    linkTitle = linkRecord.title;
                  }

                  const emailSent = await sendContentAccessEmail(customerEmail, linkTitle, accessUrl);

                  // Update the email_sent flag on the purchase record
                  if (emailSent) {
                    await supabase
                      .from('purchases')
                      .update({ email_sent: true })
                      .eq('stripe_session_id', session.id);
                  }
                } catch (emailErr) {
                  console.error('Error sending content access email:', emailErr);
                }
              }

              // Post-purchase: Check if this creator (the referred one) reached $1k net revenue
              // within 90 days of signup → if so, credit $100 bonus to the REFERRED creator themselves.
              if (creatorId) {
                try {
                  // 1. Find the referral row for this creator as the referred party, bonus not yet paid
                  const { data: referral, error: refErr } = await supabase
                    .from('referrals')
                    .select('id, referred_id, created_at, bonus_paid_to_referred')
                    .eq('referred_id', creatorId)
                    .eq('bonus_paid_to_referred', false)
                    .maybeSingle();

                  if (!refErr && referral) {
                    const signupDate = new Date(referral.created_at);
                    const now = new Date();
                    const diffDays = (now.getTime() - signupDate.getTime()) / (1000 * 3600 * 24);

                    if (diffDays <= 90) {
                      // 2. Sum all succeeded purchases for this creator's links (including the current one)
                      const { data: allCreatorLinks } = await supabase
                        .from('links')
                        .select('id')
                        .eq('creator_id', creatorId);

                      if (allCreatorLinks && allCreatorLinks.length > 0) {
                        const allLinkIds = allCreatorLinks.map((l: any) => l.id);
                        const { data: allPurchases, error: purError } = await supabase
                          .from('purchases')
                          .select('amount_cents')
                          .in('link_id', allLinkIds)
                          .eq('status', 'succeeded');

                        if (!purError && allPurchases) {
                          // Creator net revenue: strip the 5% fan processing fee
                          const totalCreatorNetRevenue = allPurchases.reduce(
                            (acc: number, p: any) => acc + Math.round((p.amount_cents || 0) / 1.05), 0
                          );

                          // Milestone: $1,000 net = 100,000 cents
                          if (totalCreatorNetRevenue >= 100000) {
                            console.log(`Referred creator ${creatorId} reached $1k net revenue in 90 days — crediting $100 bonus.`);

                            // 3. Mark bonus as paid to prevent double-crediting
                            await supabase
                              .from('referrals')
                              .update({ bonus_paid_to_referred: true })
                              .eq('id', referral.id);

                            // 4. Credit $100 (10,000 cents) to the REFERRED creator's affiliate_earnings_cents
                            const { data: referredProfile } = await supabase
                              .from('profiles')
                              .select('affiliate_earnings_cents')
                              .eq('id', creatorId)
                              .single();

                            if (referredProfile) {
                              await supabase
                                .from('profiles')
                                .update({
                                  affiliate_earnings_cents: (referredProfile.affiliate_earnings_cents || 0) + 10000,
                                })
                                .eq('id', creatorId);
                            }
                          }
                        }
                      }
                    }
                  }
                } catch (err) {
                  console.error('Error processing $100 referral bonus for referred creator:', err);
                }
              }
            }
          }
        }

        // Handle creator subscription checkout completion
        if (session.mode === 'subscription' && session.metadata?.supabase_user_id) {
          const userId = session.metadata.supabase_user_id;

          const { data: existingProfile, error: existingProfileError } = await supabase
            .from('profiles')
            .select('is_creator_subscribed')
            .eq('id', userId)
            .maybeSingle();

          if (existingProfileError) {
            console.error('Error loading profile for subscription activation:', existingProfileError);
          }

          const wasSubscribed = existingProfile?.is_creator_subscribed === true;

          const updatePayload: Record<string, unknown> = { is_creator_subscribed: true };
          if (!wasSubscribed) {
            updatePayload.show_join_banner = false;
            updatePayload.show_certification = true;
            updatePayload.show_deeplinks = true;
            updatePayload.show_available_now = true;
          }

          const { error: updateError } = await supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating creator subscription status:', updateError);
          } else {
            console.log('Creator subscription activated for user:', userId);
          }

          // Credit 35% referral commission to the referrer on first-time premium activation
          // 35% of $39 = $13.65 = 1365 cents
          if (!wasSubscribed) {
            try {
              const { data: referral, error: refErr } = await supabase
                .from('referrals')
                .select('id, referrer_id, commission_earned_cents')
                .eq('referred_id', userId)
                .maybeSingle();

              if (!refErr && referral?.referrer_id) {
                const commissionCents = Math.round(3900 * 0.35); // $13.65

                // Update commission on the referral row
                await supabase
                  .from('referrals')
                  .update({
                    status: 'converted',
                    commission_earned_cents: (referral.commission_earned_cents || 0) + commissionCents,
                  })
                  .eq('id', referral.id);

                // Credit to referrer's affiliate_earnings_cents
                const { data: referrerProfile } = await supabase
                  .from('profiles')
                  .select('affiliate_earnings_cents')
                  .eq('id', referral.referrer_id)
                  .single();

                if (referrerProfile) {
                  await supabase
                    .from('profiles')
                    .update({
                      affiliate_earnings_cents: (referrerProfile.affiliate_earnings_cents || 0) + commissionCents,
                    })
                    .eq('id', referral.referrer_id);
                  console.log(`Credited ${commissionCents} cents referral commission to ${referral.referrer_id}`);
                }
              }
            } catch (err) {
              console.error('Error processing referral commission on subscription:', err);
            }
          }
        }
        break;
      }

      // Creator subscription updated (e.g., renewed, changed)
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (userId) {
          const isActive = ['active', 'trialing'].includes(subscription.status);

          const { data: existingProfile, error: existingProfileError } = await supabase
            .from('profiles')
            .select('is_creator_subscribed')
            .eq('id', userId)
            .maybeSingle();

          if (existingProfileError) {
            console.error('Error loading profile for subscription update:', existingProfileError);
          }

          const wasSubscribed = existingProfile?.is_creator_subscribed === true;

          const updatePayload: Record<string, unknown> = { is_creator_subscribed: isActive };
          if (isActive && !wasSubscribed) {
            updatePayload.show_join_banner = false;
            updatePayload.show_certification = true;
            updatePayload.show_deeplinks = true;
            updatePayload.show_available_now = true;
          }
          if (!isActive && wasSubscribed) {
            updatePayload.show_join_banner = true;
            updatePayload.show_certification = false;
            updatePayload.show_deeplinks = false;
            updatePayload.show_available_now = false;
          }

          const { error: updateError } = await supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating subscription status:', updateError);
          } else {
            console.log('Subscription status updated for user:', userId, 'active:', isActive);
          }
        }
        break;
      }

      // Creator subscription cancelled or expired
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (userId) {
          const { data: existingProfile, error: existingProfileError } = await supabase
            .from('profiles')
            .select('is_creator_subscribed')
            .eq('id', userId)
            .maybeSingle();

          if (existingProfileError) {
            console.error('Error loading profile for subscription deletion:', existingProfileError);
          }

          const wasSubscribed = existingProfile?.is_creator_subscribed === true;

          const updatePayload: Record<string, unknown> = { is_creator_subscribed: false };
          if (wasSubscribed) {
            updatePayload.show_join_banner = true;
            updatePayload.show_certification = false;
            updatePayload.show_deeplinks = false;
            updatePayload.show_available_now = false;
          }

          const { error: updateError } = await supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId);

          if (updateError) {
            console.error('Error deactivating subscription:', updateError);
          } else {
            console.log('Subscription deactivated for user:', userId);
          }
        }
        break;
      }

      // Stripe Connect account updated (onboarding completed, etc.)
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        const userId = account.metadata?.supabase_user_id;

        if (userId) {
          let connectStatus = 'pending';

          if (account.charges_enabled && account.payouts_enabled) {
            connectStatus = 'complete';
          } else if (
            account.requirements?.disabled_reason ||
            !account.charges_enabled
          ) {
            connectStatus = 'restricted';
          }

          // Load previous status + email flag so we can send an email exactly once when the
          // account becomes active.
          const { data: existingProfile, error: profileLoadError } = await supabase
            .from('profiles')
            .select('stripe_connect_status, stripe_verified_email_sent_at, display_name')
            .eq('id', userId)
            .maybeSingle();

          if (profileLoadError) {
            console.error('Error loading profile for Connect status update:', profileLoadError);
          }

          const previousStatus = existingProfile?.stripe_connect_status ?? null;
          const emailAlreadySent = Boolean(existingProfile?.stripe_verified_email_sent_at);

          const { error: updateError } = await supabase
            .from('profiles')
            .update({ stripe_connect_status: connectStatus })
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating Connect status:', updateError);
          } else {
            console.log('Connect status updated for user:', userId, 'status:', connectStatus);
          }

          const becameComplete = connectStatus === 'complete' && previousStatus !== 'complete';

          if (becameComplete && !emailAlreadySent) {
            try {
              const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
              if (authError) {
                console.error('Error loading auth user for Stripe verified email:', authError);
              }

              const creatorEmail = authUser?.user?.email ?? null;
              if (!creatorEmail) {
                console.warn('No creator email found; skipping Stripe verified email for user:', userId);
                break;
              }

              const base = (siteUrl || 'https://exclu.at').replace(/\/$/, '');
              const paymentsUrl = `${base}/app/profile#payments`;

              const emailSent = await sendStripeVerifiedEmail(
                creatorEmail,
                existingProfile?.display_name ?? null,
                paymentsUrl,
              );

              if (emailSent) {
                const { error: emailFlagError } = await supabase
                  .from('profiles')
                  .update({ stripe_verified_email_sent_at: new Date().toISOString() })
                  .eq('id', userId);

                if (emailFlagError) {
                  console.error('Error setting stripe_verified_email_sent_at:', emailFlagError);
                }
              }
            } catch (emailErr) {
              console.error('Error sending Stripe verified email:', emailErr);
            }
          }
        }
        break;
      }

      // Handle successful subscription payments (new & renewals) for affiliate tracking
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | undefined;

        // Only trigger on subscription invoices, specifically for the creator tier.
        if (subscriptionId && invoice.amount_paid > 0) {
          // Fetch the subscription to get the user ID
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = subscription.metadata?.supabase_user_id;

          if (userId) {
            // Check if this user was referred by someone and their referral status isn't inactive
            const { data: referralData, error: referralError } = await supabase
              .from('referrals')
              .select('id, referrer_id, status, commission_earned_cents')
              .eq('referred_id', userId)
              .neq('status', 'inactive')
              .maybeSingle();

            if (referralError) {
              console.error('Error fetching referral data for invoice.paid:', referralError);
            }

            if (referralData && referralData.referrer_id) {
              // Calculate 35% commission logic
              const commissionCents = Math.round(invoice.amount_paid * 0.35);

              // 1. Update the referral tracking row
              const newTotalCommission = (referralData.commission_earned_cents || 0) + commissionCents;

              const updatePayload: Record<string, unknown> = {
                commission_earned_cents: newTotalCommission,
                status: 'converted'
              };
              if (referralData.status !== 'converted') {
                updatePayload.converted_at = new Date().toISOString();
              }

              await supabase
                .from('referrals')
                .update(updatePayload)
                .eq('id', referralData.id);

              // 2. Credit the referrer's affiliate earnings
              const { data: referrerProfile } = await supabase
                .from('profiles')
                .select('affiliate_earnings_cents')
                .eq('id', referralData.referrer_id)
                .single();

              if (referrerProfile) {
                const updatedEarnings = (referrerProfile.affiliate_earnings_cents || 0) + commissionCents;
                await supabase
                  .from('profiles')
                  .update({ affiliate_earnings_cents: updatedEarnings })
                  .eq('id', referralData.referrer_id);

                console.log(`Affiliate credited! Referrer ${referralData.referrer_id} earned ${commissionCents} cents from invoice ${invoice.id}`);
              }
            }
          }
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
