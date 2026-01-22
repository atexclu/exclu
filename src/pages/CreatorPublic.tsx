import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowUpRight, MessageCircle, ExternalLink, Lock } from 'lucide-react';

interface CreatorProfileData {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  handle: string | null;
  external_url: string | null;
}

type PlatformKey = 'onlyfans' | 'fansly' | 'myclub' | 'mym' | 'other';

interface CreatorPlatformLink {
  platform: PlatformKey;
  url: string;
}

interface CreatorLinkCard {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  slug: string;
}

const CreatorPublic = () => {
  const { handle } = useParams<{ handle: string }>();

  const [profile, setProfile] = useState<CreatorProfileData | null>(null);
  const [links, setLinks] = useState<CreatorLinkCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformLinks, setPlatformLinks] = useState<CreatorPlatformLink[]>([]);

  useEffect(() => {
    const fetchCreator = async () => {
      if (!handle) return;
      setIsLoading(true);
      setError(null);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, bio, handle, external_url, is_creator')
        .eq('handle', handle)
        .eq('is_creator', true)
        .single();

      if (profileError || !profileData) {
        console.error('Error loading creator profile', profileError);
        setError('This creator profile is not available.');
        setProfile(null);
        setLinks([]);
        setIsLoading(false);
        return;
      }

      const { data: linksData, error: linksError } = await supabase
        .from('links')
        .select('id, title, description, price_cents, currency, slug, status')
        .eq('creator_id', profileData.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (linksError) {
        console.error('Error loading creator links', linksError);
        setError('Unable to load this creator content right now.');
        setLinks([]);
      } else {
        setLinks((linksData ?? []) as CreatorLinkCard[]);
      }

      const { data: profileLinksData, error: profileLinksError } = await supabase
        .from('profile_links')
        .select('platform, url')
        .eq('profile_id', profileData.id);

      if (profileLinksError) {
        console.error('Error loading creator platform links', profileLinksError);
      } else if (profileLinksData && Array.isArray(profileLinksData)) {
        const cleaned = (profileLinksData as any[])
          .map((row) => ({ platform: row.platform as PlatformKey, url: row.url as string }))
          .filter((row) => !!row.url);
        setPlatformLinks(cleaned);
      }

      setProfile(profileData as CreatorProfileData);
      setIsLoading(false);
    };

    fetchCreator();
  }, [handle]);

  const handleUnlockClick = (link: CreatorLinkCard) => {
    toast.info('Paiement à venir – en cours d\'implémentation.', {
      description: `Unlock "${link.title}" for ${(link.price_cents / 100).toFixed(2)} ${link.currency}.`,
    });
  };

  const handleExternalClick = () => {
    if (!profile?.external_url) return;
    window.open(profile.external_url, '_blank', 'noopener,noreferrer');
  };

  const handlePlatformClick = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getPlatformMeta = (platform: PlatformKey) => {
    switch (platform) {
      case 'onlyfans':
        return {
          label: 'OnlyFans',
          short: 'OF',
          bg: 'bg-[#00AFF0]/15',
          text: 'text-[#00AFF0]',
        };
      case 'fansly':
        return {
          label: 'Fansly',
          short: 'F',
          bg: 'bg-[#1DA1F2]/15',
          text: 'text-[#1DA1F2]',
        };
      case 'myclub':
        return {
          label: 'my.club',
          short: 'MC',
          bg: 'bg-[#6366F1]/15',
          text: 'text-[#6366F1]',
        };
      case 'mym':
        return {
          label: 'MYM',
          short: 'MYM',
          bg: 'bg-[#F97316]/15',
          text: 'text-[#F97316]',
        };
      case 'other':
      default:
        return {
          label: 'Website',
          short: 'WEB',
          bg: 'bg-exclu-cloud/10',
          text: 'text-exclu-cloud',
        };
    }
  };

  const displayName = profile?.display_name || profile?.handle || handle || 'Creator';

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-b from-black via-exclu-ink to-black text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="relative flex-1 pt-20 pb-4 px-4 overflow-hidden">
          {/* Animated blurred gradient background */}
          <motion.div
            className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] mx-auto max-w-3xl rounded-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(180,83,9,0.75),transparent_60%)] blur-3xl opacity-80"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, rotateZ: [0, 1.5, -1.5, 0] }}
            transition={{ duration: 1.8, ease: 'easeOut' }}
          />
          <motion.div
            className="pointer-events-none absolute inset-x-10 -top-10 h-[380px] rounded-[3rem] bg-[conic-gradient(from_180deg_at_50%_0%,rgba(56,189,248,0.18),rgba(236,72,153,0.24),rgba(244,244,245,0.12),rgba(56,189,248,0.18))] blur-3xl opacity-70"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.7, 0.4], rotate: [0, 8, -6, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div className="relative max-w-4xl mx-auto">
            {/* Hero section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
            >
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-accent blur-lg opacity-70" />
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border border-exclu-arsenic/60 bg-exclu-ink flex items-center justify-center">
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm text-exclu-cloud/80">{displayName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-exclu-space/70 mb-1">Exclu creator</p>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-1">{displayName}</h1>
                  {profile?.handle && (
                    <p className="text-xs text-exclu-space/80 mb-2">@{profile.handle}</p>
                  )}
                  {profile?.bio && (
                    <p className="text-xs sm:text-sm text-exclu-space max-w-xl">{profile.bio}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 w-full sm:w-auto">
                {platformLinks.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
                    {platformLinks.map((link) => {
                      const meta = getPlatformMeta(link.platform);
                      return (
                        <button
                          key={`${link.platform}-${link.url}`}
                          type="button"
                          onClick={() => handlePlatformClick(link.url)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-exclu-arsenic/60 bg-black/60 px-2.5 py-1 text-[10px] text-exclu-cloud hover:border-primary/70 hover:bg-black/80 transition-colors"
                        >
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-semibold ${meta.bg} ${meta.text}`}
                          >
                            {meta.short}
                          </span>
                          <span className="truncate max-w-[80px] sm:max-w-[120px]">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <Button
                  variant="hero"
                  size="lg"
                  className="rounded-full inline-flex items-center justify-center gap-2 w-full sm:w-auto text-base px-6 py-3"
                  disabled={!profile?.external_url}
                  onClick={handleExternalClick}
                >
                  <ExternalLink className="w-5 h-5" />
                  {profile?.external_url ? 'My exclusive link' : 'My exclusive link'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="hidden sm:inline-flex rounded-full border-dashed border-exclu-arsenic/60 text-[11px] text-exclu-space/80 items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <MessageCircle className="w-4 h-4" />
                  Chat (coming soon)
                </Button>
              </div>
            </motion.section>

            {/* Content grid */}
            <section className="space-y-2 flex-1 overflow-hidden">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.18em] text-exclu-space/70">Exclusive content</p>
                {links.length > 0 && (
                  <p className="text-[11px] text-exclu-space/70">
                    {links.length} {links.length === 1 ? 'link' : 'links'} available
                  </p>
                )}
              </div>

              {isLoading && (
                <p className="text-sm text-exclu-space">Loading content…</p>
              )}

              {!isLoading && !error && links.length === 0 && (
                <div className="rounded-2xl border border-dashed border-exclu-arsenic/60 bg-exclu-ink/70 p-4 text-xs text-exclu-space/80">
                  This creator hasn&apos;t published any paid content yet.
                </div>
              )}

              {!isLoading && links.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 overflow-y-auto max-h-[calc(100vh-320px)]">
                  {links.map((link) => {
                    const priceLabel = `${(link.price_cents / 100).toFixed(2)} ${link.currency}`;
                    return (
                      <motion.article
                        key={link.id}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className="relative overflow-hidden rounded-xl border border-exclu-arsenic/70 bg-gradient-to-br from-exclu-ink via-exclu-phantom/20 to-exclu-ink shadow-glow-lg"
                      >
                        <div className="relative h-24 overflow-hidden">
                          {/* Animated blur / reveal style background */}
                          <motion.div
                            className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.2),transparent_55%),radial-gradient(circle_at_bottom,_rgba(236,72,153,0.9),transparent_60%)] opacity-80"
                            initial={{ scale: 1.1, rotate: -2 }}
                            animate={{
                              scale: [1.1, 1.2, 1.1],
                              rotate: [-4, 3, -2],
                              x: [0, 8, -6, 0],
                              y: [0, -6, 4, 0],
                            }}
                            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          <div className="absolute inset-0 backdrop-blur-3xl bg-black/60" />
                          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-3 gap-1">
                            <Lock className="w-4 h-4 text-exclu-cloud/80" />
                            <p className="text-xs font-medium text-exclu-cloud line-clamp-1">{link.title}</p>
                          </div>
                        </div>
                        <div className="p-3 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-exclu-cloud">{priceLabel}</p>
                          <Button
                            variant="hero"
                            size="sm"
                            className="rounded-full text-[11px] px-3 py-1 h-7 inline-flex items-center gap-1"
                            onClick={() => handleUnlockClick(link)}
                          >
                            Unlock
                            <ArrowUpRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              )}

              {error && !isLoading && (
                <p className="text-sm text-red-400 mt-4">{error}</p>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CreatorPublic;
