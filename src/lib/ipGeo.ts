let cache: string | null | undefined = undefined;

export async function getGeoCountry(): Promise<string | null> {
  if (cache !== undefined) return cache;
  try {
    const res = await fetch('/api/ipgeo', { headers: { accept: 'application/json' } });
    const data = await res.json();
    cache = (data?.country as string | null) ?? null;
  } catch {
    cache = null;
  }
  return cache;
}
