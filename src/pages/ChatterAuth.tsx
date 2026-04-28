/**
 * ChatterAuth — /auth/chatter
 *
 * Dedicated authentication page for chatters (not linked from the landing page).
 * Creators share this URL directly with chatters they want to onboard.
 * Identical UI to /auth but without the creator/fan toggle — always creates a chatter account.
 * After login, redirects to /app/chatter.
 */

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Mail, Lock, Sparkles, User, Eye, EyeOff } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { preflightSignup, humanizeReason } from '@/lib/deviceFingerprint';
import { recordMarketingConsent } from '@/lib/recordConsent';
import { isDeletedAccountError, deletedAccountMessage } from '@/lib/deletedAccountErrors';

const isValidEmail = (email: string) =>
  /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);

const ChatterAuth = () => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'signup') setMode('signup');
  }, [searchParams]);

  // If already logged in as chatter, redirect
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.role === 'chatter') {
        window.location.href = '/app/chatter';
      }
    });
  }, []);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const displayName = String(formData.get('displayName') || '').trim();

    if (!email) {
      toast.error('Please fill in your email');
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
        if (!password) {
          toast.error('Please fill in all fields');
          return;
        }
        if (!displayName) {
          toast.error('Please enter your name');
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
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${siteUrl}/auth/callback`,
            data: {
              is_creator: false,
              full_name: displayName,
              is_chatter: true,
            },
          },
        });

        if (error) {
          if (isDeletedAccountError(error)) {
            toast.error(deletedAccountMessage());
            return;
          }
          const message = (error.message || '').toLowerCase();
          if (message.includes('already registered') || message.includes('user already registered')) {
            toast.info('An account already exists with this email. Please log in.');
            setMode('login');
            return;
          }
          throw error;
        }

        // RGPD audit trail — enrich the mailing_contacts row with HTTP
        // context. Fire-and-forget.
        void recordMarketingConsent({
          email,
          source: 'signup',
          sourceRef: signUpData?.user?.id ?? null,
          role: 'chatter',
          displayName: displayName || null,
          legalSlug: 'terms',
          consentText:
            'By creating an account you agree to the Terms of Service and Privacy Policy, including receiving marketing emails from Exclu.',
        });

        // Phase 2B: if Supabase Auth returned a session, the chatter is
        // logged in immediately (Confirm email = OFF). Navigate straight to
        // the chatter dashboard. Otherwise (legacy Confirm email = ON path,
        // backward compat) fall back to the "check inbox" message.
        if (signUpData?.session) {
          toast.success('Welcome to Exclu!');
          navigate('/app/chatter', { replace: true });
          return;
        }
        toast.success('Check your inbox to confirm your account, then log in.');
        setMode('login');
      } else {
        if (!password) {
          toast.error('Please fill in all fields');
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          const message = (error.message || '').toLowerCase();
          if (message.includes('email not confirmed') || message.includes('email_not_confirmed')) {
            try { await supabase.auth.resend({ type: 'signup', email }); } catch {}
            toast.error('You need to confirm your email first. We sent you a new confirmation link.');
            return;
          }
          throw error;
        }

        toast.success('You are now logged in');
        window.location.href = '/app/chatter';
      }
    } catch (error: any) {
      toast.error(error?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Aurora background — same as /auth */}
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
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-exclu-ink/80 px-3 py-1 text-[11px] font-medium text-exclu-cloud/80">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Exclu for chatters</span>
            </div>
            <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
              {mode === 'signup'
                ? 'Create your chatter account'
                : mode === 'login'
                  ? 'Log in to Exclu'
                  : 'Reset your password'}
            </h1>
            {mode === 'signup' && (
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-sm mx-auto">
                Create your account to start managing conversations and earning revenue.
              </p>
            )}
            {mode === 'reset' && (
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-xs mx-auto">
                Enter your email and we will send you a link to reset your password.
              </p>
            )}
          </div>

          <Card className="bg-exclu-ink/95/90 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
            <CardHeader className="px-5 pt-5 pb-3 space-y-4">
              {mode !== 'reset' && (
                <div className="flex justify-center gap-8 border-b border-exclu-arsenic/40">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="relative pb-3.5 px-2 transition-all"
                  >
                    <span className={`text-base font-bold transition-all ${mode === 'login'
                      ? 'text-exclu-cloud'
                      : 'text-exclu-space/60 hover:text-exclu-space'
                    }`}>
                      Log in
                    </span>
                    {mode === 'login' && (
                      <motion.div
                        layoutId="chatter-auth-tab"
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
                    <span className={`text-base font-bold transition-all ${mode === 'signup'
                      ? 'text-exclu-cloud'
                      : 'text-exclu-space/60 hover:text-exclu-space'
                    }`}>
                      Sign up
                    </span>
                    {mode === 'signup' && (
                      <motion.div
                        layoutId="chatter-auth-tab"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                </div>
              )}
              <div className="space-y-1">
                <CardTitle className="text-base text-exclu-cloud">
                  {mode === 'signup'
                    ? 'Create your credentials'
                    : mode === 'login'
                      ? 'Log in with your email'
                      : 'Reset your password'}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label htmlFor="displayName" className="flex items-center gap-2 text-xs font-medium text-exclu-space">
                      <User className="h-3.5 w-3.5 text-exclu-space/80" />
                      Display name
                    </label>
                    <Input
                      id="displayName"
                      name="displayName"
                      type="text"
                      placeholder="Your name"
                      className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                      maxLength={50}
                      required
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="flex items-center gap-2 text-xs font-medium text-exclu-space">
                    <Mail className="h-3.5 w-3.5 text-exclu-space/80" />
                    Email
                  </label>
                  <Input
                    id="email"
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
                    <label htmlFor="password" className="flex items-center gap-2 text-xs font-medium text-exclu-space">
                      <Lock className="h-3.5 w-3.5 text-exclu-space/80" />
                      Password
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        placeholder={mode === 'signup' ? 'Create a strong password' : 'Your password'}
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
                      ? 'Sign up'
                      : mode === 'login'
                        ? 'Log in'
                        : 'Send reset link'}
                </Button>

                <p className="text-[10px] text-exclu-space/70 text-center mt-2">
                  You can change your email or password later from your account settings.
                </p>

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
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

export default ChatterAuth;
