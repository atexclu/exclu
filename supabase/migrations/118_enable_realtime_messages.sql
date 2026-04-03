-- Enable Realtime for messages and conversations tables
-- This is required for Supabase Realtime (postgres_changes) to work
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE chatter_requests;
