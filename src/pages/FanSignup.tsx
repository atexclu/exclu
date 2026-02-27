import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Mail, Lock, Heart, ArrowLeft, User } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import logo from '@/assets/logo-white.svg';

interface CreatorPreview {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
}

const FanSignup = () => {
  const [mode, setMode] = useState<'signup' | 'login' | 'reset'>('signup');
  const [isLoading, setIsLoading] = useState(false);
  const [creatorPreview, setCreatorPreview] = useState<CreatorPreview | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const creatorHandle = searchParams.get('creator');
  const returnTo = searchParams.get('return') || (creatorHandle ? `/${creatorHandle}` : '/fan');

  useEffect(() => {
    if (!creatorHandle) return;

    const fetchCreator = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, handle')
        .eq('handle', creatorHandle)
        .eq('is_creator', true)
        .maybeSingle();

      if (data) {
        setCreatorPreview(data as CreatorPreview);
      }
    };

    fetchCreator();
  }, [creatorHandle]);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const displayName = String(formData.get('display_name') || '').trim();

    if (!email) {
      toast.error('Please enter your email');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'reset') {
        const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${siteUrl}/auth?mode=update-password`,
        });
        if (error) throw error;
        toast.success('Check your inbox to reset your password');
      } else if (mode === 'signup') {
        if (!displayName) {
          toast.error('Please enter a username');
          return;
        }
        if (!password) {
          toast.error('Please enter a password');
          return;
        }

        const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
        const redirectUrl = creatorHandle
          ? `${siteUrl}/fan?creator=${creatorHandle}`
          : `${siteUrl}/fan`;

        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              is_creator: false,
              full_name: displayName,
              favorite_creator: creatorHandle || null,
            },
          },
        });

        if (error) {
          const message = (error.message || '').toLowerCase();
          if (message.includes('already registered') || message.includes('user already registered')) {
            try {
              await supabase.auth.resend({ type: 'signup', email });
            } catch (resendError) {
              console.error('Error resending confirmation email', resendError);
            }
            toast.success(
              'If an account already exists for this email, we have sent you a new confirmation link. Please check your inbox.'
            );
            setMode('login');
            return;
          }
          throw error;
        }

        // Auto-favorite happens after email confirmation via the FanDashboard
        // redirect URL which includes ?creator={handle}

        toast.success('Check your inbox to confirm your account, then log in.');
        setMode('login');
      } else {
        // Login
        if (!password) {
          toast.error('Please enter your password');
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          const message = (error.message || '').toLowerCase();
          if (message.includes('email not confirmed') || message.includes('email_not_confirmed')) {
            try {
              await supabase.auth.resend({ type: 'signup', email });
            } catch (resendError) {
              console.error('Error resending confirmation email', resendError);
            }
            toast.error(
              'Please confirm your email first. We just sent you a new confirmation link.'
            );
            return;
          }
          throw error;
        }

        toast.success('Welcome back!');

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Auto-favorite creator if logging in from their profile
          if (creatorPreview?.id) {
            supabase
              .from('fan_favorites')
              .upsert(
                { fan_id: user.id, creator_id: creatorPreview.id },
                { onConflict: 'fan_id,creator_id' }
              )
              .then(() => {})
              .catch(() => {});
          }

          // Check profile role to redirect appropriately
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.role === 'creator' || profile?.role === 'admin') {
            navigate('/app');
          } else {
            navigate(returnTo);
          }
        } else {
          navigate(returnTo);
        }
      }
    } catch (error: any) {
      toast.error(error?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const displayName = creatorPreview?.display_name || creatorHandle || '';

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-24 h-64 w-64 rounded-full bg-pink-500/15 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-24 h-72 w-72 rounded-full bg-purple-500/15 blur-3xl animate-[pulse_7s_ease-in-out_infinite]" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <a href="/" className="flex items-center gap-2">
          <img src={logo} alt="Exclu" className="h-5" />
        </a>
        {creatorHandle && (
          <button
            type="button"
            onClick={() => navigate(`/${creatorHandle}`)}
            className="flex items-center gap-1.5 text-xs text-exclu-space/80 hover:text-exclu-cloud transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to {displayName || 'profile'}
          </button>
        )}
      </div>

      <main className="px-4 pt-8 pb-10 flex items-start sm:items-center justify-center min-h-[calc(100vh-4rem)]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="w-full max-w-md space-y-6"
        >
          {/* Creator preview card */}
          {creatorPreview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex items-center gap-4 rounded-2xl bg-exclu-ink/80 border border-exclu-arsenic/60 p-4 backdrop-blur-sm"
            >
              <div className="relative w-14 h-14 rounded-2xl overflow-hidden border border-white/20 bg-exclu-ink flex-shrink-0">
                {creatorPreview.avatar_url ? (
                  <img
                    src={creatorPreview.avatar_url}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-lg font-bold text-white/60">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-exclu-cloud truncate">{displayName}</p>
                <p className="text-xs text-exclu-space/80">
                  Create an account to send tips and custom requests
                </p>
              </div>
              <Heart className="w-5 h-5 text-pink-400/60 flex-shrink-0" />
            </motion.div>
          )}

          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
              {mode === 'signup'
                ? creatorHandle
                  ? `Join Exclu`
                  : 'Create your fan account'
                : mode === 'login'
                  ? 'Log in to Exclu'
                  : 'Reset your password'}
            </h1>
            {mode === 'signup' && (
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-sm mx-auto">
                {creatorHandle
                  ? `Sign up to support ${displayName} with tips and custom requests`
                  : 'Support your favorite creators with tips and custom content requests'}
              </p>
            )}
            {mode === 'reset' && (
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-xs mx-auto">
                Enter your email and we will send you a reset link.
              </p>
            )}
          </div>

          {/* Auth card */}
          <Card className="bg-exclu-ink/95 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
            <CardHeader className="px-5 pt-5 pb-3 space-y-4">
              <div className="flex justify-center gap-8 border-b border-exclu-arsenic/40">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="relative pb-3.5 px-2 transition-all"
                >
                  <span
                    className={`text-base font-bold transition-all ${
                      mode === 'login' || mode === 'reset'
                        ? 'text-exclu-cloud'
                        : 'text-exclu-space/60 hover:text-exclu-space'
                    }`}
                  >
                    Log in
                  </span>
                  {(mode === 'login' || mode === 'reset') && (
                    <motion.div
                      layoutId="fan-auth-tab"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="relative pb-3.5 px-2 transition-all"
                >
                  <span
                    className={`text-base font-bold transition-all ${
                      mode === 'signup'
                        ? 'text-exclu-cloud'
                        : 'text-exclu-space/60 hover:text-exclu-space'
                    }`}
                  >
                    Sign up
                  </span>
                  {mode === 'signup' && (
                    <motion.div
                      layoutId="fan-auth-tab"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              </div>
              <CardTitle className="text-base text-exclu-cloud">
                {mode === 'signup'
                  ? 'Create your account'
                  : mode === 'login'
                    ? 'Welcome back'
                    : 'Reset your password'}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="fan-display-name"
                      className="flex items-center gap-2 text-xs font-medium text-exclu-space"
                    >
                      <User className="h-3.5 w-3.5 text-exclu-space/80" />
                      Username
                    </label>
                    <Input
                      id="fan-display-name"
                      name="display_name"
                      type="text"
                      autoComplete="nickname"
                      placeholder="Your name or nickname"
                      className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                      required
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label
                    htmlFor="fan-email"
                    className="flex items-center gap-2 text-xs font-medium text-exclu-space"
                  >
                    <Mail className="h-3.5 w-3.5 text-exclu-space/80" />
                    Email
                  </label>
                  <Input
                    id="fan-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                    required
                  />
                </div>

                {mode !== 'reset' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="fan-password"
                      className="flex items-center gap-2 text-xs font-medium text-exclu-space"
                    >
                      <Lock className="h-3.5 w-3.5 text-exclu-space/80" />
                      Password
                    </label>
                    <Input
                      id="fan-password"
                      name="password"
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      placeholder={mode === 'signup' ? 'Create a password' : 'Your password'}
                      className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                      minLength={6}
                      required
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="w-full mt-1 inline-flex items-center justify-center gap-2"
                  disabled={isLoading}
                >
                  {isLoading
                    ? 'Please wait...'
                    : mode === 'signup'
                      ? 'Create account'
                      : mode === 'login'
                        ? 'Log in'
                        : 'Send reset link'}
                </Button>

                {mode === 'signup' && (
                  <p className="text-[10px] text-exclu-space/70 text-center mt-2">
                    By signing up, you agree to our{' '}
                    <a href="/terms" className="text-primary hover:underline">Terms</a> and{' '}
                    <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>.
                  </p>
                )}

                {mode === 'login' && (
                  <p className="text-[11px] text-exclu-space/80 text-center mt-1">
                    <button
                      type="button"
                      onClick={() => setMode('reset')}
                      className="text-primary hover:underline font-medium"
                    >
                      Forgot your password?
                    </button>
                  </p>
                )}

                {mode === 'reset' && (
                  <p className="text-[11px] text-exclu-space/80 text-center mt-1">
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="text-primary hover:underline font-medium"
                    >
                      Back to login
                    </button>
                  </p>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Creator signup link */}
          <p className="text-center text-xs text-exclu-space/60">
            Are you a creator?{' '}
            <a href="/auth?mode=signup" className="text-primary hover:underline font-medium">
              Create a creator account
            </a>
          </p>
        </motion.div>
      </main>
    </div>
  );
};

export default FanSignup;
