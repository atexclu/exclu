import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Camera, Upload, ZoomIn, ZoomOut, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import Cropper, { Area } from 'react-easy-crop';

interface PhotoSectionProps {
  avatarUrl: string | null;
  userId: string | null;
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

export function PhotoSection({ avatarUrl, userId, onUpdate }: PhotoSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Crop state
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

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
      const filePath = `avatars/${userId}/avatar.jpg`;

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
      <div className="space-y-4">
        <p className="text-sm font-semibold text-foreground text-center">Crop your photo</p>
        <p className="text-xs text-muted-foreground text-center">Drag to reposition • Scroll or use the slider to zoom</p>

        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black/90 ring-1 ring-border">
          <Cropper
            image={rawImageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid={false}
            objectFit="cover"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="flex items-center gap-3 px-1">
          <ZoomOut className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary h-1.5 cursor-pointer"
          />
          <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-full"
            onClick={handleCancelCrop}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="hero"
            className="flex-1 rounded-full"
            onClick={handleConfirmCrop}
            disabled={isUploading}
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Save
              </>
            )}
          </Button>
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
              <span className="text-sm font-medium text-black">Replace photo</span>
            </div>
          </div>
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
