import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Détecter la préférence système
  const getSystemTheme = (): ResolvedTheme => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  };

  // Résoudre le thème (system → dark/light)
  const resolveTheme = (themeValue: Theme): ResolvedTheme => {
    if (themeValue === 'system') {
      return getSystemTheme();
    }
    return themeValue;
  };

  // Appliquer le thème au DOM avec transition fluide
  const applyTheme = (resolved: ResolvedTheme) => {
    const root = document.documentElement;
    
    // Force dark mode on landing page and auth page
    const pathname = window.location.pathname;
    if (pathname === '/' || pathname === '/auth') {
      root.classList.add('dark');
      root.classList.remove('light');
      setResolvedTheme('dark');
      return;
    }
    
    // Ajouter une classe de transition temporaire
    root.style.setProperty('transition', 'background-color 300ms ease, color 300ms ease');
    
    // Appliquer le thème
    if (resolved === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
    
    // Retirer la transition après l'animation
    setTimeout(() => {
      root.style.removeProperty('transition');
    }, 300);
    
    setResolvedTheme(resolved);
  };

  // Charger le thème au démarrage
  useEffect(() => {
    const loadTheme = async () => {
      try {
        // Vérifier si l'utilisateur est connecté
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          setUserId(user.id);
          
          // Charger la préférence depuis la base de données
          const { data: profile } = await supabase
            .from('profiles')
            .select('theme_preference')
            .eq('id', user.id)
            .single();
          
          if (profile?.theme_preference) {
            const userTheme = profile.theme_preference as Theme;
            setThemeState(userTheme);
            applyTheme(resolveTheme(userTheme));
          } else {
            // Pas de préférence en base, utiliser system
            const systemTheme = getSystemTheme();
            setThemeState('system');
            applyTheme(systemTheme);
          }
        } else {
          // Utilisateur non connecté, utiliser localStorage
          const savedTheme = localStorage.getItem('exclu-theme') as Theme | null;
          
          if (savedTheme) {
            setThemeState(savedTheme);
            applyTheme(resolveTheme(savedTheme));
          } else {
            // Première visite, détecter la préférence système
            const systemTheme = getSystemTheme();
            setThemeState('system');
            applyTheme(systemTheme);
          }
        }
      } catch (error) {
        console.error('Error loading theme:', error);
        // En cas d'erreur, utiliser dark par défaut
        applyTheme('dark');
      } finally {
        setIsLoading(false);
      }
    };

    loadTheme();
  }, []);

  // Écouter les changements de préférence système
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const newResolvedTheme = e.matches ? 'dark' : 'light';
      applyTheme(newResolvedTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Fonction pour changer le thème
  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    const resolved = resolveTheme(newTheme);
    applyTheme(resolved);

    try {
      // Vérifier si l'utilisateur est connecté au moment du changement
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Utilisateur connecté, sauvegarder en base
        await supabase
          .from('profiles')
          .update({ theme_preference: newTheme })
          .eq('id', user.id);
      } else {
        // Utilisateur non connecté, sauvegarder en localStorage
        localStorage.setItem('exclu-theme', newTheme);
      }
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
