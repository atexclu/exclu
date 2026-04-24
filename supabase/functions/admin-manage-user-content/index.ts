import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const brevoApiKey = Deno.env.get('BREVO_API_KEY')
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu'
const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://exclu.at').replace(/\/$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, x-supabase-auth, content-type',
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

function buildPhotoRequestEmail(profileLabel: string): string {
  const label = profileLabel ? ` for <strong>${profileLabel}</strong>` : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Profile photo update request</title>
<style>
  body { margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#e2e8f0; }
  .container { max-width:600px; margin:0 auto; background:linear-gradient(135deg,#020617 0%,#020617 40%,#0b1120 100%); border-radius:16px; border:1px solid #1e293b; box-shadow:0 12px 30px rgba(0,0,0,0.55); overflow:hidden; }
  .header { padding:28px 28px 18px 28px; border-bottom:1px solid #1e293b; }
  .header h1 { font-size:22px; color:#f9fafb; margin:0; line-height:1.3; font-weight:700; }
  .content { padding:26px 28px 30px 28px; }
  .content p { font-size:15px; line-height:1.7; color:#cbd5e1; margin:0 0 16px 0; }
  .content strong { color:#ffffff; font-weight:600; }
  .button { display:inline-block; background:linear-gradient(135deg,#bef264 0%,#a3e635 40%,#bbf7d0 100%); color:#020617 !important; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:600; font-size:15px; margin:20px 0; box-shadow:0 6px 18px rgba(190,242,100,0.4); }
  .footer { font-size:12px; color:#64748b; text-align:center; padding:18px; border-top:1px solid #1e293b; background-color:#020617; }
  .footer a { color:#a3e635; text-decoration:none; }
</style>
</head>
<body>
<div class="container">
  <div class="header"><h1>Profile photo update requested</h1></div>
  <div class="content">
    <p>Hello,</p>
    <p>Our team has reviewed your Exclu profile and is requesting that you update your profile photo${label}.</p>
    <p>Please log in and upload a new photo at your earliest convenience.</p>
    <p><a href="${siteUrl}/dashboard" class="button">Update my photo</a></p>
    <p>If you have any questions, feel free to reply to this email.</p>
    <p>The Exclu team</p>
  </div>
  <div class="footer"><a href="${siteUrl}">${siteUrl}</a></div>
</div>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const rawToken = req.headers.get('x-supabase-auth') ?? ''
    const token = rawToken.replace(/^Bearer\s+/i, '').trim()

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing authentication header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: authError } = await supabaseAuthClient.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    const { action } = body

    if (action === 'update_link_visibility') {
      const { link_id, show_on_profile } = body
      if (!link_id || typeof show_on_profile !== 'boolean') {
        return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { error } = await supabaseAdmin.from('links').update({ show_on_profile }).eq('id', link_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'update_asset_visibility') {
      const { asset_id, is_public } = body
      if (!asset_id || typeof is_public !== 'boolean') {
        return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { error } = await supabaseAdmin.from('assets').update({ is_public }).eq('id', asset_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'delete_asset') {
      const { asset_id } = body
      if (!asset_id) {
        return new Response(JSON.stringify({ error: 'Missing asset_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      // Soft-delete so any link_media / purchase still referencing this asset
      // keeps working. Hard delete + storage cleanup should go through a
      // separate purge path that first verifies no dependency exists.
      const { error } = await supabaseAdmin.from('assets').update({ deleted_at: new Date().toISOString() }).eq('id', asset_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'delete_avatar') {
      const { user_id, creator_profile_id } = body
      if (!user_id && !creator_profile_id) {
        return new Response(JSON.stringify({ error: 'Missing user_id or creator_profile_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (creator_profile_id) {
        const { error } = await supabaseAdmin.from('creator_profiles').update({ avatar_url: null }).eq('id', creator_profile_id)
        if (error) throw error
      } else {
        const { error } = await supabaseAdmin.from('profiles').update({ avatar_url: null }).eq('id', user_id)
        if (error) throw error
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'request_photo_change') {
      const { user_id, profile_display_name } = body
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (!brevoApiKey || !brevoSenderEmail) {
        return new Response(JSON.stringify({ error: 'Email configuration missing' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(user_id)
      if (authUserError || !authUserData?.user?.email) {
        return new Response(JSON.stringify({ error: 'Unable to find user email' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const userEmail = authUserData.user.email
      const profileLabel = profile_display_name ?? ''
      const subjectLabel = profileLabel ? ` for "${profileLabel}"` : ''

      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': brevoApiKey },
        body: JSON.stringify({
          sender: { email: brevoSenderEmail, name: brevoSenderName },
          to: [{ email: userEmail }],
          subject: `Action required: please update your profile photo${subjectLabel}`,
          htmlContent: buildPhotoRequestEmail(profileLabel),
        }),
      })

      if (!brevoResponse.ok) {
        const text = await brevoResponse.text()
        console.error('Brevo error in request_photo_change:', text)
        return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
