-- ============================================================================
-- EXCLU V2 - Migration 004: User Roles & Multi-Profiles Architecture
-- ============================================================================
-- Description: Implémentation robuste et scalable du système de rôles utilisateurs
--              et de la gestion multi-profils pour les agences
-- 
-- Évolution: 1.2 du Cahier des Charges V2
-- Date: Février 2026
-- 
-- RÔLES SUPPORTÉS:
--   1. Fan - Visiteur/acheteur de contenu
--   2. Créateur Individuel - Modèle indépendant
--   3. Agence - Gestionnaire multi-profils
--   4. Chatter - Opérateur de vente
--   5. Affilié - Partenaire de recrutement
--   6. Admin EXCLU - Équipe interne
-- 
-- STRATÉGIE DE MIGRATION:
--   - Maintien de la compatibilité avec le code existant
--   - Migration progressive sans rupture de service
--   - Séparation claire entre comptes utilisateurs et profils créateurs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ÉTAPE 1: Création du type ENUM pour les rôles utilisateurs
-- ----------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'fan',              -- Visiteur/acheteur de contenu
        'creator',          -- Créateur individuel
        'agency',           -- Gestionnaire multi-profils
        'chatter',          -- Opérateur de vente pour agences
        'affiliate',        -- Partenaire de recrutement
        'admin'             -- Équipe interne EXCLU
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- ÉTAPE 2: Ajout de la colonne role à la table profiles
-- ----------------------------------------------------------------------------

-- Ajout de la colonne role avec une valeur par défaut intelligente
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role user_role;

-- Migration des données existantes vers le nouveau système de rôles
-- Priorité: admin > creator > fan (par défaut)
UPDATE profiles
SET role = CASE
    WHEN is_admin = true THEN 'admin'::user_role
    WHEN is_creator = true THEN 'creator'::user_role
    ELSE 'fan'::user_role
END
WHERE role IS NULL;

-- Rendre la colonne NOT NULL après la migration des données
ALTER TABLE profiles 
ALTER COLUMN role SET NOT NULL,
ALTER COLUMN role SET DEFAULT 'fan'::user_role;

-- Créer un index pour optimiser les requêtes par rôle
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ----------------------------------------------------------------------------
-- ÉTAPE 3: Création de la table creator_profiles pour le multi-profils
-- ----------------------------------------------------------------------------

-- Cette table permet à un utilisateur (notamment les agences) de gérer
-- plusieurs identités de créateur distinctes
CREATE TABLE IF NOT EXISTS creator_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Référence au compte utilisateur propriétaire
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Informations publiques du profil créateur
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    
    -- Configuration visuelle (Link in Bio)
    theme_config JSONB DEFAULT '{
        "preset": "midnight",
        "buttonStyle": "rounded",
        "buttonAnimation": "pulse",
        "gridLayout": "2-col",
        "showExcluBranding": true,
        "showVerifiedBadge": false
    }'::jsonb,
    
    -- Réseaux sociaux
    social_links JSONB DEFAULT '{}'::jsonb,
    
    -- Localisation
    country TEXT,
    city TEXT,
    
    -- Stripe Connect (un compte Stripe par profil)
    stripe_account_id TEXT UNIQUE,
    stripe_connect_status TEXT DEFAULT 'not_started' 
        CHECK (stripe_connect_status IN ('not_started', 'pending', 'active', 'restricted', 'blocked')),
    
    -- Statut du profil
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,  -- Badge vérifié (premium)
    
    -- Visibilité dans le directory
    show_in_directory BOOLEAN DEFAULT true,
    
    -- Métriques
    profile_view_count BIGINT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Contraintes
    CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_-]+$'),
    CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 30)
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_creator_profiles_user_id ON creator_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_username ON creator_profiles(username);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_active ON creator_profiles(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_creator_profiles_directory ON creator_profiles(show_in_directory, is_active) 
    WHERE show_in_directory = true AND is_active = true;

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_creator_profiles_updated_at ON creator_profiles;
CREATE TRIGGER update_creator_profiles_updated_at
    BEFORE UPDATE ON creator_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- ÉTAPE 4: Création de la table user_roles pour les rôles multiples
-- ----------------------------------------------------------------------------

-- Un utilisateur peut avoir plusieurs rôles (ex: créateur + affilié)
-- Cette table permet une gestion flexible des permissions
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    
    -- Métadonnées spécifiques au rôle
    role_metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Statut du rôle
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

-- Contrainte d'unicité: un utilisateur ne peut avoir qu'une seule instance active d'un rôle
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_user_role 
    ON user_roles(user_id, role) 
    WHERE is_active = true;

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(user_id, role) WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- ÉTAPE 5: Création de la table agencies pour les agences
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Référence au compte utilisateur de l'agence
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Informations de l'agence
    agency_name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    website_url TEXT,
    
    -- Contact
    contact_email TEXT,
    contact_phone TEXT,
    
    -- Localisation
    country TEXT,
    city TEXT,
    
    -- Configuration
    max_profiles INTEGER DEFAULT 2,  -- Nombre max de profils gérables
    max_chatters INTEGER DEFAULT 5,  -- Nombre max de chatters
    
    -- Visibilité
    show_in_directory BOOLEAN DEFAULT false,
    
    -- Statut
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_agencies_user_id ON agencies(user_id);
CREATE INDEX IF NOT EXISTS idx_agencies_directory ON agencies(show_in_directory, is_active) 
    WHERE show_in_directory = true AND is_active = true;

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_agencies_updated_at ON agencies;
CREATE TRIGGER update_agencies_updated_at
    BEFORE UPDATE ON agencies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- ÉTAPE 6: Création de la table agency_members pour les chatters
-- ----------------------------------------------------------------------------

-- Gestion des membres d'une agence (chatters, managers, etc.)
CREATE TABLE IF NOT EXISTS agency_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Références
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Type de membre
    member_type TEXT NOT NULL DEFAULT 'chatter' 
        CHECK (member_type IN ('owner', 'manager', 'chatter')),
    
    -- Permissions
    permissions JSONB DEFAULT '{
        "can_chat": true,
        "can_view_analytics": false,
        "can_manage_content": false,
        "can_manage_members": false
    }'::jsonb,
    
    -- Profils accessibles (NULL = tous les profils de l'agence)
    accessible_profile_ids UUID[],
    
    -- Statut
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at TIMESTAMPTZ
);

