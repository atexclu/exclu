import Navbar from '@/components/Navbar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Camera, Loader2, Copy, CheckCircle2, Upload, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Plus, Timer, Play, Link2, ShoppingCart, DollarSign, Lock, ArrowUpRight, X } from 'lucide-react';
import { auroraGradients } from '@/lib/auroraGradients';
import { maybeConvertHeic } from '@/lib/convertHeic';
import Cropper, { Area } from 'react-easy-crop';
import { User } from '@supabase/supabase-js';
import { MobilePreview } from '@/components/linkinbio/MobilePreview';
import { useProfiles } from '@/contexts/ProfileContext';
import Aurora from '@/components/ui/Aurora';


const SUPPORTED_COUNTRIES: { code: string; label: string }[] = [
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

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const size = Math.min(pixelCrop.width, 1024);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, size, size,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/jpeg', 0.92);
  });
}

const Onboarding = () => {
  const navigate = useNavigate();
  const { activeProfile } = useProfiles();
  const [step, setStep] = useState<'welcome' | 'profile' | 'design' | 'link' | 'chatting' | 'instagram'>('welcome');
  const [fomoSeconds, setFomoSeconds] = useState(600);
  const fomoStarted = useRef(false);
  const [seekingChatters, setSeekingChatters] = useState(false);
  const [seekingChattersDescription, setSeekingChattersDescription] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [isHandleLocked, setIsHandleLocked] = useState(false);
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [auroraGradient, setAuroraGradient] = useState('purple_dream');
  const [mainPlatformUrl, setMainPlatformUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Link creation step
  const [linkFile, setLinkFile] = useState<File | null>(null);
  const [linkFilePreview, setLinkFilePreview] = useState<string | null>(null);
  const [linkPrice, setLinkPrice] = useState('');
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const linkFileInputRef = useRef<HTMLInputElement>(null);


  // Crop state for avatar
  const [rawAvatarUrl, setRawAvatarUrl] = useState<string | null>(null);
  const [avatarCrop, setAvatarCrop] = useState({ x: 0, y: 0 });
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [croppedAvatarAreaPixels, setCroppedAvatarAreaPixels] = useState<Area | null>(null);

  const onAvatarCropComplete = (_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAvatarAreaPixels(croppedAreaPixels);
  };

  const handleAvatarFileSelect = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error('File size must be less than 20MB');
      return;
    }
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
      || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
    if (!file.type.startsWith('image/') && !isHeic) {
      toast.error('Please upload an image file (JPG, PNG, WebP, HEIC)');
      return;
    }
    try {
      const converted = await maybeConvertHeic(file);
      if (rawAvatarUrl) URL.revokeObjectURL(rawAvatarUrl);
      const objectUrl = URL.createObjectURL(converted);
      setRawAvatarUrl(objectUrl);
      setAvatarCrop({ x: 0, y: 0 });
      setAvatarZoom(1);
    } catch (err) {
      console.error('Avatar file processing error', err);
      toast.error('Could not process this image. Try a JPG or PNG instead.');
    }
  };

  const handleConfirmAvatarCrop = async () => {
    if (!rawAvatarUrl || !croppedAvatarAreaPixels) {
      toast.error('Please adjust the crop area before saving.');
      return;
    }
    if (!currentUser) {
      toast.error('Not authenticated. Please refresh the page.');
      return;
    }
    setIsUploadingAvatar(true);

    try {
      const croppedBlob = await getCroppedImg(rawAvatarUrl, croppedAvatarAreaPixels);
      const croppedFile = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });

      // Upload to Supabase storage immediately
      const filePath = `avatars/${currentUser.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, croppedFile, { cacheControl: '3600', upsert: true });

      if (uploadError) {
        console.error('Avatar upload error', uploadError);
        toast.error('Failed to upload profile photo. Please try again.');
        return;
      }

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const finalUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      URL.revokeObjectURL(rawAvatarUrl);
      setAvatarUrl(finalUrl);
      setAvatarPreview(finalUrl);
      setAvatarFile(null);
      setRawAvatarUrl(null);
      toast.success('Photo uploaded!');
    } catch (err) {
      console.error('Error cropping avatar', err);
      toast.error('Failed to crop photo.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCancelAvatarCrop = () => {
    if (rawAvatarUrl) URL.revokeObjectURL(rawAvatarUrl);
    setRawAvatarUrl(null);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  // Auto-generate handle from display name
  useEffect(() => {
    const slug = displayName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setHandle(slug);
  }, [displayName]);

  const [exclusiveContentText, setExclusiveContentText] = useState('Exclusive content');
  const [exclusiveContentUrl, setExclusiveContentUrl] = useState('');
  const [exclusiveContentImageUrl, setExclusiveContentImageUrl] = useState<string | null>(null);
  const [isUploadingExclusiveImage, setIsUploadingExclusiveImage] = useState(false);
  const exclusiveImageInputRef = useRef<HTMLInputElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const filteredCountries = SUPPORTED_COUNTRIES;

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

      if (isMounted) setCurrentUser(user);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, handle, country, bio')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (profileError) {
        // Onboarding peut fonctionner même si le profil n'existe pas encore, il sera créé via trigger ou update
        console.error('Error loading profile for onboarding', profileError);
      }

      const metadataHandleRaw = (user.user_metadata as any)?.handle;
      const metadataHandle = typeof metadataHandleRaw === 'string' ? metadataHandleRaw.trim() : '';
      setIsHandleLocked(Boolean(metadataHandle));

      const fallbackName = user.email ? user.email.split('@')[0] : 'Creator';
      setDisplayName(profile?.display_name || fallbackName);
      const resolvedHandle = (profile?.handle || metadataHandle || '').trim();
      setHandle(resolvedHandle);
      setCountry(profile?.country || '');
      setBio(profile?.bio || '');

      if (!profile?.handle && metadataHandle) {
        supabase
          .from('profiles')
          .upsert({ id: user.id, handle: metadataHandle }, { onConflict: 'id' })
          .then(({ error }) => {
            if (error) {
              console.error('Error persisting metadata handle to profile', error);
            }
          });
      }

        const { data: fullProfile } = await supabase
        .from('profiles')
        .select('social_links, avatar_url, exclusive_content_text, exclusive_content_url, exclusive_content_image_url, aurora_gradient')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) return;

      if (fullProfile?.avatar_url) {
        setAvatarUrl(fullProfile.avatar_url);
        setAvatarPreview(fullProfile.avatar_url);
      }

      if (fullProfile?.exclusive_content_text) {
        setExclusiveContentText(fullProfile.exclusive_content_text);
      }
      if (fullProfile?.exclusive_content_url) {
        setExclusiveContentUrl(fullProfile.exclusive_content_url);
      }
      if (fullProfile?.exclusive_content_image_url) {
        setExclusiveContentImageUrl(fullProfile.exclusive_content_image_url);
      }

      setAuroraGradient(fullProfile?.aurora_gradient || 'purple_dream');

      // Load main platform from social_links if previously set
      const existingSocialLinks = (fullProfile?.social_links as Record<string, string>) || {};
      if (existingSocialLinks._main_platform_url) {
        setMainPlatformUrl(existingSocialLinks._main_platform_url);
      }

      // Redirect to dashboard if onboarding already completed (handle + avatar)
      if (profile?.handle && fullProfile?.avatar_url) {
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

    if (!avatarPreview && !avatarUrl) {
      toast.error('Please upload a profile photo.');
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
        if (isHandleLocked) {
          setIsHandleLocked(false);
        }
        toast.error('This handle is already taken. Please choose another one.');
        return;
      }

      // Build social_links JSONB — auto-detect platform from URL
      const socialLinksObj: Record<string, string> = {};
      if (mainPlatformUrl.trim()) {
        const normalized = normalizeExternalUrl(mainPlatformUrl);
        if (normalized) {
          socialLinksObj._main_platform_url = normalized;
          const urlLower = normalized.toLowerCase();
          const detectedPlatform = urlLower.includes('onlyfans') ? 'onlyfans'
            : urlLower.includes('fansly') ? 'fansly'
            : urlLower.includes('patreon') ? 'patreon'
            : 'other';
          socialLinksObj._main_platform = detectedPlatform;
          socialLinksObj[detectedPlatform] = normalized;
        }
      }

      // Avatar is already uploaded during crop confirmation — use avatarUrl directly
      const finalAvatarUrl = avatarUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            display_name: displayName.trim(),
            handle: trimmedHandle,
            is_creator: true,
            country,
            bio: bio.trim() || null,
            aurora_gradient: auroraGradient,
            social_links: socialLinksObj,
            avatar_url: finalAvatarUrl,
            exclusive_content_text: exclusiveContentText.trim() || null,
            exclusive_content_url: exclusiveContentUrl.trim() || null,
            exclusive_content_image_url: exclusiveContentImageUrl,
          },
          { onConflict: 'id' }
        );

      if (updateError) {
        console.error(updateError);
        throw new Error('Unable to save your profile. Please try again.');
      }

      // Also create/update creator_profiles so data appears in configurator
      const { data: existingProfile } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const creatorProfilePayload = {
        username: trimmedHandle,
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_url: finalAvatarUrl,
        aurora_gradient: auroraGradient,
        social_links: socialLinksObj,
        exclusive_content_text: exclusiveContentText.trim() || null,
        exclusive_content_url: exclusiveContentUrl.trim() || null,
        exclusive_content_image_url: exclusiveContentImageUrl,
      };

      if (existingProfile) {
        const { error: cpError } = await supabase
          .from('creator_profiles')
          .update(creatorProfilePayload)
          .eq('user_id', user.id);
        if (cpError) console.error('Error updating creator profile:', cpError);
      } else {
        const { error: cpError } = await supabase
          .from('creator_profiles')
          .insert({ user_id: user.id, ...creatorProfilePayload });
        if (cpError) console.error('Error creating creator profile:', cpError);
      }

      toast.success('Profile saved! Now choose your design.');
      setStep('design');
    } catch (err: any) {
      console.error('Error during onboarding save', err);
      toast.error(err?.message || 'Unable to complete onboarding right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDesign = async () => {
    if (!currentUser) return;
    try {
      const { error } = await supabase
        .from('creator_profiles')
        .update({ aurora_gradient: auroraGradient })
        .eq('user_id', currentUser.id);
      if (error) {
        console.error('[handleSaveDesign] Error saving design:', error);
        toast.error('Failed to save design');
        return;
      }
      setStep('link');
    } catch (err) {
      console.error('[handleSaveDesign] Error:', err);
      toast.error('Failed to save design');
    }
  };

  const handleCreateLink = async () => {
    if (!currentUser || !linkFile) {
      toast.error('Please upload a file');
      return;
    }
    setIsCreatingLink(true);
    try {
      const converted = await maybeConvertHeic(linkFile);
      const ext = converted.name.split('.').pop() ?? 'bin';
      const priceCents = Math.max(500, Math.round((parseFloat(linkPrice) || 5) * 100));
      const slug = `${handle}-${crypto.randomUUID().slice(0, 8)}`;

      let resolvedProfileId = activeProfile?.id;
      if (!resolvedProfileId) {
        const { data: profile } = await supabase.from('creator_profiles').select('id').eq('user_id', currentUser.id).maybeSingle();
        if (profile) resolvedProfileId = profile.id;
      }

      // 1. Create link as draft first to get the ID (same as CreateLink)
      const { data: insertedLinks, error: linkError } = await supabase
        .from('links')
        .insert({
          creator_id: currentUser.id,
          profile_id: resolvedProfileId ?? null, // Add profile_id support
          title: 'My first link',
          description: null,
          slug,
          price_cents: priceCents,
          currency: 'USD',
          status: 'draft',
          show_on_profile: true,
          is_public: priceCents === 0,
        })
        .select();
      if (linkError || !insertedLinks?.[0]) throw linkError || new Error('Failed to create link');
      const linkId = insertedLinks[0].id as string;

      // 2. Upload file to storage (same path format as CreateLink)
      const storagePath = `paid-content/${currentUser.id}/${linkId}/original/content.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('paid-content')
        .upload(storagePath, converted, { cacheControl: '3600', upsert: true });
      if (uploadError) {
        await supabase.from('links').delete().eq('id', linkId);
        throw new Error('Upload failed: ' + uploadError.message);
      }

      // 3. Update link with storage_path and publish
      const { error: updateError } = await supabase
        .from('links')
        .update({ storage_path: storagePath, status: 'published' })
        .eq('id', linkId);
      if (updateError) throw updateError;

      // 4. Create asset record
      const assetId = crypto.randomUUID();
      const { error: assetError } = await supabase
        .from('assets')
        .insert({
          id: assetId,
          creator_id: currentUser.id,
          profile_id: resolvedProfileId ?? null, // Add profile_id support
          title: null,
          storage_path: storagePath,
          mime_type: converted.type || null,
          is_public: false,
        });

      // 5. Connect asset to link via link_media
      if (!assetError) {
        await supabase.from('link_media').insert({
          link_id: linkId,
          asset_id: assetId,
          position: 0,
        });
      }

      toast.success('Link created!');
      setStep('chatting');
    } catch (err) {
      console.error('[handleCreateLink] Error creating link:', err);
      toast.error('Failed to create link. Please try again.');
    } finally {
      setIsCreatingLink(false);
    }
  };

  // FOMO timer — starts when leaving welcome/profile, purely cosmetic
  useEffect(() => {
    if (step !== 'welcome' && step !== 'profile' && !fomoStarted.current) {
      fomoStarted.current = true;
    }
    if (!fomoStarted.current) return;
    const interval = setInterval(() => {
      setFomoSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const fomoMinutes = Math.floor(fomoSeconds / 60);
  const fomoSecs = fomoSeconds % 60;
  const fomoDisplay = `${String(fomoMinutes).padStart(2, '0')}:${String(fomoSecs).padStart(2, '0')}`;

  // 3 progress bubbles mapping to the 3 activation checklist items
  const CHECKLIST_STEPS = [
    { label: 'Link in bio', icon: <Link2 className="w-3.5 h-3.5" /> },
    { label: 'Payment link', icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { label: 'First sale', icon: <DollarSign className="w-3.5 h-3.5" /> },
  ];
  const getChecklistIndex = (): number => {
    if (step === 'welcome' || step === 'profile' || step === 'design') return 0;
    if (step === 'link') return 1;
    return 2;
  };
  const checklistIndex = getChecklistIndex();


  return (
    <div className="relative min-h-screen bg-gradient-to-b from-black via-exclu-ink to-black text-white flex flex-col overflow-hidden">
      {/* Aurora background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Aurora colorStops={['#a3e635', '#4ade80', '#86efac']} blend={0.35} amplitude={0.9} />
      </div>

      <Navbar
        user={currentUser}
        hideDashboard
        centerContent={step !== 'welcome' ? (
          <div className="flex items-center gap-3">
            {CHECKLIST_STEPS.map((s, i) => {
              const isActive = i === checklistIndex;
              const isDone = i < checklistIndex;
              return (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isActive ? 'bg-primary text-black scale-110 shadow-lg shadow-primary/30' : isDone ? 'bg-primary/30 text-primary' : 'bg-white/10 text-white/40'}`}>
                      {isDone ? <Check className="w-4 h-4" /> : s.icon}
                    </div>
                    <span className={`text-[9px] font-medium ${isActive ? 'text-primary' : isDone ? 'text-primary/60' : 'text-white/30'}`}>{s.label}</span>
                  </div>
                  {i < CHECKLIST_STEPS.length - 1 && (
                    <div className={`w-8 h-0.5 -mt-4 transition-colors ${i < checklistIndex ? 'bg-primary/40' : 'bg-white/10'}`} />
                  )}
                </div>
              );
            })}
          </div>
        ) : undefined}
        mobileTopContent={step !== 'welcome' && step !== 'profile' && fomoSeconds > 0 ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
            <Timer className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[9px] font-medium text-amber-400">{fomoDisplay}</span>
          </div>
        ) : undefined}
      />
      <main className="flex-1 px-4 pt-20 sm:pt-24 pb-10 flex flex-col items-center sm:justify-center relative z-10 overflow-x-hidden">

        {/* 3-step progress bubbles — mobile only (sm:hidden), in normal flow below topbar */}
        {step !== 'welcome' && (
          <div className="sm:hidden w-full flex justify-center mb-1 mt-2">
            <div className="flex items-center gap-3">
              {CHECKLIST_STEPS.map((s, i) => {
                const isActive = i === checklistIndex;
                const isDone = i < checklistIndex;
                return (
                  <div key={s.label} className="flex items-center gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isActive ? 'bg-primary text-black scale-110 shadow-lg shadow-primary/30' : isDone ? 'bg-primary/30 text-primary' : 'bg-white/10 text-white/40'}`}>
                        {isDone ? <Check className="w-4 h-4" /> : s.icon}
                      </div>
                      <span className={`text-[9px] font-medium ${isActive ? 'text-primary' : isDone ? 'text-primary/60' : 'text-white/30'}`}>{s.label}</span>
                    </div>
                    {i < CHECKLIST_STEPS.length - 1 && (
                      <div className={`w-8 h-0.5 -mt-4 transition-colors ${i < checklistIndex ? 'bg-primary/40' : 'bg-white/10'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FOMO timer — centered on screen */}
        {step !== 'welcome' && step !== 'profile' && fomoSeconds > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed top-[7rem] sm:top-[7rem] left-0 right-0 z-40 hidden sm:flex justify-center pointer-events-none"
          >
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 backdrop-blur-sm pointer-events-auto">
              <Timer className="w-3 h-3 text-amber-400" />
              <span className="text-[11px] font-medium text-amber-400">Your profile slot is reserved for {fomoDisplay}</span>
            </div>
          </motion.div>
        )}

        {/* WELCOME: Activation checklist landing page */}
        {step === 'welcome' && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} className="w-full max-w-md space-y-8 mt-4 sm:mt-0">
            <div className="text-center space-y-3">
              <h1 className="text-[2rem] sm:text-[2.4rem] leading-tight font-extrabold text-white">
                Activation checklist
              </h1>
              <p className="text-white/60 text-sm">3 steps to earn more</p>
            </div>
            <div className="space-y-3">
              {[
                { num: 1, label: 'Add your link in bio' },
                { num: 2, label: 'Create your first Payment link' },
                { num: 3, label: 'Sell your first Payment link' },
              ].map((item) => (
                <motion.div key={item.num} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: item.num * 0.12 }} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
                  <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">{item.num}</div>
                  <p className="text-sm font-semibold text-white">{item.label}</p>
                </motion.div>
              ))}
            </div>
            <div className="space-y-3">
              <Button variant="hero" size="lg" className="w-full rounded-full text-base" onClick={() => setStep('profile')}>
                Get started <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
              <button type="button" className="w-full flex items-center justify-center gap-2 text-sm text-white/50 hover:text-white/70 transition-colors py-2">
                <Play className="w-4 h-4" /> Watch tutorial video
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 1: Profile Setup */}
        {step === 'profile' && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }} className="w-full max-w-lg space-y-6 mt-4 sm:mt-6">
            <div className="text-center space-y-2">
              <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-white">Set up your creator profile</h1>
              <p className="text-white/50 text-[13px] sm:text-sm max-w-md mx-auto">Choose how fans will see you on Exclu. You can change these details later.</p>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                {/* Avatar upload */}
                {rawAvatarUrl ? (
                  <div className="space-y-3">
                    <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black/90 ring-1 ring-white/10">
                      <Cropper image={rawAvatarUrl} crop={avatarCrop} zoom={avatarZoom} aspect={1} cropShape="rect" showGrid={false} objectFit="contain" onCropChange={setAvatarCrop} onZoomChange={setAvatarZoom} onCropComplete={onAvatarCropComplete} />
                    </div>
                    <div className="flex items-center gap-2 px-1">
                      <ZoomOut className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                      <input type="range" min={1} max={3} step={0.02} value={avatarZoom} onChange={(e) => setAvatarZoom(Number(e.target.value))} className="flex-1 accent-primary h-1.5 cursor-pointer" />
                      <ZoomIn className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="flex-1 rounded-full text-xs h-9" onClick={handleCancelAvatarCrop} disabled={isUploadingAvatar}>Cancel</Button>
                      <Button type="button" variant="hero" className="flex-1 rounded-full text-xs h-9" onClick={handleConfirmAvatarCrop} disabled={isUploadingAvatar}>
                        {isUploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1.5" />Save</>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <button type="button" onClick={() => avatarInputRef.current?.click()} className={`relative border-2 border-dashed border-white/20 hover:border-primary/60 transition-colors overflow-hidden group ${avatarPreview ? 'w-full aspect-square rounded-2xl' : 'w-24 h-24 rounded-2xl'}`}>
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-white/5">
                          <Camera className="w-6 h-6 text-white/40 group-hover:text-primary transition-colors" />
                        </div>
                      )}
                      {avatarPreview && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Camera className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </button>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAvatarFileSelect(file); }} />
                    <p className="text-[11px] text-white/40">{avatarPreview ? 'Click to change' : 'Upload a photo'}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="display_name" className="text-sm font-medium text-white/80">Display name</label>
                  <Input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your display name" className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30" required />
                </div>

                <div className="space-y-2">
                  <label htmlFor="bio" className="text-sm font-medium text-white/80">Bio <span className="text-white/30 font-normal">(optional)</span></label>
                  <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell people a bit about yourself" rows={3} maxLength={500} className="min-h-[80px] bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none" />
                </div>

                <div className="space-y-2">
                  <label htmlFor="country" className="text-sm font-medium text-white/80">Country of residence</label>
                  <select id="country" value={country} onChange={(e) => setCountry(e.target.value)} className="h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/60" required>
                    <option value="">Select your country</option>
                    {filteredCountries.map((c) => (<option key={c.code} value={c.code}>{c.label}</option>))}
                  </select>
                  <p className="text-[11px] text-white/30">Must match the country where you pay taxes.</p>
                </div>


                {/* Exclusive content button — label + text input + cover image + live preview */}
                <div className="space-y-3 pt-2">
                  <label className="text-sm font-medium text-white/80">Exclusive content button <span className="text-white/30 font-normal">(optional)</span></label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input value={exclusiveContentText} onChange={(e) => setExclusiveContentText(e.target.value)} placeholder="Button label (e.g., Exclusive content)" maxLength={60} className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                    <Input type="url" value={exclusiveContentUrl} onChange={(e) => setExclusiveContentUrl(e.target.value)} placeholder="Link URL (e.g., https://onlyfans.com/...)" className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  </div>

                  {/* Cover image upload */}
                  <input ref={exclusiveImageInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be less than 5MB'); return; }
                    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return; }
                    setIsUploadingExclusiveImage(true);
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) { toast.error('Not authenticated'); return; }
                      const fileExt = file.name.split('.').pop() ?? 'jpg';
                      const filePath = `avatars/${user.id}/exclusive-content.${fileExt}`;
                      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { cacheControl: '3600', upsert: true });
                      if (uploadError) { toast.error('Failed to upload image'); return; }
                      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
                      setExclusiveContentImageUrl(`${publicUrlData.publicUrl}?t=${Date.now()}`);
                      toast.success('Image uploaded!');
                    } catch { toast.error('Upload failed'); } finally { setIsUploadingExclusiveImage(false); }
                  }} />

                  {/* Live preview of the exclusive content button */}
                  {exclusiveContentText.trim() && (() => {
                    const aurora = auroraGradients.find(g => g.id === auroraGradient) || auroraGradients[0];
                    const gs: [string, string] = [aurora.colors[0], aurora.colors[2]];
                    return (
                      <div className="space-y-2">
                        {exclusiveContentImageUrl ? (
                          <div className="relative w-full rounded-2xl overflow-hidden shadow-lg select-none cursor-pointer group" onClick={() => exclusiveImageInputRef.current?.click()}>
                            <img src={exclusiveContentImageUrl} alt={exclusiveContentText} className="w-full h-44 object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                            <div className="absolute bottom-4 inset-x-4 flex items-center justify-between">
                              <div className="flex items-center gap-2"><Lock className="w-4 h-4 text-white" /><span className="text-sm font-bold text-white truncate max-w-[200px]">{exclusiveContentText}</span></div>
                              <ArrowUpRight className="w-4 h-4 text-white/70" />
                            </div>
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Camera className="w-5 h-5 text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-14 rounded-full flex items-center justify-center gap-2 shadow-lg" style={{ background: `linear-gradient(to right, ${gs[0]}cc, ${gs[1]}cc)` }}>
                            <Lock className="w-4 h-4 text-white" /><span className="text-sm font-bold text-white truncate max-w-[220px]">{exclusiveContentText}</span><ArrowUpRight className="w-4 h-4 text-white/70" />
                          </div>
                        )}
                        <p className="text-[11px] text-white/30 text-center">This button will appear at the top of your public profile.</p>
                      </div>
                    );
                  })()}

                  {/* Image actions */}
                  <div className="flex items-center gap-2">
                    {exclusiveContentImageUrl ? (
                      <>
                        <button type="button" onClick={() => exclusiveImageInputRef.current?.click()} className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-medium text-white hover:bg-white/20 transition-colors">Replace image</button>
                        <button type="button" onClick={async () => {
                          const { data: { user } } = await supabase.auth.getUser();
                          if (!user) return;
                          await supabase.storage.from('avatars').remove(['jpg', 'jpeg', 'png', 'webp'].map(ext => `avatars/${user.id}/exclusive-content.${ext}`));
                          setExclusiveContentImageUrl(null);
                          toast.success('Image removed');
                        }} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors">Remove</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => exclusiveImageInputRef.current?.click()} disabled={isUploadingExclusiveImage} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 text-xs font-medium text-white hover:bg-white/20 transition-colors">
                        {isUploadingExclusiveImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Add cover image
                      </button>
                    )}
                  </div>
                </div>

                <Button type="submit" variant="hero" size="lg" className="w-full rounded-full mt-2" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Continue'}
                </Button>
              </form>
            )}
          </motion.div>
        )}

        {/* STEP 1bis: Design */}
        {step === 'design' && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }} className="w-full max-w-4xl space-y-6 mt-2 sm:mt-10">
            {/* Mobile only: title above preview */}
            <div className="text-center space-y-2 sm:hidden">
              <h1 className="text-[1.85rem] leading-tight font-extrabold text-white">Choose your profile design</h1>
              <p className="text-white/50 text-[13px] max-w-md mx-auto">Select a color theme for your creator profile. You can change this anytime.</p>
            </div>

            <div className="grid sm:grid-cols-[380px_1fr] gap-6 items-start">
              <div className="flex justify-center">
                <MobilePreview
                  data={{
                    display_name: displayName || 'Your Name',
                    handle: handle || 'yourhandle',
                    bio: '',
                    avatar_url: avatarPreview || avatarUrl,
                    theme_color: '#000000',
                    aurora_gradient: auroraGradient,
                    social_links: mainPlatformUrl ? { _main_platform_url: mainPlatformUrl } : {},
                    location: null,
                    exclusive_content_text: exclusiveContentText,
                    exclusive_content_url: exclusiveContentUrl,
                    exclusive_content_image_url: exclusiveContentImageUrl,
                    exclusive_content_link_id: null,
                    show_join_banner: false,
                    show_certification: true,
                    show_available_now: true,
                  }}
                  links={[]}
                  isPremium={false}
                  publicContent={[]}
                />
              </div>

              <div className="space-y-6">
                {/* Desktop only: title next to preview */}
                <div className="hidden sm:block space-y-2">
                  <h1 className="text-[2.1rem] leading-tight font-extrabold text-white">Choose your profile design</h1>
                  <p className="text-white/50 text-sm max-w-md">Select a color theme for your creator profile. You can change this anytime.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap justify-center sm:justify-start gap-4">
                    {auroraGradients.map((gradient) => (
                      <button key={gradient.id} type="button" title={gradient.name} onClick={() => setAuroraGradient(gradient.id)} className="group focus:outline-none">
                        <div className={`w-12 h-12 rounded-full shadow-lg transition-all duration-300 ${auroraGradient === gradient.id ? 'ring-[3px] ring-primary ring-offset-2 ring-offset-[#09090B] scale-110' : 'ring-1 ring-white/10 group-hover:ring-primary/50 group-hover:scale-105'}`} style={{ background: gradient.preview }} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <Button type="button" variant="outline" size="lg" className="rounded-full px-6 border-white/20" onClick={() => setStep('profile')}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button type="button" variant="hero" size="lg" className="rounded-full px-8" onClick={handleSaveDesign}>
                    Continue <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* STEP 2: Create First Link */}
        {step === 'link' && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }} className="w-full max-w-md space-y-6 mt-2 sm:mt-10">
            <div className="text-center space-y-2">
              <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-white">Create your first link</h1>
              <p className="text-white/50 text-[13px] sm:text-sm max-w-md mx-auto">Upload a photo or video that fans can unlock.</p>
            </div>

            {/* Upload zone — affiche le bouton + ou la preview avec suppression */}
            {linkFilePreview ? (
              <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-sm">
                {linkFile?.type.startsWith('video/') ? (
                  <video src={linkFilePreview} className="w-full max-h-80 object-contain bg-black" muted loop autoPlay playsInline />
                ) : (
                  <img src={linkFilePreview} alt="Preview" className="w-full max-h-80 object-contain bg-black" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (linkFilePreview) URL.revokeObjectURL(linkFilePreview);
                    setLinkFile(null);
                    setLinkFilePreview(null);
                    if (linkFileInputRef.current) linkFileInputRef.current.value = '';
                  }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 flex items-center justify-center transition-colors z-10"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <div className="relative rounded-2xl border-2 border-dashed border-white/15 hover:border-primary/40 bg-white/5 backdrop-blur-sm px-6 py-8 flex flex-col items-center justify-center text-center gap-4 transition-colors cursor-pointer" onClick={() => linkFileInputRef.current?.click()}>
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary">
                  <Plus className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">Upload file</p>
                  <p className="text-xs text-white/40">Photo or video</p>
                </div>
              </div>
            )}
            <input ref={linkFileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 100 * 1024 * 1024) { toast.error('File must be less than 100MB'); return; }
              const converted = await maybeConvertHeic(file);
              setLinkFile(converted);
              if (linkFilePreview) URL.revokeObjectURL(linkFilePreview);
              setLinkFilePreview(URL.createObjectURL(converted));
            }} />

            {/* Price — large text, minimal separator */}
            <div className="text-center space-y-2">
              <p className="text-sm text-white/50">Set a price</p>
              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center justify-center">
                  <span className="text-4xl font-bold text-white/30 mr-1">$</span>
                  <input type="text" inputMode="decimal" value={linkPrice} onChange={(e) => {
                      const raw = e.target.value;
                      // Autoriser uniquement les chiffres avec max 2 décimales
                      if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
                        setLinkPrice(raw);
                      }
                    }} onBlur={() => {
                      const val = parseFloat(linkPrice);
                      if (!isNaN(val) && val > 0 && val < 5) {
                        toast.error('Minimum price is $5.00');
                        setLinkPrice('5.00');
                      }
                    }} placeholder="0.00" className="text-4xl font-bold text-white bg-transparent border-none outline-none text-center w-40 placeholder:text-white/20" />
                </div>
              </div>
            </div>

            <Button type="button" variant="hero" size="lg" className="w-full rounded-full" onClick={handleCreateLink} disabled={isCreatingLink || !linkFile}>
              {isCreatingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate link'}
            </Button>

            <div className="flex items-center justify-center gap-4 text-xs">
              <button type="button" onClick={() => setStep('design')} className="text-white/40 hover:text-white/60 transition-colors flex items-center gap-1"><ChevronLeft className="w-3 h-3" /> Back</button>
              <button type="button" onClick={() => setStep('chatting')} className="text-white/40 hover:text-white/60 transition-colors">Skip for now</button>
            </div>
          </motion.div>
        )}

        {/* STEP 3: Chat Management */}
        {step === 'chatting' && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }} className="w-full max-w-lg space-y-6 mt-4 sm:mt-10">
            <div className="text-center space-y-2">
              <h1 className="text-[1.6rem] sm:text-[2.1rem] leading-tight font-extrabold text-white">How do you want to manage your fan conversations?</h1>
              <p className="text-white/50 text-[13px] sm:text-sm max-w-md mx-auto">Choose how you want to interact with your fans on Exclu.</p>
            </div>

            {/* Toggle options — no card frame */}
            <div className="space-y-3">
              <button type="button" onClick={() => setSeekingChatters(false)} className={`w-full flex items-center gap-3 rounded-xl border-2 p-4 transition-all text-left backdrop-blur-sm ${!seekingChatters ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${!seekingChatters ? 'border-primary' : 'border-white/30'}`}>
                  {!seekingChatters && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">🙋 I manage my conversations myself</p>
                  <p className="text-[11px] text-white/40 mt-0.5">You'll reply to fans directly from your Exclu dashboard.</p>
                </div>
              </button>

              <button type="button" onClick={() => setSeekingChatters(true)} className={`w-full flex items-center gap-3 rounded-xl border-2 p-4 transition-all text-left backdrop-blur-sm ${seekingChatters ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${seekingChatters ? 'border-primary' : 'border-white/30'}`}>
                  {seekingChatters && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">🤖 Let AI and human assistants handle my conversations</p>
                  <p className="text-[11px] text-white/40 mt-0.5">A hybrid system combines AI responses with human oversight 24/7.</p>
                </div>
              </button>
            </div>

            {/* Description input (shown when seeking chatters) */}
            {seekingChatters && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                <label className="text-xs font-medium text-white/60">Describe what you're looking for <span className="text-white/30">(optional)</span></label>
                <Textarea value={seekingChattersDescription} onChange={(e) => setSeekingChattersDescription(e.target.value)} placeholder="e.g. I'm looking for an experienced chatting team..." rows={4} maxLength={1000} className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none" />
                <p className="text-[10px] text-white/30">{seekingChattersDescription.length}/1000 characters</p>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <p className="text-[11px] text-white/60 leading-relaxed">Your profile will be visible on the <strong className="text-white">Contracts</strong> marketplace where professional chatters can discover you.</p>
                </div>
              </motion.div>
            )}

            {/* Privacy notice — BELOW the selectable boxes */}
            <p className="text-[11px] text-white/30 leading-relaxed text-center">
              🔒 Your conversations are always 100% private. Exclu never shares your messages with third parties, and you remain in full control at all times.
            </p>

            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="lg" className="rounded-full px-6 border-white/20" onClick={() => setStep('link')}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button variant="hero" size="lg" className="flex-1 rounded-full" onClick={async () => {
                if (currentUser) {
                  try {
                    await supabase.from('profiles').update({ seeking_chatters: seekingChatters, seeking_chatters_description: seekingChatters ? (seekingChattersDescription.trim() || null) : null }).eq('id', currentUser.id);
                  } catch (err) { console.error('Error saving chatting preference:', err); }
                }
                setStep('instagram');
              }}>
                Continue <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
            <button type="button" onClick={() => setStep('instagram')} className="w-full text-center text-xs text-white/30 hover:text-white/50 transition-colors">Skip for now</button>
          </motion.div>
        )}

        {/* STEP 3bis: Instagram Bio Verification */}
        {step === 'instagram' && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }} className="w-full max-w-lg space-y-6 mt-4 sm:mt-10">
            <div className="text-center space-y-3">
              <h1 className="text-[1.6rem] sm:text-[2.1rem] leading-tight font-extrabold text-white">
                Add your link in bio
              </h1>
            </div>

            {/* Section 1: Copy link */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">1. Copy your Exclu link</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-11 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-4 flex items-center">
                  <span className="text-sm text-white truncate">exclu.at/{handle}</span>
                </div>
                <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-xl border-white/20 shrink-0" onClick={() => { navigator.clipboard.writeText(`https://exclu.at/${handle}`); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 3000); }}>
                  <AnimatePresence mode="wait">
                    {linkCopied ? (
                      <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><CheckCircle2 className="w-4 h-4 text-green-400" /></motion.div>
                    ) : (
                      <motion.div key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Copy className="w-4 h-4 text-white/60" /></motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              </div>
              <AnimatePresence>
                {linkCopied && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 text-center space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Link Copied</p>
                      <p className="text-xs text-white/50">Paste it in your Instagram Links</p>
                    </div>
                    <Button type="button" variant="outline" className="rounded-full border-white/20 text-white" onClick={() => { window.location.href = 'instagram://'; setTimeout(() => { window.open('https://www.instagram.com/', '_blank'); }, 500); }}>
                      <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg> Open Instagram
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section 2: Instagram preview */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">2. Add it to your Instagram links</p>
              <div className="rounded-2xl border border-white/10 bg-black overflow-hidden">
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
                <div className="px-4 py-4">
                  <div className="flex items-center gap-5">
                    <div className="w-[72px] h-[72px] rounded-full border-2 border-pink-500/60 p-[2px] shrink-0">
                      <div className="w-full h-full rounded-full overflow-hidden bg-exclu-arsenic">
                        {avatarPreview ? <img src={avatarPreview} alt="Profile" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white/30"><Camera className="w-5 h-5" /></div>}
                      </div>
                    </div>
                    <div className="flex-1 flex justify-around">
                      <div className="text-center"><p className="text-base font-bold text-white">12</p><p className="text-[10px] text-white/60">Posts</p></div>
                      <div className="text-center"><p className="text-base font-bold text-white">2,847</p><p className="text-[10px] text-white/60">Followers</p></div>
                      <div className="text-center"><p className="text-base font-bold text-white">348</p><p className="text-[10px] text-white/60">Following</p></div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-semibold text-white">{displayName || handle || 'Your Name'}</p>
                    <p className="text-xs text-white/60">Creator</p>
                    <p className="text-xs text-white/80">✨ Exclusive content just for you</p>
                    <motion.p className="text-xs font-medium text-[#E0F4FF]" animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
                      🔗 exclu.at/{handle}
                    </motion.p>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    <div className="flex-1 h-8 rounded-lg bg-[#0095F6] flex items-center justify-center"><span className="text-xs font-semibold text-white">Follow</span></div>
                    <div className="flex-1 h-8 rounded-lg bg-white/10 flex items-center justify-center"><span className="text-xs font-semibold text-white">Message</span></div>
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg></div>
                  </div>
                </div>
                <div className="px-4 pb-3 flex gap-3">
                  {[1, 2, 3, 4].map((i) => (<div key={i} className="flex flex-col items-center gap-1"><div className="w-14 h-14 rounded-full border border-white/20 bg-white/5" /><span className="text-[9px] text-white/40">Story</span></div>))}
                </div>
              </div>
              <p className="text-[11px] text-white/40 text-center">👆 This is how your Exclu link will appear on your Instagram profile</p>
            </div>

            {/* Section 3: Verify */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">3. Then verify</p>
              <p className="text-xs text-white/50">Make sure you add the link to your bio so that we can check and verify it.</p>
              {verificationError && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{verificationError}</motion.p>
              )}
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="lg" className="rounded-full px-6 border-white/20" onClick={() => setStep('chatting')}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button variant="hero" size="lg" className="flex-1 rounded-full" disabled={isVerifying} onClick={async () => {
                  setIsVerifying(true);
                  setVerificationError(null);
                  try {
                    await new Promise((r) => setTimeout(r, 2000));
                    toast.success('Onboarding completed!');
                    navigate('/app');
                  } catch (err: any) {
                    console.error('Verification error', err);
                    setVerificationError('Unable to verify at this time. Please try again.');
                  } finally { setIsVerifying(false); }
                }}>
                  {isVerifying ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Verifying…</span> : 'Verify'}
                </Button>
              </div>
              <button type="button" onClick={() => { toast.success("You can add your link later."); navigate('/app'); }} className="w-full text-center text-xs text-white/30 hover:text-white/50 transition-colors">
                Skip for now – I'll do this later
              </button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default Onboarding;
