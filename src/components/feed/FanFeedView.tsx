import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { getSignedUrl } from '@/lib/storageUtils';
import { FeedPost, type FeedPostData } from '@/components/feed/FeedPost';
import { SubscriptionPopup } from '@/components/feed/SubscriptionPopup';
import { DiscoveryCarousel } from '@/components/feed/DiscoveryCarousel';
import { getAuroraGradient } from '@/lib/auroraGradients';

type CreatorEntry = {
  profileId: string;
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  gradientStops: [string, string];
  priceCents: number;
  isSubscribed: boolean;
};

type CompoundPost = {
  creator: CreatorEntry;
  post: FeedPostData;
  createdAt: string;
};

/**
 * Fan-side feed:
 *   - Merges public assets + published paid links from all creators the fan
 *     favourites or actively subscribes to.
 *   - Subscribed assets are unblurred (`isUnlocked=true`); unsubscribed ones
 *     are blurred with a Subscribe CTA (popup tied to the relevant creator).
 *   - Paid links stay blurred regardless — clicking routes to /l/:slug to buy.
 *   - Ends with the DiscoveryCarousel (Pro creators first, gender filter).
 *
 * Fetched once per mount. Inexpensive: a single N+1-free pass through assets
 * and links filtered by creator_profile_id IN (...).
 */
export function FanFeedView({ userId }: { userId: string | null }) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<CompoundPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [popupCreator, setPopupCreator] = useState<CreatorEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);

      // 1) Creators the fan cares about:
      //      a) favourites (fan_favorites.creator_id points to profiles.id)
      //      b) active / still-in-period subscriptions
      const [{ data: favs }, { data: subs }] = await Promise.all([
        supabase.from('fan_favorites').select('creator_id').eq('fan_id', userId),
        supabase
          .from('fan_creator_subscriptions')
          .select('creator_profile_id')
          .eq('fan_id', userId)
          .in('status', ['active', 'cancelled'])
          .gt('period_end', new Date().toISOString()),
      ]);

      const favUserIds: string[] = (favs ?? []).map((f: any) => f.creator_id);
      const subbedProfileIds = new Set<string>((subs ?? []).map((s: any) => s.creator_profile_id));

      // Resolve creator_profiles for favorited users so the feed uses profile-level data.
      const { data: favProfiles } = favUserIds.length
        ? await supabase
            .from('creator_profiles')
            .select('id, user_id, username, display_name, avatar_url, aurora_gradient, fan_subscription_price_cents')
            .in('user_id', favUserIds)
            .eq('is_active', true)
        : { data: [] as any[] };

      const profileIds = new Set<string>([
        ...((favProfiles ?? []).map((p: any) => p.id) as string[]),
        ...Array.from(subbedProfileIds),
      ]);

      if (profileIds.size === 0) {
        if (!cancelled) {
          setPosts([]);
          setIsLoading(false);
        }
        return;
      }

      const profileIdArr = Array.from(profileIds);

      // Bulk load profile meta for anything we don't already have
      const { data: allProfiles } = await supabase
        .from('creator_profiles')
        .select('id, user_id, username, display_name, avatar_url, aurora_gradient, fan_subscription_price_cents')
        .in('id', profileIdArr);

      const creatorByProfileId = new Map<string, CreatorEntry>();
      for (const p of (allProfiles ?? []) as any[]) {
        const gradient = getAuroraGradient(p.aurora_gradient || 'purple_dream');
        const stops = ((gradient?.colors ?? ['#7c3aed', '#ec4899']) as string[]).slice(0, 2) as [string, string];
        creatorByProfileId.set(p.id, {
          profileId: p.id,
          userId: p.user_id,
          handle: p.username ?? '',
          displayName: p.display_name || p.username || 'creator',
          avatarUrl: p.avatar_url ?? null,
          gradientStops: stops,
          priceCents: p.fan_subscription_price_cents ?? 500,
          isSubscribed: subbedProfileIds.has(p.id),
        });
      }

      // 2) Load posts — public assets + published paid links for those profiles
      const [{ data: assetRows }, { data: linkRows }] = await Promise.all([
        supabase
          .from('assets')
          .select('id, profile_id, creator_id, storage_path, mime_type, feed_caption, is_feed_preview, created_at')
          .in('profile_id', profileIdArr)
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('links')
          .select('id, profile_id, creator_id, slug, title, description, price_cents, created_at')
          .in('profile_id', profileIdArr)
          .eq('status', 'published')
          .eq('show_on_profile', true)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      // Sign URLs for each asset once; storage policy keeps signed URLs short-lived.
      const compound: CompoundPost[] = [];
      for (const a of (assetRows ?? []) as any[]) {
        const creator = a.profile_id ? creatorByProfileId.get(a.profile_id) : undefined;
        if (!creator) continue;
        const url = await getSignedUrl(a.storage_path);
        compound.push({
          creator,
          createdAt: a.created_at,
          post: {
            kind: 'asset',
            id: a.id,
            previewUrl: url,
            mimeType: a.mime_type,
            caption: a.feed_caption,
            isUnlocked: creator.isSubscribed || a.is_feed_preview === true,
          },
        });
      }
      for (const l of (linkRows ?? []) as any[]) {
        const creator = l.profile_id ? creatorByProfileId.get(l.profile_id) : undefined;
        if (!creator) continue;
        compound.push({
          creator,
          createdAt: l.created_at,
          post: {
            kind: 'link',
            id: l.id,
            slug: l.slug,
            title: l.title,
            description: l.description,
            priceCents: l.price_cents,
            coverUrl: null,
          },
        });
      }

      compound.sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));

      if (!cancelled) {
        setPosts(compound);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className="space-y-6 pb-20">
      {isLoading && (
        <div className="text-center text-sm text-muted-foreground py-12">Loading your feed…</div>
      )}

      {!isLoading && posts.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <p>Your feed is empty.</p>
          <p className="mt-1">Add a creator to your favourites or subscribe to unlock content.</p>
        </div>
      )}

      {!isLoading && posts.map(({ creator, post }) => (
        <article key={`${post.kind}-${post.id}`} className="space-y-2">
          <button
            type="button"
            onClick={() => navigate(`/${creator.handle}`)}
            className="flex items-center gap-2 text-foreground"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden border border-border">
              {creator.avatarUrl ? (
                <img src={creator.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted" />
              )}
            </div>
            <span className="text-sm font-semibold">{creator.displayName}</span>
            {creator.handle && <span className="text-xs text-muted-foreground">@{creator.handle}</span>}
          </button>
          <FeedPost
            post={post}
            gradientStops={creator.gradientStops}
            onLockedClick={() => setPopupCreator(creator)}
            onLinkClick={(slug) => navigate(`/l/${slug}`)}
          />
        </article>
      ))}

      <DiscoveryCarousel />

      {popupCreator && (
        <SubscriptionPopup
          open={!!popupCreator}
          onClose={() => setPopupCreator(null)}
          creator={{
            profileId: popupCreator.profileId,
            displayName: popupCreator.displayName,
            handle: popupCreator.handle,
            avatarUrl: popupCreator.avatarUrl,
            priceCents: popupCreator.priceCents,
          }}
          gradientStops={popupCreator.gradientStops}
        />
      )}
    </div>
  );
}
