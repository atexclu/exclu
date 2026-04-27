import { supabase } from './supabaseClient';

const BUCKET = 'paid-content';
const BUCKET_PREFIX = `${BUCKET}/`;

export async function getSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  // Try the stored path verbatim first. Legacy uploads (CreateLink, EditLink,
  // Onboarding, CreatorTipsRequests) prefixed the bucket name into the object
  // name itself, so the file actually lives at `paid-content/paid-content/…`
  // and signing must include the redundant prefix.
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (!error && data?.signedUrl) return data.signedUrl;

  // Fallback: strip a leading `paid-content/` (covers any normalization drift
  // between code paths).
  if (storagePath.startsWith(BUCKET_PREFIX)) {
    const stripped = storagePath.slice(BUCKET_PREFIX.length);
    const { data: data2 } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(stripped, expiresIn);
    return data2?.signedUrl ?? null;
  }

  return null;
}
