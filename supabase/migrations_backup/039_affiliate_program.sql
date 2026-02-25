-- ============================================================
-- 039_affiliate_program.sql
-- Affiliate / Referral Program
-- (Version corrigée - idempotente et résiliente)
-- ============================================================

-- 1. Add affiliate columns to profiles (IF NOT EXISTS guards)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS affiliate_earnings_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Generate unique referral codes for existing profiles that don't have one
UPDATE public.profiles
SET referral_code = LOWER(
  COALESCE(
    NULLIF(REGEXP_REPLACE(SUBSTRING(handle FROM 1 FOR 6), '[^a-z0-9]', '', 'g'), ''),
    'ex'
  ) || '-' || SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 6)
)
WHERE referral_code IS NULL;

-- 3. Drop and re-create referrals table to ensure correct schema
-- (Safe because any existing table from a failed run will have wrong schema)
DROP TABLE IF EXISTS public.referrals CASCADE;

-- 4. Create referrals table with correct schema
CREATE TABLE public.referrals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'inactive')),
  commission_earned_cents  INTEGER NOT NULL DEFAULT 0,
  converted_at             TIMESTAMPTZ,
  UNIQUE(referred_id)
);

-- 5. Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for referrals
CREATE POLICY "Referrer can view own referrals"
  ON public.referrals FOR SELECT
  USING (referrer_id = auth.uid());

CREATE POLICY "Service role can manage referrals"
  ON public.referrals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON public.referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by) WHERE referred_by IS NOT NULL;
