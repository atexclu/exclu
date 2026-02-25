-- ============================================================
-- 040_fix_affiliate_program.sql
-- No-op: 039 already handles everything correctly now.
-- This file is kept for migration history integrity only.
-- ============================================================

-- Ensure referral_code is generated for any profile that still lacks one
-- (belt-and-suspenders in case 039 was partially applied on some profiles)
UPDATE public.profiles
SET referral_code = LOWER(
  COALESCE(
    NULLIF(REGEXP_REPLACE(SUBSTRING(handle FROM 1 FOR 6), '[^a-z0-9]', '', 'g'), ''),
    'ex'
  ) || '-' || SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 6)
)
WHERE referral_code IS NULL;
