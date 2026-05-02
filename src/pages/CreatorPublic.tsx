import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ArrowUpRight, Image as ImageIcon, Globe, X, Play, MapPin, DollarSign, MessageSquare, Loader2, ArrowLeft, ExternalLink } from 'lucide-react';
import StarBorder from '@/components/ui/StarBorder';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import logo from '@/assets/logo-white.svg';
import Aurora from '@/components/ui/Aurora';
import GuestChat from '@/components/GuestChat';
import { PreCheckoutGate, isPreCheckoutReady, type PreCheckoutGateState } from '@/components/checkout/PreCheckoutGate';
import { getGeoCountry } from '@/lib/ipGeo';
import { getAuroraGradient } from '@/lib/auroraGradients';
import { getSignedUrl } from '@/lib/storageUtils';
import { FeedPost, type FeedPostData } from '@/components/feed/FeedPost';
import { SubscriptionPopup } from '@/components/feed/SubscriptionPopup';
import { SuggestedCreatorsStrip } from '@/components/feed/SuggestedCreatorsStrip';
import { CreatePostDialog, CreatePostTrigger } from '@/components/feed/CreatePostDialog';
import { PostVisibilityToggle } from '@/components/feed/PostVisibilityToggle';
import { useFanSubscription } from '@/hooks/useFanSubscription';
import {
  SiX,
  SiInstagram,
  SiTiktok,
  SiTelegram,
  SiOnlyfans,
  SiYoutube,
  SiSnapchat,
  SiLinktree,
} from 'react-icons/si';

interface CreatorProfileData {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  handle: string | null;
  location: string | null;
  theme_color: string | null;
  aurora_gradient?: string | null;
  social_links: Record<string, string> | null;
  is_creator_subscribed?: boolean | null;
  show_join_banner?: boolean | null;
  show_certification?: boolean | null;
  show_deeplinks?: boolean | null;
  show_available_now?: boolean | null;
  exclusive_content_text?: string | null;
  exclusive_content_link_id?: string | null;
  exclusive_content_url?: string | null;
  exclusive_content_image_url?: string | null;
  payout_setup_complete?: boolean | null;
  tips_enabled?: boolean | null;
  custom_requests_enabled?: boolean | null;
  min_tip_amount_cents?: number | null;
  min_custom_request_cents?: number | null;
  show_agency_branding?: boolean | null;
  chat_enabled?: boolean | null;
  fan_subscription_enabled?: boolean | null;
  fan_subscription_price_cents?: number | null;
  content_order?: string[] | null;
}

type FeedItem =
  | {
      kind: 'asset';
      id: string;
      previewUrl: string | null; // full-res — only populated when viewer is subscribed or it's the free preview
      blurUrl: string | null;
      storagePath: string;
      mimeType: string | null;
      caption: string | null;
      isPublic: boolean; // drives the Public/Subs toggle and the locked/unlocked render
      createdAt: string;
    }
  | {
      kind: 'link';
      id: string;
      slug: string;
      title: string;
      description: string | null;
      priceCents: number;
      coverUrl: string | null;
      isPublic: boolean;
      createdAt: string;
    };

interface CreatorLinkCard {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  slug: string;
  is_public?: boolean | null;
  created_at?: string | null;
  status?: string | null;
  show_on_profile?: boolean | null;
}


// Social platform configurations using real brand icons (monochrome)
const socialPlatforms: Record<string, { label: string; icon: JSX.Element }> = {
  twitter: { label: 'X (Twitter)', icon: <SiX className="w-4 h-4" /> },
  instagram: { label: 'Instagram', icon: <SiInstagram className="w-4 h-4" /> },
  tiktok: { label: 'TikTok', icon: <SiTiktok className="w-4 h-4" /> },
  telegram: { label: 'Telegram', icon: <SiTelegram className="w-4 h-4" /> },
  onlyfans: { label: 'OnlyFans', icon: <SiOnlyfans className="w-4 h-4" /> },
  youtube: { label: 'YouTube', icon: <SiYoutube className="w-4 h-4" /> },
  snapchat: { label: 'Snapchat', icon: <SiSnapchat className="w-4 h-4" /> },
  linktree: { label: 'Linktree', icon: <SiLinktree className="w-4 h-4" /> },
  website: { label: 'Website', icon: <Globe className="w-4 h-4" /> },
};

interface CreatorPublicProps {
  /**
   * When set, overrides the route param. Used by the in-app /app/home tab
   * which renders the same component to give the creator a live preview
   * of their own public profile without leaving the dashboard chrome.
   */
  handleOverride?: string;
  /**
   * `true` when rendered inside AppShell's content area (creator's own home
   * tab). Suppresses the floating "Login as creator" CTA, hides the redundant
   * "share my profile" buttons, and lets the parent AppShell own the chrome
   * (volet/topbar). The feed itself, layout, and content stay identical to
   * what a public visitor sees so the creator gets a faithful preview.
   */
  embed?: boolean;
}

