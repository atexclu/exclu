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
  const [activeSection, setActiveSection] = useState<'profile' | 'subscription' | 'security'>('profile');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const publicProfileUrl = handle ? `${window.location.origin}/c/${handle}` : null;

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
        .select('display_name, handle, bio, avatar_url, stripe_account_id, stripe_connect_status, is_creator_subscribed')
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

  const menuItems = [
    { id: 'profile', label: 'Profile', icon: User },
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
                  {/* Avatar & Basic Info Card */}
                  <div className="rounded-2xl border border-exclu-arsenic/60 bg-gradient-to-br from-exclu-ink/95 via-exclu-phantom/30 to-exclu-ink/95 p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-exclu-cloud mb-5">Profile Information</h2>

                    <div className="flex flex-col sm:flex-row gap-6">
                      {/* Avatar */}
                      <div className="flex flex-col items-center gap-3">
                        <div
                          onClick={handleAvatarClick}
                          className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-exclu-arsenic/60 bg-exclu-ink cursor-pointer group"
                        >
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-exclu-phantom/40">
                              <User className="w-10 h-10 text-exclu-space/60" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Camera className="w-6 h-6 text-white" />
                          </div>
                        </div>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarFileChange}
                        />
                        <button
                          onClick={handleAvatarClick}
                          className="text-xs text-primary hover:underline"
                        >
                          Change photo
                        </button>
                      </div>

                      {/* Form fields */}
                      <div className="flex-1 space-y-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-exclu-space">Display Name</label>
                          <Input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Your name"
                            className="h-10 bg-exclu-ink border-exclu-arsenic/60 text-exclu-cloud"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-exclu-space">Handle</label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-exclu-space/60">@</span>
                            <Input
                              value={handle}
                              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                              placeholder="yourhandle"
                              className="h-10 bg-exclu-ink border-exclu-arsenic/60 text-exclu-cloud"
                            />
                          </div>
                          <p className="text-[10px] text-exclu-space/60">This will be your public profile URL</p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-exclu-space">Bio</label>
                          <Textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell your fans about yourself..."
                            className="min-h-[100px] bg-exclu-ink border-exclu-arsenic/60 text-exclu-cloud"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex justify-end">
                      <Button
                        onClick={handleSaveProfile}
                        variant="hero"
                        disabled={isSaving}
                        className="rounded-full"
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
