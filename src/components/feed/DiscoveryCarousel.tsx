import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

type DiscoverCreator = {
  profileId: string;
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isPremium: boolean;
  gender: 'female' | 'male' | 'other' | null;
};

type GenderFilter = 'female' | 'male' | 'all';

/**
 * Horizontal carousel of recommended creators, rendered at the bottom of the
 * fan feed. Ranks profiles whose owner is on the Pro plan first (premium),
 * then free creators. Filterable by gender, default "Women" (per product spec).
 */
export function DiscoveryCarousel() {
  const navigate = useNavigate();
  const [creators, setCreators] = useState<DiscoverCreator[]>([]);
  const [filter, setFilter] = useState<GenderFilter>('female');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);

      // Join creator_profiles ← profiles on user_id to read is_creator_subscribed (Pro).
      const { data } = await supabase
        .from('creator_profiles')
        .select(`
          id, user_id, username, display_name, avatar_url, gender,
          profiles!creator_profiles_user_id_fkey ( is_creator_subscribed )
        `)
        .eq('is_active', true)
        .eq('is_directory_visible', true)
        .not('username', 'is', null)
        .limit(200);

      const mapped: DiscoverCreator[] = (data ?? [])
        .filter((row: any) => !!row.username)
        .map((row: any) => ({
          profileId: row.id,
          userId: row.user_id,
          handle: row.username,
          displayName: row.display_name || row.username,
          avatarUrl: row.avatar_url,
          isPremium: !!row.profiles?.is_creator_subscribed,
          gender: (row.gender ?? null) as DiscoverCreator['gender'],
        }));

      if (!cancelled) {
        setCreators(mapped);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const filtered = filter === 'all'
      ? creators
      : creators.filter((c) => c.gender === filter);
    // Premium first, free second; stable within each group.
    const premium = filtered.filter((c) => c.isPremium);
    const free = filtered.filter((c) => !c.isPremium);
    return [...premium, ...free];
  }, [creators, filter]);

  return (
    <section className="pt-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-foreground">Recommended creators</h3>
        <div className="flex rounded-full bg-muted p-1 text-[11px] font-medium">
          {(['female', 'male', 'all'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setFilter(opt)}
              className={`px-3 py-1 rounded-full transition-colors ${
                filter === opt ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {opt === 'female' ? 'Women' : opt === 'male' ? 'Men' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="text-xs text-muted-foreground text-center py-6">Loading…</div>
      )}

      {!isLoading && visible.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-6">No creators to show right now.</div>
      )}

      {!isLoading && visible.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory">
          {visible.map((c) => (
            <button
              key={c.profileId}
              type="button"
              onClick={() => navigate(`/${c.handle}`)}
              className="shrink-0 w-40 snap-start rounded-2xl border border-border bg-card p-3 flex flex-col items-center gap-3 hover:border-primary/50 transition-colors"
            >
              <div className={`w-24 h-24 rounded-full overflow-hidden border-2 ${c.isPremium ? 'border-primary' : 'border-border'}`}>
                {c.avatarUrl ? (
                  <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted" />
                )}
              </div>
              <div className="text-center w-full">
                <p className="text-sm font-semibold text-foreground truncate">@{c.handle}</p>
              </div>
              <span className="w-full text-center rounded-full py-1.5 text-xs font-semibold bg-emerald-500/15 text-emerald-500">
                Discover
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
