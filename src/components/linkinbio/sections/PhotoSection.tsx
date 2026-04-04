import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Camera, Upload, ZoomIn, ZoomOut, Check, RefreshCw, RotateCw, Crop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import Cropper, { Area } from 'react-easy-crop';
import type { Point } from 'react-easy-crop';

interface PhotoSectionProps {
  avatarUrl: string | null;
  userId: string | null;
  profileTag?: string | null;
  onUpdate: (updates: { avatar_url: string | null }) => void;
}

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

async function generatePreview(imageSrc: string, pixelCrop: Area, size = 200): Promise<string> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, size, size,
  );
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function PhotoSection({ avatarUrl, userId, profileTag, onUpdate }: PhotoSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Crop state
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [rotation, setRotation] = useState(0);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  const onCropComplete = useCallback(async (_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
    if (rawImageUrl) {
      try {
        const preview = await generatePreview(rawImageUrl, croppedPixels, 180);
        setCroppedPreview(preview);
      } catch {}
    }
  }, [rawImageUrl]);

  const handleFileSelect = useCallback((file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (JPG, PNG, WebP)');
      return;
    }
    if (rawImageUrl) URL.revokeObjectURL(rawImageUrl);
    const objectUrl = URL.createObjectURL(file);
    setRawImageUrl(objectUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedPreview(null);
  }, [rawImageUrl]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleConfirmCrop = async () => {
    if (!rawImageUrl || !croppedAreaPixels || !userId) return;
    setIsUploading(true);

    try {
      const croppedBlob = await getCroppedImg(rawImageUrl, croppedAreaPixels);

      const optimisticPreviewUrl = URL.createObjectURL(croppedBlob);
      onUpdate({ avatar_url: optimisticPreviewUrl });
      setPreviewUrl(optimisticPreviewUrl);

      const tag = profileTag || 'avatar';
      const filePath = `avatars/${userId}/${tag}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, croppedBlob, { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' });

      if (uploadError) {
        console.error('Avatar upload error', uploadError);
        toast.error('Failed to upload avatar. Please try again.');
        return;
      }

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const newAvatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      URL.revokeObjectURL(rawImageUrl);
      onUpdate({ avatar_url: newAvatarUrl });
      setPreviewUrl(newAvatarUrl);
      setRawImageUrl(null);
      setCroppedPreview(null);
      toast.success('Photo saved!');
    } catch (err) {
      console.error('Error uploading avatar', err);
      toast.error('Failed to upload avatar.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelCrop = () => {
    if (rawImageUrl) URL.revokeObjectURL(rawImageUrl);
    setRawImageUrl(null);
    setCroppedPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    noClick: true,
    noKeyboard: true,
    disabled: isUploading,
  });

  const currentAvatar = previewUrl || avatarUrl;

  // ── Crop mode ──
  if (rawImageUrl) {
    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Crop your photo</p>
          <button
            type="button"
            onClick={handleCancelCrop}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-3">
          {/* Left: Crop area */}
          <div className="flex-1 space-y-3">
            {/* Cropper */}
            <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-black/90 ring-1 ring-border cursor-move">
              <Cropper
                image={rawImageUrl}
                crop={crop}
                zoom={zoom}
                cropShape="rect"
                showGrid={false}
                objectFit="cover"
                rotation={rotation}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                onRotationChange={setRotation}
              />
            </div>

            {/* Zoom + Rotate */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRotation(r => (r - 90) % 360)}
                className="w-8 h-8 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <ZoomOut className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.02}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-primary h-1 cursor-pointer"
              />
              <ZoomIn className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            </div>
          </div>

          {/* Right: Preview + Actions */}
          <div className="w-[180px] flex flex-col gap-3">
            {/* Preview */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-full">Preview</p>
              <div className="relative w-[140px] h-[140px] rounded-xl overflow-hidden bg-muted ring-1 ring-border flex-shrink-0">
                {croppedPreview ? (
                  <img src={croppedPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-muted-foreground/20 animate-pulse" />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground text-center">Square preview</p>
            </div>

            {/* Apply button */}
            <Button
              type="button"
              variant="hero"
              className="w-full rounded-xl text-sm font-semibold"
              onClick={handleConfirmCrop}
              disabled={isUploading}
            >
              {isUploading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Apply Crop
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Has avatar: show preview + replace button ──
  if (currentAvatar) {
    return (
      <div {...getRootProps()} className="space-y-4">
        <input {...getInputProps()} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
        />

        <div className="relative w-full group">
          <div className={`w-full aspect-square rounded-2xl overflow-hidden border-2 transition-colors ${
            isDragActive ? 'border-primary bg-primary/5' : 'border-border'
          }`}>
            <img
              src={currentAvatar}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Hover overlay */}
          <div
            onClick={triggerFileInput}
            className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/40 transition-all cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 shadow-lg">
              <RefreshCw className="w-4 h-4 text-black" />
              <span className="text-sm font-medium text-black">Replace</span>
            </div>
          </div>

          {/* Crop button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const url = currentAvatar;
              if (url) {
                setExistingAvatarUrl(url);
                setRawImageUrl(url);
                setCrop({ x: 0, y: 0 });
                setZoom(1);
                setRotation(0);
                setCroppedPreview(null);
              }
            }}
            className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
          >
            <Crop className="w-3.5 h-3.5" />
            Crop
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Click or drag a new photo to replace
        </p>
      </div>
    );
  }

  // ── No avatar: upload zone ──
  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
      />

      <div
        {...getRootProps()}
        onClick={triggerFileInput}
        className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
          isDragActive
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/50 hover:bg-muted/30'
        }`}
      >
        <input {...getInputProps()} />
        <div className="p-10 flex flex-col items-center justify-center text-center gap-3">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
            isDragActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            {isDragActive ? (
              <Upload className="w-7 h-7" />
            ) : (
              <Camera className="w-7 h-7" />
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {isDragActive ? 'Drop your photo here' : 'Upload profile picture'}
            </p>
            <p className="text-xs text-muted-foreground">
              Drag & drop or click to browse
            </p>
            <p className="text-[11px] text-muted-foreground">
              JPG, PNG, or WebP • Max 5MB
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
