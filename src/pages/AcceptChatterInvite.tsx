/**
 * AcceptChatterInvite — /accept-chatter-invite
 *
 * Page publique accessible via le lien d'invitation envoyé par email.
 * ?token=<invitation_token>
 *
 * Flux :
 *  1. Charge les infos de l'invitation via RPC (fonctionne sans auth)
 *  2. Si non connecté → formulaire signup/login (même UI que FanSignup)
 *  3. Signup → message "vérifie ton email (check spam)" → user confirme → login
 *  4. Login → RPC accept_chatter_invitation → redirect /app/chatter
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, Mail, Lock, User, Users, MessagesSquare, Inbox, SendHorizonal, ShoppingBag, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';
import logo from '@/assets/logo-white.svg';

interface InvitationInfo {
  id: string;
  email: string;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
  expires_at: string;
  status: string;
}

type PageState = 'loading' | 'invalid' | 'expired' | 'already_used' | 'auth' | 'accepting' | 'onboarding';

export default function AcceptChatterInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [pageState, setPageState] = useState<PageState>('loading');
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);

  const [mode, setMode] = useState<'signup' | 'login'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [invitedEmailExists, setInvitedEmailExists] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!token) {
        setPageState('invalid');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser({ id: user.id, email: user.email ?? '' });
      }

      const { data: rpcResult, error } = await supabase.rpc('get_chatter_invitation_by_token', {
        p_token: token,
      });

      if (error || !rpcResult || rpcResult.error) {
        setPageState('invalid');
        return;
      }

      const inv: InvitationInfo = {
        id: rpcResult.id,
        email: rpcResult.email,
        creator_display_name: rpcResult.creator_display_name ?? null,
        creator_avatar_url: rpcResult.creator_avatar_url ?? null,
        expires_at: rpcResult.expires_at,
        status: rpcResult.status,
      };

      if (inv.status === 'accepted') {
        setInvitation(inv);
        setPageState('already_used');
        return;
      }

      if (inv.status === 'revoked' || new Date(inv.expires_at) < new Date()) {
        setInvitation(inv);
        setPageState('expired');
        return;
      }

      setInvitation(inv);

      try {
        const { data: emailCheck } = await supabase.functions.invoke('check-fan-email', {
          body: { email: inv.email },
        });
        const exists = emailCheck?.exists === true;
        setInvitedEmailExists(exists);
        if (exists) setMode('login');
      } catch {
        setInvitedEmailExists(false);
      }

      // Auto-accept si déjà connecté (retour depuis email verification ou session active)
      if (user) {
        setPageState('accepting');
        try {
          const { error: acceptError } = await supabase.rpc('accept_chatter_invitation', {
            p_token: token,
          });
          if (acceptError) throw acceptError;
          setPageState('onboarding');
        } catch (err: any) {
          toast.error(err?.message || 'Error accepting invitation');
          setPageState('auth');
        }
      } else {
        setPageState('auth');
      }
    };

    init();
  }, [token]);

  const handleAccept = async () => {
    setPageState('accepting');
    try {
      const { error } = await supabase.rpc('accept_chatter_invitation', {
        p_token: token,
      });

      if (error) throw error;

      setPageState('onboarding');
    } catch (err: any) {
      toast.error(err?.message || 'Error accepting invitation');
      setPageState('auth');
    }
  };

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
      if (mode === 'signup') {
        if (invitedEmailExists) {
          toast.error('This invited email already has an account. Please log in.');
          setMode('login');
          return;
        }
        if (!displayName) {
          toast.error('Please enter a username');
          return;
        }
        if (!password) {
          toast.error('Please enter a password');
          return;
        }

        const siteUrl = import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin;
        const redirectUrl = `${siteUrl}/auth/callback?next=${encodeURIComponent(`/accept-chatter-invite?token=${token}`)}`;

        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              is_creator: false,
              full_name: displayName,
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

        const hasIdentity = (signUpData?.user?.identities?.length ?? 0) > 0;
        if (!hasIdentity) {
          try {
            await supabase.auth.resend({ type: 'signup', email });
          } catch (resendError) {
            console.error('Error resending confirmation email after identity-less signup response', resendError);
          }
          toast.success(
            'If an account already exists for this email, we have sent you a new confirmation link. Please check your inbox and spam folder.'
          );
          setMode('login');
          return;
        }

        try {
          await supabase.auth.resend({ type: 'signup', email });
        } catch (resendError) {
          console.error('Error resending confirmation email after signup', resendError);
        }

        toast.success('Check your inbox to confirm your account, then log in. Check spam folder too.');
        setMode('login');
      } else {
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
              'Please confirm your email first. We just sent you a new confirmation link. Check your spam folder too.'
            );
            return;
          }
          throw error;
        }

        toast.success('Logged in!');

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUser({ id: user.id, email: user.email ?? '' });
          await handleAccept();
        }
      }
    } catch (error: any) {
      toast.error(error?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const creatorName = invitation?.creator_display_name || 'a creator';

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Background effects — same as FanSignup */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-24 h-64 w-64 rounded-full bg-pink-500/15 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-24 h-72 w-72 rounded-full bg-purple-500/15 blur-3xl animate-[pulse_7s_ease-in-out_infinite]" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <a href="/" className="flex items-center gap-2">
          <img src={logo} alt="Exclu" className="h-5" />
        </a>
      </div>

      <main className="px-4 pt-8 pb-10 flex items-start sm:items-center justify-center min-h-[calc(100vh-4rem)]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="w-full max-w-md space-y-6"
        >
          {/* ── Loading ── */}
          {pageState === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Checking invitation…</p>
            </div>
          )}

          {/* ── Invalid ── */}
          {pageState === 'invalid' && (
            <div className="text-center space-y-4 py-12">
              <XCircle className="w-12 h-12 text-red-400/70 mx-auto" />
              <h1 className="text-xl font-bold text-exclu-cloud">Invalid link</h1>
              <p className="text-sm text-exclu-space/80">This invitation link is not found or incorrect.</p>
              <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>
                Back to home
              </Button>
            </div>
          )}

          {/* ── Expired / Revoked ── */}
          {pageState === 'expired' && (
            <div className="text-center space-y-4 py-12">
              <XCircle className="w-12 h-12 text-yellow-400/70 mx-auto" />
              <h1 className="text-xl font-bold text-exclu-cloud">Invitation expired</h1>
              <p className="text-sm text-exclu-space/80">
                This invitation is no longer valid. Ask the creator to send you a new one.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>
                Back to home
              </Button>
            </div>
          )}

          {/* ── Already used ── */}
          {pageState === 'already_used' && (
            <div className="text-center space-y-4 py-12">
              <CheckCircle2 className="w-12 h-12 text-green-400/70 mx-auto" />
              <h1 className="text-xl font-bold text-exclu-cloud">Already accepted</h1>
              <p className="text-sm text-exclu-space/80">This invitation has already been used.</p>
              <Button className="mt-4" onClick={() => navigate('/app/chatter')}>
                Go to chatter dashboard
              </Button>
            </div>
          )}

          {/* ── Onboarding ── */}
          {pageState === 'onboarding' && (
            <>
              {/* Creator card */}
              {invitation && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="flex items-center gap-4 rounded-2xl bg-exclu-ink/80 border border-exclu-arsenic/60 p-4 backdrop-blur-sm"
                >
                  <div className="relative w-14 h-14 rounded-2xl overflow-hidden border border-white/20 bg-exclu-ink flex-shrink-0">
                    {invitation.creator_avatar_url ? (
                      <img src={invitation.creator_avatar_url} alt={creatorName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-lg font-bold text-white/60">{creatorName.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-exclu-cloud truncate">{creatorName}</p>
                    <p className="text-xs text-green-400">✓ You're now part of the team</p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                </motion.div>
              )}

              {/* Title */}
              <div className="text-center space-y-2">
                <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
                  Welcome to the team!
                </h1>
                <p className="text-exclu-space text-[13px] sm:text-sm max-w-sm mx-auto">
                  Here's how your chatter dashboard works
                </p>
              </div>

              {/* Role explanation card */}
              <Card className="bg-exclu-ink/95 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
                <CardContent className="px-5 py-5 space-y-4">
                  <div className="space-y-3">
                    {[
                      {
                        icon: Inbox,
                        color: 'text-yellow-400',
                        bg: 'bg-yellow-400/10',
                        title: 'Unclaimed conversations',
                        desc: 'New fan messages land here. Be the first to pick them up.',
                      },
                      {
                        icon: MessagesSquare,
                        color: 'text-primary',
                        bg: 'bg-primary/10',
                        title: 'My conversations',
                        desc: 'Once you claim a conversation, it moves here. Reply in real-time.',
                      },
                      {
                        icon: ShoppingBag,
                        color: 'text-green-400',
                        bg: 'bg-green-400/10',
                        title: 'Generate sales',
                        desc: 'Send paid content links directly in the chat to generate revenue.',
                      },
                      {
                        icon: SendHorizonal,
                        color: 'text-blue-400',
                        bg: 'bg-blue-400/10',
                        title: 'Always in the creator\'s name',
                        desc: 'Fans see messages from the creator. You manage the conversations behind the scenes.',
                      },
                    ].map(({ icon: Icon, color, bg, title, desc }) => (
                      <div key={title} className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <Icon className={`w-4 h-4 ${color}`} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-exclu-cloud">{title}</p>
                          <p className="text-[11px] text-exclu-space/70 mt-0.5">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="hero"
                    size="lg"
                    className="w-full mt-2 inline-flex items-center justify-center gap-2"
                    onClick={() => navigate('/app/chatter')}
                  >
                    Go to my dashboard
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── Accepting ── */}
          {pageState === 'accepting' && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Activating your chatter access…</p>
            </div>
          )}

          {/* ── Auth ── */}
          {pageState === 'auth' && invitation && (
            <>
              {/* Creator invitation card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex items-center gap-4 rounded-2xl bg-exclu-ink/80 border border-exclu-arsenic/60 p-4 backdrop-blur-sm"
              >
                <div className="relative w-14 h-14 rounded-2xl overflow-hidden border border-white/20 bg-exclu-ink flex-shrink-0">
                  {invitation.creator_avatar_url ? (
                    <img
                      src={invitation.creator_avatar_url}
                      alt={creatorName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-lg font-bold text-white/60">
                        {creatorName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-exclu-cloud truncate">{creatorName}</p>
                  <p className="text-xs text-exclu-space/80">
                    Invites you to join their chatter team on Exclu
                  </p>
                </div>
                <MessagesSquare className="w-5 h-5 text-primary/60 flex-shrink-0" />
              </motion.div>

              {/* Title */}
              <div className="text-center space-y-2">
                <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
                  {invitedEmailExists ? 'Log in to join the team' : mode === 'signup' ? 'Join the team' : 'Log in to accept'}
                </h1>
                {mode === 'signup' && !invitedEmailExists && (
                  <p className="text-exclu-space text-[13px] sm:text-sm max-w-sm mx-auto">
                    Create an account to start managing conversations for {creatorName}
                  </p>
                )}
              </div>

              {/* Already logged in → direct accept */}
              {currentUser ? (
                <Card className="bg-exclu-ink/95 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
                  <CardContent className="px-5 py-6 space-y-4">
                    <p className="text-sm text-exclu-space">
                      Logged in as <span className="font-medium text-exclu-cloud">{currentUser.email}</span>
                    </p>
                    <Button
                      variant="hero"
                      size="lg"
                      className="w-full inline-flex items-center justify-center gap-2"
                      onClick={() => handleAccept()}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Accept invitation
                    </Button>
                  </CardContent>
                </Card>
              ) : (
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
                            mode === 'login'
                              ? 'text-exclu-cloud'
                              : 'text-exclu-space/60 hover:text-exclu-space'
                          }`}
                        >
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
                        disabled={invitedEmailExists}
                      >
                        <span
                          className={`text-base font-bold transition-all ${
                            mode === 'signup'
                              ? 'text-exclu-cloud'
                              : invitedEmailExists ? 'text-exclu-space/30' : 'text-exclu-space/60 hover:text-exclu-space'
                          }`}
                        >
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
                    <CardTitle className="text-base text-exclu-cloud">
                      {mode === 'signup' ? 'Create your account' : 'Welcome back'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <form className="space-y-4" onSubmit={handleSubmit}>
                      {mode === 'signup' && !invitedEmailExists && (
                        <div className="space-y-1.5">
                          <label
                            htmlFor="chatter-display-name"
                            className="flex items-center gap-2 text-xs font-medium text-exclu-space"
                          >
                            <User className="h-3.5 w-3.5 text-exclu-space/80" />
                            Username
                          </label>
                          <Input
                            id="chatter-display-name"
                            name="display_name"
                            type="text"
                            autoComplete="nickname"
                            placeholder="Your name or nickname"
                            defaultValue=""
                            className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                            required
                          />
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label
                          htmlFor="chatter-email"
                          className="flex items-center gap-2 text-xs font-medium text-exclu-space"
                        >
                          <Mail className="h-3.5 w-3.5 text-exclu-space/80" />
                          Email
                        </label>
                        <Input
                          id="chatter-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          defaultValue={invitation.email ?? ''}
                          className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="chatter-password"
                          className="flex items-center gap-2 text-xs font-medium text-exclu-space"
                        >
                          <Lock className="h-3.5 w-3.5 text-exclu-space/80" />
                          Password
                        </label>
                        <Input
                          id="chatter-password"
                          name="password"
                          type="password"
                          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                          placeholder={mode === 'signup' ? 'Create a password' : 'Your password'}
                          className="h-11 bg-black border-white text-white placeholder:text-gray-500 focus-visible:ring-primary/60 focus-visible:ring-offset-0 text-sm"
                          minLength={6}
                          required
                        />
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
                          : mode === 'signup' && !invitedEmailExists
                            ? 'Create account'
                            : 'Log in & accept invitation'}
                      </Button>

                      {mode === 'signup' && !invitedEmailExists && (
                        <p className="text-[10px] text-exclu-space/70 text-center mt-2">
                          By signing up, you agree to our{' '}
                          <a href="/terms" className="text-primary hover:underline">Terms</a> and{' '}
                          <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>.
                        </p>
                      )}
                      {invitedEmailExists && (
                        <p className="text-[11px] text-exclu-space/80 text-center mt-2">
                          This invitation email is already linked to an account. Log in to continue.
                        </p>
                      )}
                    </form>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
