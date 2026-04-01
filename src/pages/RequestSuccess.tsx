import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ArrowLeft, ExternalLink, AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import Aurora from '@/components/ui/Aurora';
import logo from '@/assets/logo-white.svg';

interface CreatorProfile {
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

  const status = searchParams.get('status'); // 'success' | 'cancelled'
  const handle = searchParams.get('creator');
  const amountCents = parseInt(searchParams.get('amount') || '0', 10);
  const isNewAccount = searchParams.get('new_account') === '1';
  const isExistingAccount = searchParams.get('existing_account') === '1';
  const ugpTransactionId = searchParams.get('TransactionID');
  const merchantRef = searchParams.get('MerchantReference');
  const isSuccess = status === 'success';
  const amountDollars = amountCents > 0 ? (amountCents / 100).toFixed(2) : null;

  useEffect(() => {
    const load = async () => {
      // Verify payment in background (fallback if ConfirmURL didn't fire)
      if (ugpTransactionId && merchantRef) {
        supabase.functions.invoke('verify-payment', {
          body: { merchant_reference: merchantRef, transaction_id: ugpTransactionId },
        }).catch(() => {});
      }

      if (handle) {
        const { data } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, handle')
          .eq('handle', handle)
          .maybeSingle();
        if (data) setCreator(data);
      }
      setIsLoading(false);
      setTimeout(() => setShowContent(true), 100);
    };
    load();
  }, [handle]);

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

      {/* Logo */}
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
            className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-24 gap-8 max-w-lg mx-auto w-full"
          >
            {/* Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.25 }}
            >
              <div className={`w-24 h-24 rounded-full flex items-center justify-center backdrop-blur-sm ${
                isSuccess
                  ? 'bg-lime-400/10 border border-lime-400/30'
                  : 'bg-red-400/10 border border-red-400/30'
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

            {/* Title + amount */}
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
                    on hold until {creator?.display_name || creator?.handle || 'the creator'} responds
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

            {/* New account notice */}
            {isSuccess && isNewAccount && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="w-full rounded-2xl border border-lime-400/20 bg-lime-400/5 backdrop-blur-sm px-5 py-4"
              >
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-lime-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white mb-1">Account created!</p>
                    <p className="text-xs text-white/60 leading-relaxed">
                      We sent a confirmation email to verify your account. Please check your inbox and confirm to track your request.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Existing account notice */}
            {isSuccess && isExistingAccount && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-5 py-4"
              >
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-white/60 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white mb-1">Request linked to your account</p>
                    <p className="text-xs text-white/60 leading-relaxed">
                      Log in to your fan account to track this request and get notified when the creator responds.
                    </p>
                  </div>
                </div>
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

            {/* Explanation text */}
            {isSuccess && (
              <motion.p
                className="text-center text-sm text-white/50 leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.65 }}
              >
                Your card has been authorized but <strong className="text-white/70">not charged yet</strong>.
                {' '}The creator has 6 days to accept. If they decline or don't respond, the hold is automatically released.
              </motion.p>
            )}

            {/* CTA buttons */}
            <motion.div
              className="w-full flex flex-col gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75 }}
            >
              {isSuccess && isExistingAccount && (
                <Button
                  type="button"
                  className="w-full rounded-2xl h-13 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm gap-2 transition-all hover:shadow-[0_0_24px_rgba(163,230,53,0.45)]"
                  onClick={() => navigate('/auth')}
                >
                  Log in to track your request
                </Button>
              )}
              {isSuccess && isNewAccount && (
                <Button
                  type="button"
                  className="w-full rounded-2xl h-13 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm gap-2 transition-all hover:shadow-[0_0_24px_rgba(163,230,53,0.45)]"
                  onClick={() => navigate('/auth')}
                >
                  Go to login
                </Button>
              )}
              {isSuccess && !isNewAccount && !isExistingAccount && (
                <Button
                  type="button"
                  className="w-full rounded-2xl h-13 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm gap-2 transition-all hover:shadow-[0_0_24px_rgba(163,230,53,0.45)]"
                  onClick={() => navigate('/fan?tab=requests')}
                >
                  <MessageSquare className="w-4 h-4" />
                  View my requests
                </Button>
              )}
              {creator?.handle && (
                <Button
                  type="button"
                  variant={isSuccess ? 'ghost' : 'default'}
                  className={isSuccess
                    ? 'w-full rounded-2xl h-11 text-white/40 hover:text-white/70 text-sm gap-2'
                    : 'w-full rounded-2xl h-13 bg-lime-400 hover:bg-lime-300 text-black font-semibold text-sm gap-2 transition-all hover:shadow-[0_0_24px_rgba(163,230,53,0.45)]'
                  }
                  onClick={() => navigate(`/${creator.handle}`)}
                >
                  <ExternalLink className="w-4 h-4" />
                  {isSuccess ? 'Back to profile' : 'Try again'}
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
