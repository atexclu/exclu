import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Loader2 } from 'lucide-react';

/**
 * AuthCallback — handles Supabase email confirmation links.
 *
 * Supabase sends confirmation emails with:
 *   https://<project>.supabase.co/auth/v1/verify
 *     ?token_hash=XXX&type=signup&redirect_to=https://exclu.at/auth/callback?next=/fan
 *
 * Supabase verifies server-side, then redirects here with the session
 * already set in the Supabase client (via onAuthStateChange). We just
 * need to wait for the session and redirect to the right destination.
 *
 * If the URL contains `token_hash` + `type` (e.g. direct link without
 * server-side verification), we call verifyOtp manually.
 */
const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'signup' | 'recovery' | 'email_change' | null;
    const next = searchParams.get('next') || '/fan';

    const redirect = (isCreator: boolean, fallback: string) => {
      if (isCreator) {
        navigate('/app', { replace: true });
      } else {
        navigate(fallback, { replace: true });
      }
    };

    const resolveDestination = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_creator')
        .eq('id', session.user.id)
        .maybeSingle();

      return profile?.is_creator ?? false;
    };

    const run = async () => {
      // Case 1: token_hash present — verify manually then redirect
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) {
          console.error('[AuthCallback] verifyOtp error:', error.message);
          // Token may already be consumed (e.g. double-click) — try to get existing session
          const isCreator = await resolveDestination();
          if (isCreator !== null) {
            redirect(isCreator, next);
          } else {
            navigate('/fan/signup?error=link_expired', { replace: true });
          }
          return;
        }
        const isCreator = await resolveDestination();
        redirect(isCreator ?? false, next);
        return;
      }

      // Case 2: Supabase already verified server-side and redirected here with a live session
      // onAuthStateChange will have fired — just read the current session
      const isCreator = await resolveDestination();
      if (isCreator !== null) {
        redirect(isCreator, next);
        return;
      }

      // Fallback: wait briefly for the session to settle (onAuthStateChange delay)
      const unsub = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          unsub.data.subscription.unsubscribe();
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_creator')
            .eq('id', session.user.id)
            .maybeSingle();
          redirect(profile?.is_creator ?? false, next);
        }
      });

      // Safety timeout — if no session after 5s, send to signup
      setTimeout(() => {
        unsub.data.subscription.unsubscribe();
        navigate('/fan/signup?error=link_expired', { replace: true });
      }, 5000);
    };

    run();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Confirming your account…</p>
      </div>
    </div>
  );
};

export default AuthCallback;
