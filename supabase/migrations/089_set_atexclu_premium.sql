-- Set atexclu@gmail.com account to premium
UPDATE profiles 
SET is_creator_subscribed = true 
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'atexclu@gmail.com'
);
