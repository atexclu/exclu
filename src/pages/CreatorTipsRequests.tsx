import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, MessageSquare, Check, X, Loader2,
  UploadCloud, Image as ImageIcon, Film, ArrowLeft,
  Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { maybeConvertHeic } from '@/lib/convertHeic';

interface FanProfile {
  display_name: string | null;
  avatar_url: string | null;
}

interface TipRecord {
  id: string;
  fan_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  message: string | null;
  is_anonymous: boolean;
  created_at: string;
  paid_at: string | null;
  read_at: string | null;
  creator_net_cents: number;
  platform_fee_cents: number;
  fan_email?: string | null;
  fan?: FanProfile | null;
}

interface LibraryAsset {
  id: string;
  title: string | null;
  created_at: string;
  storage_path: string;
  mime_type: string | null;
  previewUrl?: string | null;
}

interface RequestRecord {
  id: string;
  fan_id: string;
  description: string;
  proposed_amount_cents: number;
  final_amount_cents: number | null;
  currency: string;
  status: string;
  creator_response: string | null;
  created_at: string;
  expires_at: string | null;
  read_at: string | null;
  delivery_link_id: string | null;
  delivery_link_slug: string | null;
  fan_email?: string | null;
  fan?: FanProfile | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  succeeded: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  refunded: 'bg-gray-500/20 text-gray-400',
  accepted: 'bg-blue-500/20 text-blue-400',
  paid: 'bg-emerald-500/20 text-emerald-400',
  in_progress: 'bg-indigo-500/20 text-indigo-400',
  delivered: 'bg-green-500/20 text-green-400',
  completed: 'bg-green-500/20 text-green-400',
  refused: 'bg-red-500/20 text-red-400',
  expired: 'bg-gray-500/20 text-gray-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
};

/* ─────────────────────────────────────────────────────────────────────────────
   Accept-with-link modal
   Mirrors CreateLink logic: upload new file OR pick from library, set title /
   description / final amount, then creates the link (show_on_profile=false) and
   updates the custom_request with delivery_link_id + status='accepted'.
───────────────────────────────────────────────────────────────────────────── */
interface AcceptModalProps {
  request: RequestRecord;
  creatorHandle: string;
  onClose: () => void;
  onAccepted: (requestId: string, linkId: string, linkSlug: string) => void;
}

