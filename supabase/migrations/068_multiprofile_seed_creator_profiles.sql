-- Migration 068: Multi-profile foundation
-- Adds missing columns to creator_profiles and seeds data from existing profiles.
-- This is the bridge between the legacy single-profile model (profiles table)
-- and the new multi-profile model (creator_profiles table).
-- Idempotent: safe to run multiple times.

-- ============================================================
-- 1. Add missing columns to creator_profiles
-- ============================================================

ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS theme_color text DEFAULT 'pink';
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS aurora_gradient text DEFAULT 'purple_dream';
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS show_join_banner boolean DEFAULT true;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS show_certification boolean DEFAULT false;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS show_deeplinks boolean DEFAULT false;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS show_available_now boolean DEFAULT false;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS link_order jsonb;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS content_order text[] DEFAULT '{}';
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS exclusive_content_text text;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS exclusive_content_link_id uuid;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS exclusive_content_url text;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS exclusive_content_image_url text;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS tips_enabled boolean DEFAULT true;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS custom_requests_enabled boolean DEFAULT true;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS min_tip_amount_cents integer DEFAULT 500;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS min_custom_request_cents integer DEFAULT 2000;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS profile_draft jsonb;

-- ============================================================
-- 2. Seed creator_profiles from existing profiles
-- For each creator that does NOT already have a creator_profiles row,
-- create one mirroring their profiles data.
-- Uses ON CONFLICT to gracefully handle duplicates.
-- ============================================================

-- 2a. First, update any EXISTING creator_profiles rows to fill in the
-- newly-added columns from their corresponding profiles row.
UPDATE creator_profiles cp
SET
    theme_color        = COALESCE(cp.theme_color, p.theme_color, 'pink'),
    aurora_gradient     = COALESCE(cp.aurora_gradient, p.aurora_gradient, 'purple_dream'),
    show_join_banner    = COALESCE(cp.show_join_banner, p.show_join_banner, true),
    show_certification  = COALESCE(cp.show_certification, p.show_certification, false),
    show_deeplinks      = COALESCE(cp.show_deeplinks, p.show_deeplinks, false),
    show_available_now  = COALESCE(cp.show_available_now, p.show_available_now, false),
    location            = COALESCE(cp.location, p.location),
    link_order          = COALESCE(cp.link_order, p.link_order),
    tips_enabled        = COALESCE(cp.tips_enabled, p.tips_enabled, true),
    custom_requests_enabled = COALESCE(cp.custom_requests_enabled, p.custom_requests_enabled, true),
    min_tip_amount_cents    = COALESCE(cp.min_tip_amount_cents, p.min_tip_amount_cents, 500),
    min_custom_request_cents = COALESCE(cp.min_custom_request_cents, p.min_custom_request_cents, 2000),
    exclusive_content_text   = COALESCE(cp.exclusive_content_text, p.exclusive_content_text),
    exclusive_content_url    = COALESCE(cp.exclusive_content_url, p.exclusive_content_url),
    exclusive_content_image_url = COALESCE(cp.exclusive_content_image_url, p.exclusive_content_image_url),
    -- Also sync display_name / avatar / bio if creator_profiles is empty
    display_name = COALESCE(cp.display_name, p.display_name),
    avatar_url   = COALESCE(cp.avatar_url, p.avatar_url),
    bio          = COALESCE(cp.bio, p.bio),
    username     = COALESCE(cp.username, p.handle),
    social_links = CASE WHEN cp.social_links = '{}'::jsonb THEN p.social_links ELSE cp.social_links END
FROM profiles p
WHERE cp.user_id = p.id;

-- 2b. Insert new creator_profiles for creators that don't have one yet.
-- Skip stripe_account_id if it would cause a unique constraint violation.
INSERT INTO creator_profiles (
    user_id,
    username,
    display_name,
    avatar_url,
    bio,
    social_links,
    country,
    stripe_account_id,
    stripe_connect_status,
    profile_view_count,
    theme_color,
    aurora_gradient,
    show_join_banner,
    show_certification,
    show_deeplinks,
    show_available_now,
    location,
    link_order,
    content_order,
    exclusive_content_text,
    exclusive_content_link_id,
    exclusive_content_url,
    exclusive_content_image_url,
    tips_enabled,
    custom_requests_enabled,
    min_tip_amount_cents,
    min_custom_request_cents,
    profile_draft
)
SELECT
    p.id,
    -- Truncate handle to 30 chars max (username_length constraint)
    -- and ensure it matches username_format (lowercase alphanumeric + _ + -)
    CASE
        WHEN p.handle IS NOT NULL AND char_length(p.handle) > 30
        THEN left(p.handle, 30)
        ELSE p.handle
    END,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.social_links,
    p.country,
    -- Only set stripe_account_id if it won't conflict
    CASE
        WHEN p.stripe_account_id IS NOT NULL
             AND NOT EXISTS (
                 SELECT 1 FROM creator_profiles ex
                 WHERE ex.stripe_account_id = p.stripe_account_id
             )
        THEN p.stripe_account_id
        ELSE NULL
    END,
    CASE
        WHEN p.stripe_connect_status = 'pending' THEN 'not_started'
        WHEN p.stripe_connect_status = 'disabled' THEN 'blocked'
        WHEN p.stripe_connect_status IN ('complete', 'restricted') THEN p.stripe_connect_status
        ELSE 'not_started'
    END,
    p.profile_view_count,
    COALESCE(p.theme_color, 'pink'),
    COALESCE(p.aurora_gradient, 'purple_dream'),
    COALESCE(p.show_join_banner, true),
    COALESCE(p.show_certification, false),
    COALESCE(p.show_deeplinks, false),
    COALESCE(p.show_available_now, false),
    p.location,
    p.link_order,
    COALESCE(p.content_order, '{}'),
    p.exclusive_content_text,
    p.exclusive_content_link_id,
    p.exclusive_content_url,
    p.exclusive_content_image_url,
    COALESCE(p.tips_enabled, true),
    COALESCE(p.custom_requests_enabled, true),
    COALESCE(p.min_tip_amount_cents, 500),
    COALESCE(p.min_custom_request_cents, 2000),
    p.profile_draft
FROM profiles p
WHERE p.is_creator = true
  AND p.handle IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM creator_profiles cp WHERE cp.user_id = p.id
  );

-- ============================================================
-- 3. Backfill links.profile_id for existing links
-- ============================================================

UPDATE links l
SET profile_id = cp.id
FROM creator_profiles cp
WHERE l.creator_id = cp.user_id
  AND l.profile_id IS NULL;

-- ============================================================
-- 4. Backfill assets.profile_id for existing assets
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assets' AND column_name = 'profile_id'
    ) THEN
        EXECUTE '
            UPDATE assets a
            SET profile_id = cp.id
            FROM creator_profiles cp
            WHERE a.creator_id = cp.user_id
              AND a.profile_id IS NULL
        ';
    END IF;
END $$;

-- ============================================================
-- 5. Update handle_new_user trigger to also create a creator_profile
-- when a new creator signs up.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_creator BOOLEAN;
  v_role user_role;
BEGIN
  v_is_creator := COALESCE((NEW.raw_user_meta_data->>'is_creator')::boolean, true);

  IF v_is_creator THEN
    v_role := 'creator'::user_role;
  ELSE
    v_role := 'fan'::user_role;
  END IF;

  INSERT INTO public.profiles (id, display_name, is_creator, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_is_creator,
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  -- For creator accounts, also create a default creator_profile
  IF v_is_creator THEN
    INSERT INTO public.creator_profiles (user_id, display_name)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
