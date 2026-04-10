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
    const { session_token, conversation_id, after_id } = await req.json();

    if (!session_token || !conversation_id) {
      return new Response(JSON.stringify({ error: 'session_token and conversation_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify session token
    const { data: session, error: sessionError } = await supabase
      .from('guest_sessions')
      .select('id')
      .eq('session_token', session_token)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: 'Invalid session token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the conversation belongs to this guest session
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversation_id)
      .eq('guest_session_id', session.id)
      .single();

    if (!conv) {
      return new Response(JSON.stringify({ error: 'Conversation not found or not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch messages — optionally after a specific message ID (for polling)
    let query = supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (after_id) {
      // Get the created_at of the reference message to fetch only newer ones
      const { data: refMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', after_id)
        .single();

      if (refMsg) {
        query = query.gt('created_at', refMsg.created_at);
      }
    }

    const { data: messages, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch messages: ${fetchError.message}`);
    }

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

    return new Response(JSON.stringify({ messages: msgs }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('guest-chat-messages error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
