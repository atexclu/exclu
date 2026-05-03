import { useState, useEffect, useRef, useCallback } from 'react';
import { useForceDark } from '@/contexts/ThemeContext';
import { motion, useInView } from 'framer-motion';
import { Search, Users, Loader2, Filter, X, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AR: 'Argentina', AU: 'Australia',
  AT: 'Austria', BE: 'Belgium', BR: 'Brazil', CA: 'Canada', CL: 'Chile',
  CN: 'China', CO: 'Colombia', HR: 'Croatia', CZ: 'Czech Republic', DK: 'Denmark',
  EG: 'Egypt', FI: 'Finland', FR: 'France', DE: 'Germany', GH: 'Ghana',
  GR: 'Greece', HU: 'Hungary', IN: 'India', ID: 'Indonesia', IE: 'Ireland',
  IL: 'Israel', IT: 'Italy', JP: 'Japan', KE: 'Kenya', KR: 'South Korea',
  MX: 'Mexico', MA: 'Morocco', NL: 'Netherlands', NZ: 'New Zealand', NG: 'Nigeria',
  NO: 'Norway', PK: 'Pakistan', PE: 'Peru', PH: 'Philippines', PL: 'Poland',
  PT: 'Portugal', RO: 'Romania', RU: 'Russia', SA: 'Saudi Arabia', ZA: 'South Africa',
  ES: 'Spain', SE: 'Sweden', CH: 'Switzerland', TH: 'Thailand', TR: 'Turkey',
  UA: 'Ukraine', GB: 'United Kingdom', US: 'United States', VE: 'Venezuela',
  VN: 'Vietnam',
};
import { Input } from '@/components/ui/input';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';
import GradualBlur from '@/components/ui/GradualBlur';
import { MODEL_CATEGORY_GROUPS } from '@/lib/categories';
import CreatorCard from '@/components/directory/CreatorCard';

interface DirectoryRow {
  creator_profile_id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string | null;
  city: string | null;
  niche: string | null;
  model_categories: string[] | null;
  profile_view_count: number | null;
  created_at: string | null;
  paid_links_count: number;
  is_premium: boolean;
  category: string | null;
  is_featured: boolean;
  position: number | null;
  is_hidden_for_category: boolean;
  display_rank: number;
}

