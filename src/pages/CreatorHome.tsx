/**
 * CreatorHome — /app/home
 *
 * Creator-only page that renders a faithful in-app preview of the creator's
 * own public profile (`/:handle`). Reuses CreatorPublic in embed mode so that
 * any future change to the public profile (layout, feed mechanics, CTAs)
 * automatically applies here too — no duplicated rendering code.
 *
 * Resolution order for the handle to display:
 *   1. activeProfile.username from ProfileContext (multi-profile / agency case)
 *   2. profiles.handle of the signed-in user (single-profile creator)
 *
 * If neither resolves, we render a small empty state nudging the user to
 * complete their profile rather than dead-ending in /:handle's "creator not
 * found" page.
 */
import { useEffect, useState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useProfiles } from '@/contexts/ProfileContext';
import CreatorPublic from './CreatorPublic';

const CreatorHome = () => {
  const { activeProfile, isLoading: profileLoading } = useProfiles();
  const [fallbackHandle, setFallbackHandle] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  // Fall back to profiles.handle when ProfileContext didn't surface a
  // creator_profiles row (older accounts, single-profile creators that haven't
  // been migrated to the multi-profile model).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (activeProfile?.username) {
        if (!cancelled) {
          setFallbackHandle(null);
          setResolving(false);
        }
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setResolving(false);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('handle')
        .eq('id', user.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!cancelled) {
        setFallbackHandle(profile?.handle ?? null);
        setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile?.username]);

  const handle = activeProfile?.username ?? fallbackHandle;

  if (profileLoading || resolving) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!handle) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2">Set your handle to see your home</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Your home page mirrors your public profile. You'll need a handle before
            we can render it.
          </p>
          <Link
            to="/app/profile"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#CFFF16] px-4 py-2 text-sm font-bold text-black hover:bg-[#CFFF16]/90 transition-colors"
          >
            Go to profile editor
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  // CreatorPublic forces dark mode on mount — fine for /app/home too since
  // the public preview is meant to look identical to what fans see.
  return <CreatorPublic handleOverride={handle} embed />;
};

export default CreatorHome;
