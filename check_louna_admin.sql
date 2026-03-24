-- Vérifier si Louna (@lounasmodels) est admin
SELECT 
  id,
  display_name,
  handle,
  is_admin,
  created_at
FROM profiles 
WHERE handle = 'lounasmodels' OR display_name ILIKE '%louna%';

-- Vérifier aussi dans creator_profiles
SELECT 
  cp.id,
  cp.username,
  cp.display_name,
  p.is_admin,
  p.created_at
FROM creator_profiles cp
JOIN profiles p ON cp.user_id = p.id
WHERE cp.username = 'lounasmodels' OR cp.display_name ILIKE '%louna%';
