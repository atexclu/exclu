import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { ArrowUpRight, Lock } from 'lucide-react';

interface CreatorProfileData {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  handle: string | null;
  external_url: string | null;
  theme_color: string | null;
  social_links: Record<string, string> | null;
}

interface CreatorLinkCard {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  slug: string;
}

// Theme color configurations
const themeColors: Record<string, { gradient: string; button: string; ring: string; bg: string }> = {
  pink: {
    gradient: 'from-pink-500 to-rose-500',
    button: 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600',
    ring: 'ring-pink-500/50',
    bg: 'rgba(236, 72, 153, 0.9)',
  },
  purple: {
    gradient: 'from-purple-500 to-violet-500',
    button: 'bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600',
    ring: 'ring-purple-500/50',
    bg: 'rgba(139, 92, 246, 0.9)',
  },
  blue: {
    gradient: 'from-blue-500 to-cyan-500',
    button: 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600',
    ring: 'ring-blue-500/50',
    bg: 'rgba(59, 130, 246, 0.9)',
  },
  orange: {
    gradient: 'from-orange-500 to-amber-500',
    button: 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600',
    ring: 'ring-orange-500/50',
    bg: 'rgba(249, 115, 22, 0.9)',
  },
  green: {
    gradient: 'from-green-500 to-emerald-500',
    button: 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600',
    ring: 'ring-green-500/50',
    bg: 'rgba(34, 197, 94, 0.9)',
  },
  red: {
    gradient: 'from-red-500 to-rose-600',
    button: 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700',
    ring: 'ring-red-500/50',
    bg: 'rgba(239, 68, 68, 0.9)',
  },
};

// Social platform configurations
const socialPlatforms: Record<string, { label: string; icon: string; color: string }> = {
  twitter: { label: 'X', icon: '𝕏', color: 'bg-black' },
  tiktok: { label: 'TikTok', icon: '♪', color: 'bg-gradient-to-br from-[#ff0050] via-black to-[#00f2ea]' },
  telegram: { label: 'Telegram', icon: '✈', color: 'bg-[#0088cc]' },
  onlyfans: { label: 'OnlyFans', icon: '💙', color: 'bg-[#00AFF0]' },
  fansly: { label: 'Fansly', icon: '💎', color: 'bg-[#1DA1F2]' },
  linktree: { label: 'Linktree', icon: '🌳', color: 'bg-[#43E55E]' },
  instagram: { label: 'Instagram', icon: '📷', color: 'bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888]' },
  youtube: { label: 'YouTube', icon: '▶', color: 'bg-[#FF0000]' },
  snapchat: { label: 'Snapchat', icon: '👻', color: 'bg-[#FFFC00] text-black' },
};

