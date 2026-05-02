/**
 * Country code → display name. Used by the public directory pages and the
 * admin curation page so a creator's `country` ISO-2 code can be rendered
 * legibly ("US" → "United States") in dropdowns, filters and OG previews.
 */
export const COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AR: 'Argentina', AU: 'Australia',
  AT: 'Austria', BE: 'Belgium', BR: 'Brazil', CA: 'Canada', CL: 'Chile',
  CN: 'China', CO: 'Colombia', HR: 'Croatia', CZ: 'Czech Republic', DK: 'Denmark',
  EG: 'Egypt', FI: 'Finland', FR: 'France', DE: 'Germany', GH: 'Ghana',
  GR: 'Greece', HU: 'Hungary', IN: 'India', ID: 'Indonesia', IE: 'Ireland',
  IL: 'Israel', IT: 'Italy', JP: 'Japan', KE: 'Kenya', KR: 'South Korea',
  MX: 'Mexico', MA: 'Morocco', NL: 'Netherlands', NZ: 'New Zealand', NG: 'Nigeria',
  NO: 'Norway', PK: 'Pakistan', PE: 'Peru', PH: 'Philippines', PL: 'Poland',
  PT: 'Portugal', RO: 'Romania', RU: 'Russia', SA: 'Saudi Arabia', ZA: 'South Africa',
  ES: 'Spain', SE: 'Sweden', CH: 'Switzerland', TH: 'Thailand', TR: 'Turkey',
  UA: 'Ukraine', GB: 'United Kingdom', US: 'United States', VE: 'Venezuela',
  VN: 'Vietnam',
};

/** Returns the full country name for an ISO-2 code, falling back to the code itself. */
export function getCountryLabel(code: string | null | undefined): string {
  if (!code) return '';
  return COUNTRY_NAMES[code] ?? code;
}
