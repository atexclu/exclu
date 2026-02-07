import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG53ZXpldGpsYndsdHljY2tzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTcyNjcsImV4cCI6MjA4Mzg3MzI2N30.BwE47MEU7KVm3NWXbX7hK1osCc00dQ0s8Y0Qudh5eyE';

export default async function handler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'profile';
    const handle = searchParams.get('handle') || '';
    const slug = searchParams.get('slug') || '';

    let displayName = '';
    let subtitle = '';
    let avatarUrl: string | null = null;

    if (type === 'profile' && handle) {
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?handle=eq.${encodeURIComponent(handle)}&select=display_name,handle,bio,avatar_url&limit=1`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      const profiles = await profileRes.json();
      const profile = profiles?.[0];
      displayName = profile?.display_name || profile?.handle || handle;
      subtitle = profile?.bio || 'Check out my exclusive content';
      avatarUrl = profile?.avatar_url || null;
    } else if (type === 'link' && slug) {
      const linkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/links?slug=eq.${encodeURIComponent(slug)}&select=title,description,creator_id&limit=1`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );
      const links = await linkRes.json();
      const link = links?.[0];
      displayName = link?.title || 'Exclusive Content';
      subtitle = link?.description || 'Unlock exclusive content on Exclu';

      if (link?.creator_id) {
        const profileRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(link.creator_id)}&select=avatar_url,display_name&limit=1`,
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
    }

    const isProfile = type === 'profile';
    const bgGradient = isProfile
      ? 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)'
      : 'linear-gradient(135deg, #8B1874 0%, #C2185B 50%, #4A0E3F 100%)';
    const accentColor = isProfile ? '#22C55E' : '#FFFFFF';

    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: bgGradient,
            fontFamily: 'sans-serif',
            position: 'relative',
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              width={140}
              height={140}
              style={{
                borderRadius: '70px',
                border: `4px solid ${accentColor}`,
                marginBottom: '24px',
              }}
            />
          ) : (
            <div
              style={{
                width: '140px',
                height: '140px',
                borderRadius: '70px',
                backgroundColor: isProfile ? '#1a1a2e' : 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '24px',
                border: `4px solid ${accentColor}`,
                fontSize: '56px',
                color: accentColor,
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <div
            style={{
              fontSize: '48px',
              fontWeight: 700,
              color: '#FFFFFF',
              marginBottom: '12px',
              display: 'flex',
              maxWidth: '900px',
              textAlign: 'center',
            }}
          >
            {displayName.length > 40 ? displayName.substring(0, 40) + '...' : displayName}
          </div>

          <div
            style={{
              fontSize: '24px',
              color: 'rgba(255,255,255,0.7)',
              marginBottom: '32px',
              maxWidth: '800px',
              textAlign: 'center',
              display: 'flex',
            }}
          >
            {subtitle.length > 100 ? subtitle.substring(0, 100) + '...' : subtitle}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isProfile ? '#22C55E' : '#FFFFFF',
              color: isProfile ? '#000000' : '#8B1874',
              fontSize: '22px',
              fontWeight: 700,
              padding: '12px 36px',
              borderRadius: '9999px',
            }}
          >
            {isProfile ? 'View Exclu Profile' : 'Unlock now on Exclu'}
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: '24px',
              right: '36px',
              fontSize: '22px',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.4)',
              display: 'flex',
            }}
          >
            exclu.at
          </div>
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
