import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Search, MapPin, Building2, Users, Star } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';
import GradualBlur from '@/components/ui/GradualBlur';

interface DirectoryAgency {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  website_url: string | null;
  country: string;
  city: string | null;
  services: string[];
  creator_profile_ids: string[];
  is_featured: boolean;
  source?: 'directory' | 'profile';
}

const DirectoryAgencies = () => {
  const [agencies, setAgencies] = useState<DirectoryAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  const gridRef = useRef(null);
  const gridInView = useInView(gridRef, { once: true, margin: '-50px' });

  useEffect(() => {
    const fetchAgencies = async () => {
      setLoading(true);

      // Fetch both directory agencies and profile-based agencies in parallel
      const [directoryRes, profileAgenciesRes] = await Promise.all([
        supabase
          .from('directory_agencies')
          .select('*')
          .eq('is_visible', true)
          .order('is_featured', { ascending: false })
          .order('sort_order', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, agency_name, agency_logo_url, country')
          .not('agency_name', 'is', null),
      ]);

      const directoryAgencies: DirectoryAgency[] = (directoryRes.data || []).map((a) => ({
        ...a,
        source: 'directory' as const,
      }));

      // For profile-based agencies, count how many creator_profiles they manage
      const profileAgencies: DirectoryAgency[] = [];
      if (profileAgenciesRes.data) {
        for (const profile of profileAgenciesRes.data) {
          if (!profile.agency_name?.trim()) continue;

          // Count managed creator profiles
          const { count } = await supabase
            .from('creator_profiles')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', profile.id);

          const managedCount = count || 0;

          profileAgencies.push({
            id: `profile-${profile.id}`,
            slug: profile.agency_name.toLowerCase().replace(/\s+/g, '-'),
            name: profile.agency_name,
            logo_url: profile.agency_logo_url || null,
            description: null,
            website_url: null,
            country: profile.country || '',
            city: null,
            services: [],
            creator_profile_ids: Array.from({ length: managedCount }, () => ''),
            is_featured: false,
            source: 'profile',
          });
        }
      }

      // Merge: directory agencies first (featured → non-featured), then profile-based
      const merged = [...directoryAgencies, ...profileAgencies];
      setAgencies(merged);
      setLoading(false);
    };
    fetchAgencies();
  }, []);

  const countries = [...new Set(agencies.map((a) => a.country).filter(Boolean))] as string[];

  const filtered = agencies.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !a.description?.toLowerCase().includes(q)) return false;
    }
    if (countryFilter && a.country !== countryFilter) return false;
    return true;
  });

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
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-white/5 rounded-full blur-[150px] animate-pulse-glow" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full"
          >
            <Building2 className="w-4 h-4 text-[#CFFF16]" />
            <span className="text-sm text-exclu-cloud font-medium">Agency Directory</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight"
          >
            Professional <span className="text-[#CFFF16]">agencies</span> on Exclu
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="text-base sm:text-lg text-exclu-space max-w-2xl mx-auto leading-relaxed"
          >
            Featured agencies are highlighted first.
          </motion.p>
        </div>
      </section>

      {/* Filters + Grid */}
      <main ref={gridRef} className="relative z-10 pb-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={gridInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex flex-col items-center gap-3 mb-10"
          >
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-exclu-steel" />
              <Input
                placeholder="Search agencies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-white/5 border-white/10"
              />
            </div>
            {countries.length > 0 && (
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-exclu-cloud appearance-none cursor-pointer"
              >
                <option value="">All countries</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </motion.div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass-card rounded-3xl p-8 animate-pulse">
                  <div className="w-16 h-16 rounded-2xl bg-white/10 mb-5" />
                  <div className="h-5 bg-white/10 rounded w-2/3 mb-3" />
                  <div className="h-3 bg-white/10 rounded w-full mb-2" />
                  <div className="h-3 bg-white/10 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-exclu-space">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium mb-2">No agencies found</p>
              <p className="text-sm">Try adjusting your filters or check back later.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((agency, i) => (
                <motion.a
                  key={agency.id}
                  href={`/directory/agencies/${agency.slug}`}
                  initial={{ opacity: 0, y: 30 }}
                  animate={gridInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                  transition={{ duration: 0.5, delay: Math.min(i * 0.05, 0.3) }}
                  className="group glass-card rounded-3xl p-8 hover-lift hover:border-primary/30 transition-all duration-300 block"
                >
                  <div className="flex items-start gap-5 mb-5">
                    {agency.logo_url ? (
                      <img src={agency.logo_url} alt={agency.name} className="w-16 h-16 rounded-2xl object-cover" loading="lazy" />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#CFFF16]/15 to-[#a3e635]/15 flex items-center justify-center text-xl font-bold text-[#CFFF16]">
                        {agency.name[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg text-exclu-cloud truncate">{agency.name}</h3>
                        {agency.is_featured && <Star className="w-4 h-4 text-[#CFFF16] flex-shrink-0 fill-[#CFFF16]" />}
                      </div>
                      <p className="text-sm text-exclu-space flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {[agency.city, agency.country].filter(Boolean).join(', ')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {agency.creator_profile_ids.length} creator{agency.creator_profile_ids.length !== 1 ? 's' : ''}
                        </span>
                      </p>
                    </div>
                  </div>
                  {agency.description && (
                    <p className="text-sm text-exclu-space line-clamp-2 mb-4 leading-relaxed">{agency.description}</p>
                  )}
                  {agency.services.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {agency.services.slice(0, 4).map((s) => (
                        <span key={s} className="px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-exclu-steel border border-white/5">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.a>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Bottom blur fade */}
      <GradualBlur
        target="page"
        position="bottom"
        height="7rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
      />
    </div>
  );
};

export default DirectoryAgencies;
