-- Migration 081: Fix conversations.fan_id FK for PostgREST joins
--
-- Problem: conversations.fan_id references auth.users(id), but PostgREST
-- cannot resolve a join between "conversations" and "profiles" because
-- the FK target is auth.users, not public.profiles.
--
-- Fix: Drop the existing FK to auth.users(id) and replace it with a FK
-- to profiles(id). Since profiles.id = auth.users.id (1:1 mapping),
-- data integrity is preserved and PostgREST can now resolve the join
-- using the hint "profiles!conversations_fan_id_fkey".

-- 1. Drop the auto-generated FK constraint pointing to auth.users
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_fan_id_fkey;

-- 2. Re-add it pointing to profiles(id) so PostgREST can resolve the join
ALTER TABLE conversations
  ADD CONSTRAINT conversations_fan_id_fkey
  FOREIGN KEY (fan_id) REFERENCES profiles(id) ON DELETE CASCADE;
