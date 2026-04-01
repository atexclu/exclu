/**
 * ChatRequestDelivery
 *
 * Inline panel for creators to deliver content for a custom request.
 * Creator selects existing assets or uploads new files → creates a delivery link → captures payment.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2, Check, Send, Upload, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';

interface ContentAsset {
  id: string;
  title: string | null;
  storage_path: string;
  mime_type: string | null;
  is_public: boolean;
  previewUrl?: string | null;
  isVideo?: boolean;
}

interface ChatRequestDeliveryProps {
  profileId: string;
  requestId: string;
  onDelivered: () => void;
  onClose: () => void;
}

function generateSlug(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `delivery-${prefix.slice(0, 20)}-${rand}`;
}

export function ChatRequestDelivery({ profileId, requestId, onDelivered, onClose }: ChatRequestDeliveryProps) {
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDelivering, setIsDelivering] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creatorUserId, setCreatorUserId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    const fetchAssets = async () => {
      setIsLoading(true);

      const { data: profileRow } = await supabase
        .from('creator_profiles')
        .select('user_id')
        .eq('id', profileId)
        .single();

      if (!profileRow || !mounted) { setIsLoading(false); return; }
      setCreatorUserId(profileRow.user_id);

      const { data } = await supabase
        .from('assets')
        .select('id, title, storage_path, mime_type, is_public')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!mounted) return;

      const rawAssets = (data ?? []) as ContentAsset[];
      const withPreviews = await Promise.all(
        rawAssets.map(async (asset) => {
          if (!asset.storage_path) return { ...asset, previewUrl: null, isVideo: false };
          const { data: signed } = await supabase.storage
            .from('paid-content')
            .createSignedUrl(asset.storage_path, 600);
          const ext = asset.storage_path.split('.').pop()?.toLowerCase() ?? '';
          const isVideo = ['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(ext)
            || (asset.mime_type?.startsWith('video/') ?? false);
          return { ...asset, previewUrl: signed?.signedUrl ?? null, isVideo };
        })
      );

      if (mounted) {
        setAssets(withPreviews);
        setIsLoading(false);
      }
    };

    fetchAssets();
    return () => { mounted = false; };
  }, [profileId]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !creatorUserId) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop() ?? 'bin';
      const filePath = `${creatorUserId}/${profileId}/${Date.now()}-delivery.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('paid-content')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: assetRow, error: assetError } = await supabase
        .from('assets')
        .insert({
          creator_id: creatorUserId,
          profile_id: profileId,
          title: file.name.replace(/\.[^.]+$/, ''),
          storage_path: filePath,
          mime_type: file.type || null,
          file_size: file.size,
          is_public: false,
        })
        .select('id, title, storage_path, mime_type, is_public')
        .single();

      if (assetError || !assetRow) throw assetError || new Error('Failed to create asset');

      const { data: signed } = await supabase.storage
        .from('paid-content')
        .createSignedUrl(filePath, 600);
      const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
      const isVideo = ['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(ext)
        || (file.type?.startsWith('video/') ?? false);

      const newAsset: ContentAsset = {
        ...assetRow,
        previewUrl: signed?.signedUrl ?? null,
        isVideo,
      };

      setAssets((prev) => [newAsset, ...prev]);
      setSelectedIds((prev) => new Set(prev).add(newAsset.id));
      toast.success('File uploaded!');
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeliver = async () => {
    if (selectedIds.size === 0 || !creatorUserId || isDelivering) return;

    setIsDelivering(true);
    try {
      const slug = generateSlug(requestId);

      // Create delivery link (price = 0, hidden from profile)
      const { data: linkRows, error: linkError } = await supabase
        .from('links')
        .insert({
          creator_id: creatorUserId,
          profile_id: profileId,
          title: 'Custom Request Delivery',
          description: null,
          price_cents: 0,
          currency: 'USD',
          slug,
          status: 'published',
          show_on_profile: false,
        })
        .select('id, slug');

      if (linkError || !linkRows?.length) throw new Error('Failed to create delivery link');
      const linkId = linkRows[0].id;

      // Attach selected assets
      const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
      const linkMediaRows = selectedAssets.map((asset, index) => ({
        link_id: linkId,
        asset_id: asset.id,
        position: index,
      }));

      if (linkMediaRows.length > 0) {
        await supabase.from('link_media').insert(linkMediaRows);
      }

      // Capture payment via manage-request
      const { data: result, error: fnError } = await supabase.functions.invoke('manage-request', {
        body: {
          action: 'capture',
          request_id: requestId,
          delivery_link_id: linkId,
          creator_response: responseText || null,
        },
      });

      if (fnError || result?.error) {
        throw new Error(result?.error || 'Failed to capture payment');
      }

      toast.success('Content delivered! Payment captured.');
      onDelivered();
    } catch (err: any) {
      console.error('Delivery error:', err);
      toast.error(err?.message || 'Failed to deliver content');
    } finally {
      setIsDelivering(false);
    }
  };

  const selectedCount = selectedIds.size;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
      className="border-t border-border bg-card overflow-hidden"
    >
      <div className="max-h-[420px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs font-semibold text-foreground">Deliver custom request</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Optional response message */}
        <div className="px-3 py-2 border-b border-border/50 flex-shrink-0 flex items-center gap-2">
          <input
            type="text"
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Optional message to the fan…"
            maxLength={500}
            className="w-full px-3 py-2 text-xs bg-muted/50 border border-white/20 rounded-lg outline-none focus:ring-1 focus:ring-green-400/50 text-foreground placeholder:text-muted-foreground"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/20 bg-muted/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0 disabled:opacity-40"
          >
            {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Upload
          </button>
        </div>

        {/* Asset grid */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && assets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <Upload className="w-5 h-5 text-muted-foreground/30" />
              <p className="text-[11px] text-muted-foreground/60">
                No content yet. Upload a file above.
              </p>
            </div>
          )}

          {!isLoading && assets.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
              {assets.map((asset) => {
                const isSelected = selectedIds.has(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => toggleSelect(asset.id)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? 'border-green-400 ring-1 ring-green-400/30'
                        : 'border-transparent hover:border-border'
                    }`}
                  >
                    {asset.previewUrl ? (
                      asset.isVideo ? (
                        <video src={asset.previewUrl} className="w-full h-full object-cover" muted playsInline />
                      ) : (
                        <img
                          src={asset.previewUrl}
                          className="w-full h-full object-cover"
                          alt={asset.title ?? ''}
                          loading="lazy"
                          onError={(e) => { e.currentTarget.src = '/og-link-default.png'; }}
                        />
                      )
                    ) : (
                      <img src="/og-link-default.png" className="w-full h-full object-cover opacity-50" alt="" />
                    )}

                    <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-green-400 text-black scale-100'
                        : 'bg-black/40 text-white/60 scale-90'
                    }`}>
                      {isSelected ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-white/60" />
                      )}
                    </div>

                    {asset.isVideo && (
                      <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center">
                        <span className="text-[7px] text-white font-bold">▶</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-border/50 flex-shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} file${selectedCount > 1 ? 's' : ''} selected`
              : 'Select content to deliver'}
          </p>
          <button
            type="button"
            onClick={handleDeliver}
            disabled={selectedCount === 0 || isDelivering}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 text-white text-[11px] font-bold hover:bg-green-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDelivering ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            Deliver & Capture
          </button>
        </div>
      </div>
    </motion.div>
  );
}
