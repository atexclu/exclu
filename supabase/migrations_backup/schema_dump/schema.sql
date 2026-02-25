


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."user_role" AS ENUM (
    'fan',
    'creator',
    'agency',
    'chatter',
    'affiliate',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_subscription_price"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $_$
DECLARE
    v_profile_count INTEGER;
    v_base_price INTEGER := 3900;  -- $39 en cents
    v_included_profiles INTEGER := 2;
    v_additional_price INTEGER := 1000;  -- $10 en cents
    v_additional_profiles INTEGER;
BEGIN
    -- Compter les profils actifs
    v_profile_count := count_user_active_profiles(p_user_id);
    
    -- Calculer le nombre de profils supplémentaires
    v_additional_profiles := GREATEST(0, v_profile_count - v_included_profiles);
    
    -- Calculer le prix total
    RETURN v_base_price + (v_additional_profiles * v_additional_price);
END;
$_$;


ALTER FUNCTION "public"."calculate_subscription_price"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_subscription_price"("p_user_id" "uuid") IS 'Calcule le prix d''abonnement: $39 + ($10 × profils supplémentaires au-delà de 2)';



CREATE OR REPLACE FUNCTION "public"."chatter_has_access_to_profile"("p_chatter_user_id" "uuid", "p_profile_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    v_agency_user_id UUID;
    v_accessible_ids UUID[];
BEGIN
    -- Récupérer l'agence propriétaire du profil
    SELECT user_id INTO v_agency_user_id
    FROM creator_profiles
    WHERE id = p_profile_id;
    
    IF v_agency_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Vérifier si le chatter a accès
    SELECT accessible_profile_ids INTO v_accessible_ids
    FROM agency_members
    WHERE chatter_user_id = p_chatter_user_id
        AND agency_user_id = v_agency_user_id
        AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Si accessible_profile_ids est NULL, accès à tous les profils
    IF v_accessible_ids IS NULL THEN
        RETURN true;
    END IF;
    
    -- Sinon, vérifier si le profil est dans la liste
    RETURN p_profile_id = ANY(v_accessible_ids);
END;
$$;


ALTER FUNCTION "public"."chatter_has_access_to_profile"("p_chatter_user_id" "uuid", "p_profile_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."chatter_has_access_to_profile"("p_chatter_user_id" "uuid", "p_profile_id" "uuid") IS 'Vérifie si un chatter a accès à un profil spécifique';



CREATE OR REPLACE FUNCTION "public"."check_agency_profile_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_agency_id UUID;
    v_current_count INTEGER;
    v_max_profiles INTEGER;
BEGIN
    -- Trouver l'agence associée
    SELECT a.id, a.max_profiles INTO v_agency_id, v_max_profiles
    FROM agencies a
    WHERE a.user_id = NEW.user_id;
    
    -- Si ce n'est pas une agence, pas de limite
    IF v_agency_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Compter les profils actifs
    SELECT COUNT(*) INTO v_current_count
    FROM creator_profiles
    WHERE user_id = NEW.user_id AND is_active = true;
    
    -- Vérifier la limite
    IF v_current_count >= v_max_profiles THEN
        RAISE EXCEPTION 'Agency profile limit reached. Maximum: %, Current: %', v_max_profiles, v_current_count;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_agency_profile_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_profile_creation_quota"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    v_current_count INTEGER;
    v_is_premium BOOLEAN;
BEGIN
    -- Compter les profils actifs de l'utilisateur
    SELECT COUNT(*) INTO v_current_count
    FROM creator_profiles
    WHERE user_id = NEW.user_id AND is_active = true;
    
    -- Vérifier le statut premium
    SELECT COALESCE(is_creator_subscribed, false) INTO v_is_premium
    FROM profiles
    WHERE id = NEW.user_id;
    
    -- Plan Free: 1 profil max
    IF NOT v_is_premium AND v_current_count >= 1 THEN
        RAISE EXCEPTION 'FREE_PLAN_LIMIT: Upgrade to Premium to create multiple profiles';
    END IF;
    
    -- Plan Premium: illimité (facturation +$10/profil au-delà de 2 se fait côté Stripe)
    -- Pas de limite technique ici
    
    RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."check_profile_creation_quota"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_user_active_profiles"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM creator_profiles
    WHERE user_id = p_user_id
        AND is_active = true;
    
    RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."count_user_active_profiles"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_affiliate_on_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Créer automatiquement un compte affilié pour tout nouvel utilisateur
    INSERT INTO affiliates (user_id, referral_code)
    VALUES (NEW.id, generate_referral_code())
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_affiliate_on_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_referral_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."generate_referral_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_accessible_profiles"("p_user_id" "uuid") RETURNS TABLE("profile_id" "uuid", "username" "text", "display_name" "text", "access_type" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN QUERY
    -- Profils propres de l'utilisateur
    SELECT 
        cp.id,
        cp.username,
        cp.display_name,
        'owner'::TEXT
    FROM creator_profiles cp
    WHERE cp.user_id = p_user_id AND cp.is_active = true
    
    UNION
    
    -- Profils accessibles via agence (pour les chatters)
    SELECT 
        cp.id,
        cp.username,
        cp.display_name,
        'agency_member'::TEXT
    FROM agency_members am
    JOIN creator_profiles cp ON cp.user_id = am.agency_user_id
    WHERE am.chatter_user_id = p_user_id 
        AND am.is_active = true
        AND cp.is_active = true
        AND (
            am.accessible_profile_ids IS NULL 
            OR cp.id = ANY(am.accessible_profile_ids)
        );
END;
$$;


ALTER FUNCTION "public"."get_accessible_profiles"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chatter_accessible_profiles"("p_chatter_user_id" "uuid") RETURNS TABLE("profile_id" "uuid", "username" "text", "display_name" "text", "agency_user_id" "uuid", "permissions" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cp.id,
        cp.username,
        cp.display_name,
        am.agency_user_id,
        am.permissions
    FROM agency_members am
    JOIN creator_profiles cp ON cp.user_id = am.agency_user_id
    WHERE am.chatter_user_id = p_chatter_user_id
        AND am.is_active = true
        AND cp.is_active = true
        AND (
            am.accessible_profile_ids IS NULL 
            OR cp.id = ANY(am.accessible_profile_ids)
        );
END;
$$;


ALTER FUNCTION "public"."get_chatter_accessible_profiles"("p_chatter_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_subscription_details"("p_user_id" "uuid") RETURNS TABLE("profile_count" integer, "base_price_cents" integer, "included_profiles" integer, "additional_profiles" integer, "additional_price_cents" integer, "total_price_cents" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    v_profile_count INTEGER;
    v_base_price INTEGER := 3900;
    v_included_profiles INTEGER := 2;
    v_additional_price_per_profile INTEGER := 1000;
    v_additional_profiles INTEGER;
    v_additional_price_total INTEGER;
BEGIN
    -- Compter les profils actifs
    v_profile_count := count_user_active_profiles(p_user_id);
    
    -- Calculer les profils supplémentaires
    v_additional_profiles := GREATEST(0, v_profile_count - v_included_profiles);
    v_additional_price_total := v_additional_profiles * v_additional_price_per_profile;
    
    RETURN QUERY SELECT
        v_profile_count,
        v_base_price,
        v_included_profiles,
        v_additional_profiles,
        v_additional_price_total,
        v_base_price + v_additional_price_total;
END;
$$;


ALTER FUNCTION "public"."get_subscription_details"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_subscription_details"("p_user_id" "uuid") IS 'Retourne le détail complet de facturation pour un utilisateur';



CREATE OR REPLACE FUNCTION "public"."get_user_profiles"("p_user_id" "uuid") RETURNS TABLE("profile_id" "uuid", "username" "text", "display_name" "text", "is_active" boolean, "profile_views" bigint, "total_links" bigint, "total_sales" bigint, "total_revenue_cents" bigint)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cp.id,
        cp.username,
        cp.display_name,
        cp.is_active,
        cp.profile_view_count,
        COUNT(DISTINCT l.id)::BIGINT,
        COALESCE(SUM(pa.sales_count), 0)::BIGINT,
        COALESCE(SUM(pa.revenue_cents), 0)::BIGINT
    FROM creator_profiles cp
    LEFT JOIN links l ON l.profile_id = cp.id
    LEFT JOIN profile_analytics pa ON pa.profile_id = cp.id
    WHERE cp.user_id = p_user_id
    GROUP BY cp.id, cp.username, cp.display_name, cp.is_active, cp.profile_view_count
    ORDER BY cp.created_at ASC;
END;
$$;


ALTER FUNCTION "public"."get_user_profiles"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, is_creator)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_chatter_of_agency"("p_chatter_user_id" "uuid", "p_agency_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM agency_members
        WHERE chatter_user_id = p_chatter_user_id
            AND agency_user_id = p_agency_user_id
            AND is_active = true
    );
END;
$$;


ALTER FUNCTION "public"."is_chatter_of_agency"("p_chatter_user_id" "uuid", "p_agency_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_profile_count_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_old_count INTEGER;
    v_new_count INTEGER;
    v_old_price INTEGER;
    v_new_price INTEGER;
BEGIN
    -- Compter avant et après
    IF TG_OP = 'INSERT' THEN
        v_old_count := count_user_active_profiles(NEW.user_id) - 1;
        v_new_count := count_user_active_profiles(NEW.user_id);
    ELSIF TG_OP = 'UPDATE' AND OLD.is_active != NEW.is_active THEN
        IF NEW.is_active THEN
            v_old_count := count_user_active_profiles(NEW.user_id) - 1;
            v_new_count := count_user_active_profiles(NEW.user_id);
        ELSE
            v_old_count := count_user_active_profiles(NEW.user_id) + 1;
            v_new_count := count_user_active_profiles(NEW.user_id);
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_old_count := count_user_active_profiles(OLD.user_id) + 1;
        v_new_count := count_user_active_profiles(OLD.user_id);
    ELSE
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculer les prix
    v_old_price := 3900 + (GREATEST(0, v_old_count - 2) * 1000);
    v_new_price := 3900 + (GREATEST(0, v_new_count - 2) * 1000);
    
    -- Logger si le prix a changé
    IF v_old_price != v_new_price THEN
        RAISE NOTICE 'Profile count changed for user %: % → % profiles (Price: %¢ → %¢)', 
            COALESCE(NEW.user_id, OLD.user_id),
            v_old_count,
            v_new_count,
            v_old_price,
            v_new_price;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_profile_count_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_link_click"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Increment link_clicks in profile_analytics using creator_id
    INSERT INTO profile_analytics (profile_id, date, link_clicks)
    VALUES (NEW.creator_id, CURRENT_DATE, 1)
    ON CONFLICT (profile_id, date)
    DO UPDATE SET 
        link_clicks = profile_analytics.link_clicks + 1,
        updated_at = now();
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."track_link_click"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_profile_view"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Only track for creators
    IF NEW.is_creator = true THEN
        -- Increment profile_views in profile_analytics
        INSERT INTO profile_analytics (profile_id, date, profile_views)
        VALUES (NEW.id, CURRENT_DATE, 1)
        ON CONFLICT (profile_id, date)
        DO UPDATE SET 
            profile_views = profile_analytics.profile_views + 1,
            updated_at = now();
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."track_profile_view"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_sale"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_creator_id UUID;
BEGIN
    -- Get the creator_id from the link
    SELECT creator_id INTO v_creator_id
    FROM links
    WHERE id = NEW.link_id;
    
    IF v_creator_id IS NOT NULL THEN
        -- Increment sales and revenue in profile_analytics
        INSERT INTO profile_analytics (profile_id, date, sales_count, revenue_cents)
        VALUES (v_creator_id, CURRENT_DATE, 1, NEW.amount_cents)
        ON CONFLICT (profile_id, date)
        DO UPDATE SET 
            sales_count = profile_analytics.sales_count + 1,
            revenue_cents = profile_analytics.revenue_cents + EXCLUDED.revenue_cents,
            updated_at = now();
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."track_sale"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_links_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_links_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_role"("p_user_id" "uuid", "p_role" "public"."user_role") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles WHERE id = p_user_id AND role = p_role
        UNION
        SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role = p_role AND is_active = true
    );
END;
$$;


ALTER FUNCTION "public"."user_has_role"("p_user_id" "uuid", "p_role" "public"."user_role") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."affiliate_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_method" "text",
    "payment_reference" "text",
    "payment_details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "notes" "text",
    CONSTRAINT "affiliate_payouts_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "affiliate_payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'paid'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."affiliate_payouts" OWNER TO "postgres";


COMMENT ON TABLE "public"."affiliate_payouts" IS 'Historique des paiements de commissions aux affiliés.';



CREATE TABLE IF NOT EXISTS "public"."affiliates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "referral_code" "text" NOT NULL,
    "commission_rate_creator" numeric(5,2) DEFAULT 35.00,
    "commission_rate_fan" numeric(5,2) DEFAULT 5.00,
    "total_referrals" integer DEFAULT 0,
    "total_earnings_cents" bigint DEFAULT 0,
    "payout_method" "text" DEFAULT 'manual'::"text",
    "payout_details" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "affiliates_payout_method_check" CHECK (("payout_method" = ANY (ARRAY['manual'::"text", 'stripe'::"text", 'paypal'::"text"])))
);


ALTER TABLE "public"."affiliates" OWNER TO "postgres";


COMMENT ON TABLE "public"."affiliates" IS 'Comptes affiliés pour le programme de parrainage. Créé automatiquement pour chaque utilisateur.';



COMMENT ON COLUMN "public"."affiliates"."referral_code" IS 'Code de parrainage unique pour tracker les inscriptions (8 caractères).';



CREATE TABLE IF NOT EXISTS "public"."agencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "agency_name" "text" NOT NULL,
    "description" "text",
    "logo_url" "text",
    "website_url" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "country" "text",
    "city" "text",
    "max_profiles" integer DEFAULT 2,
    "max_chatters" integer DEFAULT 5,
    "show_in_directory" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agencies" OWNER TO "postgres";


COMMENT ON TABLE "public"."agencies" IS 'Informations des agences gérant plusieurs profils créateurs.';



CREATE TABLE IF NOT EXISTS "public"."agency_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_user_id" "uuid" NOT NULL,
    "chatter_user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'chatter'::"text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{"can_chat": true, "can_manage_links": false, "can_view_revenue": false, "can_manage_content": false, "can_view_analytics": false}'::"jsonb",
    "accessible_profile_ids" "uuid"[],
    "is_active" boolean DEFAULT true,
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agency_members_role_check" CHECK (("role" = ANY (ARRAY['chatter'::"text", 'manager'::"text"]))),
    CONSTRAINT "no_self_assignment" CHECK (("agency_user_id" <> "chatter_user_id"))
);


ALTER TABLE "public"."agency_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."agency_members" IS 'Chatters et managers d''agence. Un créateur peut inviter des opérateurs pour gérer ses profils.';



COMMENT ON COLUMN "public"."agency_members"."agency_user_id" IS 'Le créateur initial qui a upgradé en agence (2+ profils)';



COMMENT ON COLUMN "public"."agency_members"."chatter_user_id" IS 'L''opérateur invité pour gérer le chat';



COMMENT ON COLUMN "public"."agency_members"."accessible_profile_ids" IS 'Profils accessibles (NULL = tous les profils de l''agence)';



CREATE TABLE IF NOT EXISTS "public"."creator_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "username" "text",
    "display_name" "text",
    "avatar_url" "text",
    "bio" "text",
    "theme_config" "jsonb" DEFAULT '{"preset": "midnight", "gridLayout": "2-col", "buttonStyle": "rounded", "buttonAnimation": "pulse", "showExcluBranding": true, "showVerifiedBadge": false}'::"jsonb",
    "social_links" "jsonb" DEFAULT '{}'::"jsonb",
    "country" "text",
    "city" "text",
    "stripe_account_id" "text",
    "stripe_connect_status" "text" DEFAULT 'not_started'::"text",
    "is_active" boolean DEFAULT true,
    "is_verified" boolean DEFAULT false,
    "show_in_directory" boolean DEFAULT true,
    "profile_view_count" bigint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "creator_profiles_stripe_connect_status_check" CHECK (("stripe_connect_status" = ANY (ARRAY['not_started'::"text", 'pending'::"text", 'active'::"text", 'complete'::"text", 'restricted'::"text", 'blocked'::"text"]))),
    CONSTRAINT "username_format" CHECK ((("username" IS NULL) OR ("username" ~ '^[a-z0-9_-]+$'::"text"))),
    CONSTRAINT "username_length" CHECK ((("username" IS NULL) OR (("char_length"("username") >= 3) AND ("char_length"("username") <= 30))))
);


ALTER TABLE "public"."creator_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."creator_profiles" IS 'Profils créateurs publics. Un utilisateur peut avoir plusieurs profils (multi-profils). Plan Free: 1 profil max. Plan Premium: 2 inclus + $10/profil supplémentaire.';



COMMENT ON COLUMN "public"."creator_profiles"."username" IS '@username public. Peut être NULL si le handle n''était pas défini dans profiles (à compléter par l''utilisateur).';



COMMENT ON COLUMN "public"."creator_profiles"."theme_config" IS 'Configuration visuelle du Link in Bio (couleurs, animations, layout).';



COMMENT ON COLUMN "public"."creator_profiles"."stripe_account_id" IS 'Compte Stripe Connect par profil. Permet des revenus séparés par profil.';



COMMENT ON COLUMN "public"."creator_profiles"."is_verified" IS 'Badge vérifié (réservé aux comptes premium).';



CREATE TABLE IF NOT EXISTS "public"."links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "price_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text",
    "storage_path" "text",
    "click_count" bigint DEFAULT 0 NOT NULL,
    "show_on_profile" boolean DEFAULT true NOT NULL,
    "profile_id" "uuid",
    "is_public" boolean DEFAULT false,
    "mime_type" "text",
    CONSTRAINT "links_price_cents_check" CHECK (("price_cents" >= 0)),
    CONSTRAINT "links_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."links" OWNER TO "postgres";


COMMENT ON COLUMN "public"."links"."storage_path" IS 'Path to the content file in Supabase storage (paid-content bucket)';



COMMENT ON COLUMN "public"."links"."show_on_profile" IS 'Controls whether paid link appears on the public profile page. Default: true';



COMMENT ON COLUMN "public"."links"."is_public" IS 'Controls whether content appears in the public gallery. Only published AND is_public content is accessible to non-owners. Default: false';



COMMENT ON COLUMN "public"."links"."mime_type" IS 'MIME type of the content (e.g., image/jpeg, video/mp4)';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bio" "text",
    "is_creator" boolean DEFAULT true NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "stripe_account_id" "text",
    "handle" "text",
    "stripe_customer_id" "text",
    "is_creator_subscribed" boolean DEFAULT false NOT NULL,
    "stripe_connect_status" "text" DEFAULT 'pending'::"text",
    "theme_color" "text" DEFAULT 'pink'::"text" NOT NULL,
    "social_links" "jsonb" DEFAULT '{}'::"jsonb",
    "show_join_banner" boolean DEFAULT true,
    "country" "text",
    "profile_view_count" bigint DEFAULT 0 NOT NULL,
    "theme_preference" "text" DEFAULT 'dark'::"text",
    "link_order" "jsonb",
    "profile_draft" "jsonb",
    "location" "text",
    "aurora_gradient" "text" DEFAULT 'purple_dream'::"text",
    "content_order" "text"[] DEFAULT '{}'::"text"[],
    "role" "public"."user_role" DEFAULT 'fan'::"public"."user_role" NOT NULL,
    "exclusive_content_text" "text",
    "exclusive_content_link_id" "uuid",
    "exclusive_content_url" "text",
    "exclusive_content_image_url" "text",
    "show_certification" boolean DEFAULT false,
    "show_deeplinks" boolean DEFAULT false,
    "show_available_now" boolean DEFAULT false,
    "stripe_verified_email_sent_at" timestamp with time zone,
    "referral_code" "text",
    "affiliate_earnings_cents" integer DEFAULT 0 NOT NULL,
    "referred_by" "uuid",
    CONSTRAINT "profiles_stripe_connect_status_check" CHECK (("stripe_connect_status" = ANY (ARRAY['pending'::"text", 'complete'::"text", 'restricted'::"text", 'disabled'::"text"]))),
    CONSTRAINT "profiles_theme_preference_check" CHECK (("theme_preference" = ANY (ARRAY['dark'::"text", 'light'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."stripe_connect_status" IS 'Stripe Connect account status: pending, restricted, or complete. Only complete allows receiving payouts.';



COMMENT ON COLUMN "public"."profiles"."social_links" IS 'Social media links and website stored as JSONB. Includes: instagram, twitter, tiktok, youtube, snapchat, telegram, onlyfans, fansly, linktree, website';



COMMENT ON COLUMN "public"."profiles"."profile_view_count" IS 'Total number of profile page visits. Incremented via increment-profile-view Edge Function when users visit /{handle}. Only tracked for creator profiles (is_creator = true).';



COMMENT ON COLUMN "public"."profiles"."theme_preference" IS 'Préférence de thème utilisateur: dark (mode sombre), light (mode clair), system (détection automatique OS)';



COMMENT ON COLUMN "public"."profiles"."aurora_gradient" IS 'Selected Aurora background gradient ID';



COMMENT ON COLUMN "public"."profiles"."role" IS 'Rôle principal de l''utilisateur. Détermine l''interface par défaut.';



CREATE OR REPLACE VIEW "public"."agency_overview" AS
 SELECT "p"."id" AS "user_id",
    "p"."display_name" AS "agency_name",
    "count"(DISTINCT "cp"."id") AS "total_profiles",
    "count"(DISTINCT "am"."id") AS "total_chatters",
    "count"(DISTINCT "am"."id") FILTER (WHERE ("am"."is_active" = true)) AS "active_chatters",
    "sum"("cp"."profile_view_count") AS "total_views",
    "count"(DISTINCT "l"."id") AS "total_links"
   FROM ((("public"."profiles" "p"
     LEFT JOIN "public"."creator_profiles" "cp" ON ((("cp"."user_id" = "p"."id") AND ("cp"."is_active" = true))))
     LEFT JOIN "public"."agency_members" "am" ON (("am"."agency_user_id" = "p"."id")))
     LEFT JOIN "public"."links" "l" ON (("l"."profile_id" = "cp"."id")))
  WHERE ("p"."is_creator" = true)
  GROUP BY "p"."id", "p"."display_name";


ALTER VIEW "public"."agency_overview" OWNER TO "postgres";


COMMENT ON VIEW "public"."agency_overview" IS 'Vue d''ensemble des agences avec leurs profils et chatters';



CREATE OR REPLACE VIEW "public"."agency_stats" AS
 SELECT "a"."id" AS "agency_id",
    "a"."agency_name",
    "count"(DISTINCT "cp"."id") AS "profiles_count",
    "count"(DISTINCT "am"."id") FILTER (WHERE ("am"."is_active" = true)) AS "active_members_count",
    "sum"("cp"."profile_view_count") AS "total_views"
   FROM (("public"."agencies" "a"
     LEFT JOIN "public"."creator_profiles" "cp" ON ((("cp"."user_id" = "a"."user_id") AND ("cp"."is_active" = true))))
     LEFT JOIN "public"."agency_members" "am" ON ((("am"."agency_user_id" = "a"."user_id") AND ("am"."is_active" = true))))
  WHERE ("a"."is_active" = true)
  GROUP BY "a"."id", "a"."agency_name";


ALTER VIEW "public"."agency_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid",
    "title" "text",
    "description" "text",
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "profile_id" "uuid",
    "is_public" boolean DEFAULT false
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."assets"."is_public" IS 'Whether this asset is publicly visible on the creator profile without payment';



CREATE TABLE IF NOT EXISTS "public"."link_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "link_id" "uuid" NOT NULL,
    "asset_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."link_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "stripe_payout_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    CONSTRAINT "payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "profile_views" integer DEFAULT 0,
    "link_clicks" integer DEFAULT 0,
    "sales_count" integer DEFAULT 0,
    "revenue_cents" bigint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_analytics" OWNER TO "postgres";


COMMENT ON TABLE "public"."profile_analytics" IS 'Daily aggregated metrics per creator profile. Each creator profile must have at least one entry to avoid foreign key constraint errors when triggers fire. Fed by triggers on profiles (profile views), links (clicks), and purchases (sales). The profile_id references profiles.id (not creator_profiles).';



COMMENT ON COLUMN "public"."profile_analytics"."date" IS 'Date de la métrique. Une ligne par profil par jour.';



CREATE TABLE IF NOT EXISTS "public"."profile_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profile_links_platform_check" CHECK (("platform" = ANY (ARRAY['onlyfans'::"text", 'fansly'::"text", 'myclub'::"text", 'mym'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."profile_links" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."profile_stats_summary" AS
 SELECT "cp"."id" AS "profile_id",
    "cp"."user_id",
    "cp"."username",
    "cp"."display_name",
    "cp"."is_active",
    "cp"."profile_view_count",
    "count"(DISTINCT "l"."id") AS "total_links",
    "count"(DISTINCT "l"."id") FILTER (WHERE ("l"."status" = 'published'::"text")) AS "published_links",
    COALESCE("sum"("pa"."profile_views"), (0)::bigint) AS "total_profile_views",
    COALESCE("sum"("pa"."link_clicks"), (0)::bigint) AS "total_link_clicks",
    COALESCE("sum"("pa"."sales_count"), (0)::bigint) AS "total_sales",
    COALESCE("sum"("pa"."revenue_cents"), (0)::numeric) AS "total_revenue_cents"
   FROM (("public"."creator_profiles" "cp"
     LEFT JOIN "public"."links" "l" ON (("l"."profile_id" = "cp"."id")))
     LEFT JOIN "public"."profile_analytics" "pa" ON (("pa"."profile_id" = "cp"."id")))
  GROUP BY "cp"."id", "cp"."user_id", "cp"."username", "cp"."display_name", "cp"."is_active", "cp"."profile_view_count";


ALTER VIEW "public"."profile_stats_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "link_id" "uuid" NOT NULL,
    "buyer_email" "text",
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "status" "text" NOT NULL,
    "access_token" "text" NOT NULL,
    "access_expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_session_id" "text",
    "email_sent" boolean DEFAULT false NOT NULL,
    "download_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "purchases_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "purchases_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'succeeded'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."purchases" OWNER TO "postgres";


COMMENT ON TABLE "public"."purchases" IS 'Individual purchase records. Each purchase is linked to a link (content) and tracked in profile_analytics via the auto_track_sale trigger.';



COMMENT ON COLUMN "public"."purchases"."email_sent" IS 'Whether the content access email was successfully sent to the buyer via Brevo';



COMMENT ON COLUMN "public"."purchases"."download_count" IS 'Number of times the buyer has generated signed download URLs for this purchase';



CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_id" "uuid" NOT NULL,
    "referred_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "commission_earned_cents" integer DEFAULT 0 NOT NULL,
    "converted_at" timestamp with time zone,
    "bonus_paid_to_referred" boolean DEFAULT false NOT NULL,
    CONSTRAINT "referrals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'converted'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."referrals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."referrals"."bonus_paid_to_referred" IS 'Indicates if the $100 bonus was paid to the referred user after they reached 1k in revenue within 90 days of signup';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "role_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'Rôles multiples pour un utilisateur. Permet une gestion flexible des permissions.';



CREATE OR REPLACE VIEW "public"."user_active_roles" AS
 SELECT "p"."id" AS "user_id",
    "p"."role" AS "primary_role",
    COALESCE("array_agg"(DISTINCT "ur"."role") FILTER (WHERE ("ur"."is_active" = true)), ARRAY[]::"public"."user_role"[]) AS "additional_roles",
    "p"."is_admin",
    "p"."is_creator"
   FROM ("public"."profiles" "p"
     LEFT JOIN "public"."user_roles" "ur" ON ((("ur"."user_id" = "p"."id") AND ("ur"."is_active" = true))))
  GROUP BY "p"."id", "p"."role", "p"."is_admin", "p"."is_creator";


ALTER VIEW "public"."user_active_roles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_billing_summary" AS
 SELECT "p"."id" AS "user_id",
    "p"."display_name",
    "p"."is_creator_subscribed" AS "is_premium",
    "count"("cp"."id") FILTER (WHERE ("cp"."is_active" = true)) AS "active_profiles",
    "public"."calculate_subscription_price"("p"."id") AS "current_price_cents",
        CASE
            WHEN ("count"("cp"."id") FILTER (WHERE ("cp"."is_active" = true)) >= 2) THEN true
            ELSE false
        END AS "is_multi_profile_user"
   FROM ("public"."profiles" "p"
     LEFT JOIN "public"."creator_profiles" "cp" ON (("cp"."user_id" = "p"."id")))
  WHERE ("p"."is_creator" = true)
  GROUP BY "p"."id", "p"."display_name", "p"."is_creator_subscribed";


ALTER VIEW "public"."user_billing_summary" OWNER TO "postgres";


COMMENT ON VIEW "public"."user_billing_summary" IS 'Résumé de facturation pour chaque utilisateur créateur';



CREATE OR REPLACE VIEW "public"."user_profile_counts" AS
 SELECT "p"."id" AS "user_id",
    "p"."display_name",
    "p"."is_creator",
    "p"."is_creator_subscribed" AS "is_premium",
    "count"("cp"."id") FILTER (WHERE ("cp"."is_active" = true)) AS "active_profiles_count",
    "count"("cp"."id") AS "total_profiles_count",
        CASE
            WHEN ("count"("cp"."id") FILTER (WHERE ("cp"."is_active" = true)) >= 2) THEN true
            ELSE false
        END AS "is_multi_profile_user"
   FROM ("public"."profiles" "p"
     LEFT JOIN "public"."creator_profiles" "cp" ON (("cp"."user_id" = "p"."id")))
  GROUP BY "p"."id", "p"."display_name", "p"."is_creator", "p"."is_creator_subscribed";


ALTER VIEW "public"."user_profile_counts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."agency_members"
    ADD CONSTRAINT "agency_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creator_profiles"
    ADD CONSTRAINT "creator_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creator_profiles"
    ADD CONSTRAINT "creator_profiles_stripe_account_id_key" UNIQUE ("stripe_account_id");



ALTER TABLE ONLY "public"."creator_profiles"
    ADD CONSTRAINT "creator_profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."link_media"
    ADD CONSTRAINT "link_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_analytics"
    ADD CONSTRAINT "profile_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_links"
    ADD CONSTRAINT "profile_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_handle_key" UNIQUE ("handle");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_id_key" UNIQUE ("referred_id");



ALTER TABLE ONLY "public"."agency_members"
    ADD CONSTRAINT "unique_agency_chatter" UNIQUE ("agency_user_id", "chatter_user_id");



ALTER TABLE ONLY "public"."profile_analytics"
    ADD CONSTRAINT "unique_profile_date" UNIQUE ("profile_id", "date");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_affiliate_payouts_affiliate_id" ON "public"."affiliate_payouts" USING "btree" ("affiliate_id");



CREATE INDEX "idx_affiliate_payouts_period" ON "public"."affiliate_payouts" USING "btree" ("period_start", "period_end");



CREATE INDEX "idx_affiliate_payouts_status" ON "public"."affiliate_payouts" USING "btree" ("status");



CREATE INDEX "idx_affiliates_active" ON "public"."affiliates" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_affiliates_referral_code" ON "public"."affiliates" USING "btree" ("referral_code");



CREATE INDEX "idx_affiliates_user_id" ON "public"."affiliates" USING "btree" ("user_id");



CREATE INDEX "idx_agencies_directory" ON "public"."agencies" USING "btree" ("show_in_directory", "is_active") WHERE (("show_in_directory" = true) AND ("is_active" = true));



CREATE INDEX "idx_agencies_user_id" ON "public"."agencies" USING "btree" ("user_id");



CREATE INDEX "idx_agency_members_active" ON "public"."agency_members" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_agency_members_agency" ON "public"."agency_members" USING "btree" ("agency_user_id");



CREATE INDEX "idx_agency_members_chatter" ON "public"."agency_members" USING "btree" ("chatter_user_id");



CREATE INDEX "idx_assets_is_public" ON "public"."assets" USING "btree" ("is_public");



CREATE INDEX "idx_assets_profile_id" ON "public"."assets" USING "btree" ("profile_id");



CREATE INDEX "idx_creator_profiles_active" ON "public"."creator_profiles" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_creator_profiles_directory" ON "public"."creator_profiles" USING "btree" ("show_in_directory", "is_active") WHERE (("show_in_directory" = true) AND ("is_active" = true));



CREATE INDEX "idx_creator_profiles_user_id" ON "public"."creator_profiles" USING "btree" ("user_id");



CREATE INDEX "idx_creator_profiles_username" ON "public"."creator_profiles" USING "btree" ("username") WHERE ("username" IS NOT NULL);



CREATE INDEX "idx_links_is_public" ON "public"."links" USING "btree" ("creator_id", "is_public") WHERE (("is_public" = true) AND ("status" = 'published'::"text"));



CREATE INDEX "idx_links_mime_type" ON "public"."links" USING "btree" ("mime_type");



CREATE INDEX "idx_links_profile_id" ON "public"."links" USING "btree" ("profile_id");



CREATE INDEX "idx_links_show_on_profile" ON "public"."links" USING "btree" ("creator_id", "show_on_profile") WHERE (("show_on_profile" = true) AND ("status" = 'published'::"text"));



CREATE INDEX "idx_links_storage_path" ON "public"."links" USING "btree" ("storage_path");



CREATE INDEX "idx_payouts_creator_id" ON "public"."payouts" USING "btree" ("creator_id");



CREATE INDEX "idx_profile_analytics_date" ON "public"."profile_analytics" USING "btree" ("date" DESC);



CREATE INDEX "idx_profile_analytics_profile_date" ON "public"."profile_analytics" USING "btree" ("profile_id", "date" DESC);



CREATE INDEX "idx_profiles_referral_code" ON "public"."profiles" USING "btree" ("referral_code") WHERE ("referral_code" IS NOT NULL);



CREATE INDEX "idx_profiles_referred_by" ON "public"."profiles" USING "btree" ("referred_by") WHERE ("referred_by" IS NOT NULL);



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_stripe_account_id" ON "public"."profiles" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_profiles_stripe_connect_status" ON "public"."profiles" USING "btree" ("stripe_connect_status") WHERE ("stripe_connect_status" IS NOT NULL);



CREATE INDEX "idx_profiles_stripe_customer_id" ON "public"."profiles" USING "btree" ("stripe_customer_id");



CREATE INDEX "idx_profiles_theme_preference" ON "public"."profiles" USING "btree" ("theme_preference");



CREATE INDEX "idx_profiles_view_count" ON "public"."profiles" USING "btree" ("profile_view_count" DESC);



CREATE INDEX "idx_referrals_referred_id" ON "public"."referrals" USING "btree" ("referred_id");



CREATE INDEX "idx_referrals_referrer_id" ON "public"."referrals" USING "btree" ("referrer_id");



CREATE INDEX "idx_user_roles_active" ON "public"."user_roles" USING "btree" ("user_id", "role") WHERE ("is_active" = true);



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE UNIQUE INDEX "links_slug_unique" ON "public"."links" USING "btree" ("slug");



CREATE INDEX "profile_links_profile_id_idx" ON "public"."profile_links" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "profile_links_profile_platform_key" ON "public"."profile_links" USING "btree" ("profile_id", "platform");



CREATE UNIQUE INDEX "profiles_handle_unique" ON "public"."profiles" USING "btree" ("lower"("handle")) WHERE ("handle" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_handle_unique_ci" ON "public"."profiles" USING "btree" ("lower"("handle"));



CREATE UNIQUE INDEX "purchases_stripe_session_id_key" ON "public"."purchases" USING "btree" ("stripe_session_id");



CREATE UNIQUE INDEX "unique_active_user_role" ON "public"."user_roles" USING "btree" ("user_id", "role") WHERE ("is_active" = true);



CREATE OR REPLACE TRIGGER "auto_create_affiliate" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."create_affiliate_on_signup"();



CREATE OR REPLACE TRIGGER "auto_track_link_click" AFTER UPDATE OF "click_count" ON "public"."links" FOR EACH ROW WHEN ((("new"."click_count" > "old"."click_count") AND ("new"."creator_id" IS NOT NULL))) EXECUTE FUNCTION "public"."track_link_click"();



CREATE OR REPLACE TRIGGER "auto_track_profile_view" AFTER UPDATE OF "profile_view_count" ON "public"."profiles" FOR EACH ROW WHEN ((("new"."profile_view_count" > "old"."profile_view_count") AND ("new"."is_creator" = true))) EXECUTE FUNCTION "public"."track_profile_view"();



CREATE OR REPLACE TRIGGER "auto_track_sale" AFTER INSERT ON "public"."purchases" FOR EACH ROW WHEN (("new"."status" = 'succeeded'::"text")) EXECUTE FUNCTION "public"."track_sale"();



CREATE OR REPLACE TRIGGER "enforce_agency_profile_limit" BEFORE INSERT ON "public"."creator_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."check_agency_profile_limit"();



CREATE OR REPLACE TRIGGER "enforce_profile_quota" BEFORE INSERT ON "public"."creator_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."check_profile_creation_quota"();



CREATE OR REPLACE TRIGGER "notify_profile_count_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."creator_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."log_profile_count_change"();



CREATE OR REPLACE TRIGGER "update_affiliates_updated_at" BEFORE UPDATE ON "public"."affiliates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_agencies_updated_at" BEFORE UPDATE ON "public"."agencies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_agency_members_updated_at" BEFORE UPDATE ON "public"."agency_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_creator_profiles_updated_at" BEFORE UPDATE ON "public"."creator_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_links_updated_at_trigger" BEFORE UPDATE ON "public"."links" FOR EACH ROW EXECUTE FUNCTION "public"."update_links_updated_at"();



CREATE OR REPLACE TRIGGER "update_profile_analytics_updated_at" BEFORE UPDATE ON "public"."profile_analytics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."affiliate_payouts"
    ADD CONSTRAINT "affiliate_payouts_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."affiliates"
    ADD CONSTRAINT "affiliates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agency_members"
    ADD CONSTRAINT "agency_members_agency_user_id_fkey" FOREIGN KEY ("agency_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agency_members"
    ADD CONSTRAINT "agency_members_chatter_user_id_fkey" FOREIGN KEY ("chatter_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."creator_profiles"
    ADD CONSTRAINT "creator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."link_media"
    ADD CONSTRAINT "link_media_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."link_media"
    ADD CONSTRAINT "link_media_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."links"
    ADD CONSTRAINT "links_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_analytics"
    ADD CONSTRAINT "profile_analytics_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_links"
    ADD CONSTRAINT "profile_links_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_exclusive_content_link_id_fkey" FOREIGN KEY ("exclusive_content_link_id") REFERENCES "public"."links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage all roles" ON "public"."user_roles" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Affiliates can view their payouts" ON "public"."affiliate_payouts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."affiliates"
  WHERE (("affiliates"."id" = "affiliate_payouts"."affiliate_id") AND ("affiliates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Agencies can manage their chatters" ON "public"."agency_members" TO "authenticated" USING (("auth"."uid"() = "agency_user_id")) WITH CHECK (("auth"."uid"() = "agency_user_id"));



CREATE POLICY "Agency members can view agency profiles" ON "public"."creator_profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agency_members" "am"
  WHERE (("am"."chatter_user_id" = "auth"."uid"()) AND ("am"."is_active" = true) AND ("am"."agency_user_id" = "creator_profiles"."user_id")))));



CREATE POLICY "Agency owners can manage members" ON "public"."agency_members" TO "authenticated" USING (("agency_user_id" = "auth"."uid"()));



CREATE POLICY "Anon can view published links" ON "public"."links" FOR SELECT TO "anon" USING (("status" = 'published'::"text"));



CREATE POLICY "Chatters can view their membership" ON "public"."agency_members" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "chatter_user_id"));



CREATE POLICY "Chatters can view their memberships" ON "public"."agency_members" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "chatter_user_id"));



CREATE POLICY "Creators can manage own links" ON "public"."links" TO "authenticated" USING (("auth"."uid"() = "creator_id")) WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "Creators can view own links" ON "public"."links" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Creators can view their own payouts" ON "public"."payouts" FOR SELECT USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Creators manage own profile_links" ON "public"."profile_links" USING (("auth"."uid"() = "profile_id")) WITH CHECK (("auth"."uid"() = "profile_id"));



CREATE POLICY "Creators see purchases of their links" ON "public"."purchases" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."links" "l"
  WHERE (("l"."id" = "purchases"."link_id") AND ("l"."creator_id" = "auth"."uid"())))));



CREATE POLICY "Members can view their own membership" ON "public"."agency_members" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "chatter_user_id"));



CREATE POLICY "Profiles are insertable by owner" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Profiles are updatable by owner" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Profiles are viewable by owner" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Public agencies are viewable by everyone" ON "public"."agencies" FOR SELECT USING ((("show_in_directory" = true) AND ("is_active" = true)));



CREATE POLICY "Public can read succeeded purchases by session" ON "public"."purchases" FOR SELECT USING ((("status" = 'succeeded'::"text") AND ("stripe_session_id" IS NOT NULL)));



CREATE POLICY "Public can view creator platform links" ON "public"."profile_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "profile_links"."profile_id") AND ("p"."is_creator" = true)))));



CREATE POLICY "Public can view public content" ON "public"."links" FOR SELECT USING ((("status" = 'published'::"text") AND ("is_public" = true)));



CREATE POLICY "Public can view published links on profile" ON "public"."links" FOR SELECT USING ((("status" = 'published'::"text") AND ("show_on_profile" = true)));



CREATE POLICY "Public creator profiles" ON "public"."profiles" FOR SELECT USING ((("is_creator" = true) AND ("handle" IS NOT NULL)));



CREATE POLICY "Public creator profiles are viewable by everyone" ON "public"."creator_profiles" FOR SELECT USING ((("is_active" = true) AND ("username" IS NOT NULL)));



CREATE POLICY "Referrer can view own referrals" ON "public"."referrals" FOR SELECT USING (("referrer_id" = "auth"."uid"()));



CREATE POLICY "Service role can manage referrals" ON "public"."referrals" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Super-admins can view all links" ON "public"."links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p_admin"
  WHERE (("p_admin"."id" = "auth"."uid"()) AND ("p_admin"."is_admin" = true)))));



