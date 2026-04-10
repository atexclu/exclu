import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useProfiles } from '@/contexts/ProfileContext';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Zap, Users, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const INCLUDED_PROFILES = 2;
const ADDON_PRICE_CENTS = 1000;
const BASE_PRICE_CENTS = 3900;

function calculateMonthlyTotal(profileCount: number): number {
  if (profileCount <= INCLUDED_PROFILES) return BASE_PRICE_CENTS;
  return BASE_PRICE_CENTS + (profileCount - INCLUDED_PROFILES) * ADDON_PRICE_CENTS;
}

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function CreateProfile() {
  const navigate = useNavigate();
  const { refreshProfiles, setActiveProfileId, profiles } = useProfiles();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [showAddonConfirm, setShowAddonConfirm] = useState(false);

  useEffect(() => {
    const checkParentAccount = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('is_creator_subscribed')
        .eq('id', user.id)
        .single();
      setIsPremium(data?.is_creator_subscribed === true);
    };
    checkParentAccount();
  }, []);

  const needsUpgrade = profiles.length >= 1 && isPremium === false;
  const needsAddon = isPremium === true && profiles.length >= INCLUDED_PROFILES;
  const newProfileCount = profiles.length + 1;
  const currentMonthly = calculateMonthlyTotal(profiles.length);
  const newMonthly = calculateMonthlyTotal(newProfileCount);
  const addonDelta = newMonthly - currentMonthly;

  const handleUsernameChange = async (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setUsername(cleaned);

    if (cleaned.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');

    const { data } = await supabase
      .from('creator_profiles')
      .select('id')
      .eq('username', cleaned)
      .maybeSingle();

    if (data) {
      const { data: handleCheck } = await supabase
        .from('profiles')
        .select('id')
        .eq('handle', cleaned)
        .maybeSingle();

      setUsernameStatus(data || handleCheck ? 'taken' : 'available');
    } else {
      const { data: handleCheck } = await supabase
        .from('profiles')
        .select('id')
        .eq('handle', cleaned)
        .maybeSingle();

      setUsernameStatus(handleCheck ? 'taken' : 'available');
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      toast.error('Display name is required');
      return;
    }
    if (username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }
    if (usernameStatus === 'taken') {
      toast.error('This username is already taken');
      return;
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let avatarUrl: string | null = null;

      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop() ?? 'jpg';
        const filePath = `avatars/${user.id}/${username}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { cacheControl: '3600', upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
        avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      }

      const { data: newProfile, error } = await supabase
        .from('creator_profiles')
        .insert({
          user_id: user.id,
          username: username.trim(),
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          avatar_url: avatarUrl,
        })
        .select('id')
        .single();

      if (error) throw error;

      await refreshProfiles();
      setActiveProfileId(newProfile.id);
      toast.success('Profile created!');
      navigate('/app');
    } catch (err: any) {
      console.error('Error creating profile:', err);
      toast.error(err.message || 'Failed to create profile');
    } finally {
      setSaving(false);
    }
  };

  const isValid = displayName.trim().length > 0 && username.length >= 3 && usernameStatus !== 'taken';

  if (needsUpgrade) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto px-4 py-12 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10 mx-auto"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/20">
              <Zap className="w-8 h-8 text-white" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Upgrade to Premium
            </h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-8">
              Multi-profile management is a Premium feature. Upgrade your plan to create and manage multiple creator profiles from a single account.
            </p>

            <div className="rounded-2xl border border-border bg-card p-6 mb-6 text-left space-y-3">
              {[
                'Manage unlimited creator profiles',
                '0% commission on all your sales',
                'Agency dashboard with consolidated stats',
                'Priority support',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  </div>
                  <span className="text-foreground/80">{feature}</span>
                </div>
              ))}
            </div>

            <Button
              variant="hero"
              size="lg"
              className="w-full rounded-full"
              onClick={() => navigate('/app/settings#payments')}
            >
              <Zap className="w-4 h-4 mr-2" />
              Upgrade to Premium — $39/mo
            </Button>

            <button
              type="button"
              onClick={async () => {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                const { error } = await supabase
                  .from('profiles')
                  .update({ is_creator_subscribed: true })
                  .eq('id', user.id);
                if (error) {
                  toast.error('Failed to activate premium bypass');
                  return;
                }
                setIsPremium(true);
                toast.success('Premium activated (manual bypass)');
              }}
              className="w-full text-center text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-3"
            >
              Skip — activate premium manually (testing)
            </button>
          </motion.div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Create New Profile</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a new creator profile to your account.
              {profiles.length === 1 && ' This will upgrade your account to multi-profile mode.'}
            </p>
          </div>

          <div className="space-y-6">
            {/* Avatar */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative"
              >
                <motion.div
                  className="w-24 h-24 rounded-full overflow-hidden border-2 border-dashed border-border/60 group-hover:border-primary/50 transition-colors bg-muted/30"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                      <Camera className="w-6 h-6 mb-1" />
                      <span className="text-[10px]">Add photo</span>
                    </div>
                  )}
                </motion.div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
              </button>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium mb-2">Display Name</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Luna Rose"
                maxLength={50}
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium mb-2">Username</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <Input
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="username"
                  maxLength={30}
                  className="pl-8"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {usernameStatus === 'taken' && <AlertCircle className="w-4 h-4 text-red-500" />}
                </div>
              </div>
              {usernameStatus === 'taken' && (
                <p className="text-xs text-red-500 mt-1">This username is already taken</p>
              )}
              {usernameStatus === 'available' && (
                <p className="text-xs text-green-500 mt-1">Username available!</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                exclu.at/@{username || 'username'}
              </p>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium mb-2">Bio <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short description..."
                maxLength={200}
                rows={3}
              />
            </div>

            {/* Pricing info for addon profiles */}
            {needsAddon && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <DollarSign className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Additional profile — {fmtPrice(ADDON_PRICE_CENTS)}/mo</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Your Premium plan includes {INCLUDED_PROFILES} profiles. This {ordinal(newProfileCount)} profile will add {fmtPrice(addonDelta)}/mo to your subscription.
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Current: <span className="text-foreground font-medium">{fmtPrice(currentMonthly)}/mo</span></span>
                      <span className="text-muted-foreground/40">→</span>
                      <span>New: <span className="text-foreground font-medium">{fmtPrice(newMonthly)}/mo</span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit */}
            <Button
              onClick={() => {
                if (needsAddon) {
                  setShowAddonConfirm(true);
                } else {
                  handleSubmit();
                }
              }}
              disabled={!isValid || saving}
              className="w-full h-12 rounded-xl font-medium"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : needsAddon ? (
                <>Create Profile — {fmtPrice(addonDelta)}/mo</>
              ) : (
                'Create Profile'
              )}
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Addon confirmation modal */}
      <AnimatePresence>
        {showAddonConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowAddonConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Confirm new profile</h3>
                    <p className="text-xs text-muted-foreground">Review your subscription changes</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3 mb-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Premium plan</span>
                    <span className="font-medium">{fmtPrice(BASE_PRICE_CENTS)}/mo</span>
                  </div>
                  {profiles.length > INCLUDED_PROFILES && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{profiles.length - INCLUDED_PROFILES} additional profile{profiles.length - INCLUDED_PROFILES > 1 ? 's' : ''}</span>
                      <span className="font-medium">{fmtPrice((profiles.length - INCLUDED_PROFILES) * ADDON_PRICE_CENTS)}/mo</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm border-t border-border/60 pt-3">
                    <span className="text-amber-500 font-medium">+ New profile ({ordinal(newProfileCount)})</span>
                    <span className="text-amber-500 font-medium">+{fmtPrice(ADDON_PRICE_CENTS)}/mo</span>
                  </div>
                  <div className="flex items-center justify-between text-sm border-t border-border pt-3">
                    <span className="font-semibold">New monthly total</span>
                    <span className="font-bold text-lg">{fmtPrice(newMonthly)}/mo</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-5">
                  The additional charge will be prorated and applied to your current billing cycle. You can remove profiles at any time from your settings.
                </p>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={() => setShowAddonConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 rounded-xl"
                    disabled={saving}
                    onClick={() => {
                      setShowAddonConfirm(false);
                      handleSubmit();
                    }}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>Confirm — {fmtPrice(newMonthly)}/mo</>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
