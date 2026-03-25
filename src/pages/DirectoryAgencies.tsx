import { useState, useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Search, MapPin, Building2, Users, Star, Filter, X, ChevronDown, Bookmark } from 'lucide-react';
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
  // Category fields
  pricing_structure: string | null;
  target_market: string[];
  services_offered: string[];
  platform_focus: string[];
  growth_strategy: string[];
  model_categories: string[];
}

/* ─── Filter constants (from shared lib) ─── */
import {
  AGENCY_PRICING_OPTIONS as PRICING_OPTIONS,
  AGENCY_TARGET_MARKET_OPTIONS as TARGET_MARKET_OPTIONS,
  AGENCY_SERVICES_OPTIONS as SERVICES_OPTIONS,
  AGENCY_PLATFORM_OPTIONS as PLATFORM_OPTIONS,
  AGENCY_GROWTH_OPTIONS as GROWTH_STRATEGY_OPTIONS,
  AGENCY_MODEL_TYPES_OPTIONS as MODEL_TYPES_OPTIONS,
} from '@/lib/categories';

/* ─── Filter Dropdown Component ─── */
const FilterDropdown = ({
  label,
  options,
  selected,
  onToggle,
  multi = true,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  multi?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all duration-200 border whitespace-nowrap ${
          selected.length > 0
            ? 'bg-[#CFFF16]/10 text-[#CFFF16] border-[#CFFF16]/30'
            : 'bg-white/5 text-exclu-cloud border-white/10 hover:bg-white/10 hover:border-white/20'
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#CFFF16]/20 text-[9px] font-bold">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 left-0 min-w-[200px] rounded-xl border border-exclu-arsenic/50 bg-black shadow-xl shadow-black/60 overflow-hidden">
          <div className="max-h-56 overflow-y-auto overscroll-contain py-1">
            {options.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onToggle(opt.value);
                    if (!multi) setOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs transition-colors flex items-center justify-between gap-3 ${
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
        </div>
      )}
    </div>
  );
};

const DirectoryAgencies = () => {
  const [agencies, setAgencies] = useState<DirectoryAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Category filters
  const [pricingFilter, setPricingFilter] = useState<string[]>([]);
  const [targetMarketFilter, setTargetMarketFilter] = useState<string[]>([]);
  const [servicesFilter, setServicesFilter] = useState<string[]>([]);
  const [platformFilter, setPlatformFilter] = useState<string[]>([]);
  const [growthFilter, setGrowthFilter] = useState<string[]>([]);
  const [modelCatFilter, setModelCatFilter] = useState<string[]>([]);

  const gridRef = useRef(null);
  const gridInView = useInView(gridRef, { once: true, margin: '-50px' });

  const toggleArrayItem = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  const activeFilterCount =
    pricingFilter.length + targetMarketFilter.length + servicesFilter.length + platformFilter.length + growthFilter.length + modelCatFilter.length;

  const clearAllFilters = () => {
    setPricingFilter([]);
    setTargetMarketFilter([]);
    setServicesFilter([]);
    setPlatformFilter([]);
    setGrowthFilter([]);
    setModelCatFilter([]);
    setCountryFilter('');
  };

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
          .select('id, agency_name, agency_logo_url, country, agency_pricing, agency_target_market, agency_services_offered, agency_platform_focus, agency_growth_strategy, model_categories')
          .not('agency_name', 'is', null),
      ]);

      const directoryAgencies: DirectoryAgency[] = (directoryRes.data || []).map((a: any) => ({
        ...a,
        target_market: a.target_market || [],
        services_offered: a.services_offered || [],
        platform_focus: a.platform_focus || [],
        growth_strategy: a.growth_strategy || [],
        model_categories: a.model_categories || [],
        source: 'directory' as const,
      }));

      // For profile-based agencies, count how many creator_profiles they manage
      const profileAgencies: DirectoryAgency[] = [];
      if (profileAgenciesRes.data) {
        for (const profile of profileAgenciesRes.data) {
          if (!profile.agency_name?.trim()) continue;

          // Count managed creator profiles and check visibility
          const { data: cpData, count } = await supabase
            .from('creator_profiles')
            .select('id, is_directory_visible', { count: 'exact' })
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .limit(1);

          // Skip if the primary profile is hidden
          if (cpData && cpData.length > 0 && cpData[0].is_directory_visible === false) continue;

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
            pricing_structure: profile.agency_pricing || null,
            target_market: profile.agency_target_market || [],
            services_offered: profile.agency_services_offered || [],
            platform_focus: profile.agency_platform_focus || [],
            growth_strategy: profile.agency_growth_strategy || [],
            model_categories: profile.model_categories || [],
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

    // Category filters — match if agency has ANY of the selected values
    if (pricingFilter.length > 0 && (!a.pricing_structure || !pricingFilter.includes(a.pricing_structure))) return false;
    if (targetMarketFilter.length > 0 && !targetMarketFilter.some((v) => a.target_market?.includes(v))) return false;
    if (servicesFilter.length > 0 && !servicesFilter.some((v) => a.services_offered?.includes(v))) return false;
    if (platformFilter.length > 0 && !platformFilter.some((v) => a.platform_focus?.includes(v))) return false;
    if (growthFilter.length > 0 && !growthFilter.some((v) => a.growth_strategy?.includes(v))) return false;
    if (modelCatFilter.length > 0 && !modelCatFilter.some((v) => a.model_categories?.includes(v))) return false;

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
        </div>
      </section>

      {/* Filters + Grid */}
      <main ref={gridRef} className="relative z-10 pb-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={gridInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="space-y-4 mb-10"
          >
            {/* Search + Toggle filters */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-exclu-steel" />
                <Input
                  placeholder="Search agencies..."
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

                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border ${
                    showFilters || activeFilterCount > 0
                      ? 'bg-[#CFFF16]/10 text-[#CFFF16] border-[#CFFF16]/30'
                      : 'bg-white/5 text-exclu-cloud border-white/10 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#CFFF16]/20 text-[10px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Category filter dropdowns */}
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-wrap items-center justify-center gap-2 pt-1"
              >
                <FilterDropdown
                  label="Pricing"
                  options={PRICING_OPTIONS}
                  selected={pricingFilter}
                  onToggle={(v) => setPricingFilter(toggleArrayItem(pricingFilter, v))}
                />
                <FilterDropdown
                  label="Target Market"
                  options={TARGET_MARKET_OPTIONS}
                  selected={targetMarketFilter}
                  onToggle={(v) => setTargetMarketFilter(toggleArrayItem(targetMarketFilter, v))}
                />
                <FilterDropdown
                  label="Services"
                  options={SERVICES_OPTIONS}
                  selected={servicesFilter}
                  onToggle={(v) => setServicesFilter(toggleArrayItem(servicesFilter, v))}
                />
                <FilterDropdown
                  label="Platform"
                  options={PLATFORM_OPTIONS}
                  selected={platformFilter}
                  onToggle={(v) => setPlatformFilter(toggleArrayItem(platformFilter, v))}
                />
                <FilterDropdown
                  label="Growth Strategy"
                  options={GROWTH_STRATEGY_OPTIONS}
                  selected={growthFilter}
                  onToggle={(v) => setGrowthFilter(toggleArrayItem(growthFilter, v))}
                />
                <FilterDropdown
                  label="Model Types"
                  options={MODEL_TYPES_OPTIONS}
                  selected={modelCatFilter}
                  onToggle={(v) => setModelCatFilter(toggleArrayItem(modelCatFilter, v))}
                />

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Clear all
                  </button>
                )}
              </motion.div>
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
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-white/5 border border-white/10 text-exclu-cloud hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Clear filters
                </button>
              )}
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
                  className="group glass-card rounded-2xl p-5 hover-lift hover:border-primary/30 transition-all duration-300 flex items-center gap-4"
                >
                  {agency.logo_url ? (
                    <img src={agency.logo_url} alt={agency.name} className="w-14 h-14 rounded-xl object-cover shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl shrink-0 bg-gradient-to-br from-[#CFFF16]/15 to-[#a3e635]/15 flex items-center justify-center text-xl font-bold text-[#CFFF16]">
                      {agency.name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-base text-exclu-cloud truncate">{agency.name}</h3>
                      {agency.is_featured && <Star className="w-3.5 h-3.5 text-[#CFFF16] flex-shrink-0 fill-[#CFFF16]" />}
                    </div>
                    <p className="text-sm text-exclu-space flex flex-wrap items-center gap-x-3 gap-y-1">
                      {(agency.city || agency.country) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {[agency.city, agency.country].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {agency.source === 'profile' ? (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {agency.creator_profile_ids.length} creator{agency.creator_profile_ids.length !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[#CFFF16]/60">
                          <Bookmark className="w-3 h-3" />
                          To claim
                        </span>
                      )}
                    </p>
                  </div>
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
