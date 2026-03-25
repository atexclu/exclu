import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildForwardEmail(params: {
  agencyName: string;
  requesterName: string;
  requesterEmail: string;
  requesterCompany?: string | null;
  requesterWhatsapp?: string | null;
  requesterTelegram?: string | null;
  requesterMonthlyRevenue?: string | null;
  requesterMessage: string;
}): string {
  const {
    agencyName,
    requesterName,
    requesterEmail,
    requesterCompany,
    requesterWhatsapp,
    requesterTelegram,
    requesterMonthlyRevenue,
    requesterMessage,
  } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New contact request — Exclu</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#020617;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#020617;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" style="max-width:600px;width:100%;border-collapse:collapse;background:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.3);">

        <tr><td style="padding:36px 40px 24px;text-align:center;background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#CFFF16;letter-spacing:-0.5px;">📩 New contact request</h1>
        </td></tr>

        <tr><td style="padding:28px 40px;color:#e2e8f0;">
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#cbd5e1;">
            Someone wants to work with <strong style="color:#CFFF16;">${esc(agencyName)}</strong> through the Exclu directory.
          </p>

          <div style="background:#1e293b;border-left:4px solid #CFFF16;padding:20px;margin:16px 0;border-radius:8px;">
            <p style="margin:0 0 10px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Their Details</p>
            <p style="margin:0 0 6px;font-size:14px;color:#e2e8f0;"><strong>Name:</strong> ${esc(requesterName)}</p>
            <p style="margin:0 0 6px;font-size:14px;color:#e2e8f0;"><strong>Email:</strong> <a href="mailto:${esc(requesterEmail)}" style="color:#a3e635;text-decoration:none;">${esc(requesterEmail)}</a></p>
            ${requesterCompany ? `<p style="margin:0 0 6px;font-size:14px;color:#e2e8f0;"><strong>Company:</strong> ${esc(requesterCompany)}</p>` : ''}
            ${requesterWhatsapp ? `<p style="margin:0 0 6px;font-size:14px;color:#e2e8f0;"><strong>WhatsApp:</strong> ${esc(requesterWhatsapp)}</p>` : ''}
            ${requesterTelegram ? `<p style="margin:0 0 6px;font-size:14px;color:#e2e8f0;"><strong>Telegram:</strong> ${esc(requesterTelegram)}</p>` : ''}
            ${requesterMonthlyRevenue ? `<p style="margin:0 0 6px;font-size:14px;color:#e2e8f0;"><strong>Avg. Monthly Revenue:</strong> ${esc(requesterMonthlyRevenue)}</p>` : ''}
          </div>

          <div style="background:#1e293b;padding:18px;margin:16px 0;border-radius:8px;">
            <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Message</p>
            <p style="margin:0;font-size:14px;color:#e2e8f0;line-height:1.6;white-space:pre-wrap;">${esc(requesterMessage)}</p>
          </div>

          <div style="margin:28px 0;text-align:center;">
            <a href="mailto:${esc(requesterEmail)}"
               style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#bef264 0%,#a3e635 100%);color:#020617;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(190,242,100,.3);">
              Reply to ${esc(requesterName)} →
            </a>
          </div>

          <p style="margin:0;font-size:13px;color:#64748b;text-align:center;">
            This contact request was forwarded by Exclu after review.
          </p>
        </td></tr>

        <tr><td style="padding:20px 40px;text-align:center;background:#0a0f1a;border-top:1px solid #1e293b;">
          <p style="margin:0;font-size:12px;color:#64748b;">
            &copy; Exclu &mdash; <a href="https://exclu.at" style="color:#a3e635;text-decoration:none;">exclu.at</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { contactId, action } = body as { contactId: string; action: 'approve' | 'reject' };

    if (!contactId || !action || !['approve', 'reject'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Missing contactId or invalid action (must be "approve" or "reject")' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the contact request
    const { data: contact, error: fetchErr } = await supabase
      .from('agency_claim_requests')
      .select('*')
      .eq('id', contactId)
      .single();

    if (fetchErr || !contact) {
      return new Response(
        JSON.stringify({ error: 'Contact request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (contact.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Contact request has already been handled' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update status
    const { error: updateErr } = await supabase
      .from('agency_claim_requests')
      .update({ status: newStatus, reviewed_at: new Date().toISOString() })
      .eq('id', contactId);

    if (updateErr) {
      console.error('Update error:', updateErr);
      return new Response(
        JSON.stringify({ error: 'Failed to update contact request status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If approved and we have a creator email, forward the contact details
    if (action === 'approve' && contact.agency_profile_email) {
      try {
        const emailHtml = buildForwardEmail({
          agencyName: contact.agency_name || 'Your Agency',
          requesterName: contact.requester_name || 'Someone',
          requesterEmail: contact.requester_email,
          requesterCompany: contact.requester_company,
          requesterWhatsapp: contact.requester_whatsapp,
          requesterTelegram: contact.requester_telegram,
          requesterMonthlyRevenue: contact.requester_monthly_revenue,
          requesterMessage: contact.requester_message || '',
        });

        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'api-key': BREVO_API_KEY,
          },
          body: JSON.stringify({
            sender: { name: 'Exclu', email: 'noreply@exclu.at' },
            to: [{ email: contact.agency_profile_email }],
            replyTo: {
              email: contact.requester_email,
              name: contact.requester_name || '',
            },
            subject: `📩 New contact request — Exclu Directory`,
            htmlContent: emailHtml,
          }),
        });

        if (!brevoRes.ok) {
          console.error('Brevo forward email error:', await brevoRes.text());
        }
      } catch (emailErr) {
        console.error('Forward email error (non-blocking):', emailErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, status: newStatus }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
