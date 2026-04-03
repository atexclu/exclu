import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('PROJECT_URL') ?? Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey =
  Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://exclu.at';
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL/PROJECT_URL or SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY');
}

if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

// CORS: restrict to the main site URL + local dev origins instead of wildcard "*".
const normalizedSiteOrigin = siteUrl.replace(/\/$/, '');
const allowedOrigins = [
  normalizedSiteOrigin,
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:8084',
  'http://localhost:5173',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : normalizedSiteOrigin;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  };
}

// Lightweight in-memory rate limiting per IP
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // per IP per window
const ipHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const existing = ipHits.get(ip);

  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return false;
  }

  existing.count += 1;
  ipHits.set(ip, existing);
  return existing.count > RATE_LIMIT_MAX_REQUESTS;
}

interface UserOverviewPayload {
  profile: {
    id: string;
    display_name: string | null;
    handle: string | null;
    created_at: string | null;
    is_creator: boolean | null;
    country: string | null;
    stripe_connect_status: string | null;
    is_directory_visible: boolean | null;
  } | null;
  links: Array<{
    id: string;
    title: string | null;
    description: string | null;
    status: string | null;
    price_cents: number | null;
    created_at: string | null;
    published_at: string | null;
    storage_path: string | null;
    mime_type: string | null;
    previewUrl?: string | null;
    media: Array<{
      id: string;
      storage_path: string;
      mime_type: string | null;
      title: string | null;
      preview_url: string | null;
    }>;
  }>;
  assets: Array<{
    id: string;
    title: string | null;
    created_at: string | null;
    mime_type: string | null;
    preview_url: string | null;
  }>;
  sales: Array<{
    id: string;
    link_id: string | null;
    link_title: string | null;
    buyer_email: string | null;
    amount_cents: number | null;
    currency: string | null;
    status: string;
    created_at: string | null;
  }>;
  stripe: {
    status: string;
    disabled_reason: string | null;
    friendly_messages: string[];
    account_email: string | null;
    payout_country: string | null;
  } | null;
}

function mapRequirementKeyToMessage(key: string): string {
  if (key === 'business_profile.mcc') {
    return 'Select the business category for this account in Stripe.';
  }
  if (key === 'business_profile.url') {
    return 'Add a website or main social profile URL in Stripe.';
  }
  if (key.startsWith('business_profile')) {
    return 'Complete the business profile details in Stripe.';
  }

  if (key === 'external_account') {
    return 'Add or confirm the bank account where payouts will be sent.';
  }

  if (key.startsWith('representative.address')) {
    return 'Complete the address of the account holder (city, street, postal code).';
  }
  if (key.startsWith('representative.dob')) {
    return 'Add the date of birth of the account holder.';
  }
  if (key === 'representative.email') {
    return 'Add or confirm the email address of the account holder.';
  }
  if (key === 'representative.phone') {
    return 'Add or confirm the phone number of the account holder.';
  }
  if (key === 'representative.first_name' || key === 'representative.last_name') {
    return 'Complete the full name of the account holder.';
  }

  if (key === 'business_type') {
    return 'Specify whether this account is for an individual or a business.';
  }

  if (key === 'tos_acceptance.date' || key === 'tos_acceptance.ip') {
    return "Accept Stripe's terms of service in the onboarding flow.";
  }

  if (key.startsWith('individual.address')) {
    return 'Add or complete the personal address of the account holder.';
  }
  if (key.startsWith('individual.verification.document')) {
    return 'Upload a valid identity document for verification.';
  }
  if (key.startsWith('individual.email')) {
    return 'Confirm the personal email address in Stripe.';
  }
  if (key.startsWith('individual.phone')) {
    return 'Add or verify the phone number in Stripe.';
  }

  return 'Provide additional information requested by Stripe for this account.';
}

function detectMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const videoExts = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'wmv'];
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp'];

  if (videoExts.includes(ext)) return 'video/mp4'; // Default to mp4 for playback
  if (imageExts.includes(ext)) return 'image/jpeg'; // Default to jpeg
  if (ext === 'zip') return 'application/zip';
  return 'application/octet-stream';
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    'unknown';

  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the admin user from the Supabase access token passed via x-supabase-auth
    const rawToken = req.headers.get('x-supabase-auth') ?? '';
    const token = rawToken.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey);

    const {
      data: { user },
      error: userError,
    } = await supabaseAuthClient.auth.getUser(token);

    if (userError || !user) {
      console.error('Error resolving user in admin-get-user-overview', userError);
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ensure the caller is an admin according to the profiles table
    const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (adminProfileError) {
      console.error('Error loading admin profile in admin-get-user-overview', adminProfileError);
      return new Response(JSON.stringify({ error: 'Unable to verify admin status' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!adminProfile || adminProfile.is_admin !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    const targetUserId = body?.user_id as string | undefined;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'Missing user_id in request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load the target user's profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(
        'id, display_name, handle, created_at, is_creator, country, role, wallet_balance_cents, total_earned_cents, total_withdrawn_cents, bank_iban, bank_holder_name, bank_bic, payout_setup_complete, is_creator_subscribed',
      )
      .eq('id', targetUserId)
      .maybeSingle();

    if (profileError) {
      console.error('Error loading target profile in admin-get-user-overview', profileError);
      return new Response(JSON.stringify({ error: 'Failed to load user profile' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve the target user's auth email via the Admin API so we can
    // display it alongside Stripe status in the admin UI.
    let authEmail: string | null = null;
    try {
      const { data: authUser, error: authUserError } =
        await supabaseAdmin.auth.admin.getUserById(targetUserId);

      if (authUserError) {
        console.error('Error loading auth user in admin-get-user-overview', authUserError);
      } else {
        authEmail = authUser?.user?.email ?? null;
      }
    } catch (e) {
      console.error('Unexpected error loading auth user in admin-get-user-overview', e);
    }

    // Load a list of the target user's links (most recent first)
    const { data: linksData, error: linksError } = await supabaseAdmin
      .from('links')
      .select(`
        id, 
        slug,
        title,
        description,
        status, 
        show_on_profile,
        price_cents, 
        created_at, 
        storage_path, 
        mime_type,
        profile_id,
        link_media(
          asset_id,
          position,
          assets(id, title, storage_path, mime_type)
        )
      `)
      .eq('creator_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (linksError) {
      console.error('Error loading target links in admin-get-user-overview', linksError);
      return new Response(JSON.stringify({ error: 'Failed to load user links' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate signed URLs for link previews
    const links: Array<{
      id: string;
      title: string | null;
      description: string | null;
      status: string | null;
      price_cents: number | null;
      created_at: string | null;
      published_at: string | null;
      storage_path: string | null;
      mime_type: string | null;
      profile_id?: string | null;
      previewUrl?: string | null;
      media: Array<{
        id: string;
        storage_path: string;
        mime_type: string | null;
        title: string | null;
        preview_url: string | null;
      }>;
    }> = [];

    if (linksData && linksData.length > 0) {
      for (const link of linksData as any[]) {
        const primaryStoragePath = link.storage_path as string | null;
        const linkMedia = (link.link_media ?? []) as any[];

        // Sort link_media by position
        linkMedia.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

        const mediaItems: Array<{
          id: string;
          storage_path: string;
          mime_type: string | null;
          title: string | null;
          preview_url: string | null;
        }> = [];

        // Helper to sign and push
        const addMedia = async (id: string, path: string, mType: string | null, label: string) => {
          if (!path) return;
          try {
            // Clean path if it has leading bucket name (sometimes happens in legacy data)
            const cleanPath = path.startsWith('paid-content/') ? path.replace('paid-content/', '') : path;

            const { data: signed, error: signError } = await supabaseAdmin.storage
              .from('paid-content')
              .createSignedUrl(cleanPath, 60 * 60);

            if (signError) {
              console.warn(`[admin-get-user-overview] Failed to sign cleanPath ${cleanPath}:`, signError);

              // Fallback: try with original path if different
              if (cleanPath !== path) {
                const { data: signedOrig } = await supabaseAdmin.storage
                  .from('paid-content')
                  .createSignedUrl(path, 60 * 60);
                if (signedOrig?.signedUrl) {
                  mediaItems.push({
                    id,
                    storage_path: path,
                    mime_type: mType || detectMimeType(path),
                    title: label,
                    preview_url: signedOrig.signedUrl,
                  });
                  return;
                }
              }
            }

            mediaItems.push({
              id,
              storage_path: path,
              mime_type: mType || detectMimeType(path),
              title: label,
              preview_url: signed?.signedUrl ?? null,
            });
          } catch (e) {
            console.error(`[admin-get-user-overview] Error signing media ${id}:`, e);
          }
        };

        // 1. Add additional media from link_media
        for (const lm of linkMedia) {
          const asset = lm.assets;
          if (asset && asset.storage_path) {
            await addMedia(asset.id, asset.storage_path, asset.mime_type, asset.title);
          }
        }

        // 2. Fallback: if no link_media but primary storage_path exists (legacy links), add it
        if (mediaItems.length === 0 && primaryStoragePath) {
          await addMedia('primary', primaryStoragePath, link.mime_type, 'Primary Content');
        }

        links.push({
          id: link.id as string,
          title: (link.title as string | null) ?? null,
          description: (link.description as string | null) ?? null,
          status: (link.status as string | null) ?? null,
          price_cents: (link.price_cents as number | null) ?? null,
          created_at: (link.created_at as string | null) ?? null,
          published_at: (link.published_at as string | null) ?? null,
          storage_path: primaryStoragePath,
          mime_type: (link.mime_type as string | null) ?? mediaItems[0]?.mime_type ?? null,
          profile_id: (link.profile_id as string | null) ?? null,
          previewUrl: mediaItems[0]?.preview_url ?? null,
          media: mediaItems,
        });
      }
    }

    // Load a subset of the target user's content library assets with signed preview URLs.
    const { data: assets, error: assetsError } = await supabaseAdmin
      .from('assets')
      .select('id, title, created_at, storage_path, mime_type, is_public, profile_id')
      .eq('creator_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (assetsError) {
      console.error('Error loading target assets in admin-get-user-overview', assetsError);
    }

    const safeAssets: {
      id: string;
      title: string | null;
      created_at: string | null;
      mime_type: string | null;
      is_public?: boolean | null;
      profile_id?: string | null;
      preview_url: string | null;
    }[] = [];

    if (assets && assets.length > 0) {
      for (const asset of assets as any[]) {
        const storagePath = asset.storage_path as string | null;
        let previewUrl: string | null = null;

        if (storagePath) {
          try {
            const { data: signed, error: signError } = await supabaseAdmin.storage
              .from('paid-content')
              .createSignedUrl(storagePath, 60 * 60);

            if (signError) {
              console.error('Signed URL error for', storagePath, ':', signError.message);
            } else if (signed?.signedUrl) {
              previewUrl = signed.signedUrl;
            }
          } catch (e) {
            console.error('Exception generating signed URL for', cleanPath, ':', e);
          }
        } else {
          console.warn('Asset has no storage_path:', asset.id);
        }

        safeAssets.push({
          id: asset.id as string,
          title: (asset.title as string | null) ?? null,
          created_at: (asset.created_at as string | null) ?? null,
          mime_type: (asset.mime_type as string | null) ?? null,
          is_public: (asset.is_public as boolean | null) ?? false,
          profile_id: (asset.profile_id as string | null) ?? null,
          preview_url: previewUrl,
        });
      }
    }

    // Compute a simple sales history based on purchases of the target user's recent links.
    const linkTitleById = new Map<string, string | null>();
    for (const l of (links ?? []) as any[]) {
      if (l.id) {
        linkTitleById.set(l.id as string, (l.title as string | null) ?? null);
      }
    }

    let sales: {
      id: string;
      link_id: string | null;
      link_title: string | null;
      buyer_email: string | null;
      amount_cents: number | null;
      currency: string | null;
      status: string;
      created_at: string | null;
    }[] = [];

    const linkIds = Array.from(linkTitleById.keys());
    if (linkIds.length > 0) {
      const { data: purchases, error: purchasesError } = await supabaseAdmin
        .from('purchases')
        .select('id, link_id, buyer_email, amount_cents, currency, status, created_at')
        .in('link_id', linkIds)
        .order('created_at', { ascending: false })
        .limit(100);

      if (purchasesError) {
        console.error('Error loading purchases in admin-get-user-overview', purchasesError);
      } else {
        sales = (purchases ?? []).map((p: any) => {
          const lid = (p.link_id as string | null) ?? null;
          return {
            id: p.id as string,
            link_id: lid,
            link_title: lid ? linkTitleById.get(lid) ?? null : null,
            buyer_email: (p.buyer_email as string | null) ?? null,
            amount_cents: typeof p.amount_cents === 'number' ? (p.amount_cents as number) : null,
            currency: (p.currency as string | null) ?? null,
            status: (p.status as string) ?? 'unknown',
            created_at: (p.created_at as string | null) ?? null,
          };
        });
      }
    }

    // Load detailed Stripe Connect status for this creator, similar to stripe-connect-status.
    let stripeDetails: UserOverviewPayload['stripe'] = null;
    let accountEmail: string | null = authEmail;
    let payoutCountry: string | null = (profile as any)?.country ?? null;
    if (profile?.stripe_account_id) {
      try {
        const account = await stripe.accounts.retrieve(profile.stripe_account_id as string);
        const requirements = (account as any).requirements || {};
        const currentlyDue: string[] = requirements.currently_due || [];
        const pastDue: string[] = requirements.past_due || [];
        const pendingVerification: string[] = requirements.pending_verification || [];
        const disabledReason: string | null = requirements.disabled_reason || null;

        // Prefer the email/country returned by Stripe if available.
        if ((account as any).email) {
          accountEmail = (account as any).email as string;
        }
        if ((account as any).country) {
          payoutCountry = (account as any).country as string;
        }

        let status: 'pending' | 'restricted' | 'complete' = 'pending';
        if ((account as any).charges_enabled && (account as any).payouts_enabled) {
          status = 'complete';
        } else if (disabledReason) {
          status = 'restricted';
        }

        // Optionally sync DB status for this creator
        if (profile.stripe_connect_status !== status) {
          await supabaseAdmin
            .from('profiles')
            .update({ stripe_connect_status: status })
            .eq('id', targetUserId);
        }

        const allKeys = new Set<string>();
        [...currentlyDue, ...pastDue, ...pendingVerification].forEach((key) => allKeys.add(key));

        const messageSet = new Set<string>();
        const friendlyMessages: string[] = [];

        for (const key of Array.from(allKeys)) {
          const msg = mapRequirementKeyToMessage(key);
          if (!messageSet.has(msg)) {
            messageSet.add(msg);
            friendlyMessages.push(msg);
          }
        }

        stripeDetails = {
          status,
          disabled_reason: disabledReason,
          friendly_messages: friendlyMessages.slice(0, 6),
          account_email: accountEmail,
          payout_country: payoutCountry,
        };
      } catch (e) {
        console.error('Error loading Stripe account in admin-get-user-overview', e);
        stripeDetails = {
          status: profile.stripe_connect_status ?? 'unknown',
          disabled_reason: null,
          friendly_messages: [],
          account_email: accountEmail,
          payout_country: payoutCountry,
        };
      }
    } else {
      stripeDetails = {
        status: profile?.stripe_connect_status ?? 'no_account',
        disabled_reason: null,
        friendly_messages: [],
        account_email: authEmail,
        payout_country: (profile as any)?.country ?? null,
      };
    }

    // Fetch is_directory_visible from creator_profiles
    let isDirectoryVisible: boolean | null = true;
    {
      const { data: cpVis } = await supabaseAdmin
        .from('creator_profiles')
        .select('is_directory_visible')
        .eq('user_id', targetUserId)
        .eq('is_active', true)
        .maybeSingle();
      if (cpVis) {
        isDirectoryVisible = cpVis.is_directory_visible ?? true;
      }
    }

    // Fetch payouts for this user
    const { data: payoutsData } = await supabaseAdmin
      .from('payouts')
      .select('id, amount_cents, status, created_at, requested_at, processed_at')
      .eq('creator_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(20);

    const payload: UserOverviewPayload = {
      profile: profile
        ? {
          id: profile.id,
          display_name: profile.display_name ?? null,
          handle: profile.handle ?? null,
          created_at: profile.created_at ?? null,
          is_creator: profile.is_creator ?? null,
          country: profile.country ?? null,
          role: profile.role ?? null,
          is_directory_visible: isDirectoryVisible,
          is_creator_subscribed: profile.is_creator_subscribed ?? false,
          wallet_balance_cents: profile.wallet_balance_cents ?? 0,
          total_earned_cents: profile.total_earned_cents ?? 0,
          total_withdrawn_cents: profile.total_withdrawn_cents ?? 0,
          bank_iban: profile.bank_iban ?? null,
          bank_holder_name: profile.bank_holder_name ?? null,
          bank_bic: profile.bank_bic ?? null,
          payout_setup_complete: profile.payout_setup_complete ?? false,
        }
        : null,
      links: links,
      assets: safeAssets,
      sales,
      stripe: stripeDetails,
      payouts: payoutsData ?? [],
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error in admin-get-user-overview', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