-- Contrainte d'unicité
-- NOTE: Ces index sont commentés car la migration 006 redéfinit agency_members avec une structure différente
-- CREATE UNIQUE INDEX IF NOT EXISTS unique_active_agency_member 
--     ON agency_members(agency_id, user_id) 
--     WHERE is_active = true;

-- Index
-- CREATE INDEX IF NOT EXISTS idx_agency_members_agency_id ON agency_members(agency_id);
-- CREATE INDEX IF NOT EXISTS idx_agency_members_user_id ON agency_members(user_id);
-- CREATE INDEX IF NOT EXISTS idx_agency_members_active ON agency_members(agency_id, is_active) 
--     WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- ÉTAPE 7: Création de la table affiliates pour le programme d'affiliation
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Référence au compte utilisateur
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Code de parrainage unique
    referral_code TEXT UNIQUE NOT NULL,
    
    -- Configuration des commissions
    commission_rate_creator DECIMAL(5,2) DEFAULT 35.00,  -- % sur abonnement créateur
    commission_rate_fan DECIMAL(5,2) DEFAULT 5.00,       -- % sur première transaction fan
    
    -- Métriques
    total_referrals INTEGER DEFAULT 0,
    total_earnings_cents BIGINT DEFAULT 0,
    
    -- Paiement
    payout_method TEXT DEFAULT 'manual' 
        CHECK (payout_method IN ('manual', 'stripe', 'paypal')),
    payout_details JSONB DEFAULT '{}'::jsonb,
    
    -- Statut
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_referral_code ON affiliates(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_active ON affiliates(is_active) WHERE is_active = true;

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_affiliates_updated_at ON affiliates;
CREATE TRIGGER update_affiliates_updated_at
    BEFORE UPDATE ON affiliates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour générer un code de parrainage unique
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- ÉTAPE 8: Création de la table referrals pour tracker les parrainages
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Références
    affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Type de parrainage
    referral_type TEXT NOT NULL CHECK (referral_type IN ('creator', 'fan')),
    
    -- Statut
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'active', 'converted', 'churned')),
    
    -- Métriques de conversion
    converted_at TIMESTAMPTZ,
    churned_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Contrainte d'unicité: un utilisateur ne peut être parrainé qu'une seule fois
    CONSTRAINT unique_referral UNIQUE (referred_user_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_referrals_affiliate_id ON referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_user_id ON referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- ----------------------------------------------------------------------------
-- ÉTAPE 9: Création de la table affiliate_payouts pour les paiements
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS affiliate_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Référence
    affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    
    -- Montant
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL DEFAULT 'EUR',
    
    -- Période couverte
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Statut
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
    
    -- Détails du paiement
    payment_method TEXT,
    payment_reference TEXT,
    payment_details JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ,
    
    -- Notes
    notes TEXT
);

