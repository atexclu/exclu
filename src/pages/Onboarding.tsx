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

type PlatformKey = 'onlyfans' | 'fansly' | 'myclub' | 'mym' | 'other';

const Onboarding = () => {
  const navigate = useNavigate();
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

      toast.success('Your creator profile is ready.');
      navigate('/app');
    } catch (err: any) {
      console.error('Error during onboarding save', err);
      toast.error(err?.message || 'Unable to complete onboarding right now.');
    } finally {
      setIsSaving(false);
    }
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
                    {isSaving ? 'Saving…' : 'Continue to dashboard'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
};

export default Onboarding;
