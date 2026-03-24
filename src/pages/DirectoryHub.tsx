import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Building2, Wrench, ArrowRight, FileText } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';

const sections = [
  {
    title: 'Creators',
    description: 'Discover top content creators on Exclu. Filter by country, city, or niche.',
    icon: Users,
    href: '/directory/creators',
    highlight: '10K+',
    highlightLabel: 'creators',
  },
  {
    title: 'Agencies',
    description: 'Find professional agencies managing creator talent worldwide.',
    icon: Building2,
    href: '/directory/agencies',
    highlight: '50+',
    highlightLabel: 'agencies',
  },
  {
    title: 'Tools & Comparisons',
    description: 'Honest side-by-side comparisons with other creator monetization platforms.',
    icon: Wrench,
    href: '/directory/tools',
    highlight: 'vs',
    highlightLabel: 'platforms',
  },
  {
    title: 'Blog',
    description: 'Guides, strategies, and industry news for content creators.',
    icon: FileText,
    href: '/blog',
    highlight: '∞',
    highlightLabel: 'insights',
  },
];

const DirectoryHub = () => {
  return (
    <div className="dark min-h-screen bg-background text-foreground overflow-x-hidden relative">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
        <Aurora colorStops={['#CFFF16', '#a3e635', '#CFFF16']} blend={0.5} amplitude={0.7} speed={0.6} />
      </div>
      <div className="fixed inset-0 pointer-events-none z-0 grid-pattern opacity-5" />

      <Navbar variant="blog" />

      <section className="relative z-10 pt-28 pb-16 overflow-hidden">
        <div className="absolute inset-0 radial-gradient opacity-30" />
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-white/5 rounded-full blur-[150px] animate-pulse-glow" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full"
            >
              <span className="w-2 h-2 bg-[#CFFF16] rounded-full animate-pulse" />
              <span className="text-sm text-exclu-cloud font-medium">The Creator Economy Hub</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight"
            >
              Explore the <span className="text-[#CFFF16]">Exclu</span> ecosystem
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-base sm:text-lg text-exclu-space max-w-2xl mx-auto leading-relaxed"
            >
              Creators, agencies, tools, and insights — everything shaping the creator economy, in one place.
            </motion.p>
          </div>
        </div>
      </section>

      <main className="relative z-10 pb-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {sections.map((section, i) => {
              const Icon = section.icon;
              return (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.1 }}
                  className="group"
                >
                  <Link
                    to={section.href}
                    className="glass-card rounded-3xl p-8 h-full flex flex-col hover-lift hover:border-primary/30 transition-all duration-300 block"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#CFFF16]/15 to-[#a3e635]/15 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-200">
                      <Icon className="w-7 h-7 text-[#CFFF16]" />
                    </div>
                    <div className="mb-4">
                      <span className="text-4xl font-extrabold text-white">{section.highlight}</span>
                      <span className="text-sm text-exclu-space ml-2">{section.highlightLabel}</span>
                    </div>
                    <h2 className="text-xl font-bold text-exclu-cloud mb-3">{section.title}</h2>
                    <p className="text-exclu-space leading-relaxed text-sm mb-6 flex-1">{section.description}</p>
                    <div className="flex items-center gap-2 text-sm font-medium text-[#CFFF16] group-hover:gap-3 transition-all">
                      Browse <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DirectoryHub;
