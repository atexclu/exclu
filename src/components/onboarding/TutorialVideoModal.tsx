/**
 * TutorialVideoModal
 *
 * Fullscreen-ish popup that plays the onboarding tutorial video. Triggered
 * from any step of the onboarding flow via the "Watch tutorial video" CTA.
 * Auto-plays on open. The user can close with the X button or by clicking
 * the backdrop.
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import tutorialVideo from '@/assets/onboarding/tutorial.mp4';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TutorialVideoModal({ open, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (!v) return;
    // Reset to start on each open + try to autoplay. Browsers may block
    // autoplay with sound; we fall back to muted+autoplay if needed so the
    // video at least starts (the user can unmute via the controls bar).
    v.currentTime = 0;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {
        // last resort — leave it paused; the user can hit play in the
        // native controls.
      });
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial video"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        aria-label="Close tutorial"
      >
        <X className="w-5 h-5" />
      </button>
      <div
        className="w-full max-w-4xl aspect-video rounded-2xl overflow-hidden shadow-2xl bg-black"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          src={tutorialVideo}
          controls
          autoPlay
          playsInline
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
