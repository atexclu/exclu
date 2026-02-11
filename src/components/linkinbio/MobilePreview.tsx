import React from 'react';
import { motion } from 'framer-motion';
import { Lock, ArrowUpRight, Image as ImageIcon, MapPin } from 'lucide-react';
import Aurora from '@/components/ui/Aurora';
import { getAuroraGradient } from '@/lib/auroraGradients';
import logo from '@/assets/logo-white.svg';
import { Button } from '@/components/ui/button';
import {
  SiX,
  SiInstagram,
  SiTiktok,
  SiTelegram,
  SiOnlyfans,
  SiYoutube,
  SiSnapchat,
  SiLinktree,
} from 'react-icons/si';

interface LinkInBioData {
  display_name: string;
  handle: string;
  bio: string;
  avatar_url: string | null;
  theme_color: string;
  aurora_gradient: string;
  social_links: Record<string, string>;
  show_join_banner: boolean;
  location: string | null;
  exclusive_content_text: string | null;
  exclusive_content_link_id: string | null;
  exclusive_content_url: string | null;
  exclusive_content_image_url: string | null;
}

interface CreatorLink {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  show_on_profile: boolean;
}

interface MobilePreviewProps {
  data: LinkInBioData;
  links: CreatorLink[];
  isPremium?: boolean;
  publicContent?: any[];
}

const themeColors: Record<string, { gradient: string; button: string; ring: string; bg: string; stops: [string, string] }> = {
  pink: {
    gradient: 'from-pink-500 to-rose-500',
    button: 'bg-gradient-to-r from-pink-500 to-rose-500',
    ring: 'ring-pink-500/50',
    bg: 'rgba(236, 72, 153, 0.9)',
    stops: ['#ec4899', '#f43f5e'],
  },
  purple: {
    gradient: 'from-purple-500 to-violet-500',
    button: 'bg-gradient-to-r from-purple-500 to-violet-500',
    ring: 'ring-purple-500/50',
    bg: 'rgba(139, 92, 246, 0.9)',
    stops: ['#a855f7', '#8b5cf6'],
  },
  blue: {
    gradient: 'from-blue-500 to-cyan-500',
    button: 'bg-gradient-to-r from-blue-500 to-cyan-500',
    ring: 'ring-blue-500/50',
    bg: 'rgba(59, 130, 246, 0.9)',
    stops: ['#3b82f6', '#06b6d4'],
  },
  orange: {
    gradient: 'from-orange-500 to-amber-500',
    button: 'bg-gradient-to-r from-orange-500 to-amber-500',
    ring: 'ring-orange-500/50',
    bg: 'rgba(249, 115, 22, 0.9)',
    stops: ['#f97316', '#f59e0b'],
  },
  green: {
    gradient: 'from-green-500 to-emerald-500',
    button: 'bg-gradient-to-r from-green-500 to-emerald-500',
    ring: 'ring-green-500/50',
    bg: 'rgba(34, 197, 94, 0.9)',
    stops: ['#22c55e', '#10b981'],
  },
  red: {
    gradient: 'from-red-500 to-rose-600',
    button: 'bg-gradient-to-r from-red-500 to-rose-600',
    ring: 'ring-red-500/50',
    bg: 'rgba(239, 68, 68, 0.9)',
    stops: ['#ef4444', '#e11d48'],
  },
};

const socialPlatforms: Record<string, { label: string; icon: JSX.Element }> = {
  twitter: { label: 'X', icon: <SiX className="w-4 h-4" /> },
  instagram: { label: 'Instagram', icon: <SiInstagram className="w-4 h-4" /> },
  tiktok: { label: 'TikTok', icon: <SiTiktok className="w-4 h-4" /> },
  telegram: { label: 'Telegram', icon: <SiTelegram className="w-4 h-4" /> },
  onlyfans: { label: 'OnlyFans', icon: <SiOnlyfans className="w-4 h-4" /> },
  fansly: { label: 'Fansly', icon: <SiOnlyfans className="w-4 h-4" /> },
  linktree: { label: 'Linktree', icon: <SiLinktree className="w-4 h-4" /> },
  youtube: { label: 'YouTube', icon: <SiYoutube className="w-4 h-4" /> },
  snapchat: { label: 'Snapchat', icon: <SiSnapchat className="w-4 h-4" /> },
};

