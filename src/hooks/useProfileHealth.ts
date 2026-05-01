import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { CreatorProfile } from '@/contexts/ProfileContext';

/**
 * Profile Health — onboarding completion tracker (gamification inspired by Fanspicy).
 *
 * Each step maps to a concrete data point already collected by the platform.
 * The hook computes their done/pending status from a server snapshot, listens
 * for live mutations (Postgres CDC over Supabase Realtime), and emits
 * `justCompletedStepId` exactly once per (profileId, stepId) — used by the UI
 * to auto-open the dialog when the creator crosses a milestone.
 *
 * Optimistic UX
 *   The card sits in the AppShell sidebar but the editing surface lives in
 *   the Link-in-Bio editor. Without help, the bar would only update once the
 *   editor's debounced auto-save lands AND realtime echoes back (~2s after the
 *   last keystroke). To make the bar feel live, the editor calls
 *   `dispatchProfileHealthPatch()` on every state change — the hook merges
 *   the patch into its local snapshot instantly. The eventual server fetch
 *   confirms (or corrects) the same value silently.
 *
 *   Crossing detection ONLY runs against server-confirmed snapshots — the
 *   `lastServerStepsRef` ignores optimistic intermediate states so the auto-
 *   popup doesn't fire on transient keystrokes (e.g. "h" → backspace → "").
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
  { id: 'bio', label: 'Write your bio', description: 'A short intro about you.', targetTab: 'info' },
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

/** Custom DOM event used by the editor to push optimistic step changes. */
const PATCH_EVENT = 'exclu:profile-health:patch';

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

/** Subset of fields the editor can patch optimistically. Counters (links,
    assets, subs, sales) come exclusively from server fetches — the editor
    doesn't own those. */
export type ProfileHealthPatch = Partial<{
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  exclusive_content_url: string | null;
  fan_subscription_enabled: boolean | null;
  fan_subscription_price_cents: number | null;
}>;

/**
 * Push an optimistic patch into the active Profile Health hook.
 * Safe to call from anywhere; ignored when no hook instance is mounted.
 * Use from edit surfaces (LinkInBioEditor) on every state change so the
 * sidebar bar reacts instantly without waiting for the DB roundtrip.
 */
export function dispatchProfileHealthPatch(patch: ProfileHealthPatch): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ProfileHealthPatch>(PATCH_EVENT, { detail: patch }));
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
    bio: isFilled(snap.bio),
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

