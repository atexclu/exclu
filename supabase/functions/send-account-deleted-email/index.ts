/**
 * send-account-deleted-email — internal email dispatcher for account-deletion flows.
 *
 * Two input shapes (branched on `template`):
 *
 *   1. Confirmation (default):
 *        { user_id: string, email: string, account_type: string }
 *      → ACCOUNT_DELETED_CONFIRMATION
 *
 *   2. Support alert:
 *        { email: string, template: 'support_alert',
 *          metadata: { user_id: string, ban_error: string } }
 *      → ACCOUNT_DELETION_SUPPORT_ALERT
 *
 * Auth model: this function has `verify_jwt = false` and intentionally
 * skips JWT verification. It is invoked internally from `delete-account`
 * (sometimes via service-role, sometimes via the user's own JWT). Even if
 * exposed, it can only emit fixed-template emails to the supplied address
 * — no data exfiltration. Platform-level rate limiting protects against
 * abuse.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { sendBrevoEmail } from '../_shared/brevo.ts';
import {
  ACCOUNT_DELETED_CONFIRMATION,
  ACCOUNT_DELETION_SUPPORT_ALERT,
} from './templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ConfirmationPayload {
  user_id?: string;
  email?: string;
  account_type?: string;
  template?: undefined;
}

interface SupportAlertPayload {
  email?: string;
  template: 'support_alert';
  metadata?: {
    user_id?: string;
    ban_error?: string;
  };
}

type Payload = ConfirmationPayload | SupportAlertPayload;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
    });
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const email = (body?.email ?? '').trim();
  if (!email || !EMAIL_REGEX.test(email)) {
    return jsonResponse({ error: 'Missing or invalid email' }, 400);
  }

  try {
    let subject: string;
    let html: string;
    let tags: string[];

    if ((body as SupportAlertPayload).template === 'support_alert') {
      const meta = (body as SupportAlertPayload).metadata ?? {};
      const userId = (meta.user_id ?? 'unknown').toString();
      const banError = (meta.ban_error ?? 'unknown error').toString();
      const rendered = ACCOUNT_DELETION_SUPPORT_ALERT({ userId, error: banError });
      subject = rendered.subject;
      html = rendered.html;
      tags = ['account-deletion', 'support-alert'];
    } else {
      const accountType = ((body as ConfirmationPayload).account_type ?? 'fan').toString();
      const rendered = ACCOUNT_DELETED_CONFIRMATION({ accountType });
      subject = rendered.subject;
      html = rendered.html;
      tags = ['account-deletion', 'confirmation'];
    }

    const sent = await sendBrevoEmail({
      to: email,
      subject,
      htmlContent: html,
      tags,
    });

    if (!sent) {
      console.error('[send-account-deleted-email] Brevo send failed', { to: email });
      return jsonResponse({ error: 'Failed to send email' }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error('[send-account-deleted-email] unexpected error', err);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
});
