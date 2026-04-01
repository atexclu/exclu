import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ArrowUpRight, Image as ImageIcon, Globe, X, Play, MapPin, DollarSign, MessageSquare, Loader2, ArrowLeft, ExternalLink } from 'lucide-react';
import StarBorder from '@/components/ui/StarBorder';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import logo from '@/assets/logo-white.svg';
import Aurora from '@/components/ui/Aurora';
import { getAuroraGradient } from '@/lib/auroraGradients';
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
  stripe_connect_status?: string | null;
  payout_setup_complete?: boolean | null;
  tips_enabled?: boolean | null;
  custom_requests_enabled?: boolean | null;
  min_tip_amount_cents?: number | null;
  min_custom_request_cents?: number | null;
  show_agency_branding?: boolean | null;
  chat_enabled?: boolean | null;
}

interface CreatorLinkCard {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  slug: string;
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

const CreatorPublic = () => {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<CreatorProfileData | null>(null);
  const [links, setLinks] = useState<CreatorLinkCard[]>([]);
  const [publicContent, setPublicContent] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'links' | 'content' | 'wishlist'>('links');
  const [selectedContent, setSelectedContent] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeactivated, setIsDeactivated] = useState(false);
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
  const [requestEmail, setRequestEmail] = useState('');
  const [requestPassword, setRequestPassword] = useState('');
  const [requestEmailExists, setRequestEmailExists] = useState<boolean | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [currentFanId, setCurrentFanId] = useState<string | null>(null);
  const [isCreatorAccount, setIsCreatorAccount] = useState(false);

  // Wishlist state
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [selectedGiftItem, setSelectedGiftItem] = useState<any | null>(null);
  const [giftMessage, setGiftMessage] = useState('');
  const [giftAnonymous, setGiftAnonymous] = useState(false);
  const [isGiftSubmitting, setIsGiftSubmitting] = useState(false);

