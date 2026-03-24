import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';
import { Search, MapPin, Verified, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';
import GradualBlur from '@/components/ui/GradualBlur';

interface CreatorProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  city: string | null;
  niche: string | null;
  is_directory_visible: boolean;
  user_id: string;
  profile_view_count: number;
}

const BATCH_SIZE = 20;

const DirectoryCreators = () => {
  const [allCreators, setAllCreators] = useState<CreatorProfile[]>([]);
  const [premiumIds, setPremiumIds] = useState<Set<string>>(new Set());
  const [linksCountMap, setLinksCountMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  const gridRef = useRef(null);
  const gridInView = useInView(gridRef, { once: true, margin: '-50px' });
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchCreators = async () => {
      setLoading(true);

      const [creatorsRes, linksRes] = await Promise.all([
        supabase
          .from('creator_profiles')
          .select('id, username, display_name, avatar_url, bio, country, city, niche, is_directory_visible, user_id, profile_view_count')
          .eq('is_directory_visible', true)
          .eq('is_active', true)
          .not('avatar_url', 'is', null)
          .order('profile_view_count', { ascending: false }),
        supabase
          .from('links')
          .select('creator_id, price_cents')
          .eq('status', 'published')
          .gt('price_cents', 0),
      ]);

      if (creatorsRes.error) {
        console.error('Error fetching creators:', creatorsRes.error);
        setLoading(false);
        return;
      }

      const profiles = creatorsRes.data || [];

      // Count paid links per creator user_id
      const linksByCreator = new Map<string, number>();
      if (linksRes.data) {
        for (const row of linksRes.data) {
          const current = linksByCreator.get(row.creator_id) || 0;
          linksByCreator.set(row.creator_id, current + 1);
        }
      }
      setLinksCountMap(linksByCreator);

      if (profiles.length > 0) {
        const userIds = profiles.map((p) => p.user_id);
        const { data: premiumProfiles } = await supabase
          .from('profiles')
          .select('id')
          .in('id', userIds)
          .eq('is_creator_subscribed', true);

        const premiumSet = new Set((premiumProfiles || []).map((p) => p.id));
        setPremiumIds(premiumSet);

        // Sort: premium first → then creators with paid links → then by profile views desc
        const sorted = [...profiles].sort((a, b) => {
          const aP = premiumSet.has(a.user_id) ? 1 : 0;
          const bP = premiumSet.has(b.user_id) ? 1 : 0;
          if (bP !== aP) return bP - aP;

          const aLinks = linksByCreator.get(a.user_id) || 0;
          const bLinks = linksByCreator.get(b.user_id) || 0;
          const aHasLinks = aLinks > 0 ? 1 : 0;
          const bHasLinks = bLinks > 0 ? 1 : 0;
          if (bHasLinks !== aHasLinks) return bHasLinks - aHasLinks;

          return (b.profile_view_count || 0) - (a.profile_view_count || 0);
        });

        setAllCreators(sorted);
      }

      setLoading(false);
    };

    fetchCreators();
  }, []);

  const countries = [...new Set(allCreators.map((c) => c.country).filter(Boolean))] as string[];
  const niches = [...new Set(allCreators.map((c) => c.niche).filter(Boolean))] as string[];

  const filtered = allCreators.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        c.display_name?.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q) ||
        c.bio?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (countryFilter && c.country !== countryFilter) return false;
    if (nicheFilter && c.niche !== nicheFilter) return false;
    if (!c.avatar_url) return false;
    return true;
  });

  const visibleCreators = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [search, countryFilter, nicheFilter]);

  // IntersectionObserver for infinite scroll
  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filtered.length));
  }, [filtered.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: '400px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

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
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-white/5 rounded-full blur-[150px] animate-pulse-glow" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full"
          >
            <Users className="w-4 h-4 text-[#CFFF16]" />
            <span className="text-sm text-exclu-cloud font-medium">Creator Directory</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight"
          >
            Discover <span className="text-[#CFFF16]">creators</span> on Exclu
          </motion.h1>

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
                placeholder="Search creators..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-white/5 border-white/10"
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {countries.length > 0 && (
                <select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-exclu-cloud appearance-none cursor-pointer hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                >
                  <option value="">All countries</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
              {niches.length > 0 && (
                <select
                  value={nicheFilter}
                  onChange={(e) => setNicheFilter(e.target.value)}
                  className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-exclu-cloud appearance-none cursor-pointer hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                >
                  <option value="">All niches</option>
                  {niches.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              )}
            </div>
          </motion.div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="rounded-3xl border border-exclu-arsenic/40 overflow-hidden animate-pulse">
                  <div className="aspect-[3/4] bg-white/5" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-exclu-space">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium mb-2">No creators found</p>
              <p className="text-sm">Try adjusting your filters or search term.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                {visibleCreators.map((creator, i) => {
                  const isPremium = premiumIds.has(creator.user_id);
                  return (
                    <motion.div
                      key={creator.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: Math.min((i % BATCH_SIZE) * 0.04, 0.4) }}
                    >
                      <a
                        href={`/${creator.username}`}
                        className="group block relative rounded-3xl overflow-hidden border border-exclu-arsenic/40 hover:border-white/30 transition-all duration-500 hover:scale-[1.03]"
                      >
                        <div className="aspect-[3/4] relative">
                          {creator.avatar_url ? (
                            <img
                              src={creator.avatar_url}
                              alt={creator.display_name || creator.username}
                              className="absolute inset-0 w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-exclu-arsenic/30 flex items-center justify-center">
                              <span className="text-4xl font-bold text-white/20">
                                {(creator.display_name || creator.username)?.[0]?.toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-exclu-black via-exclu-black/90 to-transparent">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-white font-bold text-sm truncate">
                                {creator.display_name || creator.username}
                              </p>
                              {isPremium && <Verified className="w-4 h-4 text-[#CFFF16] flex-shrink-0" />}
                            </div>
                            {creator.niche && (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-exclu-steel mb-1">
                                {creator.niche}
                              </span>
                            )}
                            {(creator.city || creator.country) && (
                              <p className="text-[11px] text-exclu-steel flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {[creator.city, creator.country].filter(Boolean).join(', ')}
                              </p>
                            )}
                          </div>
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/5 to-transparent" />
                        </div>
                      </a>
                    </motion.div>
                  );
                })}
              </div>

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="w-full py-10 flex justify-center">
                {hasMore && (
                  <Loader2 className="w-6 h-6 text-exclu-steel animate-spin" />
                )}
              </div>
            </>
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

export default DirectoryCreators;
