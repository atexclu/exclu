-- Change default aurora_gradient from 'aurora' to 'purple_dream'
ALTER TABLE profiles ALTER COLUMN aurora_gradient SET DEFAULT 'purple_dream';

-- Update all existing profiles that still have the old default
UPDATE profiles SET aurora_gradient = 'purple_dream' WHERE aurora_gradient = 'aurora' OR aurora_gradient IS NULL;
