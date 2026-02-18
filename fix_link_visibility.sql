-- Script to check and fix link visibility for pour-toi-s56wfn
-- This will help identify why the link is not visible on the public profile

-- 1. Check current link status
SELECT 
  id,
  slug,
  title,
  status,
  show_on_profile,
  is_public,
  creator_id,
  created_at,
  published_at
FROM links 
WHERE slug = 'pour-toi-s56wfn';

-- 2. Check creator profile and Stripe status
SELECT 
  p.id,
  p.handle,
  p.display_name,
  p.stripe_connect_status,
  p.stripe_account_id
FROM profiles p
WHERE p.handle = 'test1';

-- 3. If show_on_profile is false, update it to true
-- Uncomment the following line to fix the link:
-- UPDATE links SET show_on_profile = true WHERE slug = 'pour-toi-s56wfn';

-- 4. Verify the fix
-- SELECT slug, title, status, show_on_profile FROM links WHERE slug = 'pour-toi-s56wfn';
