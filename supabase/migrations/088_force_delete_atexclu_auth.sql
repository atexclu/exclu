-- Force delete atexclu user from auth.users
-- The previous migration deleted from profiles but auth.users requires admin privileges

-- Delete using text comparison to handle varchar columns in auth schema
DELETE FROM auth.mfa_factors WHERE user_id::text = '4918eaf2-34b3-4d69-8d3a-b818c602f3a6';
DELETE FROM auth.refresh_tokens WHERE user_id::text = '4918eaf2-34b3-4d69-8d3a-b818c602f3a6';
DELETE FROM auth.sessions WHERE user_id::text = '4918eaf2-34b3-4d69-8d3a-b818c602f3a6';
DELETE FROM auth.identities WHERE user_id::text = '4918eaf2-34b3-4d69-8d3a-b818c602f3a6';
DELETE FROM auth.users WHERE id::text = '4918eaf2-34b3-4d69-8d3a-b818c602f3a6';

SELECT 'User 4918eaf2-34b3-4d69-8d3a-b818c602f3a6 completely deleted from auth tables' as notice;
