/**
 * Client-side blurred preview generator for the public feed.
 *
 * Produces a ~512px-wide JPEG with heavy gaussian blur baked in — not a
 * cosmetic CSS filter. The file served to non-subscribed viewers IS this
 * blurred image; the full-resolution source never leaves storage for
 * locked posts, so "view source" / devtools can never recover the
 * unblurred content.
 *
 * The size + blur radius are tuned so the composition (color palette,
 * subject pose, rough framing) remains readable — enough to tease the
 * click but not enough to reconstruct detail. Same bar LinkMe / Unlockt
 * set.
 *
 * Every failure path resolves to `null` so the upload never blocks on
 * preview generation.
 */

const TARGET_W = 512;           // px — blurred JPEG width
const BLUR_RADIUS = 28;          // canvas 'blur(...)' radius
const OVERSCAN = 48;             // px — absorbs edge artefacts so the final
                                 // crop stays clean after blur
const OUTPUT_MIME = 'image/jpeg';
const OUTPUT_QUALITY = 0.7;      // good-looking at the target size, ~30-60 KB

/**
 * Draws `source` into a canvas with a heavy gaussian blur baked in.
 * Keeps aspect ratio and crops the oversized blurred canvas back down
 * so we don't ship the soft edges to the final JPEG.
 */
function renderBlurred(source: CanvasImageSource, srcW: number, srcH: number): HTMLCanvasElement {
  const aspect = srcH / Math.max(srcW, 1);
  const targetW = TARGET_W;
  const targetH = Math.max(1, Math.round(targetW * aspect));

  // Pass 1 — render on an oversized canvas with the blur filter.
  const work = document.createElement('canvas');
  work.width = targetW + OVERSCAN * 2;
  work.height = targetH + OVERSCAN * 2;
  const wctx = work.getContext('2d', { alpha: false });
  if (!wctx) throw new Error('Canvas 2D context unavailable');
  wctx.fillStyle = '#000';
  wctx.fillRect(0, 0, work.width, work.height);
  wctx.filter = `blur(${BLUR_RADIUS}px)`;
  // Draw the full source to fill the canvas (including the overscan), so the
  // blur has actual pixels to work with around the crop region.
  wctx.drawImage(source, 0, 0, work.width, work.height);
  wctx.filter = 'none';

  // Pass 2 — crop the clean interior. This gives us a tight final image
  // with no feathered edges.
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const octx = out.getContext('2d', { alpha: false });
  if (!octx) throw new Error('Canvas 2D context unavailable');
  octx.drawImage(work, OVERSCAN, OVERSCAN, targetW, targetH, 0, 0, targetW, targetH);
  return out;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), OUTPUT_MIME, OUTPUT_QUALITY));
}

async function generateFromImage(file: File): Promise<Blob | null> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = new Image();
  img.decoding = 'async';
  img.src = dataUrl;
  // Safari sometimes rejects decode() for EXIF-rotated images; fall back to onload.
  await img.decode().catch(
    () =>
      new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Image decode failed'));
      }),
  );
  if (!img.naturalWidth) return null;
  const canvas = renderBlurred(img, img.naturalWidth, img.naturalHeight);
  return canvasToBlob(canvas);
}

async function generateFromVideo(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        // Seek slightly into the file so we grab a painted frame, not black.
        video.currentTime = Math.min(0.5, Math.max(0, (video.duration || 1) * 0.05));
      };
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('Video decode failed'));
      setTimeout(() => reject(new Error('Video metadata timeout')), 8000);
    });

    if (!video.videoWidth) return null;
    const canvas = renderBlurred(video, video.videoWidth, video.videoHeight);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Produce a heavily blurred JPEG preview from an image OR video file.
 * Resolves to `null` on any failure so callers never block the upload.
 */
export async function generateBlurThumbnail(file: File): Promise<Blob | null> {
  try {
    if (file.type.startsWith('video/')) return await generateFromVideo(file);
    if (file.type.startsWith('image/')) return await generateFromImage(file);
    return null;
  } catch (err) {
    console.warn('[blurThumbnail] generation failed — falling back to null', err);
    return null;
  }
}
