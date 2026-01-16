import { motion, useScroll, useTransform } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Check, TrendingUp } from 'lucide-react';

const FinalCTASection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  
  const y = useTransform(scrollYProgress, [0, 1], ['40px', '-40px']);

  return (
    <section ref={containerRef} className="relative py-24 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-t from-primary/8 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-t from-primary/15 to-transparent rounded-full blur-[180px]" />
      <div className="absolute inset-0 grid-pattern opacity-15" />

      <motion.div style={{ y }} className="max-w-4xl mx-auto relative z-10" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          {/* Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : { scale: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-exclu-cloud to-exclu-steel mb-8"
          >
            <TrendingUp className="w-10 h-10 text-exclu-black" />
          </motion.div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-exclu-cloud mb-6 leading-tight">
            Ready to keep{' '}
            <span className="inline-flex items-baseline">
              <span className="gradient-text text-5xl sm:text-6xl lg:text-7xl">100</span>
              <span className="gradient-text text-3xl sm:text-4xl lg:text-5xl">%</span>
            </span>{' '}
            of your earnings?
          </h2>

          <p className="text-lg sm:text-xl text-exclu-space max-w-2xl mx-auto mb-10">
            Join thousands of creators who've switched to Exclu. No more giving away 20% of your hard work to platforms that don't care about you.
          </p>

          {/* Benefits */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap justify-center gap-6 mb-10"
          >
            {['No approval process', 'Instant payouts', '98% fan satisfaction'].map((benefit) => (
              <div key={benefit} className="flex items-center gap-2 text-exclu-cloud">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary" />
                </div>
                <span>{benefit}</span>
              </div>
            ))}
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Button variant="hero" size="xl" className="group" asChild>
              <a href="#pricing">
                Start monetizing today
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
};

export default FinalCTASection;
