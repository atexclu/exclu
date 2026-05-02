import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, Upload, Film, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { maybeConvertHeic } from '@/lib/convertHeic';

export interface AttachedMedia {
  id: string;
  asset_id?: string;
  storage_path: string;
  mime_type: string | null;
  previewUrl?: string | null;
  title?: string | null;
  isNew?: boolean;
  isPrimary?: boolean;
  file?: File;
}

interface AttachedContentManagerProps {
  linkId: string;
  attachedMedia: AttachedMedia[];
  onMediaChange: (media: AttachedMedia[]) => void;
  disabled?: boolean;
}

interface SortableItemProps {
  media: AttachedMedia;
  onRemove: () => void;
  disabled?: boolean;
}

const SortableItem = ({ media, onRemove, disabled, isFirst }: SortableItemProps & { isFirst?: boolean }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: media.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isVideo = media.mime_type?.startsWith('video/');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-xl border ${isDragging ? 'border-primary/60 bg-exclu-ink/60' : 'border-exclu-arsenic/60 bg-exclu-ink/80'
        } overflow-hidden transition-all`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="w-4 h-4 text-white" />
      </div>

      {/* Primary badge — always on whichever item is currently first */}
      {isFirst && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-2 py-1 rounded-md bg-primary/90 text-black text-[10px] font-bold tracking-wide">
          PRIMARY
        </div>
      )}

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-red-500/80 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
      >
        <X className="w-4 h-4 text-white" />
      </button>

      {/* Preview */}
      <div className="aspect-video w-full bg-gradient-to-br from-exclu-phantom/30 via-exclu-ink to-exclu-phantom/20">
        {media.previewUrl ? (
          isVideo ? (
            <video
              src={media.previewUrl}
              className="w-full h-full object-cover"
              muted
              loop
              autoPlay
              playsInline
            />
          ) : (
            <img
              src={media.previewUrl}
              className="w-full h-full object-cover"
              alt={media.title || 'Attached content'}
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isVideo ? (
              <Film className="w-8 h-8 text-exclu-space/40" />
            ) : (
              <ImageIcon className="w-8 h-8 text-exclu-space/40" />
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2 bg-black/40">
        <p className="text-[10px] text-exclu-cloud/80 truncate">
          {media.title || (media.isNew ? 'New upload' : 'Attached content')}
        </p>
        {media.isNew && (
          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-primary/20 text-[9px] text-primary font-medium">
            New
          </span>
        )}
      </div>
    </div>
  );
};

export const AttachedContentManager = ({
  linkId,
  attachedMedia,
  onMediaChange,
  disabled = false,
}: AttachedContentManagerProps) => {
  const [isUploading, setIsUploading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = attachedMedia.findIndex((m) => m.id === active.id);
      const newIndex = attachedMedia.findIndex((m) => m.id === over.id);
      onMediaChange(arrayMove(attachedMedia, oldIndex, newIndex));
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to upload files.');
      }

      const newMedia: AttachedMedia[] = [];

      for (const file of files) {
        // Validate file
        const MAX_FILE_SIZE_MB = 500;
        const fileName = file.name.toLowerCase();
        const isZip = fileName.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
        const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || fileName.endsWith('.heic') || fileName.endsWith('.heif');
        const isImage = file.type.startsWith('image/') || isHeic;
        const videoExtensions = ['.mp4', '.mov', '.webm', '.m4v', '.hevc', '.avi', '.mkv'];
        const isVideo = file.type.startsWith('video/') || videoExtensions.some(ext => fileName.endsWith(ext));

        if (isZip) {
          toast.error(`${file.name}: ZIP files are not supported. Please upload the photos and videos individually.`);
          continue;
        }

        if (!isImage && !isVideo) {
          toast.error(`${file.name}: Only images and video files are supported.`);
          continue;
        }

        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          toast.error(`${file.name}: File is too large. Maximum size is 500 MB.`);
          continue;
        }

        // Upload to Supabase Storage (convert HEIC to JPEG first)
        const uploadFile = await maybeConvertHeic(file);
        const fileExtension = uploadFile.name.split('.').pop() ?? 'bin';
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const objectName = `${user.id}/${linkId}/attachments/${timestamp}-${randomId}.${fileExtension}`;

        const { error: uploadError } = await supabase.storage
          .from('paid-content')
          .upload(objectName, uploadFile, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast.error(`${file.name}: Upload failed.`);
          continue;
        }

        // Create asset record
        const { data: assetData, error: assetError } = await supabase
          .from('assets')
          .insert({
            creator_id: user.id,
            title: file.name,
            storage_path: objectName,
            mime_type: uploadFile.type,
          })
          .select('id, title, storage_path, mime_type')
          .single();

        if (assetError || !assetData) {
          console.error('Asset creation error:', assetError);
          toast.error(`${file.name}: Could not create asset record.`);
          continue;
        }

        // Generate preview URL
        const previewUrl = URL.createObjectURL(file);

        newMedia.push({
          id: assetData.id,
          asset_id: assetData.id,
          storage_path: assetData.storage_path,
          mime_type: assetData.mime_type,
          title: assetData.title,
          previewUrl,
          isNew: true,
          file,
        });
      }

      if (newMedia.length > 0) {
        onMediaChange([...attachedMedia, ...newMedia]);
        toast.success(`${newMedia.length} file(s) uploaded successfully.`);
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error?.message || 'Failed to upload files.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleRemove = (id: string) => {
    onMediaChange(attachedMedia.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-exclu-space">
          Attached content
        </label>
        <span className="text-[10px] text-exclu-space/60">
          {attachedMedia.length} {attachedMedia.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Upload button */}
      <div className="rounded-xl border border-dashed border-exclu-arsenic/60 bg-exclu-ink/40 p-4">
        <label className="flex flex-col items-center justify-center gap-2 cursor-pointer group">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-exclu-cloud">
              {isUploading ? 'Uploading...' : 'Upload new content'}
            </p>
            <p className="text-[10px] text-exclu-space/70 mt-0.5">
              Images and videos (MP4, MOV, WebM)
            </p>
          </div>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={handleFileUpload}
            disabled={disabled || isUploading}
          />
        </label>
      </div>

      {/* Attached media list */}
      {attachedMedia.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={attachedMedia.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
            disabled={disabled}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <AnimatePresence>
                {attachedMedia.map((media, idx) => (
                  <motion.div
                    key={media.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    <SortableItem
                      media={media}
                      onRemove={() => handleRemove(media.id)}
                      disabled={disabled}
                      isFirst={idx === 0}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </SortableContext>
        </DndContext>
      )}

      {attachedMedia.length === 0 && (
        <div className="rounded-xl border border-exclu-arsenic/40 bg-exclu-ink/20 p-4 text-center">
          <p className="text-[11px] text-exclu-space/60">
            No attached content yet. Upload files to get started.
          </p>
        </div>
      )}
    </div>
  );
};
