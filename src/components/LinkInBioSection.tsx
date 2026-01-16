import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Play } from 'lucide-react';

const LinkInBioSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-24 px-6 overflow-hidden">
      {/* Background - more subtle */}
      <div className="absolute inset-0 bg-gradient-to-b from-exclu-phantom/30 via-transparent to-exclu-phantom/30" />
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-white/3 rounded-full blur-[150px] -translate-y-1/2" />
      <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-white/2 rounded-full blur-[120px] -translate-y-1/2" />

      <div className="max-w-7xl mx-auto relative z-10" ref={ref}>
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Mockup */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
            transition={{ duration: 0.8 }}
            className="relative order-2 lg:order-1"
          >
            <div className="relative max-w-sm mx-auto">
              {/* Phone Frame */}
              <div className="relative glass-card rounded-[40px] p-3 shadow-glow-lg">
                <div className="bg-exclu-black rounded-[32px] overflow-hidden">
                  {/* Status Bar */}
                  <div className="h-8 bg-exclu-phantom flex items-center justify-between px-6">
                    <span className="text-xs text-exclu-graphite">9:41</span>
                    <div className="flex gap-1">
                      <div className="w-4 h-2 bg-exclu-graphite rounded-sm" />
                      <div className="w-2 h-2 bg-exclu-graphite rounded-full" />
                    </div>
                  </div>

                  {/* Video preview inside phone */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ duration: 0.6 }}
                    className="relative w-full aspect-[9/16]"
                  >
                    <video
                      src="/videos/link-in-bio.mp4"
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-exclu-black/70 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full bg-exclu-black/80 backdrop-blur-xl border border-exclu-arsenic/60 text-[11px] text-exclu-cloud">
                      <Play className="w-3 h-3 text-primary" />
                      <span>Preview of your link-in-bio page</span>
                    </div>
                  </motion.div>

                  {/* Aucun contenu supplémentaire sous la vidéo : l'écran montre uniquement le preview link-in-bio */}
                </div>
              </div>

              {/* Decorative Elements */}
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-gradient-to-br from-primary/30 to-accent/30 rounded-full blur-2xl" />
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
            transition={{ duration: 0.8 }}
            className="order-1 lg:order-2"
          >
            <span className="inline-block text-primary text-sm font-semibold tracking-wider uppercase mb-4">
              Link in Bio
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-exclu-cloud mb-6">
              Your storefront,{' '}
              <span className="gradient-text">one tap away</span>
            </h2>
            <p className="text-lg text-exclu-space mb-8 leading-relaxed">
              Create a beautiful link-in-bio page that converts. Each piece of content is a paid link. Fans just tap, pay, and unlock. No signup forms. No passwords. Just pure, frictionless sales.
            </p>

            <div className="space-y-4">
              {[
                'No account creation for fans',
                'Instant access after payment',
                'Works on any social platform',
                'Track views and conversions',
              ].map((item, index) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, x: 20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                  transition={{ delay: 0.4 + index * 0.1, duration: 0.5 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  <span className="text-exclu-cloud">{item}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default LinkInBioSection;
