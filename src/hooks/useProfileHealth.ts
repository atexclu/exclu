import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { CreatorProfile } from '@/contexts/ProfileContext';

/**
 * Profile Health — onboarding completion tracker (gamification inspired by Fanspicy).
 *
 * Each step maps to a concrete data point already collected by the platform.
 * The hook computes their done/pending status, listens for live mutations
 * (Postgres CDC over Supabase Realtime), and emits `justCompletedStepId`
 * exactly once per (profileId, stepId) — used by the UI to auto-open the
 * dialog when the creator crosses a milestone.
 */

export type ProfileHealthStepId =
  | 'username'
  | 'avatar'
  | 'bio'
  | 'website'
  | 'socials'
  | 'subscription'
  | 'first_link'
  | 'feed_30';

/** The Link-in-Bio editor section keys (`activeSection` in LinkInBioEditor). */
export type ProfileEditorTab = 'photo' | 'info' | 'social' | 'links' | 'content';

export interface ProfileHealthStep {
  id: ProfileHealthStepId;
  label: string;
  description: string;
  /** Tab the user lands on when clicking the step in the dialog. */
  targetTab: ProfileEditorTab;
  /**
   * Optional absolute URL override. When set, the dialog navigates here
   * instead of `/app/profile?focus=<targetTab>`. Used by steps whose
   * natural editing surface lives outside the Link-in-Bio editor (e.g.
   * "Create your first paid link" → standalone Links page).
   */
  targetUrl?: string;
  done: boolean;
}

export interface ProfileHealthState {
  steps: ProfileHealthStep[];
  completedCount: number;
  totalCount: number;
  /** 0..100 integer for cleaner UI. */
  percent: number;
  /** Active fan subscribers attached to this creator profile. */
  subscribersCount: number;
  /** Lifetime profile views (mirrored from creator_profiles.profile_view_count). */
  profileViewCount: number;
  /** Lifetime succeeded sales on links owned by this creator profile. */
  salesCount: number;
  /** Last step that flipped pending → done in this session, or null. */
  justCompletedStepId: ProfileHealthStepId | null;
  acknowledgeJustCompleted: () => void;
  refetch: () => void;
  isReady: boolean;
}

const STEP_DEFS: Array<Pick<ProfileHealthStep, 'id' | 'label' | 'description' | 'targetTab' | 'targetUrl'>> = [
  { id: 'username', label: 'Username added', description: 'Pick the handle fans see in your URL.', targetTab: 'info' },
  { id: 'avatar', label: 'Add a profile picture', description: 'Upload a photo so fans recognise you.', targetTab: 'photo' },
  { id: 'bio', label: 'Write your bio', description: 'A short intro (10+ characters).', targetTab: 'info' },
  { id: 'website', label: 'Add your website link', description: 'Set the redirect URL on your Exclusive Content button.', targetTab: 'social' },
  { id: 'socials', label: 'Add socials to your profile', description: 'At least one social platform linked.', targetTab: 'social' },
  { id: 'subscription', label: 'Set your subscription price', description: 'Enable monthly fan subscriptions.', targetTab: 'content' },
  // First paid link is created/managed on the standalone Links page, not the
  // Link-in-Bio editor — send the creator straight there.
  { id: 'first_link', label: 'Create your first paid link', description: 'Sell your first piece of content.', targetTab: 'links', targetUrl: '/app/links' },
  { id: 'feed_30', label: 'Add 30 posts to your feed', description: 'Build a feed fans want to subscribe to.', targetTab: 'content' },
];

const TOTAL_STEPS = STEP_DEFS.length;
const REFETCH_DEBOUNCE_MS = 300;
const SEEN_STORAGE_KEY = (profileId: string) => `profileHealth.seenSteps:${profileId}`;

interface RawSnapshot {
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  exclusive_content_url: string | null;
  fan_subscription_enabled: boolean | null;
  fan_subscription_price_cents: number | null;
  publishedLinksCount: number;
  publicAssetsCount: number;
  subscribersCount: number;
  profileViewCount: number;
  salesCount: number;
}

/** Trim + non-empty guard. Treats whitespace-only strings as empty. */
const isFilled = (value: string | null | undefined): boolean => Boolean(value && value.trim().length > 0);

function computeSteps(snap: RawSnapshot): ProfileHealthStep[] {
  const social = snap.social_links ?? {};
  // "Socials" = at least one social platform with a non-empty URL. Any
  // platform counts (Instagram, X, TikTok, OnlyFans, Linktree, …).
  const anySocialFilled = Object.values(social).some((value) => isFilled(value));

  const flags: Record<ProfileHealthStepId, boolean> = {
    username: isFilled(snap.username),
    avatar: Boolean(snap.avatar_url),
    bio: isFilled(snap.bio) && (snap.bio?.trim().length ?? 0) >= 10,
    // Step "website link" maps to the creator's Exclusive Content URL —
    // the only generic external URL surfaced on the profile editor.
    website: isFilled(snap.exclusive_content_url),
    socials: anySocialFilled,
    subscription: Boolean(snap.fan_subscription_enabled) && (snap.fan_subscription_price_cents ?? 0) > 0,
    first_link: snap.publishedLinksCount >= 1,
    feed_30: snap.publicAssetsCount >= 30,
  };

  return STEP_DEFS.map((def) => ({ ...def, done: flags[def.id] }));
}

