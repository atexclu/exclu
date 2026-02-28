-- Add gift_url column to wishlist_items for informational product links
ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS gift_url text;
