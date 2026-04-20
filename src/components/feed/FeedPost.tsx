import { Lock, Play, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Shape for a feed card. Two variants:
 *  - `asset` — a public asset.
 *    When `isUnlocked`, we render the full-res signed URL in `previewUrl`.
 *    When locked, we render `blurUrl` — a tiny pre-blurred JPEG served from a
 *    separate storage path so the full-res URL never appears in the DOM.
 *  - `link`  — a paid link. Always locked; click routes to /l/:slug to buy.
 */
export type FeedPostData =
  | {
      kind: 'asset';
      id: string;
      previewUrl: string | null; // full-res signed URL (null when not authorised)
      blurUrl: string | null;    // public URL to the pre-blurred preview
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
  onLockedClick: () => void;
  onLinkClick: (slug: string) => void;
}

// Subtle grain overlay — SVG noise baked into a data URI, applied at ~8% opacity.
// Kills the banding you see on a heavy gaussian blur + adds an editorial feel.
const GRAIN_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.4 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")";

export function FeedPost({ post, gradientStops, onLockedClick, onLinkClick }: FeedPostProps) {
  // ── Paid-link variant ────────────────────────────────────────────────────
  if (post.kind === 'link') {
    return (
      <motion.button
        type="button"
        onClick={() => onLinkClick(post.slug)}
        initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="group relative block w-full overflow-hidden rounded-3xl border border-white/10 bg-black text-left shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          {/* Ambient gradient wash — the creator's colours leak through the blur */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `radial-gradient(60% 60% at 30% 20%, ${gradientStops[0]}55 0%, transparent 60%),
                radial-gradient(55% 55% at 80% 80%, ${gradientStops[1]}66 0%, transparent 65%),
                linear-gradient(135deg, #111 0%, #000 100%)`,
            }}
          />
          {post.coverUrl && (
            <img
              src={post.coverUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover scale-125 blur-[42px] opacity-40"
              draggable={false}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            />
          )}
          {/* Grain */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
            style={{ backgroundImage: GRAIN_URL, backgroundSize: '160px 160px' }}
          />
          {/* Content centred */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div
              className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/40 backdrop-blur-xl shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]"
              style={{ boxShadow: `0 0 40px ${gradientStops[0]}40` }}
            >
              <Lock className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70">Paid content</p>
            <h4 className="text-base font-bold text-white line-clamp-2">{post.title}</h4>
            {post.description && (
              <p className="text-xs text-white/60 line-clamp-2 max-w-xs">{post.description}</p>
            )}
            <span
              className="mt-2 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-black shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] transition-transform group-hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
            >
              <DollarSign className="h-3.5 w-3.5" />
              Unlock ${(post.priceCents / 100).toFixed(2)}
            </span>
          </div>
        </div>
      </motion.button>
    );
  }

  // ── Asset variant ────────────────────────────────────────────────────────
  const isVideo = post.mimeType?.startsWith('video/');
  const canPlayFull = post.isUnlocked && post.previewUrl;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
    >
      {post.caption && (
        <div className="relative z-10 px-5 pt-5 pb-3">
          <p className="text-[15px] leading-relaxed text-white/90 whitespace-pre-wrap">{post.caption}</p>
        </div>
      )}
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        {canPlayFull ? (
          isVideo ? (
            <video
              src={post.previewUrl!}
              className="h-full w-full object-cover"
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={post.previewUrl!}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          )
        ) : (
          <>
            {/* Ambient gradient (creator colours) */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background: `radial-gradient(60% 60% at 30% 20%, ${gradientStops[0]}55 0%, transparent 60%),
                  radial-gradient(55% 55% at 80% 80%, ${gradientStops[1]}66 0%, transparent 65%),
                  linear-gradient(135deg, #111 0%, #000 100%)`,
              }}
            />
            {/* Pre-blurred thumbnail (scaled up to fill, CSS blur deepens it) */}
            {post.blurUrl && (
              <img
                src={post.blurUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover scale-125 blur-[42px] opacity-80"
                draggable={false}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              />
            )}
            {/* Grain overlay */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.1] mix-blend-overlay"
              style={{ backgroundImage: GRAIN_URL, backgroundSize: '160px 160px' }}
            />
            {/* Lock CTA */}
            <button
              type="button"
              onClick={onLockedClick}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              aria-label="Subscribe to view"
            >
              <div
                className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-black/40 backdrop-blur-xl shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]"
                style={{ boxShadow: `0 0 60px ${gradientStops[0]}60` }}
              >
                <Lock className="h-7 w-7 text-white" strokeWidth={1.5} />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70">
                Subscribers only
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-black shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] transition-transform hover:scale-[1.03]"
                style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
              >
                Subscribe to view
              </span>
            </button>
          </>
        )}

        {/* Play-icon decoration for unlocked videos that haven't played yet */}
        {canPlayFull && isVideo && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/50 backdrop-blur-sm">
              <Play className="ml-0.5 h-5 w-5 text-white" fill="white" />
            </div>
          </div>
        )}
      </div>
    </motion.article>
  );
}
