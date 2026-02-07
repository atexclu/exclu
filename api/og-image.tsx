import { ImageResponse } from '@vercel/og';
import type { VercelRequest } from '@vercel/node';

export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = 'https://qexnwezetjlbwltyccks.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG53ZXpldGpsYndsdHljY2tzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTcyNjcsImV4cCI6MjA4Mzg3MzI2N30.BwE47MEU7KVm3NWXbX7hK1osCc00dQ0s8Y0Qudh5eyE';

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'default';
  const handle = searchParams.get('handle') || '';
  const slug = searchParams.get('slug') || '';

  try {
    if (type === 'profile' && handle) {
      return await generateProfileImage(handle);
    }

    if (type === 'link' && slug) {
      return await generateLinkImage(slug);
    }

    return await generateDefaultImage();
  } catch (error) {
    console.error('OG image generation error:', error);
    return await generateDefaultImage();
  }
}

async function generateProfileImage(handle: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?handle=eq.${encodeURIComponent(handle)}&select=display_name,handle,bio,avatar_url&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );
  const profiles = await res.json();
  const profile = profiles?.[0];

  const displayName = profile?.display_name || handle;
  const bio = profile?.bio || 'Check out my exclusive content';
  const avatarUrl = profile?.avatar_url || null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200',
          height: '630',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000000',
          fontFamily: 'sans-serif',
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            width={160}
            height={160}
            style={{
              borderRadius: '50%',
              objectFit: 'cover',
              marginBottom: '30px',
              border: '4px solid #22C55E',
            }}
          />
        ) : (
          <div
            style={{
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              backgroundColor: '#1a1a2e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '30px',
              border: '4px solid #22C55E',
              fontSize: '64px',
              color: '#22C55E',
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
          }}
        >
          {displayName}
        </div>

        <div
          style={{
            fontSize: '24px',
            color: '#A0A0B0',
            marginBottom: '40px',
            maxWidth: '800px',
            textAlign: 'center',
            display: 'flex',
          }}
        >
          {bio.length > 100 ? bio.substring(0, 100) + '...' : bio}
        </div>

        <div
          style={{
            fontSize: '20px',
            color: '#22C55E',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          Check out my Exclu profile
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: '30px',
            right: '40px',
            fontSize: '24px',
            fontWeight: 700,
            color: '#FFFFFF',
            opacity: 0.6,
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
    }
  );
}

async function generateLinkImage(slug: string) {
  // Fetch link data
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

  const title = link?.title || 'Exclusive Content';
  const description = link?.description || 'Unlock exclusive content on Exclu';

  // Fetch creator avatar if we have creator_id
  let avatarUrl: string | null = null;
  let creatorName = '';
  if (link?.creator_id) {
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(link.creator_id)}&select=display_name,handle,avatar_url&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    const profiles = await profileRes.json();
    const profile = profiles?.[0];
    avatarUrl = profile?.avatar_url || null;
    creatorName = profile?.display_name || profile?.handle || '';
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200',
          height: '630',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #8B1874 0%, #C2185B 50%, #4A0E3F 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {avatarUrl && (
          <img
            src={avatarUrl}
            width={100}
            height={100}
            style={{
              borderRadius: '50%',
              objectFit: 'cover',
              marginBottom: '20px',
              border: '3px solid rgba(255,255,255,0.5)',
            }}
          />
        )}

        {creatorName && (
          <div
            style={{
              fontSize: '22px',
              color: 'rgba(255,255,255,0.8)',
              marginBottom: '16px',
              display: 'flex',
            }}
          >
            by {creatorName}
          </div>
        )}

        <div
          style={{
            fontSize: '52px',
            fontWeight: 700,
            color: '#FFFFFF',
            marginBottom: '16px',
            maxWidth: '900px',
            textAlign: 'center',
            display: 'flex',
          }}
        >
          {title.length > 50 ? title.substring(0, 50) + '...' : title}
        </div>

        <div
          style={{
            fontSize: '24px',
            color: 'rgba(255,255,255,0.8)',
            marginBottom: '40px',
            maxWidth: '800px',
            textAlign: 'center',
            display: 'flex',
          }}
        >
          {description.length > 120 ? description.substring(0, 120) + '...' : description}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFFFFF',
            color: '#8B1874',
            fontSize: '24px',
            fontWeight: 700,
            padding: '14px 40px',
            borderRadius: '9999px',
          }}
        >
          Unlock now on Exclu
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: '30px',
            right: '40px',
            fontSize: '24px',
            fontWeight: 700,
            color: '#FFFFFF',
            opacity: 0.6,
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
    }
  );
}

async function generateDefaultImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200',
          height: '630',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000000',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            fontSize: '56px',
            fontWeight: 700,
            color: '#FFFFFF',
            marginBottom: '20px',
            display: 'flex',
          }}
        >
          Exclu
        </div>
        <div
          style={{
            fontSize: '28px',
            color: '#A0A0B0',
            display: 'flex',
          }}
        >
          Your Content. Your Revenue. No Middleman.
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