CREATE POLICY "Super-admins see all purchases" ON "public"."purchases" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p_admin"
  WHERE (("p_admin"."id" = "auth"."uid"()) AND ("p_admin"."is_admin" = true)))));



CREATE POLICY "Users can delete their own links" ON "public"."links" FOR DELETE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Users can insert their own links" ON "public"."links" FOR INSERT WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "Users can manage their own affiliate account" ON "public"."affiliates" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own agency" ON "public"."agencies" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own creator profiles" ON "public"."creator_profiles" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own profile analytics" ON "public"."profile_analytics" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."creator_profiles"
  WHERE (("creator_profiles"."id" = "profile_analytics"."profile_id") AND ("creator_profiles"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."creator_profiles"
  WHERE (("creator_profiles"."id" = "profile_analytics"."profile_id") AND ("creator_profiles"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own links" ON "public"."links" FOR UPDATE USING (("auth"."uid"() = "creator_id")) WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "Users can view their own affiliate account" ON "public"."affiliates" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own agency" ON "public"."agencies" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own links" ON "public"."links" FOR SELECT USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Users can view their own profile analytics" ON "public"."profile_analytics" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."creator_profiles"
  WHERE (("creator_profiles"."id" = "profile_analytics"."profile_id") AND ("creator_profiles"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."affiliate_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agency_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "creator_assets_owner" ON "public"."assets" USING (("auth"."uid"() = "creator_id")) WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "creator_owns_link_media" ON "public"."link_media" USING ((EXISTS ( SELECT 1
   FROM "public"."links"
  WHERE (("links"."id" = "link_media"."link_id") AND ("links"."creator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."links"
  WHERE (("links"."id" = "link_media"."link_id") AND ("links"."creator_id" = "auth"."uid"())))));



ALTER TABLE "public"."creator_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."link_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."calculate_subscription_price"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_subscription_price"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_subscription_price"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."chatter_has_access_to_profile"("p_chatter_user_id" "uuid", "p_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."chatter_has_access_to_profile"("p_chatter_user_id" "uuid", "p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chatter_has_access_to_profile"("p_chatter_user_id" "uuid", "p_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_agency_profile_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_agency_profile_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_agency_profile_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_profile_creation_quota"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_profile_creation_quota"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_profile_creation_quota"() TO "service_role";



GRANT ALL ON FUNCTION "public"."count_user_active_profiles"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."count_user_active_profiles"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_user_active_profiles"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_affiliate_on_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_affiliate_on_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_affiliate_on_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_referral_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_referral_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_referral_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_accessible_profiles"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_accessible_profiles"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_accessible_profiles"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_chatter_accessible_profiles"("p_chatter_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_chatter_accessible_profiles"("p_chatter_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chatter_accessible_profiles"("p_chatter_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_subscription_details"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_subscription_details"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_subscription_details"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_profiles"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_profiles"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_profiles"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_chatter_of_agency"("p_chatter_user_id" "uuid", "p_agency_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_chatter_of_agency"("p_chatter_user_id" "uuid", "p_agency_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_chatter_of_agency"("p_chatter_user_id" "uuid", "p_agency_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_profile_count_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_profile_count_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_profile_count_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."track_link_click"() TO "anon";
GRANT ALL ON FUNCTION "public"."track_link_click"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_link_click"() TO "service_role";



GRANT ALL ON FUNCTION "public"."track_profile_view"() TO "anon";
GRANT ALL ON FUNCTION "public"."track_profile_view"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_profile_view"() TO "service_role";



GRANT ALL ON FUNCTION "public"."track_sale"() TO "anon";
GRANT ALL ON FUNCTION "public"."track_sale"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_sale"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_links_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_links_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_links_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_role"("p_user_id" "uuid", "p_role" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_role"("p_user_id" "uuid", "p_role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_role"("p_user_id" "uuid", "p_role" "public"."user_role") TO "service_role";


















GRANT ALL ON TABLE "public"."affiliate_payouts" TO "anon";
GRANT ALL ON TABLE "public"."affiliate_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliate_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."affiliates" TO "anon";
GRANT ALL ON TABLE "public"."affiliates" TO "authenticated";
GRANT ALL ON TABLE "public"."affiliates" TO "service_role";



GRANT ALL ON TABLE "public"."agencies" TO "anon";
GRANT ALL ON TABLE "public"."agencies" TO "authenticated";
GRANT ALL ON TABLE "public"."agencies" TO "service_role";



GRANT ALL ON TABLE "public"."agency_members" TO "anon";
GRANT ALL ON TABLE "public"."agency_members" TO "authenticated";
GRANT ALL ON TABLE "public"."agency_members" TO "service_role";



GRANT ALL ON TABLE "public"."creator_profiles" TO "anon";
GRANT ALL ON TABLE "public"."creator_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."creator_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."links" TO "anon";
GRANT ALL ON TABLE "public"."links" TO "authenticated";
GRANT ALL ON TABLE "public"."links" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."agency_overview" TO "anon";
GRANT ALL ON TABLE "public"."agency_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."agency_overview" TO "service_role";



GRANT ALL ON TABLE "public"."agency_stats" TO "anon";
GRANT ALL ON TABLE "public"."agency_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."agency_stats" TO "service_role";



GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."link_media" TO "anon";
GRANT ALL ON TABLE "public"."link_media" TO "authenticated";
GRANT ALL ON TABLE "public"."link_media" TO "service_role";



GRANT ALL ON TABLE "public"."payouts" TO "anon";
GRANT ALL ON TABLE "public"."payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."payouts" TO "service_role";



GRANT ALL ON TABLE "public"."profile_analytics" TO "anon";
GRANT ALL ON TABLE "public"."profile_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."profile_links" TO "anon";
GRANT ALL ON TABLE "public"."profile_links" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_links" TO "service_role";



GRANT ALL ON TABLE "public"."profile_stats_summary" TO "anon";
GRANT ALL ON TABLE "public"."profile_stats_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_stats_summary" TO "service_role";



GRANT ALL ON TABLE "public"."purchases" TO "anon";
GRANT ALL ON TABLE "public"."purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."purchases" TO "service_role";



GRANT ALL ON TABLE "public"."referrals" TO "anon";
GRANT ALL ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_active_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_active_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_active_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_billing_summary" TO "anon";
GRANT ALL ON TABLE "public"."user_billing_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."user_billing_summary" TO "service_role";



GRANT ALL ON TABLE "public"."user_profile_counts" TO "anon";
GRANT ALL ON TABLE "public"."user_profile_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profile_counts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































