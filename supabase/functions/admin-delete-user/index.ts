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
    const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    console.log(`[admin-delete-user] Starting full deletion for user: ${user_id}`);

    // --- 1. COLLECT STORAGE PATHS BEFORE DELETING DB RECORDS ---

    // Get all links and their storage paths
    const { data: userLinks } = await supabase
      .from('links')
      .select('id, storage_path')
      .eq('creator_id', user_id);

    // Get all assets and their storage paths
    const { data: userAssets } = await supabase
      .from('assets')
      .select('id, storage_path')
      .eq('creator_id', user_id);

    // --- 2. DELETE STORAGE FILES ---

    // Cleanup Avatars
    const { data: avatarFiles } = await supabase.storage.from('avatars').list(`${user_id}/`);
    if (avatarFiles && avatarFiles.length > 0) {
      const paths = avatarFiles.map(f => `${user_id}/${f.name}`);
      await supabase.storage.from('avatars').remove(paths);
      console.log(`[admin-delete-user] Deleted files from avatars bucket`);
    }

    // Cleanup Paid Content
    // First, delete specific files from links and assets (to handle subfolders)
    const paidContentPathsToClear: string[] = [];
    userLinks?.forEach(l => { if (l.storage_path) paidContentPathsToClear.push(l.storage_path); });
    userAssets?.forEach(a => { if (a.storage_path) paidContentPathsToClear.push(a.storage_path); });

    if (paidContentPathsToClear.length > 0) {
      await supabase.storage.from('paid-content').remove(paidContentPathsToClear);
      console.log(`[admin-delete-user] Deleted specific files from paid-content bucket`);
    }

    // Also try to list top-level files in user folder
    const { data: pcTopFiles } = await supabase.storage.from('paid-content').list(`${user_id}/`);
    if (pcTopFiles && pcTopFiles.length > 0) {
      const paths = pcTopFiles.map(f => `${user_id}/${f.name}`);
      await supabase.storage.from('paid-content').remove(paths);
      console.log(`[admin-delete-user] Deleted top-level files from paid-content bucket`);
    }

    // Cleanup Public Content
    const { data: pubFiles } = await supabase.storage.from('public-content').list(`${user_id}/`);
    if (pubFiles && pubFiles.length > 0) {
      const paths = pubFiles.map(f => `${user_id}/${f.name}`);
      await supabase.storage.from('public-content').remove(paths);
      console.log(`[admin-delete-user] Deleted files from public-content bucket`);
    }

    // --- 3. DATABASE CLEANUP (Order to satisfy foreign keys) ---

    // Define table deletions in order
    // Note: Some tables might have ON DELETE CASCADE, but explicit delete is safer.

    const tablesToDelete = [
      { name: 'link_media', column: 'link_id', in_links: true },
      { name: 'sales', column: 'creator_id' },
      { name: 'purchases', column: 'buyer_id' },
      { name: 'payouts', column: 'creator_id' },
      { name: 'profile_analytics', column: 'profile_id', in_profiles: true },
      { name: 'links', column: 'creator_id' },
      { name: 'assets', column: 'creator_id' },
      { name: 'agency_members', column: 'chatter_user_id' }, // Delete where user is chatter
      { name: 'agency_members', column: 'agency_user_id' },  // Delete where user is agency owner
      { name: 'agencies', column: 'user_id' },
      { name: 'creator_profiles', column: 'user_id' },
      { name: 'user_roles', column: 'user_id' },
      { name: 'referrals', column: 'referred_user_id' },
      { name: 'affiliate_payouts', column: 'affiliate_id', in_affiliates: true },
      { name: 'affiliates', column: 'user_id' },
      { name: 'profiles', column: 'id' },
    ];

    for (const table of tablesToDelete) {
      try {
        if (table.in_links) {
          if (userLinks && userLinks.length > 0) {
            const linkIds = userLinks.map(l => l.id);
            await supabase.from(table.name).delete().in(table.column, linkIds);
          }
        } else if (table.in_profiles) {
          // Get creator profiles first
          const { data: cps } = await supabase.from('creator_profiles').select('id').eq('user_id', user_id);
          if (cps && cps.length > 0) {
            const cpIds = cps.map(p => p.id);
            await supabase.from(table.name).delete().in(table.column, cpIds);
          }
        } else if (table.in_affiliates) {
          const { data: affs } = await supabase.from('affiliates').select('id').eq('user_id', user_id);
          if (affs && affs.length > 0) {
            const affIds = affs.map(a => a.id);
            await supabase.from(table.name).delete().in(table.column, affIds);
          }
        } else {
          await supabase.from(table.name).delete().eq(table.column, user_id);
        }
      } catch (err) {
        console.warn(`[admin-delete-user] Ignored error for table ${table.name}:`, err);
      }
    }

    // --- 4. AUTH USER DELETION ---
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user_id);
    if (deleteUserError) {
      console.error('[admin-delete-user] Error deleting auth user:', deleteUserError);
      return new Response(
        JSON.stringify({
          error: 'Failed to delete user from auth. Foreign key constraints might still be active.',
          details: deleteUserError
        }),
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
