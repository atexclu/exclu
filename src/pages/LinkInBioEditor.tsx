import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, Loader2, Camera, FileText, Share2, Package, Palette, ChevronRight, Link as LinkIcon, Image as ImageIcon, CreditCard } from 'lucide-react';
import { MobilePreview } from '@/components/linkinbio/MobilePreview';
import { useDebounce } from 'use-debounce';
import { PhotoSection } from '@/components/linkinbio/sections/PhotoSection';
import { InfoSection } from '@/components/linkinbio/sections/InfoSection';
import { SocialSection } from '@/components/linkinbio/sections/SocialSection';
import { ContentSection } from '@/components/linkinbio/sections/ContentSection';
import { PublicContentSection } from '@/components/linkinbio/sections/PublicContentSection';
import { OptionsSection } from '@/components/linkinbio/sections/OptionsSection';
import AppShell from '@/components/AppShell';

interface LinkInBioData {
  display_name: string;
  handle: string;
  bio: string;
  avatar_url: string | null;
  theme_color: string;
  aurora_gradient: string;
  social_links: Record<string, string>;
  show_join_banner: boolean;
  location: string | null;
  link_order: {
    social_order: string[];
    content_order: string[];
  };
}

interface CreatorLink {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  slug: string;
  show_on_profile: boolean;
}