function readSeenSet(profileId: string): Set<ProfileHealthStepId> {
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY(profileId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as ProfileHealthStepId[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function writeSeenSet(profileId: string, ids: Set<ProfileHealthStepId>) {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY(profileId), JSON.stringify([...ids]));
  } catch {
    /* quota or private mode — silent fallback */
  }
}

export function useProfileHealth(activeProfile: CreatorProfile | null): ProfileHealthState {
  const [userId, setUserId] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProfileHealthStep[]>(() =>
    STEP_DEFS.map((def) => ({ ...def, done: false }))
  );
  const [subscribersCount, setSubscribersCount] = useState(0);
  const [profileViewCount, setProfileViewCount] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [justCompletedStepId, setJustCompletedStepId] = useState<ProfileHealthStepId | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Refs so the realtime channel callback always sees the latest values
  // without re-subscribing on every step change.
  const stepsRef = useRef<ProfileHealthStep[]>(steps);
  stepsRef.current = steps;
  const debounceRef = useRef<number | null>(null);
  const profileIdRef = useRef<string | null>(activeProfile?.id ?? null);
  profileIdRef.current = activeProfile?.id ?? null;
  // Tracks whether the next refetch is the first one for this profile.
  // The first refetch is treated as a baseline — already-done steps are
  // recorded as "seen" so the popup never auto-opens for steps the user
  // completed in a past session. Only fresh transitions in this session
  // (pending → done) trigger the auto-popup.
  const isFirstLoadRef = useRef(true);

  // Resolve the current auth user once. RLS already scopes everything to
  // the creator's own data so we never need to refetch this.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchSnapshot = useCallback(
    async (profileId: string, uid: string): Promise<RawSnapshot | null> => {
      // Run the three queries in parallel — none depend on each other.
      const profilePromise = supabase
        .from('creator_profiles')
        .select(
          'username, avatar_url, bio, social_links, exclusive_content_url, fan_subscription_enabled, fan_subscription_price_cents, profile_view_count'
        )
        .eq('id', profileId)
        .maybeSingle();

      // Multi-profile filter pattern (mirrors PublicContentSection): prefer
      // profile_id, fall back to creator_id for legacy rows where profile_id
      // hasn't been backfilled. We over-count rather than under-count if both
      // exist; in practice migration 068 backfilled everything.
      // We fetch the actual link ids (not just a count) so we can scope the
      // sales count to this profile's links — matches per-profile semantics
      // even though `purchases` itself has no profile_id column.
      // NOTE: `links` has no `deleted_at` column (unlike `assets`), so we
      // can't filter soft-deleted rows here. Status filtering happens below.
      const linksPromise = supabase
        .from('links')
        .select('id, status')
        .eq('profile_id', profileId);

      // Soft-deleted assets (deleted_at IS NOT NULL) are excluded — they're
      // hidden from the public profile and shouldn't count toward the feed step.
      const assetsPromise = supabase
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('is_public', true)
        .is('deleted_at', null);

      // Active fan subscribers (read by creators via RLS policy
      // `creators_read_their_subscribers` from migration 147).
      const subscribersPromise = supabase
        .from('fan_creator_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('creator_profile_id', profileId)
        .eq('status', 'active');

      const [profileRes, linksRes, assetsRes, subscribersRes] = await Promise.all([
        profilePromise,
        linksPromise,
        assetsPromise,
        subscribersPromise,
      ]);

      if (profileRes.error) {
        // Don't tear down the UI on transient errors — caller falls back to previous state.
        console.warn('[useProfileHealth] profile fetch failed', profileRes.error);
        return null;
      }

      // Sales = succeeded purchases on this profile's links. Skipped when
      // the profile has no links yet (fresh creator) — saves an `IN ()` query.
      const linkRows = linksRes.data ?? [];
      const linkIds = linkRows.map((row) => row.id as string);
      const publishedLinksCount = linkRows.filter((row) => row.status === 'published').length;

      let salesCount = 0;
      if (linkIds.length > 0) {
        const { count, error } = await supabase
          .from('purchases')
          .select('id', { count: 'exact', head: true })
          .in('link_id', linkIds)
          .eq('status', 'succeeded');
        if (error) {
          console.warn('[useProfileHealth] sales count failed', error);
        } else {
          salesCount = count ?? 0;
        }
      }

      return {
        username: profileRes.data?.username ?? null,
        avatar_url: profileRes.data?.avatar_url ?? null,
        bio: profileRes.data?.bio ?? null,
        social_links: (profileRes.data?.social_links ?? {}) as Record<string, string>,
        exclusive_content_url: profileRes.data?.exclusive_content_url ?? null,
        fan_subscription_enabled: profileRes.data?.fan_subscription_enabled ?? null,
        fan_subscription_price_cents: profileRes.data?.fan_subscription_price_cents ?? null,
        publishedLinksCount,
        publicAssetsCount: assetsRes.count ?? 0,
        subscribersCount: subscribersRes.count ?? 0,
        profileViewCount: profileRes.data?.profile_view_count ?? 0,
        salesCount,
      };
    },
    []
  );

  const refetch = useCallback(() => {
    const profileId = profileIdRef.current;
    if (!profileId || !userId) return;

    fetchSnapshot(profileId, userId).then((snap) => {
      if (!snap) return;
      // Guard against stale completion (profile was switched mid-flight).
      if (profileIdRef.current !== profileId) return;

      const next = computeSteps(snap);
      const prev = stepsRef.current;
      const seen = readSeenSet(profileId);

      // First load for this profile in this hook lifecycle: treat the
      // server snapshot as the baseline. Every step that's already done
      // is silently recorded as "seen" — no popup. Only fresh transitions
      // observed AFTER this baseline can trigger the auto-popup.
      // This is what prevents the popup from re-opening every time the
      // user navigates between admin tabs / reloads the page.
      if (isFirstLoadRef.current) {
        for (const step of next) {
          if (step.done) seen.add(step.id);
          else seen.delete(step.id);
        }
        writeSeenSet(profileId, seen);
        isFirstLoadRef.current = false;
        setSteps(next);
        setSubscribersCount(snap.subscribersCount);
        setProfileViewCount(snap.profileViewCount);
        setSalesCount(snap.salesCount);
        setIsReady(true);
        return;
      }

      // Subsequent refetches: detect a fresh crossing (pending → done)
      // not yet acknowledged. At most one popup per refetch — if multiple
      // steps cross simultaneously (rare), the last one wins.
      let crossedId: ProfileHealthStepId | null = null;
      for (const step of next) {
        if (!step.done) continue;
        const wasDone = prev.find((p) => p.id === step.id)?.done ?? false;
        if (!wasDone && !seen.has(step.id)) {
          crossedId = step.id;
        }
      }

      // Steps that regress (done → not done) are forgotten so the user
      // gets a fresh celebration when they re-complete the missing field.
      for (const step of next) {
        if (!step.done) seen.delete(step.id);
      }
      writeSeenSet(profileId, seen);

      setSteps(next);
      setSubscribersCount(snap.subscribersCount);
      setProfileViewCount(snap.profileViewCount);
      setIsReady(true);
      if (crossedId) setJustCompletedStepId(crossedId);
    });
  }, [fetchSnapshot, userId]);

  /** Coalesces realtime bursts so we don't refetch on every keystroke. */
  const scheduleRefetch = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      refetch();
    }, REFETCH_DEBOUNCE_MS);
  }, [refetch]);

  // Initial fetch + Realtime subscription. Re-subscribe whenever the active
  // profile or auth user changes.
  useEffect(() => {
    const profileId = activeProfile?.id ?? null;
    if (!profileId || !userId) {
      setIsReady(false);
      return;
    }

    // Reset state for the new profile and immediately fetch a fresh snapshot.
    // The baseline flag is reset so the new profile's already-done steps
    // are absorbed silently rather than triggering a popup parade.
    setIsReady(false);
    setJustCompletedStepId(null);
    isFirstLoadRef.current = true;
    refetch();

    const channel = supabase
      .channel(`profile_health:${profileId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'creator_profiles', filter: `id=eq.${profileId}` },
        scheduleRefetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'links', filter: `profile_id=eq.${profileId}` },
        scheduleRefetch
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assets', filter: `profile_id=eq.${profileId}` },
        scheduleRefetch
      )
      .subscribe();

    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [activeProfile?.id, userId, refetch, scheduleRefetch]);

  const acknowledgeJustCompleted = useCallback(() => {
    setJustCompletedStepId((current) => {
      const profileId = profileIdRef.current;
      if (current && profileId) {
        const seen = readSeenSet(profileId);
        seen.add(current);
        writeSeenSet(profileId, seen);
      }
      return null;
    });
  }, []);

  const completedCount = useMemo(() => steps.filter((s) => s.done).length, [steps]);
  const percent = useMemo(() => Math.round((completedCount / TOTAL_STEPS) * 100), [completedCount]);

  return {
    steps,
    completedCount,
    totalCount: TOTAL_STEPS,
    percent,
    subscribersCount,
    profileViewCount,
    salesCount,
    justCompletedStepId,
    acknowledgeJustCompleted,
    refetch,
    isReady,
  };
}
