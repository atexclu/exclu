import AppShell from '@/components/AppShell';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  User,
  Users,
  Camera,
  Copy,
  ExternalLink,
  Zap,
  CreditCard,
  Lock,
  Mail,
  Check,
  AlertCircle,
  ChevronRight,
  Plus,
  Palette,
  AlertTriangle,
  LogOut,
  Upload,
  Building2,
  Trash2,
  Loader2,
  Tag,
} from 'lucide-react';
import { ThemeToggleSwitch } from '@/components/ThemeToggleSwitch';
import { useProfiles } from '@/contexts/ProfileContext';
import { AgencyCategoryConfig, EMPTY_AGENCY_CATEGORIES, type AgencyCategoryData } from '@/components/ui/AgencyCategoryConfig';

const Profile = () => {
  const { activeProfile, refreshProfiles, isAgency, profiles: creatorProfiles, setActiveProfileId } = useProfiles();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [payoutSetupComplete, setPayoutSetupComplete] = useState(false);
  const [profileData, setProfileData] = useState<{ bank_iban?: string; bank_holder_name?: string; bank_bic?: string; bank_account_type?: string; bank_account_number?: string; bank_routing_number?: string; bank_bsb?: string; bank_country?: string } | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [isCreatorSubscribed, setIsCreatorSubscribed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'subscription' | 'profiles' | 'security'>('profile');
  const [themeColor, setThemeColor] = useState<string>('day');
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [showJoinBanner, setShowJoinBanner] = useState<boolean>(true);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const agencyLogoInputRef = useRef<HTMLInputElement | null>(null);
  const [agencyName, setAgencyName] = useState('');
  const [agencyLogoUrl, setAgencyLogoUrl] = useState<string | null>(null);
  const [isSavingAgency, setIsSavingAgency] = useState(false);

  // Agency directory categories
  const [directoryAgencyId, setDirectoryAgencyId] = useState<string | null>(null);
  const [agencyCats, setAgencyCats] = useState<AgencyCategoryData>(EMPTY_AGENCY_CATEGORIES);
  const [isSavingAgencyCategories, setIsSavingAgencyCategories] = useState(false);


  // Handle hash navigation to open specific section
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === 'payments') {
      setActiveSection('subscription');
      window.history.replaceState(null, '', window.location.pathname);
    } else if (hash === 'wallet') {
      window.location.href = '/app/earnings';
      return;
    }
  }, []);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const publicProfileUrl = handle ? `${window.location.origin}/${handle}` : null;

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setIsLoading(false);
        return;
      }

      setUserId(user.id);
      setEmail(user.email || '');

      // Always load account-level data from profiles
      const { data: mainProfile } = await supabase
        .from('profiles')
        .select('is_creator_subscribed, country, payout_setup_complete, bank_iban, bank_holder_name, bank_bic, bank_account_type, bank_account_number, bank_routing_number, bank_bsb, bank_country')
        .eq('id', user.id)
        .maybeSingle();

      if (mainProfile) {
        setIsCreatorSubscribed(mainProfile.is_creator_subscribed === true);
        setCountry(mainProfile.country || null);
        setPayoutSetupComplete(mainProfile.payout_setup_complete === true);
        setProfileData({
          bank_iban: mainProfile.bank_iban || undefined,
          bank_holder_name: mainProfile.bank_holder_name || undefined,
          bank_bic: mainProfile.bank_bic || undefined,
          bank_account_type: mainProfile.bank_account_type || undefined,
          bank_account_number: mainProfile.bank_account_number || undefined,
          bank_routing_number: mainProfile.bank_routing_number || undefined,
          bank_bsb: mainProfile.bank_bsb || undefined,
          bank_country: mainProfile.bank_country || undefined,
        });
      }

      // Load agency branding separately (migration 070 columns)
      try {
        const { data: agencyData } = await supabase
          .from('profiles')
          .select('agency_name, agency_logo_url, agency_pricing, agency_target_market, agency_services_offered, agency_platform_focus, agency_growth_strategy, model_categories')
          .eq('id', user.id)
          .maybeSingle();
        if (agencyData) {
          setAgencyName(agencyData.agency_name || '');
          setAgencyLogoUrl(agencyData.agency_logo_url || null);
          setAgencyCats({
            pricing: agencyData.agency_pricing || '',
            targetMarket: agencyData.agency_target_market || [],
            services: agencyData.agency_services_offered || [],
            platform: agencyData.agency_platform_focus || [],
            growthStrategy: agencyData.agency_growth_strategy || [],
            modelTypes: agencyData.model_categories || [],
          });
        }
      } catch {
        // Migration 070 not yet applied
      }

      // Load profile-specific data from creator_profiles when an active profile is set
      if (activeProfile) {
        setDisplayName(activeProfile.display_name || '');
        setHandle(activeProfile.username || '');
        setBio(activeProfile.bio || '');
        setAvatarUrl(activeProfile.avatar_url || null);

        // Load extended fields from creator_profiles
        const { data: cpData } = await supabase
          .from('creator_profiles')
          .select('theme_color, social_links, show_join_banner')
          .eq('id', activeProfile.id)
          .maybeSingle();

        if (cpData) {
          setThemeColor(cpData.theme_color || 'day');
          setSocialLinks(cpData.social_links || {});
          setShowJoinBanner(
            cpData.show_join_banner === null || cpData.show_join_banner === undefined
              ? true
              : Boolean(cpData.show_join_banner)
          );
        }
      } else {
        // Fallback: load from profiles table
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('display_name, handle, bio, avatar_url, theme_color, social_links, show_join_banner, country')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Error loading profile', profileError);
        } else if (profile) {
          setDisplayName(profile.display_name || '');
          setHandle(profile.handle || '');
          setBio(profile.bio || '');
          setAvatarUrl(profile.avatar_url || null);
          setCountry(profile.country || null);
          setThemeColor(profile.theme_color || 'day');
          setSocialLinks(profile.social_links || {});
          setShowJoinBanner(
            profile.show_join_banner === null || profile.show_join_banner === undefined
              ? true
              : Boolean(profile.show_join_banner)
          );
        }
      }

      // Load linked directory agency categories for agency users
      if (isAgency && user.id) {
        const { data: dirAgency } = await supabase
          .from('directory_agencies')
          .select('id, pricing_structure, target_market, services_offered, platform_focus, geography, growth_strategy, model_categories')
          .eq('claimed_by_user_id', user.id)
          .maybeSingle();

        if (dirAgency) {
          setDirectoryAgencyId(dirAgency.id);
          setAgencyCats({
            pricing: dirAgency.pricing_structure || '',
            targetMarket: dirAgency.target_market || [],
            services: dirAgency.services_offered || [],
            platform: dirAgency.platform_focus || [],
            growthStrategy: dirAgency.growth_strategy || [],
            modelTypes: dirAgency.model_categories || [],
          });
        }
      }

      setIsLoading(false);
    };

    fetchProfile();
  }, [activeProfile?.id, isAgency]);

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    const profileTag = activeProfile?.username || activeProfile?.id || 'avatar';
    const fileExt = file.name.split('.').pop() ?? 'jpg';
    const filePath = `avatars/${userId}/${profileTag}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) {
      console.error('Avatar upload error', uploadError);
      toast.error('Failed to upload avatar. Please try again.');
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const newAvatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

    // Write to creator_profiles (source of truth per profile)
    if (activeProfile?.id) {
      const { error: cpError } = await supabase
        .from('creator_profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', activeProfile.id);

      if (cpError) {
        console.error('Error updating avatar_url on creator_profiles', cpError);
        toast.error('Failed to save avatar. Please try again.');
        return;
      }

      // Also sync to profiles table for backward compat (only if this is the first/primary profile)
      if (creatorProfiles.length <= 1 || creatorProfiles[0]?.id === activeProfile.id) {
        await supabase.from('profiles').update({ avatar_url: newAvatarUrl }).eq('id', userId);
      }

      await refreshProfiles();
    } else {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating avatar_url', updateError);
        toast.error('Failed to save avatar. Please try again.');
        return;
      }
    }

    setAvatarUrl(newAvatarUrl);
    toast.success('Avatar updated successfully!');
  };

  const handleSaveProfile = async () => {
    if (!userId) return;
    setIsSaving(true);

    // Write to creator_profiles as source of truth
    if (activeProfile?.id) {
      const { error: cpError } = await supabase
        .from('creator_profiles')
        .update({
          display_name: displayName.trim() || null,
          username: handle.trim().toLowerCase() || null,
          bio: bio.trim() || null,
          country: country || 'US',
        })
        .eq('id', activeProfile.id);

      if (cpError) {
        console.error('Error saving profile', cpError);
        toast.error('Failed to save profile. Please try again.');
        setIsSaving(false);
        return;
      }

      // Backward compat: sync to profiles if primary profile
      if (creatorProfiles.length <= 1 || creatorProfiles[0]?.id === activeProfile.id) {
        await supabase
          .from('profiles')
          .update({
            display_name: displayName.trim() || null,
            handle: handle.trim().toLowerCase() || null,
            bio: bio.trim() || null,
            country: country || 'US',
          })
          .eq('id', userId);
      } else {
        // Country is account-level (shared payout setup across all profiles)
        await supabase
          .from('profiles')
          .update({ country: country || 'US' })
          .eq('id', userId);
      }

      refreshProfiles();
    } else {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null,
          handle: handle.trim().toLowerCase() || null,
          bio: bio.trim() || null,
          country: country || 'US',
        })
        .eq('id', userId);

      if (error) {
        console.error('Error saving profile', error);
        toast.error('Failed to save profile. Please try again.');
        setIsSaving(false);
        return;
      }
    }

    toast.success('Profile saved successfully!');
    setIsSaving(false);
  };

  const handleCopyProfileUrl = async () => {
    if (!publicProfileUrl) return;
    try {
      await navigator.clipboard.writeText(publicProfileUrl);
      toast.success('Link copied to clipboard!');
    } catch {
      toast.error('Failed to copy link.');
    }
  };

  const handleUpgradeToPremium = async () => {
    setIsUpgradeLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please sign in again to upgrade.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-creator-subscription', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        throw new Error((data as any)?.error || 'Unable to start subscription checkout.');
      }

      // If already subscribed, the function returns { manage: true }
      if ((data as any)?.manage) {
        // Already subscribed — no action needed, UI already shows manage options
        toast.success('You are already subscribed to Premium.');
        return;
      }

      // New subscription: submit QuickPay form
      if ((data as any)?.fields) {
        const fields = (data as any).fields as Record<string, string>;
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://quickpay.ugpayments.ch/';
        form.style.display = 'none';
        Object.entries(fields).forEach(([name, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        return;
      }

      toast.error('Unable to start subscription checkout.');
    } catch (err: any) {
      console.error('Error starting subscription checkout', err);
      toast.error(err?.message || 'Unable to upgrade. Please try again.');
    } finally {
      setIsUpgradeLoading(false);
    }
  };

  const handleCancelSubscription = () => {
    if (!confirm('Are you sure you want to cancel your Premium subscription? You will lose 0% commission and premium features.')) return;

    const quickPayToken = import.meta.env.VITE_QUICKPAY_TOKEN;
    const siteId = import.meta.env.VITE_QUICKPAY_SITE_ID || '98845';

    // Cancel must be an HTML form POST to QuickPay (server-to-server not supported)
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://quickpay.ugpayments.ch/Cancel';
    form.style.display = 'none';

    const fields: Record<string, string> = {
      QuickpayToken: quickPayToken,
      username: userId, // subscription_ugp_username = user.id
      SiteID: siteId,
    };

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    setIsChangingPassword(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error('Error changing password', error);
      toast.error(error.message || 'Failed to change password.');
    } else {
      toast.success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }

    setIsChangingPassword(false);
  };

  const saveAppearance = async (options?: {
    themeColorOverride?: string;
    socialLinksOverride?: Record<string, string>;
    showJoinBannerOverride?: boolean;
    silent?: boolean;
  }) => {
    if (!userId) return;
    setIsSaving(true);

    const finalThemeColor = options?.themeColorOverride ?? themeColor;
    const finalSocialLinks = options?.socialLinksOverride ?? socialLinks;
    const finalShowJoinBanner =
      options?.showJoinBannerOverride !== undefined ? options.showJoinBannerOverride : showJoinBanner;

    const payload = {
      theme_color: finalThemeColor,
      social_links: finalSocialLinks,
      show_join_banner: finalShowJoinBanner,
    };

    // Write to creator_profiles
    if (activeProfile?.id) {
      const { error } = await supabase
        .from('creator_profiles')
        .update(payload)
        .eq('id', activeProfile.id);

      if (error) {
        console.error('Error saving appearance', error);
        if (!options?.silent) toast.error('Failed to save appearance settings.');
        setIsSaving(false);
        return;
      }

      // Backward compat: sync to profiles if primary profile
      if (creatorProfiles.length <= 1 || creatorProfiles[0]?.id === activeProfile.id) {
        await supabase.from('profiles').update(payload).eq('id', userId);
      }
    } else {
      const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
      if (error) {
        console.error('Error saving appearance', error);
        if (!options?.silent) toast.error('Failed to save appearance settings.');
        setIsSaving(false);
        return;
      }
    }

    if (!options?.silent) toast.success('Appearance settings saved!');
    setIsSaving(false);
  };

  const handleSaveAppearance = async () => {
    await saveAppearance();
  };

  const handleAgencyLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    const fileExt = file.name.split('.').pop() ?? 'png';
    const filePath = `agency/${userId}/logo.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) {
      console.error('Agency logo upload error', uploadError);
      toast.error('Failed to upload logo.');
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const newLogoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

    const { error } = await supabase
      .from('profiles')
      .update({ agency_logo_url: newLogoUrl })
      .eq('id', userId);

    if (error) {
      console.error('Failed to save agency_logo_url', error);
      toast.error('Agency logo column not available. Please apply migration 070.');
      return;
    }

    setAgencyLogoUrl(newLogoUrl);
    toast.success('Logo updated!');
  };

  const handleSaveAgencyBranding = async () => {
    if (!userId) return;
    setIsSavingAgency(true);

    const updates: Record<string, unknown> = {};
    if (agencyName.trim()) updates.agency_name = agencyName.trim();
    else updates.agency_name = null;

    if (agencyLogoUrl) updates.agency_logo_url = agencyLogoUrl;

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) {
      console.error('Failed to save agency branding', error);
      toast.error('Agency columns not available. Please apply migration 070.');
    } else {
      toast.success('Branding saved!');
    }

    setIsSavingAgency(false);
  };

  const handleRemoveAgencyLogo = async () => {
    if (!userId) return;
    const { error } = await supabase
      .from('profiles')
      .update({ agency_logo_url: null })
      .eq('id', userId);

    if (error) {
      toast.error('Failed to remove logo.');
    } else {
      setAgencyLogoUrl(null);
      toast.success('Logo removed.');
    }
  };

  // Agency category constants imported from @/lib/categories

  const handleSaveAgencyCategories = async () => {
    if (!userId) return;
    setIsSavingAgencyCategories(true);

    // Always save to profiles (works for all agency accounts)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        agency_pricing: agencyCats.pricing || null,
        agency_target_market: agencyCats.targetMarket,
        agency_services_offered: agencyCats.services,
        agency_platform_focus: agencyCats.platform,
        agency_growth_strategy: agencyCats.growthStrategy,
        model_categories: agencyCats.modelTypes,
      })
      .eq('id', userId);

    // If also linked to a directory listing, sync there too
    if (!profileError && directoryAgencyId) {
      await supabase
        .from('directory_agencies')
        .update({
          pricing_structure: agencyCats.pricing || null,
          target_market: agencyCats.targetMarket,
          services_offered: agencyCats.services,
          platform_focus: agencyCats.platform,
          growth_strategy: agencyCats.growthStrategy,
          model_categories: agencyCats.modelTypes,
        })
        .eq('id', directoryAgencyId);
    }

    if (profileError) {
      toast.error('Failed to save categories.');
    } else {
      toast.success('Agency categories saved!');
    }
    setIsSavingAgencyCategories(false);
  };

  const handleSocialLinkChange = (platform: string, value: string) => {
    setSocialLinks((prev) => {
      const updated = {
        ...prev,
        [platform]: value,
      };

      // Auto-save social links without requiring explicit "Save" click
      void saveAppearance({ socialLinksOverride: updated, silent: true });

      return updated;
    });
  };

  const themeOptions = [
    { id: 'day', label: 'Day', color: 'bg-gradient-to-r from-amber-400 to-orange-400' },
    { id: 'purple', label: 'Purple', color: 'bg-gradient-to-r from-purple-500 to-violet-500' },
    { id: 'blue', label: 'Blue', color: 'bg-gradient-to-r from-blue-500 to-cyan-500' },
    { id: 'orange', label: 'Orange', color: 'bg-gradient-to-r from-orange-500 to-amber-500' },
    { id: 'green', label: 'Green', color: 'bg-gradient-to-r from-green-500 to-emerald-500' },
    { id: 'red', label: 'Red', color: 'bg-gradient-to-r from-red-500 to-rose-600' },
  ];

  const socialPlatformsList = [
    { id: 'twitter', label: 'X (Twitter)', placeholder: 'https://x.com/yourhandle' },
    { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
    { id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourhandle' },
    { id: 'telegram', label: 'Telegram', placeholder: 'https://t.me/yourhandle' },
    { id: 'onlyfans', label: 'OnlyFans', placeholder: 'https://onlyfans.com/yourhandle' },
    { id: 'fansly', label: 'Fansly', placeholder: 'https://fansly.com/yourhandle' },
    { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourhandle' },
    { id: 'linktree', label: 'Linktree', placeholder: 'https://linktr.ee/yourhandle' },
    { id: 'snapchat', label: 'Snapchat', placeholder: 'https://snapchat.com/add/yourhandle' },
  ];


  const menuItems = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'subscription', label: 'Subscriptions', icon: CreditCard },
    { id: 'profiles', label: 'Profiles & Agency', icon: Users },
    { id: 'security', label: 'Security', icon: Lock },
  ] as const;

  if (isLoading) {
    return (
      <AppShell>
        <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16">
          <div className="mt-8 text-center text-exclu-space">Loading profile...</div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mt-4 sm:mt-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud">Settings</h1>
            <ThemeToggleSwitch />
          </div>

          <div className="flex flex-col lg:flex-row gap-6 overflow-x-hidden">
            {/* Sidebar menu */}
            <aside className="lg:w-56 flex-shrink-0 -mx-4 px-4 lg:mx-0 lg:px-0">
              <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-none">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${isActive
                        ? 'bg-primary/10 text-primary border border-primary/30'
                        : 'text-exclu-space hover:text-exclu-cloud hover:bg-exclu-ink/70 border border-transparent'
                        }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                      <ChevronRight className={`w-4 h-4 ml-auto hidden lg:block ${isActive ? 'text-primary' : 'text-exclu-arsenic'}`} />
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Profile Section */}
              {activeSection === 'profile' && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {/* Avatar Card - Separate prominent section */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-6">
                    <div className="flex items-center gap-6">
                      <div
                        onClick={handleAvatarClick}
                        className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-exclu-arsenic/50 bg-exclu-ink cursor-pointer group flex-shrink-0"
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-exclu-phantom/40">
                            <User className="w-8 h-8 sm:w-10 sm:h-10 text-exclu-space/60" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Camera className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarFileChange}
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-exclu-cloud truncate">
                          {displayName || 'Your Name'}
                        </h3>
                        <p className="text-sm text-exclu-space/70 truncate">
                          {handle ? `@${handle}` : 'Set your handle below'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <button
                            onClick={handleAvatarClick}
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            Upload new photo
                          </button>
                          {publicProfileUrl && (
                            <div className="flex items-center gap-1 text-xs text-exclu-space/70">
                              <button
                                type="button"
                                onClick={handleCopyProfileUrl}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-border bg-primary/10 hover:bg-primary/20 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Copy public profile link"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <a
                                href={publicProfileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-border bg-primary/10 hover:bg-primary/20 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Open public profile"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Profile Details Card */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 overflow-hidden">
                    <div className="px-6 py-4 border-b border-exclu-arsenic/40">
                      <h2 className="text-sm font-semibold text-exclu-cloud">Profile Details</h2>
                      <p className="text-xs text-exclu-space/60 mt-0.5">This information will be visible on your public profile</p>
                    </div>

                    <div className="p-6 space-y-5">
                      {/* Display Name */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-start">
                        <div className="sm:pt-2.5">
                          <label className="text-sm font-medium text-exclu-cloud">Display Name</label>
                          <p className="text-xs text-exclu-space/60 mt-0.5 hidden sm:block">How fans will see you</p>
                        </div>
                        <div className="sm:col-span-2">
                          <Input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Enter your name"
                            className="h-11 bg-primary/10 border-border text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                          />
                        </div>
                      </div>



                      {/* Bio */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-start">
                        <div className="sm:pt-2.5">
                          <label className="text-sm font-medium text-exclu-cloud">Bio</label>
                          <p className="text-xs text-exclu-space/60 mt-0.5 hidden sm:block">Brief description about you</p>
                        </div>
                        <div className="sm:col-span-2">
                          <Textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell your fans about yourself and your content..."
                            className="min-h-[120px] bg-primary/10 border-border text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none"
                          />
                          <p className="text-[10px] text-exclu-space/50 mt-1.5 text-right">{bio.length}/500</p>
                        </div>
                      </div>

                      {/* Country Selector */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-start">
                        <div className="sm:pt-2.5">
                          <label className="text-sm font-medium text-exclu-cloud">Country</label>
                          <p className="text-xs text-exclu-space/60 mt-0.5 hidden sm:block">Required for payouts</p>
                        </div>
                        <div className="sm:col-span-2">
                          <select
                            value={country || 'US'}
                            onChange={(e) => setCountry(e.target.value)}
                            className="h-11 w-full rounded-md border border-border bg-primary/10 px-3 text-sm text-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                          >
                            <option value="US">United States</option>
                            <option value="GB">United Kingdom</option>
                            <option value="CA">Canada</option>
                            <option value="AU">Australia</option>
                            <option value="FR">France</option>
                            <option value="DE">Germany</option>
                            <option value="ES">Spain</option>
                            <option value="IT">Italy</option>
                            <option value="NL">Netherlands</option>
                            <option value="BE">Belgium</option>
                            <option value="CH">Switzerland</option>
                            <option value="AT">Austria</option>
                            <option value="IE">Ireland</option>
                            <option value="PT">Portugal</option>
                            <option value="PL">Poland</option>
                            <option value="CZ">Czech Republic</option>
                            <option value="DK">Denmark</option>
                            <option value="FI">Finland</option>
                            <option value="NO">Norway</option>
                            <option value="SE">Sweden</option>
                            <option value="BR">Brazil</option>
                            <option value="MX">Mexico</option>
                          </select>
                        </div>
                      </div>

                    </div>

                    {/* Save button in footer */}
                    <div className="px-6 py-4 border-t border-exclu-arsenic/40 bg-exclu-phantom/10 flex justify-end">
                      <Button
                        onClick={handleSaveProfile}
                        variant="hero"
                        disabled={isSaving}
                        className="rounded-full px-6"
                      >
                        {isSaving ? 'Saving...' : 'Save changes'}
                      </Button>
                    </div>
                  </div>

                  {/* Public Link Card */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-exclu-cloud mb-4">Your Public Link</h2>

                    {publicProfileUrl ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 rounded-xl bg-primary/10 border border-border px-4 py-3">
                          <input
                            type="text"
                            readOnly
                            value={publicProfileUrl}
                            className="flex-1 bg-transparent border-0 outline-none text-sm text-exclu-cloud truncate"
                          />
                          <button
                            onClick={handleCopyProfileUrl}
                            className="p-2 rounded-lg hover:bg-exclu-ink/80 transition-colors"
                            aria-label="Copy link"
                          >
                            <Copy className="w-4 h-4 text-primary" />
                          </button>
                          <a
                            href={publicProfileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-lg hover:bg-exclu-ink/80 transition-colors"
                            aria-label="Open link"
                          >
                            <ExternalLink className="w-4 h-4 text-primary" />
                          </a>
                        </div>
                        <p className="text-xs text-exclu-space/70">
                          Share this link with your fans to let them discover your exclusive content.
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                        <p className="text-sm text-amber-200">
                          Set a handle above to get your public profile link.
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Subscription Section */}
              {activeSection === 'subscription' && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {/* Current Plan Card */}
                  <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-exclu-cloud mb-5">Your Plan</h2>

                    <div className="flex items-start gap-4 p-4 rounded-xl bg-primary/10 border border-border">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isCreatorSubscribed ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
                        {isCreatorSubscribed ? (
                          <Zap className="w-6 h-6 text-emerald-400" />
                        ) : (
                          <CreditCard className="w-6 h-6 text-amber-300" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-exclu-cloud">
                            {isCreatorSubscribed ? 'Premium Plan' : 'Free Plan'}
                          </h3>
                          {isCreatorSubscribed && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] text-emerald-300 dark:text-emerald-300 light:text-black font-medium">
                              <Check className="w-3 h-3 text-emerald-300 dark:text-emerald-300 light:text-black" />
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-exclu-space/80 mt-1">
                          {isCreatorSubscribed
                            ? '0% commission on all your sales. You keep 100% of your revenue.'
                            : '10% commission on sales. Upgrade to Premium to keep 100% of your revenue.'}
                        </p>
                        {isCreatorSubscribed && (
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-exclu-space/60">
                              ${creatorProfiles.length > 2
                                ? `${39 + (creatorProfiles.length - 2) * 10}/month`
                                : '39/month'} • Billed monthly
                            </p>
                            {creatorProfiles.length > 2 && (
                              <div className="text-[11px] text-exclu-space/50 space-y-0.5">
                                <p>$39 base + {creatorProfiles.length - 2} additional profile{creatorProfiles.length - 2 > 1 ? 's' : ''} × $10/mo</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      {!isCreatorSubscribed && (
                        <Button
                          onClick={handleUpgradeToPremium}
                          variant="hero"
                          disabled={isUpgradeLoading}
                          className="rounded-full"
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          {isUpgradeLoading ? 'Loading...' : 'Upgrade to Premium – $39/mo'}
                        </Button>
                      )}
                      {isCreatorSubscribed && (
                        <Button
                          onClick={handleCancelSubscription}
                          variant="outline"
                          className="rounded-full border-red-500/30 text-red-400 hover:bg-red-500/10"
                        >
                          Cancel subscription
                        </Button>
                      )}
                    </div>
                  </div>

                </motion.div>
              )}

              {/* Profiles & Agency Section */}
              {activeSection === 'profiles' && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {/* Visual profile gallery */}
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="px-6 py-5 border-b border-border/40 bg-gradient-to-r from-primary/5 to-transparent">
                      <h2 className="text-lg font-semibold text-exclu-cloud">Your Profiles</h2>
                      <p className="text-xs text-exclu-space/70 mt-0.5">
                        Manage multiple creator identities from one account, like a talent agency.
                      </p>
                    </div>

                    <div className="p-6">
                      {/* Profile avatars row */}
                      <div className="flex items-center justify-center gap-4 sm:gap-6 mb-6">
                        {creatorProfiles.map((profile, i) => (
                          <motion.button
                            key={profile.id}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.08, type: 'spring', stiffness: 300, damping: 25 }}
                            className="flex flex-col items-center gap-2 outline-none"
                            onClick={() => {
                              if (activeProfile?.id !== profile.id) {
                                setActiveProfileId(profile.id);
                                toast.success(`Switched to ${profile.display_name || profile.username}`);
                              }
                            }}
                          >
                            <div className={`relative rounded-full p-0.5 transition-all cursor-pointer hover:scale-105 ${
                              activeProfile?.id === profile.id
                                ? 'ring-2 ring-primary ring-offset-2 ring-offset-card'
                                : 'hover:ring-2 hover:ring-primary/30 hover:ring-offset-2 hover:ring-offset-card'
                            }`}>
                              {profile.avatar_url ? (
                                <img
                                  src={profile.avatar_url}
                                  alt={profile.display_name || ''}
                                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border border-border/40 flex items-center justify-center text-xl font-semibold text-foreground/70">
                                  {(profile.display_name || profile.username || '?')[0]?.toUpperCase()}
                                </div>
                              )}
                              {activeProfile?.id === profile.id && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-md">
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="text-center max-w-[80px]">
                              <p className="text-xs font-medium text-exclu-cloud truncate">
                                {profile.display_name || profile.username || 'Unnamed'}
                              </p>
                              {profile.username && (
                                <p className="text-[10px] text-exclu-space/60 truncate">@{profile.username}</p>
                              )}
                            </div>
                          </motion.button>
                        ))}

                        {/* Add profile placeholder */}
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: creatorProfiles.length * 0.08, type: 'spring', stiffness: 300, damping: 25 }}
                          onClick={() => navigate('/app/profiles/new')}
                          className="flex flex-col items-center gap-2 group"
                        >
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-dashed border-border/60 group-hover:border-primary/50 flex items-center justify-center transition-colors">
                            <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Add new</p>
                        </motion.button>
                      </div>

                      {/* Status badge */}
                      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                        isAgency
                          ? 'bg-emerald-500/5 border-emerald-500/30'
                          : 'bg-primary/5 border-border'
                      }`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isAgency ? 'bg-emerald-500/15' : 'bg-primary/10'
                        }`}>
                          <Users className={`w-4.5 h-4.5 ${isAgency ? 'text-emerald-500' : 'text-primary'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-exclu-cloud">
                            {isAgency ? 'Agency mode active' : 'Single profile'}
                          </p>
                          <p className="text-xs text-exclu-space/70 mt-0.5">
                            {isAgency
                              ? `You're managing ${creatorProfiles.length} profiles. Use the dropdown in the top bar to switch between them.`
                              : 'Add a second profile to unlock Agency mode with consolidated stats and profile switching.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Agency Branding — only for agency users */}
                  {isAgency && (
                    <div className="rounded-2xl border border-border bg-card overflow-hidden">
                      <div className="px-6 py-5 border-b border-border/40 bg-gradient-to-r from-primary/5 to-transparent">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <h2 className="text-lg font-semibold text-exclu-cloud">Agency Branding</h2>
                            <p className="text-xs text-exclu-space/70">Shown on your profiles' public pages</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 space-y-6">
                        {/* Logo + Name in a single row */}
                        <div className="flex items-start gap-5">
                          {/* Logo */}
                          <div className="flex-shrink-0">
                            <div className="relative group">
                              {agencyLogoUrl ? (
                                <>
                                  <img
                                    src={agencyLogoUrl}
                                    alt="Agency logo"
                                    className="w-20 h-20 rounded-2xl object-contain border border-border bg-black/20 p-2"
                                  />
                                  <button
                                    onClick={handleRemoveAgencyLogo}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                  >
                                    <Trash2 className="w-2.5 h-2.5 text-white" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => agencyLogoInputRef.current?.click()}
                                  className="w-20 h-20 rounded-2xl border-2 border-dashed border-border/50 hover:border-primary/40 flex flex-col items-center justify-center bg-muted/5 hover:bg-primary/5 transition-all cursor-pointer gap-1.5"
                                >
                                  <Upload className="w-4 h-4 text-muted-foreground/50" />
                                  <span className="text-[10px] text-muted-foreground/50 font-medium">Logo</span>
                                </button>
                              )}
                              <input
                                ref={agencyLogoInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                className="hidden"
                                onChange={handleAgencyLogoUpload}
                              />
                            </div>
                            {agencyLogoUrl && (
                              <button
                                onClick={() => agencyLogoInputRef.current?.click()}
                                className="mt-1.5 w-full text-center text-[10px] text-exclu-space/50 hover:text-primary transition-colors"
                              >
                                Change
                              </button>
                            )}
                          </div>

                          {/* Name */}
                          <div className="flex-1 space-y-2 pt-1">
                            <label className="text-sm font-medium text-exclu-cloud">Agency Name</label>
                            <Input
                              value={agencyName}
                              onChange={(e) => setAgencyName(e.target.value)}
                              placeholder="e.g. TopModels Agency"
                              className="h-11 bg-muted/10 border-border text-foreground placeholder:text-muted-foreground/40"
                            />
                          </div>
                        </div>

                      </div>

                      <div className="px-6 py-3.5 border-t border-border/40 bg-muted/5 flex justify-end">
                        <Button
                          onClick={handleSaveAgencyBranding}
                          variant="hero"
                          disabled={isSavingAgency}
                          className="rounded-full px-6 h-9 text-sm"
                        >
                          {isSavingAgency ? 'Saving...' : 'Save branding'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Agency Categories — visible for all agency accounts */}
                  {isAgency && (
                    <div className="rounded-2xl border border-border bg-card overflow-hidden">
                      <div className="px-6 py-5 border-b border-border/40 bg-gradient-to-r from-primary/5 to-transparent">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Tag className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <h2 className="text-lg font-semibold text-exclu-cloud">Agency Categories</h2>
                              <p className="text-xs text-exclu-space/70">How your agency appears in the directory</p>
                            </div>
                          </div>
                          <Button
                            onClick={handleSaveAgencyCategories}
                            variant="hero"
                            disabled={isSavingAgencyCategories}
                            className="rounded-full px-5 h-8 text-xs"
                          >
                            {isSavingAgencyCategories ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : null}
                            {isSavingAgencyCategories ? 'Saving…' : 'Save categories'}
                          </Button>
                        </div>
                      </div>
                      <div className="p-6">
                        <AgencyCategoryConfig value={agencyCats} onChange={setAgencyCats} />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => navigate('/app/profiles/new')}
                      variant="hero"
                      className="rounded-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create new profile
                    </Button>

                    {isAgency && (
                      <Button
                        onClick={() => navigate('/app/agency')}
                        variant="outline"
                        className="rounded-full border-exclu-arsenic/60"
                      >
                        <Users className="w-4 h-4 mr-2" />
                        Open Agency Panel
                      </Button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Security Section */}
              {activeSection === 'security' && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {/* Email Card */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-gradient-to-br from-exclu-ink/95 via-exclu-phantom/30 to-exclu-ink/95 p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-exclu-cloud mb-4">Email Address</h2>

                    <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-border">
                      <Mail className="w-5 h-5 text-exclu-space/60" />
                      <span className="text-sm text-exclu-cloud">{email}</span>
                      <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] text-emerald-300 dark:text-emerald-300 light:text-black font-medium">
                        <Check className="w-3 h-3 text-emerald-300 dark:text-emerald-300 light:text-black" />
                        Verified
                      </span>
                    </div>
                  </div>

                  {/* Password Card */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-exclu-cloud mb-4">Change Password</h2>

                    <div className="space-y-4 max-w-md">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-exclu-space">New Password</label>
                        <Input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          className="h-10 bg-exclu-ink border-exclu-arsenic/60 text-exclu-cloud"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-exclu-space">Confirm New Password</label>
                        <Input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          className="h-10 bg-exclu-ink border-exclu-arsenic/60 text-exclu-cloud"
                        />
                      </div>

                      <Button
                        onClick={handleChangePassword}
                        variant="outline"
                        disabled={isChangingPassword || !newPassword || !confirmPassword}
                        className="rounded-full border-exclu-arsenic/60"
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        {isChangingPassword ? 'Changing...' : 'Change password'}
                      </Button>
                    </div>
                  </div>

                  {/* Support Card */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Need help?</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Contact our support team on Telegram</p>
                      </div>
                      <a
                        href="https://telegram.me/exclu_support"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-sm font-medium transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Contact
                      </a>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

        {/* Logout card — mobile only */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="sm:hidden mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-red-400">Sign out</p>
              <p className="text-xs text-muted-foreground mt-0.5">You will be redirected to the home page</p>
            </div>
            <button
              type="button"
              onClick={async () => { await supabase.auth.signOut(); navigate('/', { replace: true }); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </motion.div>
        </motion.div>
      </main>

      {/* Loading overlay removed — IBAN setup is inline, no external redirect needed */}
    </AppShell>
  );
};

export default Profile;
