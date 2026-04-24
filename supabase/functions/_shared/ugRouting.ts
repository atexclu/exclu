// supabase/functions/_shared/ugRouting.ts
//
// Resolves the per-MID credentials and endpoints for UG payments.
// Per UG Payment (2026-04-20) each MID ships its own full credential set:
//   QUICKPAY_TOKEN_INTL_3D / QUICKPAY_SITE_ID_INTL_3D / UGP_MID_INTL_3D / UGP_API_BEARER_TOKEN_INTL_3D
//   QUICKPAY_TOKEN_US_2D   / QUICKPAY_SITE_ID_US_2D   / UGP_MID_US_2D   / UGP_API_BEARER_TOKEN_US_2D
// During rollout, INTL_3D falls back to the legacy single-set names
// (QUICKPAY_TOKEN, QUICKPAY_SITE_ID, UGP_MERCHANT_ID, UGP_API_BEARER_TOKEN)
// so that existing prod secrets keep working without re-entry. Phase 7
// removes the fallback once the new names are set everywhere.
// ConfirmURL / ListenerURL / Member Postback URLs are pre-configured on the
// UG Payment side to point at our existing endpoints — no extra wiring here.

const US_2D_COUNTRIES = new Set(['US', 'CA']);

export type UgMidKey = 'us_2d' | 'intl_3d';

export interface UgMidCredentials {
  key: UgMidKey;
  quickPayToken: string;
  siteId: string;
  merchantId: string;
  oauthBearer: string;
}

export function routeMidForCountry(country: string | null | undefined): UgMidKey {
  if (country && US_2D_COUNTRIES.has(country.toUpperCase())) return 'us_2d';
  return 'intl_3d';
}

export function getMidCredentials(key: UgMidKey): UgMidCredentials {
  const prefix = key === 'us_2d' ? 'US_2D' : 'INTL_3D';
  // For INTL_3D only, fall back to the legacy single-MID env names so we
  // don't force re-entry of existing secrets. US_2D has no fallback — its
  // credentials live only under the *_US_2D suffix.
  const legacy = key === 'intl_3d';
  const creds = {
    key,
    quickPayToken: Deno.env.get(`QUICKPAY_TOKEN_${prefix}`) ?? (legacy ? Deno.env.get('QUICKPAY_TOKEN') ?? '' : ''),
    siteId: Deno.env.get(`QUICKPAY_SITE_ID_${prefix}`) ?? (legacy ? Deno.env.get('QUICKPAY_SITE_ID') ?? '' : ''),
    merchantId: Deno.env.get(`UGP_MID_${prefix}`) ?? (legacy ? Deno.env.get('UGP_MERCHANT_ID') ?? '' : ''),
    oauthBearer: Deno.env.get(`UGP_API_BEARER_TOKEN_${prefix}`) ?? (legacy ? Deno.env.get('UGP_API_BEARER_TOKEN') ?? '' : ''),
  };
  if (!creds.quickPayToken || !creds.siteId || !creds.merchantId) {
    throw new Error(`Missing UG credentials for MID ${key}`);
  }
  return creds;
}

export function getMidConfirmKey(key: UgMidKey): string {
  const env = key === 'us_2d' ? 'QUICKPAY_CONFIRM_KEY_US_2D' : 'QUICKPAY_CONFIRM_KEY_INTL_3D';
  const value = Deno.env.get(env) ?? Deno.env.get('QUICKPAY_CONFIRM_KEY') ?? '';
  if (!value) throw new Error(`Missing ${env}`);
  return value;
}

// Given an inbound callback SiteID, find the matching MID.
export function midFromSiteId(siteId: string): UgMidKey {
  const us2d = Deno.env.get('QUICKPAY_SITE_ID_US_2D') ?? '';
  return siteId && siteId === us2d ? 'us_2d' : 'intl_3d';
}
