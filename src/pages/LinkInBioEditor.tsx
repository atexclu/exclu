import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getSignedUrl } from '@/lib/storageUtils';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, Loader2, Camera, FileText, Share2, Palette, Link as LinkIcon, Image as ImageIcon, Menu, ExternalLink, Gift } from 'lucide-react';
import { MobilePreview } from '@/components/linkinbio/MobilePreview';
import { useDebounce } from 'use-debounce';
import { PhotoSection } from '@/components/linkinbio/sections/PhotoSection';
import { InfoSection } from '@/components/linkinbio/sections/InfoSection';
import { SocialSection } from '@/components/linkinbio/sections/SocialSection';
import { ContentSection } from '@/components/linkinbio/sections/ContentSection';
import { PublicContentSection } from '@/components/linkinbio/sections/PublicContentSection';
import { OptionsSection } from '@/components/linkinbio/sections/OptionsSection';
import { WishlistSection } from '@/components/linkinbio/sections/WishlistSection';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useProfiles } from '@/contexts/ProfileContext';
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
  show_certification: boolean;
  show_deeplinks: boolean;
  show_available_now: boolean;
  location: string | null;
  exclusive_content_text: string | null;
  exclusive_content_link_id: string | null;
  exclusive_content_url: string | null;
  exclusive_content_image_url: string | null;
  link_order: {
    social_order: string[];
    content_order: string[];
  };
  chat_enabled: boolean;
  tips_enabled: boolean;
  custom_requests_enabled: boolean;
  min_tip_amount_cents: number;
  min_custom_request_cents: number;
  show_agency_branding: boolean;
  model_categories: string[];
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
  const { activeProfile, profiles, refreshProfiles, updateProfileAvatar } = useProfiles();
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const skipNextAutoSaveRef = useRef(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  
  const [editorData, setEditorData] = useState<LinkInBioData>({
    display_name: '',
    handle: '',
    bio: '',
    avatar_url: null,
    theme_color: 'day',
    aurora_gradient: 'purple_dream',
    social_links: {},
    model_categories: [],
    show_join_banner: true,
    show_certification: true,
    show_deeplinks: true,
    show_available_now: false,
    location: null,
    exclusive_content_text: null,
    exclusive_content_link_id: null,
    exclusive_content_url: null,
    exclusive_content_image_url: null,
    link_order: {
      social_order: [],
      content_order: [],
    },
    chat_enabled: true,
    tips_enabled: false,
    custom_requests_enabled: false,
    min_tip_amount_cents: 500,
    min_custom_request_cents: 2000,
    show_agency_branding: true,
  });

  const [links, setLinks] = useState<CreatorLink[]>([]);
  const [publicContent, setPublicContent] = useState<any[]>([]);
  const [wishlistItems, setWishlistItems] = useState<any[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [agencyLogoUrl, setAgencyLogoUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [activeSection, setActiveSection] = useState<'photo' | 'info' | 'social' | 'links' | 'content' | 'wishlist' | 'colors'>('photo');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);

  const [debouncedData] = useDebounce(editorData, 1500);

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

      // Load account-level data from profiles (premium status)
      const { data: mainProfile } = await supabase
        .from('profiles')
        .select('is_creator_subscribed')
        .eq('id', user.id)
        .maybeSingle();

      setIsPremium(mainProfile?.is_creator_subscribed === true);

      // Load agency branding (separate query — columns may not exist if migration 070 not applied)
      try {
        const { data: agencyData } = await supabase
          .from('profiles')
          .select('agency_name, agency_logo_url')
          .eq('id', user.id)
          .maybeSingle();
        setAgencyName(agencyData?.agency_name || null);
        setAgencyLogoUrl(agencyData?.agency_logo_url || null);
      } catch {
        // Migration 070 not yet applied — agency columns don't exist
      }

      // Load profile data from creator_profiles when activeProfile is set
      let profileData: any = null;

      if (activeProfile?.id) {
        const { data: cpData, error: cpError } = await supabase
          .from('creator_profiles')
          .select('display_name, username, bio, avatar_url, theme_color, aurora_gradient, social_links, show_join_banner, show_certification, show_deeplinks, show_available_now, location, link_order, exclusive_content_text, exclusive_content_link_id, exclusive_content_url, exclusive_content_image_url, tips_enabled, custom_requests_enabled, min_tip_amount_cents, min_custom_request_cents, chat_enabled, model_categories')
          .eq('id', activeProfile.id)
          .maybeSingle();

        if (cpError || !cpData) {
          console.error('Error loading creator profile', cpError);
        } else {
          profileData = {
            ...cpData,
            handle: cpData.username,
          };
          // Load show_agency_branding separately (migration 070)
          try {
            const { data: brandingData } = await supabase
              .from('creator_profiles')
              .select('show_agency_branding')
              .eq('id', activeProfile.id)
              .maybeSingle();
            if (brandingData) profileData.show_agency_branding = brandingData.show_agency_branding;
          } catch {
            // Column not yet available
          }
        }
      }

      // Fallback to profiles table
      if (!profileData) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('display_name, handle, bio, avatar_url, theme_color, aurora_gradient, social_links, show_join_banner, show_certification, show_deeplinks, show_available_now, location, link_order, exclusive_content_text, exclusive_content_link_id, exclusive_content_url, exclusive_content_image_url, tips_enabled, custom_requests_enabled, min_tip_amount_cents, min_custom_request_cents')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError || !profile) {
          console.error('Error loading profile', profileError);
          setIsLoading(false);
          return;
        }
        profileData = profile;
      }

      if (profileData) {
        skipNextAutoSaveRef.current = true;
        const dataToLoad: LinkInBioData = {
          display_name: profileData.display_name || '',
          handle: profileData.handle || '',
          bio: profileData.bio || '',
          avatar_url: profileData.avatar_url || null,
          theme_color: profileData.theme_color || 'day',
          aurora_gradient: profileData.aurora_gradient || 'purple_dream',
          social_links: profileData.social_links || {},
          show_join_banner: profileData.show_join_banner !== false,
          show_certification: profileData.show_certification !== false,
          show_deeplinks: profileData.show_deeplinks !== false,
          show_available_now: profileData.show_available_now === true,
          location: profileData.location || null,
          exclusive_content_text: profileData.exclusive_content_text || null,
          exclusive_content_link_id: profileData.exclusive_content_link_id || null,
          exclusive_content_url: profileData.exclusive_content_url || null,
          exclusive_content_image_url: profileData.exclusive_content_image_url || null,
          link_order: profileData.link_order || { social_order: [], content_order: [] },
          chat_enabled: profileData.chat_enabled !== false,
          tips_enabled: profileData.tips_enabled === true,
          custom_requests_enabled: profileData.custom_requests_enabled === true,
          min_tip_amount_cents: profileData.min_tip_amount_cents || 500,
          min_custom_request_cents: profileData.min_custom_request_cents || 2000,
          show_agency_branding: profileData.show_agency_branding !== false,
          model_categories: profileData.model_categories || [],
        };

        setEditorData(dataToLoad);
      }

      const linksQuery = supabase
        .from('links')
        .select('id, title, description, price_cents, currency, slug, show_on_profile')
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      const { data: linksData, error: linksError } = activeProfile?.id
        ? await linksQuery.eq('profile_id', activeProfile.id)
        : await linksQuery.eq('creator_id', user.id);

      if (linksError) {
        console.error('Error loading links', linksError);
      } else {
        setLinks((linksData || []) as CreatorLink[]);
      }

      // Load public content from assets table
      const publicAssetsQuery = supabase
        .from('assets')
        .select('id, title, storage_path, mime_type')
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      const { data: publicData, error: publicError } = activeProfile?.id
        ? await publicAssetsQuery.eq('profile_id', activeProfile.id)
        : await publicAssetsQuery.eq('creator_id', user.id);

      if (!publicError && publicData) {
        const withUrls = await Promise.all(
          publicData.map(async (item) => {
            if (!item.storage_path) return { ...item, previewUrl: null };
            const previewUrl = await getSignedUrl(item.storage_path, 60 * 60);
            return { ...item, previewUrl: previewUrl || null };
          })
        );
        setPublicContent(withUrls);
      }

      // Load wishlist items
      const wlQuery = supabase
        .from('wishlist_items')
        .select('id, name, description, emoji, image_url, gift_url, price_cents, max_quantity, gifted_count, is_visible, sort_order')
        .order('sort_order', { ascending: true });
      const { data: wlData } = activeProfile?.id
        ? await wlQuery.eq('profile_id', activeProfile.id)
        : await wlQuery.eq('creator_id', user.id);
      if (wlData) setWishlistItems(wlData);

      setIsLoading(false);
    };

    fetchProfile();
  }, [activeProfile?.id]);

  useEffect(() => {
    if (!userId || isLoading) return;

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    const autoSave = async () => {
      setSaveStatus('saving');

      const profilePayload = {
        display_name: debouncedData.display_name,
        handle: debouncedData.handle,
        bio: debouncedData.bio,
        avatar_url: debouncedData.avatar_url,
        theme_color: debouncedData.theme_color,
        aurora_gradient: debouncedData.aurora_gradient,
        social_links: debouncedData.social_links,
        show_join_banner: debouncedData.show_join_banner,
        show_certification: debouncedData.show_certification,
        show_deeplinks: debouncedData.show_deeplinks,
        show_available_now: debouncedData.show_available_now,
        location: debouncedData.location,
        exclusive_content_text: debouncedData.exclusive_content_text,
        exclusive_content_link_id: debouncedData.exclusive_content_link_id,
        exclusive_content_url: debouncedData.exclusive_content_url,
        exclusive_content_image_url: debouncedData.exclusive_content_image_url,
        link_order: debouncedData.link_order,
        chat_enabled: debouncedData.chat_enabled,
        tips_enabled: debouncedData.tips_enabled,
        custom_requests_enabled: debouncedData.custom_requests_enabled,
        min_tip_amount_cents: debouncedData.min_tip_amount_cents,
        min_custom_request_cents: debouncedData.min_custom_request_cents,
      };

      let saveError = false;

      // Write to creator_profiles (source of truth for per-profile data)
      if (activeProfile?.id) {
        const cpPayload = { ...profilePayload, handle: undefined, username: debouncedData.handle, model_categories: debouncedData.model_categories };
        const { error: cpError } = await supabase
          .from('creator_profiles')
          .update(cpPayload)
          .eq('id', activeProfile.id);
        if (cpError) {
          console.error('Error saving to creator_profiles', cpError);
          saveError = true;
        }
        // Save agency branding toggle separately (migration 070)
        await supabase
          .from('creator_profiles')
          .update({ show_agency_branding: debouncedData.show_agency_branding })
          .eq('id', activeProfile.id)
          .then(({ error }) => { if (error) console.warn('show_agency_branding column not available yet'); });
      }

      // Only sync to profiles table for the primary profile (backward compat)
      // Exclude columns that only exist on creator_profiles (not on profiles table)
      const isPrimary = !activeProfile || profiles.length <= 1 || profiles[0]?.id === activeProfile?.id;
      if (isPrimary) {
        const { chat_enabled: _ce, tips_enabled: _te, custom_requests_enabled: _cre, min_tip_amount_cents: _mt, min_custom_request_cents: _mcr, ...profilesSafePayload } = profilePayload;
        const { error } = await supabase
          .from('profiles')
          .update({ ...profilesSafePayload, profile_draft: null })
          .eq('id', userId);
        if (error) {
          console.error('Error saving to profiles', error);
          saveError = true;
        }
      }

      setSaveStatus(saveError ? 'unsaved' : 'saved');
    };

    autoSave();
  }, [debouncedData, userId, isLoading, activeProfile?.id, profiles]);

  const updateEditorData = (updates: Partial<LinkInBioData>) => {
    setEditorData((prev) => ({ ...prev, ...updates }));
    setSaveStatus('unsaved');
  };

  const handleAvatarUpdate = async (updates: { avatar_url: string | null }) => {
    updateEditorData(updates);

    if (activeProfile?.id) {
      updateProfileAvatar(activeProfile.id, updates.avatar_url);
    }

    // Optimistic local preview (blob URL): update UI immediately,
    // defer persistence until we receive the final public URL.
    if (updates.avatar_url?.startsWith('blob:')) {
      return;
    }

    if (!userId) return;

    let saveError = false;

    if (activeProfile?.id) {
      const { error: cpError } = await supabase
        .from('creator_profiles')
        .update({ avatar_url: updates.avatar_url })
        .eq('id', activeProfile.id);

      if (cpError) {
        console.error('Error saving avatar to creator_profiles', cpError);
        saveError = true;
      }
    }

    const isPrimary = !activeProfile || profiles.length <= 1 || profiles[0]?.id === activeProfile?.id;
    if (isPrimary) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: updates.avatar_url })
        .eq('id', userId);

      if (profileError) {
        console.error('Error saving avatar to profiles', profileError);
        saveError = true;
      }
    }

    if (!saveError) {
      await refreshProfiles();
      setSaveStatus('saved');
    }
  };

  const fetchLinks = async () => {
    if (!userId) return;

    const linksQuery = supabase
      .from('links')
      .select('*')
      .order('created_at', { ascending: false });
    const { data, error } = activeProfile?.id
      ? await linksQuery.eq('profile_id', activeProfile.id)
      : await linksQuery.eq('creator_id', userId);

    if (error) {
      console.error('Error fetching links', error);
      return;
    }

    setLinks(data || []);
  };

  const fetchWishlistItems = async () => {
    if (!userId) return;
    const wlQuery = supabase
      .from('wishlist_items')
      .select('id, name, description, emoji, image_url, gift_url, price_cents, max_quantity, gifted_count, is_visible, sort_order')
      .order('sort_order', { ascending: true });
    const { data } = activeProfile?.id
      ? await wlQuery.eq('profile_id', activeProfile.id)
      : await wlQuery.eq('creator_id', userId);
    if (data) setWishlistItems(data);
  };

  const fetchPublicContent = async () => {
    if (!userId) return;

    const assetsQuery = supabase
      .from('assets')
      .select('id, title, storage_path, mime_type')
      .eq('is_public', true)
      .order('created_at', { ascending: false });
    const { data: publicData, error: publicError } = activeProfile?.id
      ? await assetsQuery.eq('profile_id', activeProfile.id)
      : await assetsQuery.eq('creator_id', userId);

    if (!publicError && publicData) {
      // Generate signed URLs
      const withUrls = await Promise.all(
        publicData.map(async (item) => {
          if (!item.storage_path) return { ...item, previewUrl: null };
          const previewUrl = await getSignedUrl(item.storage_path, 60 * 60);
          return { ...item, previewUrl: previewUrl || null };
        })
      );
      setPublicContent(withUrls);
    }
  };

  const handleAgencyNameChange = async (name: string) => {
    setAgencyName(name);
    if (!userId) return;
    await supabase.from('profiles').update({ agency_name: name }).eq('id', userId);
  };

  const handleAgencyLogoUpload = async (file: File) => {
    if (!userId) return;
    setIsUploadingLogo(true);
    const ext = file.name.split('.').pop() || 'png';
    const path = `agency-logos/${userId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      toast.error('Failed to upload logo');
      setIsUploadingLogo(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : null;
    if (publicUrl) {
      setAgencyLogoUrl(publicUrl);
      await supabase.from('profiles').update({ agency_logo_url: publicUrl }).eq('id', userId);
      toast.success('Agency logo updated');
    }
    setIsUploadingLogo(false);
  };

  const handleAgencyLogoRemove = async () => {
    if (!userId) return;
    setAgencyLogoUrl(null);
    await supabase.from('profiles').update({ agency_logo_url: null }).eq('id', userId);
    toast.success('Agency logo removed');
  };

  const sections = [
    { id: 'photo' as const, label: 'Photo', icon: Camera },
    { id: 'info' as const, label: 'Info', icon: FileText },
    { id: 'social' as const, label: 'Social', icon: Share2 },
    { id: 'links' as const, label: 'Links', icon: LinkIcon },
    { id: 'content' as const, label: 'Content', icon: ImageIcon },
    { id: 'wishlist' as const, label: 'Wishlist', icon: Gift },
    { id: 'colors' as const, label: 'Design', icon: Palette },
  ];

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh] bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  const activeSectionLabel = sections.find((s) => s.id === activeSection)?.label ?? 'Photo';

  return (
    <AppShell>
      <div className="flex-1 flex flex-col bg-background">
        {/* ── Desktop: 3-column layout — each column scrolls independently ── */}
        <div className="hidden md:grid md:grid-cols-[220px_1fr_380px] flex-1 md:h-[calc(100dvh-3.5rem)] lg:h-[100dvh] md:min-h-0 md:overflow-hidden">
          {/* LEFT — Vertical editor menu */}
          <aside className="border-r border-border bg-background overflow-y-auto py-5 px-3 flex flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-2">Editor</p>
            <nav className="space-y-0.5">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{section.label}</span>
                    {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto pt-4 px-1 space-y-2">
              {saveStatus === 'saving' && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-500 px-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Saved
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-xl gap-2"
                onClick={() => window.open(`/${editorData.handle}`, '_blank')}
                disabled={!editorData.handle}
              >
                <ExternalLink className="w-4 h-4" />
                View profile
              </Button>
            </div>
          </aside>

          {/* CENTER — Mobile preview */}
          <div className="bg-muted/30 overflow-y-auto flex items-center justify-center">
            <div className="py-6">
              <MobilePreview
                data={editorData}
                links={links}
                isPremium={isPremium}
                publicContent={publicContent}
                wishlistItems={wishlistItems}
                agencyName={agencyName}
                agencyLogoUrl={agencyLogoUrl}
              />
              <p className="text-center text-xs text-muted-foreground mt-3">Live Preview</p>
            </div>
          </div>

          {/* RIGHT — Edit panel */}
          <div className="border-l border-border bg-background overflow-y-auto">
            <div className="p-5 sm:p-6">
              <h2 className="text-base font-semibold text-foreground mb-5 flex items-center gap-2">
                {(() => { const Icon = sections.find((s) => s.id === activeSection)?.icon; return Icon ? <Icon className="w-4 h-4 text-muted-foreground" /> : null; })()}
                {activeSectionLabel}
              </h2>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSection}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  {activeSection === 'photo' && (
                    <PhotoSection
                      avatarUrl={editorData.avatar_url}
                      userId={userId}
                      profileTag={activeProfile?.id || activeProfile?.username || null}
                      onUpdate={handleAvatarUpdate}
                    />
                  )}
                  {activeSection === 'info' && (
                    <InfoSection
                      displayName={editorData.display_name}
                      handle={editorData.handle}
                      bio={editorData.bio}
                      location={editorData.location}
                      modelCategories={editorData.model_categories}
                      onUpdate={updateEditorData}
                      onModelCategoriesChange={(cats) => updateEditorData({ model_categories: cats })}
                    />
                  )}
                  {activeSection === 'social' && (
                    <SocialSection
                      socialLinks={editorData.social_links}
                      exclusiveContentText={editorData.exclusive_content_text}
                      exclusiveContentLinkId={editorData.exclusive_content_link_id}
                      exclusiveContentUrl={editorData.exclusive_content_url}
                      exclusiveContentImageUrl={editorData.exclusive_content_image_url}
                      auroraGradient={editorData.aurora_gradient}
                      links={links}
                      userId={userId}
                      onUpdate={updateEditorData}
                    />
                  )}
                  {activeSection === 'links' && (
                    <ContentSection
                      links={links}
                      onUpdate={fetchLinks}
                    />
                  )}
                  {activeSection === 'content' && (
                    <PublicContentSection
                      userId={userId}
                      profileId={activeProfile?.id || null}
                      onUpdate={fetchLinks}
                      onContentUpdate={fetchPublicContent}
                    />
                  )}
                  {activeSection === 'wishlist' && (
                    <WishlistSection
                      items={wishlistItems}
                      onUpdate={fetchWishlistItems}
                    />
                  )}
                  {activeSection === 'colors' && (
                    <OptionsSection
                      showJoinBanner={editorData.show_join_banner}
                      showCertification={editorData.show_certification}
                      showDeeplinks={editorData.show_deeplinks}
                      showAvailableNow={editorData.show_available_now}
                      chatEnabled={editorData.chat_enabled}
                      isPremium={isPremium}
                      auroraGradient={editorData.aurora_gradient}
                      tipsEnabled={editorData.tips_enabled}
                      customRequestsEnabled={editorData.custom_requests_enabled}
                      minTipAmountCents={editorData.min_tip_amount_cents}
                      minCustomRequestCents={editorData.min_custom_request_cents}
                      showAgencyBranding={editorData.show_agency_branding}
                      agencyName={agencyName}
                      agencyLogoUrl={agencyLogoUrl}
                      onUpdate={updateEditorData}
                      onAgencyNameChange={handleAgencyNameChange}
                      onAgencyLogoUpload={handleAgencyLogoUpload}
                      onAgencyLogoRemove={handleAgencyLogoRemove}
                      isUploadingLogo={isUploadingLogo}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── Mobile: stacked layout with sheet navigation ── */}
        <div className="md:hidden">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl gap-2"
                onClick={() => setIsMobileNavOpen(true)}
              >
                <Menu className="w-4 h-4" />
                {activeSectionLabel}
              </Button>

              <div className="flex items-center gap-2">
                {saveStatus === 'saving' && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setIsMobilePreviewOpen(true)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => window.open(`/${editorData.handle}`, '_blank')}
                  disabled={!editorData.handle}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
              <SheetContent side="left" className="p-0">
                <div className="p-5 border-b border-border">
                  <SheetTitle className="text-base">Profile editor</SheetTitle>
                </div>
                <div className="p-3 space-y-0.5">
                  {sections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => {
                          setActiveSection(section.id);
                          setIsMobileNavOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{section.label}</span>
                      </button>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>

            <Sheet open={isMobilePreviewOpen} onOpenChange={setIsMobilePreviewOpen}>
              <SheetContent side="right" className="p-0">
                <div className="p-5 border-b border-border">
                  <SheetTitle className="text-base">Live preview</SheetTitle>
                </div>
                <div className="p-4 flex items-center justify-center">
                  <MobilePreview data={editorData} links={links} isPremium={isPremium} publicContent={publicContent} wishlistItems={wishlistItems} agencyName={agencyName} agencyLogoUrl={agencyLogoUrl} />
                </div>
              </SheetContent>
            </Sheet>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {activeSection === 'photo' && (
                  <PhotoSection
                    avatarUrl={editorData.avatar_url}
                    userId={userId}
                    profileTag={activeProfile?.id || activeProfile?.username || null}
                    onUpdate={handleAvatarUpdate}
                  />
                )}
                {activeSection === 'info' && (
                  <InfoSection
                    displayName={editorData.display_name}
                    handle={editorData.handle}
                    bio={editorData.bio}
                    location={editorData.location}
                    modelCategories={editorData.model_categories}
                    onUpdate={updateEditorData}
                    onModelCategoriesChange={(cats) => updateEditorData({ model_categories: cats })}
                  />
                )}
                {activeSection === 'social' && (
                  <SocialSection
                    socialLinks={editorData.social_links}
                    exclusiveContentText={editorData.exclusive_content_text}
                    exclusiveContentLinkId={editorData.exclusive_content_link_id}
                    exclusiveContentUrl={editorData.exclusive_content_url}
                    exclusiveContentImageUrl={editorData.exclusive_content_image_url}
                    auroraGradient={editorData.aurora_gradient}
                    links={links}
                    userId={userId}
                    onUpdate={updateEditorData}
                  />
                )}
                {activeSection === 'links' && (
                  <ContentSection links={links} onUpdate={fetchLinks} />
                )}
                {activeSection === 'content' && (
                  <PublicContentSection
                    userId={userId}
                    profileId={activeProfile?.id || null}
                    onUpdate={fetchLinks}
                    onContentUpdate={fetchPublicContent}
                  />
                )}
                {activeSection === 'wishlist' && (
                  <WishlistSection items={wishlistItems} onUpdate={fetchWishlistItems} />
                )}
                {activeSection === 'colors' && (
                  <OptionsSection
                    showJoinBanner={editorData.show_join_banner}
                    showCertification={editorData.show_certification}
                    showDeeplinks={editorData.show_deeplinks}
                    showAvailableNow={editorData.show_available_now}
                    chatEnabled={editorData.chat_enabled}
                    isPremium={isPremium}
                    auroraGradient={editorData.aurora_gradient}
                    tipsEnabled={editorData.tips_enabled}
                    customRequestsEnabled={editorData.custom_requests_enabled}
                    minTipAmountCents={editorData.min_tip_amount_cents}
                    minCustomRequestCents={editorData.min_custom_request_cents}
                    showAgencyBranding={editorData.show_agency_branding}
                    agencyName={agencyName}
                    agencyLogoUrl={agencyLogoUrl}
                    onUpdate={updateEditorData}
                    onAgencyNameChange={handleAgencyNameChange}
                    onAgencyLogoUpload={handleAgencyLogoUpload}
                    onAgencyLogoRemove={handleAgencyLogoRemove}
                    isUploadingLogo={isUploadingLogo}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default LinkInBioEditor;
