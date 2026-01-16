import { motion } from 'framer-motion';
import { useRef } from 'react';
import { useInView } from 'framer-motion';
import { Verified } from 'lucide-react';

// Fictional creator data for the carousel
const creators = [
  { name: 'Luna Rose', followers: '125K', gradient: 'from-white/10 to-exclu-arsenic/30' },
  { name: 'Stella ✨', followers: '89K', gradient: 'from-exclu-steel/20 to-exclu-arsenic/30' },
  { name: 'Maya Blue', followers: '203K', gradient: 'from-white/15 to-exclu-phantom/40' },
  { name: 'Ava Divine', followers: '156K', gradient: 'from-exclu-smoke/10 to-exclu-arsenic/30' },
  { name: 'Jade Kim', followers: '67K', gradient: 'from-white/10 to-exclu-graphite/30' },
  { name: 'Sophie', followers: '312K', gradient: 'from-exclu-cloud/10 to-exclu-phantom/40' },
  { name: 'Mia Star', followers: '94K', gradient: 'from-white/15 to-exclu-arsenic/30' },
  { name: 'Nina Lake', followers: '178K', gradient: 'from-exclu-steel/15 to-exclu-phantom/40' },
];

// Double the array for infinite scroll effect
const doubledCreators = [...creators, ...creators];

const CreatorsCarousel = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <section ref={ref} id="creators" className="relative py-20 overflow-hidden">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-12 px-6"
      >
        <h2 className="text-4xl sm:text-5xl lg:text-6xl xl:text-6xl font-extrabold tracking-tight text-exclu-cloud mb-4">
          <span className="gradient-text">10,000+</span> creators
        </h2>
        <p className="text-lg text-exclu-space max-w-2xl mx-auto">
          Building on their own terms: earning more, keeping more, and owning every connection.
        </p>
      </motion.div>

      {/* Fade edges */}
      <div className="absolute left-0 top-32 bottom-0 w-40 bg-gradient-to-r from-background to-transparent z-10" />
      <div className="absolute right-0 top-32 bottom-0 w-40 bg-gradient-to-l from-background to-transparent z-10" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="relative"
      >
        {/* First row - moves left */}
        <motion.div
          className="flex gap-5 mb-5"
          animate={{ x: [0, -1920] }}
          transition={{
            x: {
              repeat: Infinity,
              repeatType: 'loop',
              duration: 30,
              ease: 'linear',
            },
          }}
        >
          {doubledCreators.map((creator, index) => (
            <div
              key={`row1-${index}`}
              className="flex-shrink-0 group cursor-pointer"
            >
              <div className="relative w-52 h-72 rounded-3xl overflow-hidden transition-all duration-500 group-hover:scale-[1.03] border border-exclu-arsenic/40 group-hover:border-white/30">
                {/* Gradient background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${creator.gradient}`} />
                {/* Subtle pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_40%,hsl(var(--exclu-arsenic)/0.15)_50%,transparent_60%)]" />
                {/* Silhouette placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-exclu-arsenic/50 to-exclu-graphite/40 border border-exclu-arsenic/30" />
                </div>
                {/* Name label - enhanced */}
                <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-exclu-black via-exclu-black/90 to-transparent">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white font-bold text-base">{creator.name}</p>
                    <Verified className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-exclu-steel text-sm">{creator.followers} followers</p>
                </div>
                {/* Hover glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/5 to-transparent" />
                {/* Top shine effect */}
                <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            </div>
          ))}
        </motion.div>

        {/* Second row - moves right */}
        <motion.div
          className="flex gap-5"
          animate={{ x: [-1920, 0] }}
          transition={{
            x: {
              repeat: Infinity,
              repeatType: 'loop',
              duration: 35,
              ease: 'linear',
            },
          }}
        >
          {[...doubledCreators].reverse().map((creator, index) => (
            <div
              key={`row2-${index}`}
              className="flex-shrink-0 group cursor-pointer"
            >
              <div className="relative w-52 h-72 rounded-3xl overflow-hidden transition-all duration-500 group-hover:scale-[1.03] border border-exclu-arsenic/40 group-hover:border-white/30">
                {/* Gradient background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${creator.gradient}`} />
                {/* Subtle pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(-45deg,transparent_40%,hsl(var(--exclu-arsenic)/0.15)_50%,transparent_60%)]" />
                {/* Silhouette placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-exclu-arsenic/50 to-exclu-graphite/40 border border-exclu-arsenic/30" />
                </div>
                {/* Name label - enhanced */}
                <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-exclu-black via-exclu-black/90 to-transparent">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white font-bold text-base">{creator.name}</p>
                    <Verified className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-exclu-steel text-sm">{creator.followers} followers</p>
                </div>
                {/* Hover glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/5 to-transparent" />
                {/* Top shine effect */}
                <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
};

export default CreatorsCarousel;
