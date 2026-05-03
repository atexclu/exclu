import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Floating video bubble for the landing page.
 *
 * Single <video> element that stays mounted across bubble ↔ expanded
 * transitions: clicking the bubble morphs its container (Framer Motion
 * `layout`) without re-creating the media element, so playback continues
 * uninterrupted. Only `controls` and `muted` are toggled — neither resets
 * the playhead.
 *
 *   - Bubble: muted autoplay loop, anchored bottom-left.
 *   - Expanded mobile: centered modal with backdrop, near full-screen.
 *   - Expanded desktop: phone-shaped portrait window, anchored bottom-left.
 */
const VIDEO_SRC = '/exclu.MOV';
const STORAGE_KEY = 'exclu_video_bubble_dismissed_v1';
const MOBILE_QUERY = '(max-width: 639px)';

export default function VideoBubble() {
  const [isMounted, setIsMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1') {
      setIsClosed(true);
      return;
    }
    const t = window.setTimeout(() => setIsMounted(true), 200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (isClosed && typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, '1');
    }
  }, [isClosed]);

  // Drive playback / mute state imperatively so React never re-renders the
  // <video> with a different `src`/key (which would trigger a reload).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !isExpanded;
    if (isClosed) {
      v.pause();
    } else {
      v.play().catch(() => {
        // Autoplay can be refused; user gesture on the bubble will recover.
      });
    }
  }, [isClosed, isExpanded, isMounted]);

  if (isClosed || !isMounted) return null;

  return (
    <>
      <AnimatePresence>
        {isExpanded && isMobile && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        layout
        initial={{ scale: 0.6, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{
          layout: { type: 'spring', stiffness: 240, damping: 28 },
          default: { type: 'spring', stiffness: 220, damping: 22 },
        }}
        onClick={() => {
          if (!isExpanded) setIsExpanded(true);
        }}
        className={
          isExpanded
            ? 'fixed z-[81] pointer-events-auto bg-black overflow-hidden rounded-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/10'
            : 'fixed bottom-4 left-4 z-[80] pointer-events-auto w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden shadow-[0_8px_24px_-4px_rgba(0,0,0,0.6)] ring-2 ring-white/20 hover:ring-[#CFFF16]/60 hover:scale-105 transition-[transform,box-shadow] cursor-pointer'
        }
        style={
          isExpanded
            ? isMobile
              ? {
                  left: '50%',
                  top: '50%',
                  x: '-50%',
                  y: '-50%',
                  width: 'min(92vw, calc(80vh * 9 / 16))',
                  aspectRatio: '9 / 16',
                }
              : {
                  bottom: 16,
                  left: 16,
                  width: 'min(280px, 22vw)',
                  aspectRatio: '9 / 16',
                }
            : undefined
        }
      >
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          autoPlay
          loop
          playsInline
          muted
          controls={isExpanded}
          preload="auto"
          className={
            isExpanded
              ? 'w-full h-full object-contain bg-black'
              : 'w-full h-full object-cover'
          }
        />

        {!isExpanded && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full ring-2 ring-[#CFFF16]/40 animate-ping pointer-events-none opacity-60"
          />
        )}

        <button
          type="button"
          aria-label={isExpanded ? 'Close video' : 'Close intro video'}
          onClick={(e) => {
            e.stopPropagation();
            if (isExpanded) setIsExpanded(false);
            else setIsClosed(true);
          }}
          className={
            isExpanded
              ? 'absolute top-2 right-2 w-8 h-8 rounded-full bg-black/80 hover:bg-black border border-white/30 text-white flex items-center justify-center z-10'
              : 'absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/85 hover:bg-black border border-white/30 text-white flex items-center justify-center cursor-pointer z-10'
          }
        >
          <X className={isExpanded ? 'w-4 h-4' : 'w-3 h-3'} />
        </button>
      </motion.div>
    </>
  );
}