function generateSlug(base: string): string {
  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${normalized || 'custom'}-${suffix}`;
}

function AcceptWithLinkModal({ request, creatorHandle, onClose, onAccepted }: AcceptModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [finalAmount, setFinalAmount] = useState(
    (request.proposed_amount_cents / 100).toFixed(0)
  );
  const [creatorMessage, setCreatorMessage] = useState('');

  // File upload
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Library
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load library on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoadingLibrary(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      const { data } = await supabase
        .from('assets')
        .select('id, title, created_at, storage_path, mime_type')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!mounted) return;

      if (data) {
        const withPreviews = await Promise.all(
          (data as LibraryAsset[]).map(async (a) => {
            if (!a.storage_path) return { ...a, previewUrl: null };
            const { data: signed } = await supabase.storage
              .from('paid-content')
              .createSignedUrl(a.storage_path, 3600);
            return { ...a, previewUrl: signed?.signedUrl ?? null };
          })
        );
        if (mounted) setLibraryAssets(withPreviews);
      }
      if (mounted) setIsLoadingLibrary(false);
    };
    load();
    return () => { mounted = false; };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;

    const fileName = f.name.toLowerCase();
    const isHeic = f.type === 'image/heic' || f.type === 'image/heif' || fileName.endsWith('.heic') || fileName.endsWith('.heif');
    const isImage = f.type.startsWith('image/') || isHeic;
    const videoExts = ['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'];
    const isVideo = f.type.startsWith('video/') || videoExts.some(ext => fileName.endsWith(ext));

    if (!isImage && !isVideo) {
      toast.error('Please upload an image or video file.');
      return;
    }
    if (f.size > 500 * 1024 * 1024) {
      toast.error('File too large (max 500 MB).');
      return;
    }

    setFile(f);
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  };

  const handleSubmit = async () => {
    const safeTitle = title.trim();
    if (!safeTitle) { toast.error('Please enter a title for the content link.'); return; }

    const amount = Math.round(parseFloat(finalAmount) * 100);
    if (!Number.isFinite(amount) || amount < 500) {
      toast.error('Minimum amount is $5.00.');
      return;
    }

    if (!file && selectedAssetIds.length === 0) {
      toast.error('Please upload a file or select content from your library.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const slug = generateSlug(safeTitle);

      // 1. Create the link as draft
      const { data: linkRows, error: linkErr } = await supabase
        .from('links')
        .insert({
          creator_id: user.id,
          title: safeTitle,
          description: description.trim() || null,
          price_cents: amount,
          currency: 'USD',
          slug,
          status: 'draft',
          show_on_profile: false,
          is_support_link: false,
        })
        .select('id, slug')
        .single();

      if (linkErr || !linkRows) throw new Error('Failed to create content link.');

      const linkId: string = linkRows.id;
      const linkSlug: string = linkRows.slug;

      // 2. Upload file if provided
      if (file) {
        const converted = await maybeConvertHeic(file);
        const ext = converted.name.split('.').pop() ?? 'bin';
        const objectName = `paid-content/${user.id}/${linkId}/original/content.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('paid-content')
          .upload(objectName, converted, { cacheControl: '3600', upsert: true });

        if (uploadErr) {
          await supabase.from('links').delete().eq('id', linkId);
          throw new Error('Upload failed. Please try again.');
        }

        await supabase.from('links').update({ storage_path: objectName }).eq('id', linkId);
      }

      // 3. Attach library assets
      if (selectedAssetIds.length > 0) {
        const rows = selectedAssetIds.map((assetId, index) => ({
          link_id: linkId,
          asset_id: assetId,
          position: index,
        }));
        const { error: lmErr } = await supabase.from('link_media').insert(rows);
        if (lmErr) console.error('link_media attach error', lmErr);
      }

      // 4. Publish the link
      const { error: publishErr } = await supabase
        .from('links')
        .update({ status: 'published' })
        .eq('id', linkId);
      if (publishErr) throw new Error('Link created but could not be published.');

      // 5. Update the custom_request: accepted + delivery_link_id
      const { error: reqErr } = await supabase
        .from('custom_requests')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          delivery_link_id: linkId,
          creator_response: creatorMessage.trim() || null,
          read_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (reqErr) throw new Error('Link created but request update failed: ' + reqErr.message);

      toast.success('Request accepted — the fan can now unlock the content.');
      onAccepted(request.id, linkId, linkSlug);
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-5 pb-4 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div>
              <h2 className="text-base font-bold text-foreground">Accept & deliver content</h2>
              <p className="text-xs text-muted-foreground">Create a private link for this fan</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Fan request context */}
          <div className="rounded-xl bg-muted/40 border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Fan's request</p>
            <p className="text-sm text-foreground line-clamp-3">{request.description}</p>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Content title *</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Custom video for Sarah"
              className="h-10 bg-background text-sm"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Description (optional)</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="A short description of what the fan will receive"
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {/* Final amount */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Price</label>
            <div className="flex items-center gap-2">
              <div className="relative w-36">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min={5}
                  step={1}
                  value={finalAmount}
                  onChange={e => setFinalAmount(e.target.value)}
                  className="h-10 pl-7 bg-background text-sm"
                />
              </div>
              <span className="text-xs text-muted-foreground">USD (min $5.00)</span>
            </div>
          </div>

          {/* Message to fan */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Message to fan (optional)</label>
            <Textarea
              value={creatorMessage}
              onChange={e => setCreatorMessage(e.target.value)}
              placeholder="Add a personal note for the fan"
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {/* Upload new file */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Upload content *</p>
            <div
              className="relative rounded-xl border-2 border-dashed border-border bg-muted/30 p-5 flex flex-col items-center justify-center text-center gap-3 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                {file ? <Film className="w-5 h-5" /> : <UploadCloud className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {file ? file.name : 'Click to upload a photo or video'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">MP4, MOV, JPG, PNG — max 500 MB</p>
              </div>
              {previewUrl && (
                <div className="w-full mt-1 rounded-lg overflow-hidden border border-border bg-black max-h-40">
                  {file?.type.startsWith('video/') ? (
                    <video src={previewUrl} className="w-full h-40 object-cover" muted loop autoPlay playsInline />
                  ) : (
                    <img src={previewUrl} className="w-full h-40 object-cover" alt="Preview" />
                  )}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Library picker */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-foreground">Or attach from your library</p>
              {selectedAssetIds.length > 0 && (
                <span className="text-[10px] text-muted-foreground ml-auto">{selectedAssetIds.length} selected</span>
              )}
            </div>

            {isLoadingLibrary && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading library…
              </p>
            )}

            {!isLoadingLibrary && libraryAssets.length === 0 && (
              <p className="text-xs text-muted-foreground">No library content yet.</p>
            )}

            {!isLoadingLibrary && libraryAssets.length > 0 && (
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {libraryAssets.map(asset => {
                  const selected = selectedAssetIds.includes(asset.id);
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedAssetIds(prev =>
                        prev.includes(asset.id) ? prev.filter(id => id !== asset.id) : [...prev, asset.id]
                      )}
                      className={`relative overflow-hidden rounded-lg border transition-all ${
                        selected ? 'border-primary/80' : 'border-border hover:border-border/80'
                      }`}
                    >
                      {asset.previewUrl ? (
                        asset.mime_type?.startsWith('video/') ? (
                          <video src={asset.previewUrl} className="w-full h-20 object-cover" muted playsInline />
                        ) : (
                          <img src={asset.previewUrl} className="w-full h-20 object-cover" alt={asset.title ?? ''} />
                        )
                      ) : (
                        <div className="w-full h-20 bg-muted" />
                      )}
                      {selected && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-primary-foreground" />
                        </div>
                      )}
                      <p className="absolute bottom-0 inset-x-0 text-[9px] text-white bg-black/60 px-1 py-0.5 truncate">
                        {asset.title || 'Untitled'}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-border bg-card">
          <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl gap-1.5 min-w-[140px]"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating link…</>
            ) : (
              <><LinkIcon className="w-3.5 h-3.5" /> Accept & create link</>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────────────────────────── */

const CreatorTipsRequests = () => {
  const [activeTab, setActiveTab] = useState<'tips' | 'requests'>('tips');
  const [tips, setTips] = useState<TipRecord[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [creatorHandle, setCreatorHandle] = useState<string>('');

  // Accept-with-link modal
  const [acceptingRequest, setAcceptingRequest] = useState<RequestRecord | null>(null);

  // Decline inline state
  const [decliningRequestId, setDecliningRequestId] = useState<string | null>(null);
  const [declineMessage, setDeclineMessage] = useState('');
  const [isDeclining, setIsDeclining] = useState(false);

  // Stats
  const totalTipsCents = tips
    .filter((t) => t.status === 'succeeded')
    .reduce((acc, t) => acc + (t.creator_net_cents || 0), 0);
  const totalRequestsCents = requests
    .filter((r) => ['paid', 'in_progress', 'delivered', 'completed'].includes(r.status))
    .reduce((acc, r) => acc + (r.final_amount_cents || r.proposed_amount_cents || 0), 0);
  const unreadTips = tips.filter((t) => !t.read_at && t.status === 'succeeded').length;
  const pendingRequests = requests.filter((r) => r.status === 'pending').length;

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Fetch creator handle for link navigation
      const { data: profile } = await supabase
        .from('profiles')
        .select('handle')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.handle) setCreatorHandle(profile.handle);

      await fetchData(user.id);
    };
    init();
  }, []);

  // Auto-mark tips as read on initial load (tips tab is default)
  useEffect(() => {
    if (!isLoading && tips.length > 0 && activeTab === 'tips') {
      markTipsAsRead();
    }
  }, [isLoading]);

  const fetchData = async (uid: string) => {
    setIsLoading(true);

    const [tipsResult, requestsResult] = await Promise.all([
      supabase
        .from('tips')
        .select('*, fan:profiles!tips_fan_id_fkey(display_name, avatar_url)')
        .eq('creator_id', uid)
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('custom_requests')
        .select('*, fan:profiles!custom_requests_fan_id_fkey(display_name, avatar_url), delivery_link:links!custom_requests_delivery_link_id_fkey(id, slug)')
        .eq('creator_id', uid)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (tipsResult.data) setTips(tipsResult.data as TipRecord[]);
    if (requestsResult.data) {
      // Flatten delivery_link slug into record
      const flat = requestsResult.data.map((r: any) => ({
        ...r,
        delivery_link_slug: r.delivery_link?.slug ?? null,
      })) as RequestRecord[];
      setRequests(flat);
    }

    setIsLoading(false);
  };

  const markTipsAsRead = async () => {
    if (!userId) return;
    const unreadIds = tips.filter((t) => !t.read_at).map((t) => t.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from('tips')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);

    setTips((prev) => prev.map((t) => ({
      ...t,
      read_at: t.read_at || new Date().toISOString(),
    })));
  };

  const handleRequestAccepted = (requestId: string, linkId: string, linkSlug: string) => {
    setRequests(prev => prev.map(r =>
      r.id === requestId
        ? { ...r, status: 'accepted', delivery_link_id: linkId, delivery_link_slug: linkSlug }
        : r
    ));
    setAcceptingRequest(null);
  };

  const handleDeclineRequest = async (requestId: string) => {
    setIsDeclining(true);
    try {
      const { error } = await supabase
        .from('custom_requests')
        .update({
          status: 'refused',
          creator_response: declineMessage.trim() || null,
          read_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      setRequests(prev => prev.map(r =>
        r.id === requestId
          ? { ...r, status: 'refused', creator_response: declineMessage.trim() || null, read_at: new Date().toISOString() }
          : r
      ));
      toast.success('Request declined');
      setDecliningRequestId(null);
      setDeclineMessage('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to decline request');
    } finally {
      setIsDeclining(false);
    }
  };

  const tabs = [
    { key: 'tips' as const, label: 'Tips', icon: DollarSign, badge: unreadTips },
    { key: 'requests' as const, label: 'Requests', icon: MessageSquare, badge: pendingRequests },
  ];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Tips & Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage tips and custom content requests from your fans</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Tips Earned</p>
            <p className="text-xl font-bold text-foreground mt-1">${(totalTipsCents / 100).toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Unread Tips</p>
            <p className="text-xl font-bold text-foreground mt-1">{unreadTips}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Request Revenue</p>
            <p className="text-xl font-bold text-foreground mt-1">${(totalRequestsCents / 100).toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Pending Requests</p>
            <p className="text-xl font-bold text-foreground mt-1">{pendingRequests}</p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6">
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                if (key === 'tips') markTipsAsRead();
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] text-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Tips Tab */}
        {!isLoading && activeTab === 'tips' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {tips.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">No tips received yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Enable tips in your profile settings and fans will be able to tip you directly
                </p>
              </div>
            ) : (
              tips.map((tip) => (
                <div
                  key={tip.id}
                  className={`rounded-xl border bg-card p-4 transition-all ${
                    !tip.read_at ? 'border-primary/30 bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Fan avatar */}
                      {!tip.is_anonymous && (
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-border flex-shrink-0 bg-muted">
                          {tip.fan?.avatar_url ? (
                            <img src={tip.fan.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-xs font-bold text-muted-foreground">
                                {(tip.fan?.display_name || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {tip.is_anonymous
                              ? 'Anonymous'
                              : (tip.fan?.display_name || 'Fan')}
                          </p>
                          {!tip.read_at && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium flex-shrink-0">
                              New
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(tip.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">
                        ${(tip.creator_net_cents / 100).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        net (${(tip.amount_cents / 100).toFixed(2)} total)
                      </p>
                    </div>
                  </div>
                  {tip.message && (
                    <div className="mt-3 rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-foreground/80">{tip.message}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </motion.div>
        )}

        {/* Requests Tab */}
        {!isLoading && activeTab === 'requests' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {requests.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">No custom requests yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Enable custom requests in your profile settings to start receiving them
                </p>
              </div>
            ) : (
              requests.map((req) => (
                <div
                  key={req.id}
                  className={`rounded-xl border bg-card p-4 transition-all ${
                    !req.read_at && req.status === 'pending' ? 'border-primary/30 bg-primary/5' : 'border-border'
                  }`}
                >
                  {/* Header: fan info + amount + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Fan avatar */}
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-border flex-shrink-0 bg-muted">
                        {req.fan?.avatar_url ? (
                          <img src={req.fan.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-xs font-bold text-muted-foreground">
                              {(req.fan?.display_name || '?').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {req.fan?.display_name || 'Fan'}
                          </p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColors[req.status] || 'bg-gray-500/20 text-gray-400'}`}>
                            {req.status}
                          </span>
                          {!req.read_at && req.status === 'pending' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium flex-shrink-0">New</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(req.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          {req.expires_at && req.status === 'pending' && (
                            <span className="ml-2 text-yellow-500">
                              · Expires {new Date(req.expires_at).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-foreground">
                        ${((req.final_amount_cents || req.proposed_amount_cents) / 100).toFixed(2)}
                      </p>
                      {req.final_amount_cents && req.final_amount_cents !== req.proposed_amount_cents && (
                        <p className="text-[10px] text-muted-foreground line-through">
                          ${(req.proposed_amount_cents / 100).toFixed(2)} proposed
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Fan's request text */}
                  <div className="mt-3 rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-foreground/80 whitespace-pre-wrap">{req.description}</p>
                  </div>

                  {/* Creator's response message (if any) */}
                  {req.creator_response && (
                    <div className="mt-2 pl-3 border-l-2 border-primary/30">
                      <p className="text-xs text-muted-foreground italic">Your note: {req.creator_response}</p>
                    </div>
                  )}

                  {/* Accepted: show link info */}
                  {req.status === 'accepted' && req.delivery_link_id && req.delivery_link_slug && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
                      <LinkIcon className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                      <p className="text-xs text-green-400 flex-1">
                        Content link created — fan can now unlock it
                      </p>
                      <a
                        href={`/${creatorHandle}/links/${req.delivery_link_slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-green-400 underline underline-offset-2 flex-shrink-0"
                      >
                        View link
                      </a>
                    </div>
                  )}

                  {/* Pending: Accept (opens modal) + Decline (inline) */}
                  {req.status === 'pending' && (
                    <div className="mt-3">
                      {decliningRequestId === req.id ? (
                        <div className="space-y-2 rounded-lg bg-muted/30 border border-border p-3">
                          <p className="text-xs font-medium text-foreground">Decline this request?</p>
                          <Textarea
                            value={declineMessage}
                            onChange={e => setDeclineMessage(e.target.value)}
                            placeholder="Optional message to the fan"
                            rows={2}
                            className="text-xs resize-none"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                              onClick={() => handleDeclineRequest(req.id)}
                              disabled={isDeclining}
                            >
                              {isDeclining ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <X className="w-3 h-3 mr-1" />}
                              Confirm decline
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-xl text-xs"
                              onClick={() => { setDecliningRequestId(null); setDeclineMessage(''); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="rounded-xl text-xs gap-1"
                            onClick={() => setAcceptingRequest(req)}
                          >
                            <Check className="w-3 h-3" />
                            Accept & deliver
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl text-xs text-red-400 border-red-500/30 hover:bg-red-500/10 gap-1"
                            onClick={() => setDecliningRequestId(req.id)}
                          >
                            <X className="w-3 h-3" />
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </motion.div>
        )}
      </div>

      {/* Accept-with-link modal */}
      <AnimatePresence>
        {acceptingRequest && (
          <AcceptWithLinkModal
            request={acceptingRequest}
            creatorHandle={creatorHandle}
            onClose={() => setAcceptingRequest(null)}
            onAccepted={handleRequestAccepted}
          />
        )}
      </AnimatePresence>
    </AppShell>
  );
};

export default CreatorTipsRequests;
