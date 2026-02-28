import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

const GiftSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const itemName = searchParams.get('item') ?? 'a gift';
  const creatorHandle = searchParams.get('creator');

  useEffect(() => {
    // Scroll to top
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="flex flex-col items-center max-w-sm"
      >
        {/* Animated gift emoji */}
        <motion.div
          initial={{ rotate: -10 }}
          animate={{ rotate: [0, -10, 10, -6, 6, 0] }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-8xl mb-6"
        >
          🎁
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-3xl font-extrabold text-white mb-3"
        >
          Gift sent! 🎉
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-white/60 text-base mb-8 leading-relaxed"
        >
          You just gifted <span className="text-white font-semibold">{itemName}</span>
          {creatorHandle ? (
            <> to <span className="text-white font-semibold">@{creatorHandle}</span></>
          ) : null}.
          {' '}The money has been transferred to their account — they'll love it!
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-3 w-full"
        >
          {creatorHandle && (
            <Button
              onClick={() => navigate(`/${creatorHandle}`)}
              className="flex-1 bg-white text-black hover:bg-white/90 font-semibold rounded-full h-12"
            >
              Back to profile
            </Button>
          )}
          <Button
            onClick={() => navigate('/')}
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/10 rounded-full h-12"
          >
            Explore Exclu
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default GiftSuccess;
