-- ============================================================================
-- EXCLU V2 - Migration 007: Theme Preference (Mode Jour/Nuit)
-- ============================================================================
-- Description: Ajout de la préférence de thème utilisateur (dark/light)
--              pour l'évolution 2 du Cahier des Charges
-- 
-- Date: Février 2026
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Ajout de la colonne theme_preference à la table profiles
-- ----------------------------------------------------------------------------

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'dark' 
    CHECK (theme_preference IN ('dark', 'light', 'system'));

-- Créer un index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_profiles_theme_preference ON profiles(theme_preference);

-- Commentaire
COMMENT ON COLUMN profiles.theme_preference IS 'Préférence de thème utilisateur: dark (mode sombre), light (mode clair), system (détection automatique OS)';

-- ============================================================================
-- Résumé de la migration
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'MIGRATION 007 TERMINÉE AVEC SUCCÈS';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Évolution 2: Mode Jour / Nuit';
    RAISE NOTICE '  ✅ Colonne theme_preference ajoutée à profiles';
    RAISE NOTICE '  ✅ Valeurs possibles: dark (défaut), light, system';
    RAISE NOTICE '  ✅ Index créé pour optimisation';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE 'Prochaines étapes:';
    RAISE NOTICE '  1. Implémenter le ThemeProvider React';
    RAISE NOTICE '  2. Créer le composant ThemeToggle';
    RAISE NOTICE '  3. Mettre à jour les styles CSS pour le mode clair';
    RAISE NOTICE '============================================================================';
END $$;
