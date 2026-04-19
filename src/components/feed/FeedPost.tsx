import { Lock, Play, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Shape for a feed card. Two variants:
 *  - `asset` — a public asset. `isUnlocked` is true for the one free preview
 *    or for viewers with an active subscription; the component handles the
 *    blurred-with-CTA state when false.
 *  - `link`  — a paid link. Always locked; clicking routes to /l/:slug to buy.
 */
export type FeedPostData =
  | {
      kind: 'asset';
      id: string;
      previewUrl: string | null;
      mimeType: string | null;
      caption: string | null;
      isUnlocked: boolean;
    }
  | {
      kind: 'link';
      id: string;
      slug: string;
      title: string;
      description: string | null;
      priceCents: number;
      coverUrl: string | null;
    };

interface FeedPostProps {
  post: FeedPostData;
  gradientStops: [string, string];
  onLockedClick: () => void; // opens subscribe popup
  onLinkClick: (slug: string) => void;
}

export function FeedPost({ post, gradientStops, onLockedClick, onLinkClick }: FeedPostProps) {
  // ── Paid-link variant: always blurred, CTA = Unlock for $X ───────────────
  if (post.kind === 'link') {
    return (
      <motion.button
        type="button"
        onClick={() => onLinkClick(post.slug)}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative w-full overflow-hidden rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm text-left"
      >
        <div className="relative aspect-square w-full overflow-hidden">
          {post.coverUrl ? (
            // Scale + heavy blur on a decorative copy so nothing legible is ever in the DOM.
            <img src={post.coverUrl} alt="" className="w-full h-full object-cover scale-110 blur-2xl brightness-50" />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Lock className="w-8 h-8 text-white/90" />
            <span className="text-[10px] font-semibold text-white/80 uppercase tracking-wider">Paid content</span>
            <span
              className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-bold text-black"
              style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Unlock ${(post.priceCents / 100).toFixed(2)}
            </span>
          </div>
        </div>
        <div className="p-3">
          <h4 className="text-sm font-semibold text-white truncate">{post.title}</h4>
          {post.description && <p className="text-xs text-white/60 truncate">{post.description}</p>}
        </div>
      </motion.button>
    );
  }

  // ── Asset variant: unblurred iff the viewer has access ──────────────────
  const isVideo = post.mimeType?.startsWith('video/');
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative w-full overflow-hidden rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm"
    >
      {post.caption && (
        <p className="px-3 pt-3 pb-2 text-sm text-white/90 whitespace-pre-wrap">{post.caption}</p>
      )}
      <div className="relative aspect-square w-full overflow-hidden">
        {post.previewUrl ? (
          isVideo ? (
            <video
              src={post.previewUrl}
              className={`w-full h-full object-cover ${!post.isUnlocked ? 'blur-2xl brightness-50 scale-110' : ''}`}
              muted
              loop
              playsInline
              // Disable the controls track and pointer events on blurred media
              // so a right-click can't download the underlying video file.
              controls={post.isUnlocked}
              style={!post.isUnlocked ? { pointerEvents: 'none' } : undefined}
            />
          ) : (
            <img
              src={post.previewUrl}
              alt=""
              className={`w-full h-full object-cover ${!post.isUnlocked ? 'blur-2xl brightness-50 scale-110' : ''}`}
              style={!post.isUnlocked ? { pointerEvents: 'none', userSelect: 'none' } : undefined}
            />
          )
        ) : (
          <div className="w-full h-full bg-white/5 flex items-center justify-center">
            <Lock className="w-6 h-6 text-white/40" />
          </div>
        )}

        {!post.isUnlocked && (
          <button
            type="button"
            onClick={onLockedClick}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30"
          >
            <Lock className="w-8 h-8 text-white/90" />
            <span
              className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-bold text-black"
              style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
            >
              Subscribe to view
            </span>
          </button>
        )}

        {post.isUnlocked && isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm border border-white/20">
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
