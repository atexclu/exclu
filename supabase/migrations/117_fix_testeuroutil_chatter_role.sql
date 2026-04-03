-- One-time fix: update accounts created via /auth/chatter before migration 116
-- These have is_chatter=true in auth.users metadata but role='fan' in profiles
UPDATE profiles
SET role = 'chatter'::user_role
WHERE role = 'fan'::user_role
  AND id IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'is_chatter' = 'true'
  );
