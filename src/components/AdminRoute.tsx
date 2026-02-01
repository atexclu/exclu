import { ReactNode, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

interface AdminRouteProps {
  children: ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const checkAdminAccess = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (!sessionData.session) {
        navigate('/auth', { replace: true });
        setIsLoading(false);
        return;
      }

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
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (profileError) {
        console.error('Error loading profile in AdminRoute', profileError);
        navigate('/app', { replace: true });
        setIsLoading(false);
        return;
      }

      if (!profile?.is_admin) {
        // Not an admin: redirect to main app or a 404 page.
        navigate('/app', { replace: true, state: { from: location.pathname } });
        setIsLoading(false);
        return;
      }

      setIsAllowed(true);
      setIsLoading(false);
    };

    checkAdminAccess();

    return () => {
      isMounted = false;
    };
  }, [navigate, location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <span className="text-sm text-exclu-space">Checking admin access...</span>
      </div>
    );
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
};

export default AdminRoute;
