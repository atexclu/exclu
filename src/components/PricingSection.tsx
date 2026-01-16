import { motion, useScroll, useTransform } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Sparkles, ArrowRight, Zap, Shield, Users, TrendingUp } from 'lucide-react';

const features = [
  { icon: Zap, text: '0% commission, keep everything' },
  { icon: Shield, text: '5% processing fee for fans only' },
  { icon: Users, text: 'Unlimited paid links' },
  { icon: TrendingUp, text: 'Advanced analytics & insights' },
  { icon: Check, text: 'Priority support 24/7' },
  { icon: Check, text: 'Custom link-in-bio page' },
  { icon: Check, text: 'Early access to new features' },
  { icon: Check, text: 'Direct chat with our team' },
];

const PricingSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  
  const y = useTransform(scrollYProgress, [0, 1], ['50px', '-50px']);

  return (
    <section id="pricing" ref={containerRef} className="relative py-32 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-primary/8 to-accent/8 rounded-full blur-[180px]" />
      <div className="absolute inset-0 grid-pattern opacity-15" />

      <div className="max-w-4xl mx-auto relative z-10" ref={ref}>
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-primary text-sm font-semibold tracking-wider uppercase mb-4">
            Simple Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-exclu-cloud mb-6">
            One plan. <span className="gradient-text">Zero commission.</span>
          </h2>
          <p className="text-lg text-exclu-space max-w-2xl mx-auto">
            No hidden fees. No complicated tiers. Just transparent pricing that puts you first.
          </p>
        </motion.div>

        {/* Single Pricing Card */}
        <motion.div
          style={{ y }}
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative max-w-xl mx-auto"
        >
          {/* Popular Badge */}
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-10">
            <motion.div 
              className="px-6 py-2 rounded-full bg-gradient-to-r from-primary to-accent text-exclu-black text-sm font-bold flex items-center gap-2 shadow-glow-lg"
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Sparkles className="w-4 h-4 text-exclu-black" />
              Premium
            </motion.div>
          </div>

          {/* Card */}
          <div className="relative rounded-[2rem] p-10 bg-gradient-to-br from-exclu-phantom/80 to-exclu-black/90 backdrop-blur-xl border-2 border-primary/30 shadow-glow-lg hover:shadow-[0_0_100px_20px_hsl(260,60%,60%/0.2)] transition-shadow duration-500">
            {/* Corner glow accents */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/20 rounded-full blur-[60px]" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-accent/15 rounded-full blur-[60px]" />
            
            {/* Plan Header */}
            <div className="text-center mb-10 relative z-10">
              <h3 className="text-2xl font-bold text-exclu-cloud mb-6">Premium</h3>
              <div className="flex items-baseline justify-center gap-1 mb-4">
                <span className="text-7xl font-extrabold text-exclu-white">$39</span>
                <span className="text-xl text-exclu-graphite">/month</span>
              </div>
              <p className="text-exclu-space text-lg">Maximum earnings for serious creators</p>
            </div>

            {/* Features Grid */}
            <div className="grid sm:grid-cols-2 gap-4 mb-10 relative z-10">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.text}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                  transition={{ duration: 0.4, delay: 0.4 + index * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-exclu-cloud text-sm">{feature.text}</span>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="relative z-10"
            >
              <Button
                variant="hero"
                size="xl"
                className="w-full group text-lg"
                asChild
              >
                <a href="/auth">
                  Start monetizing now
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </a>
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Trust Note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="text-center text-exclu-graphite mt-10 text-sm"
        >
          Cancel anytime • No long-term contracts • Start earning immediately
        </motion.p>
      </div>
    </section>
  );
};

export default PricingSection;
