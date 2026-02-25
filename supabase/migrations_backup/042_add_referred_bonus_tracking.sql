-- Add bonus_paid_to_referred column to referrals table
ALTER TABLE public.referrals
ADD COLUMN IF NOT EXISTS bonus_paid_to_referred BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.referrals.bonus_paid_to_referred IS 'Indicates if the $100 bonus was paid to the referred user after they reached 1k in revenue within 90 days of signup';
