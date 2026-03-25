/* ─── Creator model categories ─── */

export const MODEL_CATEGORY_GROUPS: Record<string, { value: string; label: string }[]> = {
  'Trending Now': [
    { value: '18yo', label: '18 Years Old' },
    { value: 'college', label: 'College Student' },
    { value: 'teen', label: 'Teen' },
    { value: 'petite', label: 'Petite' },
    { value: 'goth', label: 'Goth' },
    { value: 'alt', label: 'Alt' },
    { value: 'cosplay', label: 'Cosplay' },
    { value: 'pornstar', label: 'Pornstar' },
  ],
  'Type & Look': [
    { value: 'latina', label: 'Latina' },
    { value: 'asian', label: 'Asian' },
    { value: 'ebony', label: 'Ebony / Black' },
    { value: 'indian', label: 'Indian' },
    { value: 'arab', label: 'Arab' },
    { value: 'hijab', label: 'Hijab' },
    { value: 'bbw', label: 'BBW / Chubby' },
    { value: 'milf', label: 'MILF / Mature' },
    { value: 'redhead', label: 'Redhead' },
    { value: 'blonde', label: 'Blonde' },
    { value: 'brunette', label: 'Brunette' },
    { value: 'natural', label: 'Natural' },
    { value: 'skinny', label: 'Skinny' },
    { value: 'girl_next_door', label: 'Girl Next Door' },
    { value: 'amateur', label: 'Amateur' },
  ],
  'Niche & Kinks': [
    { value: 'joi', label: 'JOI' },
    { value: 'asmr', label: 'ASMR' },
    { value: 'fetish', label: 'Fetish' },
    { value: 'femdom', label: 'Femdom' },
    { value: 'hairy', label: 'Hairy' },
    { value: 'squirting', label: 'Squirting' },
    { value: 'anal', label: 'Anal' },
    { value: 'trans', label: 'Trans' },
    { value: 'femboy', label: 'Femboy' },
    { value: 'feet', label: 'Feet' },
    { value: 'domination', label: 'Domination' },
    { value: 'latex', label: 'Latex / Leather' },
  ],
  'Features': [
    { value: 'big_tits', label: 'Big Tits' },
    { value: 'big_ass', label: 'Big Ass' },
    { value: 'tattooed', label: 'Tattooed / Inked' },
    { value: 'fitness', label: 'Fitness / Gym' },
    { value: 'pregnant', label: 'Pregnant' },
    { value: 'lesbian', label: 'Lesbian' },
    { value: 'couple', label: 'Couple' },
  ],
  'Experience': [
    { value: 'girlfriend_experience', label: 'Girlfriend Experience' },
    { value: 'ai_girlfriend', label: 'AI Girlfriend' },
  ],
};

export const ALL_MODEL_CATEGORIES = Object.entries(MODEL_CATEGORY_GROUPS).flatMap(
  ([group, options]) => options.map(({ value, label }) => ({ group, value, label }))
);

export function getModelCategoryLabel(value: string): string {
  return ALL_MODEL_CATEGORIES.find((o) => o.value === value)?.label ?? value.replace(/_/g, ' ');
}

/* ─── Agency directory categories ─── */

export const AGENCY_PRICING_OPTIONS: { value: string; label: string }[] = [
  { value: 'high_commission', label: 'High Commission (50%+)' },
  { value: 'mid_commission', label: 'Mid Commission (30–50%)' },
  { value: 'low_commission', label: 'Low Commission (<30%)' },
  { value: 'fixed_fee', label: 'Fixed Fee (Flat)' },
];

export const AGENCY_TARGET_MARKET_OPTIONS: { value: string; label: string }[] = [
  { value: 'beginner_models', label: 'Beginner Models' },
  { value: 'mid_tier_creators', label: 'Mid-Tier Creators' },
  { value: 'top_creators', label: 'Top Creators' },
  { value: 'niche_models', label: 'Niche Models' },
  { value: 'ai_models', label: 'AI Models' },
];

export const AGENCY_SERVICES_OPTIONS: { value: string; label: string }[] = [
  { value: 'full_management', label: 'Full Management' },
  { value: 'chatting', label: 'Chatting' },
  { value: 'marketing', label: 'Marketing' },
];

export const AGENCY_PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'onlyfans', label: 'OnlyFans' },
  { value: 'multi_platform', label: 'Multi-Platform' },
  { value: 'exclu', label: 'Exclu' },
];

export const AGENCY_GROWTH_OPTIONS: { value: string; label: string }[] = [
  { value: 'paid_traffic', label: 'Paid Traffic' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'snapchat', label: 'Snapchat' },
  { value: 'organic', label: 'Organic' },
  { value: 'ai', label: 'AI' },
  { value: 'viral_insta_tiktok', label: 'Viral (Instagram / TikTok)' },
  { value: 'adult_traffic', label: 'Adult Traffic' },
  { value: 'sfs', label: 'SFS' },
];

// Types of models/creators the agency specializes in managing
export const AGENCY_MODEL_TYPES_OPTIONS: { value: string; label: string }[] = [
  { value: 'mainstream', label: 'Mainstream / Adult' },
  { value: 'niche_fetish', label: 'Niche / Fetish' },
  { value: 'cosplay_alt', label: 'Cosplay / Alt' },
  { value: 'bbw_plus_size', label: 'BBW / Plus Size' },
  { value: 'trans_femboy', label: 'Trans / Femboy' },
  { value: 'asmr_gfe', label: 'ASMR / GFE' },
  { value: 'fitness_sports', label: 'Fitness / Sports' },
  { value: 'ai_virtual', label: 'AI / Virtual' },
  { value: 'amateur', label: 'Amateur' },
];
