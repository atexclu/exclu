/**
 * ChatterAuth — /auth/chatter
 *
 * Dedicated authentication page for chatters (not linked from the landing page).
 * Creators share this URL directly with chatters they want to onboard.
 * Supports login and signup — signup creates a non-creator account.
 * After login, redirects to /app/chatter.
 */

import Aurora from '@/components/ui/Aurora';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Mail, Lock, Sparkles, User, MessageSquare } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import logoWhite from '@/assets/logo-white.svg';

const ChatterAuth = () => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [isLoading, setIsLoading] = useState(false);
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
      const { data: chatterInvs } = await supabase
        .from('chatter_invitations')
        .select('id')
        .eq('chatter_id', user.id)
        .eq('status', 'accepted')
        .limit(1);
      if (chatterInvs && chatterInvs.length > 0) {
        navigate('/app/chatter');
      }
    });
  }, [navigate]);

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
          const message = (error.message || '').toLowerCase();
          if (message.includes('already registered') || message.includes('user already registered')) {
            toast.info('An account already exists with this email. Please log in.');
            setMode('login');
            return;
          }
          throw error;
        }

        toast.success('Check your inbox to confirm your account, then log in.');
        setMode('login');
      } else {
        // Login
        if (!password) {
          toast.error('Please fill in all fields');
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          const message = (error.message || '').toLowerCase();
          if (message.includes('email not confirmed') || message.includes('email_not_confirmed')) {
            try {
              await supabase.auth.resend({ type: 'signup', email });
            } catch {}
            toast.error('You need to confirm your email first. We sent you a new confirmation link.');
            return;
          }
          throw error;
        }

        toast.success('You are now logged in');
        navigate('/app/chatter');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20">
        <Aurora colorStops={['#818cf8', '#6366f1', '#a78bfa']} blend={0.5} amplitude={0.7} speed={0.6} />
      </div>

      {/* Minimal header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-center bg-background/80 backdrop-blur-xl border-b border-border/40">
        <a href="/" className="flex items-center gap-2">
          <img src={logoWhite} alt="Exclu" className="h-5 dark:block hidden" />
          <img src={logoWhite} alt="Exclu" className="h-5 block dark:hidden invert" />
        </a>
      </header>

      <main className="min-h-screen px-4 pt-24 pb-10 flex items-start sm:items-center justify-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="w-full max-w-md space-y-6"
        >
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-[11px] font-medium text-indigo-400">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Exclu for chatters</span>
            </div>
            <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-foreground">
              {mode === 'signup' ? 'Create your chatter account' : mode === 'login' ? 'Chatter login' : 'Reset your password'}
            </h1>
            {mode === 'signup' && (
              <p className="text-muted-foreground text-[13px] sm:text-sm max-w-sm mx-auto">
                Create your account to start managing conversations and earning revenue.
              </p>
            )}
            {mode === 'login' && (
              <p className="text-muted-foreground text-[13px] sm:text-sm max-w-sm mx-auto">
                Log in to access your chatter dashboard.
              </p>
            )}
            {mode === 'reset' && (
              <p className="text-muted-foreground text-[13px] sm:text-sm max-w-xs mx-auto">
                Enter your email and we'll send you a reset link.
              </p>
            )}
          </div>

          <Card className="bg-card/95 border border-border/70 shadow-lg shadow-black/20 rounded-2xl backdrop-blur-xl">
            <CardHeader className="px-5 pt-5 pb-3 space-y-4">
              {mode !== 'reset' && (
                <div className="flex justify-center gap-8 border-b border-border/40">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="relative pb-3.5 px-2 transition-all"
                  >
                    <span className={`text-base font-bold transition-all ${mode === 'login' ? 'text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground'}`}>
                      Log in
                    </span>
                    {mode === 'login' && (
                      <motion.div
                        layoutId="chatter-auth-tab"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 rounded-full"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="relative pb-3.5 px-2 transition-all"
                  >
                    <span className={`text-base font-bold transition-all ${mode === 'signup' ? 'text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground'}`}>
                      Sign up
                    </span>
                    {mode === 'signup' && (
                      <motion.div
                        layoutId="chatter-auth-tab"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500 rounded-full"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                </div>
              )}
              <CardTitle className="text-base text-foreground">
                {mode === 'signup' ? 'Create your credentials' : mode === 'login' ? 'Log in with your email' : 'Reset your password'}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label htmlFor="displayName" className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      Display name
                    </label>
                    <Input
                      id="displayName"
                      name="displayName"
                      type="text"
                      placeholder="Your name"
                      className="h-11 bg-muted/30 border-border text-foreground placeholder:text-muted-foreground/50 text-sm"
                      maxLength={50}
                      required
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="h-11 bg-muted/30 border-border text-foreground placeholder:text-muted-foreground/50 text-sm"
                    required
                  />
                </div>

                {mode !== 'reset' && (
                  <div className="space-y-1.5">
                    <label htmlFor="password" className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" />
                      Password
                    </label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      placeholder={mode === 'signup' ? 'Create a strong password' : 'Your password'}
                      className="h-11 bg-muted/30 border-border text-foreground placeholder:text-muted-foreground/50 text-sm"
                      minLength={6}
                      required
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full mt-1 inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {mode === 'signup' ? 'Creating account…' : mode === 'login' ? 'Logging in…' : 'Sending…'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      {mode === 'signup' ? 'Create account' : mode === 'login' ? 'Log in' : 'Send reset link'}
                    </span>
                  )}
                </Button>
              </form>

              <div className="mt-4 text-center space-y-2">
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setMode('reset')}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Forgot your password?
                  </button>
                )}
                {mode === 'reset' && (
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Back to login
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-[11px] text-muted-foreground/60">
            This page is for chatters only. If you're a creator,{' '}
            <a href="/auth" className="text-primary hover:underline">go here</a>.
          </p>
        </motion.div>
      </main>
    </div>
  );
};

export default ChatterAuth;
