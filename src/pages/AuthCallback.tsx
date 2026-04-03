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
    const type = searchParams.get('type') as 'signup' | 'recovery' | 'email_change' | 'magiclink' | null;
    const next = searchParams.get('next') || null;

    const redirectAfterAuth = (role: string | null) => {
      // recovery = password reset — always go to /auth?mode=update-password
      if (type === 'recovery') {
        navigate('/auth?mode=update-password', { replace: true });
        return;
      }
      // next param takes priority (set by fan/chatter flow)
      if (next) {
        navigate(next, { replace: true });
        return;
      }
      // Route by role
      if (role === 'chatter') {
        window.location.href = '/app/chatter';
      } else if (role === 'creator') {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/fan', { replace: true });
      }
    };

    const resolveRole = async (): Promise<string | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      return profile?.role ?? null;
    };

    const autoFavoriteCreator = async (userId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const favoriteHandle = user?.user_metadata?.favorite_creator as string | undefined;
      if (!favoriteHandle) return;

      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('handle', favoriteHandle)
        .eq('is_creator', true)
        .maybeSingle();

      if (creatorProfile) {
        await supabase
          .from('fan_favorites')
          .upsert(
            { fan_id: userId, creator_id: creatorProfile.id },
            { onConflict: 'fan_id,creator_id' }
          );
      }
    };

    const run = async () => {
      // Case 1: token_hash present — verify manually then redirect
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) {
          console.error('[AuthCallback] verifyOtp error:', error.message);
          // Token may already be consumed (double-click) — check for existing session
          const role = await resolveRole();
          if (isCreator !== null) {
            redirectAfterAuth(isCreator);
          } else {
            navigate('/auth?error=link_expired', { replace: true });
          }
          return;
        }
        // Auto-favorite creator for new fan signups
        const { data: { session } } = await supabase.auth.getSession();
        if (session && type === 'signup') {
          await autoFavoriteCreator(session.user.id);
        }
        const role = await resolveRole();
        redirectAfterAuth(role);
        return;
      }

      // Case 2: Supabase verified server-side and redirected here — session should be live
      const role = await resolveRole();
      if (role !== null) {
        redirectAfterAuth(role);
        return;
      }

      // Case 3: Fallback — wait for onAuthStateChange to fire (session settling)
      const unsub = supabase.auth.onAuthStateChange(async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
          unsub.data.subscription.unsubscribe();
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();
          redirectAfterAuth(profile?.role ?? 'fan');
        }
      });

      // Safety timeout — if no session after 6s, send to auth
      setTimeout(() => {
        unsub.data.subscription.unsubscribe();
        navigate('/auth?error=link_expired', { replace: true });
      }, 6000);
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