  // Desktop photo collapse on scroll (only when >5 links)
  const [photoVisible, setPhotoVisible] = useState(true);
  useEffect(() => {
    const threshold = window.innerHeight * 0.4;
    const handleScroll = () => {
      if (links.length <= 5) return;
      const shouldShow = window.scrollY < threshold;
      setPhotoVisible((prev) => (prev !== shouldShow ? shouldShow : prev));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [links.length]);

  // Check if a fan (not a creator) is logged in
  useEffect(() => {
    const checkFan = async (userId: string | undefined) => {
      if (!userId) {
        setCurrentFanId(null);
        setIsCreatorAccount(false);
        return;
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_creator')
        .eq('id', userId)
        .maybeSingle();

      if (prof?.is_creator) {
        setCurrentFanId(null);
        setIsCreatorAccount(true);
      } else {
        setCurrentFanId(userId);
        setIsCreatorAccount(false);
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

  // Show tip success toast on redirect from Stripe (runs once on mount)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tip_success') === 'true') {
      toast.success('Thank you! Your tip has been sent.');
      const url = new URL(window.location.href);
      url.searchParams.delete('tip_success');
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
          .select('id, user_id, username, display_name, avatar_url, bio, is_active, theme_color, aurora_gradient, social_links, show_join_banner, show_certification, show_deeplinks, show_available_now, stripe_connect_status, stripe_account_id, location, exclusive_content_text, exclusive_content_link_id, exclusive_content_url, exclusive_content_image_url, tips_enabled, custom_requests_enabled, min_tip_amount_cents, min_custom_request_cents, chat_enabled')
          .eq('username', handle)
          .maybeSingle();

        if (!isMounted) return;

        if (cpData) {
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

          // Load account-level data (premium status, Stripe) from parent profiles row
          const { data: parentProfile } = await supabase
            .from('profiles')
            .select('is_creator_subscribed, stripe_connect_status, stripe_account_id, payout_setup_complete')
            .eq('id', cpData.user_id)
            .maybeSingle();

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
            stripe_connect_status: parentProfile?.stripe_connect_status ?? cpData.stripe_connect_status,
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
        }

        // ── Step 2: Fallback to profiles table (backward compat) ──
        if (!profileData) {
          const { data: fallbackData, error: profileError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, bio, handle, location, is_creator, theme_color, aurora_gradient, social_links, is_creator_subscribed, show_join_banner, show_certification, show_deeplinks, show_available_now, stripe_connect_status, exclusive_content_text, exclusive_content_link_id, exclusive_content_url, exclusive_content_image_url, tips_enabled, custom_requests_enabled, min_tip_amount_cents, min_custom_request_cents')
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

          userId = fallbackData.id;
          profileData = fallbackData;

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
        // Always load links regardless of Stripe status — links should be visible
        // on the public profile. The purchase flow itself checks Stripe readiness.
        {
          let linksQuery = supabase
            .from('links')
            .select('id, title, description, price_cents, currency, slug, status, show_on_profile')
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

        // ── Step 4: Load public content ──
        let assetsQuery = supabase
          .from('assets')
          .select('id, title, storage_path, mime_type')
          .eq('is_public', true)
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
          const withUrls = await Promise.all(
            publicData.map(async (item) => {
              if (!item.storage_path) return { ...item, previewUrl: null };
              const { data: signed, error: signError } = await supabase.storage
                .from('paid-content')
                .createSignedUrl(item.storage_path, 60 * 60);
              if (signError) console.warn('Signed URL failed for', item.storage_path, signError.message);
              return { ...item, previewUrl: signed?.signedUrl || null };
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

        setProfile(profileData as CreatorProfileData);
        setCreatorUserId(userId);
        setCreatorProfileId(profileId);

        // Increment profile view count (best-effort)
        if (profileData.handle) {
          supabase.functions
            .invoke('increment-profile-view', {
              body: { handle: profileData.handle, profile_id: profileId || undefined },
            })
            .catch(() => {});
        }

        setIsLoading(false);
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
  }, [handle]);

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
    if (!currentFanId) {
      if (isCreatorAccount) {
        toast.info('You need a fan account to send gifts.');
      }
      navigate(`/fan/signup?creator=${handle}`);
      return;
    }
    setSelectedGiftItem(item);
    setGiftMessage('');
    setGiftAnonymous(false);
    setShowGiftModal(true);
  };

  const handleGiftSubmit = async () => {
    if (!selectedGiftItem || !currentFanId) return;
    setIsGiftSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-gift-checkout', {
        body: {
          wishlist_item_id: selectedGiftItem.id,
          profile_id: creatorProfileId || null,
          message: giftMessage || null,
          is_anonymous: giftAnonymous,
        },
      });
      if (error || !data?.fields) {
        throw new Error(data?.error || 'Unable to start checkout');
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
    setShowRequestModal(true);
  };

  const handleMessageCta = async () => {
    if (!creatorProfileId) return;
    let fanId = currentFanId;

    if (!fanId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate(`/fan/signup?action=chat&creator=${handle}&profile=${creatorProfileId}`);
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('is_creator')
        .eq('id', user.id)
        .maybeSingle();

      if (prof?.is_creator) {
        navigate(`/fan/signup?action=chat&creator=${handle}&profile=${creatorProfileId}`);
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

  const checkEmailExists = async (email: string) => {
    if (!email || !email.includes('@')) {
      setRequestEmailExists(null);
      return;
    }
    setIsCheckingEmail(true);
    try {
      const { data } = await supabase.functions.invoke('check-fan-email', {
        body: { email },
      });
      setRequestEmailExists(data?.exists === true);
    } catch {
      setRequestEmailExists(null);
    } finally {
      setIsCheckingEmail(false);
    }
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
        throw new Error(data?.error || 'Unable to start checkout');
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

    // Guest validation
    if (!currentFanId) {
      if (!requestEmail || !requestEmail.includes('@')) {
        toast.error('Please enter your email address');
        return;
      }
      if (requestEmailExists === false && (!requestPassword || requestPassword.length < 6)) {
        toast.error('Please enter a password (min 6 characters) to create your account');
        return;
      }
    }

    setIsRequestSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const requestBody: Record<string, unknown> = {
        creator_id: creatorUserId || profile.id,
        profile_id: creatorProfileId || null,
        description: requestDescription,
        proposed_amount_cents: amountCents,
      };

      if (!currentFanId) {
        requestBody.fan_email = requestEmail;
        if (requestEmailExists === false && requestPassword) {
          requestBody.fan_password = requestPassword;
        }
      }

      const { data, error } = await supabase.functions.invoke('create-request-checkout', {
        body: requestBody,
        headers,
      });

      if (error || !data?.fields) {
        throw new Error(data?.error || 'Unable to start checkout');
      }

      // Submit QuickPay form (pre-auth: funds held, not charged)
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
  const socialLinks = profile?.social_links || {};
  const activeSocials = Object.entries(socialLinks).filter(([_, url]) => url && url.trim() !== '');
  const isPremium = profile?.is_creator_subscribed === true;
  const shouldShowJoinBanner = !isPremium || (isPremium && profile?.show_join_banner !== false);
  // Payout setup is NOT required to sell/receive — earnings go to wallet.
  // Tips/gifts/requests are always available if the creator has enabled them.
  const showTipsCta = profile?.tips_enabled === true;
  const showRequestsCta = profile?.custom_requests_enabled === true;
  const showChatCta = profile?.chat_enabled === true;
  const tipPresets = [500, 1000, 2500, 5000];
  const showAgencyFooter = profile?.show_agency_branding !== false && (agencyName || agencyLogoUrl);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-exclu-ink to-black text-white flex flex-col relative overflow-x-hidden">
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
          MOBILE: Hero image header (unchanged)
      ───────────────────────────────────────────────── */}
      <motion.div
        className="sm:hidden relative -mx-4 overflow-hidden z-10"
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
          MOBILE: Vertical single-column layout
      ───────────────────────────────────────────────── */}
      <main className="sm:hidden relative z-10 flex-1 flex flex-col px-4 pt-4 pb-24">
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

          {/* Tabs */}
          {(links.length > 0 || publicContent.length > 0 || wishlistItems.length > 0) && (
            <div className="relative mb-6">
              <div className="flex justify-center gap-8 relative">
                {(links.length > 0 || publicContent.length > 0) && (
                  <button onClick={() => setActiveTab('links')} className={`relative py-3 text-sm font-medium transition-colors ${activeTab === 'links' ? 'text-white' : 'text-white/50 hover:text-white/70'}`}>
                    Links
                    {activeTab === 'links' && <motion.div layoutId="activeTabMobile" className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full z-10" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />}
                  </button>
                )}
                {publicContent.length > 0 && (
                  <button onClick={() => setActiveTab('content')} className={`relative py-3 text-sm font-medium transition-colors ${activeTab === 'content' ? 'text-white' : 'text-white/50 hover:text-white/70'}`}>
                    Content
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

          {/* Tab content */}
          <div className="flex-1 space-y-3">
            {isLoading && <p className="text-sm text-white/60 text-center py-4">Loading content…</p>}

            {!isLoading && activeTab === 'links' && (
              <div className="space-y-3">
                {profile?.exclusive_content_text && (profile.exclusive_content_url || profile.exclusive_content_link_id) && (
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
                }) : (
                  !(profile?.exclusive_content_text && (profile.exclusive_content_url || profile.exclusive_content_link_id)) && (
                    <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 text-sm text-white/70 text-center">No exclusive content available yet.</div>
                  )
                )}
              </div>
            )}

            {!isLoading && activeTab === 'content' && publicContent.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {publicContent.map((content, index) => {
                  const isVideo = content.mime_type?.startsWith('video/');
                  return (
                    <motion.div key={content.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: 0.05 * index }}
                      className="relative aspect-square rounded-2xl overflow-hidden bg-white/10 backdrop-blur-sm border border-white/20 group cursor-pointer"
                      onClick={() => setSelectedContent(content)}>
                      {content.previewUrl ? (isVideo ? (
                        <video src={content.previewUrl} className="w-full h-full object-cover" muted loop playsInline />
                      ) : (
                        <img src={content.previewUrl} alt={content.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      )) : (
                        <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-8 h-8 text-white/40" /></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm border border-white/20">
                            <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
            {!isLoading && activeTab === 'content' && publicContent.length === 0 && (
              <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-sm p-4 text-sm text-white/70 text-center">No public content available yet.</div>
            )}

            {!isLoading && activeTab === 'wishlist' && (
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

            {error && !isLoading && <p className="text-sm text-red-400 text-center py-4">{error}</p>}
          </div>

          {/* Tip, Request & Chat CTAs */}
          {!isLoading && (showTipsCta || showRequestsCta || showChatCta) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} className="mt-6 space-y-3">
              {showTipsCta && (
                <StarBorder
                  as="button"
                  type="button"
                  onClick={handleTipCta}
                  color1={gradientStops[0]}
                  color2={gradientStops[1]}
                  speed="4s"
                  thickness={1}
                  className="w-full"
                  style={{ width: '100%' }}
                >
                  <div className="h-12 w-full rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-lg"
                    style={{ background: `linear-gradient(to right, ${gradientStops[0]}cc, ${gradientStops[1]}cc)` }}>
                    Send a Tip
                  </div>
                </StarBorder>
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
        <div className="px-6 lg:px-10 xl:px-16 pt-10 pb-16 max-w-7xl mx-auto w-full">
          <div
            className="grid gap-8 items-start transition-[grid-template-columns] duration-500 ease-in-out"
            style={{ gridTemplateColumns: photoVisible ? '400px 1fr' : '0px 1fr' }}
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
              {/* Glow ring behind the photo card */}
              <div className="absolute -inset-3 rounded-[2rem] opacity-40 blur-2xl pointer-events-none"
                style={{ background: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})` }} />
              <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl shadow-black/60">
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

            {/* ── RIGHT: Info card + content card ── */}
            <div className="flex flex-col gap-6">

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
                  {!isLoading && (showTipsCta || showRequestsCta || showChatCta) && (
                    <div className="flex gap-3 pt-1">
                      {showRequestsCta && (
                        <button type="button" onClick={handleRequestCta}
                          className="flex-1 h-11 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 flex items-center justify-center text-sm font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]">
                          Custom Request
                        </button>
                      )}
                      {showTipsCta && (
                        <StarBorder
                          as="button"
                          type="button"
                          onClick={handleTipCta}
                          color1={gradientStops[0]}
                          color2={gradientStops[1]}
                          speed="4s"
                          thickness={1}
                          className="flex-1"
                          style={{ width: '100%' }}
                        >
                          <div className="h-11 w-full rounded-2xl flex items-center justify-center text-sm font-bold text-white shadow-lg"
                            style={{ background: `linear-gradient(to right, ${gradientStops[0]}cc, ${gradientStops[1]}cc)` }}>
                            Send a Tip
                          </div>
                        </StarBorder>
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

              {/* BOTTOM RIGHT: Tabs + content card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
                className="relative overflow-hidden rounded-3xl border border-white/15 bg-black/60 backdrop-blur-xl shadow-xl"
              >
                {/* Subtle color glow bottom-left */}
                <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full opacity-15 blur-3xl pointer-events-none"
                  style={{ background: `radial-gradient(circle, ${gradientStops[1]}, transparent)` }} />

                <div className="relative z-10">
                  {/* Tabs */}
                  {(links.length > 0 || publicContent.length > 0 || wishlistItems.length > 0) && (
                    <div className="relative px-6 pt-5">
                      <div className="flex gap-6 relative">
                        {(links.length > 0 || publicContent.length > 0) && (
                          <button onClick={() => setActiveTab('links')}
                            className={`relative pb-3 text-sm font-medium transition-colors ${activeTab === 'links' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
                            Links
                            {activeTab === 'links' && <motion.div layoutId="activeTabDesktop" className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full z-10" style={{ background: `linear-gradient(to right, ${gradientStops[0]}, ${gradientStops[1]})` }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} />}
                          </button>
                        )}
                        {publicContent.length > 0 && (
                          <button onClick={() => setActiveTab('content')}
                            className={`relative pb-3 text-sm font-medium transition-colors ${activeTab === 'content' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}>
                            Content
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

                  {/* Content area */}
                  <div className="p-6 space-y-3">
                    {isLoading && <p className="text-sm text-white/60 text-center py-8">Loading content…</p>}

                    {/* Links Tab */}
                    {!isLoading && activeTab === 'links' && (
                      <div className="space-y-3">
                        {profile?.exclusive_content_text && (profile.exclusive_content_url || profile.exclusive_content_link_id) && (
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
                        ) : (
                          !(profile?.exclusive_content_text && (profile.exclusive_content_url || profile.exclusive_content_link_id)) && (
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/50 text-center">No exclusive content available yet.</div>
                          )
                        )}
                      </div>
                    )}

                    {/* Content Tab */}
                    {!isLoading && activeTab === 'content' && publicContent.length > 0 && (
                      <div className="grid grid-cols-3 gap-3">
                        {publicContent.map((content, index) => {
                          const isVideo = content.mime_type?.startsWith('video/');
                          return (
                            <motion.div key={content.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.3, delay: 0.05 * index }}
                              className="relative aspect-square rounded-2xl overflow-hidden bg-white/5 border border-white/10 group cursor-pointer"
                              onClick={() => setSelectedContent(content)}>
                              {content.previewUrl ? (isVideo ? (
                                <video src={content.previewUrl} className="w-full h-full object-cover" muted loop playsInline />
                              ) : (
                                <img src={content.previewUrl} alt={content.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                              )) : (
                                <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-8 h-8 text-white/30" /></div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                              {isVideo && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm border border-white/20">
                                    <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                    {!isLoading && activeTab === 'content' && publicContent.length === 0 && (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/50 text-center">No public content available yet.</div>
                    )}

                    {/* Wishlist Tab */}
                    {!isLoading && activeTab === 'wishlist' && (
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

                    {error && !isLoading && <p className="text-sm text-red-400 text-center py-4">{error}</p>}
                  </div>
                </div>
              </motion.div>

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
                    ${(selectedGiftItem.price_cents / 100).toLocaleString()} + 5% fee
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

            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <p className="text-xs text-white/50 leading-relaxed">
                The money goes directly to {displayName}'s account. A 5% processing fee is added at checkout.
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
          onClick={() => { setShowRequestModal(false); setRequestDescription(''); setRequestAmount(''); setRequestEmail(''); setRequestPassword(''); setRequestEmailExists(null); }}
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
                onClick={() => { setShowRequestModal(false); setRequestDescription(''); setRequestAmount(''); setRequestEmail(''); setRequestPassword(''); setRequestEmailExists(null); }}
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
                Minimum: ${((profile?.min_custom_request_cents || 2000) / 100).toFixed(0)} · A 5% processing fee is added at checkout
              </p>
            </div>

            {/* Email (only for guests) */}
            {!currentFanId && (
              <div className="space-y-1.5">
                <p className="text-xs text-white/50">Your email</p>
                <div className="relative">
                  <Input
                    type="email"
                    value={requestEmail}
                    onChange={(e) => {
                      setRequestEmail(e.target.value);
                      setRequestEmailExists(null);
                      setRequestPassword('');
                    }}
                    onBlur={() => checkEmailExists(requestEmail)}
                    placeholder="your@email.com"
                    className="h-11 bg-white/5 border-white/20 text-white placeholder:text-white/30 text-sm rounded-xl"
                  />
                  {isCheckingEmail && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 animate-spin" />
                  )}
                </div>
                {requestEmailExists === true && (
                  <p className="text-[10px] text-lime-400/70">This email is linked to an existing account. Your request will be associated with it.</p>
                )}
              </div>
            )}

            {/* Password (only for guests with new email) */}
            <AnimatePresence>
              {!currentFanId && requestEmailExists === false && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1.5">
                    <p className="text-xs text-white/50">Create a password for your account</p>
                    <Input
                      type="password"
                      value={requestPassword}
                      onChange={(e) => setRequestPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="h-11 bg-white/5 border-white/20 text-white placeholder:text-white/30 text-sm rounded-xl"
                    />
                    <p className="text-[10px] text-white/40">An account will be created so you can track your request</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Info */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <p className="text-xs text-white/60 leading-relaxed">
                Your card will be <strong className="text-white/80">authorized but not charged</strong> until the creator accepts.
                If they decline or don't respond within 6 days, the hold is automatically released.
              </p>
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleRequestSubmit}
              disabled={isRequestSubmitting || !requestDescription || !requestAmount || (!currentFanId && (!requestEmail || !requestEmail.includes('@') || isCheckingEmail || (requestEmailExists === false && (!requestPassword || requestPassword.length < 6))))}
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
                  Pay & send request{requestAmount ? ` — $${(parseFloat(requestAmount) * 1.05).toFixed(2)}` : ''}
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default CreatorPublic;
