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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-guest-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { profile_id, session_token, display_name } = await req.json();

    if (!profile_id) {
      return new Response(JSON.stringify({ error: 'profile_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the profile exists and has chat enabled
    const { data: profile, error: profileError } = await supabase
      .from('creator_profiles')
      .select('id, chat_enabled, display_name, avatar_url, deleted_at')
      .eq('id', profile_id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Block chat init if the creator profile has been soft-deleted (410 Gone).
    // soft-delete cascades deleted_at to creator_profiles.
    if (profile.deleted_at) {
      return new Response(JSON.stringify({ error: 'Creator unavailable' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile.chat_enabled) {
      return new Response(JSON.stringify({ error: 'Chat is not enabled for this creator' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let guestSession: { id: string; session_token: string };

    // If session_token is provided, try to resume the existing session
    if (session_token) {
      const { data: existing } = await supabase
        .from('guest_sessions')
        .select('id, session_token')
        .eq('session_token', session_token)
        .single();

      if (existing) {
        guestSession = existing;
        // Update last_active_at
        await supabase
          .from('guest_sessions')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        // Token is invalid/expired — create a new session
        const { data: newSession, error: createError } = await supabase
          .from('guest_sessions')
          .insert({ display_name: display_name || 'Guest' })
          .select('id, session_token')
          .single();

        if (createError || !newSession) {
          throw new Error('Failed to create guest session');
        }
        guestSession = newSession;
      }
    } else {
      // Create a new guest session
      const { data: newSession, error: createError } = await supabase
        .from('guest_sessions')
        .insert({ display_name: display_name || 'Guest' })
        .select('id, session_token')
        .single();

      if (createError || !newSession) {
        throw new Error('Failed to create guest session');
      }
      guestSession = newSession;
    }

    // Find or create conversation for this guest + profile
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('guest_session_id', guestSession.id)
      .eq('profile_id', profile_id)
      .maybeSingle();

    let conversationId: string;

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          guest_session_id: guestSession.id,
          profile_id,
          status: 'unclaimed',
          is_read: false,
        })
        .select('id')
        .single();

      if (convError || !newConv) {
        throw new Error('Failed to create conversation');
      }
      conversationId = newConv.id;
    }

    // Fetch existing messages for this conversation
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(100);

    // Enrich messages with link data for paid_content
    const msgs = messages ?? [];
    const paidContentIds = [...new Set(msgs.filter((m: any) => m.paid_content_id).map((m: any) => m.paid_content_id))];
    if (paidContentIds.length > 0) {
      const { data: links } = await supabase
        .from('links')
        .select('id, title, slug, price_cents')
        .in('id', paidContentIds);
      const linkMap = new Map((links ?? []).map((l: any) => [l.id, l]));
      for (const msg of msgs) {
        if ((msg as any).paid_content_id && linkMap.has((msg as any).paid_content_id)) {
          (msg as any).link = linkMap.get((msg as any).paid_content_id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        session_token: guestSession.session_token,
        conversation_id: conversationId,
        messages: msgs,
        creator: {
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('guest-chat-init error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
