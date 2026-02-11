import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Camera, Upload, X, ZoomIn, ZoomOut, Check } from 'lucide-react';
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
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height,
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

  // Crop state
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (JPG, PNG, WebP)');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setRawImageUrl(objectUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);

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

      onUpdate({ avatar_url: newAvatarUrl });
      setPreviewUrl(newAvatarUrl);
      setRawImageUrl(null);
      toast.success('Avatar uploaded successfully!');
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
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    disabled: isUploading || !!rawImageUrl,
  });

  const handleRemove = () => {
    onUpdate({ avatar_url: null });
    setPreviewUrl(null);
    toast.success('Avatar removed');
  };

  const currentAvatar = previewUrl || avatarUrl;

  // Crop mode
  if (rawImageUrl) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold text-foreground text-center">Adjust your photo</p>
        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
          <Cropper
            image={rawImageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="flex items-center gap-3 px-2">
          <ZoomOut className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary h-1.5"
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
                Confirm
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Avatar Preview */}
      {currentAvatar && (
        <div className="flex flex-col gap-4">
          <div className="relative w-full">
            <div className="w-full aspect-square rounded-3xl overflow-hidden border-4 border-primary/20 ring-4 ring-primary/10">
              <img
                src={currentAvatar}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <button
              onClick={handleRemove}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white hover:bg-gray-100 text-red-500 flex items-center justify-center shadow-lg transition-colors"
              aria-label="Remove avatar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground text-center">Current profile picture</p>
        </div>
      )}

      {/* Upload Zone */}
      <div
        {...getRootProps()}
        className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
          isDragActive
            ? 'border-primary bg-primary/5 scale-[1.02]'
            : 'border-border hover:border-primary/50 hover:bg-muted/30'
        } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="p-12 flex flex-col items-center justify-center text-center gap-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
            isDragActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            {isUploading ? (
              <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : isDragActive ? (
              <Upload className="w-8 h-8" />
            ) : (
              <Camera className="w-8 h-8" />
            )}
          </div>

          <div className="space-y-2">
            <p className="text-base font-semibold text-foreground">
              {isDragActive ? 'Drop your photo here' : 'Upload profile picture'}
            </p>
            <p className="text-sm text-muted-foreground">
              Drag & drop or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, or WebP • Max 5MB
            </p>
          </div>

          {!isUploading && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full mt-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose File
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