const LinkInBioEditor = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navRef = useRef<HTMLElement>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  
  const [editorData, setEditorData] = useState<LinkInBioData>({
    display_name: '',
    handle: '',
    bio: '',
    avatar_url: null,
    theme_color: 'pink',
    aurora_gradient: 'purple_dream',
    social_links: {},
    show_join_banner: true,
    location: null,
    link_order: {
      social_order: [],
      content_order: [],
    },
  });

  const [links, setLinks] = useState<CreatorLink[]>([]);
  const [publicContent, setPublicContent] = useState<any[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<'photo' | 'info' | 'social' | 'links' | 'content' | 'colors'>('photo');

  const [debouncedData] = useDebounce(editorData, 10000);

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setIsLoading(false);
        toast.error('Please sign in to customize your profile.');
        return;
      }

      setUserId(user.id);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, handle, bio, avatar_url, theme_color, aurora_gradient, social_links, show_join_banner, location, link_order, profile_draft, is_creator_subscribed, stripe_connect_status, stripe_account_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError || !profile) {
        console.error('Error loading profile', profileError);
        return;
      } else {
        setIsPremium(profile.is_creator_subscribed === true);
        
        // Check Stripe connection status - both account ID and complete status required
        const hasStripeAccount = Boolean(profile.stripe_account_id);
        const isStripeComplete = profile.stripe_connect_status === 'complete';
        setStripeConnected(hasStripeAccount && isStripeComplete);
        
        const dataToLoad = profile.profile_draft || {
          display_name: profile.display_name || '',
          handle: profile.handle || '',
          bio: profile.bio || '',
          avatar_url: profile.avatar_url || null,
          theme_color: profile.theme_color || 'pink',
          aurora_gradient: profile.aurora_gradient || 'purple_dream',
          social_links: profile.social_links || {},
          show_join_banner: profile.show_join_banner !== false,
          location: profile.location || null,
          link_order: profile.link_order || { social_order: [], content_order: [] },
        };

        setEditorData(dataToLoad);
      }

      const { data: linksData, error: linksError } = await supabase
        .from('links')
        .select('id, title, description, price_cents, currency, slug, show_on_profile')
        .eq('creator_id', user.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (linksError) {
        console.error('Error loading links', linksError);
      } else {
        setLinks((linksData || []) as CreatorLink[]);
      }

      // Load public content from assets table
      const { data: publicData, error: publicError } = await supabase
        .from('assets')
        .select('id, title, storage_path, mime_type')
        .eq('creator_id', user.id)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (!publicError && publicData) {
        const withUrls = await Promise.all(
          publicData.map(async (item) => {
            if (!item.storage_path) return { ...item, previewUrl: null };
            const { data: signed } = await supabase.storage
              .from('paid-content')
              .createSignedUrl(item.storage_path, 60 * 60);
            return { ...item, previewUrl: signed?.signedUrl || null };
          })
        );
        setPublicContent(withUrls);
      }

      setIsLoading(false);
    };

    fetchProfile();
  }, []);

  useEffect(() => {
    if (!userId || isLoading) return;

    const autoSave = async () => {
      setSaveStatus('saving');
      
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: editorData.display_name,
          handle: editorData.handle,
          bio: editorData.bio,
          avatar_url: editorData.avatar_url,
          theme_color: editorData.theme_color,
          aurora_gradient: editorData.aurora_gradient,
          social_links: editorData.social_links,
          show_join_banner: editorData.show_join_banner,
          location: editorData.location,
          link_order: editorData.link_order,
        })
        .eq('id', userId);

      if (error) {
        console.error('Error auto-saving', error);
        setSaveStatus('unsaved');
      } else {
        setSaveStatus('saved');
      }
    };

    autoSave();
  }, [debouncedData, userId, isLoading]);

  const updateEditorData = (updates: Partial<LinkInBioData>) => {
    setEditorData((prev) => ({ ...prev, ...updates }));
    setSaveStatus('unsaved');
  };

  const fetchLinks = async () => {
    if (!userId) return;
    
    const { data, error } = await supabase
      .from('links')
      .select('*')
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching links', error);
      return;
    }

    setLinks(data || []);
  };

  const fetchPublicContent = async () => {
    if (!userId) return;

    const { data: publicData, error: publicError } = await supabase
      .from('assets')
      .select('id, title, storage_path, mime_type')
      .eq('creator_id', userId)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (!publicError && publicData) {
      // Generate signed URLs
      const withUrls = await Promise.all(
        publicData.map(async (item) => {
          if (!item.storage_path) return { ...item, previewUrl: null };
          const { data: signed } = await supabase.storage
            .from('paid-content')
            .createSignedUrl(item.storage_path, 60 * 60);
          return { ...item, previewUrl: signed?.signedUrl || null };
        })
      );
      setPublicContent(withUrls);
    }
  };

  const sections = [
    { id: 'photo' as const, label: 'Photo', icon: Camera },
    { id: 'info' as const, label: 'Info', icon: FileText },
    { id: 'social' as const, label: 'Social', icon: Share2 },
    { id: 'links' as const, label: 'Links', icon: LinkIcon },
    { id: 'content' as const, label: 'Content', icon: ImageIcon },
    { id: 'colors' as const, label: 'Colors', icon: Palette },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-background">
        <div className="max-w-[1500px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] min-h-[calc(100vh-4rem)]">
            <div className="border-r border-border bg-background overflow-y-auto">
              <div className="py-6 px-4 sm:px-6 max-w-6xl mx-auto">
                {/* Top menu - horizontal on all screen sizes */}
                <div className="mb-6">
                  <div className="flex items-center justify-between gap-4 mb-6">
                    <nav ref={navRef} className="flex gap-1 overflow-x-auto scrollbar-hide pb-2">
                      {sections.map((section) => {
                        const Icon = section.icon;
                        const isActive = activeSection === section.id;
                        return (
                          <button
                            key={section.id}
                            type="button"
                            onClick={(e) => {
                              setActiveSection(section.id);
                              const btn = e.currentTarget;
                              const nav = navRef.current;
                              if (nav) {
                                const navRect = nav.getBoundingClientRect();
                                const btnRect = btn.getBoundingClientRect();
                                const scrollLeft = nav.scrollLeft + (btnRect.left + btnRect.width / 2) - (navRect.left + navRect.width / 2);
                                nav.scrollTo({ left: scrollLeft, behavior: 'smooth' });
                              }
                            }}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                              isActive
                                ? 'bg-primary/10 text-primary border border-primary/30'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                            }`}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span>{section.label}</span>
                          </button>
                        );
                      })}
                    </nav>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {saveStatus === 'saving' && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </span>
                      )}
                      {saveStatus === 'saved' && (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                          <div className="w-2 h-2 rounded-full bg-emerald-600" />
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => window.open(`/${editorData.handle}`, '_blank')}
                        disabled={!editorData.handle}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Preview
                      </Button>
                    </div>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSection}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeSection === 'photo' && (
                      <div className="space-y-4">
                        <PhotoSection
                          avatarUrl={editorData.avatar_url}
                          userId={userId}
                          onUpdate={updateEditorData}
                        />
                      </div>
                    )}

                    {activeSection === 'info' && (
                      <div className="space-y-4">
                        <InfoSection
                          displayName={editorData.display_name}
                          handle={editorData.handle}
                          bio={editorData.bio}
                          location={editorData.location}
                          onUpdate={updateEditorData}
                        />
                      </div>
                    )}

                    {activeSection === 'social' && (
                      <div className="space-y-4">
                        <SocialSection
                          socialLinks={editorData.social_links}
                          onUpdate={updateEditorData}
                        />
                      </div>
                    )}

                    {activeSection === 'links' && (
                      <div className="space-y-4">
                        {!stripeConnected ? (
                          <div className="rounded-2xl border-2 border-dashed border-border bg-muted/20 p-8 text-center space-y-4">
                            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                              <CreditCard className="w-8 h-8 text-primary" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-foreground mb-2">
                                Connect Stripe to manage paid links
                              </h3>
                              <p className="text-sm text-muted-foreground mb-4">
                                Connect your Stripe account to create and sell paid content links on your profile.
                              </p>
                              <Button
                                variant="hero"
                                disabled={isStripeLoading}
                                onClick={async () => {
                                  setIsStripeLoading(true);
                                  try {
                                    const { data: { session } } = await supabase.auth.getSession();
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
                                    if (error) throw new Error('Unable to start Stripe Connect onboarding.');
                                    const url = (data as any)?.url;
                                    if (!url) throw new Error('Stripe Connect URL not available.');
                                    window.location.href = url;
                                  } catch (err: any) {
                                    console.error('Error during Stripe Connect', err);
                                    toast.error(err?.message || 'Unable to connect Stripe. Please try again.');
                                    setIsStripeLoading(false);
                                  }
                                }}
                                className="rounded-full"
                              >
                                <CreditCard className="w-4 h-4 mr-2" />
                                {isStripeLoading ? 'Loading...' : 'Connect Stripe'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <ContentSection
                            links={links}
                            onUpdate={fetchLinks}
                          />
                        )}
                      </div>
                    )}

                    {activeSection === 'content' && (
                      <div className="space-y-4">
                        <PublicContentSection
                          userId={userId}
                          onUpdate={fetchLinks}
                          onContentUpdate={fetchPublicContent}
                        />
                      </div>
                    )}

                    {activeSection === 'colors' && (
                      <div className="space-y-4">
                        <OptionsSection
                          themeColor={editorData.theme_color}
                          showJoinBanner={editorData.show_join_banner}
                          isPremium={isPremium}
                          auroraGradient={editorData.aurora_gradient}
                          onUpdate={updateEditorData}
                        />
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <div className="hidden lg:block bg-muted/30 overflow-y-auto sticky top-16 h-[calc(100vh-4rem)]">
              <div className="p-6 flex items-center justify-center min-h-full">
                <MobilePreview 
                  data={editorData} 
                  links={links} 
                  isPremium={isPremium}
                  publicContent={publicContent}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default LinkInBioEditor;
