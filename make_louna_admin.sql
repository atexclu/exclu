-- Passer Louna (@lounasmodels) admin
UPDATE profiles 
SET is_admin = true 
WHERE handle = 'lounasmodels' AND id = '2960454d-6e0d-4beb-b68a-4bc1789dffba';

-- Vérification après la mise à jour
SELECT 
  id,
  display_name,
  handle,
  is_admin,
  created_at
FROM profiles 
WHERE id = '2960454d-6e0d-4beb-b68a-4bc1789dffba';
