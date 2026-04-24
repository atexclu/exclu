/**
 * UG Payments QuickPay configuration constants.
 * All amounts are in USD cents unless otherwise noted.
 */
export const PAYMENT_CONFIG = {
  // QuickPay endpoints
  QUICKPAY_URL: 'https://quickpay.ugpayments.ch/',
  QUICKPAY_CANCEL_URL: 'https://quickpay.ugpayments.ch/Cancel',

  // Site credentials (public — exposed in HTML forms by design)
  SITE_ID: '98845',

  // Currency (all transactions in USD)
  CURRENCY: 'USD',

  // Fee structure
  PROCESSING_FEE_RATE: 0.15,       // 15% added on top for the fan
  COMMISSION_RATE_FREE: 0.15,      // 15% platform commission (free plan)
  COMMISSION_RATE_PREMIUM: 0,      // 0% platform commission (premium plan)

  // Premium subscription
  PREMIUM_PRICE_CENTS: 3900,       // $39/month
  PREMIUM_PRICE_USD: 39,
  SUBSCRIPTION_PLAN_ID: '11027',
  ADDON_PROFILE_PRICE_CENTS: 1000, // $10/month per additional profile beyond 2
  INCLUDED_PROFILES: 2,

  // Withdrawal limits
  MIN_WITHDRAWAL_CENTS: 5000,      // $50 minimum withdrawal

  // Tip limits
  TIP_MIN_CENTS: 500,              // $5 minimum tip (default, creator can set higher)
  TIP_MAX_CENTS: 50000,            // $500 maximum tip

  // Custom request limits
  CUSTOM_REQUEST_MIN_CENTS: 2000,  // $20 minimum
  CUSTOM_REQUEST_MAX_CENTS: 100000,// $1000 maximum

  // Pre-auth hold duration (configured by UGPayments server-side)
  PRE_AUTH_HOLD_DAYS: 6,

  // Referral commission
  REFERRAL_COMMISSION_RATE: 0.35,  // 35% of premium subscription price

  // Chatter revenue split (when sale attributed to chatter)
  CHATTER_SPLIT: {
    CREATOR: 0.60,   // 60% to creator
    CHATTER: 0.25,   // 25% to chatter
    PLATFORM: 0.15,  // 15% to platform (+ 15% processing fee)
  },
} as const;

/**
 * Calculate the total amount the fan pays (base price + 15% processing fee).
 * @param baseCents - Base price in cents
 * @returns Total fan pays in cents
 */
export function calculateFanTotal(baseCents: number): number {
  return baseCents + Math.round(baseCents * PAYMENT_CONFIG.PROCESSING_FEE_RATE);
}

/**
 * Calculate the commission split for a transaction.
 * @param baseCents - Base price in cents (before 15% fee)
 * @param isPremium - Whether the creator has an active premium subscription
 * @returns Object with creatorNet, platformFee, fanProcessingFee
 */
export function calculateCommission(baseCents: number, isPremium: boolean) {
  const fanProcessingFeeCents = Math.round(baseCents * PAYMENT_CONFIG.PROCESSING_FEE_RATE);
  const commissionRate = isPremium
    ? PAYMENT_CONFIG.COMMISSION_RATE_PREMIUM
    : PAYMENT_CONFIG.COMMISSION_RATE_FREE;
  const platformCommissionCents = Math.round(baseCents * commissionRate);
  const creatorNetCents = baseCents - platformCommissionCents;
  const totalPlatformFee = platformCommissionCents + fanProcessingFeeCents;

  return {
    creatorNetCents,
    platformCommissionCents,
    fanProcessingFeeCents,
    totalPlatformFee,
  };
}

/**
 * Calculate the chatter revenue split (60/25/15).
 * Used when a purchase is attributed to a chatter via chtref.
 * @param baseCents - Base price in cents
 * @returns Object with creator, chatter, platform shares
 */
export function calculateChatterSplit(baseCents: number) {
  const fanProcessingFeeCents = Math.round(baseCents * PAYMENT_CONFIG.PROCESSING_FEE_RATE);
  const creatorShare = Math.round(baseCents * PAYMENT_CONFIG.CHATTER_SPLIT.CREATOR);
  const chatterShare = Math.round(baseCents * PAYMENT_CONFIG.CHATTER_SPLIT.CHATTER);
  const platformShare = baseCents - creatorShare - chatterShare; // ~15%
  const totalPlatformFee = platformShare + fanProcessingFeeCents;

  return {
    creatorNetCents: creatorShare,
    chatterEarningsCents: chatterShare,
    platformCommissionCents: platformShare,
    fanProcessingFeeCents,
    totalPlatformFee,
  };
}

/**
 * Format cents to a decimal string for QuickPay AmountTotal field.
 * @param cents - Amount in cents
 * @returns Decimal string (e.g., "20.00")
 */
export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Parse a decimal amount string to cents.
 * @param decimal - Decimal string (e.g., "20.00")
 * @returns Amount in cents
 */
export function decimalToCents(decimal: string): number {
  return Math.round(parseFloat(decimal) * 100);
}

/**
 * Calculate monthly subscription price based on active profile count.
 * @param profileCount - Number of active creator profiles
 * @returns Monthly price in cents
 */
export function calculateSubscriptionPrice(profileCount: number): number {
  if (profileCount <= PAYMENT_CONFIG.INCLUDED_PROFILES) {
    return PAYMENT_CONFIG.PREMIUM_PRICE_CENTS;
  }
  const extraProfiles = profileCount - PAYMENT_CONFIG.INCLUDED_PROFILES;
  return PAYMENT_CONFIG.PREMIUM_PRICE_CENTS + (extraProfiles * PAYMENT_CONFIG.ADDON_PROFILE_PRICE_CENTS);
}
