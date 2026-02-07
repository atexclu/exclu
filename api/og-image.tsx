import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG53ZXpldGpsYndsdHljY2tzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTcyNjcsImV4cCI6MjA4Mzg3MzI2N30.BwE47MEU7KVm3NWXbX7hK1osCc00dQ0s8Y0Qudh5eyE';

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

export default async function handler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'profile';
    const handle = searchParams.get('handle') || '';
    const slug = searchParams.get('slug') || '';

    let avatarUrl: string | null = null;
    let bgImageUrl: string;

    if (type === 'profile' && handle) {
      bgImageUrl = 'https://exclu.at/og-profile-default.png';
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?handle=eq.${encodeURIComponent(handle)}&select=avatar_url&limit=1`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      const profiles = await profileRes.json();
      avatarUrl = profiles?.[0]?.avatar_url || null;
    } else if (type === 'link' && slug) {
      bgImageUrl = 'https://exclu.at/og-link-default.png';
      const linkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/links?slug=eq.${encodeURIComponent(slug)}&select=creator_id&limit=1`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      const links = await linkRes.json();
      const creatorId = links?.[0]?.creator_id;
      if (creatorId) {
        const profileRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(creatorId)}&select=avatar_url&limit=1`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        );
        const profiles = await profileRes.json();
        avatarUrl = profiles?.[0]?.avatar_url || null;
      }
    } else {
      bgImageUrl = 'https://exclu.at/og-profile-default.png';
    }

    // Fetch images as data URLs so Satori can render them
    const [bgDataUrl, avatarDataUrl] = await Promise.all([
      fetchImageAsDataUrl(bgImageUrl),
      avatarUrl ? fetchImageAsDataUrl(avatarUrl) : Promise.resolve(null),
    ]);

    // If we can't load the background, redirect to static fallback
    if (!bgDataUrl) {
      const fallback = type === 'link'
        ? 'https://exclu.at/og-link-default.png'
        : 'https://exclu.at/og-profile-default.png';
      return Response.redirect(fallback, 302);
    }

    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            position: 'relative',
          }}
        >
          <img
            src={bgDataUrl}
            width={1200}
            height={630}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '1200px',
              height: '630px',
            }}
          />

          {avatarDataUrl ? (
            <div
              style={{
                position: 'absolute',
                top: '30px',
                right: '30px',
                width: '120px',
                height: '120px',
                borderRadius: '60px',
                border: '4px solid rgba(255, 255, 255, 0.9)',
                display: 'flex',
                overflow: 'hidden',
              }}
            >
              <img
                src={avatarDataUrl}
                width={120}
                height={120}
                style={{
                  width: '120px',
                  height: '120px',
                }}
              />
            </div>
          ) : null}
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          'Cache-Control': 'public, s-maxage=86400, max-age=86400',
        },
      }
    );
  } catch (error) {
    console.error('OG image generation error:', error);
    const type = new URL(req.url).searchParams.get('type') || 'profile';
    const fallback = type === 'link'
      ? 'https://exclu.at/og-link-default.png'
      : 'https://exclu.at/og-profile-default.png';
    return Response.redirect(fallback, 302);
  }
}
