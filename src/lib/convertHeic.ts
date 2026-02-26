import heic2any from 'heic2any';

/**
 * If the file is HEIC/HEIF, converts it to JPEG and returns the new File.
 * Otherwise returns the original file unchanged.
 */
export async function maybeConvertHeic(file: File): Promise<File> {
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif');

  if (!isHeic) return file;

  try {
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9,
    });

    const blob = Array.isArray(converted) ? converted[0] : converted;
    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch (err) {
    console.error('[convertHeic] Conversion failed, using original file:', err);
    return file;
  }
}
