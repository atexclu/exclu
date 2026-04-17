// Shared helpers for avatar / creator image cropping.
//
// Why this exists: `ctx.drawImage(HTMLImageElement, ...)` on Chromium uploads
// the source image as a single GPU texture. When the source dimensions exceed
// the device's max texture size (typically 4096 px on low-end Android and old
// PC iGPUs), Chrome silently produces a black canvas — no error, no warning.
// The resulting JPEG is a valid-but-black file, which uploads correctly and
// displays as a black square for the user. WebKit (iOS/macOS Safari) handles
// large images via a CPU pre-scale path and is not affected.
//
// Fix: do the decode / crop / resize through `createImageBitmap(blob, sx, sy,
// sw, sh, { resizeWidth, resizeHeight })`. The browser handles oversized
// sources natively without the single-texture constraint.

import type { Area } from 'react-easy-crop';

// Cropper source is pre-downscaled below this on selection so nothing
// downstream ever touches an oversized texture.
export const CROPPER_MAX_SOURCE_DIMENSION = 2048;
// Final square avatar size. 1024 is plenty for retina display and keeps the
// uploaded blob well under 500 kB at JPEG quality 0.92.
export const AVATAR_OUTPUT_SIZE = 1024;
// Cropped blobs smaller than this almost certainly mean the canvas produced
// a black/empty image. Caller should treat this as an error.
export const MIN_VALID_CROPPED_BLOB_BYTES = 2048;

async function loadBlobFromUrl(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
  return res.blob();
}

export async function downscaleIfNeeded(file: Blob, maxDimension: number): Promise<Blob> {
  const probe = await createImageBitmap(file);
  const { width, height } = probe;
  probe.close?.();
  if (width <= maxDimension && height <= maxDimension) return file;

  const scale = Math.min(maxDimension / width, maxDimension / height);
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const resized = await createImageBitmap(file, {
    resizeWidth: targetW,
    resizeHeight: targetH,
    resizeQuality: 'high',
  });

  const canvas = document.createElement('canvas');
  canvas.width = resized.width;
  canvas.height = resized.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(resized, 0, 0);
  resized.close?.();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('downscale_to_blob_failed'));
    }, 'image/jpeg', 0.92);
  });
}

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  outputSize: number = AVATAR_OUTPUT_SIZE,
): Promise<Blob> {
  const sourceBlob = await loadBlobFromUrl(imageSrc);

  const sx = Math.max(0, Math.round(pixelCrop.x));
  const sy = Math.max(0, Math.round(pixelCrop.y));
  const sw = Math.max(1, Math.round(pixelCrop.width));
  const sh = Math.max(1, Math.round(pixelCrop.height));
  const targetSize = Math.min(sw, outputSize);

  const bitmap = await createImageBitmap(sourceBlob, sx, sy, sw, sh, {
    resizeWidth: targetSize,
    resizeHeight: targetSize,
    resizeQuality: 'high',
  });

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas_to_blob_failed'));
    }, 'image/jpeg', 0.92);
  });
}
