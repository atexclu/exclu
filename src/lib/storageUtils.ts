import { supabase } from './supabaseClient';

const BUCKET = 'paid-content';
const BUCKET_PREFIX = `${BUCKET}/`;

// Single-path version. Tries the path verbatim first (covers legacy uploads
// where the bucket name was baked into the object name), then strips the
// leading `paid-content/` as a safety net for any future drift.
export async function getSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (!error && data?.signedUrl) return data.signedUrl;

  if (storagePath.startsWith(BUCKET_PREFIX)) {
    const { data: data2 } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath.slice(BUCKET_PREFIX.length), expiresIn);
    return data2?.signedUrl ?? null;
  }
  return null;
}

// Batch version — one network round-trip for N paths via Supabase's native
// `createSignedUrls`. Falls back to the stripped path on a per-row basis.
export async function getSignedUrls(
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  if (paths.length === 0) return out;
  const unique = Array.from(new Set(paths.filter(Boolean)));

  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unique, expiresIn);

  const remaining: string[] = [];
  for (const row of data ?? []) {
    if (row.error || !row.signedUrl) {
      remaining.push(row.path ?? '');
    } else {
      out[row.path ?? ''] = row.signedUrl;
    }
  }

  // Retry the failures with the stripped prefix in a single batched call.
  const stripCandidates = remaining
    .filter((p) => p && p.startsWith(BUCKET_PREFIX))
    .map((p) => ({ original: p, stripped: p.slice(BUCKET_PREFIX.length) }));

  if (stripCandidates.length > 0) {
    const { data: data2 } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(stripCandidates.map((c) => c.stripped), expiresIn);
    const byStripped = new Map((data2 ?? []).map((r) => [r.path, r.signedUrl]));
    for (const c of stripCandidates) {
      out[c.original] = byStripped.get(c.stripped) ?? null;
    }
  }

  for (const p of remaining) {
    if (!(p in out)) out[p] = null;
  }
  return out;
}
