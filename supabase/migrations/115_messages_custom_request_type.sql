-- Migration 115: Add custom_request content_type to messages table
-- Allows custom requests to be displayed as rich cards in chat with accept/refuse buttons.

-- 1. Add custom_request_id column
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS custom_request_id UUID REFERENCES custom_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_custom_request ON messages(custom_request_id) WHERE custom_request_id IS NOT NULL;

-- 2. Expand content_type CHECK constraint to include 'custom_request'
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_content_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_content_type_check
  CHECK (content_type IN ('text', 'paid_content', 'tip_link', 'wishlist_link', 'image', 'system', 'custom_request'));
