import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Get the admin user from the Supabase access token passed via x-supabase-auth
    const rawToken = req.headers.get('x-supabase-auth') ?? '';
    const token = rawToken.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user: adminUser },
      error: authError,
    } = await supabaseAuthClient.auth.getUser(token);
    if (authError || !adminUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', adminUser.id)
      .single();

    if (!adminProfile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-delete-user] Starting deletion for user: ${user_id}`);

    // 1. Delete storage files
    // Delete from avatars bucket
    const { data: avatarFiles } = await supabase.storage
      .from('avatars')
      .list(`${user_id}/`);
    
    if (avatarFiles && avatarFiles.length > 0) {
      const avatarPaths = avatarFiles.map(file => `${user_id}/${file.name}`);
      await supabase.storage.from('avatars').remove(avatarPaths);
      console.log(`[admin-delete-user] Deleted ${avatarPaths.length} files from avatars bucket`);
    }

    // Delete from paid-content bucket
    const { data: paidContentFiles } = await supabase.storage
      .from('paid-content')
      .list(`${user_id}/`);
    
    if (paidContentFiles && paidContentFiles.length > 0) {
      const paidContentPaths = paidContentFiles.map(file => `${user_id}/${file.name}`);
      await supabase.storage.from('paid-content').remove(paidContentPaths);
      console.log(`[admin-delete-user] Deleted ${paidContentPaths.length} files from paid-content bucket`);
    }

    // Delete from public-content bucket
    const { data: publicContentFiles } = await supabase.storage
      .from('public-content')
      .list(`${user_id}/`);
    
    if (publicContentFiles && publicContentFiles.length > 0) {
      const publicContentPaths = publicContentFiles.map(file => `${user_id}/${file.name}`);
      await supabase.storage.from('public-content').remove(publicContentPaths);
      console.log(`[admin-delete-user] Deleted ${publicContentPaths.length} files from public-content bucket`);
    }

    // 2. Delete database records (in order to respect foreign key constraints)
    
    // Delete sales (references creator_links)
    const { error: salesError } = await supabase
      .from('sales')
      .delete()
      .eq('creator_id', user_id);
    if (salesError) console.error('[admin-delete-user] Error deleting sales:', salesError);

    // Delete purchases (references creator_links)
    const { error: purchasesError } = await supabase
      .from('purchases')
      .delete()
      .eq('buyer_id', user_id);
    if (purchasesError) console.error('[admin-delete-user] Error deleting purchases:', purchasesError);

    // Delete creator_links
    const { error: linksError } = await supabase
      .from('creator_links')
      .delete()
      .eq('creator_id', user_id);
    if (linksError) console.error('[admin-delete-user] Error deleting creator_links:', linksError);

    // Delete creator_assets
    const { error: assetsError } = await supabase
      .from('creator_assets')
      .delete()
      .eq('creator_id', user_id);
    if (assetsError) console.error('[admin-delete-user] Error deleting creator_assets:', assetsError);

    // Delete public_content
    const { error: publicContentError } = await supabase
      .from('public_content')
      .delete()
      .eq('creator_id', user_id);
    if (publicContentError) console.error('[admin-delete-user] Error deleting public_content:', publicContentError);

    // Delete profile
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user_id);
    if (profileError) console.error('[admin-delete-user] Error deleting profile:', profileError);

    // 3. Delete auth user (this will cascade delete any remaining auth-related data)
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user_id);
    if (deleteUserError) {
      console.error('[admin-delete-user] Error deleting auth user:', deleteUserError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user from auth', details: deleteUserError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-delete-user] Successfully deleted user: ${user_id}`);

    return new Response(
      JSON.stringify({ success: true, message: 'User and all associated data deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[admin-delete-user] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
