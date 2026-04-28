/**
 * AdaptiveVideo
 *
 * Drop-in <video> replacement that auto-fits its container's aspect ratio
 * to the video's intrinsic dimensions (vertical phone video → 9/16 frame,
 * landscape camera → 16/9, square → 1/1, etc.). No more letterboxing or
 * pillarboxing for video uploads in fixed 16/9 boxes.
 *
 * Use this anywhere a video is displayed at full size — paid content
 * unlock pages, creator content library, fan dashboard previews, chat
 * media bubbles. Tiny thumbnails (mosaic grids, picker cards) should
 * stay on `object-cover` because cropping is fine at small sizes.
 *
 * The aspect is `null` until the browser fires `loadedmetadata`. While
 * loading we render a 16/9 box (most common case) so layout doesn't jump
 * when most videos are landscape; if the loaded video is portrait the
 * frame snaps once when the metadata event fires.
 */

import { useRef, useState, type VideoHTMLAttributes, forwardRef, useImperativeHandle } from 'react';

interface Props extends VideoHTMLAttributes<HTMLVideoElement> {
  /** Optional CSS classes added to the outer wrapper. Use this for
   *  border/rounded/shadow styles — the wrapper is the visual frame. */
  containerClassName?: string;
  /** Max height of the player (defaults to 80vh so portrait videos don't
   *  overflow off-screen). */
  maxHeight?: string;
}

export const AdaptiveVideo = forwardRef<HTMLVideoElement, Props>(function AdaptiveVideo(
  { containerClassName = '', maxHeight = '80vh', className = '', onLoadedMetadata, ...videoProps },
  ref,
) {
  const innerRef = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLVideoElement);
  const [aspect, setAspect] = useState<number | null>(null);

  return (
    <div
      className={`relative w-full bg-black overflow-hidden ${containerClassName}`}
      style={{
        aspectRatio: aspect ?? 16 / 9,
        maxHeight,
      }}
    >
      <video
        ref={innerRef}
        {...videoProps}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            setAspect(v.videoWidth / v.videoHeight);
          }
          onLoadedMetadata?.(e);
        }}
        className={`w-full h-full object-contain ${className}`}
      />
    </div>
  );
});
