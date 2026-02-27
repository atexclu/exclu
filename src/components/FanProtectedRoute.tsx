import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

interface FanProtectedRouteProps {
  children: ReactNode;
}

const FanProtectedRoute = ({ children }: FanProtectedRouteProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (!data.session) {
        navigate('/fan/signup', { replace: true });
        setIsLoading(false);
        return;
      }

      setHasSession(true);
      setIsLoading(false);
    };

    checkSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (!session) {
        setHasSession(false);
        navigate('/fan/signup', { replace: true });
      } else {
        setHasSession(true);
      }
    });

    return () => {
      isMounted = false;
      subscription?.subscription.unsubscribe();
    };
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <span className="text-sm text-exclu-space">Loading...</span>
      </div>
    );
  }

  if (!hasSession) {
    return null;
  }

  return <>{children}</>;
};

export default FanProtectedRoute;