/* ─── Filter Dropdown Component ─── */
const CategoryFilterDropdown = ({
  label,
  groups,
  selected,
  onToggle,
  searchStr,
  onSearchChange,
}: {
  label: string;
  groups: Record<string, { value: string; label: string }[]>;
  selected: string[];
  onToggle: (value: string) => void;
  searchStr: string;
  onSearchChange: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        onSearchChange('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onSearchChange]);

  const filteredGroups = Object.entries(groups)
    .map(([groupName, options]) => ({
      groupName,
      options: searchStr.trim()
        ? options.filter(
            (o) =>
              o.label.toLowerCase().includes(searchStr.toLowerCase()) ||
              groupName.toLowerCase().includes(searchStr.toLowerCase())
          )
        : options,
    }))
    .filter((g) => g.options.length > 0);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) onSearchChange('');
        }}
        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all duration-200 border whitespace-nowrap ${
          selected.length > 0
            ? 'bg-[#CFFF16]/10 text-[#CFFF16] border-[#CFFF16]/30'
            : 'bg-white/5 text-exclu-cloud border-white/10 hover:bg-white/10 hover:border-white/20'
        }`}
      >
        <Filter className="w-3 h-3" />
        {label}
        {selected.length > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#CFFF16]/20 text-[9px] font-bold">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 left-0 w-[260px] sm:w-[300px] rounded-xl border border-exclu-arsenic/50 bg-black shadow-xl shadow-black/60 overflow-hidden">
          <div className="p-2 border-b border-exclu-arsenic/40">
            <input
              type="text"
              value={searchStr}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search categories…"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-exclu-arsenic/50 bg-exclu-ink/80 text-xs text-exclu-cloud placeholder:text-exclu-space/40 focus:outline-none focus:ring-1 focus:ring-[#CFFF16]/40"
            />
          </div>
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {filteredGroups.length === 0 ? (
              <p className="px-3 py-4 text-xs text-exclu-space/50 text-center">No matching categories</p>
            ) : (
              filteredGroups.map(({ groupName, options }) => (
                <div key={groupName}>
                  <p className="px-3 pt-2.5 pb-1 text-[10px] text-exclu-space/50 uppercase tracking-wider font-semibold">
                    {groupName}
                  </p>
                  {options.map((opt) => {
                    const isSelected = selected.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onToggle(opt.value)}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-[#CFFF16]/10 text-[#CFFF16]'
                            : 'text-exclu-space hover:bg-exclu-arsenic/30 hover:text-exclu-cloud'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <span className="text-[10px]">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const BATCH_SIZE = 20;

const DirectoryCreators = () => {
  useForceDark();
  const [allCreators, setAllCreators] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [catSearch, setCatSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  const gridRef = useRef(null);
  const gridInView = useInView(gridRef, { once: true, margin: '-50px' });
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchCreators = async () => {
      setLoading(true);

      // PostgREST hard-caps at 1000 rows on this project regardless of the
      // client Range header — the global view holds ~4000 rows so a single
      // request misses 75% of creators (including most featured ones, whose
      // creator_profile_id sort past the cap). Paginate client-side until a
      // page comes back short.
      const PAGE = 1000;
      const all: DirectoryRow[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('v_directory_creators')
          .select('*')
          .is('category', null)
          .eq('is_hidden_for_category', false)
          .order('creator_profile_id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) {
          console.error('Error fetching directory:', error);
          setLoading(false);
          return;
        }
        const batch = (data || []) as DirectoryRow[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      const rows = all.slice().sort((a, b) => {
        if (a.display_rank !== b.display_rank) return a.display_rank - b.display_rank;
        // Curated rows: explicit position wins, NULLs last.
        const aPos = a.position == null ? Number.POSITIVE_INFINITY : a.position;
        const bPos = b.position == null ? Number.POSITIVE_INFINITY : b.position;
        if (aPos !== bPos) return aPos - bPos;
        // Fallback tiebreak: views desc, then created_at desc.
        const dv = (b.profile_view_count ?? 0) - (a.profile_view_count ?? 0);
        if (dv !== 0) return dv;
        const ad = a.created_at ? Date.parse(a.created_at) : 0;
        const bd = b.created_at ? Date.parse(b.created_at) : 0;
        return bd - ad;
      });

      setAllCreators(rows);
      setLoading(false);
    };

    fetchCreators();
  }, []);

  const countries = [...new Set(allCreators.map((c) => c.country).filter(Boolean))] as string[];
  const niches = [...new Set(allCreators.map((c) => c.niche).filter(Boolean))] as string[];

  const toggleCategoryFilter = (cat: string) => {
    setCategoryFilter((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

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

    // Category filter: match if creator has ANY of the selected categories
    if (categoryFilter.length > 0 && !categoryFilter.some((cat) => c.model_categories?.includes(cat))) return false;

    return true;
  });

  const visibleCreators = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [search, countryFilter, nicheFilter, categoryFilter]);

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
            className="space-y-3 mb-10"
          >
            {/* Search */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-exclu-steel" />
                <Input
                  placeholder="Search creators..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10"
                />
              </div>

              {/* Filter row */}
              <div className="flex flex-wrap gap-2 justify-center">
                {countries.length > 0 && (
                  <select
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-exclu-cloud appearance-none cursor-pointer hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                  >
                    <option value="">All countries</option>
                    {countries.map((c) => (
                      <option key={c} value={c}>{COUNTRY_NAMES[c] ?? c}</option>
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

                {/* Category filter dropdown */}
                <CategoryFilterDropdown
                  label="Categories"
                  groups={MODEL_CATEGORY_GROUPS}
                  selected={categoryFilter}
                  onToggle={toggleCategoryFilter}
                  searchStr={catSearch}
                  onSearchChange={setCatSearch}
                />

                {categoryFilter.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCategoryFilter([])}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>

              {/* Selected category tags */}
              {categoryFilter.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {categoryFilter.map((cat) => {
                    const allOpts = Object.values(MODEL_CATEGORY_GROUPS).flat();
                    const opt = allOpts.find((o) => o.value === cat);
                    return (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#CFFF16]/10 text-[#CFFF16] text-[11px] font-medium border border-[#CFFF16]/30"
                      >
                        {opt?.label || cat.replace(/_/g, ' ')}
                        <button
                          type="button"
                          onClick={() => toggleCategoryFilter(cat)}
                          className="ml-0.5 hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
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
              {categoryFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter([])}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-white/5 border border-white/10 text-exclu-cloud hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Clear category filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                {visibleCreators.map((creator, i) => (
                  <CreatorCard key={creator.creator_profile_id} creator={creator} index={i} batchSize={BATCH_SIZE} />
                ))}
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
