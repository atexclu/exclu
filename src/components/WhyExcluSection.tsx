import { motion, useScroll, useTransform } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { DollarSign, Zap, Users, TrendingUp, Shield, Globe } from 'lucide-react';

const features = [
  {
    icon: DollarSign,
    title: 'Keep 100% of your revenue',
    description: 'No hidden fees, no surprise deductions. Every dollar your fans spend goes directly to you.',
    highlight: '0%',
    highlightLabel: 'commission',
  },
  {
    icon: Zap,
    title: 'One-click instant unlock',
    description: 'Fans pay and access your content immediately. No friction, no waiting, no abandoned carts.',
    highlight: '1-click',
    highlightLabel: 'purchase',
  },
  {
    icon: Users,
    title: 'No account required for fans',
    description: 'Just a payment method. Your audience converts faster when there\'s nothing in their way.',
    highlight: '3x',
    highlightLabel: 'more sales',
  },
  {
    icon: TrendingUp,
    title: 'Higher conversion rates',
    description: 'Simple checkout means more completed purchases. Watch your earnings grow.',
    highlight: '80%',
    highlightLabel: 'conversion',
  },
  {
    icon: Shield,
    title: 'Your audience, your control',
    description: 'No algorithm deciding who sees your content. Direct connection with your fans.',
    highlight: '100%',
    highlightLabel: 'ownership',
  },
  {
    icon: Globe,
    title: 'Works everywhere',
    description: 'Share your links on Instagram, TikTok, Telegram, Twitter and anywhere your audience is.',
    highlight: '∞',
    highlightLabel: 'platforms',
  },
];

const FeatureCard = ({ feature, index }: { feature: typeof features[0]; index: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="group"
    >
      <div className="glass-card rounded-3xl p-8 h-full hover-lift hover:border-primary/30 transition-transform transition-shadow duration-200 will-change-transform">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-200">
          <feature.icon className="w-7 h-7 text-primary" />
        </div>

        {/* Highlight Stat */}
        <div className="mb-4">
          <span className="text-4xl font-extrabold text-exclu-cloud">{feature.highlight}</span>
          <span className="text-sm text-exclu-graphite ml-2">{feature.highlightLabel}</span>
        </div>

        {/* Content */}
        <h3 className="text-xl font-bold text-exclu-cloud mb-3">{feature.title}</h3>
        <p className="text-exclu-space leading-relaxed">{feature.description}</p>
      </div>
    </motion.div>
  );
};

const WhyExcluSection = () => {
  const headerRef = useRef(null);
  const isHeaderInView = useInView(headerRef, { once: true, margin: '-100px' });
  
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  
  const y = useTransform(scrollYProgress, [0, 1], ['20px', '-20px']);

  return (
    <section id="features" ref={containerRef} className="relative py-24 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/3 rounded-full blur-[150px]" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <motion.div
          ref={headerRef}
          style={{ y }}
          initial={{ opacity: 0, y: 30 }}
          animate={isHeaderInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-primary text-sm font-semibold tracking-wider uppercase mb-4">
            Why Exclu
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-exclu-cloud mb-6">
            Built for creators who want{' '}
            <span className="gradient-text">more</span>
          </h2>
          <p className="text-lg text-exclu-space max-w-2xl mx-auto">
            Stop giving away 20% of your hard work. Exclu puts you in complete control of your monetization.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyExcluSection;