-- Index
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate_id ON affiliate_payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status ON affiliate_payouts(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_period ON affiliate_payouts(period_start, period_end);

-- ----------------------------------------------------------------------------
-- ÉTAPE 10: Migration des données existantes vers creator_profiles
-- ----------------------------------------------------------------------------

-- Créer un profil créateur pour chaque utilisateur ayant is_creator = true
-- Cela maintient la compatibilité avec le code existant
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
    created_at
)
SELECT 
    p.id,
    COALESCE(p.handle, 'user_' || substring(p.id::text from 1 for 8)),  -- Utiliser handle ou générer un username
    p.display_name,
    p.avatar_url,
    p.bio,
    COALESCE(p.social_links, '{}'::jsonb),
    p.country,
    p.stripe_account_id,
    COALESCE(p.stripe_connect_status, 'not_started'),
    COALESCE(p.profile_view_count, 0),
    p.created_at
FROM profiles p
WHERE p.is_creator = true
    AND NOT EXISTS (
        SELECT 1 FROM creator_profiles cp WHERE cp.user_id = p.id
    );

-- ----------------------------------------------------------------------------
-- ÉTAPE 11: Ajout de la relation profile_id aux tables existantes
-- ----------------------------------------------------------------------------

-- Les liens doivent être associés à un profil créateur spécifique
-- (important pour le multi-profils)
ALTER TABLE links 
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES creator_profiles(id) ON DELETE CASCADE;

-- Migrer les liens existants vers les profils créateurs
UPDATE links l
SET profile_id = cp.id
FROM creator_profiles cp
WHERE l.creator_id = cp.user_id
    AND l.profile_id IS NULL;

-- Créer un index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_links_profile_id ON links(profile_id);

-- Les assets doivent également être associés à un profil
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES creator_profiles(id) ON DELETE CASCADE;

-- Migrer les assets existants
UPDATE assets a
SET profile_id = cp.id
FROM creator_profiles cp
WHERE a.creator_id = cp.user_id
    AND a.profile_id IS NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_assets_profile_id ON assets(profile_id);

-- ----------------------------------------------------------------------------
-- ÉTAPE 12: Création des vues pour simplifier les requêtes
-- ----------------------------------------------------------------------------

-- Vue pour obtenir tous les rôles actifs d'un utilisateur
CREATE OR REPLACE VIEW user_active_roles AS
SELECT 
    p.id as user_id,
    p.role as primary_role,
    COALESCE(
        array_agg(DISTINCT ur.role) FILTER (WHERE ur.is_active = true),
        ARRAY[]::user_role[]
    ) as additional_roles,
    p.is_admin,
    p.is_creator
FROM profiles p
LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.is_active = true
GROUP BY p.id, p.role, p.is_admin, p.is_creator;

-- Vue pour les statistiques des agences
CREATE OR REPLACE VIEW agency_stats AS
SELECT 
    a.id as agency_id,
    a.agency_name,
    COUNT(DISTINCT cp.id) as profiles_count,
    COUNT(DISTINCT am.id) FILTER (WHERE am.is_active = true) as active_members_count,
    SUM(cp.profile_view_count) as total_views
FROM agencies a
LEFT JOIN creator_profiles cp ON cp.user_id = a.user_id AND cp.is_active = true
LEFT JOIN agency_members am ON am.agency_user_id = a.user_id AND am.is_active = true
WHERE a.is_active = true
GROUP BY a.id, a.agency_name;

-- Vue pour les statistiques des affiliés
CREATE OR REPLACE VIEW affiliate_stats AS
SELECT 
    af.id as affiliate_id,
    af.user_id,
    af.referral_code,
    COUNT(DISTINCT r.id) as total_referrals,
    COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'converted') as converted_referrals,
    COUNT(DISTINCT r.id) FILTER (WHERE r.referral_type = 'creator') as creator_referrals,
    COUNT(DISTINCT r.id) FILTER (WHERE r.referral_type = 'fan') as fan_referrals,
    COALESCE(SUM(ap.amount_cents) FILTER (WHERE ap.status = 'paid'), 0) as total_paid_cents,
    COALESCE(SUM(ap.amount_cents) FILTER (WHERE ap.status = 'pending'), 0) as pending_payout_cents