const PENDING_STEPS: ProfileHealthStep[] = STEP_DEFS.map((def) => ({ ...def, done: false }));

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
  // Single source of truth for the visible state. Server fetches replace it
  // entirely; optimistic patches merge field-by-field.
  const [snap, setSnap] = useState<RawSnapshot | null>(null);
  const [justCompletedStepId, setJustCompletedStepId] = useState<ProfileHealthStepId | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Refs for callbacks that run outside React's render flow.
  const debounceRef = useRef<number | null>(null);
  const profileIdRef = useRef<string | null>(activeProfile?.id ?? null);
  profileIdRef.current = activeProfile?.id ?? null;
  // Last server-confirmed steps — used for crossing detection so optimistic
  // patches between two fetches don't trigger phantom popups (e.g. user
  // types "h" then backspace before the save commits).
  const lastServerStepsRef = useRef<ProfileHealthStep[]>(PENDING_STEPS);
  // First refetch per profile is treated as a baseline — already-done steps
  // are absorbed silently (recorded as "seen") so the popup never auto-opens
  // for a milestone the creator passed in a past session.
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
    async (profileId: string, _uid: string): Promise<RawSnapshot | null> => {
      // Run the parallel queries — none depend on each other.
      const profilePromise = supabase
        .from('creator_profiles')
        .select(
          'username, avatar_url, bio, social_links, exclusive_content_url, fan_subscription_enabled, fan_subscription_price_cents, profile_view_count'
        )
        .eq('id', profileId)
        .maybeSingle();

      // We fetch the actual link ids (not just a count) so we can scope the
      // sales count to this profile's links — `purchases` has no profile_id
      // column. `links` has no `deleted_at` either, so we filter status only.
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
        console.warn('[useProfileHealth] profile fetch failed', profileRes.error);
        return null;
      }

      const linkRows = linksRes.data ?? [];
      const linkIds = linkRows.map((row) => row.id as string);
      const publishedLinksCount = linkRows.filter((row) => row.status === 'published').length;

      // Sales = succeeded purchases on this profile's links. Skipped when
      // the profile has no links yet — saves an `IN ()` query.
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

    fetchSnapshot(profileId, userId).then((newSnap) => {
      if (!newSnap) return;
      // Guard against stale completion (profile was switched mid-flight).
      if (profileIdRef.current !== profileId) return;

      const newSteps = computeSteps(newSnap);
      const seen = readSeenSet(profileId);

      if (isFirstLoadRef.current) {
        // Baseline: every already-done step is absorbed as "seen" so it
        // doesn't trigger a popup. Only post-baseline transitions count.
        for (const step of newSteps) {
          if (step.done) seen.add(step.id);
          else seen.delete(step.id);
        }
        writeSeenSet(profileId, seen);
        isFirstLoadRef.current = false;
        lastServerStepsRef.current = newSteps;
        setSnap(newSnap);
        setIsReady(true);
        return;
      }

      // Crossing detection compares THIS server snapshot against the LAST
      // server snapshot, not the optimistic in-between state. That way the
      // popup only fires on genuine commits, not on intermediate keystrokes.
      const prev = lastServerStepsRef.current;
      let crossedId: ProfileHealthStepId | null = null;
      for (const step of newSteps) {
        if (!step.done) continue;
        const wasDone = prev.find((p) => p.id === step.id)?.done ?? false;
        if (!wasDone && !seen.has(step.id)) {
          crossedId = step.id;
        }
      }

      // Steps that regress (done → not done) are forgotten so the user gets
      // a fresh celebration when they re-complete the missing field.
      for (const step of newSteps) {
        if (!step.done) seen.delete(step.id);
      }
      writeSeenSet(profileId, seen);

      lastServerStepsRef.current = newSteps;
      setSnap(newSnap);
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

  // Optimistic patch listener. Any source can dispatch via
  // `dispatchProfileHealthPatch()` and the visible bar reacts instantly.
  // We never compute crossings here — only the next server fetch will.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ProfileHealthPatch>).detail;
      if (!detail) return;
      setSnap((prev) => {
        // Without a baseline snapshot the patch has nothing to merge into;
        // the next refetch will populate everything from the server.
        if (!prev) return prev;
        return { ...prev, ...detail };
      });
    };
    window.addEventListener(PATCH_EVENT, handler);
    return () => window.removeEventListener(PATCH_EVENT, handler);
  }, []);

  // Initial fetch + Realtime subscription. Re-subscribe whenever the active
  // profile or auth user changes.
  useEffect(() => {
    const profileId = activeProfile?.id ?? null;
    if (!profileId || !userId) {
      setIsReady(false);
      return;
    }

    // Reset state for the new profile and immediately fetch a fresh snapshot.
    setIsReady(false);
    setJustCompletedStepId(null);
    setSnap(null);
    lastServerStepsRef.current = PENDING_STEPS;
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

  // All visible state derives from the single `snap` source.
  const steps = useMemo<ProfileHealthStep[]>(
    () => (snap ? computeSteps(snap) : PENDING_STEPS),
    [snap]
  );
  const completedCount = useMemo(() => steps.filter((s) => s.done).length, [steps]);
  const percent = useMemo(() => Math.round((completedCount / TOTAL_STEPS) * 100), [completedCount]);

  return {
    steps,
    completedCount,
    totalCount: TOTAL_STEPS,
    percent,
    subscribersCount: snap?.subscribersCount ?? 0,
    profileViewCount: snap?.profileViewCount ?? 0,
    salesCount: snap?.salesCount ?? 0,
    justCompletedStepId,
    acknowledgeJustCompleted,
    refetch,
    isReady,
  };
}
