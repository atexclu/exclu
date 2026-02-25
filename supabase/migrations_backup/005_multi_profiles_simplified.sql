-- ============================================================================
-- EXCLU V2 - Migration 005: Multi-Profiles Simplified (Version Corrigée)
-- ============================================================================
-- Description: Implémentation simplifiée du système multi-profils
--              Basée sur les clarifications de la cliente
-- 
-- LOGIQUE SIMPLIFIÉE:
--   - Pas de rôle "agency" distinct
--   - Un compte devient "agence" dès qu'il a 2+ profils
--   - Plan Free: 1 profil max (message upgrade)
--   - Plan Premium: 2 profils inclus, +$10/profil supplémentaire
--   - Stats séparées par profil (views, clicks, sales, revenue)
-- 
-- STRATÉGIE DE MIGRATION:
--   - Compatibilité 100% avec le code existant
--   - Migration automatique des créateurs existants
--   - Gestion des handles manquants (174 créateurs)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ÉTAPE 1: Création de la table creator_profiles pour le multi-profils
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS creator_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Référence au compte utilisateur propriétaire
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Informations publiques du profil créateur
    username TEXT UNIQUE,  -- Peut être NULL temporairement si handle manquant
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
        CHECK (stripe_connect_status IN ('not_started', 'pending', 'active', 'complete', 'restricted', 'blocked')),
    
    -- Statut du profil
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,  -- Badge vérifié (premium)
    
    -- Visibilité dans le directory
    show_in_directory BOOLEAN DEFAULT true,
    
    -- Métriques de base
    profile_view_count BIGINT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Contraintes
    CONSTRAINT username_format CHECK (username IS NULL OR username ~ '^[a-z0-9_-]+$'),
    CONSTRAINT username_length CHECK (username IS NULL OR (char_length(username) >= 3 AND char_length(username) <= 30))
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_creator_profiles_user_id ON creator_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_username ON creator_profiles(username) WHERE username IS NOT NULL;
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
-- ÉTAPE 2: Création de la table profile_analytics pour les stats par profil
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profile_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Référence au profil
    profile_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
    
    -- Date de la métrique
    date DATE NOT NULL,
    
    -- Métriques quotidiennes
    profile_views INTEGER DEFAULT 0,
    link_clicks INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    revenue_cents BIGINT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Contrainte d'unicité: une seule ligne par profil par jour
    CONSTRAINT unique_profile_date UNIQUE (profile_id, date)
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_profile_analytics_profile_date ON profile_analytics(profile_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_profile_analytics_date ON profile_analytics(date DESC);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_profile_analytics_updated_at ON profile_analytics;
CREATE TRIGGER update_profile_analytics_updated_at
    BEFORE UPDATE ON profile_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- ÉTAPE 3: Programme d'affiliation (conservé)
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
-- ÉTAPE 4: Tracking des parrainages
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
-- ÉTAPE 5: Paiements des affiliés
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
-- ÉTAPE 6: Migration des données existantes vers creator_profiles
-- ----------------------------------------------------------------------------

-- Créer un profil créateur pour chaque utilisateur ayant is_creator = true
-- Gestion des handles manquants: username sera NULL et devra être complété plus tard
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
    p.handle,  -- Peut être NULL pour les 174 créateurs sans handle
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
-- ÉTAPE 7: Ajout de la relation profile_id aux tables existantes
-- ----------------------------------------------------------------------------

-- Les liens doivent être associés à un profil créateur spécifique
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
-- ÉTAPE 8: Fonction de vérification du quota de profils
-- ----------------------------------------------------------------------------

-- Fonction pour vérifier le quota avant création d'un nouveau profil
CREATE OR REPLACE FUNCTION check_profile_creation_quota()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Trigger pour vérifier le quota à chaque création de profil
DROP TRIGGER IF EXISTS enforce_profile_quota ON creator_profiles;
CREATE TRIGGER enforce_profile_quota
    BEFORE INSERT ON creator_profiles
    FOR EACH ROW
    EXECUTE FUNCTION check_profile_creation_quota();

-- ----------------------------------------------------------------------------
-- ÉTAPE 9: Fonction pour créer automatiquement un affilié
-- ----------------------------------------------------------------------------

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
-- ÉTAPE 10: Vues SQL pour simplifier les requêtes
-- ----------------------------------------------------------------------------

-- Vue pour obtenir le nombre de profils par utilisateur
CREATE OR REPLACE VIEW user_profile_counts AS
SELECT 
    p.id as user_id,
    p.display_name,
    p.is_creator,
    p.is_creator_subscribed as is_premium,
    COUNT(cp.id) FILTER (WHERE cp.is_active = true) as active_profiles_count,
    COUNT(cp.id) as total_profiles_count,
    CASE 
        WHEN COUNT(cp.id) FILTER (WHERE cp.is_active = true) >= 2 THEN true
        ELSE false
    END as is_multi_profile_user
FROM profiles p
LEFT JOIN creator_profiles cp ON cp.user_id = p.id
GROUP BY p.id, p.display_name, p.is_creator, p.is_creator_subscribed;

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

-- Vue pour les analytics agrégées par profil
CREATE OR REPLACE VIEW profile_stats_summary AS
SELECT 
    cp.id as profile_id,
    cp.user_id,
    cp.username,
    cp.display_name,
    cp.is_active,
    cp.profile_view_count,
    COUNT(DISTINCT l.id) as total_links,
    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'published') as published_links,
    COALESCE(SUM(pa.profile_views), 0) as total_profile_views,
    COALESCE(SUM(pa.link_clicks), 0) as total_link_clicks,
    COALESCE(SUM(pa.sales_count), 0) as total_sales,
    COALESCE(SUM(pa.revenue_cents), 0) as total_revenue_cents
