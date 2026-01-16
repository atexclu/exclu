import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const TeaserVideoGrid = () => {
  // Create an array for the grid items
  const gridItems = Array(6).fill(null);

  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  return (
    <section ref={sectionRef} className="relative py-12 overflow-hidden bg-exclu-black/50">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-exclu-phantom/10 to-background" />
      
      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 px-3 sm:px-4"
        >
          {gridItems.map((_, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
              transition={{ delay: 0.15 + index * 0.06, duration: 0.4, ease: 'easeOut' }}
              className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-exclu-arsenic/30 group"
            >
              <video
                src="/videos/exclu-teaser.mp4"
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-exclu-black/60 via-transparent to-exclu-black/20 opacity-60 group-hover:opacity-40 transition-opacity duration-300" />
              
              {/* Subtle glow on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-white/5 to-transparent" />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default TeaserVideoGrid;
