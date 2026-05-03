import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session?.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);

      // Server-side ORDER BY on the curation comparator + LIMIT, so PostgREST
      // returns exactly the curated top-N (~21 to absorb excludeUserId without
      // losing the 20th slot) instead of pulling thousands of rows just to
      // filter client-side. Mirrors /directory/creators ordering.
      const { data: profiles, error: cpErr } = await supabase
        .from('v_directory_creators')
        .select('creator_profile_id, user_id, username, display_name, avatar_url, profile_view_count, is_premium')
        .is('category', null)
        .eq('is_hidden_for_category', false)
        .order('display_rank', { ascending: true })
        .order('position', { ascending: true, nullsFirst: false })
        .order('profile_view_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(21);

      if (cpErr || !profiles) {
        if (!cancelled) {
          setCreators([]);
          setIsLoading(false);
        }
        return;
      }

      const mapped: SuggestedCreator[] = profiles
        .filter((r: any) => !!r.username && r.user_id !== excludeUserId)
        .slice(0, 20)
        .map((r: any) => ({
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

  const ordered = creators;
  const seeMoreHref = isAuthenticated ? '/fan?tab=favorites' : '/directory/creators';

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

          {/* See more card — routes to /fan favorites if logged in, else /directory/creators */}
          <motion.button
            type="button"
            onClick={() => navigate(seeMoreHref)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(ordered.length, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
            className="group relative h-64 w-44 flex-shrink-0 snap-start overflow-hidden rounded-3xl border border-dashed border-white/20 bg-black/30 text-left transition hover:border-white/40 hover:bg-black/50 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]"
          >
            <div
              className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity"
              style={{ background: `radial-gradient(circle at center, ${gradientStops[0]}33, transparent 65%)` }}
            />
            <div className="relative flex h-full w-full flex-col items-center justify-center px-4 text-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full mb-3"
                style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
              >
                <ArrowRight className="h-5 w-5 text-black" />
              </div>
              <p className="text-sm font-bold text-white">See more</p>
              <p className="mt-1 text-[11px] text-white/55">Browse all creators</p>
            </div>
          </motion.button>
        </div>
      </div>
    </section>
  );
}
