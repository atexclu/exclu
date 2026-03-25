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

function buildAdminNotificationEmail(params: {
  agencyName: string;
  isCreatorAgency: boolean;
  requesterEmail: string;
  requesterName: string;
  requesterCompany?: string | null;
  requesterWhatsapp?: string | null;
  requesterTelegram?: string | null;
  requesterMonthlyRevenue?: string | null;
  requesterMessage: string;
}): string {
  const {
    agencyName,
    isCreatorAgency,
    requesterEmail,
    requesterName,
    requesterCompany,
    requesterWhatsapp,
    requesterTelegram,
    requesterMonthlyRevenue,
    requesterMessage,
  } = params;

  const typeLabel = isCreatorAgency
    ? '🧑‍💼 Creator agency — <strong>approval required before forwarding</strong>'
    : '🏢 Directory agency — mark as processed when handled';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Contact Request</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#020617;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background:#020617;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" style="max-width:600px;width:100%;border-collapse:collapse;background:#0f172a;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.3);">

        <tr><td style="padding:36px 40px 24px;text-align:center;background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#CFFF16;letter-spacing:-0.5px;">📩 New Contact Request</h1>
          <p style="margin:10px 0 0;font-size:13px;color:#64748b;">${typeLabel}</p>
        </td></tr>

        <tr><td style="padding:28px 40px;color:#e2e8f0;">
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#cbd5e1;">
            New contact request for <strong style="color:#CFFF16;">${esc(agencyName)}</strong>.
            ${isCreatorAgency ? '<br/><strong style="color:#fbbf24;">Action required:</strong> review and approve or reject this request in the admin panel.' : ''}
          </p>

          <div style="background:#1e293b;border-left:4px solid #CFFF16;padding:20px;margin:16px 0;border-radius:8px;">
            <p style="margin:0 0 10px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Contact Details</p>
            <p style="margin:0 0 6px;font-size:14px;color:#e2e8f0;"><strong>Name:</strong> ${esc(requesterName)}</p>
            <p style="margin:0 0 6px;font-size:14px;color:#e2e8f0;"><strong>Email:</strong> ${esc(requesterEmail)}</p>
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
            <a href="https://exclu.at/admin/users?tab=agencies"
               style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,#bef264 0%,#a3e635 100%);color:#020617;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(190,242,100,.3);">
              ${isCreatorAgency ? 'Review &amp; Approve in Admin →' : 'Mark as Processed in Admin →'}
            </a>
          </div>
        </td></tr>

        <tr><td style="padding:20px 40px;text-align:center;background:#0a0f1a;border-top:1px solid #1e293b;">
          <p style="margin:0;font-size:12px;color:#64748b;">Automated notification from the Exclu admin system.</p>
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
    const {
      agencyId,
      requesterEmail,
      requesterName,
      requesterCompany,
      requesterWhatsapp,
      requesterTelegram,
      requesterMonthlyRevenue,
      requesterMessage,
    } = body as {
      agencyId: string;
      requesterEmail: string;
      requesterName: string;
      requesterCompany?: string;
      requesterWhatsapp?: string;
      requesterTelegram?: string;
      requesterMonthlyRevenue?: string;
      requesterMessage: string;
    };

    // Validate required fields
    if (!agencyId || !requesterEmail?.trim() || !requesterName?.trim() || !requesterMessage?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: agencyId, requesterEmail, requesterName, requesterMessage' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(requesterEmail.trim())) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isCreatorAgency = agencyId.startsWith('profile-');
    let agencyName = '';
    let agencyProfileEmail: string | null = null;
    let directoryAgencyId: string | null = null;
    let profileAgencyId: string | null = null;

    if (isCreatorAgency) {
      // Profile-based agency: resolve name and auth email
      const profileId = agencyId.replace('profile-', '');
      profileAgencyId = profileId;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, agency_name')
        .eq('id', profileId)
        .single();

      if (!profile) {
        return new Response(
          JSON.stringify({ error: 'Agency not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      agencyName = profile.agency_name || 'Unknown Agency';

      // Resolve the creator's auth email for approval forwarding
      const { data: { user } } = await supabase.auth.admin.getUserById(profileId);
      agencyProfileEmail = user?.email || null;

    } else {
      // Directory agency
      directoryAgencyId = agencyId;

      const { data: agency } = await supabase
        .from('directory_agencies')
        .select('id, name')
        .eq('id', agencyId)
        .single();

      if (!agency) {
        return new Response(
          JSON.stringify({ error: 'Agency not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      agencyName = agency.name;
    }

    // Insert contact request
    const { error: insertError } = await supabase
      .from('agency_claim_requests')
      .insert({
        agency_id: directoryAgencyId,
        profile_agency_id: profileAgencyId,
        agency_name: agencyName,
        requester_email: requesterEmail.trim(),
        requester_name: requesterName.trim(),
        requester_company: requesterCompany?.trim() || null,
        requester_whatsapp: requesterWhatsapp?.trim() || null,
        requester_telegram: requesterTelegram?.trim() || null,
        requester_monthly_revenue: requesterMonthlyRevenue?.trim() || null,
        requester_message: requesterMessage.trim(),
        agency_profile_email: agencyProfileEmail,
        is_creator_agency: isCreatorAgency,
        status: 'pending',
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save contact request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send admin notification email (non-blocking)
    try {
      const emailHtml = buildAdminNotificationEmail({
        agencyName,
        isCreatorAgency,
        requesterEmail: requesterEmail.trim(),
        requesterName: requesterName.trim(),
        requesterCompany: requesterCompany?.trim() || null,
        requesterWhatsapp: requesterWhatsapp?.trim() || null,
        requesterTelegram: requesterTelegram?.trim() || null,
        requesterMonthlyRevenue: requesterMonthlyRevenue?.trim() || null,
        requesterMessage: requesterMessage.trim(),
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
          to: [{ email: 'atexclu@gmail.com', name: 'Exclu Admin' }],
          subject: `📩 Contact request: ${agencyName}`,
          htmlContent: emailHtml,
        }),
      });

      if (!brevoRes.ok) {
        console.error('Brevo error:', await brevoRes.text());
      }
    } catch (emailErr) {
      console.error('Email send error (non-blocking):', emailErr);
    }

    return new Response(
      JSON.stringify({ success: true }),
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
