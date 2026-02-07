import { motion, useScroll, useTransform } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Sparkles, ArrowRight, Zap, Shield, Users, TrendingUp } from 'lucide-react';

const freeFeatures = [
  { icon: Check, text: 'Unlimited paid links' },
  { icon: Check, text: 'Basic analytics' },
  { icon: Check, text: 'Link-in-bio page' },
  { icon: Shield, text: '5% processing fee for fans' },
];

const premiumFeatures = [
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
            Choose your plan. <span className="text-[#CFFF16]">Start earning.</span>
          </h2>
          <p className="text-lg text-exclu-space max-w-2xl mx-auto">
            Start free with 10% commission, or go premium for 0% commission. Fans always pay a 5% processing fee.
          </p>
        </motion.div>

        {/* Two Pricing Cards */}
        <motion.div
          style={{ y }}
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto"
        >
          {/* Free Plan */}
          <div className="relative rounded-[2rem] p-8 bg-gradient-to-br from-exclu-phantom/60 to-exclu-black/80 backdrop-blur-xl border border-exclu-arsenic/50 hover:border-exclu-arsenic transition-colors duration-300">
            {/* Plan Header */}
            <div className="text-center mb-8 relative z-10">
              <h3 className="text-xl font-bold text-exclu-cloud mb-4">Free</h3>
              <div className="flex items-baseline justify-center gap-1 mb-3">
                <span className="text-5xl font-extrabold text-exclu-white">$0</span>
                <span className="text-lg text-exclu-graphite">/month</span>
              </div>
              <p className="text-exclu-space text-sm">Get started with no upfront cost</p>
              <div className="mt-3 inline-block px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
                <span className="text-amber-300 text-xs font-medium">10% commission on sales</span>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-3 mb-8 relative z-10">
              {freeFeatures.map((feature, index) => (
                <motion.div
                  key={feature.text}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                  transition={{ duration: 0.4, delay: 0.4 + index * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-lg bg-exclu-arsenic/50 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-3.5 h-3.5 text-exclu-cloud" />
                  </div>
                  <span className="text-exclu-cloud/80 text-sm">{feature.text}</span>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <Button
              variant="outline"
              size="lg"
              className="w-full group border-exclu-arsenic/60 hover:border-exclu-cloud/40"
              asChild
            >
              <a href="/auth">
                Start for free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
          </div>

          {/* Premium Plan */}
          <div className="relative rounded-[2rem] p-8 bg-gradient-to-br from-exclu-phantom/80 to-exclu-black/90 backdrop-blur-xl border-2 border-primary/30 shadow-glow-lg hover:shadow-[0_0_100px_20px_hsl(260,60%,60%/0.2)] transition-shadow duration-500">
            {/* Popular Badge */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
              <motion.div 
                className="px-4 py-1.5 rounded-full bg-gradient-to-r from-primary to-accent text-exclu-black text-xs font-bold flex items-center gap-1.5 shadow-glow-lg"
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="w-3.5 h-3.5 text-exclu-black" />
                Best Value
              </motion.div>
            </div>

            {/* Corner glow accents */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-[60px]" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-accent/15 rounded-full blur-[60px]" />
            
            {/* Plan Header */}
            <div className="text-center mb-8 relative z-10">
              <h3 className="text-xl font-bold text-exclu-cloud mb-4">Premium</h3>
              <div className="flex items-baseline justify-center gap-1 mb-3">
                <span className="text-5xl font-extrabold text-exclu-white">$39</span>
                <span className="text-lg text-exclu-graphite">/month</span>
              </div>
              <p className="text-exclu-space text-sm">Maximum earnings for serious creators</p>
              <div className="mt-3 inline-block px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                <span className="text-emerald-300 text-xs font-medium">0% commission on sales</span>
              </div>
            </div>

            {/* Features Grid */}
            <div className="space-y-3 mb-8 relative z-10">
              {premiumFeatures.map((feature, index) => (
                <motion.div
                  key={feature.text}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                  transition={{ duration: 0.4, delay: 0.4 + index * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-exclu-cloud text-sm">{feature.text}</span>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <Button
              variant="hero"
              size="lg"
              className="w-full group"
              asChild
            >
              <a href="/auth">
                Go Premium
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
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
