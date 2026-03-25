import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClaimRequest {
  agencyId: string;
  requesterEmail: string;
  requesterName?: string;
  requesterCompany?: string;
  requesterMessage?: string;
}

async function sendAdminNotificationEmail(
  agencyName: string,
  requesterEmail: string,
  requesterName: string | null,
  requesterCompany: string | null,
  requesterMessage: string | null
) {
  const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Agency Claim Request</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #020617;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #020617;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #0f172a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #CFFF16; letter-spacing: -0.5px;">
                🏢 New Agency Claim Request
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 30px 40px; color: #e2e8f0;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #cbd5e1;">
                A new claim request has been submitted for the agency <strong style="color: #CFFF16;">${agencyName}</strong>.
              </p>

              <div style="background-color: #1e293b; border-left: 4px solid #CFFF16; padding: 20px; margin: 20px 0; border-radius: 8px;">
                <p style="margin: 0 0 12px; font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                  Requester Details
                </p>
                <p style="margin: 0 0 8px; font-size: 15px; color: #e2e8f0;">
                  <strong>Email:</strong> ${requesterEmail}
                </p>
                ${requesterName ? `<p style="margin: 0 0 8px; font-size: 15px; color: #e2e8f0;">
                  <strong>Name:</strong> ${requesterName}
                </p>` : ''}
                ${requesterCompany ? `<p style="margin: 0 0 8px; font-size: 15px; color: #e2e8f0;">
                  <strong>Company:</strong> ${requesterCompany}
                </p>` : ''}
              </div>

              ${requesterMessage ? `
              <div style="background-color: #1e293b; padding: 20px; margin: 20px 0; border-radius: 8px;">
                <p style="margin: 0 0 12px; font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                  Message
                </p>
                <p style="margin: 0; font-size: 15px; color: #e2e8f0; line-height: 1.6; white-space: pre-wrap;">
                  ${requesterMessage}
                </p>
              </div>
              ` : ''}

              <div style="margin: 30px 0; text-align: center;">
                <a href="https://exclu.at/admin/users?tab=users" 
                   style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #bef264 0%, #a3e635 100%); color: #020617; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 12px rgba(190, 242, 100, 0.3); transition: all 0.2s;">
                  Review in Admin Panel
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; background-color: #0a0f1a; border-top: 1px solid #1e293b;">
              <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.6;">
                This is an automated notification from Exclu Admin System.<br/>
                Please review and approve/reject this claim request.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: 'Exclu', email: 'noreply@exclu.at' },
      to: [{ email: 'atexclu@gmail.com', name: 'Exclu Admin' }],
      subject: `🏢 New Agency Claim Request: ${agencyName}`,
      htmlContent: emailHtml,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Brevo email error:', errorText);
    throw new Error(`Failed to send admin notification email: ${errorText}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: ClaimRequest = await req.json();

    const { agencyId, requesterEmail, requesterName, requesterCompany, requesterMessage } = body;

    // Validate required fields
    if (!agencyId || !requesterEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: agencyId and requesterEmail' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(requesterEmail)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get agency details
    const { data: agency, error: agencyError } = await supabase
      .from('directory_agencies')
      .select('id, name, slug, is_claimed, claim_pending')
      .eq('id', agencyId)
      .single();

    if (agencyError || !agency) {
      return new Response(
        JSON.stringify({ error: 'Agency not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already claimed
    if (agency.is_claimed) {
      return new Response(
        JSON.stringify({ error: 'This agency has already been claimed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if there's already a pending claim
    if (agency.claim_pending) {
      return new Response(
        JSON.stringify({ error: 'There is already a pending claim request for this agency' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create claim request
    const { data: claimRequest, error: claimError } = await supabase
      .from('agency_claim_requests')
      .insert({
        agency_id: agencyId,
        requester_email: requesterEmail,
        requester_name: requesterName || null,
        requester_company: requesterCompany || null,
        requester_message: requesterMessage || null,
        status: 'pending',
      })
      .select()
      .single();

    if (claimError) {
      console.error('Error creating claim request:', claimError);
      return new Response(
        JSON.stringify({ error: 'Failed to create claim request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update agency to mark claim as pending
    const { error: updateError } = await supabase
      .from('directory_agencies')
      .update({
        claim_pending: true,
        claim_requested_by_email: requesterEmail,
        claim_requested_at: new Date().toISOString(),
      })
      .eq('id', agencyId);

    if (updateError) {
      console.error('Error updating agency:', updateError);
      // Don't fail the request, claim is already created
    }

    // Send notification email to admin
    try {
      await sendAdminNotificationEmail(
        agency.name,
        requesterEmail,
        requesterName || null,
        requesterCompany || null,
        requesterMessage || null
      );
    } catch (emailError) {
      console.error('Error sending notification email:', emailError);
      // Don't fail the request, claim is already created
    }

    return new Response(
      JSON.stringify({
        success: true,
        claimRequest,
        message: 'Claim request submitted successfully. An admin will review it shortly.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
