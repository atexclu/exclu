import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { SiOnlyfans, SiTiktok, SiInstagram, SiSnapchat, SiX, SiYoutube, SiTelegram, SiLinktree } from 'react-icons/si';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, ExternalLink, Camera, Loader2, Copy, CheckCircle2, Lock, Upload, ZoomIn, ZoomOut, ArrowUpRight, ChevronLeft, ChevronRight, Plus, Gift, Image as ImageIcon, FileText, DollarSign, Heart, Link as LinkIcon, X } from 'lucide-react';
import { auroraGradients, getAuroraGradient } from '@/lib/auroraGradients';
import { ModelCategoryDropdown } from '@/components/ui/ModelCategoryDropdown';
import { maybeConvertHeic } from '@/lib/convertHeic';
import Cropper, { Area } from 'react-easy-crop';
import { User } from '@supabase/supabase-js';
import { MobilePreview } from '@/components/linkinbio/MobilePreview';
import { useProfiles } from '@/contexts/ProfileContext';

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
  const [step, setStep] = useState<'profile' | 'design' | 'link' | 'content' | 'chatting' | 'instagram'>('profile');
  const [seekingChatters, setSeekingChatters] = useState(false);
  const [seekingChattersDescription, setSeekingChattersDescription] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [isHandleLocked, setIsHandleLocked] = useState(false);
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [auroraGradient, setAuroraGradient] = useState('purple_dream');
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Link creation step
  const [linkFile, setLinkFile] = useState<File | null>(null);
  const [linkFilePreview, setLinkFilePreview] = useState<string | null>(null);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkPrice, setLinkPrice] = useState('');
  const [linkShowOnProfile, setLinkShowOnProfile] = useState(true);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const linkFileInputRef = useRef<HTMLInputElement>(null);

  // Public content step
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [contentFilePreview, setContentFilePreview] = useState<string | null>(null);
  const [contentTitle, setContentTitle] = useState('');
  const [isCreatingContent, setIsCreatingContent] = useState(false);
  const contentFileInputRef = useRef<HTMLInputElement>(null);

  // Wishlist step
  const [wishlistName, setWishlistName] = useState('');
  const [wishlistDescription, setWishlistDescription] = useState('');
  const [wishlistPrice, setWishlistPrice] = useState('');
  const [wishlistEmoji, setWishlistEmoji] = useState('🎁');
  const [wishlistImageFile, setWishlistImageFile] = useState<File | null>(null);
  const [wishlistImagePreview, setWishlistImagePreview] = useState<string | null>(null);
  const [wishlistGiftUrl, setWishlistGiftUrl] = useState('');
  const [wishlistUnlimited, setWishlistUnlimited] = useState(true);
  const [wishlistMaxQty, setWishlistMaxQty] = useState('1');
  const [isCreatingWishlist, setIsCreatingWishlist] = useState(false);

  // Model categories
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

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

      // Charger les liens sociaux existants depuis profiles.social_links (JSONB)
      const { data: fullProfile } = await supabase
        .from('profiles')
        .select('social_links, stripe_connect_status, avatar_url, exclusive_content_text, exclusive_content_url, exclusive_content_image_url, aurora_gradient')
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

      // Only redirect to dashboard if profile onboarding is fully completed
      // (handle + avatar_url + at least 1 social link)
      const hasSocialLinks = Object.values(existingSocialLinks).some((url) => url && url.length > 0);
      if (profile?.handle && fullProfile?.avatar_url && hasSocialLinks) {
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

    // Check at least one external link is provided
    const hasAtLeastOneLink = (Object.entries(platformUrls) as [PlatformKey, string][])
      .some(([platform, url]) => activePlatforms[platform] && url.trim().length > 0);
    if (!hasAtLeastOneLink) {
      toast.error('Please add at least one external platform link.');
      return;
    }

    // Validate exclusive content URL is provided
    if (!exclusiveContentUrl.trim()) {
      toast.error('Please enter a redirect URL for your exclusive content button.');
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
        if (isHandleLocked) {
          setIsHandleLocked(false);
        }
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
      // First, try to get existing profile
      const { data: existingProfile } = await supabase
        .from('creator_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingProfile) {
        // Update existing profile
        const { error: updateError } = await supabase
          .from('creator_profiles')
          .update({
            username: trimmedHandle,
            display_name: displayName.trim(),
            bio: bio.trim() || null,
            avatar_url: finalAvatarUrl,
            aurora_gradient: auroraGradient,
            model_categories: selectedCategories.length > 0 ? selectedCategories : null,
          })
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Error updating creator profile:', updateError);
        }
      } else {
        // Insert new profile
        const { error: insertError } = await supabase
          .from('creator_profiles')
          .insert({
            user_id: user.id,
            username: trimmedHandle,
            display_name: displayName.trim(),
            bio: bio.trim() || null,
            avatar_url: finalAvatarUrl,
            aurora_gradient: auroraGradient,
            model_categories: selectedCategories.length > 0 ? selectedCategories : null,
          });

        if (insertError) {
          console.error('Error creating creator profile:', insertError);
        }
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

      // 1. Create link as draft first to get the ID (same as CreateLink)
      const { data: insertedLinks, error: linkError } = await supabase
        .from('links')
        .insert({
          creator_id: currentUser.id,
          profile_id: activeProfile?.id ?? null, // Add profile_id support
          title: linkTitle.trim() || 'My first link',
          description: linkDescription.trim() || null,
          slug,
          price_cents: priceCents,
          currency: 'USD',
          status: 'draft',
          show_on_profile: linkShowOnProfile,
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
        throw new Error('Upload failed');
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
          title: linkTitle.trim() || null,
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
      setStep('content');
    } catch (err) {
      console.error('Error creating link', err);
      toast.error('Failed to create link. Please try again.');
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleCreateContent = async () => {
    if (!currentUser || !contentFile) return;
    setIsCreatingContent(true);
    try {
      const converted = await maybeConvertHeic(contentFile);
      const assetId = crypto.randomUUID();
      const ext = converted.name.split('.').pop() ?? 'bin';
      const storagePath = `${currentUser.id}/assets/${assetId}/original/content.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('paid-content')
        .upload(storagePath, converted, { cacheControl: '3600', upsert: true });
      if (uploadError) throw new Error('Upload failed');

      const { error: insertError } = await supabase
        .from('assets')
        .insert({ id: assetId, creator_id: currentUser.id, title: contentTitle.trim() || null, storage_path: storagePath, mime_type: converted.type || null, is_public: true });
      if (insertError) throw insertError;

      toast.success('Content added!');
      setStep('chatting');
    } catch (err) {
      console.error('Error creating content', err);
      toast.error('Failed to upload content. Please try again.');
    } finally {
      setIsCreatingContent(false);
    }
  };

  const handleCreateWishlistItem = async () => {
    if (!currentUser) return;
    const name = wishlistName.trim();
    if (!name) { toast.error('Please enter an item name'); return; }
    const priceRaw = parseFloat(wishlistPrice);
    if (isNaN(priceRaw) || priceRaw < 1) { toast.error('Minimum price is $1.00'); return; }

    setIsCreatingWishlist(true);
    try {
      let finalImageUrl: string | null = null;

      // Upload image if provided
      if (wishlistImageFile) {
        const ext = wishlistImageFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `wishlist/${currentUser.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, wishlistImageFile, { cacheControl: '3600', upsert: true });
        if (uploadErr) throw new Error('Image upload failed');
        const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(path);
        finalImageUrl = publicUrl?.publicUrl ?? null;
      }

      const maxQty = wishlistUnlimited ? null : Math.max(1, parseInt(wishlistMaxQty) || 1);

      const { error } = await supabase.from('wishlist_items').insert({
        creator_id: currentUser.id,
        name,
        description: wishlistDescription.trim() || null,
        emoji: wishlistEmoji,
        image_url: finalImageUrl,
        gift_url: wishlistGiftUrl.trim() || null,
        price_cents: Math.round(priceRaw * 100),
        currency: 'USD',
        max_quantity: maxQty,
        sort_order: 0,
        is_visible: true,
      });
      if (error) throw error;

      toast.success('Wishlist item added!');
      setStep('instagram');
    } catch (err) {
      console.error('Error creating wishlist item', err);
      toast.error('Failed to create wishlist item.');
    } finally {
      setIsCreatingWishlist(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar user={currentUser} />
      <main className="flex-1 px-4 pt-32 sm:pt-28 pb-10 flex items-start sm:items-center justify-center relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 -left-24 h-64 w-64 rounded-full bg-primary/25 blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -right-24 h-72 w-72 rounded-full bg-exclu-iris/25 blur-3xl animate-[pulse_7s_ease-in-out_infinite]" />
        </div>

        {/* Step indicator */}
        <div className="absolute top-28 sm:top-24 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {(['profile', 'design', 'link', 'content', 'chatting', 'instagram'] as const).map((s) => (
            <div key={s} className={`w-2 h-2 rounded-full transition-colors ${step === s ? 'bg-primary' : 'bg-exclu-arsenic'}`} />
          ))}
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
                    {rawAvatarUrl ? (
                      <div className="space-y-3">
                        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black/90 ring-1 ring-exclu-arsenic/50">
                          <Cropper
                            image={rawAvatarUrl}
                            crop={avatarCrop}
                            zoom={avatarZoom}
                            aspect={1}
                            cropShape="rect"
                            showGrid={false}
                            objectFit="contain"
                            onCropChange={setAvatarCrop}
                            onZoomChange={setAvatarZoom}
                            onCropComplete={onAvatarCropComplete}
                          />
                        </div>

                        <div className="flex items-center gap-2 px-1">
                          <ZoomOut className="w-3.5 h-3.5 text-exclu-space/60 flex-shrink-0" />
                          <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.02}
                            value={avatarZoom}
                            onChange={(e) => setAvatarZoom(Number(e.target.value))}
                            className="flex-1 accent-primary h-1.5 cursor-pointer"
                          />
                          <ZoomIn className="w-3.5 h-3.5 text-exclu-space/60 flex-shrink-0" />
                        </div>

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 rounded-full text-xs h-9"
                            onClick={handleCancelAvatarCrop}
                            disabled={isUploadingAvatar}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="hero"
                            className="flex-1 rounded-full text-xs h-9"
                            onClick={handleConfirmAvatarCrop}
                            disabled={isUploadingAvatar}
                          >
                            {isUploadingAvatar ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5 mr-1.5" />
                                Save
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-xs font-medium text-exclu-space">Profile photo <span className="text-red-400">*</span></p>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className={`relative border-2 border-dashed border-exclu-arsenic/70 hover:border-primary/60 transition-colors overflow-hidden group ${
                            avatarPreview ? 'w-full aspect-square rounded-2xl' : 'w-20 h-20 rounded-2xl'
                          }`}
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
                            if (file) handleAvatarFileSelect(file);
                          }}
                        />
                        <p className="text-[11px] text-exclu-space/70">
                          {avatarPreview ? 'Click to change' : 'Upload a photo'}
                        </p>
                      </div>
                    )}

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

                    <div className="space-y-1.5">
                      <label htmlFor="bio" className="text-xs font-medium text-exclu-space">
                        Bio <span className="text-exclu-space/60 font-normal">(optional)</span>
                      </label>
                      <textarea
                        id="bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Tell your fans about yourself..."
                        rows={3}
                        maxLength={500}
                        className="w-full rounded-md border border-exclu-arsenic/70 bg-white px-3 py-2 text-xs text-black placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/60 resize-none"
                      />
                      <p className="text-[11px] text-exclu-space/70">
                        {bio.length}/500 characters
                      </p>
                    </div>

                    {/* Model Categories */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-exclu-cloud">Categories <span className="text-xs font-normal text-exclu-space/60">(optional)</span></p>
                      <p className="text-[11px] text-exclu-space/70">
                        Select categories that describe your content. This helps fans and agencies discover you.
                      </p>
                      <ModelCategoryDropdown
                        value={selectedCategories}
                        onChange={setSelectedCategories}
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-exclu-cloud">External platforms <span className="text-xs font-normal text-exclu-space/60">(at least 1 required)</span></p>
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

                    {/* Exclusive content */}
                    {/* Exclusive content */}
                    <div className="space-y-4 pt-4">
                      <p className="text-sm font-semibold text-exclu-cloud text-center -mb-2">
                        Personalize your exclusive content link
                      </p>

                      {/* Preview Button */}
                      <div className="w-full flex justify-center py-1">
                        <div className="w-full max-w-[280px]">
                          {exclusiveContentImageUrl ? (
                            <div className="relative rounded-xl overflow-hidden border border-white/20 shadow-lg cursor-default select-none group">
                              <img
                                src={exclusiveContentImageUrl}
                                alt="Exclusive"
                                className="w-full h-28 object-cover transition-transform duration-700 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                              <div className="absolute bottom-2.5 inset-x-3 flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Lock className="w-3 h-3 text-white" />
                                  <span className="text-xs font-bold text-white truncate max-w-[130px]">
                                    {(exclusiveContentText || 'Exclusive content').trim()}
                                  </span>
                                </div>
                                <ArrowUpRight className="w-3.5 h-3.5 text-white/70" />
                              </div>
                            </div>
                          ) : (
                            <div
                              className="w-full h-12 rounded-full flex items-center justify-center gap-2 shadow-lg cursor-default select-none hover:scale-[1.02] transition-transform"
                              style={{
                                background: `linear-gradient(to right, ${getAuroraGradient(auroraGradient).colors[0]}, ${getAuroraGradient(auroraGradient).colors[2]})`
                              }}
                            >
                              <Lock className="w-3.5 h-3.5 text-white" />
                              <span className="text-xs font-bold text-white truncate max-w-[160px]">
                                {(exclusiveContentText || 'Exclusive content').trim()}
                              </span>
                              <ArrowUpRight className="w-3.5 h-3.5 text-white/70" />
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="text-[10px] text-exclu-space/60 leading-relaxed text-center max-w-xs mx-auto -mt-1 -mb-2">
                        This button will appear at the top of your public profile.
                      </p>

                      {/* Button text */}
                      <div className="space-y-1 !mt-2">
                        <label className="text-[11px] font-medium text-exclu-space/80">Button text</label>
                        <Input
                          value={exclusiveContentText}
                          onChange={(e) => setExclusiveContentText(e.target.value)}
                          placeholder="Exclusive content"
                          maxLength={50}
                          className="h-10 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-sm"
                        />
                      </div>

                      {/* Redirect URL */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-exclu-space/80">Redirect URL</label>
                        <Input
                          value={exclusiveContentUrl}
                          onChange={(e) => setExclusiveContentUrl(e.target.value)}
                          placeholder="https://your-link.com"
                          required
                          className="h-10 bg-white border-exclu-arsenic/70 text-black placeholder:text-slate-500 text-sm"
                        />
                        {!exclusiveContentUrl.trim() && (
                          <p className="text-[11px] text-red-500">A redirect URL is required.</p>
                        )}
                      </div>

                      {/* Cover image upload */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-exclu-space/80">Cover image <span className="text-exclu-space/50">(optional)</span></label>
                        <input
                          ref={exclusiveImageInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
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
                              const { error: uploadError } = await supabase.storage
                                .from('avatars')
                                .upload(filePath, file, { cacheControl: '3600', upsert: true });
                              if (uploadError) { toast.error('Failed to upload image'); return; }
                              const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
                              const newUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
                              setExclusiveContentImageUrl(newUrl);
                              toast.success('Image uploaded!');
                            } catch { toast.error('Upload failed'); } finally { setIsUploadingExclusiveImage(false); }
                          }}
                        />
                        {exclusiveContentImageUrl ? (
                          <div className="flex items-center gap-2 p-2 rounded-xl border border-exclu-arsenic/30 bg-white/5">
                            <div className="flex-1 flex items-center gap-2 overflow-hidden">
                              <div className="w-8 h-8 rounded-lg bg-cover bg-center shrink-0" style={{ backgroundImage: `url(${exclusiveContentImageUrl})` }} />
                              <span className="text-[11px] text-exclu-space truncate">Cover image set</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => exclusiveImageInputRef.current?.click()}
                                className="px-2 py-1 rounded-md bg-white/10 text-[10px] font-medium text-exclu-cloud hover:bg-white/20 transition-colors"
                              >
                                Replace
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const { data: { user } } = await supabase.auth.getUser();
                                  if (!user) return;
                                  const extensions = ['jpg', 'jpeg', 'png', 'webp'];
                                  const paths = extensions.map((ext) => `avatars/${user.id}/exclusive-content.${ext}`);
                                  await supabase.storage.from('avatars').remove(paths);
                                  setExclusiveContentImageUrl(null);
                                  toast.success('Image removed');
                                }}
                                className="px-2 py-1 rounded-md bg-red-500/10 text-[10px] font-medium text-red-400 hover:bg-red-500/20 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => exclusiveImageInputRef.current?.click()}
                            disabled={isUploadingExclusiveImage}
                            className="w-full h-10 rounded-xl border border-exclu-arsenic/30 hover:border-exclu-arsenic/50 bg-white/5 flex items-center justify-center gap-2 transition-colors"
                          >
                            {isUploadingExclusiveImage ? (
                              <Loader2 className="w-3.5 h-3.5 text-exclu-space/50 animate-spin" />
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5 text-exclu-cloud/80" />
                                <span className="text-[11px] font-medium text-exclu-cloud/80">Upload cover image</span>
                              </>
                            )}
                          </button>
                        )}
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

        {/* STEP 2: Design */}
        {step === 'design' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="w-full max-w-4xl space-y-6"
          >
            <div className="text-center space-y-3">
              <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
                Choose your profile design
              </h1>
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-md mx-auto">
                Select a color theme for your creator profile. You can change this anytime from your settings.
              </p>
            </div>

            <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
              {/* Mobile Preview */}
              <div className="flex justify-center">
                <MobilePreview
                  data={{
                    display_name: displayName || 'Your Name',
                    handle: handle || 'yourhandle',
                    bio: '',
                    avatar_url: avatarPreview || avatarUrl,
                    theme_color: '#000000',
                    aurora_gradient: auroraGradient,
                    social_links: Object.fromEntries(
                      Object.entries(platformUrls).filter(([key, url]) => activePlatforms[key as PlatformKey] && url)
                    ),
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

              {/* Color Selection & Action */}
              <div className="space-y-6">
                <Card className="bg-exclu-ink/95 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
                  <CardHeader className="px-5 pt-5 pb-3 space-y-1">
                    <CardTitle className="text-base text-exclu-cloud">Profile color theme</CardTitle>
                    <CardDescription className="text-xs text-exclu-space/80">
                      This gradient will appear on your public profile and exclusive content buttons.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <div className="flex flex-wrap justify-center gap-4">
                      {auroraGradients.map((gradient) => (
                        <button
                          key={gradient.id}
                          type="button"
                          title={gradient.name}
                          onClick={() => setAuroraGradient(gradient.id)}
                          className="group focus:outline-none"
                        >
                          <div
                            className={`w-12 h-12 rounded-full shadow-lg transition-all duration-300 ${auroraGradient === gradient.id
                              ? 'ring-[3px] ring-primary ring-offset-2 ring-offset-[#09090B] scale-110'
                              : 'ring-1 ring-white/10 group-hover:ring-primary/50 group-hover:scale-105'
                              }`}
                            style={{ background: gradient.preview }}
                          />
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="rounded-full px-6 border-exclu-arsenic/70"
                    onClick={() => setStep('profile')}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="hero"
                    size="lg"
                    className="rounded-full px-8"
                    onClick={() => setStep('link')}
                  >
                    Continue
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>

          </motion.div>
        )}

        {/* STEP 3: Create First Link */}
        {step === 'link' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="w-full max-w-lg space-y-6"
          >
            <div className="text-center space-y-3">
              <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
                Create your first link
              </h1>
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-md mx-auto">
                Upload a photo or video that fans can unlock. Set a price or make it free.
              </p>
            </div>

            <Card className="bg-exclu-ink/95 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
              <CardContent className="px-5 py-5 space-y-4">
                {/* File upload zone */}
                <div className="relative rounded-2xl border-2 border-dashed border-border bg-muted/50 px-6 py-8 flex flex-col items-center justify-center text-center gap-4">
                  <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary">
                    <Plus className="w-7 h-7" />
                  </div>
                  <div className="space-y-2 w-full">
                    <p className="text-sm font-semibold text-foreground">
                      {linkFile ? linkFile.name : 'Choose a file'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      MP4, MOV, JPG, PNG supported
                    </p>
                    {linkFilePreview && (
                      <div className="mt-4 rounded-xl overflow-hidden border border-border bg-muted max-h-48">
                        {linkFile?.type.startsWith('video/') ? (
                          <video src={linkFilePreview} className="w-full h-48 object-cover" muted loop autoPlay />
                        ) : (
                          <img src={linkFilePreview} alt="Preview" className="w-full h-48 object-cover" />
                        )}
                      </div>
                    )}
                  </div>
                  <input
                    ref={linkFileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 100 * 1024 * 1024) { toast.error('File must be less than 100MB'); return; }
                      const converted = await maybeConvertHeic(file);
                      setLinkFile(converted);
                      if (linkFilePreview) URL.revokeObjectURL(linkFilePreview);
                      setLinkFilePreview(URL.createObjectURL(converted));
                    }}
                  />
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Title</label>
                  <Input
                    value={linkTitle}
                    onChange={(e) => setLinkTitle(e.target.value)}
                    placeholder="My exclusive content"
                    maxLength={100}
                    className="h-11 bg-primary/10 border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Description (optional)</label>
                  <Textarea
                    value={linkDescription}
                    onChange={(e) => setLinkDescription(e.target.value)}
                    placeholder="Describe what fans will get..."
                    maxLength={500}
                    rows={3}
                    className="min-h-[72px] bg-primary/10 border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                {/* Price */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Price (USD)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min="5"
                      step="0.5"
                      value={linkPrice}
                      onChange={(e) => setLinkPrice(e.target.value)}
                      placeholder="5.00"
                      className="h-11 pl-8 bg-primary/10 border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Options</p>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-exclu-space">Visible on public page</p>
                      <p className="text-xs text-exclu-space/60 mt-0.5">This link will appear on your public profile</p>
                    </div>
                    <Switch
                      checked={linkShowOnProfile}
                      onCheckedChange={setLinkShowOnProfile}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-full border-exclu-arsenic/70"
                    onClick={() => setStep('design')}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="hero"
                    className="flex-1 rounded-full"
                    onClick={handleCreateLink}
                    disabled={isCreatingLink || !linkFile}
                  >
                    {isCreatingLink ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-1" />
                        Create link
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <button
              type="button"
              onClick={() => setStep('content')}
              className="w-full text-center text-xs text-exclu-space/60 hover:text-exclu-space transition-colors"
            >
              Skip for now
            </button>
          </motion.div>
        )}

        {/* STEP 4: Public Content */}
        {step === 'content' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="w-full max-w-lg space-y-6"
          >
            <div className="text-center space-y-3">
              <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
                Add public content
              </h1>
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-md mx-auto">
                Upload a photo or video that will be visible to everyone on your public profile.
              </p>
            </div>

            <Card className="bg-exclu-ink/95 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
              <CardContent className="px-5 py-5 space-y-4">
                {/* File upload */}
                <div className="relative rounded-2xl border-2 border-dashed border-border bg-muted/50 px-6 py-8 flex flex-col items-center justify-center text-center gap-4">
                  <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary">
                    <Plus className="w-7 h-7" />
                  </div>
                  <div className="space-y-2 w-full">
                    <p className="text-sm font-semibold text-foreground">
                      {contentFile ? contentFile.name : 'Choose a file'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      MP4, MOV, JPG, PNG supported
                    </p>
                    {contentFilePreview && (
                      <div className="mt-4 rounded-xl overflow-hidden border border-border bg-muted max-h-48">
                        {contentFile?.type.startsWith('video/') ? (
                          <video src={contentFilePreview} className="w-full h-48 object-cover" muted loop autoPlay />
                        ) : (
                          <img src={contentFilePreview} alt="Preview" className="w-full h-48 object-cover" />
                        )}
                      </div>
                    )}
                  </div>
                  <input
                    ref={contentFileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 100 * 1024 * 1024) { toast.error('File must be less than 100MB'); return; }
                      const converted = await maybeConvertHeic(file);
                      setContentFile(converted);
                      if (contentFilePreview) URL.revokeObjectURL(contentFilePreview);
                      setContentFilePreview(URL.createObjectURL(converted));
                    }}
                  />
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Title (optional)</label>
                  <Input
                    value={contentTitle}
                    onChange={(e) => setContentTitle(e.target.value)}
                    placeholder="Example: Behind the scenes shot"
                    maxLength={100}
                    className="h-11 bg-primary/10 border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <p className="text-xs text-muted-foreground -mt-1">
                  This content will appear in the public section of your profile.
                </p>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-full border-exclu-arsenic/70"
                    onClick={() => setStep('link')}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="hero"
                    className="flex-1 rounded-full"
                    onClick={handleCreateContent}
                    disabled={isCreatingContent || !contentFile}
                  >
                    {isCreatingContent ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-1" />
                        Upload
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <button
              type="button"
              onClick={() => setStep('chatting')}
              className="w-full text-center text-xs text-exclu-space/60 hover:text-exclu-space transition-colors"
            >
              Skip for now
            </button>
          </motion.div>
        )}

        {/* STEP 5: Chat Management */}
        {step === 'chatting' && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="w-full max-w-lg space-y-6"
          >
            <div className="text-center space-y-3">
              <h1 className="text-[1.6rem] sm:text-[2.1rem] leading-tight font-extrabold text-exclu-cloud">
                How do you want to manage your fan conversations?
              </h1>
              <p className="text-exclu-space text-[13px] sm:text-sm max-w-md mx-auto">
                On Exclu, you can handle your DMs yourself or let a professional chatting team manage them for you.
              </p>
            </div>

            <Card className="bg-exclu-ink/95 border border-exclu-arsenic/70 shadow-lg shadow-black/30 rounded-2xl backdrop-blur-xl">
              <CardContent className="px-5 py-5 space-y-5">
                {/* Toggle options */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setSeekingChatters(false)}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 p-4 transition-all text-left ${
                      !seekingChatters
                        ? 'border-primary bg-primary/5'
                        : 'border-exclu-arsenic/50 bg-exclu-ink/60 hover:border-exclu-arsenic'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      !seekingChatters ? 'border-primary' : 'border-exclu-arsenic'
                    }`}>
                      {!seekingChatters && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-exclu-cloud">I manage my conversations myself</p>
                      <p className="text-[11px] text-exclu-space/70 mt-0.5">You'll reply to fans directly from your Exclu dashboard.</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSeekingChatters(true)}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 p-4 transition-all text-left ${
                      seekingChatters
                        ? 'border-primary bg-primary/5'
                        : 'border-exclu-arsenic/50 bg-exclu-ink/60 hover:border-exclu-arsenic'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      seekingChatters ? 'border-primary' : 'border-exclu-arsenic'
                    }`}>
                      {seekingChatters && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-exclu-cloud">Let a team of chatters handle my conversations</p>
                      <p className="text-[11px] text-exclu-space/70 mt-0.5">Professional chatters will manage your fan DMs and generate sales on your behalf.</p>
                    </div>
                  </button>
                </div>

                {/* Description input (shown when seeking chatters) */}
                {seekingChatters && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <label className="text-xs font-medium text-exclu-space">
                      Describe what you're looking for <span className="text-exclu-space/50">(optional)</span>
                    </label>
                    <textarea
                      value={seekingChattersDescription}
                      onChange={(e) => setSeekingChattersDescription(e.target.value)}
                      placeholder="e.g. I'm looking for an experienced chatting team that can engage with my fans, send personalized content, and maximize sales. Available to start immediately."
                      rows={4}
                      maxLength={1000}
                      className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-shadow"
                    />
                    <p className="text-[10px] text-exclu-space/50">{seekingChattersDescription.length}/1000 characters</p>

                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <p className="text-[11px] text-exclu-space leading-relaxed">
                        Your profile will be visible on the <strong className="text-exclu-cloud">Contracts</strong> marketplace where professional chatters can discover you and request to manage your conversations. You can disable this anytime from your Chat settings.
                      </p>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="rounded-full px-6 border-exclu-arsenic/70"
                onClick={() => setStep('content')}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button
                variant="hero"
                size="lg"
                className="flex-1 rounded-full"
                onClick={async () => {
                  if (currentUser) {
                    try {
                      await supabase.from('profiles').update({
                        seeking_chatters: seekingChatters,
                        seeking_chatters_description: seekingChatters ? (seekingChattersDescription.trim() || null) : null,
                      }).eq('id', currentUser.id);
                    } catch (err) {
                      console.error('Error saving chatting preference:', err);
                    }
                  }
                  setStep('instagram');
                }}
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setStep('instagram')}
              className="w-full text-center text-xs text-exclu-space/60 hover:text-exclu-space transition-colors"
            >
              Skip for now
            </button>
          </motion.div>
        )}

        {/* STEP 7: Instagram Bio Verification */}
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

              {/* If Instagram URL is missing, allow user to enter it here */}
              {!platformUrls.instagram && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-exclu-space">Instagram URL</label>
                  <Input
                    placeholder="https://instagram.com/..."
                    className="bg-exclu-ink border-exclu-arsenic/70 text-sm"
                    value={platformUrls.instagram || ''}
                    onChange={(e) => setPlatformUrls(prev => ({ ...prev, instagram: e.target.value }))}
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="rounded-full px-6 border-exclu-arsenic/70"
                  onClick={() => setStep('chatting')}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <Button
                  variant="hero"
                  size="lg"
                  className="flex-1 rounded-full"
                  disabled={isVerifying}
                  onClick={async () => {
                    setIsVerifying(true);
                    setVerificationError(null);
                    try {
                      await new Promise((r) => setTimeout(r, 2000));
                      toast.success('Onboarding completed!');
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
              </div>

              <button
                type="button"
                onClick={() => {
                  toast.success('You can add your link later.');
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
    </div >
  );
};

export default Onboarding;
