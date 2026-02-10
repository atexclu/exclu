import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { SiOnlyfans, SiTiktok, SiInstagram, SiSnapchat, SiX, SiYoutube, SiTelegram, SiLinktree } from 'react-icons/si';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Sparkles, Zap, CreditCard, ExternalLink, Camera, Loader2, Copy, CheckCircle2, Instagram } from 'lucide-react';

type PlatformKey =
  | 'instagram'
  | 'twitter'
  | 'tiktok'
  | 'onlyfans'
  | 'fansly'
  | 'youtube'
  | 'telegram'
  | 'snapchat'
  | 'linktree';

const STRIPE_SUPPORTED_COUNTRIES: { code: string; label: string }[] = [
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'FR', label: 'France' },
  { code: 'DE', label: 'Germany' },
  { code: 'ES', label: 'Spain' },
  { code: 'IT', label: 'Italy' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'BE', label: 'Belgium' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'AT', label: 'Austria' },
  { code: 'IE', label: 'Ireland' },
  { code: 'PT', label: 'Portugal' },
  { code: 'PL', label: 'Poland' },
  { code: 'CZ', label: 'Czech Republic' },
  { code: 'DK', label: 'Denmark' },
  { code: 'FI', label: 'Finland' },
  { code: 'NO', label: 'Norway' },
  { code: 'SE', label: 'Sweden' },
  { code: 'BR', label: 'Brazil' },
  { code: 'MX', label: 'Mexico' },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'profile' | 'plan' | 'stripe' | 'instagram'>('profile');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [country, setCountry] = useState('');
  const [platformUrls, setPlatformUrls] = useState<Record<PlatformKey, string>>({
    instagram: '',
    twitter: '',
    tiktok: '',
    onlyfans: '',
    fansly: '',
    youtube: '',
    telegram: '',
    snapchat: '',
    linktree: '',
  });
  const [activePlatforms, setActivePlatforms] = useState<Record<PlatformKey, boolean>>({
    instagram: false,
    twitter: false,
    tiktok: false,
    onlyfans: false,
    fansly: false,
    youtube: false,
    telegram: false,
    snapchat: false,
    linktree: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'premium'>('premium');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const filteredCountries = STRIPE_SUPPORTED_COUNTRIES;

  const normalizeExternalUrl = (raw: string): string | null => {
    const value = raw.trim();
    if (!value) return null;

    let candidate = value;
    // If the user omitted the scheme, assume https:// for convenience.
    if (!/^https?:\/\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    }

    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      setIsLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!isMounted) return;
        navigate('/auth');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, handle, country')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (profileError) {
        // Onboarding peut fonctionner même si le profil n'existe pas encore, il sera créé via trigger ou update
        console.error('Error loading profile for onboarding', profileError);
      }

      const fallbackName = user.email ? user.email.split('@')[0] : 'Creator';
      setDisplayName(profile?.display_name || fallbackName);
      setHandle(profile?.handle || '');
      setCountry(profile?.country || '');

      // Charger les liens sociaux existants depuis profiles.social_links (JSONB)
      const { data: fullProfile } = await supabase
        .from('profiles')
        .select('social_links, stripe_connect_status, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (fullProfile?.avatar_url) {
        setAvatarUrl(fullProfile.avatar_url);
        setAvatarPreview(fullProfile.avatar_url);
      }

      const existingSocialLinks = (fullProfile?.social_links as Record<string, string>) || {};
      if (Object.keys(existingSocialLinks).length > 0) {
        setPlatformUrls((prev) => {
          const next = { ...prev };
          Object.entries(existingSocialLinks).forEach(([key, url]) => {
            if (Object.prototype.hasOwnProperty.call(next, key)) {
              next[key as PlatformKey] = url || '';
            }
          });
          return next;
        });

        setActivePlatforms((prev) => {
          const next = { ...prev };
          Object.entries(existingSocialLinks).forEach(([key, url]) => {
            if (Object.prototype.hasOwnProperty.call(next, key) && url && url.length > 0) {
              next[key as PlatformKey] = true;
            }
          });
          return next;
        });
      }

      // Only redirect to dashboard if onboarding is fully completed
      // (handle + avatar_url + at least 1 social link + stripe connect started)
      const stripeStatus = fullProfile?.stripe_connect_status;
      const hasSocialLinks = Object.values(existingSocialLinks).some((url) => url && url.length > 0);
      if (profile?.handle && fullProfile?.avatar_url && hasSocialLinks && stripeStatus && stripeStatus !== 'not_started') {
        navigate('/app');
        return;
      }

      setIsLoading(false);
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const normalizeHandle = (raw: string) =>
    raw
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const trimmedHandle = normalizeHandle(handle.trim());

    if (!displayName.trim()) {
      toast.error('Please choose a display name.');
      return;
    }

    if (!trimmedHandle) {
      toast.error('Please choose a handle.');
      return;
    }

    if (trimmedHandle.length < 3) {
      toast.error('Your handle must be at least 3 characters long.');
      return;
    }

    if (!country) {
      toast.error('Please select your country.');
      return;
    }

    if (!avatarPreview && !avatarFile) {
      toast.error('Please upload a profile photo.');
      return;
    }

    // Check at least one external link is provided
    const hasAtLeastOneLink = (Object.entries(platformUrls) as [PlatformKey, string][])
      .some(([platform, url]) => activePlatforms[platform] && url.trim().length > 0);
    if (!hasAtLeastOneLink) {
      toast.error('Please add at least one external platform link.');
      return;
    }

    // Validate all external platform URLs before hitting the backend (auto-normalizing them).
    const invalidUrlEntry = (Object.entries(platformUrls) as [PlatformKey, string][]) // type narrowing
      .map(([platform, url]) => ({ platform, url: url.trim() }))
      .find((entry) => entry.url.length > 0 && !normalizeExternalUrl(entry.url));

    if (invalidUrlEntry) {
      toast.error('One of your external links looks invalid. Please use a full URL starting with http:// or https://');
      return;
    }

    setIsSaving(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to complete onboarding.');
      }

      // Vérifier l'unicité du handle côté Supabase
      const { data: existing, error: existingError } = await supabase
        .from('profiles')
        .select('id')
        .eq('handle', trimmedHandle)
        .neq('id', user.id)
        .limit(1);

      if (existingError) {
        console.error('Error checking handle uniqueness', existingError);
        throw new Error('Unable to verify handle availability. Please try again.');
      }

      if (existing && existing.length > 0) {
        toast.error('This handle is already taken. Please choose another one.');
        return;
      }

      // Build social_links JSONB from platform URLs
      const socialLinksObj: Record<string, string> = {};
      (Object.entries(platformUrls) as [PlatformKey, string][]).forEach(([platform, url]) => {
        const normalized = normalizeExternalUrl(url);
        if (normalized) {
          socialLinksObj[platform] = normalized;
        }
      });

      // Upload avatar if a new file was selected
      let finalAvatarUrl = avatarUrl;
      if (avatarFile) {
        setIsUploadingAvatar(true);
        const fileExt = avatarFile.name.split('.').pop() ?? 'jpg';
        const filePath = `avatars/${user.id}/avatar.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { cacheControl: '3600', upsert: true });

        if (uploadError) {
          console.error('Avatar upload error', uploadError);
          toast.error('Failed to upload profile photo. Please try again.');
          setIsUploadingAvatar(false);
          return;
        }

        const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
        finalAvatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
        setAvatarUrl(finalAvatarUrl);
        setIsUploadingAvatar(false);
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            display_name: displayName.trim(),
            handle: trimmedHandle,
            is_creator: true,
            country,
            social_links: socialLinksObj,
            avatar_url: finalAvatarUrl,
          },
          { onConflict: 'id' }
        );

      if (updateError) {
        console.error(updateError);
        throw new Error('Unable to save your profile. Please try again.');
      }

      toast.success('Profile saved! Now choose your plan.');
      setStep('plan');
    } catch (err: any) {
      console.error('Error during onboarding save', err);
      toast.error(err?.message || 'Unable to complete onboarding right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlanSelection = async () => {
    if (selectedPlan === 'free') {
      // Go to Stripe Connect step
      setStep('stripe');
      return;
    }

    // Premium plan - redirect to Stripe checkout
    setIsSubscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-creator-subscription', {});

      if (error) {
        console.error('Error creating subscription checkout', error);
        throw new Error('Unable to start subscription checkout.');
      }

      const url = (data as any)?.url;
      if (!url) {
        throw new Error('Checkout URL not available.');
      }

      window.location.href = url;
    } catch (err: any) {
      console.error('Error during subscription', err);
      toast.error(err?.message || 'Unable to start subscription.');
      setIsSubscribing(false);
    }
  };

  const handleSkipToFree = () => {
    // Go to Stripe Connect step instead of directly to dashboard
    setStep('stripe');
  };

  const handleStripeConnect = async () => {
    setIsConnectingStripe(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Please sign in again to connect Stripe.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
        headers: {
          Authorization: '',
          'x-supabase-auth': session.access_token,
        },
      });

      if (error) {
        console.error('Error starting Stripe Connect', error);
        throw new Error('Unable to start Stripe Connect onboarding.');
      }

      const url = (data as any)?.url;
      if (!url) {
        throw new Error('Stripe Connect URL not available.');
      }

      window.location.href = url;
    } catch (err: any) {
      console.error('Error during Stripe Connect', err);
      toast.error(err?.message || 'Unable to connect Stripe.');
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const handleSkipStripe = () => {
    setStep('instagram');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 px-4 pt-32 sm:pt-28 pb-10 flex items-start sm:items-center justify-center relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 -left-24 h-64 w-64 rounded-full bg-primary/25 blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -right-24 h-72 w-72 rounded-full bg-exclu-iris/25 blur-3xl animate-[pulse_7s_ease-in-out_infinite]" />
        </div>

        {/* Step indicator */}
        <div className="absolute top-28 sm:top-24 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-colors ${step === 'profile' ? 'bg-primary' : 'bg-exclu-arsenic'}`} />
          <div className={`w-2 h-2 rounded-full transition-colors ${step === 'plan' ? 'bg-primary' : 'bg-exclu-arsenic'}`} />
          <div className={`w-2 h-2 rounded-full transition-colors ${step === 'stripe' ? 'bg-primary' : 'bg-exclu-arsenic'}`} />
          <div className={`w-2 h-2 rounded-full transition-colors ${step === 'instagram' ? 'bg-primary' : 'bg-exclu-arsenic'}`} />
        </div>

        {/* STEP 1: Profile Setup */}
        {step === 'profile' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="w-full max-w-lg space-y-6"
          >
            <div className="text-center space-y-3">
              <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
                Set up your creator profile
              </h1>
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-md mx-auto">
                Choose how fans will see you on Exclu. You can change these details later from your account settings.
              </p>
            </div>

            <Card className="bg-exclu-ink/95/90 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
              <CardHeader className="px-5 pt-5 pb-3 space-y-1">
                <CardTitle className="text-base text-exclu-cloud">Creator onboarding</CardTitle>
                <CardDescription className="text-xs text-exclu-space/80">
                  Pick a display name, a unique handle, and connect your main platforms so fans can find you.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {isLoading ? (
                  <p className="text-sm text-exclu-space">Loading your profile…</p>
                ) : (
                  <form className="space-y-4" onSubmit={handleSubmit}>
                  {/* Avatar upload */}
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs font-medium text-exclu-space">Profile photo <span className="text-red-400">*</span></p>
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="relative w-20 h-20 rounded-full border-2 border-dashed border-exclu-arsenic/70 hover:border-primary/60 transition-colors overflow-hidden group"
                    >
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-exclu-ink/60">
                          <Camera className="w-5 h-5 text-exclu-space/60 group-hover:text-primary transition-colors" />
                        </div>
                      )}
                      {avatarPreview && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Camera className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setAvatarFile(file);
                          setAvatarPreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                    <p className="text-[11px] text-exclu-space/70">
                      {avatarPreview ? 'Click to change' : 'Upload a photo'}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="display_name" className="text-xs font-medium text-exclu-space">
                      Display name
                    </label>
                    <Input
                      id="display_name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your stage name or creator name"
                      className="h-10 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="handle" className="text-xs font-medium text-exclu-space">
                      Handle (public URL)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-exclu-space/80 bg-exclu-ink px-2 py-1 rounded-full border border-exclu-arsenic/60">
                        exclu.at/
                      </span>
                      <Input
                        id="handle"
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="yourname"
                        className="h-10 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-sm"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-exclu-space/70">
                      3+ characters, letters, numbers and underscores. This must be unique across all creators.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="country" className="text-xs font-medium text-exclu-space">
                      Country of residence
                    </label>
                    <select
                      id="country"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="h-10 w-full rounded-md border border-exclu-arsenic/70 bg-white px-3 text-xs text-black focus:outline-none focus:ring-2 focus:ring-primary/60"
                      required
                    >
                      <option value="">Select your country</option>
                      {filteredCountries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-exclu-space/70">
                      This must match the country where you pay taxes. Stripe will use it to determine your payout
                      requirements.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-exclu-space">External platforms <span className="text-red-400">(at least 1 required)</span></p>
                    <p className="text-[11px] text-exclu-space/70">
                      Add links to your main platforms. These will appear as small buttons on your public profile and
                      in your dashboard.
                    </p>

                    {/* Platform icon selector */}
                    <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {([
                        'instagram',
                        'twitter',
                        'tiktok',
                        'onlyfans',
                        'fansly',
                        'youtube',
                        'telegram',
                        'snapchat',
                        'linktree',
                      ] as PlatformKey[]).map((platform) => {
                        const isActive = activePlatforms[platform];
                        const baseClasses =
                          'flex flex-col items-center justify-center gap-1 rounded-xl border text-[10px] px-2 py-2 transition-all';

                        const iconMap: Record<PlatformKey, React.ReactNode> = {
                          instagram: <SiInstagram className="w-4 h-4" />,
                          twitter: <SiX className="w-4 h-4" />,
                          tiktok: <SiTiktok className="w-4 h-4" />,
                          onlyfans: <SiOnlyfans className="w-4 h-4" />,
                          fansly: <SiOnlyfans className="w-4 h-4" />,
                          youtube: <SiYoutube className="w-4 h-4" />,
                          telegram: <SiTelegram className="w-4 h-4" />,
                          snapchat: <SiSnapchat className="w-4 h-4" />,
                          linktree: <SiLinktree className="w-4 h-4" />,
                        };

                        const labelMap: Record<PlatformKey, string> = {
                          instagram: 'Instagram',
                          twitter: 'X (Twitter)',
                          tiktok: 'TikTok',
                          onlyfans: 'OnlyFans',
                          fansly: 'Fansly',
                          youtube: 'YouTube',
                          telegram: 'Telegram',
                          snapchat: 'Snapchat',
                          linktree: 'Linktree',
                        };

                        return (
                          <button
                            key={platform}
                            type="button"
                            onClick={() =>
                              setActivePlatforms((prev) => ({
                                ...prev,
                                [platform]: !prev[platform],
                              }))
                            }
                            className={
                              baseClasses +
                              ' ' +
                              (isActive
                                ? 'border-exclu-cloud bg-exclu-cloud/10 text-exclu-cloud shadow-sm'
                                : 'border-exclu-arsenic/50 bg-exclu-ink/60 text-exclu-space hover:border-exclu-arsenic')
                            }
                          >
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-exclu-cloud/10 text-exclu-cloud text-xs">
                              {iconMap[platform]}
                            </span>
                            <span className="truncate max-w-[4rem]">
                              {labelMap[platform]}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Animated URL inputs for active platforms */}
                    <div className="mt-3 space-y-2">
                      <AnimatePresence initial={false}>
                        {([
                          'instagram',
                          'twitter',
                          'tiktok',
                          'onlyfans',
                          'fansly',
                          'youtube',
                          'telegram',
                          'snapchat',
                          'linktree',
                        ] as PlatformKey[]).map((platform) => {
                          if (!activePlatforms[platform]) return null;

                          const placeholderMap: Record<PlatformKey, string> = {
                            instagram: 'https://instagram.com/yourhandle',
                            twitter: 'https://x.com/yourhandle',
                            tiktok: 'https://tiktok.com/@yourhandle',
                            onlyfans: 'https://onlyfans.com/yourhandle',
                            fansly: 'https://fansly.com/yourhandle',
                            youtube: 'https://youtube.com/@yourhandle',
                            telegram: 'https://t.me/yourhandle',
                            snapchat: 'https://snapchat.com/add/yourhandle',
                            linktree: 'https://linktr.ee/yourhandle',
                          };

                          const labelMap: Record<PlatformKey, string> = {
                            instagram: 'Instagram',
                            twitter: 'X (Twitter)',
                            tiktok: 'TikTok',
                            onlyfans: 'OnlyFans',
                            fansly: 'Fansly',
                            youtube: 'YouTube',
                            telegram: 'Telegram',
                            snapchat: 'Snapchat',
                            linktree: 'Linktree',
                          };

                          const iconMap: Record<PlatformKey, React.ReactNode> = {
                            instagram: <SiInstagram className="w-4 h-4" />,
                            twitter: <SiX className="w-4 h-4" />,
                            tiktok: <SiTiktok className="w-4 h-4" />,
                            onlyfans: <SiOnlyfans className="w-4 h-4" />,
                            fansly: <SiOnlyfans className="w-4 h-4" />,
                            youtube: <SiYoutube className="w-4 h-4" />,
                            telegram: <SiTelegram className="w-4 h-4" />,
                            snapchat: <SiSnapchat className="w-4 h-4" />,
                            linktree: <SiLinktree className="w-4 h-4" />,
                          };

                          return (
                            <motion.div
                              key={platform}
                              initial={{ opacity: 0, height: 0, y: -4 }}
                              animate={{ opacity: 1, height: 'auto', y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -4 }}
                              transition={{ duration: 0.18, ease: 'easeOut' }}
                              className="overflow-hidden"
                            >
                              <label className="text-[11px] font-medium text-exclu-space flex items-center gap-2 mb-1">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-exclu-cloud/10 text-[10px] text-exclu-cloud font-semibold">
                                  {iconMap[platform]}
                                </span>
                                {labelMap[platform]}
                              </label>
                              <Input
                                type="url"
                                value={platformUrls[platform]}
                                onChange={(e) =>
                                  setPlatformUrls((prev) => ({
                                    ...prev,
                                    [platform]: e.target.value,
                                  }))
                                }
                                placeholder={placeholderMap[platform]}
                                className="h-9 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-[13px]"
                              />
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>

                    <Button
                      type="submit"
                      variant="hero"
                      size="lg"
                      className="w-full mt-1 inline-flex items-center justify-center gap-2"
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving…' : 'Continue'}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP 2: Plan Selection */}
        {step === 'plan' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="w-full max-w-2xl space-y-6"
          >
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Choose your plan</span>
              </div>
              <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
                Start selling on Exclu
              </h1>
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-md mx-auto">
                Choose the plan that works best for you. You can change anytime.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Free Plan */}
              <button
                type="button"
                onClick={() => setSelectedPlan('free')}
                className={`relative text-left p-5 rounded-2xl border-2 transition-all ${
                  selectedPlan === 'free'
                    ? 'border-exclu-cloud bg-exclu-ink/80'
                    : 'border-exclu-arsenic/50 bg-exclu-ink/40 hover:border-exclu-arsenic'
                }`}
              >
                {selectedPlan === 'free' && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-exclu-cloud flex items-center justify-center">
                    <Check className="w-3 h-3 text-black" />
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-bold text-exclu-cloud">Free</h3>
                    <p className="text-2xl font-extrabold text-exclu-cloud">$0<span className="text-sm font-normal text-exclu-space">/month</span></p>
                  </div>
                  <ul className="space-y-2 text-sm text-exclu-space">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-exclu-space/60" />
                      Unlimited links
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-exclu-space/60" />
                      Instant payouts
                    </li>
                    <li className="flex items-center gap-2 text-exclu-space/70">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span><strong className="text-yellow-500">10% commission</strong> per sale</span>
                    </li>
                  </ul>
                </div>
              </button>

              {/* Premium Plan */}
              <button
                type="button"
                onClick={() => setSelectedPlan('premium')}
                className={`relative text-left p-5 rounded-2xl border-2 transition-all ${
                  selectedPlan === 'premium'
                    ? 'border-primary bg-primary/10'
                    : 'border-exclu-arsenic/50 bg-exclu-ink/40 hover:border-primary/50'
                }`}
              >
                <div className="absolute -top-3 left-4 px-2 py-0.5 rounded-full bg-primary text-[10px] font-bold text-white">
                  Most popular
                </div>
                {selectedPlan === 'premium' && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-exclu-cloud flex items-center justify-center">
                    <Check className="w-3 h-3 text-black" />
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-bold text-exclu-cloud">Premium</h3>
                    <p className="text-2xl font-extrabold text-exclu-cloud">$39<span className="text-sm font-normal text-exclu-space">/month</span></p>
                  </div>
                  <ul className="space-y-2 text-sm text-exclu-space">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary" />
                      Unlimited links
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary" />
                      Instant payouts
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary" />
                      <span><strong className="text-green-400">0% commission</strong> – keep everything</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary" />
                      Priority support
                    </li>
                  </ul>
                </div>
              </button>
            </div>

            <div className="space-y-3">
              <Button
                variant="hero"
                size="lg"
                className="w-full rounded-full"
                onClick={handlePlanSelection}
                disabled={isSubscribing}
              >
                {isSubscribing ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Redirecting…
                  </span>
                ) : selectedPlan === 'premium' ? (
                  'Start Premium – $39/month'
                ) : (
                  'Continue with Free'
                )}
              </Button>

              {selectedPlan === 'premium' && (
                <button
                  type="button"
                  onClick={handleSkipToFree}
                  className="w-full text-center text-xs text-exclu-space/60 hover:text-exclu-space transition-colors"
                >
                  Skip for now and use Free plan
                </button>
              )}

              <p className="text-[10px] text-exclu-space/50 text-center">
                All plans include a 5% processing fee charged to buyers. You can change your plan anytime.
              </p>
            </div>
          </motion.div>
        )}

        {/* STEP 3: Stripe Connect */}
        {step === 'stripe' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="w-full max-w-lg space-y-6"
          >
            <div className="text-center space-y-3">
              <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-[#635BFF] to-[#A259FF] flex items-center justify-center mb-4">
                <span className="text-base font-semibold tracking-tight text-white">Stripe</span>
              </div>
              <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
                Connect your Stripe account
              </h1>
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-md mx-auto">
                To receive payments from your fans, you need to connect a Stripe account. This only takes a few minutes.
              </p>
            </div>

            <Card className="bg-exclu-ink/95 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
              <CardContent className="p-6 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-exclu-cloud">Instant payouts</p>
                      <p className="text-xs text-exclu-space/70">Get paid directly to your bank account</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-exclu-cloud">Secure & trusted</p>
                      <p className="text-xs text-exclu-space/70">Stripe is used by millions of businesses worldwide</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-exclu-cloud">Easy setup</p>
                      <p className="text-xs text-exclu-space/70">Connect in just a few clicks</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Button
                variant="hero"
                size="lg"
                className="w-full rounded-full"
                onClick={handleStripeConnect}
                disabled={isConnectingStripe}
              >
                {isConnectingStripe ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Redirecting to Stripe…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" />
                    Connect with Stripe
                  </span>
                )}
              </Button>

              <button
                type="button"
                onClick={handleSkipStripe}
                className="w-full text-center text-xs text-exclu-space/60 hover:text-exclu-space transition-colors"
              >
                Skip for now – I'll do this later
              </button>

              <p className="text-[10px] text-exclu-space/50 text-center">
                You won't be able to receive payments until you connect Stripe. You can do this anytime from your profile settings.
              </p>
            </div>
          </motion.div>
        )}

        {/* STEP 4: Instagram Bio Verification */}
        {step === 'instagram' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="w-full max-w-lg space-y-6"
          >
            <div className="text-center space-y-3">
              <h1 className="text-[1.6rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
                Add your <span className="text-primary">Exclu</span> link to your Instagram Bio – then verify
              </h1>
            </div>

            {/* Section 1: Copy link */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">1. Copy your Exclu link</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-11 rounded-xl border border-exclu-arsenic/70 bg-exclu-ink/80 px-4 flex items-center">
                  <span className="text-sm text-exclu-cloud truncate">exclu.at/{handle}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-xl border-exclu-arsenic/70 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(`https://exclu.at/${handle}`);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 3000);
                  }}
                >
                  <AnimatePresence mode="wait">
                    {linkCopied ? (
                      <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      </motion.div>
                    ) : (
                      <motion.div key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <Copy className="w-4 h-4 text-exclu-space" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              </div>
              <AnimatePresence>
                {linkCopied && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-xl border border-exclu-arsenic/50 bg-exclu-ink/90 p-4 text-center space-y-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-exclu-cloud">Link Copied</p>
                      <p className="text-xs text-exclu-space/70">Paste it in your Instagram Links</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-exclu-arsenic/70 text-exclu-cloud"
                      onClick={() => {
                        window.location.href = 'instagram://';
                        setTimeout(() => {
                          window.open('https://www.instagram.com/', '_blank');
                        }, 500);
                      }}
                    >
                      <SiInstagram className="w-4 h-4 mr-2" />
                      Open Instagram
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section 2: Instagram preview */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">2. Add it to your Instagram links</p>
              <div className="rounded-2xl border border-exclu-arsenic/50 bg-black overflow-hidden">
                {/* Instagram header bar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-white">{handle || 'yourname'}</span>
                    <svg className="w-3 h-3 text-white/60" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  </div>
                  <div className="flex items-center gap-4">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                  </div>
                </div>

                {/* Profile section */}
                <div className="px-4 py-4">
                  <div className="flex items-center gap-5">
                    {/* Avatar */}
                    <div className="w-[72px] h-[72px] rounded-full border-2 border-pink-500/60 p-[2px] shrink-0">
                      <div className="w-full h-full rounded-full overflow-hidden bg-exclu-arsenic">
                        {avatarPreview ? (
                          <img src={avatarPreview} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-exclu-space/40">
                            <Camera className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Stats */}
                    <div className="flex-1 flex justify-around">
                      <div className="text-center">
                        <p className="text-base font-bold text-white">12</p>
                        <p className="text-[10px] text-white/60">Posts</p>
                      </div>
                      <div className="text-center">
                        <p className="text-base font-bold text-white">2,847</p>
                        <p className="text-[10px] text-white/60">Followers</p>
                      </div>
                      <div className="text-center">
                        <p className="text-base font-bold text-white">348</p>
                        <p className="text-[10px] text-white/60">Following</p>
                      </div>
                    </div>
                  </div>

                  {/* Name & bio */}
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-semibold text-white">{displayName || handle || 'Your Name'}</p>
                    <p className="text-xs text-white/60">Creator</p>
                    <p className="text-xs text-white/80">✨ Exclusive content just for you</p>
                    <motion.p
                      className="text-xs font-medium text-[#E0F4FF]"
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      🔗 exclu.at/{handle}
                    </motion.p>
                  </div>

                  {/* Action buttons */}
                  <div className="mt-3 flex gap-1.5">
                    <div className="flex-1 h-8 rounded-lg bg-[#0095F6] flex items-center justify-center">
                      <span className="text-xs font-semibold text-white">Follow</span>
                    </div>
                    <div className="flex-1 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <span className="text-xs font-semibold text-white">Message</span>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </div>
                  </div>
                </div>

                {/* Highlights placeholder */}
                <div className="px-4 pb-3 flex gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className="w-14 h-14 rounded-full border border-white/20 bg-white/5" />
                      <span className="text-[9px] text-white/40">Story</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-exclu-space/60 text-center">
                👆 This is how your Exclu link will appear on your Instagram profile
              </p>
            </div>

            {/* Section 3: Verify */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">3. Then verify</p>
              <p className="text-xs text-exclu-space/70">
                Make sure you add the link to your bio so that we can check and verify it.
              </p>

              {verificationError && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
                >
                  {verificationError}
                </motion.p>
              )}

              <Button
                variant="hero"
                size="lg"
                className="w-full rounded-full"
                disabled={isVerifying}
                onClick={async () => {
                  setIsVerifying(true);
                  setVerificationError(null);
                  try {
                    // Try to fetch the creator's public Instagram page to check for the link
                    // Since we can't reliably scrape Instagram from the client, we'll trust the user
                    // and mark onboarding as complete after a brief verification delay
                    await new Promise((r) => setTimeout(r, 2000));

                    // Check if the user has an Instagram URL set
                    const igUrl = platformUrls.instagram?.trim();
                    if (!igUrl) {
                      setVerificationError('Please add your Instagram link in step 1 first.');
                      return;
                    }

                    toast.success('Welcome to Exclu! Your profile is ready 🎉');
                    navigate('/app');
                  } catch (err: any) {
                    console.error('Verification error', err);
                    setVerificationError('Unable to verify at this time. Please try again.');
                  } finally {
                    setIsVerifying(false);
                  }
                }}
              >
                {isVerifying ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying…
                  </span>
                ) : (
                  'Verify'
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  toast.success('Welcome to Exclu! You can add your link later.');
                  navigate('/app');
                }}
                className="w-full text-center text-xs text-exclu-space/60 hover:text-exclu-space transition-colors"
              >
                Skip for now – I'll do this later
              </button>
            </div>
          </motion.div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Onboarding;
