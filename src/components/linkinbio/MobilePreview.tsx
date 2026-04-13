import React from 'react';
import { motion } from 'framer-motion';
import { Lock, ArrowUpRight, Image as ImageIcon, MapPin, DollarSign, MessageSquare, Gift, ExternalLink } from 'lucide-react';
import Aurora from '@/components/ui/Aurora';
import { getAuroraGradient, type AuroraGradient } from '@/lib/auroraGradients';
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
  show_certification: boolean;
  show_available_now: boolean;
  location: string | null;
  exclusive_content_text: string | null;
  exclusive_content_link_id: string | null;
  exclusive_content_url: string | null;
  exclusive_content_image_url: string | null;
  chat_enabled?: boolean;
  tips_enabled?: boolean;
  custom_requests_enabled?: boolean;
  show_agency_branding?: boolean;
}

interface CreatorLink {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  show_on_profile: boolean;
}

interface WishlistItem {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  image_url: string | null;
  gift_url?: string | null;
  price_cents: number;
  max_quantity: number | null;
  gifted_count: number;
  is_visible: boolean;
}

interface MobilePreviewProps {
  data: LinkInBioData;
  links: CreatorLink[];
  isPremium?: boolean;
  publicContent?: any[];
  wishlistItems?: WishlistItem[];
  agencyName?: string | null;
  agencyLogoUrl?: string | null;
}


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

