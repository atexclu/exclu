import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Camera, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

interface PhotoSectionProps {
  avatarUrl: string | null;
  userId: string | null;
  onUpdate: (updates: { avatar_url: string | null }) => void;
}

export function PhotoSection({ avatarUrl, userId, onUpdate }: PhotoSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || !userId) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (JPG, PNG, WebP)');
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop() ?? 'jpg';
      const filePath = `avatars/${userId}/avatar.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) {
        console.error('Avatar upload error', uploadError);
        toast.error('Failed to upload avatar. Please try again.');
        return;
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const newAvatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      // Update local state
      onUpdate({ avatar_url: newAvatarUrl });
      setPreviewUrl(newAvatarUrl);
      toast.success('Avatar uploaded successfully!');
    } catch (err) {
      console.error('Error uploading avatar', err);
      toast.error('Failed to upload avatar.');
    } finally {
      setIsUploading(false);
    }
  }, [userId, onUpdate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp'],
    },
    maxFiles: 1,
    disabled: isUploading,
  });

  const handleRemove = () => {
    onUpdate({ avatar_url: null });
    setPreviewUrl(null);
    toast.success('Avatar removed');
  };

  const currentAvatar = previewUrl || avatarUrl;

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

      {/* Tips */}
    </div>
  );
}
