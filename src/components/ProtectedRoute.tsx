import { ReactNode, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const checkSessionAndProfile = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (!data.session) {
        navigate('/auth', { replace: true });
        setIsLoading(false);
        return;
      }

      setHasSession(true);

      // Ne pas forcer l'onboarding si on est déjà sur /onboarding
      if (location.pathname.startsWith('/onboarding')) {
        setIsLoading(false);
        return;
      }

      // Vérifier si le profil du user courant a un handle défini
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (userError || !user) {
        navigate('/auth', { replace: true });
        setIsLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('handle')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        // On ne casse pas la navigation si le profil est manquant, mais on logue l'erreur
        console.error('Error loading profile in ProtectedRoute', profileError);
      }

      if (!profile?.handle) {
        navigate('/onboarding', { replace: true });
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
    };

    checkSessionAndProfile();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (!session) {
        setHasSession(false);
        navigate('/auth', { replace: true });
      } else {
        setHasSession(true);
      }
    });

    return () => {
      isMounted = false;
      subscription?.subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <span className="text-sm text-exclu-space">Loading your session...</span>
      </div>
    );
  }

  if (!hasSession) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
