import { supabase } from './supabaseClient';

const BUCKET = 'paid-content';
const BUCKET_PREFIX = `${BUCKET}/`;

export async function getSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  const normalized = storagePath.startsWith(BUCKET_PREFIX)
    ? storagePath.slice(BUCKET_PREFIX.length)
    : storagePath;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(normalized, expiresIn);

  if (!error && data?.signedUrl) return data.signedUrl;

  if (normalized !== storagePath) {
    const { data: data2 } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresIn);
    return data2?.signedUrl ?? null;
  }

  return null;
}
