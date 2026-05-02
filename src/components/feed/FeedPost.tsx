import { Lock, Play, DollarSign, BadgeCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { AdaptiveVideo } from '@/components/ui/AdaptiveVideo';

/**
 * Two variants:
 *  - `asset` — a public asset. `previewUrl` is the full-res signed URL
 *    (only set when the viewer is authorised). `blurUrl` is the path to
 *    the server-side blurred JPEG, served to every locked viewer so the
 *    full-res URL never enters the DOM.
 *  - `link`  — a paid link. Always locked; click routes to /l/:slug.
 */
export type FeedPostData =
  | {
      kind: 'asset';
      id: string;
      previewUrl: string | null;
      blurUrl: string | null;
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

export interface FeedAuthor {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  verified?: boolean;
}

interface FeedPostProps {
  post: FeedPostData;
  gradientStops: [string, string];
  author?: FeedAuthor;
  onLockedClick: () => void;
  onLinkClick: (slug: string) => void;
}

/**
 * Compact author strip above each post — avatar + display name + @handle.
 * Mimics X / Instagram post headers but without like/comment actions.
 */
function AuthorHeader({ author, gradientStops }: { author: FeedAuthor; gradientStops: [string, string] }) {
  const initial = (author.displayName || author.handle || '?').charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2.5 px-1 pb-2.5">
      <div className="relative flex-shrink-0">
        {author.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt={author.displayName}
            className="w-9 h-9 rounded-full object-cover ring-1 ring-white/15"
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ring-1 ring-white/15"
            style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
          >
            {initial}
          </div>
        )}
      </div>
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1">
          <p className="text-[13px] font-semibold text-white truncate">{author.displayName}</p>
          {author.verified && (
            <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: gradientStops[0] }} strokeWidth={2.5} />
          )}
        </div>
        {author.handle && <p className="text-[11px] text-white/45 truncate">@{author.handle}</p>}
      </div>
    </div>
  );
}

// Subtle SVG noise overlay applied at low opacity — kills compression
// banding on the blurred preview and gives the card an editorial texture.
const GRAIN_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.4 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")";

export function FeedPost({ post, gradientStops, author, onLockedClick, onLinkClick }: FeedPostProps) {
  // ── Paid-link variant — button wrapping a framed image card ──
  if (post.kind === 'link') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
      >
        {author && <AuthorHeader author={author} gradientStops={gradientStops} />}

        {/* Title + description — reads as post caption */}
        <div className="px-1 pb-2.5">
          <p className="text-[15px] leading-snug text-white font-medium line-clamp-2">{post.title}</p>
          {post.description && (
            <p className="text-[13px] text-white/60 mt-0.5 line-clamp-2">{post.description}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onLinkClick(post.slug)}
          className="group relative block w-full overflow-hidden rounded-3xl border border-white/10 bg-black text-left shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
        >
          <div className="relative aspect-[4/5] w-full overflow-hidden">
            {/* Ambient gradient wash — creator colours bleed through */}
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
                className="absolute inset-0 h-full w-full object-cover scale-[1.15] opacity-60"
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
            {/* CTA centred */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div
                className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/40 backdrop-blur-xl shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]"
                style={{ boxShadow: `0 0 40px ${gradientStops[0]}40` }}
              >
                <Lock className="h-6 w-6 text-white" strokeWidth={1.5} />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/70">Paid content</p>
              <span
                className="mt-1 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold text-black shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] transition-transform group-hover:scale-[1.03]"
                style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
              >
                <DollarSign className="h-3.5 w-3.5" />
                Unlock ${(post.priceCents / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </button>
      </motion.div>
    );
  }

  // ── Asset variant ─────────────────────────────────────────────────
  const isVideo = post.mimeType?.startsWith('video/');
  const canPlayFull = post.isUnlocked && post.previewUrl;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      {author && <AuthorHeader author={author} gradientStops={gradientStops} />}

      {/* Caption above the card — reads like a social post */}
      {post.caption && (
        <p className="px-1 pb-2.5 text-[15px] leading-snug text-white whitespace-pre-wrap">
          {post.caption}
        </p>
      )}

      <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        {canPlayFull && isVideo ? (
          <AdaptiveVideo
            src={post.previewUrl!}
            controls
            playsInline
            preload="metadata"
            maxHeight="80vh"
          />
        ) : (
        <div className="relative aspect-[4/5] w-full overflow-hidden">
          {canPlayFull ? (
            isVideo ? null : (
              <img
                src={post.previewUrl!}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            )
          ) : (
            <>
              {/* Ambient wash so locked cards never feel flat, even without a blur asset yet */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(60% 60% at 30% 20%, ${gradientStops[0]}55 0%, transparent 60%),
                    radial-gradient(55% 55% at 80% 80%, ${gradientStops[1]}66 0%, transparent 65%),
                    linear-gradient(135deg, #111 0%, #000 100%)`,
                }}
              />
              {/* Pre-blurred preview — rendered full-bleed, CSS blur adds a
                  final atmospheric layer on top of the baked-in gaussian */}
              {post.blurUrl && (
                <img
                  src={post.blurUrl}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full object-cover scale-[1.08]"
                  draggable={false}
                  style={{
                    pointerEvents: 'none',
                    userSelect: 'none',
                    filter: 'blur(10px) saturate(1.1)',
                  }}
                />
              )}
              {/* Dark vignette so the CTA stays readable regardless of preview colours */}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/55" />
              {/* Grain overlay */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
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

        </div>
        )}
      </div>
    </motion.article>
  );
}