FROM creator_profiles cp
LEFT JOIN links l ON l.profile_id = cp.id
LEFT JOIN profile_analytics pa ON pa.profile_id = cp.id
GROUP BY cp.id, cp.user_id, cp.username, cp.display_name, cp.is_active, cp.profile_view_count;

-- ----------------------------------------------------------------------------
-- ÉTAPE 11: Fonctions utilitaires
-- ----------------------------------------------------------------------------

-- Fonction pour obtenir tous les profils accessibles par un utilisateur
CREATE OR REPLACE FUNCTION get_user_profiles(p_user_id UUID)
RETURNS TABLE (
    profile_id UUID,
    username TEXT,
    display_name TEXT,
    is_active BOOLEAN,
    profile_views BIGINT,
    total_links BIGINT,
    total_sales BIGINT,
    total_revenue_cents BIGINT
) AS $$
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
$$ LANGUAGE plpgsql STABLE;

-- Fonction pour calculer le prix d'abonnement en fonction du nombre de profils
CREATE OR REPLACE FUNCTION calculate_subscription_price(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_profile_count INTEGER;
    v_base_price INTEGER := 3900;  -- $39 en cents
    v_included_profiles INTEGER := 2;
    v_additional_price INTEGER := 1000;  -- $10 en cents
BEGIN
    -- Compter les profils actifs
    SELECT COUNT(*) INTO v_profile_count
    FROM creator_profiles
    WHERE user_id = p_user_id AND is_active = true;
    
    -- Calculer le prix
    IF v_profile_count <= v_included_profiles THEN
        RETURN v_base_price;
    ELSE
        RETURN v_base_price + ((v_profile_count - v_included_profiles) * v_additional_price);
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------------------
-- ÉTAPE 12: Politiques RLS (Row Level Security)
-- ----------------------------------------------------------------------------

-- Activer RLS sur les nouvelles tables
ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;

-- Policies pour creator_profiles
-- Les profils publics actifs sont visibles par tous
DROP POLICY IF EXISTS "Public creator profiles are viewable by everyone" ON creator_profiles;
CREATE POLICY "Public creator profiles are viewable by everyone"
    ON creator_profiles FOR SELECT
    TO public
    USING (is_active = true AND username IS NOT NULL);

-- Les propriétaires peuvent gérer leurs profils
DROP POLICY IF EXISTS "Users can manage their own creator profiles" ON creator_profiles;
CREATE POLICY "Users can manage their own creator profiles"
    ON creator_profiles FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policies pour profile_analytics
DROP POLICY IF EXISTS "Users can view their own profile analytics" ON profile_analytics;
CREATE POLICY "Users can view their own profile analytics"
    ON profile_analytics FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM creator_profiles 
            WHERE id = profile_analytics.profile_id 
            AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage their own profile analytics" ON profile_analytics;
CREATE POLICY "Users can manage their own profile analytics"
    ON profile_analytics FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM creator_profiles 
            WHERE id = profile_analytics.profile_id 
            AND user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM creator_profiles 
            WHERE id = profile_analytics.profile_id 
            AND user_id = auth.uid()
        )
    );

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
-- ÉTAPE 13: Commentaires pour la documentation
-- ----------------------------------------------------------------------------

