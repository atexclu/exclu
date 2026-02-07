-- Migration 023: Add email_sent flag and download_count to purchases
-- email_sent: tracks whether the content access email was successfully sent via Brevo
-- download_count: tracks how many times the buyer has generated signed URLs

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN purchases.email_sent IS 'Whether the content access email was successfully sent to the buyer via Brevo';
COMMENT ON COLUMN purchases.download_count IS 'Number of times the buyer has generated signed download URLs for this purchase';
