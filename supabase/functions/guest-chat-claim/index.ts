import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { session_token, user_id } = await req.json();

    if (!session_token || !user_id) {
      return new Response(JSON.stringify({ error: 'session_token and user_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the guest session exists
    const { data: guestSession, error: sessionError } = await supabase
      .from('guest_sessions')
      .select('id')
      .eq('session_token', session_token)
      .single();

    if (sessionError || !guestSession) {
      return new Response(JSON.stringify({ error: 'Invalid session token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the user exists
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(user_id);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refuse to claim if the claimer's own account has been soft-deleted
    // (defensive — auth ban should already block this path, but guard anyway).
    {
      const { data: claimerActive } = await supabase.rpc('is_user_active', {
        check_user_id: user_id,
      });
      if (!claimerActive) {
        return new Response(JSON.stringify({ error: 'Account unavailable' }), {
          status: 410,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Find all guest conversations for this session
    const { data: guestConvs } = await supabase
      .from('conversations')
      .select('id, profile_id')
      .eq('guest_session_id', guestSession.id);

    if (!guestConvs || guestConvs.length === 0) {
      return new Response(JSON.stringify({ claimed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let claimed = 0;

    for (const conv of guestConvs) {
      // Skip conversations whose creator profile has been soft-deleted.
      // We don't fail the whole claim — other conversations may still be valid.
      if (conv.profile_id) {
        const { data: cp } = await supabase
          .from('creator_profiles')
          .select('deleted_at')
          .eq('id', conv.profile_id)
          .maybeSingle();
        if (!cp || cp.deleted_at) {
          continue;
        }
      }

      // Check if the user already has a conversation with this profile
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('fan_id', user_id)
        .eq('profile_id', conv.profile_id)
        .maybeSingle();

      if (existingConv) {
        // User already has a conversation with this creator — merge messages
        // Move guest messages into the existing conversation
        await supabase
          .from('messages')
          .update({
            conversation_id: existingConv.id,
            sender_id: user_id,
            guest_session_id: null,
          })
          .eq('conversation_id', conv.id)
          .not('sender_id', 'is', null)  // Only update guest messages (sender_id IS NULL)
          .is('guest_session_id', guestSession.id);

        // Also update messages where sender_id is null (guest messages)
        await supabase
          .from('messages')
          .update({
            conversation_id: existingConv.id,
            sender_id: user_id,
            guest_session_id: null,
          })
          .eq('conversation_id', conv.id)
          .is('sender_id', null);

        // Delete the now-empty guest conversation
        await supabase
          .from('conversations')
          .delete()
          .eq('id', conv.id);
      } else {
        // Migrate: set fan_id and clear guest_session_id
        await supabase
          .from('conversations')
          .update({
            fan_id: user_id,
            guest_session_id: null,
          })
          .eq('id', conv.id);

        // Update all guest messages in this conversation
        await supabase
          .from('messages')
          .update({
            sender_id: user_id,
            guest_session_id: null,
          })
          .eq('conversation_id', conv.id)
          .eq('guest_session_id', guestSession.id);
      }

      claimed++;
    }

    // Clean up the guest session
    await supabase
      .from('guest_sessions')
      .delete()
      .eq('id', guestSession.id);

    return new Response(JSON.stringify({ claimed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('guest-chat-claim error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
