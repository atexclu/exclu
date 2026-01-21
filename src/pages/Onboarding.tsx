import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Sparkles, Zap } from 'lucide-react';

type PlatformKey = 'onlyfans' | 'fansly' | 'myclub' | 'mym' | 'other';

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'profile' | 'plan'>('profile');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [platformUrls, setPlatformUrls] = useState<Record<PlatformKey, string>>({
    onlyfans: '',
    fansly: '',
    myclub: '',
    mym: '',
    other: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'premium'>('premium');
  const [isSubscribing, setIsSubscribing] = useState(false);

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
        .select('display_name, handle, external_url')
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

      // Charger les liens de plateformes externes existants
      const { data: links, error: linksError } = await supabase
        .from('profile_links')
        .select('platform, url')
        .eq('profile_id', user.id);

      if (!isMounted) return;

      if (linksError) {
        console.error('Error loading profile_links for onboarding', linksError);
      } else if (links && Array.isArray(links)) {
        setPlatformUrls((prev) => {
          const next = { ...prev };
          links.forEach((link: any) => {
            const key = link.platform as PlatformKey;
            if (key && Object.prototype.hasOwnProperty.call(next, key)) {
              next[key] = link.url || '';
            }
          });
          return next;
        });
      }

      // Si le handle est déjà défini, on peut rediriger directement vers le dashboard
      if (profile?.handle) {
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

      const mainExternalUrl =
        platformUrls.onlyfans.trim() ||
        platformUrls.fansly.trim() ||
        platformUrls.myclub.trim() ||
        platformUrls.mym.trim() ||
        platformUrls.other.trim() ||
        null;

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            display_name: displayName.trim(),
            handle: trimmedHandle,
            external_url: mainExternalUrl,
            is_creator: true,
          },
          { onConflict: 'id' }
        );

      if (updateError) {
        console.error(updateError);
        throw new Error('Unable to save your profile. Please try again.');
      }

      // Mettre à jour les liens de plateformes externes
      const platformRows = (Object.entries(platformUrls) as [PlatformKey, string][]) // type narrowing
        .map(([platform, url]) => ({ platform, url: url.trim() }))
        .filter((entry) => entry.url.length > 0)
        .map((entry) => ({ profile_id: user.id, platform: entry.platform, url: entry.url }));

      // On simplifie : on supprime les anciens liens de ce profil puis on insère les nouveaux
      const { error: deleteError } = await supabase
        .from('profile_links')
        .delete()
        .eq('profile_id', user.id);

      if (deleteError) {
        console.error('Error deleting existing profile_links', deleteError);
        throw new Error('Unable to update your external links. Please try again.');
      }

      if (platformRows.length > 0) {
        const { error: insertError } = await supabase.from('profile_links').insert(platformRows);
        if (insertError) {
          console.error('Error inserting profile_links', insertError);
          throw new Error('Unable to save your external platform links.');
        }
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
      toast.success('Welcome to Exclu! You can upgrade anytime.');
      navigate('/app');
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
    toast.success('Welcome to Exclu! You can upgrade to Premium anytime from your settings.');
    navigate('/app');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      <main className="flex-1 px-4 pt-24 pb-10 flex items-start sm:items-center justify-center relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 -left-24 h-64 w-64 rounded-full bg-primary/25 blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -right-24 h-72 w-72 rounded-full bg-exclu-iris/25 blur-3xl animate-[pulse_7s_ease-in-out_infinite]" />
        </div>

        {/* Step indicator */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full transition-colors ${step === 'profile' ? 'bg-primary' : 'bg-exclu-arsenic'}`} />
          <div className={`w-2 h-2 rounded-full transition-colors ${step === 'plan' ? 'bg-primary' : 'bg-exclu-arsenic'}`} />
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
                        exclu.at/c/
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

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-exclu-space">External platforms (optional)</p>
                    <p className="text-[11px] text-exclu-space/70">
                      Add links to your main platforms. These will appear as small buttons on your public profile and
                      in your dashboard.
                    </p>

                    <div className="space-y-1.5 mt-1">
                      <label className="text-[11px] font-medium text-exclu-space flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#00AFF0]/15 text-[10px] text-[#00AFF0] font-semibold">
                          OF
                        </span>
                        OnlyFans
                      </label>
                      <Input
                        type="url"
                        value={platformUrls.onlyfans}
                        onChange={(e) => setPlatformUrls((prev) => ({ ...prev, onlyfans: e.target.value }))}
                        placeholder="https://onlyfans.com/yourname"
                        className="h-9 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-[13px]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-exclu-space flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#1DA1F2]/15 text-[10px] text-[#1DA1F2] font-semibold">
                          F
                        </span>
                        Fansly
                      </label>
                      <Input
                        type="url"
                        value={platformUrls.fansly}
                        onChange={(e) => setPlatformUrls((prev) => ({ ...prev, fansly: e.target.value }))}
                        placeholder="https://fansly.com/yourname"
                        className="h-9 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-[13px]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-exclu-space flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#6366F1]/15 text-[10px] text-[#6366F1] font-semibold">
                          MC
                        </span>
                        my.club
                      </label>
                      <Input
                        type="url"
                        value={platformUrls.myclub}
                        onChange={(e) => setPlatformUrls((prev) => ({ ...prev, myclub: e.target.value }))}
                        placeholder="https://my.club/yourname"
                        className="h-9 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-[13px]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-exclu-space flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#F97316]/15 text-[10px] text-[#F97316] font-semibold">
                          MYM
                        </span>
                        MYM
                      </label>
                      <Input
                        type="url"
                        value={platformUrls.mym}
                        onChange={(e) => setPlatformUrls((prev) => ({ ...prev, mym: e.target.value }))}
                        placeholder="https://mym.fans/yourname"
                        className="h-9 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-[13px]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-exclu-space flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-exclu-cloud/10 text-[10px] text-exclu-cloud font-semibold">
                          WEB
                        </span>
                        Other link
                      </label>
                      <Input
                        type="url"
                        value={platformUrls.other}
                        onChange={(e) => setPlatformUrls((prev) => ({ ...prev, other: e.target.value }))}
                        placeholder="https://yourwebsite.com/links"
                        className="h-9 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-[13px]"
                      />
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
                  RECOMMENDED
                </div>
                {selectedPlan === 'premium' && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
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
      </main>
      <Footer />
    </div>
  );
};

export default Onboarding;
