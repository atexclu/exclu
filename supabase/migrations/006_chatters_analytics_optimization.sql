-- ============================================================================
-- EXCLU V2 - Migration 006: Chatters, Analytics & Optimization
-- ============================================================================
-- Description: Ajout du support chatters, triggers analytics automatiques,
--              et optimisation de la facturation multi-profils
-- 
-- PRIORITÉS IMPLÉMENTÉES:
--   1. Support Chatters pour les agences
--   2. Alimentation automatique de profile_analytics
--   3. Fonctions de calcul de prix dynamique
-- 
-- Date: Février 2026
-- ============================================================================

-- ============================================================================
-- PRIORITÉ 1: SUPPORT CHATTERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fonction utilitaire pour updated_at (si elle n'existe pas déjà)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Table agency_members - Chatters et managers d'agence
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agency_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Agence propriétaire (le créateur initial qui a upgradé)
    agency_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Chatter (l'opérateur invité)
    chatter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Rôle du membre
    role TEXT NOT NULL DEFAULT 'chatter' CHECK (role IN ('chatter', 'manager')),
    
    -- Permissions granulaires
    permissions JSONB DEFAULT '{
        "can_chat": true,
        "can_view_analytics": false,
        "can_manage_content": false,
        "can_manage_links": false,
        "can_view_revenue": false
    }'::jsonb,
    
    -- Profils accessibles (NULL = tous les profils de l'agence)
    -- Si spécifié, le chatter n'a accès qu'à ces profils
    accessible_profile_ids UUID[],
    
    -- Statut
    is_active BOOLEAN DEFAULT true,
    
    -- Invitation
    invited_at TIMESTAMPTZ DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Contraintes
    CONSTRAINT unique_agency_chatter UNIQUE (agency_user_id, chatter_user_id),
    CONSTRAINT no_self_assignment CHECK (agency_user_id != chatter_user_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_agency_members_agency ON agency_members(agency_user_id);
CREATE INDEX IF NOT EXISTS idx_agency_members_chatter ON agency_members(chatter_user_id);
CREATE INDEX IF NOT EXISTS idx_agency_members_active ON agency_members(is_active) WHERE is_active = true;

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_agency_members_updated_at ON agency_members;
CREATE TRIGGER update_agency_members_updated_at
    BEFORE UPDATE ON agency_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- RLS Policies pour agency_members
-- ----------------------------------------------------------------------------

ALTER TABLE agency_members ENABLE ROW LEVEL SECURITY;

-- Les agences peuvent gérer leurs chatters
DROP POLICY IF EXISTS "Agencies can manage their chatters" ON agency_members;
CREATE POLICY "Agencies can manage their chatters"
    ON agency_members FOR ALL
    TO authenticated
    USING (auth.uid() = agency_user_id)
    WITH CHECK (auth.uid() = agency_user_id);

-- Les chatters peuvent voir leur propre membership
DROP POLICY IF EXISTS "Chatters can view their membership" ON agency_members;
CREATE POLICY "Chatters can view their membership"
    ON agency_members FOR SELECT
    TO authenticated
    USING (auth.uid() = chatter_user_id);

-- ----------------------------------------------------------------------------
-- Fonctions utilitaires pour les chatters
-- ----------------------------------------------------------------------------

-- Fonction pour vérifier si un utilisateur est chatter d'une agence
CREATE OR REPLACE FUNCTION is_chatter_of_agency(
    p_chatter_user_id UUID,
    p_agency_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM agency_members
        WHERE chatter_user_id = p_chatter_user_id
            AND agency_user_id = p_agency_user_id
            AND is_active = true
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Fonction pour obtenir les profils accessibles par un chatter
CREATE OR REPLACE FUNCTION get_chatter_accessible_profiles(p_chatter_user_id UUID)
RETURNS TABLE (
    profile_id UUID,
    username TEXT,
    display_name TEXT,
    agency_user_id UUID,
    permissions JSONB
) AS $$
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Fonction pour vérifier si un chatter a accès à un profil spécifique
CREATE OR REPLACE FUNCTION chatter_has_access_to_profile(
    p_chatter_user_id UUID,
    p_profile_id UUID
)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Vue pour les statistiques des agences
CREATE OR REPLACE VIEW agency_overview AS
SELECT 
    p.id as user_id,
    p.display_name as agency_name,
    COUNT(DISTINCT cp.id) as total_profiles,
    COUNT(DISTINCT am.id) as total_chatters,
    COUNT(DISTINCT am.id) FILTER (WHERE am.is_active = true) as active_chatters,
    SUM(cp.profile_view_count) as total_views,
    COUNT(DISTINCT l.id) as total_links
FROM profiles p
LEFT JOIN creator_profiles cp ON cp.user_id = p.id AND cp.is_active = true
LEFT JOIN agency_members am ON am.agency_user_id = p.id
LEFT JOIN links l ON l.profile_id = cp.id
WHERE p.is_creator = true
GROUP BY p.id, p.display_name;

COMMENT ON VIEW agency_overview IS 'Vue d''ensemble des agences avec leurs profils et chatters';

-- ============================================================================
-- PRIORITÉ 2: ALIMENTATION AUTOMATIQUE DE PROFILE_ANALYTICS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Trigger pour incrémenter automatiquement les vues de profil
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION track_profile_view()
RETURNS TRIGGER AS $$
BEGIN
    -- Incrémenter le compteur dans profile_analytics
    INSERT INTO profile_analytics (profile_id, date, profile_views)
    VALUES (NEW.id, CURRENT_DATE, 1)
    ON CONFLICT (profile_id, date)
    DO UPDATE SET 
        profile_views = profile_analytics.profile_views + 1,
        updated_at = now();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_track_profile_view ON creator_profiles;
CREATE TRIGGER auto_track_profile_view
    AFTER UPDATE OF profile_view_count ON creator_profiles
    FOR EACH ROW
    WHEN (NEW.profile_view_count > OLD.profile_view_count)
    EXECUTE FUNCTION track_profile_view();

-- ----------------------------------------------------------------------------
-- Trigger pour tracker les clicks sur les liens
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION track_link_click()
RETURNS TRIGGER AS $$
BEGIN
    -- Incrémenter les clicks dans profile_analytics
    INSERT INTO profile_analytics (profile_id, date, link_clicks)
    VALUES (NEW.profile_id, CURRENT_DATE, 1)
    ON CONFLICT (profile_id, date)
    DO UPDATE SET 
        link_clicks = profile_analytics.link_clicks + 1,
        updated_at = now();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_track_link_click ON links;
CREATE TRIGGER auto_track_link_click
    AFTER UPDATE OF click_count ON links
    FOR EACH ROW
    WHEN (NEW.click_count > OLD.click_count AND NEW.profile_id IS NOT NULL)
    EXECUTE FUNCTION track_link_click();

-- ----------------------------------------------------------------------------
-- Trigger pour tracker les ventes
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION track_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_profile_id UUID;
BEGIN
    -- Récupérer le profile_id depuis le link
    SELECT profile_id INTO v_profile_id
    FROM links
    WHERE id = NEW.link_id;
    
    IF v_profile_id IS NOT NULL THEN
        -- Incrémenter les ventes et revenus dans profile_analytics
        INSERT INTO profile_analytics (profile_id, date, sales_count, revenue_cents)
        VALUES (v_profile_id, CURRENT_DATE, 1, NEW.amount_cents)
        ON CONFLICT (profile_id, date)
        DO UPDATE SET 
            sales_count = profile_analytics.sales_count + 1,
            revenue_cents = profile_analytics.revenue_cents + EXCLUDED.revenue_cents,
            updated_at = now();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_track_sale ON purchases;
CREATE TRIGGER auto_track_sale
    AFTER INSERT ON purchases
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION track_sale();

-- ----------------------------------------------------------------------------
-- Migration des métriques existantes vers profile_analytics
-- ----------------------------------------------------------------------------

-- Créer une entrée initiale dans profile_analytics pour chaque profil
-- avec les métriques actuelles (pour ne pas perdre l'historique)
INSERT INTO profile_analytics (profile_id, date, profile_views)
SELECT 
    cp.id,
    CURRENT_DATE,
    cp.profile_view_count
FROM creator_profiles cp
WHERE cp.profile_view_count > 0
ON CONFLICT (profile_id, date) DO UPDATE SET
    profile_views = GREATEST(profile_analytics.profile_views, EXCLUDED.profile_views);

-- Calculer les clicks historiques par profil depuis les liens
INSERT INTO profile_analytics (profile_id, date, link_clicks)
SELECT 
    l.profile_id,
    CURRENT_DATE,
    SUM(l.click_count)
FROM links l
WHERE l.profile_id IS NOT NULL
GROUP BY l.profile_id
ON CONFLICT (profile_id, date) DO UPDATE SET
    link_clicks = GREATEST(profile_analytics.link_clicks, EXCLUDED.link_clicks);

-- Calculer les ventes et revenus historiques par profil
INSERT INTO profile_analytics (profile_id, date, sales_count, revenue_cents)
SELECT 
    l.profile_id,
    CURRENT_DATE,
    COUNT(p.id),
    SUM(p.amount_cents)
FROM purchases p
JOIN links l ON l.id = p.link_id
WHERE l.profile_id IS NOT NULL
    AND p.status = 'completed'
GROUP BY l.profile_id
ON CONFLICT (profile_id, date) DO UPDATE SET
    sales_count = GREATEST(profile_analytics.sales_count, EXCLUDED.sales_count),
    revenue_cents = GREATEST(profile_analytics.revenue_cents, EXCLUDED.revenue_cents);

-- ============================================================================
-- PRIORITÉ 3: OPTIMISATION FACTURATION MULTI-PROFILS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fonction pour compter les profils actifs d'un utilisateur
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION count_user_active_profiles(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM creator_profiles
    WHERE user_id = p_user_id
        AND is_active = true;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Fonction pour calculer le prix d'abonnement
-- ----------------------------------------------------------------------------

-- Fonction existante mise à jour pour être plus robuste
CREATE OR REPLACE FUNCTION calculate_subscription_price(p_user_id UUID)
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Fonction pour obtenir le détail de facturation
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_subscription_details(p_user_id UUID)
RETURNS TABLE (
    profile_count INTEGER,
    base_price_cents INTEGER,
    included_profiles INTEGER,
    additional_profiles INTEGER,
    additional_price_cents INTEGER,
    total_price_cents INTEGER
) AS $$
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Trigger pour notifier les changements de prix
-- ----------------------------------------------------------------------------

-- Fonction pour logger les changements de nombre de profils
CREATE OR REPLACE FUNCTION log_profile_count_change()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_profile_count_change ON creator_profiles;
CREATE TRIGGER notify_profile_count_change
    AFTER INSERT OR UPDATE OR DELETE ON creator_profiles
    FOR EACH ROW
    EXECUTE FUNCTION log_profile_count_change();

-- ----------------------------------------------------------------------------
-- Vue pour le dashboard de facturation
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW user_billing_summary AS
SELECT 
    p.id as user_id,
    p.display_name,
    p.is_creator_subscribed as is_premium,
    COUNT(cp.id) FILTER (WHERE cp.is_active = true) as active_profiles,
    calculate_subscription_price(p.id) as current_price_cents,
    CASE 
        WHEN COUNT(cp.id) FILTER (WHERE cp.is_active = true) >= 2 THEN true
        ELSE false
    END as is_multi_profile_user
FROM profiles p
LEFT JOIN creator_profiles cp ON cp.user_id = p.id
WHERE p.is_creator = true
GROUP BY p.id, p.display_name, p.is_creator_subscribed;

COMMENT ON VIEW user_billing_summary IS 'Résumé de facturation pour chaque utilisateur créateur';

-- ============================================================================
-- COMMENTAIRES ET DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE agency_members IS 'Chatters et managers invités par les agences pour gérer les profils';
COMMENT ON COLUMN agency_members.agency_user_id IS 'Le créateur initial qui a upgradé en agence (2+ profils)';
COMMENT ON COLUMN agency_members.chatter_user_id IS 'L''opérateur invité pour gérer le chat';
COMMENT ON COLUMN agency_members.accessible_profile_ids IS 'Profils accessibles (NULL = tous les profils de l''agence)';

COMMENT ON FUNCTION calculate_subscription_price IS 'Calcule le prix d''abonnement: $39 + ($10 × profils supplémentaires au-delà de 2)';
COMMENT ON FUNCTION get_subscription_details IS 'Retourne le détail complet de facturation pour un utilisateur';
COMMENT ON FUNCTION chatter_has_access_to_profile IS 'Vérifie si un chatter a accès à un profil spécifique';

-- ============================================================================
-- RÉSUMÉ DE LA MIGRATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'MIGRATION 006 TERMINÉE AVEC SUCCÈS';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Priorité 1 - Support Chatters:';
    RAISE NOTICE '  ✅ Table agency_members créée';
    RAISE NOTICE '  ✅ RLS policies configurées';
    RAISE NOTICE '  ✅ Fonctions utilitaires créées';
    RAISE NOTICE '';
    RAISE NOTICE 'Priorité 2 - Analytics Automatiques:';
    RAISE NOTICE '  ✅ Triggers pour profile_views créés';
    RAISE NOTICE '  ✅ Triggers pour link_clicks créés';
    RAISE NOTICE '  ✅ Triggers pour sales créés';
    RAISE NOTICE '  ✅ Métriques existantes migrées';
    RAISE NOTICE '';
    RAISE NOTICE 'Priorité 3 - Facturation Optimisée:';
    RAISE NOTICE '  ✅ Fonction calculate_subscription_price améliorée';
    RAISE NOTICE '  ✅ Fonction get_subscription_details créée';
    RAISE NOTICE '  ✅ Trigger de notification créé';
    RAISE NOTICE '  ✅ Vue user_billing_summary créée';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Prochaines étapes:';
    RAISE NOTICE '  1. Tester l''ajout d''un chatter via l''interface';
    RAISE NOTICE '  2. Vérifier que les analytics s''alimentent automatiquement';
    RAISE NOTICE '  3. Intégrer le calcul de prix avec Stripe';
    RAISE NOTICE '============================================================================';
END $$;
