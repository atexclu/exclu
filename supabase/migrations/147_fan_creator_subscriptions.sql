-- supabase/migrations/147_fan_creator_subscriptions.sql
--
-- Parts 3 + 4 of "Plan amelioration Exclu.md":
--   - Fan → creator recurring subscription
--   - Public feed of posts (assets + blurred links)
--   - In-app fan feed + discovery carousel
--
-- Idempotent. Split into four stanzas:
--   A) creator_profiles: fan_subscription_enabled / _price_cents / gender
--   B) assets: feed_caption / is_feed_preview (+ one-preview unique index)
--   C) fan_creator_subscriptions table + RLS + indexes + updated_at trigger
--   D) has_active_fan_subscription(fan_id, creator_profile_id) RPC

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  STANZA A — creator_profiles: fan subscription config + gender        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE "public"."creator_profiles"
  ADD COLUMN IF NOT EXISTS "fan_subscription_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "fan_subscription_price_cents" integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS "gender" text;

ALTER TABLE "public"."creator_profiles"
  DROP CONSTRAINT IF EXISTS "creator_profiles_fan_sub_price_check";
ALTER TABLE "public"."creator_profiles"
  ADD CONSTRAINT "creator_profiles_fan_sub_price_check"
  CHECK ("fan_subscription_price_cents" >= 500 AND "fan_subscription_price_cents" <= 10000);

ALTER TABLE "public"."creator_profiles"
  DROP CONSTRAINT IF EXISTS "creator_profiles_gender_check";
ALTER TABLE "public"."creator_profiles"
  ADD CONSTRAINT "creator_profiles_gender_check"
  CHECK ("gender" IS NULL OR "gender" IN ('female', 'male', 'other'));

COMMENT ON COLUMN "public"."creator_profiles"."fan_subscription_enabled"
  IS 'Whether fans can subscribe to this profile to unlock the feed. Default true on creation.';
COMMENT ON COLUMN "public"."creator_profiles"."fan_subscription_price_cents"
  IS 'Monthly fan subscription price in cents. Default $5, min $5, max $100.';
COMMENT ON COLUMN "public"."creator_profiles"."gender"
  IS 'Creator gender for discovery filter: female | male | other. NULL = unspecified.';

-- Backfill gender = 'female' for visible creators so the default discovery filter returns results.
UPDATE "public"."creator_profiles"
   SET "gender" = 'female'
 WHERE "gender" IS NULL
   AND "is_active" = true
   AND "is_directory_visible" = true;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  STANZA B — assets: feed_caption + is_feed_preview                    ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE "public"."assets"
  ADD COLUMN IF NOT EXISTS "feed_caption" text,
  ADD COLUMN IF NOT EXISTS "is_feed_preview" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."assets"
  DROP CONSTRAINT IF EXISTS "assets_feed_caption_length_check";
ALTER TABLE "public"."assets"
  ADD CONSTRAINT "assets_feed_caption_length_check"
  CHECK ("feed_caption" IS NULL OR char_length("feed_caption") <= 500);

COMMENT ON COLUMN "public"."assets"."feed_caption"
  IS 'Optional legend displayed above the post in the public feed (max 500 chars).';
COMMENT ON COLUMN "public"."assets"."is_feed_preview"
  IS 'Marks this asset as the ONE unblurred preview visible to non-subscribers. At most 1 per creator_profile (enforced by partial unique index).';

-- Enforce: at most one preview per profile_id. Two partial indexes cover both scopes
-- (rows with a profile_id use that as tenant key; legacy rows without profile_id fall
-- back to creator_id).
DROP INDEX IF EXISTS "public"."uniq_feed_preview_per_profile";
CREATE UNIQUE INDEX "uniq_feed_preview_per_profile"
  ON "public"."assets" ("profile_id")
  WHERE "is_feed_preview" = true AND "profile_id" IS NOT NULL;

DROP INDEX IF EXISTS "public"."uniq_feed_preview_per_creator_legacy";
CREATE UNIQUE INDEX "uniq_feed_preview_per_creator_legacy"
  ON "public"."assets" ("creator_id")
  WHERE "is_feed_preview" = true AND "profile_id" IS NULL;

