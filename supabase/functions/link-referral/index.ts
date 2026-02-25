import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl!, supabaseServiceRoleKey!);

const normalizedSiteOrigin = siteUrl.replace(/\/$/, '');
const allowedOrigins = [
    normalizedSiteOrigin,
    'http://localhost:8080',
    'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') ?? '';
    const allowedOrigin = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
}

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { referral_code, referred_user_id } = body;

        if (!referral_code || !referred_user_id) {
            return new Response(JSON.stringify({ error: 'Missing referral_code or referred_user_id' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Find the referrer by their referral_code
        const { data: referrerProfile, error: referrerError } = await supabase
            .from('profiles')
            .select('id, referral_code')
            .eq('referral_code', referral_code)
            .maybeSingle();

        if (referrerError || !referrerProfile) {
            console.warn('[link-referral] Referral code not found:', referral_code);
            return new Response(JSON.stringify({ error: 'Referral code not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Prevent self-referral
        if (referrerProfile.id === referred_user_id) {
            return new Response(JSON.stringify({ error: 'Self-referral not allowed' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Check if the referred user already has a referral (idempotency)
        const { data: existingReferral } = await supabase
            .from('referrals')
            .select('id')
            .eq('referred_id', referred_user_id)
            .maybeSingle();

        if (existingReferral) {
            console.log('[link-referral] User already referred, skipping:', referred_user_id);
            return new Response(JSON.stringify({ success: true, skipped: true }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Insert the referral record
        const { error: insertError } = await supabase
            .from('referrals')
            .insert({
                referrer_id: referrerProfile.id,
                referred_id: referred_user_id,
                status: 'pending',
                commission_earned_cents: 0,
            });

        if (insertError) {
            console.error('[link-referral] Insert error:', insertError);
            return new Response(JSON.stringify({ error: 'Failed to create referral record' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Update referred user's profile with the referrer's ID
        await supabase
            .from('profiles')
            .update({ referred_by: referrerProfile.id })
            .eq('id', referred_user_id);

        console.log('[link-referral] Successfully linked referral:', {
            referrer: referrerProfile.id,
            referred: referred_user_id,
        });

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[link-referral] Unexpected error:', message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
