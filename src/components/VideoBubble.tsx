import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Floating video bubble for the landing page.
 *
 * Behaviour matches the inga.eco reference:
 *   - Sticky bottom-left bubble that auto-plays the loop video on mount.
 *   - Click bubble → expands toward the upper-right diagonal:
 *       • Desktop: phone-shaped portrait window anchored bottom-left.
 *       • Mobile : near full-screen with safe margins, video stays centered
 *                  without letterboxing or stretching.
 *   - Native HTML5 controls in expanded mode (timeline/play/pause).
 *   - Close (×) on both states. Closing in expanded mode collapses back to
 *     bubble; closing the bubble removes the player entirely (and pauses).
 *
 * The video file lives in /public/exclu.MOV so Vite serves it statically.
 */
const VIDEO_SRC = '/exclu.MOV';
const STORAGE_KEY = 'exclu_video_bubble_dismissed_v1';

export default function VideoBubble() {
  const [isMounted, setIsMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Defer mount one frame so the bubble pop-in animation plays cleanly.
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1') {
      setIsClosed(true);
      return;
    }
    const t = window.setTimeout(() => setIsMounted(true), 200);
    return () => window.clearTimeout(t);
  }, []);

  // When user closes the bubble entirely, remember it for this session so we
  // do not re-pop it on every route change.
  useEffect(() => {
    if (isClosed && typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, '1');
    }
  }, [isClosed]);

  // Pause/play depending on which view is mounted; native controls only show
  // when expanded so we explicitly call play() in the bubble state too.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isClosed) {
      v.pause();
      return;
    }
    // autoplay (muted) for the bubble preview; expanded keeps the playhead.
    v.play().catch(() => {
      // Browsers can refuse autoplay; user click on bubble will start it.
    });
  }, [isClosed, isExpanded, isMounted]);

  if (isClosed) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-[80] pointer-events-none"
      // Pointer events re-enabled on the inner draggable surfaces so the rest
      // of the page (CTAs underneath) stays clickable.
    >
      <AnimatePresence mode="wait">
        {!isExpanded && isMounted && (
          <motion.button
            key="bubble"
            type="button"
            aria-label="Open Exclu intro video"
            onClick={() => setIsExpanded(true)}
            initial={{ scale: 0.6, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.6, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            className="pointer-events-auto relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden shadow-[0_8px_24px_-4px_rgba(0,0,0,0.6)] ring-2 ring-white/20 hover:ring-[#CFFF16]/60 transition-all hover:scale-105"
          >
            <video
              ref={videoRef}
              src={VIDEO_SRC}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
            />
            {/* Subtle pulse ring to draw the eye without being annoying. */}
            <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-[#CFFF16]/40 animate-ping pointer-events-none opacity-60" />
            {/* Close × on the bubble itself (top-right corner). */}
            <span
              role="button"
              tabIndex={0}
              aria-label="Close intro video"
              onClick={(e) => {
                e.stopPropagation();
                setIsClosed(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsClosed(true);
                }
              }}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/85 hover:bg-black border border-white/30 text-white flex items-center justify-center text-[10px] cursor-pointer"
            >
              <X className="w-3 h-3" />
            </span>
          </motion.button>
        )}

        {isExpanded && (
          <>
            {/* Backdrop only on mobile so the user can dismiss by tapping
                outside; on desktop the expanded player is much smaller and
                doesn't need an overlay. */}
            <motion.div
              key="backdrop"
              className="fixed inset-0 bg-black/50 backdrop-blur-sm sm:hidden pointer-events-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsExpanded(false)}
            />

            {/* Mobile: centered, near full-screen with margins, 9:16 aspect */}
            <motion.div
              key="player-mobile"
              className="fixed inset-4 sm:hidden flex items-center justify-center z-[81] pointer-events-auto"
              initial={{ scale: 0.6, opacity: 0, originX: 0, originY: 1 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative w-full max-w-[min(92vw,calc(80vh*9/16))] aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
                <video
                  ref={videoRef}
                  src={VIDEO_SRC}
                  autoPlay
                  loop
                  playsInline
                  controls
                  preload="metadata"
                  className="w-full h-full object-contain bg-black"
                />
                <button
                  type="button"
                  aria-label="Close video"
                  onClick={() => setIsExpanded(false)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/80 hover:bg-black border border-white/30 text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>

            {/* Desktop: anchored bottom-left, expands diagonally toward the
                upper-right. Phone-shaped portrait window. */}
            <motion.div
              key="player-desktop"
              className="hidden sm:flex fixed bottom-4 left-4 z-[81] pointer-events-auto items-end justify-start"
              initial={{ scale: 0.4, opacity: 0, originX: 0, originY: 1 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 24 }}
            >
              <div
                className="relative bg-black rounded-2xl overflow-hidden shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
                style={{ width: 'min(280px, 22vw)', aspectRatio: '9 / 16' }}
              >
                <video
                  ref={videoRef}
                  src={VIDEO_SRC}
                  autoPlay
                  loop
                  playsInline
                  controls
                  preload="metadata"
                  className="w-full h-full object-contain bg-black"
                />
                <button
                  type="button"
                  aria-label="Close video"
                  onClick={() => setIsExpanded(false)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/80 hover:bg-black border border-white/30 text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
