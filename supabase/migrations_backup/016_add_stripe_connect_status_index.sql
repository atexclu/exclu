-- Migration 016: Add index on stripe_connect_status for performance
-- This improves query performance when checking Stripe connection status

-- Add index for stripe_connect_status lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_connect_status 
ON profiles(stripe_connect_status) 
WHERE stripe_connect_status IS NOT NULL;

-- Add comment
COMMENT ON COLUMN profiles.stripe_connect_status IS 'Stripe Connect account status: pending, restricted, or complete. Only complete allows receiving payouts.';