COMMENT ON TABLE creator_profiles IS 'Profils créateurs publics. Un utilisateur peut avoir plusieurs profils (multi-profils). Plan Free: 1 profil max. Plan Premium: 2 inclus + $10/profil supplémentaire.';
COMMENT ON TABLE profile_analytics IS 'Métriques quotidiennes par profil (views, clicks, sales, revenue). Permet les stats séparées par profil.';
COMMENT ON TABLE affiliates IS 'Comptes affiliés pour le programme de parrainage. Créé automatiquement pour chaque utilisateur.';
COMMENT ON TABLE referrals IS 'Tracking des parrainages effectués par les affiliés.';
COMMENT ON TABLE affiliate_payouts IS 'Historique des paiements de commissions aux affiliés.';

COMMENT ON COLUMN creator_profiles.username IS '@username public. Peut être NULL si le handle n''était pas défini dans profiles (à compléter par l''utilisateur).';
COMMENT ON COLUMN creator_profiles.stripe_account_id IS 'Compte Stripe Connect par profil. Permet des revenus séparés par profil.';
COMMENT ON COLUMN profile_analytics.date IS 'Date de la métrique. Une ligne par profil par jour.';
COMMENT ON COLUMN affiliates.referral_code IS 'Code de parrainage unique pour tracker les inscriptions (8 caractères).';

-- ============================================================================
-- FIN DE LA MIGRATION
-- ============================================================================

-- Afficher un résumé de la migration
DO $$
DECLARE
    v_profiles_count INTEGER;
    v_creator_profiles_count INTEGER;
    v_profiles_with_username INTEGER;
    v_profiles_without_username INTEGER;
    v_affiliates_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_profiles_count FROM profiles;
    SELECT COUNT(*) INTO v_creator_profiles_count FROM creator_profiles;
    SELECT COUNT(*) INTO v_profiles_with_username FROM creator_profiles WHERE username IS NOT NULL;
    SELECT COUNT(*) INTO v_profiles_without_username FROM creator_profiles WHERE username IS NULL;
    SELECT COUNT(*) INTO v_affiliates_count FROM affiliates;
    
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'MIGRATION 005 TERMINÉE AVEC SUCCÈS';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Statistiques:';
    RAISE NOTICE '  - Profils utilisateurs: %', v_profiles_count;
    RAISE NOTICE '  - Profils créateurs migrés: %', v_creator_profiles_count;
    RAISE NOTICE '  - Profils avec username: %', v_profiles_with_username;
    RAISE NOTICE '  - Profils sans username (à compléter): %', v_profiles_without_username;
    RAISE NOTICE '  - Affiliés créés: %', v_affiliates_count;
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Logique de quota:';
    RAISE NOTICE '  - Plan Free: 1 profil max';
    RAISE NOTICE '  - Plan Premium: 2 profils inclus ($39/mois)';
    RAISE NOTICE '  - Profils supplémentaires: +$10/mois par profil';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Prochaines étapes:';
    RAISE NOTICE '  1. Vérifier que les données ont été migrées correctement';
    RAISE NOTICE '  2. Les % profils sans username devront compléter leur @username', v_profiles_without_username;
    RAISE NOTICE '  3. Implémenter l''interface de création de profil supplémentaire';
    RAISE NOTICE '  4. Implémenter le dashboard avec sélecteur de profil';
    RAISE NOTICE '  5. Implémenter la logique de facturation Stripe (+$10/profil)';
    RAISE NOTICE '============================================================================';
END $$;
