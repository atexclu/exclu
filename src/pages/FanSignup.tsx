import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Mail, Lock, Heart, ArrowLeft, User, Eye, EyeOff } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { preflightSignup, humanizeReason } from '@/lib/deviceFingerprint';
import { recordMarketingConsent } from '@/lib/recordConsent';

const isValidEmail = (email: string) =>
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);

interface CreatorPreview {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
}

const FanSignup = () => {
  const [mode, setMode] = useState<'signup' | 'login' | 'reset'>('signup');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [creatorPreview, setCreatorPreview] = useState<CreatorPreview | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const creatorHandle = searchParams.get('creator');
  const actionParam = searchParams.get('action');
  const profileIdParam = searchParams.get('profile');
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

    if (!isValidEmail(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'reset') {
        const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${siteUrl}/auth/callback`,
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

        if (!ageConfirmed) {
          toast.error('You must confirm that you are at least 18 years old');
          return;
        }

        // Phase 2 signup preflight: rate limit / disposable / BotID check.
        // No-op unless VITE_SIGNUP_PREFLIGHT_ENABLED === 'true'.
        const preflight = await preflightSignup(email);
        if (!preflight.ok) {
          toast.error(humanizeReason(preflight.reason));
          return;
        }

        const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
        const redirectUrl = creatorHandle
          ? `${siteUrl}/auth/callback?next=/fan%3Fcreator%3D${creatorHandle}`
          : `${siteUrl}/auth/callback?next=/fan`;

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

        // RGPD audit trail — attach IP / UA / URL / legal version to the
        // mailing_contacts row the DB trigger just created. Fire-and-forget.
        void recordMarketingConsent({
          email,
          source: 'signup',
          sourceRef: signUpData?.user?.id ?? null,
          role: 'fan',
          displayName: displayName || null,
          legalSlug: 'terms',
          consentText:
            'By creating an account you agree to the Terms of Service and Privacy Policy, including receiving marketing emails from Exclu.',
        });

        // Phase 2B: if Supabase Auth returned a session, the fan is
        // logged in immediately (Confirm email = OFF). Navigate straight
        // to the fan dashboard (with the optional creator auto-favorite
        // query param preserved). Otherwise (legacy Confirm email = ON
        // path, backward compat) fall back to the "check inbox" message.
        if (signUpData?.session) {
          toast.success('Welcome to Exclu!');
          const fanPath = creatorHandle ? `/fan?creator=${creatorHandle}` : '/fan';
          navigate(fanPath, { replace: true });
          return;
        }
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
          } else if (actionParam === 'chat' && profileIdParam) {
            const { data: conv } = await supabase
              .from('conversations')
              .upsert(
                { fan_id: user.id, profile_id: profileIdParam },
                { onConflict: 'fan_id,profile_id', ignoreDuplicates: false }
              )
              .select('id')
              .single();
            navigate(conv ? `/fan?tab=messages&conversation=${conv.id}` : '/fan?tab=messages');
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
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Aurora background — same treatment as /auth */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
        <Aurora colorStops={['#CFFF16', '#a3e635', '#CFFF16']} blend={0.5} amplitude={0.7} speed={0.6} />
      </div>

      <Navbar />
      <main className="min-h-[calc(100vh-5rem)] px-4 pt-28 pb-10 flex items-start sm:items-center justify-center relative z-10 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="w-full max-w-md space-y-6"
        >
          {creatorHandle && (
            <button
              type="button"
              onClick={() => navigate(`/${creatorHandle}`)}
              className="inline-flex items-center gap-1.5 text-xs text-exclu-space/80 hover:text-exclu-cloud transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to {displayName || 'profile'}
            </button>
          )}

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
                    <div className="relative">
                      <Input
                        id="fan-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        placeholder={mode === 'signup' ? 'Create a password' : 'Your password'}
                        className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm pr-10"
                        minLength={6}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="w-full mt-1 inline-flex items-center justify-center gap-2"
                  disabled={isLoading || (mode === 'signup' && !ageConfirmed)}
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
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={ageConfirmed}
                      onChange={(e) => setAgeConfirmed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-white/30 bg-black/40 text-primary focus:ring-primary/50 accent-[#CFFF16]"
                    />
                    <span className="text-[11px] text-exclu-space/80 leading-relaxed group-hover:text-exclu-space transition-colors">
                      I confirm that I am at least <strong className="text-exclu-cloud">18 years old</strong> and agree to the{' '}
                      <a href="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</a> and{' '}
                      <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>, including receiving transactional and marketing emails from Exclu (unsubscribe anytime).
                    </span>
                  </label>
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
      <Footer />
    </div>
  );
};

export default FanSignup;
