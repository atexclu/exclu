import AppShell from '@/components/AppShell';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  User,
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
  Palette,
} from 'lucide-react';

const Profile = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeConnectStatus, setStripeConnectStatus] = useState<string | null>(null);
  const [isCreatorSubscribed, setIsCreatorSubscribed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'appearance' | 'subscription' | 'security'>('profile');
  const [themeColor, setThemeColor] = useState<string>('pink');
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [showJoinBanner, setShowJoinBanner] = useState<boolean>(true);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

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

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, handle, bio, avatar_url, stripe_account_id, stripe_connect_status, is_creator_subscribed, theme_color, social_links, show_join_banner')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Error loading profile', profileError);
      } else if (profile) {
        setDisplayName(profile.display_name || '');
        setHandle(profile.handle || '');
        setBio(profile.bio || '');
        setAvatarUrl(profile.avatar_url || null);
        setStripeAccountId(profile.stripe_account_id || null);
        setStripeConnectStatus(profile.stripe_connect_status || null);
        setIsCreatorSubscribed(profile.is_creator_subscribed === true);
        setThemeColor(profile.theme_color || 'pink');
        setSocialLinks(profile.social_links || {});
        setShowJoinBanner(
          profile.show_join_banner === null || profile.show_join_banner === undefined
            ? true
            : Boolean(profile.show_join_banner)
        );
      }

      setIsLoading(false);
    };

    fetchProfile();
  }, []);

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    const fileExt = file.name.split('.').pop() ?? 'jpg';
    const filePath = `avatars/${userId}/avatar.${fileExt}`;

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

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: newAvatarUrl })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating avatar_url', updateError);
      toast.error('Failed to save avatar. Please try again.');
      return;
    }

    setAvatarUrl(newAvatarUrl);
    toast.success('Avatar updated successfully!');
  };

  const handleSaveProfile = async () => {
    if (!userId) return;
    setIsSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || null,
        handle: handle.trim().toLowerCase() || null,
        bio: bio.trim() || null,
      })
      .eq('id', userId);

    if (error) {
      console.error('Error saving profile', error);
      toast.error('Failed to save profile. Please try again.');
    } else {
      toast.success('Profile saved successfully!');
    }

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

  const handleStripeConnect = async () => {
    setIsStripeLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please sign in again to connect Stripe.');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-connect-onboard`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Unable to start Stripe onboarding.');
      }
    } catch (err) {
      console.error('Error starting Stripe Connect onboarding', err);
      toast.error('Unable to connect Stripe. Please try again.');
    } finally {
      setIsStripeLoading(false);
    }
  };

  const handleUpgradeToPremium = async () => {
    setIsStripeLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please sign in again to upgrade.');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-creator-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Unable to start subscription checkout.');
      }
    } catch (err) {
      console.error('Error starting subscription checkout', err);
      toast.error('Unable to upgrade. Please try again.');
    } finally {
      setIsStripeLoading(false);
    }
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

  const handleSaveAppearance = async () => {
    if (!userId) return;
    setIsSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        theme_color: themeColor,
        social_links: socialLinks,
        show_join_banner: showJoinBanner,
      })
      .eq('id', userId);

    if (error) {
      console.error('Error saving appearance', error);
      toast.error('Failed to save appearance settings.');
    } else {
      toast.success('Appearance settings saved!');
    }

    setIsSaving(false);
  };

  const handleSocialLinkChange = (platform: string, value: string) => {
    setSocialLinks((prev) => ({
      ...prev,
      [platform]: value,
    }));
  };

  const themeOptions = [
    { id: 'pink', label: 'Pink', color: 'bg-gradient-to-r from-pink-500 to-rose-500' },
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
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'subscription', label: 'Subscription & Payments', icon: CreditCard },
    { id: 'security', label: 'Security', icon: Lock },
  ] as const;

  if (isLoading) {
    return (
      <AppShell>
        <main className="px-4 pb-16 max-w-5xl mx-auto">
          <div className="mt-8 text-center text-exclu-space">Loading profile...</div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="px-4 pb-16 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mt-4 sm:mt-6"
        >
          <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-6">Settings</h1>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar menu */}
            <aside className="lg:w-56 flex-shrink-0">
              <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                        isActive
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
                        className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-exclu-arsenic/50 bg-exclu-ink cursor-pointer group flex-shrink-0 ring-4 ring-exclu-phantom/20"
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
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-exclu-arsenic/60 bg-black/40 hover:bg-exclu-ink/80 text-exclu-space hover:text-exclu-cloud transition-colors"
                                aria-label="Copy public profile link"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <a
                                href={publicProfileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-exclu-arsenic/60 bg-black/40 hover:bg-exclu-ink/80 text-exclu-space hover:text-exclu-cloud transition-colors"
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
                            className="h-11 bg-black/40 border-exclu-arsenic/50 text-exclu-cloud placeholder:text-exclu-space/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                          />
                        </div>
                      </div>

                      {/* Handle */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-start">
                        <div className="sm:pt-2.5">
                          <label className="text-sm font-medium text-exclu-cloud">Username</label>
                          <p className="text-xs text-exclu-space/60 mt-0.5 hidden sm:block">Your unique profile URL</p>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="flex">
                            <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-exclu-arsenic/50 bg-exclu-phantom/30 text-sm text-exclu-space/70">
                              exclu.at/
                            </span>
                            <Input
                              value={handle}
                              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                              placeholder="yourhandle"
                              className="h-11 rounded-l-none bg-black/40 border-exclu-arsenic/50 text-exclu-cloud placeholder:text-exclu-space/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                            />
                          </div>
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
                            className="min-h-[120px] bg-black/40 border-exclu-arsenic/50 text-exclu-cloud placeholder:text-exclu-space/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none"
                          />
                          <p className="text-[10px] text-exclu-space/50 mt-1.5 text-right">{bio.length}/500</p>
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

                  {/* Public banner visibility (Premium only) */}
                  {isCreatorSubscribed && (
                    <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 overflow-hidden">
                      <div className="px-6 py-4 border-b border-exclu-arsenic/40">
                        <h2 className="text-sm font-semibold text-exclu-cloud">Exclu banner</h2>
                        <p className="text-xs text-exclu-space/60 mt-0.5">
                          Control whether the small “Join now” Exclu banner is shown at the bottom of your public profile.
                        </p>
                      </div>
                      <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-exclu-cloud">Show Exclu join banner</p>
                          <p className="text-xs text-exclu-space/60">
                            When enabled, visitors will see a small Exclu banner with a “Join now” button at the bottom of your profile.
                          </p>
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm text-exclu-cloud cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showJoinBanner}
                            onChange={(e) => setShowJoinBanner(e.target.checked)}
                            className="h-4 w-4 rounded border-exclu-arsenic/60 bg-black"
                          />
                          <span>{showJoinBanner ? 'Banner enabled' : 'Banner hidden'}</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Public Link Card */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-exclu-cloud mb-4">Your Public Link</h2>

                    {publicProfileUrl ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 rounded-xl bg-black/60 border border-exclu-arsenic/50 px-4 py-3">
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

              {/* Appearance Section */}
              {activeSection === 'appearance' && (
                <motion.div
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {/* Theme Color Card */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 overflow-hidden">
                    <div className="px-6 py-4 border-b border-exclu-arsenic/40">
                      <h2 className="text-sm font-semibold text-exclu-cloud">Theme Color</h2>
                      <p className="text-xs text-exclu-space/60 mt-0.5">Choose a color theme for your public profile page</p>
                    </div>

                    <div className="p-6">
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                        {themeOptions.map((theme) => (
                          <button
                            key={theme.id}
                            type="button"
                            onClick={() => setThemeColor(theme.id)}
                            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                              themeColor === theme.id
                                ? 'border-white/50 bg-white/10'
                                : 'border-exclu-arsenic/40 hover:border-exclu-arsenic/70'
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-full ${theme.color}`} />
                            <span className="text-xs text-exclu-cloud">{theme.label}</span>
                            {themeColor === theme.id && (
                              <div className="absolute top-1 right-1">
                                <Check className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Social Links Card */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 overflow-hidden">
                    <div className="px-6 py-4 border-b border-exclu-arsenic/40">
                      <h2 className="text-sm font-semibold text-exclu-cloud">Social Links</h2>
                      <p className="text-xs text-exclu-space/60 mt-0.5">Add your social media links to display on your profile</p>
                    </div>

                    <div className="p-6 space-y-4">
                      {socialPlatformsList.map((platform) => (
                        <div key={platform.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4 items-center">
                          <label className="text-sm font-medium text-exclu-cloud">{platform.label}</label>
                          <div className="sm:col-span-3">
                            <Input
                              value={socialLinks[platform.id] || ''}
                              onChange={(e) => handleSocialLinkChange(platform.id, e.target.value)}
                              placeholder={platform.placeholder}
                              className="h-10 bg-black/40 border-exclu-arsenic/50 text-exclu-cloud placeholder:text-exclu-space/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 text-sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Save button in footer */}
                    <div className="px-6 py-4 border-t border-exclu-arsenic/40 bg-exclu-phantom/10 flex justify-end">
                      <Button
                        onClick={handleSaveAppearance}
                        variant="hero"
                        disabled={isSaving}
                        className="rounded-full px-6"
                      >
                        {isSaving ? 'Saving...' : 'Save appearance'}
                      </Button>
                    </div>
                  </div>

                  {/* Preview hint */}
                  {handle && (
                    <div className="rounded-xl border border-exclu-arsenic/40 bg-exclu-phantom/20 p-4 flex items-center justify-between">
                      <p className="text-sm text-exclu-space">
                        Preview your changes on your public profile
                      </p>
                      <a
                        href={`/${handle}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View profile
                      </a>
                    </div>
                  )}
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
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-gradient-to-br from-exclu-ink/95 via-exclu-phantom/30 to-exclu-ink/95 p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-exclu-cloud mb-5">Your Plan</h2>

                    <div className="flex items-start gap-4 p-4 rounded-xl bg-black/40 border border-exclu-arsenic/50">
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
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] text-emerald-300 font-medium">
                              <Check className="w-3 h-3" />
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
                          <p className="text-xs text-exclu-space/60 mt-2">$39/month • Billed monthly</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      {!isCreatorSubscribed && (
                        <Button
                          onClick={handleUpgradeToPremium}
                          variant="hero"
                          disabled={isStripeLoading}
                          className="rounded-full"
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          {isStripeLoading ? 'Loading...' : 'Upgrade to Premium – $39/mo'}
                        </Button>
                      )}
                      {isCreatorSubscribed && (
                        <Button
                          onClick={handleUpgradeToPremium}
                          variant="outline"
                          disabled={isStripeLoading}
                          className="rounded-full border-exclu-arsenic/60"
                        >
                          {isStripeLoading ? 'Loading...' : 'Manage subscription'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Stripe Connect Card */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-exclu-cloud mb-4">Payment Account</h2>

                    <div className="flex items-start gap-4 p-4 rounded-xl bg-black/40 border border-exclu-arsenic/50">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stripeConnectStatus === 'complete' ? 'bg-emerald-500/15' : 'bg-exclu-phantom/30'}`}>
                        <CreditCard className={`w-6 h-6 ${stripeConnectStatus === 'complete' ? 'text-emerald-400' : 'text-exclu-space'}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-exclu-cloud">Stripe Connect</h3>
                          {stripeConnectStatus === 'complete' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] text-emerald-300 font-medium">
                              <Check className="w-3 h-3" />
                              Connected
                            </span>
                          )}
                          {stripeConnectStatus === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-[10px] text-amber-300 font-medium">
                              Pending
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-exclu-space/80 mt-1">
                          {stripeAccountId
                            ? stripeConnectStatus === 'complete'
                              ? 'Your Stripe account is connected. You can receive payments from fans.'
                              : 'Complete your Stripe setup to start receiving payments.'
                            : 'Connect your Stripe account to receive payments from your fans.'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      {!stripeAccountId && (
                        <Button
                          onClick={handleStripeConnect}
                          variant="hero"
                          disabled={isStripeLoading}
                          className="rounded-full"
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          {isStripeLoading ? 'Loading...' : 'Connect Stripe'}
                        </Button>
                      )}
                      {stripeAccountId && stripeConnectStatus === 'pending' && (
                        <Button
                          onClick={handleStripeConnect}
                          variant="outline"
                          disabled={isStripeLoading}
                          className="rounded-full border-amber-500/40 text-amber-300"
                        >
                          {isStripeLoading ? 'Loading...' : 'Complete Stripe Setup'}
                        </Button>
                      )}
                    </div>
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

                    <div className="flex items-center gap-3 p-4 rounded-xl bg-black/40 border border-exclu-arsenic/50">
                      <Mail className="w-5 h-5 text-exclu-space/60" />
                      <span className="text-sm text-exclu-cloud">{email}</span>
                      <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] text-emerald-300 font-medium">
                        <Check className="w-3 h-3" />
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
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </AppShell>
  );
};

export default Profile;
