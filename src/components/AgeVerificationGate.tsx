import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '@/assets/logo-white.svg';

const STORAGE_KEY = 'exclu_age_verified';

const AgeVerificationGate = ({ children }: { children: React.ReactNode }) => {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setVerified(stored === 'true');
  }, []);

  const handleConfirm = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVerified(true);
  };

  const handleDecline = () => {
    setDeclined(true);
  };

  if (verified === null) return null;

  if (declined) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center px-6 text-center">
        <img src={logo} alt="Exclu" className="h-7 mb-8 opacity-40" />
        <h1 className="text-2xl font-bold text-white mb-3">Access Restricted</h1>
        <p className="text-white/60 text-sm max-w-sm mb-8">
          You must be at least 18 years old to access this website.
          If you believe this is an error, please close this tab and try again.
        </p>
        <a
          href="https://www.google.com"
          className="px-6 py-2.5 rounded-full bg-white/10 border border-white/20 text-white text-sm font-medium hover:bg-white/20 transition-colors"
        >
          Leave this site
        </a>
      </div>
    );
  }

  if (verified) return <>{children}</>;

  return (
    <>
      <div className="blur-lg pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>

      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-sm mx-4 rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 to-black p-8 shadow-2xl text-center"
          >
            <img src={logo} alt="Exclu" className="h-6 mx-auto mb-6 opacity-80" />

            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">🔞</span>
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Age Verification</h2>
            <p className="text-white/50 text-sm leading-relaxed mb-6">
              This website contains age-restricted content. By entering, you confirm that you are
              <span className="text-white font-semibold"> at least 18 years old</span> and
              the age of majority in your jurisdiction.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleConfirm}
                className="w-full h-12 rounded-full bg-[#CFFF16] text-black text-sm font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_20px_4px_rgba(207,255,22,0.2)]"
              >
                I am 18 or older — Enter
              </button>
              <button
                type="button"
                onClick={handleDecline}
                className="w-full h-10 rounded-full bg-white/5 border border-white/10 text-white/50 text-sm font-medium hover:text-white/70 hover:bg-white/10 transition-colors"
              >
                I am under 18 — Leave
              </button>
            </div>

            <p className="text-[10px] text-white/30 mt-5 leading-relaxed">
              By entering this site, you agree to our{' '}
              <a href="/terms" className="underline hover:text-white/50">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" className="underline hover:text-white/50">Privacy Policy</a>.
            </p>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </>
  );
};

export default AgeVerificationGate;
