import { MapPin, Verified } from 'lucide-react';
import { motion } from 'framer-motion';

export interface DirectoryCreator {
  creator_profile_id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  country: string | null;
  city: string | null;
  niche: string | null;
  is_premium: boolean;
}

interface CreatorCardProps {
  creator: DirectoryCreator;
  index?: number;
  href?: string;
  /** When set, renders as a div instead of an anchor (useful for admin DnD). */
  asChild?: boolean;
  /** Extra elements stacked on top of the card (e.g. admin badges, kebab menu). */
  overlay?: React.ReactNode;
  /** Pass-through for grid animation delay batching. */
  batchSize?: number;
  className?: string;
}

const CARD_CLASSES =
  'group block relative rounded-3xl overflow-hidden border border-exclu-arsenic/40 hover:border-white/30 transition-all duration-500 hover:scale-[1.03]';

/**
 * Single creator card used by /directory/creators and /admin/directory. Layout is
 * identical to the historical inline render — extracted so admin can wrap it with
 * overlays and the public + admin views never drift visually.
 */
export const CreatorCard = ({
  creator,
  index = 0,
  href,
  asChild = false,
  overlay,
  batchSize = 20,
  className = '',
}: CreatorCardProps) => {
  const inner = (
    <div className="aspect-[3/4] relative">
      {creator.avatar_url ? (
        <img
          src={creator.avatar_url}
          alt={creator.display_name || creator.username || 'Creator'}
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
          {creator.is_premium && <Verified className="w-4 h-4 text-[#CFFF16] flex-shrink-0" />}
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
      {overlay}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: Math.min((index % batchSize) * 0.04, 0.4) }}
      className={className}
    >
      {asChild ? (
        <div className={CARD_CLASSES}>{inner}</div>
      ) : (
        <a
          href={href ?? `/${creator.username}`}
          className={CARD_CLASSES}
        >
          {inner}
        </a>
      )}
    </motion.div>
  );
};

export default CreatorCard;
