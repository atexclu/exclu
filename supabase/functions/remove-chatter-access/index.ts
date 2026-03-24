import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');
const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { creator_user_id } = await req.json();

    if (!creator_user_id) {
      return new Response(JSON.stringify({ error: 'Missing creator_user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chatterId = user.id;

    // 1. Get creator profile IDs for this creator
    const { data: creatorProfiles, error: profilesError } = await supabase
      .from('creator_profiles')
      .select('id')
      .eq('user_id', creator_user_id);

    if (profilesError) {
      console.error('Error fetching creator profiles:', profilesError);
      throw profilesError;
    }

    if (!creatorProfiles || creatorProfiles.length === 0) {
      return new Response(JSON.stringify({ error: 'Creator not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profileIds = creatorProfiles.map((p: any) => p.id);

    // 2. Delete all chatter_invitations for this chatter and these profiles
    const { error: deleteError } = await supabase
      .from('chatter_invitations')
      .delete()
      .eq('chatter_id', chatterId)
      .in('profile_id', profileIds);

    if (deleteError) {
      console.error('Error deleting chatter invitations:', deleteError);
      throw deleteError;
    }

    console.log(`Removed chatter ${chatterId} access to creator ${creator_user_id}`);

    // 3. Get creator and chatter info for email
    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('display_name, email')
      .eq('id', creator_user_id)
      .single();

    const { data: chatterProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', chatterId)
      .single();

    // 4. Send email notification to creator
    if (creatorProfile?.email && brevoApiKey && brevoSenderEmail) {
      const creatorName = creatorProfile.display_name || 'Creator';
      const chatterName = chatterProfile?.display_name || 'A chatter';
      const normalizedSiteUrl = siteUrl?.replace(/\/$/, '') || 'https://exclu.at';

      const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chatter access removed</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:26px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .button { display:inline-block; background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%); color:#020617 !important; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:600; font-size:15px; margin:8px 0 20px 0; box-shadow:0 6px 18px rgba(190,242,100,0.4); }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
  @media (max-width:480px) { .container { margin:0 10px; } .content { padding:20px; } .header { padding:20px 20px 16px 20px; } .header h1 { font-size:22px; } .button { padding:12px 24px; font-size:14px; } }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Chatter access removed 🔒</h1>
    </div>
    <div class="content">
      <p>Hey <strong>${creatorName}</strong>,</p>
      <p><strong>${chatterName}</strong> has removed their access to manage your conversations on <strong>Exclu</strong>.</p>
      <p>They will no longer be able to respond to messages or manage conversations on your behalf.</p>
      <p>If you'd like to invite them again or find a new chatter, you can do so from your dashboard:</p>
      <a href="${normalizedSiteUrl}/app/chat" class="button">Go to dashboard</a>
      <p style="margin-top:20px;font-size:13px;color:#94a3b8;">If you have any questions, feel free to reach out to our support team.</p>
    </div>
    <div class="footer">
      © 2025 Exclu — All rights reserved<br>
      <a href="${normalizedSiteUrl}">exclu</a> • <a href="${normalizedSiteUrl}/terms">Terms</a> • <a href="${normalizedSiteUrl}/privacy">Privacy</a>
    </div>
  </div>
</body>
</html>`;

      try {
        const emailPayload = JSON.stringify({
          sender: { email: brevoSenderEmail, name: brevoSenderName },
          to: [{ email: creatorProfile.email }],
          subject: `🔒 ${chatterName} removed their access to your account`,
          htmlContent: emailHtml,
        });

        const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
          body: emailPayload,
        });

        if (!emailResponse.ok) {
          console.error('Failed to send email:', await emailResponse.text());
        } else {
          console.log('Email notification sent to creator:', creatorProfile.email);
        }
      } catch (emailErr) {
        console.error('Error sending email (non-fatal):', emailErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in remove-chatter-access function:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
