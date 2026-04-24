export type UgMidKey = 'us_2d' | 'intl_3d';

const US_2D_COUNTRIES: ReadonlySet<string> = new Set(['US', 'CA']);

/** Returns the MID key to use for this country. Falls back to 3D if unknown. */
export function routeMidForCountry(countryCode: string | null | undefined): UgMidKey {
  if (countryCode && US_2D_COUNTRIES.has(countryCode.toUpperCase())) {
    return 'us_2d';
  }
  return 'intl_3d';
}

export function midKeyToLabel(key: UgMidKey): string {
  return key === 'us_2d' ? 'US/CA 2D' : 'International 3DS';
}
