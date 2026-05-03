import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';

/**
 * Suggestions rendered at the bottom of the public creator profile feed.
 *
 * Sort mirrors /directory/creators:
 *   1. Pro creators first
 *   2. Then by profile_view_count desc
 *   3. Current creator excluded
 *
 * We fetch creator_profiles + profiles in two separate queries (rather than
 * a PostgREST FK join) — the FK name varies across deployments and a missing
 * hint silently returns null, which would hide every "Pro" badge.
 */
interface SuggestedCreator {
  profileId: string;
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isPremium: boolean;
  viewCount: number;
}

interface SuggestedCreatorsStripProps {
  excludeUserId: string | null;
  gradientStops: [string, string];
}

export function SuggestedCreatorsStrip({ excludeUserId, gradientStops }: SuggestedCreatorsStripProps) {
  const navigate = useNavigate();
  const [creators, setCreators] = useState<SuggestedCreator[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);

      // Read v_directory_creators (which already exposes is_premium and the
      // curated display_rank/position) so suggestions respect Louna's pinning
      // and the same display_rank → position → views comparator the directory
      // page uses. PostgREST caps at 1000 rows server-side, so we fetch the
      // first 1000 ordered by creator_profile_id, then sort + take top 40
      // client-side. Featured creators always score display_rank=1 so they
      // make it into the top 40 regardless of where their UUID sorts.
      const { data: profiles, error: cpErr } = await supabase
        .from('v_directory_creators')
        .select('creator_profile_id, user_id, username, display_name, avatar_url, profile_view_count, created_at, is_premium, is_featured, position, is_hidden_for_category, display_rank')
        .is('category', null)
        .eq('is_hidden_for_category', false)
        .order('creator_profile_id', { ascending: true });

      if (cpErr || !profiles) {
        if (!cancelled) {
          setCreators([]);
          setIsLoading(false);
        }
        return;
      }

      const sorted = profiles
        .filter((r: any) => !!r.username && r.user_id !== excludeUserId)
        .sort((a: any, b: any) => {
          if (a.display_rank !== b.display_rank) return a.display_rank - b.display_rank;
          const aPos = a.position == null ? Number.POSITIVE_INFINITY : a.position;
          const bPos = b.position == null ? Number.POSITIVE_INFINITY : b.position;
          if (aPos !== bPos) return aPos - bPos;
          const dv = (b.profile_view_count ?? 0) - (a.profile_view_count ?? 0);
          if (dv !== 0) return dv;
          const ad = a.created_at ? Date.parse(a.created_at) : 0;
          const bd = b.created_at ? Date.parse(b.created_at) : 0;
          return bd - ad;
        })
        .slice(0, 40);

      const mapped: SuggestedCreator[] = sorted.map((r: any) => ({
        profileId: r.creator_profile_id,
        userId: r.user_id,
        handle: r.username,
        displayName: r.display_name || r.username,
        avatarUrl: r.avatar_url,
        isPremium: !!r.is_premium,
        viewCount: r.profile_view_count ?? 0,
      }));

      if (!cancelled) {
        setCreators(mapped);
        setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [excludeUserId]);

  const ordered = useMemo(() => {
    const premium = creators.filter((c) => c.isPremium);
    const free = creators.filter((c) => !c.isPremium);
    return [...premium, ...free];
  }, [creators]);

  if (isLoading) {
    return (
      <section className="mt-12">
        <div className="flex items-end justify-between gap-4 mb-5 px-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Discovery</p>
            <h3 className="text-xl font-bold text-white/50 mt-1">You might also like</h3>
          </div>
        </div>
        <div className="flex items-center gap-3 overflow-hidden pb-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-64 w-44 flex-shrink-0 rounded-3xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (ordered.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between gap-4 mb-5 px-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">Discovery</p>
          <h3 className="text-xl font-bold text-white mt-1">You might also like</h3>
        </div>
      </div>

      <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-6">
          {ordered.map((c, idx) => (
            <motion.button
              key={c.profileId}
              type="button"
              onClick={() => navigate(`/${c.handle}`)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: Math.min(idx, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="group relative h-64 w-44 flex-shrink-0 snap-start overflow-hidden rounded-3xl border border-white/10 bg-black text-left shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]"
            >
              {c.avatarUrl ? (
                <img
                  src={c.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                  draggable={false}
                />
              ) : (
                <div
                  className="h-full w-full"
                  style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
                />
              )}

              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/80 to-transparent" />

              {c.isPremium && (
                <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: gradientStops[0] }} />
                  Pro
                </span>
              )}

              <div className="absolute inset-x-4 bottom-4">
                <p className="truncate text-sm font-bold text-white">@{c.handle}</p>
                <span
                  className="mt-2 inline-flex w-full items-center justify-center rounded-full py-1.5 text-[11px] font-bold text-black transition-transform group-hover:scale-[1.02]"
                  style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
                >
                  Discover
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