-- Helper index for feed ordering on the public profile.
DROP INDEX IF EXISTS "public"."idx_assets_profile_feed";
CREATE INDEX "idx_assets_profile_feed"
  ON "public"."assets" ("profile_id", "is_public", "created_at" DESC);

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  STANZA C — fan_creator_subscriptions table, RLS, indexes, trigger    ║
-- ╚══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS "public"."fan_creator_subscriptions" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fan_id"                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "creator_profile_id"      uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  "creator_user_id"         uuid NOT NULL, -- denormalized so we can filter without joining creator_profiles
  "status"                  text NOT NULL DEFAULT 'pending',
  "price_cents"             integer NOT NULL,
  "currency"                text NOT NULL DEFAULT 'USD',
  "ugp_member_id"           text,
  "ugp_membership_username" text,          -- value we pass as MembershipUsername to QuickPay (= this row's id)
  "ugp_merchant_reference"  text,
  "ugp_transaction_id"      text,          -- id of the initial Sale transaction
  "period_start"            timestamptz,
  "period_end"              timestamptz,   -- access boundary; checked by has_active_fan_subscription()
  "started_at"              timestamptz,
  "cancelled_at"            timestamptz,
  "cancel_at_period_end"    boolean NOT NULL DEFAULT false,
  "created_at"              timestamptz NOT NULL DEFAULT now(),
  "updated_at"              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "fan_creator_subscriptions_status_check"
    CHECK ("status" IN ('pending', 'active', 'cancelled', 'expired', 'past_due')),
  CONSTRAINT "fan_creator_subscriptions_price_check"
    CHECK ("price_cents" >= 500)
);

COMMENT ON TABLE "public"."fan_creator_subscriptions" IS
  'Recurring monthly fan → creator subscription (N:N). Payment via UGP QuickPay variable-price plan. period_end is the source of truth for access regardless of status (cancelled subs still have access until period_end).';

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_fan_subs_fan_active"
  ON "public"."fan_creator_subscriptions" ("fan_id", "status")
  WHERE "status" IN ('active', 'cancelled');

CREATE INDEX IF NOT EXISTS "idx_fan_subs_creator_profile"
  ON "public"."fan_creator_subscriptions" ("creator_profile_id", "status");

CREATE INDEX IF NOT EXISTS "idx_fan_subs_ugp_username"
  ON "public"."fan_creator_subscriptions" ("ugp_membership_username")
  WHERE "ugp_membership_username" IS NOT NULL;

-- A fan has at most ONE live row per creator_profile (any non-terminal status).
-- Terminal rows (status='expired') are allowed alongside for historical audit.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_fan_sub_live_per_creator"
  ON "public"."fan_creator_subscriptions" ("fan_id", "creator_profile_id")
  WHERE "status" IN ('pending', 'active', 'cancelled', 'past_due');

-- Auto-updated timestamp (pattern reused from other tables).
CREATE OR REPLACE FUNCTION "public"."fan_creator_subscriptions_touch_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS "trg_fan_subs_updated_at" ON "public"."fan_creator_subscriptions";
CREATE TRIGGER "trg_fan_subs_updated_at"
  BEFORE UPDATE ON "public"."fan_creator_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "public"."fan_creator_subscriptions_touch_updated_at"();

-- RLS
ALTER TABLE "public"."fan_creator_subscriptions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fans_read_own_subscriptions" ON "public"."fan_creator_subscriptions";
CREATE POLICY "fans_read_own_subscriptions"
  ON "public"."fan_creator_subscriptions"
  FOR SELECT
  USING (auth.uid() = "fan_id");

DROP POLICY IF EXISTS "creators_read_their_subscribers" ON "public"."fan_creator_subscriptions";
CREATE POLICY "creators_read_their_subscribers"
  ON "public"."fan_creator_subscriptions"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.creator_profiles cp
       WHERE cp.id = fan_creator_subscriptions.creator_profile_id
         AND cp.user_id = auth.uid()
    )
  );

-- All writes go through edge functions using the service role — no INSERT/UPDATE/DELETE
-- policies for regular users (matches chatter_invitations, purchases, etc.).

GRANT SELECT ON "public"."fan_creator_subscriptions" TO "authenticated";

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  STANZA D — has_active_fan_subscription RPC                           ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- SECURITY DEFINER so feed access checks bypass RLS. Returns only a boolean
-- — never row data — and takes the fan_id explicitly so the caller must
-- already have authenticated. Anonymous callers always get false for any
-- non-matching pair; guessing a UUID is infeasible.
CREATE OR REPLACE FUNCTION "public"."has_active_fan_subscription"(
  p_fan_id uuid,
  p_creator_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.fan_creator_subscriptions
     WHERE fan_id = p_fan_id
       AND creator_profile_id = p_creator_profile_id
       AND status IN ('active', 'cancelled')
       AND period_end IS NOT NULL
       AND period_end > now()
  );
$$;

COMMENT ON FUNCTION "public"."has_active_fan_subscription"(uuid, uuid) IS
  'Returns true iff the fan has an unexpired paid period on that creator profile. Cancelled subs retain access until period_end.';

GRANT EXECUTE ON FUNCTION "public"."has_active_fan_subscription"(uuid, uuid) TO "anon", "authenticated";