const CreatorPublic = () => {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<CreatorProfileData | null>(null);
  const [links, setLinks] = useState<CreatorLinkCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCreator = async () => {
      if (!handle) return;
      setIsLoading(true);
      setError(null);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, bio, handle, external_url, is_creator, theme_color, social_links')
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

      setProfile(profileData as unknown as CreatorProfileData);
      setIsLoading(false);
    };

    fetchCreator();
  }, [handle]);

  const handleLinkClick = (link: CreatorLinkCard) => {
    navigate(`/l/${link.slug}`);
  };

  const handleSocialClick = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleExternalClick = () => {
    if (!profile?.external_url) return;
    window.open(profile.external_url, '_blank', 'noopener,noreferrer');
  };

  const displayName = profile?.display_name || profile?.handle || handle || 'Creator';
  const themeColor = profile?.theme_color || 'pink';
  const theme = themeColors[themeColor] || themeColors.pink;
  const socialLinks = profile?.social_links || {};
  const activeSocials = Object.entries(socialLinks).filter(([_, url]) => url && url.trim() !== '');

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Mobile: Full screen avatar background */}
      <div className="sm:hidden fixed inset-0 z-0">
        {profile?.avatar_url && (
          <>
            <img
              src={profile.avatar_url}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black" />
          </>
        )}
      </div>

      {/* Desktop: Gradient background */}
      <div className="hidden sm:block fixed inset-0 z-0 bg-gradient-to-b from-black via-exclu-ink to-black">
        <motion.div
          className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] mx-auto max-w-3xl rounded-full blur-3xl opacity-80"
          style={{
            background: `radial-gradient(circle at top, rgba(255,255,255,0.18), transparent 55%), radial-gradient(circle at bottom, ${theme.bg}, transparent 60%)`,
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.8, ease: 'easeOut' }}
        />
      </div>

      <main className="relative z-10 flex-1 flex flex-col px-4 pt-8 pb-6 sm:pt-12">
        <div className="max-w-md mx-auto w-full flex flex-col flex-1">
          {/* Profile Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-center mb-6"
          >
            {/* Avatar - smaller on mobile since it's in background */}
            <div className="relative inline-block mb-4">
              <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${theme.gradient} blur-lg opacity-70 scale-110`} />
              <div className={`relative w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-white/30 ring-4 ${theme.ring}`}>
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-exclu-ink flex items-center justify-center">
                    <span className="text-2xl font-bold text-white/80">{displayName.charAt(0).toUpperCase()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Name & Handle */}
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1 drop-shadow-lg">{displayName}</h1>
            {profile?.handle && (
              <p className="text-sm text-white/70 mb-3">@{profile.handle}</p>
            )}
            {profile?.bio && (
              <p className="text-sm text-white/80 max-w-xs mx-auto mb-4 drop-shadow">{profile.bio}</p>
            )}

            {/* Social Links - Story bubbles style */}
            {activeSocials.length > 0 && (
              <div className="flex justify-center gap-3 mb-6">
                {activeSocials.map(([platform, url]) => {
                  const platformConfig = socialPlatforms[platform];
                  if (!platformConfig) return null;
                  return (
                    <motion.button
                      key={platform}
                      type="button"
                      onClick={() => handleSocialClick(url)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className={`w-14 h-14 rounded-full ${platformConfig.color} flex items-center justify-center text-xl shadow-lg ring-2 ring-white/30 hover:ring-white/60 transition-all`}
                      title={platformConfig.label}
                    >
                      {platformConfig.icon}
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Main CTA Button */}
          {profile?.external_url && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-4"
            >
              <Button
                onClick={handleExternalClick}
                className={`w-full h-14 rounded-full text-white font-semibold text-lg shadow-xl ${theme.button} transition-all`}
              >
                My exclusive link
                <ArrowUpRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* Content Links */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {isLoading && (
              <p className="text-sm text-white/60 text-center py-4">Loading content…</p>
            )}

            {!isLoading && !error && links.length === 0 && (
              <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 text-sm text-white/70 text-center">
                No exclusive content available yet.
              </div>
            )}

            {!isLoading && links.length > 0 && (
              <>
                <p className="text-xs uppercase tracking-wider text-white/50 text-center mb-2">
                  Exclusive Content
                </p>
                {links.map((link, index) => {
                  const priceLabel = `${(link.price_cents / 100).toFixed(2)} ${link.currency}`;
                  return (
                    <motion.button
                      key={link.id}
                      type="button"
                      onClick={() => handleLinkClick(link)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.1 * index }}
                      className={`w-full h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all flex items-center justify-between px-5 group`}
                    >
                      <div className="flex items-center gap-3">
                        <Lock className="w-4 h-4 text-white/60" />
                        <span className="text-white font-medium truncate max-w-[180px]">{link.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent`}>
                          {priceLabel}
                        </span>
                        <ArrowUpRight className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
                      </div>
                    </motion.button>
                  );
                })}
              </>
            )}

            {error && !isLoading && (
              <p className="text-sm text-red-400 text-center py-4">{error}</p>
            )}
          </div>

          {/* Footer branding */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-6 text-center"
          >
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              Powered by <span className="font-semibold">Exclu</span>
            </a>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default CreatorPublic;