export function MobilePreview({ data, links, isPremium = false, publicContent = [] }: MobilePreviewProps) {
  const [activeTab, setActiveTab] = React.useState<'links' | 'content'>('links');
  const displayName = data.display_name || 'Your Name';
  const theme = themeColors[data.theme_color] || themeColors.pink;
  const activeSocials = Object.entries(data.social_links).filter(([_, url]) => url && url.trim() !== '');
  const visibleLinks = links.filter((link) => link.show_on_profile);
  const shouldShowJoinBanner = !isPremium || (isPremium && data.show_join_banner !== false);

  return (
    <div className="relative">
      {/* iPhone 14 Pro Frame - Scaled to 60% for better PC display */}
      <div className="relative mx-auto" style={{ width: '280px', height: '606px' }}>
        {/* Device Frame */}
        <div className="absolute inset-0 rounded-[3rem] bg-black shadow-2xl ring-1 ring-white/10">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-3xl z-50" />
          
          {/* Screen */}
          <div className="absolute inset-3 rounded-[2.5rem] bg-black overflow-hidden">
            {/* Status Bar */}
            <div className="absolute top-0 inset-x-0 h-11 flex items-center justify-between px-8 text-white text-xs z-40">
              <span className="font-semibold">9:41</span>
              <div className="flex items-center gap-1.5">
                {/* Signal bars */}
                <div className="flex items-end gap-[1px]">
                  <div className="w-[3px] h-[4px] bg-white rounded-[0.5px]" />
                  <div className="w-[3px] h-[6px] bg-white rounded-[0.5px]" />
                  <div className="w-[3px] h-[8px] bg-white rounded-[0.5px]" />
                  <div className="w-[3px] h-[10px] bg-white rounded-[0.5px]" />
                </div>
                {/* WiFi icon */}
                <svg width="15" height="11" viewBox="0 0 15 11" fill="none" className="text-white">
                  <path d="M7.5 10.5C8.05 10.5 8.5 10.05 8.5 9.5C8.5 8.95 8.05 8.5 7.5 8.5C6.95 8.5 6.5 8.95 6.5 9.5C6.5 10.05 6.95 10.5 7.5 10.5Z" fill="currentColor"/>
                  <path d="M7.5 6.5C8.88 6.5 10.16 7.03 11.12 7.88L12.24 6.62C10.96 5.48 9.3 4.83 7.5 4.83C5.7 4.83 4.04 5.48 2.76 6.62L3.88 7.88C4.84 7.03 6.12 6.5 7.5 6.5Z" fill="currentColor"/>
                  <path d="M7.5 2.17C9.96 2.17 12.24 3.07 13.98 4.62L15 3.38C12.96 1.54 10.34 0.5 7.5 0.5C4.66 0.5 2.04 1.54 0 3.38L1.02 4.62C2.76 3.07 5.04 2.17 7.5 2.17Z" fill="currentColor"/>
                </svg>
                {/* Battery */}
                <div className="flex items-center gap-0.5">
                  <div className="relative">
                    <div className="w-[22px] h-[11px] border-2 border-white rounded-[3px] flex items-center justify-center">
                      <div className="w-[16px] h-[7px] bg-white rounded-[1px]" />
                    </div>
                    <div className="absolute -right-[2px] top-1/2 -translate-y-1/2 w-[1.5px] h-[5px] bg-white rounded-r-[1px]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide bg-gradient-to-b from-black via-exclu-ink to-black relative">
              {/* Aurora Background - Positioned lower with margin from top */}
              <div className="absolute inset-x-0 top-[70%] -translate-y-1/2 h-full z-0 pointer-events-none">
                <Aurora
                  colorStops={getAuroraGradient(data.aurora_gradient || 'purple_dream').colors}
                  blend={0.5}
                  amplitude={1.0}
                  speed={1}
                />
              </div>

              {/* Content */}
              <div className="relative z-[1] pt-11">
                {/* Avatar - Full Width with gradient overlay */}
                <div className="relative w-full aspect-square">
                  {data.avatar_url ? (
                    <img src={data.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-exclu-phantom/40 flex items-center justify-center">
                      <span className="text-6xl font-bold text-white/80">{displayName.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  {/* Soft dark overlay, reduced intensity */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/20 to-black/60" />
                  {/* Shadow at bottom of image - fading up */}
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
                  {/* Name overlay on image */}
                  <div className="absolute inset-x-5 bottom-6 flex flex-col items-center text-center">
                    <div className="flex items-center gap-1">
                      <h1 className="text-xl font-extrabold text-white drop-shadow-[0_6px_18px_rgba(0,0,0,0.9)]">{displayName}</h1>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0 drop-shadow-lg">
                        <defs><linearGradient id={`badge-grad-mp-${data.theme_color}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={theme.stops[0]} /><stop offset="100%" stopColor={theme.stops[1]} /></linearGradient></defs>
                        <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill={`url(#badge-grad-mp-${data.theme_color})`} stroke={`url(#badge-grad-mp-${data.theme_color})`} />
                        <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2" fill="none" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="relative px-4 pb-24">
                  {/* Inner shadow at top - softer black with 150px gradient fade */}
                  <div className="absolute inset-x-0 top-0 h-[150px] bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-20" />
                  {/* Location & Bio */}
                  <div className="relative z-10 text-center mb-4 pt-6">
                    {data.location && (
                      <p className="text-xs text-white/80 mb-2 flex items-center justify-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {data.location}
                      </p>
                    )}
                    {data.bio && <p className="text-sm text-white/90 max-w-xs mx-auto mb-4">{data.bio}</p>}
                  </div>

                  {/* Social Links - Horizontal scrollable bubbles */}
                  {activeSocials.length > 0 && (
                    <div className="mb-4 -mx-4 px-4 pt-2">
                      <div className="flex gap-3 justify-center overflow-x-auto scrollbar-hide pb-2">
                        {activeSocials.map(([platform, url]) => {
                          const platformConfig = socialPlatforms[platform];
                          if (!platformConfig) return null;
                          
                          const handleClick = () => {
                            if (url) {
                              window.open(url, '_blank', 'noopener,noreferrer');
                            }
                          };
                          
                          return (
                            <motion.button
                              key={platform}
                              type="button"
                              onClick={handleClick}
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                              className="flex-shrink-0 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shadow-lg ring-2 ring-white/20 cursor-pointer"
                            >
                              <span className="text-white text-xs">{platformConfig.icon}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tabs Links/Content */}
                  {(visibleLinks.length > 0 || publicContent.length > 0) && (
                    <div className="relative mb-4">
                      <div className="flex justify-center gap-6">
                        <button
                          onClick={() => setActiveTab('links')}
                          className={`relative px-2 py-1.5 text-[11px] font-medium transition-colors ${
                            activeTab === 'links'
                              ? 'text-white'
                              : 'text-white/50 hover:text-white/70'
                          }`}
                        >
                          Links
                        </button>
                        <button
                          onClick={() => setActiveTab('content')}
                          className={`relative px-2 py-1.5 text-[11px] font-medium transition-colors ${
                            activeTab === 'content'
                              ? 'text-white'
                              : 'text-white/50 hover:text-white/70'
                          }`}
                        >
                          Content
                        </button>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/10" />
                      <motion.div
                        className="absolute bottom-0 h-[1.5px] bg-white rounded-full"
                        initial={false}
                        animate={{
                          left: activeTab === 'links' ? 'calc(50% - 3rem - 7px)' : 'calc(50% + 0.5rem + 6px)',
                          width: activeTab === 'links' ? '26px' : '44px'
                        }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    </div>
                  )}

                  {/* Links Tab */}
                  {activeTab === 'links' && (
                    <div className="space-y-2">
                      {/* Exclusive content button */}
                      {data.exclusive_content_text && (data.exclusive_content_url || data.exclusive_content_link_id) && (
                        data.exclusive_content_image_url ? (
                          <div className="relative rounded-xl overflow-hidden border border-white/20 shadow-lg">
                            <img src={data.exclusive_content_image_url} alt="Exclusive" className="w-full h-28 object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                            <div className="absolute bottom-2.5 inset-x-3 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Lock className="w-3 h-3 text-white" />
                                <span className="text-xs font-bold text-white truncate max-w-[130px]">
                                  {data.exclusive_content_text}
                                </span>
                              </div>
                              <ArrowUpRight className="w-3.5 h-3.5 text-white/70" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-12 rounded-full flex items-center justify-center gap-2 shadow-lg" style={{ background: `linear-gradient(to right, ${theme.stops[0]}, ${theme.stops[1]})` }}>
                            <Lock className="w-3.5 h-3.5 text-white" />
                            <span className="text-xs font-bold text-white truncate max-w-[160px]">
                              {data.exclusive_content_text}
                            </span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-white/70" />
                          </div>
                        )
                      )}

                      {visibleLinks.length > 0 && (
                        <p className="text-xs uppercase tracking-wider text-white/50 text-center mb-2">
                          Exclusive Content
                        </p>
                      )}
                      {visibleLinks.map((link) => {
                        const priceLabel = `${(link.price_cents / 100).toFixed(2)} ${link.currency}`;
                        return (
                          <div
                            key={link.id}
                            className="h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-between px-4"
                          >
                            <div className="flex items-center gap-2">
                              <Lock className="w-3.5 h-3.5 text-white/60" />
                              <span className="text-white text-sm font-medium truncate max-w-[140px]">{link.title}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, ${theme.stops[0]}, ${theme.stops[1]})` }}>
                                {priceLabel}
                              </span>
                              <ArrowUpRight className="w-3.5 h-3.5 text-white/60" />
                            </div>
                          </div>
                        );
                      })}

                      {!(data.exclusive_content_text && (data.exclusive_content_url || data.exclusive_content_link_id)) && visibleLinks.length === 0 && (
                        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 text-sm text-white/70 text-center">
                          No content links yet
                        </div>
                      )}
                    </div>
                  )}

                  {/* Content Tab */}
                  {activeTab === 'content' && publicContent.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-white/50 text-center mb-2">
                        Public Gallery
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {publicContent.map((content: any) => {
                          const isVideo = content.mime_type?.startsWith('video/');
                          return (
                            <div
                              key={content.id}
                              className="relative aspect-square rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm border border-white/20"
                            >
                              {content.previewUrl ? (
                                isVideo ? (
                                  <video
                                    src={content.previewUrl}
                                    className="w-full h-full object-cover"
                                    muted
                                    loop
                                    playsInline
                                  />
                                ) : (
                                  <img
                                    src={content.previewUrl}
                                    alt={content.title}
                                    className="w-full h-full object-cover"
                                  />
                                )
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageIcon className="w-6 h-6 text-white/40" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === 'content' && publicContent.length === 0 && (
                    <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 text-sm text-white/70 text-center">
                      No public content yet
                    </div>
                  )}

                  {/* Join Exclu Banner */}
                  {shouldShowJoinBanner && (
                    <div className="fixed inset-x-4 bottom-4 z-30">
                      <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/85 border border-exclu-arsenic/60 px-4 py-3 backdrop-blur-md shadow-lg shadow-black/60">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <img src={logo} alt="Exclu" className="h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-white">
                              Start selling your own premium content without commission with Exclu.
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full text-xs px-3 py-1.5 bg-white text-black hover:bg-slate-100"
                        >
                          Join now
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Device Buttons */}
        <div className="absolute right-0 top-32 w-1 h-16 bg-black/40 rounded-l-sm" />
        <div className="absolute right-0 top-52 w-1 h-12 bg-black/40 rounded-l-sm" />
        <div className="absolute left-0 top-40 w-1 h-8 bg-black/40 rounded-r-sm" />
      </div>

      {/* Preview Label */}
      <div className="mt-4 text-center">
        <p className="text-xs text-muted-foreground">Live Preview • iPhone 14 Pro</p>
      </div>
    </div>
  );
}
