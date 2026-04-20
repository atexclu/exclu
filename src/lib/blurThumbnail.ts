/**
 * Client-side blurred thumbnail generator used by the public feed.
 *
 * Rendered on upload, stored at <original-path>/preview/blur.jpg. The public
 * feed serves ONLY this tiny blurred JPEG to non-subscribed viewers so the
 * full-resolution source URL is never exposed (even through devtools /
 * "view source"). Subscribed viewers receive a signed URL to the original.
 *
 * Design notes:
 *  - Output: 64px wide JPEG, quality 0.6 → ~2-4 KB per asset.
 *  - The downscale itself destroys detail. The CSS layer on top (blur-2xl +
 *    brightness-50) just adds cinematic atmosphere.
 *  - For videos we grab a frame at t=0.1s via a hidden <video> element.
 *  - Always resolves — failures return `null` so the upload still succeeds;
 *    the feed falls back to a solid gradient.
 */

const THUMB_WIDTH = 64;
const THUMB_MIME = 'image/jpeg';
const THUMB_QUALITY = 0.6;

function drawToCanvas(source: CanvasImageSource, srcW: number, srcH: number): HTMLCanvasElement {
  const ratio = srcH / Math.max(srcW, 1);
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = Math.max(1, Math.round(THUMB_WIDTH * ratio));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // Light blur on the source before drawing — some browsers respect ctx.filter
  // (Chromium, Firefox); Safari ignores it silently but the downscale alone
  // is enough.
  ctx.filter = 'blur(4px)';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), THUMB_MIME, THUMB_QUALITY));
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
  await img.decode().catch(() => { /* safari sometimes resolves via onload */ });
  if (!img.complete || !img.naturalWidth) {
    await new Promise((res, rej) => {
      img.onload = () => res(null);
      img.onerror = rej;
    });
  }
  const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
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

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        // Some browsers need a tiny seek to actually paint the first frame.
        video.currentTime = Math.min(0.1, video.duration || 0.1);
      };
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('Unable to read video'));
      // Hard ceiling so we don't hang the upload if metadata never arrives.
      setTimeout(() => reject(new Error('Video metadata timeout')), 8000);
    });

    const canvas = drawToCanvas(video, video.videoWidth, video.videoHeight);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Produce a tiny blurred JPEG from an image OR video file.
 * Returns null on any failure so callers can continue the upload without UX impact.
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