FROM affiliates af
LEFT JOIN referrals r ON r.affiliate_id = af.id
LEFT JOIN affiliate_payouts ap ON ap.affiliate_id = af.id
WHERE af.is_active = true
GROUP BY af.id, af.user_id, af.referral_code;

-- ----------------------------------------------------------------------------
-- ÉTAPE 13: Fonctions utilitaires
-- ----------------------------------------------------------------------------

-- Fonction pour vérifier si un utilisateur a un rôle spécifique
CREATE OR REPLACE FUNCTION user_has_role(p_user_id UUID, p_role user_role)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles WHERE id = p_user_id AND role = p_role
        UNION
        SELECT 1 FROM user_roles WHERE user_id = p_user_id AND role = p_role AND is_active = true
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Fonction pour obtenir tous les profils accessibles par un utilisateur
CREATE OR REPLACE FUNCTION get_accessible_profiles(p_user_id UUID)
RETURNS TABLE (
    profile_id UUID,
    username TEXT,
    display_name TEXT,
    access_type TEXT
) AS $$
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
$$ LANGUAGE plpgsql STABLE;

-- Fonction pour créer automatiquement un affilié lors de la création d'un compte
CREATE OR REPLACE FUNCTION create_affiliate_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    -- Créer automatiquement un compte affilié pour tout nouvel utilisateur
    INSERT INTO affiliates (user_id, referral_code)
    VALUES (NEW.id, generate_referral_code())
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour créer automatiquement un affilié
DROP TRIGGER IF EXISTS auto_create_affiliate ON profiles;
CREATE TRIGGER auto_create_affiliate
    AFTER INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_affiliate_on_signup();

-- ----------------------------------------------------------------------------
-- ÉTAPE 14: Politiques RLS (Row Level Security)
-- ----------------------------------------------------------------------------

-- Activer RLS sur les nouvelles tables
ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;

-- Policies pour creator_profiles
-- Les profils publics sont visibles par tous
DROP POLICY IF EXISTS "Public creator profiles are viewable by everyone" ON creator_profiles;
CREATE POLICY "Public creator profiles are viewable by everyone"
    ON creator_profiles FOR SELECT
    TO public
    USING (is_active = true);

-- Les propriétaires peuvent gérer leurs profils
DROP POLICY IF EXISTS "Users can manage their own creator profiles" ON creator_profiles;
CREATE POLICY "Users can manage their own creator profiles"
    ON creator_profiles FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Les membres d'agence peuvent voir les profils de leur agence
DROP POLICY IF EXISTS "Agency members can view agency profiles" ON creator_profiles;
CREATE POLICY "Agency members can view agency profiles"
    ON creator_profiles FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM agency_members am
            WHERE am.chatter_user_id = auth.uid()
                AND am.is_active = true
                AND am.agency_user_id = creator_profiles.user_id
        )
    );

-- Policies pour user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
CREATE POLICY "Users can view their own roles"
    ON user_roles FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Seuls les admins peuvent modifier les rôles
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;
CREATE POLICY "Admins can manage all roles"
    ON user_roles FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Policies pour agencies
DROP POLICY IF EXISTS "Users can view their own agency" ON agencies;
CREATE POLICY "Users can view their own agency"
    ON agencies FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own agency" ON agencies;
CREATE POLICY "Users can manage their own agency"
    ON agencies FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Les agences publiques sont visibles par tous
DROP POLICY IF EXISTS "Public agencies are viewable by everyone" ON agencies;
CREATE POLICY "Public agencies are viewable by everyone"
    ON agencies FOR SELECT
    TO public
    USING (show_in_directory = true AND is_active = true);

-- Policies pour agency_members
DROP POLICY IF EXISTS "Agency owners can manage members" ON agency_members;
CREATE POLICY "Agency owners can manage members"
    ON agency_members FOR ALL
    TO authenticated
    USING (
        agency_members.agency_user_id = auth.uid()
    );

DROP POLICY IF EXISTS "Members can view their own membership" ON agency_members;
CREATE POLICY "Members can view their own membership"
    ON agency_members FOR SELECT
    TO authenticated
    USING (auth.uid() = chatter_user_id);

