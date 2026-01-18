import { motion } from 'framer-motion';
import { useRef } from 'react';
import { useInView } from 'framer-motion';
import { Verified } from 'lucide-react';

// Fictional creator data for the carousel
// Images are stored in public/creators and referenced via /creators/...
const creators = [
  { name: 'Luna Rose', followers: '125K', gradient: 'from-white/10 to-exclu-arsenic/30', image: '/creators/IMG_0041.JPG' },
  { name: 'Stella ✨', followers: '89K', gradient: 'from-exclu-steel/20 to-exclu-arsenic/30', image: '/creators/IMG_2525.jpg' },
  { name: 'Maya Blue', followers: '203K', gradient: 'from-white/15 to-exclu-phantom/40', image: '/creators/IMG_5981.jpg' },
  { name: 'Ava Divine', followers: '156K', gradient: 'from-exclu-smoke/10 to-exclu-arsenic/30', image: '/creators/IMG_8266.jpg' },
  { name: 'Jade Kim', followers: '67K', gradient: 'from-white/10 to-exclu-graphite/30', image: '/creators/IMG_8267.jpg' },
  { name: 'Sophie', followers: '312K', gradient: 'from-exclu-cloud/10 to-exclu-phantom/40', image: '/creators/IMG_8271.jpg' },
  { name: 'Mia Star', followers: '94K', gradient: 'from-white/15 to-exclu-arsenic/30', image: '/creators/IMG_8272.jpg' },
  { name: 'Nina Lake', followers: '178K', gradient: 'from-exclu-steel/15 to-exclu-phantom/40', image: '/creators/IMG_8273.jpg' },
  { name: 'Aria Noir', followers: '142K', gradient: 'from-white/10 to-exclu-arsenic/40', image: '/creators/IMG_8274.jpg' },
  { name: 'Clara Jade', followers: '98K', gradient: 'from-exclu-smoke/10 to-exclu-phantom/40', image: '/creators/IMG_8275.jpg' },
  { name: 'Nova Lynn', followers: '187K', gradient: 'from-exclu-cloud/10 to-exclu-arsenic/40', image: '/creators/1df15144-1de5-4e81-b7e1-1181b30e15d7.JPG' },
  { name: 'Isla Moon', followers: '73K', gradient: 'from-exclu-steel/20 to-exclu-graphite/40', image: '/creators/2d1b992b-48d9-48cf-90f3-6a0e343ee589.JPG' },
  { name: 'Zoey Hart', followers: '221K', gradient: 'from-white/15 to-exclu-phantom/40', image: '/creators/6cddefbc-77e4-4508-8bd1-17deeba78c32.JPG' },
  { name: 'Layla Voss', followers: '154K', gradient: 'from-exclu-steel/15 to-exclu-arsenic/40', image: '/creators/75b34fe4-e81f-42d2-97db-d93764974884.JPG' },
  { name: 'Eden Sky', followers: '65K', gradient: 'from-white/10 to-exclu-graphite/40', image: '/creators/875287ad-5627-41be-8501-ad87d7a4534f.JPG' },
  { name: 'Rhea Lux', followers: '193K', gradient: 'from-exclu-smoke/10 to-exclu-phantom/40', image: '/creators/db69e993-4244-4e96-9d0d-8d71d1a2427e.JPG' },
  { name: 'Ivy Bloom', followers: '88K', gradient: 'from-exclu-cloud/15 to-exclu-arsenic/40', image: '/creators/eb3b7603-b451-4aaa-9f95-e5d4f4e98f6d.JPG' },
  { name: 'Mila Ray', followers: '134K', gradient: 'from-exclu-steel/15 to-exclu-phantom/40', image: '/creators/IMG_8271 2.JPG' },
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
                  <img
                    src={creator.image}
                    alt={creator.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
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
                  <img
                    src={creator.image}
                    alt={creator.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
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
