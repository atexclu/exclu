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
    const { session_token, conversation_id, content, content_type } = await req.json();

    if (!session_token || !conversation_id) {
      return new Response(JSON.stringify({ error: 'session_token and conversation_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const trimmedContent = (content || '').trim();
    if (!trimmedContent && (!content_type || content_type === 'text')) {
      return new Response(JSON.stringify({ error: 'Message content is required' }), {
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
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('id, profile_id')
      .eq('id', conversation_id)
      .eq('guest_session_id', session.id)
      .single();

    if (convError || !conv) {
      return new Response(JSON.stringify({ error: 'Conversation not found or not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert the message
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        sender_type: 'fan',
        sender_id: null,
        guest_session_id: session.id,
        content: trimmedContent || null,
        content_type: content_type || 'text',
      })
      .select('*')
      .single();

    if (insertError) {
      throw new Error(`Failed to send message: ${insertError.message}`);
    }

    // Update conversation metadata
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: trimmedContent ? trimmedContent.slice(0, 120) : '📎 Media',
        is_read: false,
      })
      .eq('id', conversation_id);

    // Update guest session last_active_at
    await supabase
      .from('guest_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', session.id);

    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('guest-chat-send error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
