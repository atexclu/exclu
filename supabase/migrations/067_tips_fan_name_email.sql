-- ============================================================================
-- Migration 067: Add fan_name and fan_email to tips for guest tippers
-- ============================================================================
-- fan_name: optional display name entered by guest (shown to creator if not anonymous)
-- fan_email: captured from Stripe checkout, used to link tip to account later
-- ============================================================================

ALTER TABLE tips ADD COLUMN IF NOT EXISTS fan_name TEXT;
ALTER TABLE tips ADD COLUMN IF NOT EXISTS fan_email TEXT;

CREATE INDEX IF NOT EXISTS idx_tips_fan_email ON tips(fan_email) WHERE fan_email IS NOT NULL;
