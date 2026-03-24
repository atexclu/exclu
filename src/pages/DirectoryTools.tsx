import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';

interface ToolComparison {
  id: string;
  slug: string;
  title: string;
  tool_name: string;
  tool_logo_url: string | null;
  meta_description: string | null;
}

const DirectoryTools = () => {
  const [tools, setTools] = useState<ToolComparison[]>([]);
  const [loading, setLoading] = useState(true);

  const gridRef = useRef(null);
  const gridInView = useInView(gridRef, { once: true, margin: '-50px' });

  useEffect(() => {
    const fetchTools = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('tool_comparisons')
        .select('id, slug, title, tool_name, tool_logo_url, meta_description')
        .eq('is_visible', true)
        .order('sort_order', { ascending: true });

      if (!error && data) setTools(data);
      setLoading(false);
    };
    fetchTools();
  }, []);

  return (
    <div className="dark min-h-screen bg-background text-foreground overflow-x-hidden relative">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
        <Aurora colorStops={['#CFFF16', '#a3e635', '#CFFF16']} blend={0.5} amplitude={0.7} speed={0.6} />
      </div>
      <div className="fixed inset-0 pointer-events-none z-0 grid-pattern opacity-5" />

      <Navbar variant="blog" />

      {/* Hero */}
      <section className="relative z-10 pt-28 pb-12 overflow-hidden">
        <div className="absolute inset-0 radial-gradient opacity-30" />
        <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] bg-white/5 rounded-full blur-[150px] animate-pulse-glow" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full"
          >
            <Wrench className="w-4 h-4 text-[#CFFF16]" />
            <span className="text-sm text-exclu-cloud font-medium">Tools & Comparisons</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight"
          >
            Exclu <span className="text-[#CFFF16]">vs</span> the rest
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-base sm:text-lg text-exclu-space max-w-2xl mx-auto leading-relaxed"
          >
            Honest side-by-side comparisons with other creator monetization platforms.
          </motion.p>
        </div>
      </section>

      {/* Grid */}
      <main ref={gridRef} className="relative z-10 pb-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass-card rounded-3xl p-8 animate-pulse">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-white/10" />
                    <div className="w-8 h-5 bg-white/10 rounded" />
                    <div className="w-14 h-14 rounded-2xl bg-white/10" />
                  </div>
                  <div className="h-5 bg-white/10 rounded w-2/3 mb-3" />
                  <div className="h-3 bg-white/10 rounded w-full mb-2" />
                  <div className="h-3 bg-white/10 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : tools.length === 0 ? (
            <div className="text-center py-20 text-exclu-space">
              <Wrench className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium mb-2">No comparisons yet</p>
              <p className="text-sm">Check back soon for detailed platform comparisons.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {tools.map((tool, i) => (
                <motion.a
                  key={tool.id}
                  href={`/directory/tools/${tool.slug}`}
                  initial={{ opacity: 0, y: 30 }}
                  animate={gridInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                  transition={{ duration: 0.5, delay: Math.min(i * 0.08, 0.4) }}
                  className="group glass-card rounded-3xl p-8 hover-lift hover:border-primary/30 transition-all duration-300 block"
                >
                  <div className="flex items-center gap-4 mb-6">
                    <img src="/Logo-mini.svg" alt="Exclu" className="w-14 h-14" />
                    <span className="text-[#CFFF16] text-xl font-extrabold">vs</span>
                    {tool.tool_logo_url ? (
                      <img src={tool.tool_logo_url} alt={tool.tool_name} className="w-14 h-14 rounded-2xl object-cover" loading="lazy" />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-lg font-bold text-white/60">
                        {tool.tool_name[0]}
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold text-lg text-exclu-cloud mb-3">{tool.title}</h3>
                  {tool.meta_description && (
                    <p className="text-sm text-exclu-space line-clamp-3 mb-5 leading-relaxed">{tool.meta_description}</p>
                  )}
                  <div className="flex items-center gap-2 text-sm font-medium text-[#CFFF16] group-hover:gap-3 transition-all">
                    Read comparison <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </motion.a>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DirectoryTools;
