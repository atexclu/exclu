import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Globe, Users, Star, Loader2, CheckCircle2, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';
import GradualBlur from '@/components/ui/GradualBlur';
import { toast } from 'sonner';
import {
  AGENCY_PRICING_OPTIONS,
  AGENCY_TARGET_MARKET_OPTIONS,
  AGENCY_SERVICES_OPTIONS,
  AGENCY_PLATFORM_OPTIONS,
  AGENCY_GROWTH_OPTIONS,
  AGENCY_MODEL_TYPES_OPTIONS,
} from '@/lib/categories';

interface AgencyData {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  website_url: string | null;
  contact_email: string | null;
  country: string;
  city: string | null;
  services: string[];
  creator_profile_ids: string[];
  is_featured: boolean;
  // Categories
  pricing_structure?: string | null;
  target_market?: string[];
  services_offered?: string[];
  platform_focus?: string[];
  growth_strategy?: string[];
  model_categories?: string[];
}

interface ManagedCreator {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  niche: string | null;
}

const AgencyDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [creators, setCreators] = useState<ManagedCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Claim form state
  const [claimEmail, setClaimEmail] = useState('');
  const [claimFirstName, setClaimFirstName] = useState('');
  const [claimLastName, setClaimLastName] = useState('');
  const [claimRequestType, setClaimRequestType] = useState('');
  const [claimMessage, setClaimMessage] = useState('');
  const [claimSending, setClaimSending] = useState(false);
  const [claimSent, setClaimSent] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const fetchAgency = async () => {
      setLoading(true);

      // Try directory_agencies first
      const { data: dirAgency } = await supabase
        .from('directory_agencies')
        .select('*')
        .eq('slug', slug)
        .eq('is_visible', true)
        .maybeSingle();

      if (dirAgency) {
        setAgency({ ...dirAgency, source: 'directory' } as AgencyData);

        // Fetch managed creators by profile IDs
        if (dirAgency.creator_profile_ids?.length > 0) {
          const { data: managedProfiles } = await supabase
            .from('creator_profiles')
            .select('id, username, display_name, avatar_url, bio, niche')
            .in('id', dirAgency.creator_profile_ids)
            .eq('is_active', true);

          if (managedProfiles) setCreators(managedProfiles);
        }
      } else {
        // Fallback: check profile-based agencies
        const { data: profileAgencies } = await supabase
          .from('profiles')
          .select('id, agency_name, agency_logo_url, country, agency_pricing, agency_target_market, agency_services_offered, agency_platform_focus, agency_growth_strategy, model_categories')
          .not('agency_name', 'is', null);

        let foundProfile: typeof profileAgencies extends (infer T)[] | null ? T : never = null as any;
        if (profileAgencies) {
          for (const p of profileAgencies) {
            const derivedSlug = p.agency_name!.toLowerCase().replace(/\s+/g, '-');
            if (derivedSlug === slug) {
              foundProfile = p;
              break;
            }
          }
        }

        if (foundProfile) {
          // Get creator profiles managed by this account
          const { data: managedProfiles } = await supabase
            .from('creator_profiles')
            .select('id, username, display_name, avatar_url, bio, niche')
            .eq('user_id', foundProfile.id)
            .eq('is_active', true);

          setAgency({
            id: `profile-${foundProfile.id}`,
            slug,
            name: foundProfile.agency_name!,
            logo_url: foundProfile.agency_logo_url || null,
            description: null,
            website_url: null,
            contact_email: null,
            country: foundProfile.country || '',
            city: null,
            services: [],
            creator_profile_ids: (managedProfiles || []).map((p) => p.id),
            is_featured: false,
            pricing_structure: foundProfile.agency_pricing || null,
            target_market: foundProfile.agency_target_market || [],
            services_offered: foundProfile.agency_services_offered || [],
            platform_focus: foundProfile.agency_platform_focus || [],
            growth_strategy: foundProfile.agency_growth_strategy || [],
            model_categories: foundProfile.model_categories || [],
          });

          if (managedProfiles) setCreators(managedProfiles);
        } else {
          setNotFound(true);
        }
      }

      setLoading(false);
    };

    fetchAgency();
  }, [slug]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimEmail.trim()) { toast.error('Email is required'); return; }
    if (!claimEmail.includes('@')) { toast.error('Please enter a valid email'); return; }
    if (!agency) return;

    setClaimSending(true);
    try {
      const fullName = [claimFirstName.trim(), claimLastName.trim()].filter(Boolean).join(' ');
      const res = await supabase.functions.invoke('submit-agency-claim', {
        body: {
          agencyId: agency.id,
          requesterEmail: claimEmail.trim(),
          requesterName: fullName || null,
          requesterCompany: claimRequestType || null,
          requesterMessage: claimMessage.trim() || null,
        },
      });

      if (res.error || res.data?.error) {
        toast.error(res.data?.error || 'Failed to submit claim request');
      } else {
        setClaimSent(true);
        toast.success('Claim request submitted!');
      }
    } catch {
      toast.error('An unexpected error occurred');
    }
    setClaimSending(false);
  };

  if (loading) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <Navbar variant="blog" />
        <div className="flex items-center justify-center py-40">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (notFound || !agency) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <Navbar variant="blog" />
        <div className="text-center py-40 px-4">
          <h1 className="text-2xl font-bold mb-2">Agency not found</h1>
          <p className="text-muted-foreground mb-6">This agency page does not exist or is no longer available.</p>
          <Link to="/directory/agencies" className="text-[#CFFF16] hover:underline text-sm">
            ← Back to agencies directory
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground overflow-x-hidden relative">
      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
        <Aurora colorStops={['#CFFF16', '#a3e635', '#CFFF16']} blend={0.5} amplitude={0.7} speed={0.6} />
      </div>
      <div className="fixed inset-0 pointer-events-none z-0 grid-pattern opacity-5" />

      <Navbar variant="blog" />

      {/* Hero */}
      <section className="relative z-10 pt-28 pb-16 overflow-hidden">
        <div className="absolute inset-0 radial-gradient opacity-30" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
          <Link
            to="/directory/agencies"
            className="inline-flex items-center gap-1.5 text-sm text-exclu-space hover:text-exclu-cloud transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> Back to agencies
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Top row: photo + name/location (always flex-row) */}
            <div className="flex items-start gap-5">
              {/* Logo */}
              {agency.logo_url ? (
                <img
                  src={agency.logo_url}
                  alt={agency.name}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-white/10 flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-[#CFFF16]/15 to-[#a3e635]/15 flex items-center justify-center text-3xl font-bold text-[#CFFF16] flex-shrink-0 border border-white/10">
                  {agency.name[0]}
                </div>
              )}

              <div className="flex-1 min-w-0">
                {/* Name + badges + action buttons on same row (web) */}
                <div className="flex items-start sm:items-center justify-between gap-x-4 gap-y-1.5 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">{agency.name}</h1>
                    {agency.is_featured && <Star className="w-4 h-4 sm:w-5 sm:h-5 text-[#CFFF16] fill-[#CFFF16] flex-shrink-0" />}
                  </div>
                  {/* Action buttons — desktop inline with name */}
                  <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                    {agency.website_url && (
                      <a
                        href={agency.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-exclu-cloud hover:bg-white/10 transition-colors"
                      >
                        <Globe className="w-3.5 h-3.5" /> Website
                      </a>
                    )}
                    {agency.id && !agency.id.startsWith('profile-') && (
                      <button
                        onClick={() => document.getElementById('claim-form')?.scrollIntoView({ behavior: 'smooth' })}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-exclu-cloud hover:bg-white/10 transition-colors"
                      >
                        <Building2 className="w-3.5 h-3.5" /> Claim this agency
                      </button>
                    )}
                  </div>
                </div>

                {/* Location */}
                {(agency.city || agency.country) && (
                  <p className="text-exclu-space flex items-center gap-1.5 mt-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {[agency.city, agency.country].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* Category labels — full width */}
            {(() => {
              const allOptions = [
                ...AGENCY_PRICING_OPTIONS.filter(o => o.value === agency.pricing_structure),
                ...AGENCY_TARGET_MARKET_OPTIONS.filter(o => (agency.target_market || []).includes(o.value)),
                ...AGENCY_SERVICES_OPTIONS.filter(o => (agency.services_offered || []).includes(o.value)),
                ...AGENCY_PLATFORM_OPTIONS.filter(o => (agency.platform_focus || []).includes(o.value)),
                ...AGENCY_GROWTH_OPTIONS.filter(o => (agency.growth_strategy || []).includes(o.value)),
                ...AGENCY_MODEL_TYPES_OPTIONS.filter(o => (agency.model_categories || []).includes(o.value)),
              ];
              if (allOptions.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {allOptions.map(opt => (
                    <span key={opt.value} className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-exclu-steel border border-white/[0.08]">
                      {opt.label}
                    </span>
                  ))}
                </div>
              );
            })()}

            {/* Description — full width */}
            {agency.description && (
              <p className="text-exclu-space leading-relaxed mt-4">{agency.description}</p>
            )}

            {/* Mobile-only action buttons */}
            {(agency.website_url || (agency.id && !agency.id.startsWith('profile-'))) && (
              <div className="flex sm:hidden flex-wrap gap-2 mt-4">
                {agency.website_url && (
                  <a
                    href={agency.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-exclu-cloud hover:bg-white/10 transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5" /> Website
                  </a>
                )}
                {agency.id && !agency.id.startsWith('profile-') && (
                  <button
                    onClick={() => document.getElementById('claim-form')?.scrollIntoView({ behavior: 'smooth' })}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-exclu-cloud hover:bg-white/10 transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5" /> Claim this agency
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Managed Creators */}
      {creators.length > 0 && (
        <section className="relative z-10 pb-16 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-xl font-bold mb-6"
            >
              Managed creators
            </motion.h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {creators.map((creator, i) => (
                <motion.div
                  key={creator.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.05 }}
                >
                  <a
                    href={`/${creator.username}`}
                    className="group block rounded-2xl overflow-hidden border border-exclu-arsenic/40 hover:border-white/30 transition-all duration-500 hover:scale-[1.03]"
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
                          <span className="text-3xl font-bold text-white/20">
                            {(creator.display_name || creator.username)?.[0]?.toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-exclu-black via-exclu-black/90 to-transparent">
                        <p className="text-white font-bold text-sm truncate">
                          {creator.display_name || creator.username}
                        </p>
                        {creator.niche && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-exclu-steel mt-1">
                            {creator.niche}
                          </span>
                        )}
                      </div>
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/5 to-transparent" />
                    </div>
                  </a>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Claim Form */}
      {agency.id && !agency.id.startsWith('profile-') && (
        <section id="claim-form" className="relative z-10 pb-24 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="glass-card rounded-3xl p-6 sm:p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Claim this agency</h2>
                  <p className="text-sm text-exclu-space">Are you the owner of {agency.name}? Verify your identity to manage this profile.</p>
                </div>
              </div>

              {claimSent ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-lg font-semibold mb-1">Request submitted!</p>
                  <p className="text-sm text-exclu-space">
                    Our team will review your request and get back to you shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleClaim} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-exclu-space uppercase tracking-wider mb-1.5 block">
                        Email *
                      </label>
                      <Input
                        type="email"
                        value={claimEmail}
                        onChange={(e) => setClaimEmail(e.target.value)}
                        placeholder="you@youragency.com"
                        className="bg-white/5 border-white/10"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-exclu-space uppercase tracking-wider mb-1.5 block">
                        Request type
                      </label>
                      <select
                        value={claimRequestType}
                        onChange={(e) => setClaimRequestType(e.target.value)}
                        className="w-full px-3 py-2 rounded-md text-sm bg-white/5 border border-white/10 text-exclu-cloud focus:outline-none focus:ring-1 focus:ring-white/20"
                      >
                        <option value="" className="bg-exclu-black">Select a type…</option>
                        <option value="Claim" className="bg-exclu-black">Claim this agency</option>
                        <option value="Collaboration" className="bg-exclu-black">Collaboration</option>
                        <option value="Partnership" className="bg-exclu-black">Partnership</option>
                        <option value="Other" className="bg-exclu-black">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-exclu-space uppercase tracking-wider mb-1.5 block">
                        First name
                      </label>
                      <Input
                        value={claimFirstName}
                        onChange={(e) => setClaimFirstName(e.target.value)}
                        placeholder="John"
                        className="bg-white/5 border-white/10"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-exclu-space uppercase tracking-wider mb-1.5 block">
                        Last name
                      </label>
                      <Input
                        value={claimLastName}
                        onChange={(e) => setClaimLastName(e.target.value)}
                        placeholder="Doe"
                        className="bg-white/5 border-white/10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-exclu-space uppercase tracking-wider mb-1.5 block">
                      Message (optional)
                    </label>
                    <Textarea
                      value={claimMessage}
                      onChange={(e) => setClaimMessage(e.target.value)}
                      placeholder="Tell us the nature of your request and how we can reach you…"
                      rows={3}
                      maxLength={1000}
                      className="bg-white/5 border-white/10 resize-none"
                    />
                  </div>
                  <Button type="submit" disabled={claimSending} variant="outline" className="gap-2 border-purple-500/30 text-purple-300 hover:bg-purple-500/10">
                    {claimSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Building2 className="w-4 h-4" />
                    )}
                    {claimSending ? 'Submitting…' : 'Submit request'}
                  </Button>
                </form>
              )}
            </motion.div>
          </div>
        </section>
      )}

      <Footer />

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

export default AgencyDetail;
