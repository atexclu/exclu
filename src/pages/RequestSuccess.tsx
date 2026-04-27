import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ArrowLeft, ExternalLink, AlertCircle, CheckCircle2, Lock, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Aurora from '@/components/ui/Aurora';
import { toast } from 'sonner';
import logo from '@/assets/logo-white.svg';

interface CreatorProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
}

const RequestSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [password, setPassword] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);

  const status = searchParams.get('status'); // 'success' | 'cancelled'
  const handle = searchParams.get('creator');
  const amountCents = parseInt(searchParams.get('amount') || '0', 10);
  const isGuest = searchParams.get('guest') === '1';
  const guestEmail = searchParams.get('email') || '';
  const ugpTransactionId = searchParams.get('TransactionID');
  const merchantRef = searchParams.get('MerchantReference');
  const isSuccess = status === 'success';
  const amountDollars = amountCents > 0 ? (amountCents / 100).toFixed(2) : null;

  useEffect(() => {
    const load = async () => {
      // Verify payment (fallback if ConfirmURL didn't fire)
      if (ugpTransactionId && merchantRef) {
        try {
          await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant_reference: merchantRef, transaction_id: ugpTransactionId }),
          });
        } catch (err) {
          console.error('[RequestSuccess] verify-payment failed:', err);
        }
      }

      if (handle) {
        const { data } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url, handle')
          .eq('handle', handle)
          .maybeSingle();
        if (data) setCreator(data);
      }
      setIsLoading(false);
      setTimeout(() => setShowContent(true), 100);
    };
    load();
  }, [handle, ugpTransactionId, merchantRef]);

  const handleSignup = async () => {
    if (!guestEmail || !password || password.length < 6) {
      toast.error('Please choose a password of at least 6 characters');
      return;
    }
    setIsSigningUp(true);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: guestEmail,
        password,
        options: {
          data: {
            is_creator: false,
            favorite_creator: creator?.id ?? null,
          },
        },
      });

      if (signUpError) {
        const msg = (signUpError.message || '').toLowerCase();
        if (msg.includes('already')) {
          toast.error('An account already exists for this email. Sign in to track your request.');
          navigate(`/fan/signup?email=${encodeURIComponent(guestEmail)}${creator?.handle ? `&creator=${creator.handle}` : ''}`);
          return;
        }
        throw signUpError;
      }

      // If session is returned (Confirm email = OFF), reattach guest data now.
      if (signUpData?.session) {
        try {
          await supabase.rpc('claim_guest_custom_requests', { p_email: guestEmail });
        } catch (rpcErr) {
          console.warn('[RequestSuccess] claim_guest_custom_requests failed (non-fatal)', rpcErr);
        }

        // Defensive auto-favorite (the RPC also does it for any reattached
        // request, but if the request hasn't been confirmed by ugp-confirm
        // yet there might be no row to claim — favorite directly here too).
        if (creator?.id) {
          await supabase
            .from('fan_favorites')
            .upsert({ fan_id: signUpData.user!.id, creator_id: creator.id }, { onConflict: 'fan_id,creator_id' });
        }

        toast.success('Account created — your request is in your dashboard.');
        setSignupComplete(true);
        const fanPath = creator?.handle ? `/fan?creator=${creator.handle}` : '/fan';
        navigate(fanPath, { replace: true });
        return;
      }

      // Confirm email = ON path: ask the user to verify their inbox. The RPC
      // will fire the next time they log in via FanSignup.
      toast.success('Check your inbox to confirm your account.');
      setSignupComplete(true);
    } catch (err: any) {
      toast.error(err?.message || 'Could not create your account.');
    } finally {
      setIsSigningUp(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-lime-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-black via-exclu-ink to-black overflow-hidden flex flex-col text-white">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Aurora
          colorStops={isSuccess ? ['#a3e635', '#4ade80', '#86efac'] : ['#f87171', '#fb923c', '#fbbf24']}
          blend={0.35}
          amplitude={0.8}
          speed={0.6}
        />
      </div>

      <motion.div
        className="fixed top-6 inset-x-0 z-20 flex justify-center pointer-events-none"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <img src={logo} alt="Exclu" className="h-5 w-auto pointer-events-auto" />
      </motion.div>

      <AnimatePresence>
        {showContent && (
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 180, damping: 22, delay: 0.1 }}
            className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-24 gap-6 max-w-lg mx-auto w-full"
          >
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.25 }}
            >
              <div className={`w-24 h-24 rounded-full flex items-center justify-center backdrop-blur-sm ${
                isSuccess ? 'bg-lime-400/10 border border-lime-400/30' : 'bg-red-400/10 border border-red-400/30'
              }`}>
                <motion.div animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
                  {isSuccess ? (
                    <CheckCircle2 className="w-11 h-11 text-lime-400" />
                  ) : (
                    <AlertCircle className="w-11 h-11 text-red-400" />
                  )}
                </motion.div>
              </div>
            </motion.div>

            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              {isSuccess ? (
                <>
                  <p className="text-xs font-semibold tracking-widest text-lime-400/80 uppercase mb-3">
                    Request submitted
                  </p>
                  {amountDollars && (
                    <motion.h1
                      className="text-6xl font-black leading-none mb-2"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.5 }}
                    >
                      <span className="bg-gradient-to-r from-lime-400 to-yellow-300 bg-clip-text text-transparent">
                        ${amountDollars}
                      </span>
                    </motion.h1>
                  )}
                  <p className="text-sm text-white/50">
                    {creator?.display_name || creator?.handle || 'The creator'} has 6 days to respond.
                    Refunded automatically if declined.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold tracking-widest text-red-400/80 uppercase mb-3">
                    Payment cancelled
                  </p>
                  <h1 className="text-3xl font-black leading-tight mb-2 text-white">
                    No charges applied
                  </h1>
                  <p className="text-sm text-white/50 leading-relaxed">
                    Your request was not submitted and you have not been charged.<br />
                    You can go back and try again.
                  </p>
                </>
              )}
            </motion.div>

            {/* Inline guest signup form — shown after a successful payment when
                the fan is not yet authenticated. Fills the password, calls
                claim_guest_custom_requests, auto-favorites the creator, and
                lands the user on /fan. */}
            {isSuccess && isGuest && !signupComplete && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="w-full rounded-2xl border border-lime-400/30 bg-black/40 backdrop-blur-md p-5 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-lime-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white mb-1">Track your request — create your account</p>
                    <p className="text-xs text-white/60 leading-relaxed">
                      Choose a password and we'll save this request to your dashboard, follow {creator?.display_name || 'the creator'} for you, and unlock chat to keep talking.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-widest text-white/40">Email</p>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                    <Input
                      type="email"
                      value={guestEmail}
                      readOnly
                      className="h-11 bg-white/5 border-white/10 text-white/70 text-sm rounded-xl pl-9 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-widest text-white/40">Choose a password</p>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSignup(); }}
                    placeholder="At least 6 characters"
                    autoFocus
                    className="h-11 bg-white/5 border-white/20 text-white placeholder:text-white/30 text-sm rounded-xl"
                  />
                </div>

                <Button
                  type="button"
                  onClick={handleSignup}
                  disabled={isSigningUp || password.length < 6}
                  className="w-full rounded-2xl h-12 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm gap-2 transition-all hover:shadow-[0_0_24px_rgba(163,230,53,0.45)] disabled:opacity-40"
                >
                  {isSigningUp ? 'Creating your account…' : 'Create account & track request'}
                </Button>

                <p className="text-[10px] text-white/40 text-center leading-relaxed">
                  Skip if you'd rather receive updates by email only — we'll deliver your content there as well.
                </p>
              </motion.div>
            )}

            {/* Creator card */}
            {creator && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="w-full"
              >
                <div
                  className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/30 backdrop-blur-md group cursor-pointer hover:border-lime-400/40 transition-colors"
                  onClick={() => navigate(`/${creator.handle}`)}
                >
                  {creator.avatar_url && (
                    <div className="relative h-16 overflow-hidden">
                      <img
                        src={creator.avatar_url}
                        alt=""
                        className="w-full h-full object-cover object-top"
                        style={{ filter: 'blur(6px)', transform: 'scale(1.2)', opacity: 0.4 }}
                      />
                    </div>
                  )}
                  <div className={`flex items-center gap-3 px-4 pb-4 relative ${creator.avatar_url ? '-mt-5' : 'pt-4'}`}>
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-lime-400/60 flex-shrink-0 shadow-lg shadow-lime-400/20">
                      {creator.avatar_url ? (
                        <img src={creator.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-lime-400/10 flex items-center justify-center">
                          <span className="text-xl font-bold text-lime-400">
                            {(creator.display_name || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-white truncate">
                        {creator.display_name || creator.handle}
                      </p>
                      <p className="text-sm text-white/50">@{creator.handle}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-white/30 group-hover:text-lime-400 transition-colors flex-shrink-0" />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Bottom CTAs */}
            <motion.div
              className="w-full flex flex-col gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75 }}
            >
              {/* Authenticated fan: straight to dashboard */}
              {isSuccess && !isGuest && (
                <Button
                  type="button"
                  className="w-full rounded-2xl h-13 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm gap-2 transition-all hover:shadow-[0_0_24px_rgba(163,230,53,0.45)]"
                  onClick={() => navigate('/fan?tab=requests')}
                >
                  <MessageSquare className="w-4 h-4" />
                  View my requests
                </Button>
              )}

              {/* Guest who skipped signup: keep email-only flow */}
              {isSuccess && isGuest && !signupComplete && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-2xl h-11 text-white/40 hover:text-white/70 text-sm gap-2"
                  onClick={() => navigate(creator?.handle ? `/${creator.handle}` : '/')}
                >
                  Skip — I'll just wait for the email
                </Button>
              )}

              {/* Guest who already completed signup but is on Confirm-email path */}
              {isSuccess && isGuest && signupComplete && (
                <Button
                  type="button"
                  className="w-full rounded-2xl h-13 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm gap-2 transition-all hover:shadow-[0_0_24px_rgba(163,230,53,0.45)]"
                  onClick={() => navigate('/auth')}
                >
                  Go to login
                </Button>
              )}

              {creator?.handle && !isSuccess && (
                <Button
                  type="button"
                  className="w-full rounded-2xl h-13 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm gap-2 transition-all hover:shadow-[0_0_24px_rgba(163,230,53,0.45)]"
                  onClick={() => navigate(`/${creator.handle}`)}
                >
                  <ExternalLink className="w-4 h-4" />
                  Try again
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                className="w-full rounded-2xl h-11 text-white/40 hover:text-white/70 text-sm gap-2"
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="w-4 h-4" />
                Go to home
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RequestSuccess;