const CreatorPublic = ({ handleOverride, embed = false }: CreatorPublicProps = {}) => {
  const { handle: handleFromRoute } = useParams<{ handle: string }>();
  const handle = handleOverride ?? handleFromRoute;
  const navigate = useNavigate();

  const [profile, setProfile] = useState<CreatorProfileData | null>(null);
  const [links, setLinks] = useState<CreatorLinkCard[]>([]);
  const [publicContent, setPublicContent] = useState<any[]>([]);
  // /app/home only — toggles the post composer modal. The trigger pill
  // renders above the feed when `embed === true`.
  const [showCreatePost, setShowCreatePost] = useState(false);
  // Bumped after a post is published so the existing fetch effects re-run
  // and the new post shows up immediately.
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  // Optimistic visibility update for /app/home toggles. Updates feedItems in
  // place (and the underlying `links`/`publicContent` arrays so the next feed
  // rebuild keeps the new value) without re-fetching.
  const setItemVisibility = (postId: string, kind: 'asset' | 'link', isPublic: boolean) => {
    setFeedItems((prev) => prev.map((item) => (item.id === postId && item.kind === kind ? { ...item, isPublic } : item)));
    if (kind === 'asset') {
      setPublicContent((prev) => prev.map((a: any) => (a.id === postId ? { ...a, is_public: isPublic } : a)));
    } else {
      setLinks((prev) => prev.map((l) => (l.id === postId ? { ...l, is_public: isPublic } : l)));
    }
  };

  // Reorder a post in the embed feed. Swaps the post with its neighbour and
  // persists the new order on creator_profiles.content_order (or
  // profiles.content_order in legacy single-profile mode). Optimistic with
  // rollback on error.
  const moveFeedItem = async (postId: string, kind: 'asset' | 'link', direction: 'up' | 'down') => {
    const idx = feedItems.findIndex((i) => i.id === postId && i.kind === kind);
    if (idx < 0) return;
    const next = direction === 'up' ? idx - 1 : idx + 1;
    if (next < 0 || next >= feedItems.length) return;

    const reordered = [...feedItems];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
    const previous = feedItems;
    setFeedItems(reordered);

    const newOrder = reordered.map((i) => i.id);
    const targetTable = creatorProfileId ? 'creator_profiles' : 'profiles';
    const targetId = creatorProfileId ?? creatorUserId;
    if (!targetId) return;
    const { error } = await supabase
      .from(targetTable)
      .update({ content_order: newOrder })
      .eq('id', targetId);
    if (error) {
      console.error('[CreatorPublic] reorder failed', error);
      setFeedItems(previous);
      return;
    }
    // Sync the local profile snapshot so the rebuild effect doesn't snap back.
    setProfile((p) => (p ? { ...p, content_order: newOrder } : p));
  };

  // Caption edit from the embedded feed (creator's own /app/home). Optimistic
  // local update, persists to assets.feed_caption. Rolls back on error.
  const setAssetCaption = async (assetId: string, caption: string | null) => {
    const previous = (publicContent as any[]).find((a) => a.id === assetId)?.feed_caption ?? null;
    if ((previous ?? null) === (caption ?? null)) return;

    setFeedItems((prev) =>
      prev.map((item) => (item.kind === 'asset' && item.id === assetId ? { ...item, caption } : item)),
    );
    setPublicContent((prev) => prev.map((a: any) => (a.id === assetId ? { ...a, feed_caption: caption } : a)));

    const { error } = await supabase
      .from('assets')
      .update({ feed_caption: caption })
      .eq('id', assetId);

    if (error) {
      console.error('[CreatorPublic] caption save failed', error);
      setFeedItems((prev) =>
        prev.map((item) => (item.kind === 'asset' && item.id === assetId ? { ...item, caption: previous } : item)),
      );
      setPublicContent((prev) => prev.map((a: any) => (a.id === assetId ? { ...a, feed_caption: previous } : a)));
    }
  };

  // Initial tab honours ?tab=content (used by chat "View feed" CTA, fan
  // subscription-success redirect, and fan "Open feed" link from My subs).
  // ?tab=feed is an alias for ?tab=content — the feed lives inside the
  // Content tab on the public profile.
  // When no ?tab is passed, we resolve the default once links/profile are
  // loaded (see useEffect below): Links if the creator has paid links or a
  // pinned exclusive content, Feed otherwise.
  const tabFromUrl: 'links' | 'content' | 'wishlist' | null = (() => {
    if (typeof window === 'undefined') return null;
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'content' || t === 'feed') return 'content';
    if (t === 'wishlist') return 'wishlist';
    if (t === 'links') return 'links';
    return null;
  })();
  const tabForcedByUrl = tabFromUrl !== null;
  const [activeTab, setActiveTab] = useState<'links' | 'content' | 'wishlist'>(tabFromUrl ?? 'content');
  const [selectedContent, setSelectedContent] = useState<any | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [showSubscribePopup, setShowSubscribePopup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isContentLoading, setIsContentLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeactivated, setIsDeactivated] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [creatorUserId, setCreatorUserId] = useState<string | null>(null);
  const [creatorProfileId, setCreatorProfileId] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [agencyLogoUrl, setAgencyLogoUrl] = useState<string | null>(null);

  // Tip & Request modal state
  const [showTipModal, setShowTipModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [tipCustomAmount, setTipCustomAmount] = useState('');
  const [tipMessage, setTipMessage] = useState('');
  const [tipAnonymous, setTipAnonymous] = useState(false);
  const [tipFanName, setTipFanName] = useState('');
  const [isTipSubmitting, setIsTipSubmitting] = useState(false);
  const [requestDescription, setRequestDescription] = useState('');
  const [requestAmount, setRequestAmount] = useState('');
  const [isRequestSubmitting, setIsRequestSubmitting] = useState(false);
  const [requestGate, setRequestGate] = useState<PreCheckoutGateState>({ email: '', country: null, ageAccepted: false });
  const [signedInCountry, setSignedInCountry] = useState<string | null>(null);
  const [currentFanId, setCurrentFanId] = useState<string | null>(null);
  const [isCreatorAccount, setIsCreatorAccount] = useState(false);
  const [showGuestChat, setShowGuestChat] = useState(false);

  // Fan → creator subscription state (anonymous users always get isSubscribed=false).
  const { isSubscribed, periodEnd, cancelAtPeriodEnd, refetch: refetchFanSub } = useFanSubscription(creatorProfileId);

  const openGuestChat = useCallback(() => {
    setShowGuestChat(true);
    if (creatorProfileId) localStorage.setItem(`exclu_guest_chat_open_${creatorProfileId}`, '1');
  }, [creatorProfileId]);

  const closeGuestChat = useCallback(() => {
    setShowGuestChat(false);
    if (creatorProfileId) localStorage.removeItem(`exclu_guest_chat_open_${creatorProfileId}`);
  }, [creatorProfileId]);

  // Auto-restore guest chat if session exists and was open before refresh
  useEffect(() => {
    if (!creatorProfileId) return;
    const hasSession = localStorage.getItem(`exclu_guest_session_${creatorProfileId}`);
    const wasChatOpen = localStorage.getItem(`exclu_guest_chat_open_${creatorProfileId}`);
    if (hasSession && wasChatOpen) {
      setShowGuestChat(true);
    }
  }, [creatorProfileId]);

  // Wishlist state
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [selectedGiftItem, setSelectedGiftItem] = useState<any | null>(null);
  const [giftMessage, setGiftMessage] = useState('');
  const [giftAnonymous, setGiftAnonymous] = useState(false);
  const [giftFanName, setGiftFanName] = useState('');
  const [isGiftSubmitting, setIsGiftSubmitting] = useState(false);

  // Desktop photo collapse on scroll.
  //  • Links tab: collapse when the creator has > 5 links and the viewer
  //    scrolls past 35vh (the list gets long enough that hiding the photo
  //    gives more breathing room).
  //  • Feed tab: always collapse on scroll so the feed centers itself and
  //    the posts feel like a social-media timeline.
  const [photoVisible, setPhotoVisible] = useState(true);
  useEffect(() => {
    const threshold = window.innerHeight * 0.35;
    const handleScroll = () => {
      if (activeTab === 'content') {
        const shouldShow = window.scrollY < threshold;
        setPhotoVisible((prev) => (prev !== shouldShow ? shouldShow : prev));
        return;
      }
      if (links.length <= 5) {
        setPhotoVisible((prev) => (prev ? prev : true));
        return;
      }
      const shouldShow = window.scrollY < threshold;
      setPhotoVisible((prev) => (prev !== shouldShow ? shouldShow : prev));
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [links.length, activeTab]);

  // Check if a fan (not a creator) is logged in. Pre-fill the checkout
  // gate with the signed-in user's email + stored country so they don't
  // have to re-enter them at request submission.
  useEffect(() => {
    const checkFan = async (userId: string | undefined) => {
      if (!userId) {
        setCurrentFanId(null);
        setIsCreatorAccount(false);
        return;
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_creator, country, billing_country')
        .eq('id', userId)
        .maybeSingle();

      if (prof?.is_creator) {
        setCurrentFanId(null);
        setIsCreatorAccount(true);
      } else {
        setCurrentFanId(userId);
        setIsCreatorAccount(false);
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          setRequestGate((g) => ({ ...g, email: user.email ?? '' }));
        }
        const stored = (prof?.billing_country ?? prof?.country ?? null) as string | null;
        if (stored) setSignedInCountry(stored);
      }
    };

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      await checkFan(user?.id);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkFan(session?.user?.id);
    });
    return () => { subscription.unsubscribe(); };
  }, []);

  // Show payment result toasts on redirect (runs once on mount)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = new URL(window.location.href);
    let shouldCleanUrl = false;

    if (params.get('tip_success') === 'true') {
      toast.success('Thank you! Your tip has been sent.');
      url.searchParams.delete('tip_success');
      shouldCleanUrl = true;
    }
    if (params.get('tip_failed') === 'true') {
      toast.error('Tip payment was not completed. You have not been charged.');
      url.searchParams.delete('tip_failed');
      shouldCleanUrl = true;
    }
    if (params.get('gift_failed') === 'true') {
      toast.error('Gift payment was not completed. You have not been charged.');
      url.searchParams.delete('gift_failed');
      shouldCleanUrl = true;
    }

    if (shouldCleanUrl) {
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);

  // Open tip modal from URL param (e.g. from fan dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tip') === 'true' && profile?.tips_enabled) {
      setShowTipModal(true);
    }
  }, [profile]);

  useEffect(() => {
    let isMounted = true;
    
    const fetchCreator = async () => {
      if (!handle) return;
      setIsLoading(true);
      setError(null);

      try {
        // ── Step 1: Try creator_profiles first (supports additional profiles) ──
        let profileData: any = null;
        let userId: string | null = null;
        let profileId: string | null = null;
        let loadedFromCreatorProfiles = false;

        const { data: cpData } = await supabase
          .from('creator_profiles')
          .select('id, user_id, username, display_name, avatar_url, bio, is_active, deleted_at, theme_color, aurora_gradient, social_links, show_join_banner, show_certification, show_deeplinks, show_available_now, location, exclusive_content_text, exclusive_content_link_id, exclusive_content_url, exclusive_content_image_url, tips_enabled, custom_requests_enabled, min_tip_amount_cents, min_custom_request_cents, chat_enabled, fan_subscription_enabled, fan_subscription_price_cents, content_order')
          .eq('username', handle)
          .maybeSingle();

        if (!isMounted) return;

        if (cpData) {
          // Soft-deleted creator profile → show dedicated "no longer on Exclu" state.
          if (cpData.deleted_at) {
            setIsDeleted(true);
            setIsLoading(false);
            return;
          }

          // Check if profile is deactivated (premium lapse)
          if (!cpData.is_active) {
            setIsDeactivated(true);
            setProfile({ id: cpData.id, display_name: cpData.display_name, avatar_url: cpData.avatar_url, handle: cpData.username, bio: null, location: null, theme_color: null, social_links: null });
            setIsLoading(false);
            return;
          }

          loadedFromCreatorProfiles = true;
          userId = cpData.user_id;
          profileId = cpData.id;
          // Surface for the embed-mode CreatePostDialog (only used in /app/home).
          setActiveProfileId(cpData.id);

          // Load account-level data (premium status, payout) from parent profiles row
          const { data: parentProfile } = await supabase
            .from('profiles')
            .select('is_creator_subscribed, payout_setup_complete, deleted_at')
            .eq('id', cpData.user_id)
            .maybeSingle();

          // Defensive: if the owning user has been soft-deleted but the
          // creator_profiles row hasn't propagated the cascade yet, also
          // render the dedicated deleted state.
          if (parentProfile?.deleted_at) {
            setIsDeleted(true);
            setIsLoading(false);
            return;
          }

          if (!isMounted) return;

          // Load agency branding separately (migration 070)
          try {
            const { data: agencyData } = await supabase
              .from('profiles')
              .select('agency_name, agency_logo_url')
              .eq('id', cpData.user_id)
              .maybeSingle();
            setAgencyName(agencyData?.agency_name || null);
            setAgencyLogoUrl(agencyData?.agency_logo_url || null);
          } catch { /* migration 070 not applied */ }

          // Load show_agency_branding toggle separately (migration 070)
          let showBranding = true;
          try {
            const { data: brandingToggle } = await supabase
              .from('creator_profiles')
              .select('show_agency_branding')
              .eq('id', cpData.id)
              .maybeSingle();
            if (brandingToggle) showBranding = brandingToggle.show_agency_branding !== false;
          } catch { /* migration 070 not applied */ }

          profileData = {
            id: cpData.id,
            display_name: cpData.display_name,
            avatar_url: cpData.avatar_url,
            bio: cpData.bio,
            handle: cpData.username,
            location: cpData.location,
            theme_color: cpData.theme_color,
            aurora_gradient: cpData.aurora_gradient,
            social_links: cpData.social_links,
            is_creator_subscribed: parentProfile?.is_creator_subscribed ?? false,
            show_join_banner: cpData.show_join_banner,
            show_certification: cpData.show_certification,
            show_deeplinks: cpData.show_deeplinks,
            show_available_now: cpData.show_available_now,
            payout_setup_complete: parentProfile?.payout_setup_complete ?? false,
            exclusive_content_text: cpData.exclusive_content_text,
            exclusive_content_link_id: cpData.exclusive_content_link_id,
            exclusive_content_url: cpData.exclusive_content_url,
            exclusive_content_image_url: cpData.exclusive_content_image_url,
            tips_enabled: cpData.tips_enabled,
            custom_requests_enabled: cpData.custom_requests_enabled,
            min_tip_amount_cents: cpData.min_tip_amount_cents,
            min_custom_request_cents: cpData.min_custom_request_cents,
            show_agency_branding: showBranding,
            chat_enabled: cpData.chat_enabled,
          };

          // Show profile immediately (progressive loading)
          setProfile(profileData as CreatorProfileData);
          setCreatorUserId(userId);
          setCreatorProfileId(profileId);
          setIsLoading(false);
        }

        // ── Step 2: Fallback to profiles table (backward compat) ──
        if (!profileData) {
          const { data: fallbackData, error: profileError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, bio, handle, location, is_creator, deleted_at, theme_color, aurora_gradient, social_links, is_creator_subscribed, show_join_banner, show_certification, show_deeplinks, show_available_now, exclusive_content_text, exclusive_content_link_id, exclusive_content_url, exclusive_content_image_url, tips_enabled, custom_requests_enabled, min_tip_amount_cents, min_custom_request_cents')
            .eq('handle', handle)
            .maybeSingle();

          if (!isMounted) return;

          if (profileError || !fallbackData) {
            setError('This creator profile is not available.');
            setProfile(null);
            setLinks([]);
            setIsLoading(false);
            return;
          }

          // Soft-deleted creator → render dedicated "no longer on Exclu" state.
          if (fallbackData.deleted_at) {
            setIsDeleted(true);
            setIsLoading(false);
            return;
          }

          userId = fallbackData.id;
          profileData = fallbackData;

          // Show profile immediately (progressive loading)
          setProfile(profileData as CreatorProfileData);
          setCreatorUserId(userId);
          setIsLoading(false);

          // Load agency branding separately (migration 070)
          try {
            const { data: agencyFb } = await supabase
              .from('profiles')
              .select('agency_name, agency_logo_url')
              .eq('id', fallbackData.id)
              .maybeSingle();
            setAgencyName(agencyFb?.agency_name || null);
            setAgencyLogoUrl(agencyFb?.agency_logo_url || null);
          } catch { /* migration 070 not applied */ }
        }

        // ── Step 3: Load links (use profile_id when available, else creator_id) ──
        // Always load links — they should be visible on the public profile.
        // The purchase flow itself checks payment readiness.
        {
          let linksQuery = supabase
            .from('links')
            .select('id, title, description, price_cents, currency, slug, status, show_on_profile, is_public, created_at')
            .eq('status', 'published')
            .eq('show_on_profile', true)
            .order('created_at', { ascending: false });

          if (profileId) {
            linksQuery = linksQuery.eq('profile_id', profileId);
          } else {
            linksQuery = linksQuery.eq('creator_id', userId!);
          }

          const { data: linksData, error: linksError } = await linksQuery;
          if (!isMounted) return;

          if (linksError) {
            console.error('Error loading creator links', linksError);
            setLinks([]);
          } else {
            setLinks((linksData ?? []) as CreatorLinkCard[]);
          }
        }

        // ── Step 4: Load feed content ──
        // Both public profile and /app/home embed only fetch in-feed assets.
        // is_public flags whether each post is shown clear or blurred to
        // non-subscribers; the toggle in embed mode flips that flag.
        let assetsQuery = supabase
          .from('assets')
          .select('id, title, storage_path, mime_type, feed_caption, feed_blur_path, in_feed, is_public, created_at')
          .eq('in_feed', true)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (profileId) {
          assetsQuery = assetsQuery.eq('profile_id', profileId);
        } else {
          assetsQuery = assetsQuery.eq('creator_id', userId!);
        }

        const { data: publicData, error: publicError } = await assetsQuery;
        if (!isMounted) return;

        if (publicError) {
          console.error('Error loading public content:', publicError.message);
        }
        if (!publicError && publicData && publicData.length > 0) {
          // Sign blur paths for everyone. Full-res signed URLs are resolved
          // separately in a later effect, but ONLY when the viewer is subscribed.
          // That way non-subscribers never even observe a full-res URL.
          const withUrls = await Promise.all(
            publicData.map(async (item: any) => {
              const blurUrl = item.feed_blur_path
                ? await getSignedUrl(item.feed_blur_path, 60 * 60)
                : null;
              return { ...item, blurUrl, previewUrl: null };
            })
          );
          if (!isMounted) return;
          setPublicContent(withUrls);
        }

        // ── Step 5: Load wishlist items ──
        let wlQuery = supabase
          .from('wishlist_items')
          .select('id, name, description, emoji, image_url, gift_url, price_cents, currency, max_quantity, gifted_count, is_visible')
          .eq('is_visible', true)
          .order('sort_order');

        if (profileId) {
          wlQuery = wlQuery.eq('profile_id', profileId);
        } else {
          wlQuery = wlQuery.eq('creator_id', userId!);
        }

        const { data: wishlistData } = await wlQuery;

        if (!isMounted) return;
        setWishlistItems(wishlistData ?? []);

        // Increment profile view count (best-effort) — skipped in embed mode
        // because /app/home is the creator previewing their OWN profile and
        // self-views must not inflate the counter. The counter only tracks
        // genuine fan visits to /:handle.
        if (profileData.handle && !embed) {
          supabase.functions
            .invoke('increment-profile-view', {
              body: { handle: profileData.handle, profile_id: profileId || undefined },
            })
            .catch(() => {});
        }

        setIsContentLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Error in fetchCreator:', err);
        setError('Unable to load this creator profile.');
        setIsLoading(false);
      }
    };

    fetchCreator();

    return () => {
      isMounted = false;
    };
    // feedRefreshKey bumps when a new post is published from the embedded
    // composer in /app/home — re-running this effect re-fetches links + assets
    // so the new post shows up immediately without a manual reload.
  }, [handle, feedRefreshKey]);

  // Build the feed from in-feed assets + composer posts (price=0 links).
  // Paid links (price_cents > 0) stay on the Links tab. Order follows the
  // creator's manual content_order, with created_at desc as a tiebreaker for
  // new uploads not yet in the array.
  useEffect(() => {
    const order: string[] = (profile?.content_order ?? []) as string[];
    const orderIndex = new Map<string, number>(order.map((id, i) => [id, i]));

    const assetItems: FeedItem[] = (publicContent as any[])
      .filter((a) => a.in_feed === true)
      .map((a) => ({
        kind: 'asset' as const,
        id: a.id,
        previewUrl: a.previewUrl ?? null,
        blurUrl: a.blurUrl ?? null,
        storagePath: a.storage_path ?? '',
        mimeType: a.mime_type ?? null,
        // Fallback to title so newly-uploaded assets show their title above
        // the post even before the creator opens the caption editor.
        caption: a.feed_caption ?? a.title ?? null,
        isPublic: a.is_public !== false,
        createdAt: a.created_at ?? new Date().toISOString(),
      }));

    // Posts created from the /app/home composer are stored as `links` with
    // `price_cents = 0`. Surface them inline with asset items so the creator
    // sees their fresh post immediately (and so fans see them on the public
    // feed). Paid links (price_cents > 0) stay on the Links tab.
    const postItems: FeedItem[] = (links as any[])
      .filter((l) => (l.price_cents ?? 0) === 0)
      .map((l) => ({
        kind: 'link' as const,
        id: l.id,
        slug: l.slug ?? '',
        title: l.title ?? 'Post',
        description: l.description ?? null,
        priceCents: 0,
        coverUrl: null,
        isPublic: l.is_public !== false,
        createdAt: l.created_at ?? new Date().toISOString(),
      }));

    const allItems: FeedItem[] = [...assetItems, ...postItems];
    const sorted = allItems.sort((a, b) => {
      const ai = orderIndex.has(a.id) ? (orderIndex.get(a.id) as number) : Infinity;
      const bi = orderIndex.has(b.id) ? (orderIndex.get(b.id) as number) : Infinity;
      if (ai !== bi) return ai - bi;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
    setFeedItems(sorted);
  }, [publicContent, links, profile?.content_order]);

  // Whether the Links tab has anything to show: either a direct link or a
  // pinned "exclusive content" pill that lives at the top of the Links tab.
  // Used to gate the Links tab button (hidden if both empty) and to bounce
  // viewers off the Links tab if these become empty after navigation.
  const hasExclusiveContent = !!(
    profile?.exclusive_content_text ||
    profile?.exclusive_content_link_id ||
    profile?.exclusive_content_url ||
    profile?.exclusive_content_image_url
  );
  const hasAnyLinksOrExclusive = links.length > 0 || hasExclusiveContent;

  useEffect(() => {
    if (activeTab === 'links' && !hasAnyLinksOrExclusive) {
      setActiveTab('content');
    }
  }, [activeTab, hasAnyLinksOrExclusive]);

  // Default-tab resolution: when the URL doesn't force a tab, prefer Links
  // for creators who have paid links / pinned exclusive content (most
  // common case: monetisation-first profile), and fall back to Feed for
  // creators who only have public content. Runs once data is loaded; the
  // ref guard ensures we never override a user's manual tab click.
  const didResolveDefaultTab = useRef(false);
  useEffect(() => {
    if (tabForcedByUrl) return;
    if (didResolveDefaultTab.current) return;
    if (isContentLoading) return;
    didResolveDefaultTab.current = true;
    if (hasAnyLinksOrExclusive) setActiveTab('links');
  }, [tabForcedByUrl, isContentLoading, hasAnyLinksOrExclusive]);

  // Lazy-sign full-res URLs in the situations where the viewer is allowed to
  // see them in clear:
  //   • the free preview slot (always)
  //   • the asset is flagged `is_public = true` (open to everyone)
  //   • an active fan subscription is in place
  //   • `embed === true` — the creator is previewing their own /app/home
  // By deferring this resolution until those conditions are known, non-allowed
  // DOMs never contain a full-res URL (view-source attack surface).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const targets = feedItems.filter(
        (item): item is Extract<FeedItem, { kind: 'asset' }> =>
          item.kind === 'asset' &&
          !item.previewUrl &&
          (item.isPublic || isSubscribed) &&
          !!item.storagePath,
      );
      if (targets.length === 0) return;
      const resolved = await Promise.all(
        targets.map(async (t) => ({ id: t.id, url: await getSignedUrl(t.storagePath) })),
      );
      if (cancelled) return;
      setFeedItems((prev) =>
        prev.map((item) => {
          if (item.kind !== 'asset') return item;
          const hit = resolved.find((r) => r.id === item.id);
          return hit && hit.url ? { ...item, previewUrl: hit.url } : item;
        }),
      );
    })();
    return () => { cancelled = true; };
  }, [feedItems, isSubscribed]);

  // Fan coming back from QuickPay with ?subscribed=<handle>: refetch sub status + confirm.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscribed') && creatorProfileId) {
      toast.success('Subscription active! Welcome in.');
      refetchFanSub();
      // Tidy the URL so a reload doesn't re-toast.
      const url = new URL(window.location.href);
      url.searchParams.delete('subscribed');
      window.history.replaceState({}, '', url.toString());
    }
  }, [creatorProfileId, refetchFanSub]);

  const handleLinkClick = (link: CreatorLinkCard) => {
    navigate(`/l/${link.slug}`);
  };

  const handleSocialClick = (url: string) => {
    if (!url) return;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const deeplinksEnabled = profile?.is_creator_subscribed === true && profile?.show_deeplinks === true;
    if (isMobile && deeplinksEnabled) {
      // Navigate directly so the OS can intercept and open the native app (deep link).
      window.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleTipCta = () => {
    setShowTipModal(true);
  };

  const handleGiftCta = (item: any) => {
    setSelectedGiftItem(item);
    setGiftMessage('');
    setGiftAnonymous(false);
    setGiftFanName('');
    setShowGiftModal(true);
  };

  const handleGiftSubmit = async () => {
    if (!selectedGiftItem) return;
    setIsGiftSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const giftBody: Record<string, unknown> = {
        wishlist_item_id: selectedGiftItem.id,
        profile_id: creatorProfileId || null,
        message: giftMessage || null,
        is_anonymous: giftAnonymous,
      };
      if (!currentFanId && giftFanName.trim()) {
        giftBody.fan_name = giftFanName.trim();
      }

      const { data, error } = await supabase.functions.invoke('create-gift-checkout', {
        body: giftBody,
        headers,
      });
      if (error || !data?.fields) {
        throw new Error(data?.error || (error as any)?.message || 'Unable to start checkout');
      }
      // Submit QuickPay form
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://quickpay.ugpayments.ch/';
      form.style.display = 'none';
      Object.entries(data.fields as Record<string, string>).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process gift');
      setIsGiftSubmitting(false);
    }
  };

  const handleRequestCta = () => {
    // Creators can't send requests to other creators — bounce to fan signup.
    // Anonymous fans CAN now send requests: the modal asks for their email
    // and they pay immediately (pre-auth). An account is created in the
    // background; they can claim it later via the delivery email.
    if (isCreatorAccount) {
      toast.info('You need a fan account to send requests. Please sign up as a fan.');
      navigate(`/fan/signup?creator=${handle}`);
      return;
    }
    setShowRequestModal(true);
  };

  const handleMessageCta = async () => {
    if (!creatorProfileId) return;
    let fanId = currentFanId;

    if (!fanId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Not logged in → open guest chat inline
        openGuestChat();
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('is_creator')
        .eq('id', user.id)
        .maybeSingle();

      if (prof?.is_creator) {
        // Creators can't chat as fans — open guest chat instead
        openGuestChat();
        return;
      }

      fanId = user.id;
      setCurrentFanId(user.id);
    }

    const { data: conv, error } = await supabase
      .from('conversations')
      .upsert(
        { fan_id: fanId, profile_id: creatorProfileId },
        { onConflict: 'fan_id,profile_id', ignoreDuplicates: false }
      )
      .select('id')
      .single();
    if (error || !conv) {
      navigate(`/fan?tab=messages`);
      return;
    }
    navigate(`/fan?tab=messages&conversation=${conv.id}`);
  };

  const handleTipSubmit = async () => {
    if (!profile?.id) return;

    const finalAmount = tipAmount || Math.round(parseFloat(tipCustomAmount || '0') * 100);
    const minAmount = profile.min_tip_amount_cents || 500;

    if (finalAmount < minAmount) {
      toast.error(`Minimum tip is $${(minAmount / 100).toFixed(2)}`);
      return;
    }

    if (finalAmount > 50000) {
      toast.error('Maximum tip is $500.00');
      return;
    }

    setIsTipSubmitting(true);
    try {
      // Pass the auth token only if the user is logged in — guests tip without a token
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const tipBody: Record<string, unknown> = {
        creator_id: creatorUserId || profile.id,
        profile_id: creatorProfileId || null,
        amount_cents: finalAmount,
        message: tipMessage || null,
        is_anonymous: tipAnonymous,
      };
      if (!currentFanId && tipFanName.trim()) {
        tipBody.fan_name = tipFanName.trim();
      }

      const { data, error } = await supabase.functions.invoke('create-tip-checkout', {
        body: tipBody,
        headers,
      });

      if (error || !data?.fields) {
        throw new Error(data?.error || (error as any)?.message || 'Unable to start checkout');
      }

      // Submit QuickPay form
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://quickpay.ugpayments.ch/';
      form.style.display = 'none';
      Object.entries(data.fields as Record<string, string>).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
      return; // Page is navigating away
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process tip');
    } finally {
      setIsTipSubmitting(false);
    }
  };

  const handleRequestSubmit = async () => {
    if (!profile?.id) return;

    const amountCents = Math.round(parseFloat(requestAmount || '0') * 100);
    const minAmount = profile.min_custom_request_cents || 2000;

    if (amountCents < minAmount) {
      toast.error(`Minimum amount is $${(minAmount / 100).toFixed(2)}`);
      return;
    }

    if (!requestDescription || requestDescription.length < 10) {
      toast.error('Please describe your request (at least 10 characters)');
      return;
    }

    // Same gate as link checkout: email (guests only), country, 18+.
    if (!isPreCheckoutReady(requestGate, !currentFanId)) {
      if (!currentFanId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestGate.email)) {
        toast.error('Please enter a valid email address');
      } else if (!(requestGate.country ?? signedInCountry)) {
        toast.error('Please select your country');
      } else if (!requestGate.ageAccepted) {
        toast.error('You must confirm that you are at least 18 years old');
      }
      return;
    }

    setIsRequestSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const country = requestGate.country ?? signedInCountry;
      const requestBody: Record<string, unknown> = {
        creator_id: creatorUserId || profile.id,
        profile_id: creatorProfileId || null,
        description: requestDescription,
        proposed_amount_cents: amountCents,
        country,
      };

      if (!currentFanId) {
        requestBody.fan_email = requestGate.email;
      }

      const { data, error } = await supabase.functions.invoke('create-request-checkout', {
        body: requestBody,
        headers,
      });

      if (error || !data?.fields) {
        throw new Error(data?.error || (error as any)?.message || 'Unable to start checkout');
      }

      // Submit QuickPay form (Sale model: card charged on submit)
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://quickpay.ugpayments.ch/';
      form.style.display = 'none';
      Object.entries(data.fields as Record<string, string>).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
      return; // Page is navigating away
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process request');
    } finally {
      setIsRequestSubmitting(false);
    }
  };

  const displayName = profile?.display_name || profile?.handle || handle || 'Creator';
  const aurora = getAuroraGradient(profile?.aurora_gradient || 'purple_dream');
  const gradientStops: [string, string] = [aurora.colors[0], aurora.colors[2]];
  // Compact author identity embedded in each feed post's header.
  const feedAuthor = {
    displayName,
    handle: profile?.handle ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    verified: profile?.show_certification !== false,
  };
  const socialLinks = profile?.social_links || {};
  const activeSocials = Object.entries(socialLinks).filter(([_, url]) => url && url.trim() !== '');
  const isPremium = profile?.is_creator_subscribed === true;
  // The "Become a creator on Exclu" floating banner is suppressed in embed
  // mode (i.e. when the creator is previewing their own profile from /app/home)
  // because they are already a creator — the CTA is meaningless and the
  // bottom safe area is owned by AppShell's volet/bottom-nav.
  const shouldShowJoinBanner = !embed && (!isPremium || (isPremium && profile?.show_join_banner !== false));
  // Payout setup is NOT required to sell/receive — earnings go to wallet.
  // Tips/gifts/requests are always available if the creator has enabled them.
  const showTipsCta = profile?.tips_enabled === true;
  const showRequestsCta = profile?.custom_requests_enabled === true;
  const showChatCta = profile?.chat_enabled === true;
  const tipPresets = [500, 1000, 2500, 5000];
  const showAgencyFooter = profile?.show_agency_branding !== false && (agencyName || agencyLogoUrl);

  // ── Soft-deleted creator account ──
  // Rendered before the generic error fallback so a deleted handle gets the
  // dedicated message, while typos / never-existed handles keep the existing
  // not-found behaviour.
  if (isDeleted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-exclu-ink to-black text-white flex items-center justify-center px-6 text-center">
        <div className="max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-3">This creator is no longer on Exclu</h1>
          <p className="text-sm text-white/60 leading-relaxed">
            The account you're looking for has been deleted. If you were a subscriber, your access has ended and no further charges will be made.
          </p>
          <a
            href="/directory/creators"
            className="mt-6 inline-block text-sm text-white/70 hover:text-white underline underline-offset-4 transition-colors"
          >
            Discover other creators
          </a>
        </div>
      </div>
    );
  }

  // ── Deactivated profile page (premium lapse) ──
  if (isDeactivated && profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-exclu-ink to-black text-white flex flex-col items-center justify-center px-6">
        <div className="max-w-sm w-full text-center space-y-6">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={displayName} className="w-24 h-24 rounded-full mx-auto object-cover opacity-50 grayscale" />
          ) : (
            <div className="w-24 h-24 rounded-full mx-auto bg-white/10 flex items-center justify-center">
              <span className="text-3xl font-bold text-white/30">{displayName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white/80">{displayName}</h1>
            <p className="text-sm text-white/50">This profile is currently unavailable.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 space-y-2">
            <p className="text-xs text-white/40 leading-relaxed">
              This creator's profile has been temporarily deactivated. It may become available again in the future.
            </p>
          </div>
          <a href="/" className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/50 transition-colors mt-4">
            <img src={logo} alt="Exclu" className="h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  const getSocialGradient = (platform: string) => {
    switch (platform) {
      case 'telegram':
        return 'from-sky-500 to-cyan-500';
      case 'twitter':
        return 'from-slate-900 to-slate-700';
      case 'tiktok':
        return 'from-[#ff0050] to-[#00f2ea]';
      case 'onlyfans':
        return 'from-sky-500 to-cyan-400';
      case 'fansly':
        return 'from-sky-500 to-blue-600';
      case 'instagram':
        return 'from-[#f97316] to-[#ec4899]';
      case 'youtube':
        return 'from-red-500 to-red-700';
      case 'snapchat':
        return 'from-yellow-300 to-yellow-500';
      case 'linktree':
        return 'from-emerald-400 to-emerald-600';
      default:
        return 'from-exclu-ink to-exclu-phantom';
    }
  };

  // ── Skeleton de chargement — affiché immédiatement pendant que les données arrivent ──
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden">
        {/* Mobile skeleton */}
        <div className="sm:hidden flex flex-col items-center w-full">
          {/* Photo placeholder avec shimmer */}
          <div className="w-full aspect-square bg-gradient-to-b from-zinc-900 to-black relative overflow-hidden">
            <div className="absolute inset-0 shimmer-bg" />
          </div>
          {/* Nom + badge */}
          <div className="px-6 -mt-10 relative z-10 w-full flex flex-col items-center gap-3">
            <div className="h-7 w-40 rounded-full bg-white/10 animate-pulse" />
            <div className="h-3 w-24 rounded-full bg-white/5 animate-pulse" />
            {/* Socials placeholder */}
            <div className="flex gap-3 mt-2">
              {[1, 2, 3].map(i => <div key={i} className="w-10 h-10 rounded-full bg-white/5 animate-pulse" />)}
            </div>
            {/* Tab bar */}
            <div className="w-full flex justify-center gap-8 mt-4 border-b border-white/5 pb-3">
              <div className="h-4 w-12 rounded bg-white/10 animate-pulse" />
              <div className="h-4 w-14 rounded bg-white/5 animate-pulse" />
            </div>
            {/* Link placeholders */}
            <div className="w-full space-y-3 mt-2 px-2">
              {[1, 2, 3].map(i => <div key={i} className="w-full h-14 rounded-full bg-white/5 animate-pulse" />)}
            </div>
          </div>
        </div>
        {/* Desktop skeleton */}
        <div className="hidden sm:flex flex-1 px-10 pt-10 max-w-7xl mx-auto w-full gap-8">
          <div className="w-[400px] shrink-0">
            <div className="w-full aspect-[3/4] rounded-3xl bg-zinc-900 animate-pulse relative overflow-hidden">
              <div className="absolute inset-0 shimmer-bg" />
            </div>
          </div>
          <div className="flex-1 space-y-6 pt-2">
            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
              <div className="flex gap-3">
                {[1, 2, 3].map(i => <div key={i} className="w-11 h-11 rounded-full bg-white/5 animate-pulse" />)}
              </div>
              <div className="h-4 w-3/4 rounded bg-white/5 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-white/[0.03] animate-pulse" />
            </div>
            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="w-full h-14 rounded-2xl bg-white/5 animate-pulse" />)}
            </div>
          </div>
        </div>
        {/* Shimmer CSS intégré */}
        <style>{`
          .shimmer-bg {
            background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%);
            background-size: 200% 100%;
            animation: shimmer 1.8s infinite;
          }
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-exclu-ink to-black text-white flex flex-col relative" style={{ overflowX: 'clip' }}>
      {/* Desktop: Aurora animated background from top */}
      <div className="hidden sm:block fixed inset-0 z-0 pointer-events-none">
        <Aurora
          colorStops={getAuroraGradient(profile?.aurora_gradient || 'purple_dream').colors}
          blend={0.5}
          amplitude={1.0}
          speed={1}
        />
      </div>

      {/* Mobile: Aurora animated background from bottom of profile photo */}
      <div className="sm:hidden absolute inset-x-0 top-[55vh] h-[120vh] z-0 pointer-events-none">
        <Aurora
          colorStops={getAuroraGradient(profile?.aurora_gradient || 'purple_dream').colors}
          blend={0.5}
          amplitude={1.0}
          speed={1}
        />
      </div>

      {/* Fan topbar — shown when a fan is logged in */}
      {currentFanId && (
        <div className="relative z-20 bg-black/80 backdrop-blur-md border-b border-white/10">
          <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/fan')}
              className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs font-medium">Back</span>
            </button>
            <a href="/" className="inline-flex">
              <img src={logo} alt="Exclu" className="h-4" />
            </a>
            <div className="w-16" />
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────
          MOBILE: Hero image header (hidden when guest chat is open)
      ───────────────────────────────────────────────── */}
      <motion.div
        className={`${showGuestChat ? 'hidden' : ''} sm:hidden relative -mx-4 overflow-hidden z-10`}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        {profile?.avatar_url && (
          <>
            <img src={profile.avatar_url} alt={displayName} className="w-full aspect-square object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/80" />
            <div className="absolute inset-x-0 bottom-0 h-[150px] bg-gradient-to-t from-black to-transparent pointer-events-none z-10" />
            <div className="absolute inset-x-5 bottom-6 flex flex-col items-center text-center z-20 translate-y-[20px]">
              <div className="flex items-center gap-1.5">
                <h1 className="text-2xl font-extrabold text-white drop-shadow-[0_6px_18px_rgba(0,0,0,0.9)]">{displayName}</h1>
                {profile?.show_certification !== false && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0 drop-shadow-lg">
                    <defs><linearGradient id="badge-grad-m" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={gradientStops[0]} /><stop offset="100%" stopColor={gradientStops[1]} /></linearGradient></defs>
                    <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="url(#badge-grad-m)" stroke="url(#badge-grad-m)" />
                    <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2" fill="none" />
                  </svg>
                )}
              </div>
              {activeSocials.length > 0 && (
                <div className="mt-4 flex justify-center gap-3">
                  {activeSocials.map(([platform, url]) => {
                    const platformConfig = socialPlatforms[platform];
                    if (!platformConfig) return null;
                    return (
                      <motion.button key={platform} type="button" onClick={() => handleSocialClick(url)} whileTap={{ scale: 0.95 }}
                        className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shadow-lg ring-2 ring-white/30 active:ring-white/60 transition-all"
                        title={platformConfig.label}>
                        <span className="text-white">{platformConfig.icon}</span>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>

      {/* ─────────────────────────────────────────────────
          MOBILE: Fullscreen Guest Chat overlay
          — stops above the "Join Exclu" banner when it's visible,
            so the composer is never hidden behind it.
      ───────────────────────────────────────────────── */}
      {showGuestChat && creatorProfileId && (
        <div
          className={`sm:hidden fixed left-0 right-0 top-0 z-[60] bg-black ${
            shouldShowJoinBanner ? 'bottom-[92px]' : 'bottom-0'
          }`}
        >
          <GuestChat
            variant="inline"
            fullHeight
            profileId={creatorProfileId}
            creatorUserId={creatorUserId || profile?.id || ''}
            creatorName={displayName}
            creatorAvatarUrl={profile?.avatar_url ?? null}
            tipsEnabled={profile?.tips_enabled ?? false}
            minTipAmountCents={profile?.min_tip_amount_cents ?? undefined}
            onClose={closeGuestChat}
            gradientStops={gradientStops}
          />
        </div>
      )}

      {/* ─────────────────────────────────────────────────
          MOBILE: Vertical single-column layout
      ───────────────────────────────────────────────── */}
      <main className={`${showGuestChat ? 'hidden' : ''} sm:hidden relative z-10 flex-1 flex flex-col px-4 pt-4 pb-24`}>
        <div className="absolute inset-x-0 top-0 h-[250px] bg-gradient-to-b from-black to-transparent pointer-events-none z-0" />
        <div className="max-w-md mx-auto w-full flex flex-col flex-1 relative z-10">
          {/* Bio */}
          {(profile?.location || profile?.show_available_now) && (
            <p className="text-xs text-white mb-2 drop-shadow flex items-center justify-center gap-1">
              {profile?.location && <><MapPin className="w-3 h-3" />{profile.location}</>}
              {profile?.location && profile?.show_available_now && <span className="mx-1">·</span>}
              {profile?.show_available_now && (
                <span className="inline-flex items-center gap-1 text-white">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: gradientStops[0] }} />
                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: gradientStops[0] }} />
                  </span>
                  Available now
                </span>
              )}
            </p>
          )}
          {profile?.bio && <p className="text-sm text-white max-w-xs mx-auto mb-4 drop-shadow text-center">{profile.bio}</p>}

          {/* Tabs — hidden when guest chat is active */}
          {!showGuestChat && (links.length > 0 || publicContent.length > 0 || wishlistItems.length > 0) && (
            <div className="relative mb-6">
              <div className="flex justify-center gap-8 relative">
                {hasAnyLinksOrExclusive && (
                  <button onClick={() => setActiveTab('links')} className={`relative py-3 text-sm font-medium transition-colors ${activeTab === 'links' ? 'text-white' : 'text-white/50 hover:text-white/70'}`}>
                    Links
                    {activeTab === 'links' && <motion.div layoutId="activeTabMobile" className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full z-10" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />}
                  </button>
                )}
                {(publicContent.length > 0 || profile?.fan_subscription_enabled) && (
                  <button onClick={() => setActiveTab('content')} className={`relative py-3 text-sm font-medium transition-colors ${activeTab === 'content' ? 'text-white' : 'text-white/50 hover:text-white/70'}`}>
                    Feed
                    {activeTab === 'content' && <motion.div layoutId="activeTabMobile" className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full z-10" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />}
                  </button>
                )}
                {wishlistItems.length > 0 && (
                  <button onClick={() => setActiveTab('wishlist')} className={`relative py-3 text-sm font-medium transition-colors ${activeTab === 'wishlist' ? 'text-white' : 'text-white/50 hover:text-white/70'}`}>
                    Wishlist
                    {activeTab === 'wishlist' && <motion.div layoutId="activeTabMobile" className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full z-10" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />}
                  </button>
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/20" />
            </div>
          )}

          {/* Tab content — hidden when guest chat is active */}
          {!showGuestChat && <div className="flex-1 space-y-3">
            {isContentLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="w-full h-14 rounded-full bg-white/5 animate-pulse" />)}
              </div>
            )}
            {!isContentLoading && activeTab === 'links' && (
              <div className="space-y-3">
                {profile?.exclusive_content_text && (profile.exclusive_content_url || profile.exclusive_content_link_id || links.length > 0) && (
                  <StarBorder
                    as="div"
                    color1={gradientStops[0]}
                    color2={gradientStops[1]}
                    speed="4s"
                    thickness={1}
                    className="w-full cursor-pointer"
                    style={{ borderRadius: profile.exclusive_content_image_url ? '16px' : '9999px' }}
                    onClick={() => {
                      if (profile.exclusive_content_url) { window.location.href = profile.exclusive_content_url; return; }
                      const targetLink = profile.exclusive_content_link_id ? links.find((l) => l.id === profile.exclusive_content_link_id) : links[0];
                      if (targetLink) handleLinkClick(targetLink);
                    }}
                  >
                    {profile.exclusive_content_image_url ? (
                      <div className="relative w-full rounded-2xl overflow-hidden shadow-lg select-none">
                        <img src={profile.exclusive_content_image_url} alt={profile.exclusive_content_text} className="w-full h-44 object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                        <div className="absolute bottom-4 inset-x-4 flex items-center justify-between">
                          <div className="flex items-center gap-2"><Lock className="w-4 h-4 text-white" /><span className="text-sm font-bold text-white truncate max-w-[200px]">{profile.exclusive_content_text}</span></div>
                          <ArrowUpRight className="w-4 h-4 text-white/70" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-14 rounded-full flex items-center justify-center gap-2 shadow-lg" style={{ background: `linear-gradient(to right, ${gradientStops[0]}cc, ${gradientStops[1]}cc)` }}>
                        <Lock className="w-4 h-4 text-white" /><span className="text-sm font-bold text-white truncate max-w-[220px]">{profile.exclusive_content_text}</span><ArrowUpRight className="w-4 h-4 text-white/70" />
                      </div>
                    )}
                  </StarBorder>
                )}
                {links.length > 0 ? links.map((link, index) => {
                  const priceLabel = `${(link.price_cents / 100).toFixed(2)} ${link.currency}`;
                  return (
                    <motion.button key={link.id} type="button" onClick={() => handleLinkClick(link)}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 * (index + 1) }}
                      className="w-full h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all flex items-center justify-between px-5 group">
                      <div className="flex items-center gap-3"><Lock className="w-4 h-4 text-white/60" /><span className="text-white font-medium truncate max-w-[180px]">{link.title}</span></div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}>{priceLabel}</span>
                        <ArrowUpRight className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
                      </div>
                    </motion.button>
                  );
                }) : null}
              </div>
            )}

            {!isContentLoading && activeTab === 'content' && (
              feedItems.length > 0 ? (
                <div className="space-y-4">
                  {/* /app/home only — composer above the feed (mobile feed branch). */}
                  {embed && (
                    <CreatePostTrigger onClick={() => setShowCreatePost(true)} />
                  )}
                  {feedItems.map((item, idx) => (
                    // Wrapper is `relative` so the embed-mode visibility chip
                    // can absolute-position itself top-right of the post.
                    <div key={`${item.kind}-${item.id}`} className="relative">
                      {embed && (
                        <PostVisibilityToggle
                          postId={item.id}
                          kind={item.kind}
                          isPublic={item.isPublic}
                          onChange={(next) => setItemVisibility(item.id, item.kind, next)}
                          gradientStops={gradientStops as [string, string]}
                          onMoveUp={() => moveFeedItem(item.id, item.kind, 'up')}
                          onMoveDown={() => moveFeedItem(item.id, item.kind, 'down')}
                          canMoveUp={idx > 0}
                          canMoveDown={idx < feedItems.length - 1}
                        />
                      )}
                      <FeedPost
                        post={
                          item.kind === 'asset'
                            ? {
                                kind: 'asset',
                                id: item.id,
                                previewUrl: item.previewUrl,
                                blurUrl: item.blurUrl,
                                mimeType: item.mimeType,
                                caption: item.caption,
                                // In /app/home embed mode the creator owns the
                                // content and must always see it unblurred.
                                // Otherwise apply the public-visit logic
                                // (free preview slot or active fan subscription).
                                isUnlocked: item.isPublic || isSubscribed,
                              }
                            : {
                                kind: 'link',
                                id: item.id,
                                slug: item.slug,
                                title: item.title,
                                description: item.description,
                                priceCents: item.priceCents,
                                coverUrl: item.coverUrl,
                              }
                        }
                        author={feedAuthor}
                        gradientStops={gradientStops as [string, string]}
                        onLockedClick={() => setShowSubscribePopup(true)}
                        onLinkClick={(slug) => navigate(`/l/${slug}`)}
                        onEditCaption={
                          embed && item.kind === 'asset'
                            ? (next) => setAssetCaption(item.id, next)
                            : undefined
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                // No public assets → placeholder blurred card (per Part 3 spec:
                // "si pas de content en publique visible on met juste un image par défaut
                // blurred dans ce feed"). In /app/home embed we surface the
                // composer instead so the creator gets a one-click way to fill
                // their feed even when it's empty.
                <>
                  {embed && (
                    <CreatePostTrigger onClick={() => setShowCreatePost(true)} />
                  )}
                  {isSubscribed && periodEnd && (
                    <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-3 text-sm mb-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="font-semibold text-green-300">✓ Subscribed</span>
                          <span className="text-white/70 ml-2">
                            {cancelAtPeriodEnd ? 'Ends' : 'Renews'} {periodEnd.slice(0, 10)}
                          </span>
                        </div>
                        <Link to="/fan/subscriptions" className="text-xs text-primary hover:underline">
                          Manage
                        </Link>
                      </div>
                    </div>
                  )}
                  {!isSubscribed && (
                    <button
                      type="button"
                      onClick={() => setShowSubscribePopup(true)}
                      className="relative w-full aspect-square rounded-2xl overflow-hidden border border-white/20"
                    >
                      <div
                        className="absolute inset-0 scale-110 blur-2xl brightness-50"
                        style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                        <Lock className="w-8 h-8" />
                        <span className="text-sm font-semibold">Subscribe to unlock the feed</span>
                        <span
                          className="inline-flex px-4 py-2 rounded-full text-xs font-bold text-black"
                          style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
                        >
                          Discover
                        </span>
                      </div>
                    </button>
                  )}
                </>
              )
            )}

            {!isContentLoading && activeTab === 'content' && (
              <SuggestedCreatorsStrip excludeUserId={creatorUserId} gradientStops={gradientStops as [string, string]} />
            )}

            {!isContentLoading && activeTab === 'wishlist' && (
              <div className="grid grid-cols-2 gap-3">
                {wishlistItems.map((item, index) => {
                  const isFullyGifted = item.max_quantity !== null && item.gifted_count >= item.max_quantity;
                  return (
                    <motion.div key={item.id} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.05 * index }}
                      className={`relative rounded-2xl overflow-hidden border flex flex-col ${isFullyGifted ? 'border-white/10 opacity-60' : 'border-white/20'}`}>
                      <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden relative">
                        {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /> : <span className="text-5xl">{item.emoji || '🎁'}</span>}
                        {item.gift_url && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); window.open(item.gift_url, '_blank', 'noopener'); }}
                            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 flex items-center justify-center transition-colors" title="Open gift link">
                            <ExternalLink className="w-4 h-4 text-white/80" />
                          </button>
                        )}
                        {isFullyGifted && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><span className="text-white text-sm font-semibold">Gifted ✓</span></div>}
                      </div>
                      <div className="p-3 flex flex-col gap-2 bg-black/40 backdrop-blur-sm">
                        <div>
                          <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                          {item.description && <p className="text-[10px] text-white/50 truncate">{item.description}</p>}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}>${(item.price_cents / 100).toLocaleString()}</span>
                          {item.max_quantity !== null && <span className="text-[10px] text-white/40">{item.gifted_count}/{item.max_quantity}</span>}
                        </div>
                        <motion.button type="button" whileHover={!isFullyGifted ? { scale: 1.03 } : {}} whileTap={!isFullyGifted ? { scale: 0.97 } : {}}
                          onClick={() => !isFullyGifted && handleGiftCta(item)} disabled={isFullyGifted}
                          className={`w-full h-9 rounded-xl text-xs font-bold transition-all ${isFullyGifted ? 'bg-white/10 text-white/40 cursor-default' : 'text-black shadow-lg hover:shadow-xl'}`}
                          style={!isFullyGifted ? { background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` } : undefined}>
                          {isFullyGifted ? 'Gifted ✓' : '🎁 Gift this'}
                        </motion.button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {error && <p className="text-sm text-red-400 text-center py-4">{error}</p>}
          </div>}

          {/* Tip, Request & Chat CTAs — hidden when guest chat is active */}
          {!showGuestChat && (showTipsCta || showRequestsCta || showChatCta) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} className="mt-6 space-y-3">
              {showTipsCta && (
                <button
                  type="button"
                  onClick={handleTipCta}
                  className="w-full h-12 rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-lg hover:brightness-110 active:scale-[0.98] transition-all"
                  style={{ background: `linear-gradient(to right, ${gradientStops[0]}cc, ${gradientStops[1]}cc)` }}
                >
                  Send a Tip
                </button>
              )}
              {(showRequestsCta || showChatCta) && (
                <div className="flex gap-3">
                  {showRequestsCta && (
                    <button type="button" onClick={handleRequestCta}
                      style={{ width: showChatCta ? '65%' : '100%' }}
                      className="h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 flex items-center justify-center text-sm font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]">
                      Custom Request
                    </button>
                  )}
                  {showChatCta && (
                    <button type="button" onClick={handleMessageCta}
                      style={{ width: showRequestsCta ? '35%' : '100%' }}
                      className="h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 flex items-center justify-center text-sm font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]">
                      Chat
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.5 }} className="mt-6 flex items-center justify-center gap-2 text-[11px] text-white/40">
            {showAgencyFooter && (
              <>
                {agencyLogoUrl && (
                  <img src={agencyLogoUrl} alt="" className="w-4 h-4 rounded object-contain" />
                )}
                <span>Managed by {agencyName || 'Agency'}</span>
                <span style={{ color: aurora.colors[0] }}>·</span>
              </>
            )}
            <a href="/" className="inline-flex items-center gap-1 hover:text-white/60 transition-colors">
              Powered by <span className="font-semibold">Exclu</span>
            </a>
          </motion.div>
        </div>
      </main>

      {/* ─────────────────────────────────────────────────
          DESKTOP: Two-column layout (PublicLink-inspired)
      ───────────────────────────────────────────────── */}
      <main className="hidden sm:flex relative z-10 flex-1 flex-col">
        <div className={`px-6 lg:px-10 xl:px-16 pt-10 max-w-7xl mx-auto w-full ${shouldShowJoinBanner ? 'pb-[120px]' : 'pb-16'}`}>
          <div
            className="grid gap-8 items-start transition-[grid-template-columns] duration-500 ease-in-out"
            style={{ gridTemplateColumns: photoVisible ? '460px 1fr' : '0px 1fr' }}
          >

            {/* ── LEFT: Sticky photo card ── */}
            <div className="overflow-hidden">
            <AnimatePresence initial={false}>
            {photoVisible && (
            <motion.div
              key="photo-col"
              initial={{ opacity: 0, x: -60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.45, ease: [0.32, 0, 0.67, 0] }}
              className="sticky top-6 self-start"
            >
              {/* Glow is rendered as a downward-only box-shadow on the photo
                  itself so nothing can ever extend above the top edge — the
                  card stays flush with the top of the bio card on the right. */}
              <div
                className="relative w-full rounded-3xl overflow-hidden"
                style={{
                  boxShadow: `0 25px 50px -12px rgba(0,0,0,0.6), 0 40px 80px -20px ${gradientStops[0]}66, 0 60px 100px -30px ${gradientStops[1]}4d`,
                }}
              >
                {/* Photo */}
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={displayName} className="block w-full aspect-[3/4] object-cover" />
                ) : (
                  <div className="flex items-center justify-center bg-exclu-ink" style={{ height: '450px' }}>
                    <span className="text-7xl font-extrabold text-white/20">{displayName.charAt(0).toUpperCase()}</span>
                  </div>
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                {/* Glow at bottom matching aurora */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 opacity-30 pointer-events-none"
                  style={{ background: `linear-gradient(to top, ${gradientStops[0]}40, transparent)` }} />

                {/* Name + badge + handle */}
                <div className="absolute inset-x-6 bottom-6 z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-3xl font-extrabold text-white drop-shadow-lg leading-tight">{displayName}</h1>
                    {profile?.show_certification !== false && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 flex-shrink-0 drop-shadow-lg">
                        <defs><linearGradient id="badge-grad-d" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={gradientStops[0]} /><stop offset="100%" stopColor={gradientStops[1]} /></linearGradient></defs>
                        <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="url(#badge-grad-d)" stroke="url(#badge-grad-d)" />
                        <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2" fill="none" />
                      </svg>
                    )}
                  </div>
                  {profile?.handle && (
                    <p className="text-sm text-white/50 font-medium">@{profile.handle}</p>
                  )}
                  {(profile?.location || profile?.show_available_now) && (
                    <p className="text-xs text-white/60 mt-1.5 flex items-center gap-1.5">
                      {profile?.location && <><MapPin className="w-3 h-3" />{profile.location}</>}
                      {profile?.location && profile?.show_available_now && <span className="mx-0.5">·</span>}
                      {profile?.show_available_now && (
                        <span className="inline-flex items-center gap-1 text-white/80">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: gradientStops[0] }} />
                            <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: gradientStops[0] }} />
                          </span>
                          Available now
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
            )}
            </AnimatePresence>
            </div>

            {/* ── RIGHT: Info card + content card ──
                The column is capped at ~660px (the natural 1fr width at max
                viewport when the photo is visible) and centred with mx-auto.
                This means:
                  • photo visible → column fills its 1fr slot (≤ 660px)
                  • photo hidden  → column stays 660px and centres on the page
                …so Links / Feed / Wishlist all share the same width, matching
                the info card above — no jumping width when the photo collapses.
                When the guest chat is active we also cap the column height so
                the chat fits above the Join banner with a comfortable margin. */}
            <div
              className="flex flex-col gap-6 min-h-0 w-full max-w-[660px] mx-auto"
              style={
                showGuestChat
                  ? {
                      height: shouldShowJoinBanner
                        ? 'calc(100vh - 180px)'
                        : 'calc(100vh - 96px)',
                    }
                  : undefined
              }
            >

              {/* TOP RIGHT: Creator info card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
                className="relative overflow-hidden rounded-3xl border border-white/15 bg-black/60 backdrop-blur-xl p-6 shadow-xl"
              >
                {/* Subtle color glow top-right */}
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${gradientStops[0]}, transparent)` }} />

                <div className="relative z-10 space-y-5">
                  {/* Social + Bio row */}
                  {(activeSocials.length > 0 || profile?.bio) && (
                    <div className="flex gap-5">
                      {/* Left: social bubbles */}
                      {activeSocials.length > 0 && (
                        <div className="flex flex-wrap gap-2.5 shrink-0" style={{ maxWidth: `${6 * 44 + 5 * 10}px` }}>
                          {activeSocials.map(([platform, url]) => {
                            const platformConfig = socialPlatforms[platform];
                            if (!platformConfig) return null;
                            return (
                              <motion.button
                                key={platform}
                                type="button"
                                onClick={() => handleSocialClick(url)}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                                className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center shadow-lg ring-2 ring-white/30 hover:ring-white/60 transition-all"
                                title={platformConfig.label}
                              >
                                <span className="text-white">{platformConfig.icon}</span>
                              </motion.button>
                            );
                          })}
                        </div>
                      )}
                      {/* Right: Bio */}
                      {profile?.bio && (
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-1.5">Bio</p>
                          <p className="text-sm text-white/80 leading-relaxed">{profile.bio}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tip, Request & Chat CTAs */}
                  {(showTipsCta || showRequestsCta || showChatCta) && (
                    <div className="flex gap-3 pt-1">
                      {showRequestsCta && (
                        <button type="button" onClick={handleRequestCta}
                          className="flex-1 h-11 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 flex items-center justify-center text-sm font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]">
                          Custom Request
                        </button>
                      )}
                      {showTipsCta && (
                        <button
                          type="button"
                          onClick={handleTipCta}
                          className="flex-1 h-11 rounded-2xl flex items-center justify-center text-sm font-bold text-white shadow-lg hover:brightness-110 active:scale-[0.98] transition-all"
                          style={{ background: `linear-gradient(to right, ${gradientStops[0]}cc, ${gradientStops[1]}cc)` }}
                        >
                          Send a Tip
                        </button>
                      )}
                      {showChatCta && (
                        <button type="button" onClick={handleMessageCta}
                          className="flex-1 h-11 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 flex items-center justify-center text-sm font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]">
                          Chat
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Guest Chat (inline, desktop) — replaces content card when
                  active. The parent right column is capped to a viewport-
                  derived height above, so flex-1 here makes the chat fill
                  exactly the space between the info card and the banner. */}
              {showGuestChat && creatorProfileId && (
                <div className="flex-1 min-h-0 w-full">
                  <GuestChat
                    variant="inline"
                    profileId={creatorProfileId}
                    creatorUserId={creatorUserId || profile?.id || ''}
                    creatorName={displayName}
                    creatorAvatarUrl={profile?.avatar_url ?? null}
                    tipsEnabled={profile?.tips_enabled ?? false}
                    minTipAmountCents={profile?.min_tip_amount_cents ?? undefined}
                    onClose={closeGuestChat}
                    gradientStops={gradientStops}
                  />
                </div>
              )}

              {/* BOTTOM RIGHT: Tabs + content card — hidden when guest chat is active.
                  Same width across Links / Feed / Wishlist tabs, and matches
                  the info card above so the right column reads as one column. */}
              {!showGuestChat && <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
                className="relative w-full overflow-hidden rounded-3xl border border-white/15 bg-black/60 backdrop-blur-xl shadow-xl"
              >
                {/* Subtle color glow bottom-left */}
                <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full opacity-15 blur-3xl pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${gradientStops[1]}, transparent)` }} />

                <div className="relative z-10">
                  {/* Tabs */}
                  {(links.length > 0 || publicContent.length > 0 || wishlistItems.length > 0) && (
                    <div className="relative px-6 pt-5">
                      <div className="flex gap-6 relative">
                        {hasAnyLinksOrExclusive && (
                          <button onClick={() => setActiveTab('links')}
                            className={`relative pb-3 text-sm font-medium transition-colors ${activeTab === 'links' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
                            Links
                            {activeTab === 'links' && <motion.div layoutId="activeTabDesktop" className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full z-10" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />}
                          </button>
                        )}
                        {(publicContent.length > 0 || profile?.fan_subscription_enabled) && (
                          <button onClick={() => setActiveTab('content')}
                            className={`relative pb-3 text-sm font-medium transition-colors ${activeTab === 'content' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
                            Feed
                            {activeTab === 'content' && <motion.div layoutId="activeTabDesktop" className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full z-10" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />}
                          </button>
                        )}
                        {wishlistItems.length > 0 && (
                          <button onClick={() => setActiveTab('wishlist')}
                            className={`relative pb-3 text-sm font-medium transition-colors ${activeTab === 'wishlist' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
                            Wishlist
                            {activeTab === 'wishlist' && <motion.div layoutId="activeTabDesktop" className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full z-10" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />}
                          </button>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-6 right-6 h-[1px] bg-white/10" />
                    </div>
                  )}

                  {/* Content area — same padding across Links / Feed / Wishlist. */}
                  <div className="p-6 space-y-3">
                    {isContentLoading && (
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => <div key={i} className="w-full h-14 rounded-2xl bg-white/5 animate-pulse" />)}
                      </div>
                    )}
                    {/* Links Tab */}
                    {!isContentLoading && activeTab === 'links' && (
                      <div className="space-y-3">
                        {profile?.exclusive_content_text && (profile.exclusive_content_url || profile.exclusive_content_link_id || links.length > 0) && (
                          <StarBorder
                            as="div"
                            color1={gradientStops[0]}
                            color2={gradientStops[1]}
                            speed="4s"
                            thickness={1}
                            className="w-full cursor-pointer"
                            style={{ borderRadius: profile.exclusive_content_image_url ? '16px' : '12px' }}
                            onClick={() => {
                              if (profile.exclusive_content_url) { window.open(profile.exclusive_content_url, '_blank', 'noopener,noreferrer'); return; }
                              const targetLink = profile.exclusive_content_link_id ? links.find((l) => l.id === profile.exclusive_content_link_id) : links[0];
                              if (targetLink) handleLinkClick(targetLink);
                            }}
                          >
                            {profile.exclusive_content_image_url ? (
                              <div className="relative w-full rounded-2xl overflow-hidden shadow-lg select-none">
                                <img src={profile.exclusive_content_image_url} alt={profile.exclusive_content_text} className="w-full h-44 object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                                <div className="absolute bottom-4 inset-x-4 flex items-center justify-between">
                                  <div className="flex items-center gap-2"><Lock className="w-4 h-4 text-white" /><span className="text-sm font-bold text-white truncate max-w-[260px]">{profile.exclusive_content_text}</span></div>
                                  <ArrowUpRight className="w-4 h-4 text-white/70" />
                                </div>
                              </div>
                            ) : (
                              <div className="w-full h-14 rounded-2xl flex items-center justify-center gap-2 shadow-lg" style={{ background: `linear-gradient(to right, ${gradientStops[0]}cc, ${gradientStops[1]}cc)` }}>
                                <Lock className="w-4 h-4 text-white" /><span className="text-sm font-bold text-white truncate max-w-[300px]">{profile.exclusive_content_text}</span><ArrowUpRight className="w-4 h-4 text-white/70" />
                              </div>
                            )}
                          </StarBorder>
                        )}

                        {links.length > 0 ? (
                          links.map((link, index) => {
                            const priceLabel = `${(link.price_cents / 100).toFixed(2)} ${link.currency}`;
                            return (
                              <motion.button key={link.id} type="button" onClick={() => handleLinkClick(link)}
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.07 * (index + 1) }}
                                className="w-full h-14 rounded-2xl bg-white/8 border border-white/15 hover:bg-white/15 hover:border-white/25 transition-all flex items-center justify-between px-5 group">
                                <div className="flex items-center gap-3">
                                  <Lock className="w-4 h-4 text-white/50" />
                                  <span className="text-white font-medium truncate max-w-[260px]">{link.title}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}>{priceLabel}</span>
                                  <ArrowUpRight className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" />
                                </div>
                              </motion.button>
                            );
                          })
                        ) : null}
                      </div>
                    )}

                    {/* Content Tab — vertical feed. Cards span the full inner
                        width of the card (the outer card is already capped at
                        540px on the Feed tab, so posts feel intimate and
                        centered). */}
                    {!isContentLoading && activeTab === 'content' && (
                      feedItems.length > 0 ? (
                        <div className="w-full">
                          {/* /app/home only — composer above the feed (desktop branch). */}
                          {embed && (
                            <CreatePostTrigger onClick={() => setShowCreatePost(true)} />
                          )}
                          {feedItems.map((item, index) => (
                            <div
                              key={`${item.kind}-${item.id}`}
                              className={`relative ${index > 0 ? 'mt-5 pt-5 border-t border-white/10' : ''}`}
                            >
                              {embed && (
                                <PostVisibilityToggle
                                  postId={item.id}
                                  kind={item.kind}
                                  isPublic={item.isPublic}
                                  onChange={(next) => setItemVisibility(item.id, item.kind, next)}
                                  gradientStops={gradientStops as [string, string]}
                                  onMoveUp={() => moveFeedItem(item.id, item.kind, 'up')}
                                  onMoveDown={() => moveFeedItem(item.id, item.kind, 'down')}
                                  canMoveUp={index > 0}
                                  canMoveDown={index < feedItems.length - 1}
                                />
                              )}
                              <FeedPost
                                post={
                                  item.kind === 'asset'
                                    ? {
                                        kind: 'asset',
                                        id: item.id,
                                        previewUrl: item.previewUrl,
                                        blurUrl: item.blurUrl,
                                        mimeType: item.mimeType,
                                        caption: item.caption,
                                        // In /app/home embed mode the creator owns the
                                // content and must always see it unblurred.
                                // Otherwise apply the public-visit logic
                                // (free preview slot or active fan subscription).
                                isUnlocked: item.isPublic || isSubscribed,
                                      }
                                    : {
                                        kind: 'link',
                                        id: item.id,
                                        slug: item.slug,
                                        title: item.title,
                                        description: item.description,
                                        priceCents: item.priceCents,
                                        coverUrl: item.coverUrl,
                                      }
                                }
                                author={feedAuthor}
                                gradientStops={gradientStops as [string, string]}
                                onLockedClick={() => setShowSubscribePopup(true)}
                                onLinkClick={(slug) => navigate(`/l/${slug}`)}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          {/* /app/home only — let the creator open the composer
                              even when they have no content yet (desktop branch). */}
                          {embed && (
                            <CreatePostTrigger onClick={() => setShowCreatePost(true)} />
                          )}
                          {isSubscribed && periodEnd && (
                            <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-3 text-sm mb-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <span className="font-semibold text-green-300">✓ Subscribed</span>
                                  <span className="text-white/70 ml-2">
                                    {cancelAtPeriodEnd ? 'Ends' : 'Renews'} {periodEnd.slice(0, 10)}
                                  </span>
                                </div>
                                <Link to="/fan/subscriptions" className="text-xs text-primary hover:underline">
                                  Manage
                                </Link>
                              </div>
                            </div>
                          )}
                          {!isSubscribed && (
                            <button
                              type="button"
                              onClick={() => setShowSubscribePopup(true)}
                              className="relative block w-full aspect-[4/5] rounded-3xl overflow-hidden border border-white/10"
                            >
                              <div
                                className="absolute inset-0 scale-125 blur-[42px]"
                                style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }}
                              />
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                                <Lock className="w-8 h-8" />
                                <span className="text-sm font-semibold">Subscribe to unlock the feed</span>
                                <span
                                  className="inline-flex px-4 py-2 rounded-full text-xs font-bold text-black"
                                  style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
                                >
                                  Discover
                                </span>
                              </div>
                            </button>
                          )}
                        </>
                      )
                    )}

                    {!isContentLoading && activeTab === 'content' && (
                      <div className="w-full mt-6 pt-6 border-t border-white/10">
                        <SuggestedCreatorsStrip excludeUserId={creatorUserId} gradientStops={gradientStops as [string, string]} />
                      </div>
                    )}

                    {/* Wishlist Tab */}
                    {!isContentLoading && activeTab === 'wishlist' && (
                      <div className="grid grid-cols-3 gap-3">
                        {wishlistItems.map((item, index) => {
                          const isFullyGifted = item.max_quantity !== null && item.gifted_count >= item.max_quantity;
                          return (
                            <motion.div key={item.id} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.3, delay: 0.05 * index }}
                              className={`relative rounded-2xl overflow-hidden border flex flex-col ${isFullyGifted ? 'border-white/10 opacity-60' : 'border-white/15'}`}>
                              <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden relative">
                                {item.image_url ? (
                                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-4xl">{item.emoji || '🎁'}</span>
                                )}
                                {item.gift_url && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); window.open(item.gift_url, '_blank', 'noopener'); }}
                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 border border-white/10 flex items-center justify-center transition-colors"
                                    title="Open gift link">
                                    <ExternalLink className="w-3.5 h-3.5 text-white/80" />
                                  </button>
                                )}
                                {isFullyGifted && (
                                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <span className="text-white text-xs font-semibold">Gifted ✓</span>
                                  </div>
                                )}
                              </div>
                              <div className="p-3 flex flex-col gap-2 bg-black/40 backdrop-blur-sm">
                                <div>
                                  <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                                  {item.description && <p className="text-[10px] text-white/50 truncate">{item.description}</p>}
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}>
                                    ${(item.price_cents / 100).toLocaleString()}
                                  </span>
                                  {item.max_quantity !== null && <span className="text-[9px] text-white/40">{item.gifted_count}/{item.max_quantity}</span>}
                                </div>
                                <motion.button type="button" whileHover={!isFullyGifted ? { scale: 1.03 } : {}} whileTap={!isFullyGifted ? { scale: 0.97 } : {}}
                                  onClick={() => !isFullyGifted && handleGiftCta(item)} disabled={isFullyGifted}
                                  className={`w-full h-8 rounded-xl text-[11px] font-bold transition-all ${isFullyGifted ? 'bg-white/10 text-white/40 cursor-default' : 'text-black shadow-lg hover:shadow-xl'}`}
                                  style={!isFullyGifted ? { background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` } : undefined}>
                                  {isFullyGifted ? 'Gifted ✓' : '🎁 Gift this'}
                                </motion.button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}

                    {error && <p className="text-sm text-red-400 text-center py-4">{error}</p>}
                  </div>
                </div>
              </motion.div>}

              {/* Footer */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.5 }} className="flex items-center justify-center gap-2 text-[11px] text-white/30 pb-2">
                {showAgencyFooter && (
                  <>
                    {agencyLogoUrl && (
                      <img src={agencyLogoUrl} alt="" className="w-4 h-4 rounded object-contain" />
                    )}
                    <span>Managed by {agencyName || 'Agency'}</span>
                    <span style={{ color: aurora.colors[0] }}>·</span>
                  </>
                )}
                <a href="/" className="inline-flex items-center gap-1 hover:text-white/50 transition-colors">
                  Powered by <span className="font-semibold">Exclu</span>
                </a>
              </motion.div>
            </div>
          </div>
        </div>
      </main>
      {/* Exclu join banner */}
      {shouldShowJoinBanner && (
        <div className="fixed inset-x-4 bottom-4 z-30">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/85 border border-exclu-arsenic/60 px-4 py-3 backdrop-blur-md shadow-lg shadow-black/60">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <img src={logo} alt="Exclu" className="h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-white">
                  Start selling your own premium content without commission with Exclu.
                </span>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="rounded-full text-xs px-3 py-1.5 bg-white text-black hover:bg-slate-100"
              onClick={() => {
                window.location.href = '/auth?mode=signup';
              }}
            >
              Join now
            </Button>
          </div>
        </div>
      )}

      {/* Content Lightbox Modal */}
      {selectedContent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setSelectedContent(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedContent(null)}
            className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <div
            className="max-w-3xl max-h-[85vh] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedContent.mime_type?.startsWith('video/') ? (
              <video
                src={selectedContent.previewUrl}
                className="w-full max-h-[85vh] rounded-2xl"
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={selectedContent.previewUrl}
                alt={selectedContent.title}
                className="w-full max-h-[85vh] object-contain rounded-2xl"
              />
            )}
          </div>
        </motion.div>
      )}

      {/* Tip Modal */}
      {showTipModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => { setShowTipModal(false); setTipAmount(null); setTipCustomAmount(''); setTipMessage(''); setTipAnonymous(false); setTipFanName(''); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-3xl border border-white/20 bg-black/95 backdrop-blur-xl p-6 space-y-5 overflow-y-auto max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {profile?.avatar_url && (
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/20">
                    <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-white">Send a Tip</h3>
                  <p className="text-xs text-white/50">to {displayName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowTipModal(false); setTipAmount(null); setTipCustomAmount(''); setTipMessage(''); setTipAnonymous(false); setTipFanName(''); }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Preset amounts */}
            <div>
              <p className="text-xs text-white/50 mb-3">Choose an amount</p>
              <div className="grid grid-cols-4 gap-2">
                {tipPresets.map((cents) => (
                  <button
                    key={cents}
                    type="button"
                    onClick={() => { setTipAmount(cents); setTipCustomAmount(''); }}
                    className={`h-12 rounded-2xl text-sm font-bold transition-all ${
                      tipAmount === cents
                        ? 'text-white ring-2 ring-white/40'
                        : 'bg-white/10 text-white/80 hover:bg-white/15'
                    }`}
                    style={tipAmount === cents ? { background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` } : undefined}
                  >
                    ${cents / 100}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom amount */}
            <div className="space-y-1.5">
              <p className="text-xs text-white/50">Or enter a custom amount</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-medium">$</span>
                <Input
                  type="number"
                  min={(profile?.min_tip_amount_cents || 500) / 100}
                  step="0.01"
                  value={tipCustomAmount}
                  onChange={(e) => { setTipCustomAmount(e.target.value); setTipAmount(null); }}
                  placeholder={`${((profile?.min_tip_amount_cents || 500) / 100).toFixed(2)} min`}
                  className="h-11 bg-white/5 border-white/20 text-white placeholder:text-white/30 text-sm rounded-xl pl-7"
                />
              </div>
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <p className="text-xs text-white/50">Message (optional)</p>
              <Textarea
                value={tipMessage}
                onChange={(e) => setTipMessage(e.target.value)}
                placeholder="Say something nice..."
                maxLength={500}
                rows={2}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30 text-sm rounded-xl resize-none"
              />
            </div>

            {/* Anonymous toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                  tipAnonymous ? 'bg-white/20 border-white/40' : 'border-white/20'
                }`}
                onClick={() => setTipAnonymous(!tipAnonymous)}
              >
                {tipAnonymous && <span className="text-white text-xs font-bold">✓</span>}
              </div>
              <span className="text-sm text-white/70">Stay anonymous</span>
            </label>

            {/* Guest name (only for non-logged-in, non-anonymous users) */}
            <AnimatePresence>
              {!currentFanId && !tipAnonymous && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1.5">
                    <p className="text-xs text-white/50">Your name (optional)</p>
                    <Input
                      type="text"
                      value={tipFanName}
                      onChange={(e) => setTipFanName(e.target.value)}
                      placeholder="How should the creator know you?"
                      maxLength={100}
                      className="h-11 bg-white/5 border-white/20 text-white placeholder:text-white/30 text-sm rounded-xl"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="button"
              onClick={handleTipSubmit}
              disabled={isTipSubmitting || (!tipAmount && !tipCustomAmount)}
              className="w-full h-12 rounded-2xl text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
            >
              {isTipSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4" />
                  Send Tip — ${tipAmount ? (tipAmount / 100).toFixed(2) : tipCustomAmount || '0.00'}
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Gift Modal */}
      {showGiftModal && selectedGiftItem && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowGiftModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-3xl border border-white/20 bg-black/95 backdrop-blur-xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
                  {selectedGiftItem.image_url ? (
                    <img src={selectedGiftItem.image_url} alt={selectedGiftItem.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">{selectedGiftItem.emoji || '🎁'}</span>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Gift {selectedGiftItem.name}</h3>
                  <p className="text-sm font-semibold" style={{ backgroundImage: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    ${(selectedGiftItem.price_cents / 100).toLocaleString()} + 15% fee
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setShowGiftModal(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-white/50">Message (optional)</p>
              <Textarea
                value={giftMessage}
                onChange={(e) => setGiftMessage(e.target.value)}
                placeholder={`Leave a message for ${displayName}...`}
                maxLength={500}
                rows={2}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30 text-sm rounded-xl resize-none"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                  giftAnonymous ? 'bg-white/20 border-white/40' : 'border-white/20'
                }`}
                onClick={() => setGiftAnonymous(!giftAnonymous)}
              >
                {giftAnonymous && <span className="text-white text-xs font-bold">✓</span>}
              </div>
              <span className="text-sm text-white/70">Stay anonymous</span>
            </label>

            <AnimatePresence>
              {!currentFanId && !giftAnonymous && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1.5">
                    <p className="text-xs text-white/50">Your name (optional)</p>
                    <Input
                      type="text"
                      value={giftFanName}
                      onChange={(e) => setGiftFanName(e.target.value)}
                      placeholder="How should the creator know you?"
                      maxLength={100}
                      className="h-11 bg-white/5 border-white/20 text-white placeholder:text-white/30 text-sm rounded-xl"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <p className="text-xs text-white/50 leading-relaxed">
                The money goes directly to {displayName}'s account. A 15% processing fee is added at checkout.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGiftSubmit}
              disabled={isGiftSubmitting}
              className="w-full h-12 rounded-2xl text-sm font-bold text-black shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
            >
              {isGiftSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Processing...</>
              ) : (
                <>🎁 Gift for ${(selectedGiftItem.price_cents / 100).toLocaleString()}</>
              )}
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Custom Request Modal */}
      {showRequestModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => { setShowRequestModal(false); setRequestDescription(''); setRequestAmount(''); setRequestGate({ email: requestGate.email, country: null, ageAccepted: false }); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-3xl border border-white/20 bg-black/95 backdrop-blur-xl p-6 space-y-5 overflow-y-auto max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {profile?.avatar_url && (
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/20">
                    <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-white">Custom Request</h3>
                  <p className="text-xs text-white/50">to {displayName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowRequestModal(false); setRequestDescription(''); setRequestAmount(''); setRequestGate({ email: requestGate.email, country: null, ageAccepted: false }); }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <p className="text-xs text-white/50">Describe what you'd like</p>
              <Textarea
                value={requestDescription}
                onChange={(e) => setRequestDescription(e.target.value)}
                placeholder="I'd love a custom photo of..."
                maxLength={2000}
                rows={4}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30 text-sm rounded-xl resize-none"
              />
              <p className="text-[10px] text-white/30 text-right">{requestDescription.length}/2000</p>
            </div>

            {/* Proposed amount */}
            <div className="space-y-1.5">
              <p className="text-xs text-white/50">Your proposed price</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-medium">$</span>
                <Input
                  type="number"
                  min={(profile?.min_custom_request_cents || 2000) / 100}
                  step="1"
                  value={requestAmount}
                  onChange={(e) => setRequestAmount(e.target.value)}
                  placeholder={`${((profile?.min_custom_request_cents || 2000) / 100).toFixed(0)} min`}
                  className="h-11 bg-white/5 border-white/20 text-white placeholder:text-white/30 text-sm rounded-xl pl-7"
                />
              </div>
              <p className="text-[10px] text-white/30">
                Minimum: ${((profile?.min_custom_request_cents || 2000) / 100).toFixed(0)} · A 15% processing fee is added at checkout
              </p>
            </div>

            {/* Pre-checkout gate: email (guests only) + country + 18+ */}
            <PreCheckoutGate
              value={requestGate}
              onChange={setRequestGate}
              emailLocked={!!currentFanId}
              requireEmail={!currentFanId}
              countryHiddenIfSignedIn
              signedInCountry={signedInCountry}
            />

            {/* Info — Sale model: refund-on-decline */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <p className="text-xs text-white/60 leading-relaxed">
                Your card is <strong className="text-white/80">charged at checkout</strong>. If the creator declines or doesn't respond within 6 days, you are <strong className="text-white/80">refunded in full automatically</strong>. {!currentFanId && 'After payment, you\'ll be invited to create an account to track and chat with the creator.'}
              </p>
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleRequestSubmit}
              disabled={isRequestSubmitting || !requestDescription || !requestAmount || !isPreCheckoutReady(requestGate, !currentFanId)}
              className="w-full h-12 rounded-2xl text-sm font-bold text-black shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }}
            >
              {isRequestSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4" />
                  Pay & send request{requestAmount ? ` — $${(parseFloat(requestAmount) * 1.15).toFixed(2)}` : ''}
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* Fan → creator subscription popup (Discover) */}
      <SubscriptionPopup
        open={showSubscribePopup}
        onClose={() => setShowSubscribePopup(false)}
        creator={{
          profileId: creatorProfileId || '',
          displayName: profile?.display_name || profile?.handle || 'creator',
          handle: profile?.handle || '',
          avatarUrl: profile?.avatar_url ?? null,
          priceCents: profile?.fan_subscription_price_cents ?? 500,
        }}
        gradientStops={gradientStops as [string, string]}
      />

      {/* /app/home only — composer modal. Reuses the asset library, posts a
          price=0 link with link_media + visibility flag, then bumps a refresh
          key so the feed effects re-fetch and the new post appears. */}
      {embed && creatorUserId && (
        <CreatePostDialog
          open={showCreatePost}
          onClose={() => setShowCreatePost(false)}
          creatorUserId={creatorUserId}
          profileId={activeProfileId}
          onPosted={() => setFeedRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
};

export default CreatorPublic;
