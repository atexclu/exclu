import { supabase } from './supabaseClient';

/**
 * Generate a signed URL for an asset in the 'paid-content' bucket.
 * Handles the path prefix inconsistency: some storage_path values in DB
 * include 'paid-content/' prefix, some don't. This tries both variants.
 */
export async function getSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  // Try as-is first
  const { data, error } = await supabase.storage
    .from('paid-content')
    .createSignedUrl(storagePath, expiresIn);

  if (!error && data?.signedUrl) return data.signedUrl;

  // Fallback: try with/without 'paid-content/' prefix
  const alt = storagePath.startsWith('paid-content/')
    ? storagePath.slice('paid-content/'.length)
    : 'paid-content/' + storagePath;

  const { data: data2 } = await supabase.storage
    .from('paid-content')
    .createSignedUrl(alt, expiresIn);

  return data2?.signedUrl ?? null;
}
