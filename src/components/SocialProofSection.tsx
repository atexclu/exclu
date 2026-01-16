import { motion, useScroll, useTransform } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { TrendingUp, Users, Globe, Zap } from 'lucide-react';

const stats = [
  { icon: Users, value: '10K+', label: 'Creators joined' },
  { icon: TrendingUp, value: '$2M+', label: 'Paid to creators' },
  { icon: Globe, value: '150+', label: 'Countries' },
  { icon: Zap, value: '15s', label: 'Unlock time' },
];

const visionQuote =
  "Creators deserve to own their revenue, their audience, and their future. We're building the platform that makes it happen.";
const visionWords = visionQuote.split(' ');

const SocialProofSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  
  const y = useTransform(scrollYProgress, [0, 1], ['30px', '-30px']);

  const wordVariants = {
    initial: {
      opacity: 0.6,
      y: 4,
      color: 'hsl(var(--exclu-graphite))',
    },
    animate: {
      opacity: 1,
      y: 0,
      color: 'hsl(var(--exclu-cloud))',
    },
  } as const;

  return (
    <section ref={containerRef} className="relative py-24 px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 grid-pattern opacity-20" />
      
      <div className="max-w-6xl mx-auto relative z-10" ref={ref}>
        {/* Stats Grid */}
        <motion.div style={{ y }} className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="text-center group"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl glass-card mb-4 group-hover:scale-110 transition-transform duration-300">
                <stat.icon className="w-7 h-7 text-primary" />
              </div>
              <p className="text-3xl sm:text-4xl font-extrabold text-exclu-cloud mb-2">{stat.value}</p>
              <p className="text-exclu-space text-sm">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Vision Statement */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-center max-w-3xl mx-auto"
        >
          <motion.h3
            className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-6 leading-tight"
            initial="initial"
            animate={isInView ? 'animate' : 'initial'}
            transition={{ staggerChildren: 0.03, duration: 0.4 }}
          >
            <span className="mr-1">"</span>
            {visionWords.map((word, index) => (
              <motion.span
                key={index}
                variants={wordVariants}
                className="inline-block mr-1"
              >
                {word}
              </motion.span>
            ))}
            <span>"</span>
          </motion.h3>
          <p className="text-exclu-graphite">The Exclu Team</p>
        </motion.div>
      </div>
    </section>
  );
};

export default SocialProofSection;
