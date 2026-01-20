import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Play, Lock, CreditCard, MessageCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const HeroSection = () => {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const isMobile = useIsMobile();

  return (
    <section ref={sectionRef} className="relative min-h-[80vh] flex flex-col justify-center overflow-hidden pt-24 pb-16 px-4 sm:px-6">
      {/* Subtle Background Effects */}
      <div className="absolute inset-0 radial-gradient opacity-40" />
      <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-glow-violet/8 rounded-full blur-[150px] animate-pulse-glow" />
      <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-glow-pink/6 rounded-full blur-[120px] animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
      
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 grid-pattern opacity-20" />
      
      <motion.div style={isMobile ? undefined : { y, opacity }} className="max-w-6xl mx-auto w-full relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          {/* Media column */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className="order-2 lg:order-2 relative w-full max-w-[14rem] sm:max-w-[15rem] md:max-w-[16rem] lg:max-w-[18rem] mx-auto"
          >
            <motion.div
              className="relative z-20 rounded-[2rem] overflow-hidden border border-exclu-arsenic/60 shadow-glow-lg bg-exclu-black/80"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="aspect-[9/16] relative">
                <video
                  src="/videos/exclu-teaser.mp4"
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-exclu-black/60 via-transparent to-exclu-black/20 pointer-events-none" />

                {/* Inline unlock pill removed per latest design request */}
              </div>
            </motion.div>

            {/* Subtle glow behind the device */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/15 via-transparent to-accent/15 rounded-3xl blur-3xl" />
          </motion.div>

          {/* Text Content */}
          <div className="order-1 lg:order-1 text-center lg:text-left space-y-6">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full"
            >
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm text-exclu-cloud font-medium">Start free or go premium for 0% commission</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight"
            >
              <span className="block lg:inline-block lg:whitespace-nowrap">
                Sell exclusive content
              </span>
              <br className="hidden lg:block" />
              <span className="gradient-text block lg:inline-block lg:whitespace-nowrap">
                with 0% commission.
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-base sm:text-lg lg:text-xl text-exclu-space max-w-xl mx-auto lg:mx-0 leading-relaxed"
            >
              Turn every photo, video or file into a paid link your fans can unlock in one click.
              No accounts, no friction. Just a clean paywall experience where
              <span className="text-exclu-cloud font-semibold"> you keep what you earn.</span>
            </motion.p>

            {/* Value props row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs sm:text-sm text-exclu-graphite"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-exclu-arsenic/60 bg-exclu-phantom/70 px-4 py-2">
                <Lock className="w-4 h-4 text-primary" />
                <span>Secure payments</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-exclu-arsenic/60 bg-exclu-phantom/70 px-4 py-2">
                <CreditCard className="w-4 h-4 text-primary" />
                <span>Instant payouts</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-exclu-arsenic/60 bg-exclu-phantom/70 px-4 py-2">
                <MessageCircle className="w-4 h-4 text-primary" />
                <span>Real human chat</span>
              </div>
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-2"
            >
              <Button variant="hero" size="xl" className="group" asChild>
                <a href="/auth">
                  Start selling in minutes
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </section>
  );
};

export default HeroSection;