-- Policies pour affiliates
DROP POLICY IF EXISTS "Users can view their own affiliate account" ON affiliates;
CREATE POLICY "Users can view their own affiliate account"
    ON affiliates FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own affiliate account" ON affiliates;
CREATE POLICY "Users can manage their own affiliate account"
    ON affiliates FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policies pour referrals
DROP POLICY IF EXISTS "Affiliates can view their referrals" ON referrals;
CREATE POLICY "Affiliates can view their referrals"
    ON referrals FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM affiliates WHERE id = referrals.affiliate_id AND user_id = auth.uid()
        )
    );

-- Policies pour affiliate_payouts
DROP POLICY IF EXISTS "Affiliates can view their payouts" ON affiliate_payouts;
CREATE POLICY "Affiliates can view their payouts"
    ON affiliate_payouts FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM affiliates WHERE id = affiliate_payouts.affiliate_id AND user_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- ÉTAPE 15: Contraintes et validations supplémentaires
-- ----------------------------------------------------------------------------

-- Vérifier que les agences ne dépassent pas leur quota de profils
CREATE OR REPLACE FUNCTION check_agency_profile_limit()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_agency_profile_limit ON creator_profiles;
CREATE TRIGGER enforce_agency_profile_limit
    BEFORE INSERT ON creator_profiles
    FOR EACH ROW
    EXECUTE FUNCTION check_agency_profile_limit();

-- ----------------------------------------------------------------------------
-- ÉTAPE 16: Commentaires pour la documentation
-- ----------------------------------------------------------------------------

COMMENT ON TABLE creator_profiles IS 'Profils créateurs publics. Un utilisateur peut avoir plusieurs profils (multi-profils pour agences).';
COMMENT ON TABLE user_roles IS 'Rôles multiples pour un utilisateur. Permet une gestion flexible des permissions.';
COMMENT ON TABLE agencies IS 'Informations des agences gérant plusieurs profils créateurs.';
COMMENT ON TABLE agency_members IS 'Membres d''une agence (chatters, managers). Gère les accès aux profils.';
COMMENT ON TABLE affiliates IS 'Comptes affiliés pour le programme de parrainage.';
COMMENT ON TABLE referrals IS 'Tracking des parrainages effectués par les affiliés.';
COMMENT ON TABLE affiliate_payouts IS 'Historique des paiements de commissions aux affiliés.';

COMMENT ON COLUMN profiles.role IS 'Rôle principal de l''utilisateur. Détermine l''interface par défaut.';
COMMENT ON COLUMN creator_profiles.theme_config IS 'Configuration visuelle du Link in Bio (couleurs, animations, layout).';
COMMENT ON COLUMN creator_profiles.is_verified IS 'Badge vérifié (réservé aux comptes premium).';
COMMENT ON COLUMN agency_members.accessible_profile_ids IS 'Liste des profils accessibles. NULL = tous les profils de l''agence.';
COMMENT ON COLUMN affiliates.referral_code IS 'Code de parrainage unique pour tracker les inscriptions.';

-- ============================================================================
-- FIN DE LA MIGRATION
-- ============================================================================

-- Afficher un résumé de la migration
DO $$
DECLARE
    v_profiles_count INTEGER;
    v_creator_profiles_count INTEGER;
    v_agencies_count INTEGER;
    v_affiliates_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_profiles_count FROM profiles;
    SELECT COUNT(*) INTO v_creator_profiles_count FROM creator_profiles;
    SELECT COUNT(*) INTO v_agencies_count FROM agencies;
    SELECT COUNT(*) INTO v_affiliates_count FROM affiliates;
    
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'MIGRATION 004 TERMINÉE AVEC SUCCÈS';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Statistiques:';
    RAISE NOTICE '  - Profils utilisateurs: %', v_profiles_count;
    RAISE NOTICE '  - Profils créateurs: %', v_creator_profiles_count;
    RAISE NOTICE '  - Agences: %', v_agencies_count;
    RAISE NOTICE '  - Affiliés: %', v_affiliates_count;
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Prochaines étapes:';
    RAISE NOTICE '  1. Vérifier que les données ont été migrées correctement';
    RAISE NOTICE '  2. Tester les policies RLS avec différents rôles';
    RAISE NOTICE '  3. Mettre à jour le code frontend pour utiliser creator_profiles';
    RAISE NOTICE '  4. Implémenter les interfaces pour agences et affiliés';
    RAISE NOTICE '============================================================================';
END $$;
