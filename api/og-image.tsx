import { ImageResponse } from '@vercel/og';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG53ZXpldGpsYndsdHljY2tzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTcyNjcsImV4cCI6MjA4Mzg3MzI2N30.BwE47MEU7KVm3NWXbX7hK1osCc00dQ0s8Y0Qudh5eyE';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const type = (req.query.type as string) || 'profile';
    const handle = req.query.handle as string;
    const slug = req.query.slug as string;

    let avatarUrl: string | null = null;
    let bgImage: string;

    if (type === 'profile' && handle) {
      bgImage = 'https://exclu.at/og-profile-default.png';
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
      bgImage = 'https://exclu.at/og-link-default.png';
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
      bgImage = 'https://exclu.at/og-profile-default.png';
    }

    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            position: 'relative',
          }}
        >
          {/* Background image */}
          <img
            src={bgImage}
            width={1200}
            height={630}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '1200px',
              height: '630px',
              objectFit: 'cover',
            }}
          />

          {/* Creator avatar overlay in top-right corner */}
          {avatarUrl && (
            <div
              style={{
                position: 'absolute',
                top: '30px',
                right: '30px',
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '4px solid rgba(255, 255, 255, 0.9)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                display: 'flex',
              }}
            >
              <img
                src={avatarUrl}
                width={120}
                height={120}
                style={{
                  width: '120px',
                  height: '120px',
                  objectFit: 'cover',
                }}
              />
            </div>
          )}
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );

    // Convert the ImageResponse to a buffer and send via Vercel Node response
    const buffer = await imageResponse.arrayBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=86400');
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('OG image generation error:', error);
    // Fallback: redirect to static default image
    const type = (req.query.type as string) || 'profile';
    const fallback = type === 'link'
      ? 'https://exclu.at/og-link-default.png'
      : 'https://exclu.at/og-profile-default.png';
    res.writeHead(302, { Location: fallback });
    return res.end();
  }
}
