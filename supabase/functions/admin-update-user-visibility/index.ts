import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, x-supabase-auth, content-type',
}

// Service role client — bypasses RLS for admin data operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify admin authentication via x-supabase-auth token
    const rawToken = req.headers.get('x-supabase-auth') ?? ''
    const token = rawToken.replace(/^Bearer\s+/i, '').trim()

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing authentication header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use anon-key client to verify the caller's JWT
    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: authError } = await supabaseAuthClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { user_id, profile_id, is_directory_visible, model_categories } = await req.json()

    if (!user_id && !profile_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: user_id or profile_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const updateData: any = {}
    if (typeof is_directory_visible === 'boolean') updateData.is_directory_visible = is_directory_visible
    if (Array.isArray(model_categories)) updateData.model_categories = model_categories

    if (Object.keys(updateData).length === 0) {
      return new Response(
        JSON.stringify({ error: 'No fields to update' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update creator_profiles directory visibility and/or categories
    let query = supabaseAdmin.from('creator_profiles').update(updateData)

    if (profile_id) {
      query = query.eq('id', profile_id)
    } else {
      query = query.eq('user_id', user_id).eq('is_active', true)
    }

    const { error: updateError } = await query

    if (updateError) {
      console.error('Error updating directory visibility:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update visibility' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
