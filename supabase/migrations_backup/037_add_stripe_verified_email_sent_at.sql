ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_verified_email_sent_at timestamptz;