export function MobilePreview({ data, links, isPremium = false, publicContent = [], wishlistItems = [], agencyName, agencyLogoUrl }: MobilePreviewProps) {
  const [activeTab, setActiveTab] = React.useState<'links' | 'content' | 'wishlist'>('links');
  const displayName = data.display_name || 'Your Name';
  const aurora = getAuroraGradient(data.aurora_gradient || 'purple_dream');
  const gradientStops: [string, string] = [aurora.colors[0], aurora.colors[2]];
  const activeSocials = Object.entries(data.social_links).filter(([_, url]) => url && url.trim() !== '');
  const visibleLinks = links.filter((link) => link.show_on_profile);
  const shouldShowJoinBanner = data.show_join_banner !== false && (!isPremium || data.show_join_banner === true);

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
                  <path d="M7.5 10.5C8.05 10.5 8.5 10.05 8.5 9.5C8.5 8.95 8.05 8.5 7.5 8.5C6.95 8.5 6.5 8.95 6.5 9.5C6.5 10.05 6.95 10.5 7.5 10.5Z" fill="currentColor" />
                  <path d="M7.5 6.5C8.88 6.5 10.16 7.03 11.12 7.88L12.24 6.62C10.96 5.48 9.3 4.83 7.5 4.83C5.7 4.83 4.04 5.48 2.76 6.62L3.88 7.88C4.84 7.03 6.12 6.5 7.5 6.5Z" fill="currentColor" />
                  <path d="M7.5 2.17C9.96 2.17 12.24 3.07 13.98 4.62L15 3.38C12.96 1.54 10.34 0.5 7.5 0.5C4.66 0.5 2.04 1.54 0 3.38L1.02 4.62C2.76 3.07 5.04 2.17 7.5 2.17Z" fill="currentColor" />
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
                  {/* Bottom shadow overlay (reduced intensity) */}
                  <div className="absolute inset-x-0 bottom-0 h-[100px] bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10" />
                  {/* Name overlay on image - Lowered */}
                  <div className="absolute inset-x-5 bottom-0 flex flex-col items-center text-center z-30 translate-y-[32px]">
                    <div className="flex items-center gap-1">
                      <h1 className="text-lg font-extrabold text-white drop-shadow-[0_6px_18px_rgba(0,0,0,0.9)]">{displayName}</h1>
                      {data.show_certification !== false && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0 drop-shadow-lg">
                          <defs><linearGradient id={`badge-grad-mp-${data.aurora_gradient}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={gradientStops[0]} /><stop offset="100%" stopColor={gradientStops[1]} /></linearGradient></defs>
                          <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill={`url(#badge-grad-mp-${data.aurora_gradient})`} stroke={`url(#badge-grad-mp-${data.aurora_gradient})`} />
                          <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2" fill="none" />
                        </svg>
                      )}
                    </div>

                    {/* Social Links: placed under creator name (like public profile) */}
                    {activeSocials.length > 0 && (
                      <div className="mt-4 flex justify-center gap-2.5">
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
                              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shadow-lg ring-2 ring-white/20 cursor-pointer"
                            >
                              <span className="text-white text-xs">{platformConfig.icon}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative px-4 pb-24">
                  {/* Inner shadow at top - 100% black fading out downwards over 150px */}
                  <div className="absolute inset-x-0 top-0 h-[150px] bg-gradient-to-b from-black to-transparent pointer-events-none z-0" />

                  {/* Location & Bio */}
                  <div className="relative z-10 text-center mb-4 pt-11">
                    {(data.location || data.show_available_now) && (
                      <p className="text-xs text-white mb-2 flex items-center justify-center gap-1">
                        {data.location && (
                          <>
                            <MapPin className="w-3 h-3" />
                            {data.location}
                          </>
                        )}
                        {data.location && data.show_available_now && (
                          <span className="mx-1">·</span>
                        )}
                        {data.show_available_now && (
                          <span className="inline-flex items-center gap-1 text-white">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: gradientStops[0] }} />
                              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: gradientStops[0] }} />
                            </span>
                            Available now
                          </span>
                        )}
                      </p>
                    )}
                    {data.bio && <p className="text-sm text-white max-w-xs mx-auto mb-4">{data.bio}</p>}
                  </div>

                  {/* Tabs Links/Content/Wishlist */}
                  {(visibleLinks.length > 0 || publicContent.length > 0) && (
                    <div className="relative mb-4">
                      <div className="flex justify-center gap-4">
                        <button
                          onClick={() => setActiveTab('links')}
                          className={`relative px-2 py-1.5 text-[11px] font-medium transition-colors ${activeTab === 'links'
                            ? 'text-white'
                            : 'text-white/50 hover:text-white/70'
                            }`}
                        >
                          Links
                          {activeTab === 'links' && (
                            <div className="absolute -bottom-[1px] left-0 right-0 h-[1.5px] rounded-full" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} />
                          )}
                        </button>
                        <button
                          onClick={() => setActiveTab('content')}
                          className={`relative px-2 py-1.5 text-[11px] font-medium transition-colors ${activeTab === 'content'
                            ? 'text-white'
                            : 'text-white/50 hover:text-white/70'
                            }`}
                        >
                          Content
                          {activeTab === 'content' && (
                            <div className="absolute -bottom-[1px] left-0 right-0 h-[1.5px] rounded-full" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} />
                          )}
                        </button>
                        {wishlistItems.filter(i => i.is_visible).length > 0 && (
                        <button
                          onClick={() => setActiveTab('wishlist')}
                          className={`relative px-2 py-1.5 text-[11px] font-medium transition-colors ${activeTab === 'wishlist'
                            ? 'text-white'
                            : 'text-white/50 hover:text-white/70'
                            }`}
                        >
                          Wishlist
                          {activeTab === 'wishlist' && (
                            <div className="absolute -bottom-[1px] left-0 right-0 h-[1.5px] rounded-full" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} />
                          )}
                        </button>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/10" />
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
                          <div className="w-full h-12 rounded-full flex items-center justify-center gap-2 shadow-lg" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}>
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
                            className="h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-between px-3"
                          >
                            <div className="flex items-center gap-1.5">
                              <Lock className="w-3 h-3 text-white/60" />
                              <span className="text-white text-[10px] font-medium truncate max-w-[100px]">{link.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}>
                                {priceLabel}
                              </span>
                              <ArrowUpRight className="w-3 h-3 text-white/60" />
                            </div>
                          </div>
                        );
                      })}

                      {!(data.exclusive_content_text && (data.exclusive_content_url || data.exclusive_content_link_id)) && visibleLinks.length === 0 && (
                        <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 text-sm text-white/70 text-center">
                          No content links yet
                        </div>
                      )}

                      {/* Tips, Requests & Chat CTAs */}
                      {(data.tips_enabled || data.custom_requests_enabled || data.chat_enabled) && (
                        <div className="space-y-2 mt-3">
                          {data.tips_enabled && (
                            <div
                              className="h-9 rounded-full flex items-center justify-center gap-1.5 text-[10px] font-semibold text-white shadow-lg"
                              style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
                            >
                              <DollarSign className="w-3 h-3" />
                              Send a Tip
                            </div>
                          )}
                          {(data.custom_requests_enabled || data.chat_enabled) && (
                            <div className="flex gap-2">
                              {data.custom_requests_enabled && (
                                <div
                                  className="h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center gap-1.5 text-[10px] font-medium text-white"
                                  style={{ width: data.chat_enabled ? '65%' : '100%' }}
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  Custom Request
                                </div>
                              )}
                              {data.chat_enabled && (
                                <div
                                  className="h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center gap-1.5 text-[10px] font-medium text-white"
                                  style={{ width: data.custom_requests_enabled ? '35%' : '100%' }}
                                >
                                  Chat
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Content Tab */}
                  {activeTab === 'content' && publicContent.length > 0 && (
                    <div className="space-y-2">
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

                  {/* Wishlist Tab */}
                  {activeTab === 'wishlist' && (
                    <div className="space-y-2">
                      {wishlistItems.filter(i => i.is_visible).length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {wishlistItems.filter(i => i.is_visible).map((item) => {
                            const isFullyGifted = item.max_quantity !== null && item.gifted_count >= item.max_quantity;
                            return (
                              <div
                                key={item.id}
                                className={`rounded-xl overflow-hidden border flex flex-col ${
                                  isFullyGifted ? 'border-white/10 opacity-60' : 'border-white/20'
                                }`}
                              >
                                <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden relative">
                                  {item.image_url ? (
                                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-3xl">{item.emoji || '🎁'}</span>
                                  )}

                                  {item.gift_url && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(item.gift_url!, '_blank', 'noopener');
                                      }}
                                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 border border-white/10 flex items-center justify-center"
                                      title="Open gift link"
                                    >
                                      <ExternalLink className="w-3 h-3 text-white/80" />
                                    </button>
                                  )}

                                  {isFullyGifted && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                      <span className="text-white text-[9px] font-semibold">Gifted ✓</span>
                                    </div>
                                  )}
                                </div>
                                <div className="p-2 flex flex-col gap-1 bg-black/40 backdrop-blur-sm">
                                  <p className="text-[10px] font-semibold text-white truncate">{item.name}</p>
                                  {item.description && (
                                    <p className="text-[8px] text-white/50 truncate">{item.description}</p>
                                  )}
                                  <div className="flex items-center justify-between">
                                    <span
                                      className="text-[10px] font-bold bg-clip-text text-transparent"
                                      style={{ backgroundImage: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
                                    >
                                      ${(item.price_cents / 100).toLocaleString()}
                                    </span>
                                    {item.max_quantity !== null && (
                                      <span className="text-[8px] text-white/40">
                                        {item.gifted_count}/{item.max_quantity}
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    className={`w-full h-6 rounded-lg text-[8px] font-bold flex items-center justify-center ${
                                      isFullyGifted
                                        ? 'bg-white/10 text-white/40'
                                        : 'text-black'
                                    }`}
                                    style={!isFullyGifted ? { background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` } : undefined}
                                  >
                                    {isFullyGifted ? 'Gifted ✓' : '🎁 Gift this'}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-white/20 bg-white/10 backdrop-blur-sm p-3 text-[10px] text-white/70 text-center">
                          No wishlist items yet
                        </div>
                      )}
                    </div>
                  )}

                  {/* Agency Branding Footer */}
                  {data.show_agency_branding && (agencyName || agencyLogoUrl) && (
                    <div className="flex items-center justify-center gap-1.5 py-3 opacity-60">
                      {agencyLogoUrl && (
                        <img src={agencyLogoUrl} alt="" className="w-4 h-4 rounded object-contain" />
                      )}
                      <span className="text-[8px] text-white/70">
                        Managed by {agencyName || 'Agency'}
                      </span>
                    </div>
                  )}

                  {/* Join Exclu Banner */}
                  {shouldShowJoinBanner && (
                    <div className="absolute inset-x-4 bottom-4 z-30">
                      <div className="flex items-center justify-between gap-2 rounded-2xl bg-black/85 border border-exclu-arsenic/60 px-3 py-2 backdrop-blur-md shadow-lg shadow-black/60">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <img src={logo} alt="Exclu" className="h-3" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[6px] text-white leading-tight">
                              Start selling your own premium content without commission with Exclu.
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full text-[8px] px-1.5 py-0.5 bg-white text-black hover:bg-slate-100 h-auto flex-shrink-0"
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
