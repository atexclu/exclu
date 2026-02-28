import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Mail, Lock, Sparkles, AtSign } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

const Auth = () => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'update-password'>('signup');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Read mode and ref (referral code) from URL params
  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'update-password') {
      setMode('update-password');
    } else if (urlMode === 'signup') {
      setMode('signup');
    }
  }, [searchParams]);

  // Handle password recovery from email link with hash fragment
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update-password');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');

    if (!email && mode !== 'update-password') {
      toast.error('Please fill in your email');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'update-password') {
        if (!password) {
          toast.error('Please enter a new password');
          return;
        }
        const confirmPassword = String(formData.get('confirmPassword') || '');
        if (password !== confirmPassword) {
          toast.error('Passwords do not match');
          return;
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success('Password updated successfully! You can now log in.');
        // Clear URL parameters and redirect to login
        window.history.replaceState({}, '', '/auth');
        setMode('login');
      } else if (mode === 'reset') {
        const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${siteUrl}/auth/callback`,
        });
        if (error) throw error;
        toast.success('Check your inbox to reset your password');
      } else if (mode === 'signup') {
        const username = String(formData.get('username') || '').trim().toLowerCase();
        if (!password || !username) {
          toast.error('Please fill in all fields');
          return;
        }

        // Validate username format
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
          toast.error('Username can only contain letters, numbers and underscores');
          return;
        }

        // Check if username is already taken
        const { data: existingHandle } = await supabase
          .from('profiles')
          .select('id')
          .eq('handle', username)
          .maybeSingle();

        if (existingHandle) {
          toast.error('This username is already taken');
          return;
        }

        const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
        // Capture referral code if present in URL
        const refCode = searchParams.get('ref') || null;
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${siteUrl}/auth/callback`,
            data: {
              handle: username,
              is_creator: true,
              referral_code: refCode,
            },
          },
        });

        // If referred, link the referral in the background.
        // Use anon key as Bearer (not user JWT) — gateway requires Authorization header
        // even with verify_jwt=false, but the function itself uses service role internally.
        if (!error && signUpData?.user && refCode) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          fetch(`${supabaseUrl}/functions/v1/link-referral`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseAnonKey,
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ referral_code: refCode, referred_user_id: signUpData.user.id }),
          }).catch((e) => console.warn('[Auth] link-referral background call failed:', e));
        }

        if (error) {
          const message = (error.message || '').toLowerCase();

          // If Supabase indicates the user is already registered, gently guide them
          // and resend a confirmation email without explicitly confirming the account exists.
          if (message.includes('already registered') || message.includes('user already registered')) {
            try {
              await supabase.auth.resend({ type: 'signup', email });
            } catch (resendError) {
              console.error('Error resending confirmation email after duplicate signup attempt', resendError);
            }

            toast.success(
              'If an account already exists for this email, we have sent you a new confirmation link. Please check your inbox and spam folder.'
            );
            setMode('login');
            return;
          }

          throw error;
        }

        toast.success('Check your inbox to confirm your account, then log in.');
        setMode('login');
      } else {
        if (!password) {
          toast.error('Please fill in all fields');
          return;
        }
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          const message = (error.message || '').toLowerCase();

          // Handle the case where the user has not confirmed their email yet.
          if (message.includes('email not confirmed') || message.includes('email_not_confirmed')) {
            try {
              await supabase.auth.resend({ type: 'signup', email });
            } catch (resendError) {
              console.error('Error resending confirmation email after unconfirmed login attempt', resendError);
            }

            toast.error(
              'You need to confirm your email before logging in. If an account exists for this address, we have just sent you a new confirmation link.'
            );
            return;
          }

          throw error;
        }
        toast.success('You are now logged in');

        // After login, decide whether to send the user to onboarding or directly to the dashboard
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          navigate('/app');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('handle, avatar_url, social_links, role')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Error loading profile after login', profileError);
        }

        // Fan accounts go directly to fan dashboard
        if (profile?.role === 'fan') {
          navigate('/fan');
          return;
        }

        const socialLinks = (profile?.social_links as Record<string, string> | null) || {};
        const hasSocialLinks = Object.values(socialLinks).some((url) => url && url.length > 0);

        if (!profile?.handle || !profile?.avatar_url || !hasSocialLinks) {
          navigate('/onboarding');
        } else {
          navigate('/app');
        }
      }
    } catch (error: any) {
      toast.error(error?.message || 'Something went wrong with authentication');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="min-h-[calc(100vh-5rem)] px-4 pt-28 pb-10 flex items-start sm:items-center justify-center relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 -left-24 h-64 w-64 rounded-full bg-primary/25 blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -right-24 h-72 w-72 rounded-full bg-exclu-iris/25 blur-3xl animate-[pulse_7s_ease-in-out_infinite]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="w-full max-w-md space-y-6"
        >
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-exclu-ink/80 px-3 py-1 text-[11px] font-medium text-exclu-cloud/80">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Exclu for creators</span>
            </div>
            <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
              {mode === 'signup'
                ? 'Create your Exclu account'
                : mode === 'login'
                  ? 'Log in to Exclu'
                  : mode === 'update-password'
                    ? 'Set your new password'
                    : 'Reset your password'}
            </h1>
            {mode === 'signup' && (
              <p className="text-primary text-[13px] sm:text-sm max-w-sm mx-auto font-medium">
                OnlyFans creators are making 77.4% more with Exclu — discover why…
              </p>
            )}
            {mode === 'reset' && (
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-xs mx-auto">
                Enter your email and we will send you a link to reset your password.
              </p>
            )}
            {mode === 'update-password' && (
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-xs mx-auto">
                Enter your new password below.
              </p>
            )}
          </div>

          <Card className="bg-exclu-ink/95/90 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
            <CardHeader className="px-5 pt-5 pb-3 space-y-4">
              {mode !== 'update-password' && (
                <div className="flex justify-center gap-8 border-b border-exclu-arsenic/40">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="relative pb-3.5 px-2 transition-all"
                  >
                    <span className={`text-base font-bold transition-all ${mode === 'login' || mode === 'reset'
                      ? 'text-exclu-cloud'
                      : 'text-exclu-space/60 hover:text-exclu-space'
                      }`}>
                      Log in
                    </span>
                    {(mode === 'login' || mode === 'reset') && (
                      <motion.div
                        layoutId="auth-tab-indicator"
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
                        layoutId="auth-tab-indicator"
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
                      : mode === 'update-password'
                        ? 'Set your new password'
                        : 'Reset your password'}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'update-password' && (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="password" className="text-[11px] text-exclu-space/80 flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 text-exclu-space/80" />
                        New Password
                      </label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Enter your new password"
                        className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                        minLength={6}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="confirmPassword" className="text-[11px] text-exclu-space/80 flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 text-exclu-space/80" />
                        Confirm Password
                      </label>
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Confirm your new password"
                        className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                        minLength={6}
                        required
                      />
                    </div>
                  </>
                )}

                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label htmlFor="username" className="flex items-center gap-2 text-xs font-medium text-exclu-space">
                      <AtSign className="h-3.5 w-3.5 text-exclu-space/80" />
                      Username
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">exclu.at/</span>
                      <Input
                        id="username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        placeholder="yourname"
                        className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm pl-[4.5rem]"
                        pattern="^[a-zA-Z0-9_]+$"
                        minLength={3}
                        maxLength={30}
                        required
                      />
                    </div>
                    <p className="text-[10px] text-exclu-space/60">Only letters, numbers and underscores</p>
                  </div>
                )}

                {mode !== 'update-password' && (
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
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="password"
                    className="flex items-center gap-2 text-xs font-medium text-exclu-space"
                  >
                    <Lock className="h-3.5 w-3.5 text-exclu-space/80" />
                    Password
                  </label>
                  {mode !== 'reset' && mode !== 'update-password' && (
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      placeholder={mode === 'signup' ? 'Create a strong password' : 'Your password'}
                      className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                      minLength={6}
                      required
                    />
                  )}
                </div>

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
                      ? 'Sign up'
                      : mode === 'login'
                        ? 'Log in'
                        : mode === 'update-password'
                          ? 'Update password'
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

export default Auth;
