import { motion } from 'framer-motion';
import { useRef } from 'react';
import { useInView } from 'framer-motion';

const VideoShowcase = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="video-showcase" ref={ref} className="relative py-24 px-6 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      
      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <span className="inline-block text-primary text-sm font-semibold tracking-wider uppercase mb-4">
            See It In Action
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-exclu-cloud mb-6">
            Watch how <span className="gradient-text">Exclu</span> works
          </h2>
          <p className="text-lg text-exclu-space max-w-2xl mx-auto">
            From upload to payout in under a minute. See the seamless experience for both creators and fans.
          </p>
        </motion.div>

        {/* Video Container - Direct Preview */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative aspect-video rounded-3xl overflow-hidden border-2 border-exclu-arsenic/30 hover:border-primary/30 transition-colors duration-300 group shadow-glow-lg"
        >
          {/* Video element - always visible as preview */}
          <video
            className="w-full h-full object-cover"
            controls
            muted
            loop
            playsInline
            poster=""
            src="/videos/exclu-demo.mp4"
          >
            Your browser does not support the video tag.
          </video>

          {/* Corner glow effect */}
          <div className="absolute -top-20 -right-20 w-60 h-60 bg-primary/20 rounded-full blur-[80px] opacity-50 pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-accent/20 rounded-full blur-[80px] opacity-50 pointer-events-none" />
        </motion.div>
      </div>
    </section>
  );
};

export default VideoShowcase;
