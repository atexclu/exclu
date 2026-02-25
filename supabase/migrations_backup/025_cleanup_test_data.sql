-- Cleanup: remove fake test purchases and the temporary RPC function
DELETE FROM purchases WHERE stripe_session_id LIKE 'fake_test_%';
DROP FUNCTION IF EXISTS create_fake_purchase(UUID, INTEGER, TEXT, TEXT, TEXT);
