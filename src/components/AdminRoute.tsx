import { ReactNode, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

interface AdminRouteProps {
  children: ReactNode;
}

// Cache admin status for the session to avoid repeated checks
let cachedAdminUserId: string | null = null;

const AdminRoute = ({ children }: AdminRouteProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const navigate = useNavigate();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    let isMounted = true;

    const checkAdminAccess = async () => {
      try {
        // Fast path: if we already verified this user is admin
        if (cachedAdminUserId) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user && user.id === cachedAdminUserId) {
            if (isMounted) { setIsAllowed(true); setIsLoading(false); }
            return;
          }
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (!sessionData.session) {
          navigate('/auth', { replace: true });
          setIsLoading(false);
          return;
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (!isMounted) return;

        if (userError || !user) {
          navigate('/auth', { replace: true });
          setIsLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .maybeSingle();

        if (!isMounted) return;

        if (!profile?.is_admin) {
          navigate('/app', { replace: true });
          setIsLoading(false);
          return;
        }

        cachedAdminUserId = user.id;
        setIsAllowed(true);
        setIsLoading(false);
      } catch (err) {
        console.error('AdminRoute check error:', err);
        if (isMounted) {
          navigate('/app', { replace: true });
          setIsLoading(false);
        }
      }
    };

    checkAdminAccess();

    // Safety timeout — never stay on loading for more than 8 seconds
    const timeout = setTimeout(() => {
      if (isMounted && isLoading) {
        console.warn('AdminRoute: timed out checking access');
        setIsLoading(false);
        // If timed out and we have a cached admin, allow through
        if (cachedAdminUserId) {
          setIsAllowed(true);
        }
      }
    }, 8000);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <span className="text-sm text-exclu-space">Checking admin access...</span>
      </div>
    );
  }

  if (!isAllowed) return null;

  return <>{children}</>;
};

export default AdminRoute;
