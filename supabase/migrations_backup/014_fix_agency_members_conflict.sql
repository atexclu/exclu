-- Migration 014: Fix agency_members table conflict between migrations 004 and 006
-- Migration 004 creates agency_members with (agency_id, user_id)
-- Migration 006 recreates it with (agency_user_id, chatter_user_id)
-- This migration ensures the correct schema is in place

-- Drop the problematic index from migration 004 if it exists
DROP INDEX IF EXISTS unique_active_agency_member;

-- The table structure from migration 006 is the correct one
-- Ensure it exists with the right columns
DO $$ 
BEGIN
    -- Check if the old columns exist and drop them if needed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agency_members' AND column_name = 'agency_id'
    ) THEN
        -- Drop old constraints and columns
        ALTER TABLE agency_members DROP CONSTRAINT IF EXISTS agency_members_agency_id_fkey;
        ALTER TABLE agency_members DROP COLUMN IF EXISTS agency_id;
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agency_members' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE agency_members DROP COLUMN IF EXISTS user_id;
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'agency_members' AND column_name = 'member_type'
    ) THEN
        ALTER TABLE agency_members DROP COLUMN IF EXISTS member_type;
    END IF;
END $$;

-- Ensure the correct columns exist (from migration 006)
ALTER TABLE agency_members ADD COLUMN IF NOT EXISTS agency_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE agency_members ADD COLUMN IF NOT EXISTS chatter_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE agency_members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'chatter' CHECK (role IN ('chatter', 'manager'));

-- Add the correct unique constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_agency_chatter'
    ) THEN
        ALTER TABLE agency_members ADD CONSTRAINT unique_agency_chatter UNIQUE (agency_user_id, chatter_user_id);
    END IF;
END $$;

-- Add the correct check constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_self_assignment'
    ) THEN
        ALTER TABLE agency_members ADD CONSTRAINT no_self_assignment CHECK (agency_user_id != chatter_user_id);
    END IF;
END $$;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_agency_members_agency ON agency_members(agency_user_id);
CREATE INDEX IF NOT EXISTS idx_agency_members_chatter ON agency_members(chatter_user_id);
CREATE INDEX IF NOT EXISTS idx_agency_members_active ON agency_members(is_active) WHERE is_active = true;

COMMENT ON TABLE agency_members IS 'Chatters et managers d''agence. Un créateur peut inviter des opérateurs pour gérer ses profils.';
