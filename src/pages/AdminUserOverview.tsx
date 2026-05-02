import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, ExternalLink, Trash2, Eye, EyeOff, Loader2, Tag, Building2, Camera, Mail, Wallet as WalletIcon, TrendingUp, ShoppingCart, Landmark, Activity, ArrowUpRight, Crown, Link2, FolderOpen, Settings as SettingsIcon, LayoutGrid, ChevronLeft, MapPin, Calendar, Sparkles } from 'lucide-react'; // Loader2 + Mail used by content reminder button
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { ModelCategoryDropdown } from '@/components/ui/ModelCategoryDropdown';

interface UserProfileOverview {
  id: string;
  display_name: string | null;
  handle: string | null;
  created_at: string | null;
  is_creator: boolean | null;
  country: string | null;
  role: string | null;
  is_directory_visible: boolean | null;
  is_creator_subscribed: boolean;
  wallet_balance_cents: number;
  pending_balance_cents: number;
  total_earned_cents: number;
  total_withdrawn_cents: number;
  holds_in_flight_cents: number;
  rank_percentile: number | null;
  bank_iban: string | null;
  bank_holder_name: string | null;
  bank_bic: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  bank_routing_number: string | null;
  bank_bsb: string | null;
  bank_country: string | null;
  payout_setup_complete: boolean;
}

interface PayoutOverview {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  requested_at: string | null;
  processed_at: string | null;
}

interface UserLinkOverview {
  id: string;
  slug: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  show_on_profile: boolean | null;
  profile_id?: string | null;
  price_cents: number | null;
  created_at: string | null;
  published_at: string | null;
  storage_path: string | null;
  mime_type: string | null;
  previewUrl?: string | null;
  media?: Array<{
    id: string;
    storage_path: string;
    mime_type: string | null;
    title: string | null;
    preview_url: string | null;
  }>;
}

interface UserAssetOverview {
  id: string;
  title: string | null;
  created_at: string | null;
  mime_type: string | null;
  is_public?: boolean | null;
  profile_id?: string | null;
  preview_url: string | null;
  storage_path?: string | null;
}

interface UserSaleOverview {
  id: string;
  link_id: string | null;
  link_title: string | null;
  buyer_email: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: string;
  created_at: string | null;
}

interface MetricsBucket {
  cnt: number;
  gross_cents: number;
  net_cents: number;
}

interface AdminUserMetrics {
  purchases: MetricsBucket;
  tips: MetricsBucket;
  gifts: MetricsBucket;
  custom_requests: MetricsBucket;
  fan_subscriptions: {
    active_count: number;
    total_count: number;
    monthly_revenue_cents: number;
  };
  last_30d: {
    sales_count: number;
    revenue_cents: number;
  };
  top_links: Array<{
    id: string;
    title: string | null;
    slug: string | null;
    sales_count: number;
    revenue_cents: number;
  }>;
  // Optional because it was added in migration 151 — payload from a
  // pre-151 backend can omit it; the UI renders conditionally.
  referrals?: {
    lifetime_earnings_cents: number;
    commissions_row_sum_cents: number;
    recruited_count: number;
    converted_count: number;
    payout_requested_at: string | null;
    referred_by: { id: string; handle: string | null; display_name: string | null } | null;
  };
  totals: {
    count: number;
    gross_cents: number;
    net_cents: number;
  };
}

interface UserOverviewPayload {
  profile: UserProfileOverview | null;
  links: UserLinkOverview[];
  assets: UserAssetOverview[];
  sales: UserSaleOverview[];
  payouts: PayoutOverview[];
  metrics: AdminUserMetrics | null;
}

const AdminUserOverview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/admin/users';
  const [profile, setProfile] = useState<UserProfileOverview | null>(null);
  const [links, setLinks] = useState<UserLinkOverview[]>([]);
  const [assets, setAssets] = useState<UserAssetOverview[]>([]);
  const [sales, setSales] = useState<UserSaleOverview[]>([]);
  const [payouts, setPayouts] = useState<PayoutOverview[]>([]);
  const [metrics, setMetrics] = useState<AdminUserMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<UserAssetOverview | null>(null);
  const [selectedLink, setSelectedLink] = useState<UserLinkOverview | null>(null);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [modelCategories, setModelCategories] = useState<string[]>([]);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [agencyData, setAgencyData] = useState<{ agency_name: string; agency_logo_url: string | null; country: string } | null>(null);
  const [managedProfiles, setManagedProfiles] = useState<Array<{ id: string; username: string; display_name: string | null; is_active: boolean; avatar_url: string | null; model_categories: string[] }>>([]);
  const [selectedManagedProfileId, setSelectedManagedProfileId] = useState<string | null>(null);
  const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);
  const [isRequestingPhotoChange, setIsRequestingPhotoChange] = useState(false);
  const [photoTargetProfileId, setPhotoTargetProfileId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'wallet' | 'settings'>('overview');
  // Content reminder state — loaded async after the main payload, so the
  // overview renders immediately and the chip flicks in once the metadata is
  // available. Last-upload date is derived locally from the same `links` and
  // `assets` arrays the overview already pulls.
  const [lastReminderAt, setLastReminderAt] = useState<string | null>(null);
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('Missing user id in URL.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const abortController = new AbortController();

    const loadOverview = async () => {
      setIsLoading(true);
      setError(null);

      let session: any = null;
      try {
        const { data } = await supabase.auth.getSession();
        session = data.session;
      } catch (authErr) {
        console.error('Auth session error:', authErr);
      }

      if (!isMounted) return;

      if (!session) {
        setError('You are not authenticated. Please sign in again.');
        setIsLoading(false);
        return;
      }

      try {
        const [overviewResult, profileExtraResult, creatorProfilesResult] = await Promise.all([
          supabase.functions.invoke('admin-get-user-overview', {
            body: { user_id: id },
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'x-supabase-auth': session.access_token,
            },
          }),
          supabase
            .from('profiles')
            .select('agency_name, agency_logo_url, country, avatar_url')
            .eq('id', id)
            .maybeSingle(),
          supabase
            .from('creator_profiles')
            .select('id, username, display_name, is_active, avatar_url, model_categories')
            .eq('user_id', id),
        ]);

        if (!isMounted) return;

        if (overviewResult.error) {
          console.error('Error loading user overview from admin-get-user-overview', overviewResult.error);
          setError('Unable to load user overview. Make sure your account has admin access.');
          setIsLoading(false);
          return;
        }

        const payload = overviewResult.data as UserOverviewPayload;
        setProfile(payload.profile);
        setLinks(payload.links ?? []);
        setAssets(payload.assets ?? []);
        setSales(payload.sales ?? []);
        setPayouts(payload.payouts ?? []);
        setMetrics(payload.metrics ?? null);

        // Last reminder — fire-and-forget. Decorative chip; no blocking.
        if (payload.profile?.is_creator) {
          supabase
            .from('content_reminder_log')
            .select('sent_at')
            .eq('creator_id', payload.profile.id)
            .order('sent_at', { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
              if (data?.sent_at) setLastReminderAt(data.sent_at);
            });
        }

        const extra = profileExtraResult.data;
        if (extra?.avatar_url) setAvatarUrl(extra.avatar_url);

        const cps = creatorProfilesResult.data ?? [];
        const activeCp = cps.find((p: any) => p.is_active);
        if (activeCp?.model_categories) setModelCategories(activeCp.model_categories);

        if (extra?.agency_name) {
          setAgencyData({
            agency_name: extra.agency_name,
            agency_logo_url: extra.agency_logo_url ?? null,
            country: extra.country ?? '',
          });
          setManagedProfiles(cps);
        }
      } catch (fetchErr) {
        console.error('Fetch error:', fetchErr);
        if (isMounted) {
          setError('Unable to load user overview. Please try again.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadOverview();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleDeleteUser = async () => {
    if (!id) return;

    setIsDeleting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('Please sign in again to delete this user.');
        setIsDeleting(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { user_id: id },
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'x-supabase-auth': session.access_token,
        },
      });

      if (error) {
        console.error('Error deleting user', error);
        setError('Failed to delete user. Please try again.');
        setIsDeleting(false);
        return;
      }

      // Success - redirect to users list
      navigate(returnTo);
    } catch (err) {
      console.error('Unexpected error deleting user', err);
      setError('An unexpected error occurred.');
      setIsDeleting(false);
    }
  };

  const handleDirectoryVisibilityToggle = async (checked: boolean) => {
    if (!id || !profile) return;

    setIsUpdatingVisibility(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('Please sign in again to update visibility.');
        setIsUpdatingVisibility(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-update-user-visibility', {
        body: { 
          user_id: id, 
          is_directory_visible: checked 
        },
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'x-supabase-auth': session.access_token,
        },
      });

      if (error) {
        console.error('Error updating visibility', error);
        setError('Failed to update visibility. Please try again.');
        setIsUpdatingVisibility(false);
        return;
      }

      // Update local state
      setProfile(prev => prev ? { ...prev, is_directory_visible: checked } : null);
    } catch (err) {
      console.error('Unexpected error updating visibility', err);
      setError('An unexpected error occurred.');
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  const handleToggleLinkVisibility = async (linkId: string, currentVisible: boolean) => {
    const newVal = !currentVisible;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { toast.error('Session expired'); return; }

    const { data: resData, error: updateErr } = await supabase.functions.invoke('admin-manage-user-content', {
      body: { action: 'update_link_visibility', link_id: linkId, show_on_profile: newVal },
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'x-supabase-auth': session.access_token,
      },
    });

    if (updateErr || resData?.error) {
      toast.error('Failed to update link visibility');
    } else {
      setLinks((prev) =>
        prev.map((l) => (l.id === linkId ? { ...l, show_on_profile: newVal } : l))
      );
      toast.success(newVal ? 'Content set to visible' : 'Content hidden from profile');
    }
  };

  const handleToggleAssetVisibility = async (assetId: string, currentPublic: boolean) => {
    const newVal = !currentPublic;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { toast.error('Session expired'); return; }

    const { data: resData, error: updateErr } = await supabase.functions.invoke('admin-manage-user-content', {
      body: { action: 'update_asset_visibility', asset_id: assetId, is_public: newVal },
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'x-supabase-auth': session.access_token,
      },
    });

    if (updateErr || resData?.error) {
      toast.error('Failed to update asset visibility');
    } else {
      setAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, is_public: newVal } : a))
      );
      toast.success(newVal ? 'Asset set to public' : 'Asset hidden from public');
    }
  };

  const handleSendContentReminder = async () => {
    if (!profile || isSendingReminder) return;
    setIsSendingReminder(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Session expired');
        setIsSendingReminder(false);
        return;
      }

      const { data, error: invokeErr } = await supabase.functions.invoke('admin-send-content-reminder', {
        body: { creator_id: profile.id },
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'x-supabase-auth': session.access_token,
        },
      });

      if (invokeErr || (data && (data as any).error)) {
        const msg = (data as any)?.error ?? invokeErr?.message ?? 'Reminder failed to send';
        toast.error(msg);
        return;
      }

      const sentAt = (data as any)?.sent_at ?? new Date().toISOString();
      setLastReminderAt(sentAt);
      toast.success('Content reminder sent ✨');
    } catch (err) {
      console.error('[AdminUserOverview] send-content-reminder error', err);
      toast.error('Reminder failed to send');
    } finally {
      setIsSendingReminder(false);
    }
  };

  // Days since last upload (links + assets, any status). Used for the chip
  // colour in the admin hero — green ≤7d, amber ≤30d, red >30d.
  const lastUploadAt: string | null = (() => {
    const candidates = [
      ...links.map((l) => l.created_at),
      ...assets.map((a) => a.created_at),
    ].filter((d): d is string => !!d);
    if (candidates.length === 0) return null;
    return candidates.reduce((acc, cur) => (cur > acc ? cur : acc), candidates[0]);
  })();
  const daysSinceLastUpload =
    lastUploadAt !== null
      ? Math.max(0, Math.floor((Date.now() - new Date(lastUploadAt).getTime()) / 86_400_000))
      : null;
  const reminderChipColour = (() => {
    if (daysSinceLastUpload === null) return 'bg-exclu-arsenic/40 text-exclu-space border-exclu-arsenic/60';
    if (daysSinceLastUpload <= 7) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    if (daysSinceLastUpload <= 30) return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    return 'bg-red-500/10 text-red-300 border-red-500/30';
  })();

  const handleSaveCategories = async () => {
    if (!id) return;
    setIsSavingCategories(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { toast.error('Session expired'); return; }

      // if managedProfiles.length > 0, we update the selected one, otherwise the base user_id
      const bodyPayload: any = { model_categories: modelCategories };
      if (managedProfiles.length > 0 && selectedManagedProfileId) {
        bodyPayload.profile_id = selectedManagedProfileId;
      } else {
        bodyPayload.user_id = id;
      }

      const { data: resData, error: updateErr } = await supabase.functions.invoke('admin-update-user-visibility', {
        body: bodyPayload,
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'x-supabase-auth': session.access_token,
        },
      });
      if (updateErr || resData?.error) {
        toast.error('Failed to save categories');
      } else {
        toast.success('Categories updated');
        // Update local managedProfiles if applicable
        if (selectedManagedProfileId) {
          setManagedProfiles(prev => prev.map(p => p.id === selectedManagedProfileId ? { ...p, model_categories: modelCategories } : p));
        }
      }
    } finally {
      setIsSavingCategories(false);
    }
  };

  const handleDeleteAsset = async (assetId: string, storagePath: string | null | undefined) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { toast.error('Session expired'); return; }
    const { data: resData, error: err } = await supabase.functions.invoke('admin-manage-user-content', {
      body: { action: 'delete_asset', asset_id: assetId, storage_path: storagePath ?? null },
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'x-supabase-auth': session.access_token },
    });
    if (err || resData?.error) {
      toast.error('Failed to delete content');
    } else {
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      toast.success('Content deleted');
    }
  };

  const handleDeleteAvatar = async () => {
    if (!id) return;
    setIsDeletingAvatar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { toast.error('Session expired'); return; }
      const body: any = { action: 'delete_avatar' };
      if (photoTargetProfileId) {
        body.creator_profile_id = photoTargetProfileId;
      } else {
        body.user_id = id;
      }
      const { data: resData, error: err } = await supabase.functions.invoke('admin-manage-user-content', {
        body,
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'x-supabase-auth': session.access_token },
      });
      if (err || resData?.error) {
        toast.error('Failed to delete photo');
      } else {
        toast.success('Profile photo deleted');
        if (photoTargetProfileId) {
          setManagedProfiles(prev => prev.map(p => p.id === photoTargetProfileId ? { ...p, avatar_url: null } : p));
        }
      }
    } finally {
      setIsDeletingAvatar(false);
    }
  };

  const handleRequestPhotoChange = async () => {
    if (!id) return;
    setIsRequestingPhotoChange(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { toast.error('Session expired'); return; }
      const targetProfile = photoTargetProfileId ? managedProfiles.find(p => p.id === photoTargetProfileId) : null;
      const { data: resData, error: err } = await supabase.functions.invoke('admin-manage-user-content', {
        body: { action: 'request_photo_change', user_id: id, profile_display_name: targetProfile?.display_name ?? targetProfile?.username ?? null },
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'x-supabase-auth': session.access_token },
      });
      if (err || resData?.error) {
        toast.error('Failed to send email');
      } else {
        toast.success('Photo change request sent by email');
      }
    } finally {
      setIsRequestingPhotoChange(false);
    }
  };

  useEffect(() => {
    if (selectedManagedProfileId) {
      const p = managedProfiles.find(m => m.id === selectedManagedProfileId);
      if (p && p.model_categories) setModelCategories(p.model_categories);
      else setModelCategories([]);
    } else if (managedProfiles.length > 0) {
      setModelCategories([]);
    }
  }, [selectedManagedProfileId, managedProfiles]);

  const displayLinks = selectedManagedProfileId ? links.filter(l => l.profile_id === selectedManagedProfileId) : links;
  const displayAssets = selectedManagedProfileId ? assets.filter(a => a.profile_id === selectedManagedProfileId) : assets;

  return (
    <AppShell>
      <main className="relative px-4 pt-6 pb-12 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Top actions */}
          <div className="flex items-center justify-between mb-5">
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="inline-flex items-center gap-1.5 text-xs text-exclu-space/70 hover:text-exclu-cloud transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to users
            </button>
            <div className="flex items-center gap-2">
              {profile?.handle && (
                <button
                  type="button"
                  onClick={() => window.open(`/${profile.handle}`, '_blank')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-exclu-arsenic/60 bg-exclu-ink/60 text-xs text-exclu-space hover:text-exclu-cloud hover:border-exclu-cloud/40 transition-colors"
                  title="View public profile"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Public profile</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!profile || isDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-red-500/30 bg-red-500/5 text-xs text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Delete user"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-5 animate-pulse">
              <div className="h-40 rounded-3xl bg-exclu-ink/60 border border-exclu-arsenic/40" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-exclu-ink/60 border border-exclu-arsenic/40" />
                ))}
              </div>
              <div className="h-10 w-72 rounded-full bg-exclu-ink/60 border border-exclu-arsenic/40" />
              <div className="h-64 rounded-2xl bg-exclu-ink/60 border border-exclu-arsenic/40" />
            </div>
          ) : !profile ? (
            <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 p-10 text-center">
              <p className="text-sm text-exclu-space">User profile not found.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">{error}</div>
              )}

              {/* ── Hero ── */}
              <section className="relative overflow-hidden rounded-3xl border border-exclu-arsenic/60 bg-gradient-to-br from-exclu-ink/90 via-exclu-ink/60 to-exclu-black/80 p-6 sm:p-8 mb-5">
                <div aria-hidden className="pointer-events-none absolute -top-24 -right-12 w-[360px] h-[360px] rounded-full bg-[radial-gradient(circle,rgba(207,255,22,0.16),transparent_60%)] blur-3xl" />
                <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%222%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.7%22/></svg>')]" />

                <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
                  <div className="relative shrink-0">
                    <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-[#CFFF16]/40 to-transparent blur-sm opacity-60" />
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border border-white/10 bg-exclu-arsenic/40 flex items-center justify-center">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={profile.display_name ?? profile.handle ?? 'User'} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl font-black text-white/40 tracking-tight">
                          {(profile.display_name || profile.handle || '?')[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-semibold text-[#CFFF16]/80 mb-1.5">
                      <Activity className="w-3 h-3" />
                      Admin view
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-exclu-cloud truncate">
                      {profile.display_name || 'Untitled user'}
                    </h1>
                    {profile.handle && (
                      <p className="text-sm text-exclu-space/80 mt-0.5">@{profile.handle}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${profile.is_creator_subscribed ? 'bg-[#CFFF16]/15 text-[#CFFF16] border-[#CFFF16]/30' : 'bg-exclu-arsenic/40 text-exclu-space/80 border-exclu-arsenic/50'}`}>
                        {profile.is_creator_subscribed ? <><Crown className="w-3 h-3" /> Premium · 0%</> : <>Free · 15%</>}
                      </span>
                      <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                        profile.role === 'chatter' ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' :
                        profile.role === 'creator' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                        'bg-exclu-arsenic/40 text-exclu-space/70 border-exclu-arsenic/50'
                      }`}>
                        {profile.role ?? 'unknown'}
                      </span>
                      {profile.is_creator && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-exclu-ink/80 text-exclu-cloud/80 border border-exclu-arsenic/60">
                          <Sparkles className="w-3 h-3 text-[#CFFF16]" /> Creator
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${profile.is_directory_visible ? 'bg-green-500/10 text-green-400 border-green-500/25' : 'bg-exclu-arsenic/40 text-exclu-space/60 border-exclu-arsenic/50'}`}>
                        {profile.is_directory_visible ? <><Eye className="w-3 h-3" /> In directory</> : <><EyeOff className="w-3 h-3" /> Hidden</>}
                      </span>
                      {profile.rank_percentile !== null && profile.rank_percentile !== undefined && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          title="Rank among earning creators (1 = top earner)"
                        >
                          <TrendingUp className="w-3 h-3" /> Top {profile.rank_percentile}%
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-exclu-space/70">
                      <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> Joined {profile.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</span>
                      {profile.country && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {profile.country}</span>}
                    </div>
                  </div>

                  {/* ── Admin actions — content reminder (creators only) ──
                      Manual trigger; no DB-side cooldown. The chips below the
                      button surface "last upload" and "last reminder" so the
                      admin can decide visually whether sending another is
                      appropriate. Send is single-click, instant — modal-free
                      per UX spec. */}
                  {profile.is_creator && (
                    <div className="sm:ml-auto flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleSendContentReminder}
                        disabled={isSendingReminder}
                        className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-bold bg-[#CFFF16] text-black hover:bg-[#CFFF16]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_6px_18px_-4px_rgba(207,255,22,0.4)]"
                      >
                        {isSendingReminder ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</> : <><Mail className="w-3.5 h-3.5" /> Send content reminder</>}
                      </button>
                      <div className="flex flex-col items-stretch sm:items-end gap-1 text-[10px]">
                        <span className={`inline-flex items-center justify-center gap-1.5 px-2 py-0.5 rounded-full border font-medium ${reminderChipColour}`}>
                          {daysSinceLastUpload === null
                            ? 'No content yet'
                            : daysSinceLastUpload === 0
                              ? 'Last upload today'
                              : `Last upload: ${daysSinceLastUpload}d ago`}
                        </span>
                        {lastReminderAt && (
                          <span className="text-exclu-space/60">
                            Last reminder: {new Date(lastReminderAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            {' · '}
                            {Math.floor((Date.now() - new Date(lastReminderAt).getTime()) / 86_400_000)}d ago
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ── KPI strip — money flow disambiguated ──
                Available  : matured credits − settled withdrawals − active holds (what the creator can actually withdraw right now)
                Pending    : credits not yet matured (anti-fraud holding window). Becomes Available after maturation.
                Holds      : in-flight payouts (requested/approved/processing) already debited from Available
                Earned     : lifetime gross-of-holds creator-net revenue (every successful sale, ever)
                Withdrawn  : settled payouts (status=completed/paid)
                Sales+Last30: activity counters (last_30d revenue is creator-net since migration 191)
              */}
              <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                {[
                  { icon: WalletIcon, label: 'Available now',     value: `$${((profile.wallet_balance_cents ?? 0) / 100).toFixed(2)}`, hint: 'Withdrawable today', accent: true },
                  { icon: Activity,   label: 'Pending balance',   value: `$${((profile.pending_balance_cents ?? 0) / 100).toFixed(2)}`, hint: 'Maturing — not yet withdrawable' },
                  { icon: ArrowUpRight, label: 'Holds in flight', value: `$${((profile.holds_in_flight_cents ?? 0) / 100).toFixed(2)}`, hint: 'Pending payout (already debited)' },
                ].map(({ icon: Icon, label, value, hint, accent }) => (
                  <div
                    key={label}
                    className={`relative overflow-hidden rounded-2xl border p-4 transition-colors ${
                      accent
                        ? 'border-[#CFFF16]/30 bg-gradient-to-br from-[#CFFF16]/5 to-exclu-ink/60'
                        : 'border-exclu-arsenic/50 bg-exclu-ink/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold text-exclu-space/70">
                      <Icon className={`w-3.5 h-3.5 ${accent ? 'text-[#CFFF16]' : 'text-exclu-space/70'}`} />
                      {label}
                    </div>
                    <p className={`mt-2 text-xl sm:text-2xl font-bold tabular-nums tracking-tight ${accent ? 'text-[#CFFF16]' : 'text-exclu-cloud'}`}>
                      {value}
                    </p>
                    <p className="mt-1 text-[10px] text-exclu-space/60 leading-tight">{hint}</p>
                  </div>
                ))}
              </section>
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                {[
                  { icon: TrendingUp,   label: 'Lifetime earned', value: `$${((profile.total_earned_cents ?? 0) / 100).toFixed(2)}`, hint: 'Gross creator-net, all time' },
                  { icon: Landmark,     label: 'Withdrawn',       value: `$${((profile.total_withdrawn_cents ?? 0) / 100).toFixed(2)}`, hint: 'Settled payouts only' },
                  { icon: ShoppingCart, label: 'Total sales',     value: (metrics?.totals.count ?? 0).toLocaleString(), hint: 'All transactions, all time' },
                  { icon: Activity,     label: 'Last 30 days',    value: metrics ? `${metrics.last_30d.sales_count} · $${(metrics.last_30d.revenue_cents / 100).toFixed(2)}` : '—', hint: 'Creator-net revenue (post-migration 191)' },
                ].map(({ icon: Icon, label, value, hint }) => (
                  <div
                    key={label}
                    className="relative overflow-hidden rounded-2xl border border-exclu-arsenic/50 bg-exclu-ink/70 p-4"
                  >
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold text-exclu-space/70">
                      <Icon className="w-3.5 h-3.5 text-exclu-space/70" />
                      {label}
                    </div>
                    <p className="mt-2 text-xl sm:text-2xl font-bold tabular-nums tracking-tight text-exclu-cloud">
                      {value}
                    </p>
                    <p className="mt-1 text-[10px] text-exclu-space/60 leading-tight">{hint}</p>
                  </div>
                ))}
              </section>

              {/* ── Tabs ── */}
              <div className="mb-5">
                <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80 max-w-full overflow-x-auto scrollbar-hide">
                  {[
                    { key: 'overview' as const, label: 'Overview', icon: LayoutGrid },
                    { key: 'content' as const, label: 'Content', icon: FolderOpen },
                    { key: 'wallet' as const, label: 'Wallet', icon: Landmark },
                    { key: 'settings' as const, label: 'Settings', icon: SettingsIcon },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-medium transition-all whitespace-nowrap ${
                          isActive ? 'bg-[#CFFF16] text-black shadow-sm' : 'hover:text-exclu-cloud'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── OVERVIEW ── */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {metrics && profile.is_creator && (
                    <section className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 sm:p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-[#CFFF16]" />
                          <h2 className="text-sm font-semibold text-exclu-cloud">Revenue breakdown</h2>
                        </div>
                        <span className="text-[10px] text-exclu-space/60">All-time, every surface</span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="rounded-xl bg-exclu-arsenic/20 border border-exclu-arsenic/40 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-exclu-space/60">Gross</p>
                          <p className="text-xl font-bold text-exclu-cloud tabular-nums mt-0.5">${(metrics.totals.gross_cents / 100).toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl bg-[#CFFF16]/5 border border-[#CFFF16]/25 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-[#CFFF16]/70">Creator net</p>
                          <p className="text-xl font-bold text-[#CFFF16] tabular-nums mt-0.5">${(metrics.totals.net_cents / 100).toFixed(2)}</p>
                        </div>
                        <div className="rounded-xl bg-exclu-arsenic/20 border border-exclu-arsenic/40 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-exclu-space/60">Sales</p>
                          <p className="text-xl font-bold text-exclu-cloud tabular-nums mt-0.5">{metrics.totals.count.toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                        {[
                          { label: 'Link purchases', data: metrics.purchases, icon: Link2 },
                          { label: 'Tips', data: metrics.tips, icon: Sparkles },
                          { label: 'Gifts', data: metrics.gifts, icon: Activity },
                          { label: 'Custom requests', data: metrics.custom_requests, icon: Tag },
                        ].map(({ label, data, icon: Icon }) => (
                          <div key={label} className="rounded-xl bg-exclu-ink/60 border border-exclu-arsenic/40 p-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Icon className="w-3 h-3 text-exclu-space/70" />
                              <p className="text-[10px] text-exclu-space/70">{label}</p>
                            </div>
                            <p className="text-[13px] font-semibold text-exclu-cloud tabular-nums">
                              {data.cnt} · ${(data.gross_cents / 100).toFixed(2)}
                            </p>
                            <p className="text-[10px] text-exclu-space/50 mt-0.5">net ${(data.net_cents / 100).toFixed(2)}</p>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
                        <div className="rounded-xl bg-exclu-ink/60 border border-exclu-arsenic/40 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] uppercase tracking-wider text-exclu-space/70">Fan subscriptions</p>
                            <span className="text-[10px] text-[#CFFF16] font-medium">${(metrics.fan_subscriptions.monthly_revenue_cents / 100).toFixed(2)} / mo</span>
                          </div>
                          <p className="text-sm font-semibold text-exclu-cloud mt-1">
                            {metrics.fan_subscriptions.active_count} active <span className="text-exclu-space/50">· {metrics.fan_subscriptions.total_count} total</span>
                          </p>
                        </div>

                        {metrics.referrals && (
                          <div className="rounded-xl bg-exclu-ink/60 border border-exclu-arsenic/40 p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] uppercase tracking-wider text-exclu-space/70">Referral earnings</p>
                              {metrics.referrals.payout_requested_at ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium">Payout pending</span>
                              ) : (
                                <span className="text-[10px] text-[#CFFF16] font-medium">35% recurring</span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-exclu-cloud mt-1 tabular-nums">
                              ${((metrics.referrals.lifetime_earnings_cents ?? 0) / 100).toFixed(2)}
                              <span className="text-exclu-space/50 text-[11px] font-normal ml-1">lifetime</span>
                            </p>
                            <p className="text-[10px] text-exclu-space/60 mt-0.5">
                              {metrics.referrals.recruited_count ?? 0} recruited
                              <span className="text-exclu-space/40"> · </span>
                              {metrics.referrals.converted_count ?? 0} premium
                              {metrics.referrals.referred_by && (
                                <>
                                  <span className="text-exclu-space/40"> · </span>
                                  referred by{' '}
                                  <a
                                    href={metrics.referrals.referred_by.handle ? `/${metrics.referrals.referred_by.handle}` : '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-exclu-cloud/80 hover:text-[#CFFF16]"
                                  >
                                    @{metrics.referrals.referred_by.handle || metrics.referrals.referred_by.display_name || metrics.referrals.referred_by.id.slice(0, 8)}
                                  </a>
                                </>
                              )}
                            </p>
                          </div>
                        )}
                      </div>

                      {metrics.top_links.length > 0 && (
                        <div className="rounded-xl bg-exclu-ink/60 border border-exclu-arsenic/40 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-exclu-space/70 mb-2">Top-selling links</p>
                          <div className="space-y-1">
                            {metrics.top_links.slice(0, 3).map((tl) => (
                              <div key={tl.id} className="flex items-center justify-between text-[11px] gap-2">
                                <span className="text-exclu-cloud truncate flex-1">{tl.title || tl.slug || tl.id}</span>
                                <span className="text-exclu-space/60 shrink-0 tabular-nums">{tl.sales_count}</span>
                                <span className="text-[#CFFF16] font-medium shrink-0 tabular-nums">${(tl.revenue_cents / 100).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {agencyData && (
                    <section className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Building2 className="w-4 h-4 text-[#CFFF16]" />
                        <h2 className="text-sm font-semibold text-exclu-cloud">Agency Information</h2>
                      </div>

                      <div className="flex items-center gap-4 mb-4">
                        {agencyData.agency_logo_url ? (
                          <img src={agencyData.agency_logo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-exclu-arsenic/50" />
                        ) : (
                          <div className="w-14 h-14 rounded-xl border border-exclu-arsenic/50 bg-exclu-arsenic/30 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-exclu-space/60" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-exclu-cloud truncate">{agencyData.agency_name}</p>
                          {agencyData.country && (
                            <p className="text-[11px] text-exclu-space/70 mt-0.5 inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {agencyData.country}</p>
                          )}
                        </div>
                      </div>

                      {managedProfiles.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] uppercase tracking-wider text-exclu-space/70">Managed profiles · {managedProfiles.length}</p>
                            {selectedManagedProfileId && (
                              <button
                                type="button"
                                onClick={() => setSelectedManagedProfileId(null)}
                                className="text-[10px] text-[#CFFF16] hover:underline"
                              >
                                Clear filter
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                            {managedProfiles.map((mp) => {
                              const isSelected = mp.id === selectedManagedProfileId;
                              return (
                                <button
                                  key={mp.id}
                                  onClick={() => setSelectedManagedProfileId(isSelected ? null : mp.id)}
                                  type="button"
                                  className={`group block relative rounded-xl overflow-hidden border transition-all duration-300 ${
                                    isSelected
                                      ? 'border-[#CFFF16] shadow-[0_0_15px_rgba(207,255,22,0.18)] scale-[1.03]'
                                      : 'border-exclu-arsenic/40 hover:border-white/30 hover:scale-[1.03]'
                                  }`}
                                  title={`${mp.display_name || mp.username} - ${mp.is_active ? 'Active' : 'Inactive'} (Click to filter)`}
                                >
                                  <div className="aspect-[3/4] relative">
                                    {mp.avatar_url ? (
                                      <img src={mp.avatar_url} alt={mp.display_name || mp.username} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-exclu-arsenic/30 flex items-center justify-center">
                                        <span className="text-2xl font-bold text-white/20">{(mp.display_name || mp.username)?.[0]?.toUpperCase()}</span>
                                      </div>
                                    )}
                                    <div className="absolute top-1.5 right-1.5">
                                      <div className={`w-2 h-2 rounded-full ${mp.is_active ? 'bg-green-400' : 'bg-red-400'} border border-black/50`} />
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col gap-0.5">
                                      <p className="text-white font-medium text-[11px] truncate leading-tight">{mp.display_name || mp.username}</p>
                                      <div className="flex items-center justify-between gap-1">
                                        <p className="text-white/50 text-[9px] truncate">@{mp.username}</p>
                                        <a
                                          href={`/${mp.username}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="bg-black/40 hover:bg-black/80 rounded p-1 text-white border border-white/20"
                                        >
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      </div>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </section>
                  )}

                  {profile.is_creator && (
                    <section className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 sm:p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4 text-[#CFFF16]" />
                          <h2 className="text-sm font-semibold text-exclu-cloud">Model Categories</h2>
                          {managedProfiles.length > 0 && !selectedManagedProfileId && (
                            <span className="text-[10px] text-exclu-space/50 ml-2">(Select a profile above to edit)</span>
                          )}
                        </div>
                        <button
                          onClick={handleSaveCategories}
                          disabled={isSavingCategories || (managedProfiles.length > 0 && !selectedManagedProfileId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#CFFF16]/10 text-[#CFFF16] text-[11px] font-medium hover:bg-[#CFFF16]/20 transition-colors disabled:opacity-50"
                        >
                          {isSavingCategories ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          Save categories
                        </button>
                      </div>
                      <div className={managedProfiles.length > 0 && !selectedManagedProfileId ? "opacity-50 pointer-events-none" : ""}>
                        <ModelCategoryDropdown value={modelCategories} onChange={setModelCategories} />
                      </div>
                    </section>
                  )}
                </div>
              )}

              {/* ── CONTENT ── */}
              {activeTab === 'content' && (
                <div className="space-y-4">
                  <section className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-[#CFFF16]" />
                        <h2 className="text-sm font-semibold text-exclu-cloud">Links</h2>
                      </div>
                      <span className="text-[11px] text-exclu-space/70 tabular-nums">{displayLinks.length} links</span>
                    </div>

                    {displayLinks.length === 0 ? (
                      <p className="text-sm text-exclu-space/60 py-6 text-center">This user has no links yet.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-exclu-arsenic/50 bg-exclu-void/30">
                        <table className="min-w-full text-left text-xs sm:text-sm">
                          <thead className="bg-exclu-ink/60 border-b border-exclu-arsenic/60">
                            <tr>
                              <th className="px-4 py-2.5 font-medium text-[10px] uppercase tracking-wider text-exclu-space/70">Content</th>
                              <th className="px-4 py-2.5 font-medium text-[10px] uppercase tracking-wider text-exclu-space/70">Title</th>
                              <th className="px-4 py-2.5 font-medium text-[10px] uppercase tracking-wider text-exclu-space/70">Visibility</th>
                              <th className="px-4 py-2.5 font-medium text-[10px] uppercase tracking-wider text-exclu-space/70">Price</th>
                              <th className="px-4 py-2.5 font-medium text-[10px] uppercase tracking-wider text-exclu-space/70">Created</th>
                              <th className="px-4 py-2.5 font-medium text-[10px] uppercase tracking-wider text-exclu-space/70"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayLinks.map((link) => {
                              const isVideo = link.mime_type?.startsWith('video/');
                              return (
                                <tr
                                  key={link.id}
                                  className="border-b border-exclu-arsenic/30 last:border-b-0 transition-colors duration-150 hover:bg-exclu-ink/60 cursor-pointer"
                                  onClick={() => setSelectedLink(link)}
                                >
                                  <td className="px-4 py-2 align-middle">
                                    <div className="relative w-16 h-12 rounded-lg overflow-hidden border border-exclu-arsenic/60 bg-exclu-ink/80">
                                      {link.previewUrl ? (
                                        isVideo ? (
                                          <video src={link.previewUrl} className="w-full h-full object-cover" muted playsInline />
                                        ) : (
                                          <img src={link.previewUrl} className="w-full h-full object-cover" alt={link.title || 'Link content'} />
                                        )
                                      ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-exclu-phantom/30 via-exclu-ink to-exclu-phantom/20" />
                                      )}
                                      {link.media && link.media.length > 1 && (
                                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-[9px] text-white font-bold backdrop-blur-sm border border-white/10">
                                          {link.media.length} files
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-middle text-exclu-cloud">{link.title || 'Untitled link'}</td>
                                  <td className="px-4 py-2 align-middle text-[11px]">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleLinkVisibility(link.id, !!link.show_on_profile);
                                      }}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium transition-colors ${
                                        link.status === 'published' && link.show_on_profile
                                          ? 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                                          : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20'
                                      }`}
                                      title={link.show_on_profile ? 'Click to hide from profile' : 'Click to make visible'}
                                    >
                                      {link.show_on_profile ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                      {link.show_on_profile ? 'Public' : 'Hidden'}
                                    </button>
                                  </td>
                                  <td className="px-4 py-2 align-middle text-[#CFFF16] text-[11px] font-medium tabular-nums">
                                    {typeof link.price_cents === 'number' ? `$${(link.price_cents / 100).toFixed(2)}` : '—'}
                                  </td>
                                  <td className="px-4 py-2 align-middle text-exclu-space/70 text-[11px] tabular-nums">
                                    {link.created_at ? new Date(link.created_at).toLocaleDateString() : '—'}
                                  </td>
                                  <td className="px-4 py-2 align-middle">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (link.slug) window.open(`/l/${link.slug}`, '_blank');
                                      }}
                                      className="p-1.5 rounded-lg hover:bg-exclu-arsenic/30 transition-colors text-exclu-space hover:text-exclu-cloud"
                                      title="Open link in new tab"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-[#CFFF16]" />
                        <h2 className="text-sm font-semibold text-exclu-cloud">Content library</h2>
                      </div>
                      <span className="text-[11px] text-exclu-space/70 tabular-nums">{displayAssets.length} assets</span>
                    </div>

                    {displayAssets.length === 0 ? (
                      <p className="text-sm text-exclu-space/60 py-6 text-center">This user has not uploaded any content yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {displayAssets.map((asset) => (
                          <div
                            key={asset.id}
                            className="rounded-xl border border-exclu-arsenic/50 bg-exclu-ink/90 overflow-hidden flex flex-col text-[11px] cursor-pointer hover:border-[#CFFF16]/40 transition-colors"
                            onClick={() => setSelectedAsset(asset)}
                          >
                            <div className="relative aspect-[4/3] bg-exclu-void/60 flex items-center justify-center">
                              {asset.preview_url ? (
                                asset.mime_type?.startsWith('video/') ? (
                                  <video src={asset.preview_url} className="w-full h-full object-cover" muted playsInline />
                                ) : (
                                  <img src={asset.preview_url} alt={asset.title || 'Asset preview'} className="w-full h-full object-cover" />
                                )
                              ) : (
                                <span className="text-exclu-space/70">No preview</span>
                              )}
                            </div>
                            <div className="px-3 py-2 space-y-1">
                              <p className="truncate text-exclu-cloud font-medium text-[11px]">{asset.title || 'Untitled asset'}</p>
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleAssetVisibility(asset.id, !!asset.is_public);
                                  }}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    asset.is_public
                                      ? 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-red-500/10 hover:text-red-400'
                                      : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-green-500/10 hover:text-green-400'
                                  }`}
                                  title={asset.is_public ? 'Make private' : 'Make public'}
                                >
                                  {asset.is_public ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                                  {asset.is_public ? 'Public' : 'Private'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('Delete this content permanently?')) {
                                      handleDeleteAsset(asset.id, asset.storage_path);
                                    }
                                  }}
                                  className="p-0.5 rounded text-exclu-space/50 hover:text-red-400 transition-colors"
                                  title="Delete content"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* ── WALLET ── */}
              {activeTab === 'wallet' && (
                <div className="space-y-4">
                  <section className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <WalletIcon className="w-4 h-4 text-[#CFFF16]" />
                        <h2 className="text-sm font-semibold text-exclu-cloud">Wallet</h2>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${profile.is_creator_subscribed ? 'bg-[#CFFF16]/10 text-[#CFFF16] border-[#CFFF16]/30' : 'bg-exclu-arsenic/40 text-exclu-space/70 border-exclu-arsenic/50'}`}>
                        {profile.is_creator_subscribed ? 'Premium · 0%' : 'Free · 15%'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-[#CFFF16]/5 border border-[#CFFF16]/25 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[#CFFF16]/70">Balance</p>
                        <p className="text-xl font-bold text-[#CFFF16] tabular-nums mt-0.5">${((profile.wallet_balance_cents ?? 0) / 100).toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl bg-exclu-arsenic/20 border border-exclu-arsenic/40 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-exclu-space/60">Total earned</p>
                        <p className="text-xl font-bold text-exclu-cloud tabular-nums mt-0.5">${((profile.total_earned_cents ?? 0) / 100).toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl bg-exclu-arsenic/20 border border-exclu-arsenic/40 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-exclu-space/60">Withdrawn</p>
                        <p className="text-xl font-bold text-exclu-cloud tabular-nums mt-0.5">${((profile.total_withdrawn_cents ?? 0) / 100).toFixed(2)}</p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Landmark className="w-4 h-4 text-[#CFFF16]" />
                      <h2 className="text-sm font-semibold text-exclu-cloud">Bank account</h2>
                      {profile.payout_setup_complete ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/25 ml-auto">Verified</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 ml-auto">Not set up</span>
                      )}
                    </div>
                    {profile.payout_setup_complete ? (
                      <div className="rounded-xl bg-gradient-to-br from-exclu-arsenic/30 to-exclu-ink/60 border border-exclu-arsenic/40 p-4 space-y-1.5 text-xs">
                        {(() => {
                          const type = profile.bank_account_type || 'iban';
                          const rows: { label: string; value: string; mono?: boolean }[] = [];
                          if (type === 'iban' && profile.bank_iban) {
                            rows.push({ label: 'IBAN', value: `${profile.bank_iban.slice(0, 4)} ${'····'.repeat(3)} ${profile.bank_iban.slice(-4)}`, mono: true });
                          } else if (profile.bank_account_number) {
                            rows.push({ label: 'Account', value: `····${profile.bank_account_number.slice(-4)}`, mono: true });
                          }
                          if (type === 'us' && profile.bank_routing_number) rows.push({ label: 'ABA', value: profile.bank_routing_number, mono: true });
                          if (type === 'au' && profile.bank_bsb) rows.push({ label: 'BSB', value: profile.bank_bsb, mono: true });
                          if (profile.bank_bic) rows.push({ label: 'SWIFT', value: profile.bank_bic, mono: true });
                          if (profile.bank_holder_name) rows.push({ label: 'Holder', value: profile.bank_holder_name });
                          if (profile.bank_country) rows.push({ label: 'Country', value: profile.bank_country });
                          return rows.map((r) => (
                            <div key={r.label} className="flex justify-between">
                              <span className="text-exclu-space/60">{r.label}</span>
                              <span className={`text-exclu-cloud ${r.mono ? 'font-mono' : ''}`}>{r.value}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <p className="text-xs text-exclu-space/50 italic">No bank account set up</p>
                    )}
                  </section>

                  {payouts.length > 0 && (
                    <section className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 sm:p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <ArrowUpRight className="w-4 h-4 text-[#CFFF16]" />
                          <h2 className="text-sm font-semibold text-exclu-cloud">Recent withdrawals</h2>
                        </div>
                        <span className="text-[11px] text-exclu-space/70 tabular-nums">Last {Math.min(payouts.length, 5)}</span>
                      </div>
                      <div className="space-y-1.5">
                        {payouts.slice(0, 5).map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs rounded-xl bg-exclu-arsenic/20 border border-exclu-arsenic/30 px-3 py-2">
                            <span className="text-exclu-cloud font-semibold tabular-nums">${(p.amount_cents / 100).toFixed(2)}</span>
                            <span className="text-exclu-space/70 tabular-nums">{new Date(p.requested_at || p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              p.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                              p.status === 'rejected' || p.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }`}>{p.status}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {/* ── SETTINGS ── */}
              {activeTab === 'settings' && (
                <div className="space-y-4">
                  <section className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Eye className="w-4 h-4 text-[#CFFF16]" />
                      <h2 className="text-sm font-semibold text-exclu-cloud">Directory visibility</h2>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-exclu-cloud">Show in landing pages</p>
                        <p className="text-xs text-exclu-space/70 mt-1">Controls visibility in creator directory, agency listings, and blog carousel.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {profile.is_directory_visible ? <Eye className="w-4 h-4 text-green-400" /> : <EyeOff className="w-4 h-4 text-red-400" />}
                        <Switch
                          checked={profile.is_directory_visible || false}
                          onCheckedChange={handleDirectoryVisibilityToggle}
                          disabled={isUpdatingVisibility}
                          className="data-[state=checked]:bg-[#CFFF16]"
                        />
                      </div>
                    </div>
                    {isUpdatingVisibility && <p className="text-xs text-exclu-space/70 mt-2">Updating visibility...</p>}
                  </section>

                  {profile.is_creator && (
                    <section className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                        <div className="flex items-center gap-2 shrink-0">
                          <Camera className="w-4 h-4 text-[#CFFF16]" />
                          <h2 className="text-sm font-semibold text-exclu-cloud">Photo management</h2>
                        </div>

                        {managedProfiles.length > 0 && (
                          <select
                            value={photoTargetProfileId ?? ''}
                            onChange={(e) => setPhotoTargetProfileId(e.target.value || null)}
                            className="h-8 rounded-lg bg-exclu-ink border border-exclu-arsenic/70 text-exclu-cloud text-xs px-3 focus:outline-none focus:ring-1 focus:ring-[#CFFF16]/40 w-full sm:w-56"
                          >
                            <option value="">— Select a managed profile —</option>
                            {managedProfiles.map((mp) => (
                              <option key={mp.id} value={mp.id}>{mp.display_name || mp.username} (@{mp.username})</option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRequestPhotoChange}
                          disabled={isRequestingPhotoChange || (managedProfiles.length > 0 && !photoTargetProfileId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-exclu-arsenic/60 bg-exclu-ink/60 text-exclu-cloud text-xs hover:border-exclu-cloud/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isRequestingPhotoChange ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                          Request change
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteAvatar}
                          disabled={isDeletingAvatar || (managedProfiles.length > 0 && !photoTargetProfileId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/5 text-red-400 text-xs hover:border-red-400/60 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isDeletingAvatar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Delete photo
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      {selectedAsset && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4" onClick={() => setSelectedAsset(null)}>
          <div
            className="relative max-w-3xl w-full max-h-[90vh] bg-exclu-ink rounded-2xl border border-exclu-arsenic/70 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-exclu-arsenic/70">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-exclu-cloud truncate">
                  {selectedAsset.title || 'Untitled asset'}
                </span>
                <span className="text-[11px] text-exclu-space/70 truncate">
                  {selectedAsset.mime_type || 'Unknown type'}
                </span>
              </div>
              <button
                type="button"
                className="text-xs text-exclu-space hover:text-exclu-cloud"
                onClick={() => setSelectedAsset(null)}
              >
                Close
              </button>
            </div>
            <div className="bg-black flex items-center justify-center max-h-[80vh]">
              {selectedAsset.preview_url ? (
                selectedAsset.mime_type?.startsWith('video/') ? (
                  <video
                    src={selectedAsset.preview_url}
                    controls
                    className="max-h-[80vh] max-w-full"
                  />
                ) : (
                  <img
                    src={selectedAsset.preview_url}
                    alt={selectedAsset.title || 'Asset preview'}
                    className="max-h-[80vh] max-w-full object-contain"
                  />
                )
              ) : (
                <div className="text-xs text-exclu-space/70 p-6 space-y-2 max-w-full">
                  <p className="text-exclu-cloud/90 font-medium">No preview available for this asset.</p>
                  <p>The signed URL could not be generated. This usually means the file was deleted from storage, or the <code className="text-[10px] bg-exclu-arsenic/40 px-1 py-0.5 rounded">storage_path</code> in the database no longer matches an object in the <code className="text-[10px] bg-exclu-arsenic/40 px-1 py-0.5 rounded">paid-content</code> bucket.</p>
                  {selectedAsset.storage_path && (
                    <p className="break-all font-mono text-[10px] text-exclu-space/80 bg-exclu-arsenic/30 px-2 py-1.5 rounded">
                      {selectedAsset.storage_path}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {selectedLink && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4" onClick={() => setSelectedLink(null)}>
          <div
            className="relative max-w-3xl w-full max-h-[90vh] bg-exclu-ink rounded-2xl border border-exclu-arsenic/70 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-exclu-arsenic/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-exclu-cloud truncate">
                  {selectedLink.title || 'Untitled link'}
                </span>
                <button
                  type="button"
                  className="text-xs text-exclu-space hover:text-exclu-cloud"
                  onClick={() => setSelectedLink(null)}
                >
                  Close
                </button>
              </div>
              {selectedLink.description && (
                <p className="text-xs text-exclu-space/80 line-clamp-3">{selectedLink.description}</p>
              )}
              <div className="flex items-center gap-3 text-[11px] text-exclu-space/70">
                <span>
                  {typeof selectedLink.price_cents === 'number'
                    ? `$${(selectedLink.price_cents / 100).toFixed(2)}`
                    : 'No price'}
                </span>
                <span>·</span>
                <span className={selectedLink.status === 'published' ? 'text-green-400' : 'text-exclu-space/70'}>
                  {selectedLink.status || 'Unknown'}
                </span>
                <span>·</span>
                <span>{selectedLink.mime_type || 'Unknown type'}</span>
              </div>
            </div>
            <div className="bg-black flex flex-col items-center justify-start overflow-y-auto max-h-[80vh] p-4 gap-6">
              {selectedLink.media && selectedLink.media.length > 0 ? (
                selectedLink.media.map((m, idx) => {
                  const isVid = m.mime_type?.startsWith('video/');
                  const isImg = m.mime_type?.startsWith('image/');
                  const canPreview = isVid || isImg;

                  return (
                    <div key={m.id || idx} className="w-full space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] text-exclu-space uppercase tracking-wider">File {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-exclu-space/60">{m.mime_type || 'Unknown type'}</span>
                          {m.preview_url && !canPreview && (
                            <a
                              href={m.preview_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-exclu-cloud hover:underline bg-exclu-arsenic/40 px-2 py-0.5 rounded"
                            >
                              Open file
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-exclu-arsenic/50 overflow-hidden bg-exclu-void/40 flex items-center justify-center min-h-[200px]">
                        {m.preview_url ? (
                          isVid ? (
                            <video
                              src={m.preview_url}
                              controls
                              className="max-h-[70vh] max-w-full"
                            />
                          ) : isImg ? (
                            <img
                              src={m.preview_url}
                              alt={`${selectedLink.title} - file ${idx + 1}`}
                              className="max-h-[70vh] max-w-full object-contain"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-3 p-12">
                              <div className="w-12 h-12 rounded-full bg-exclu-arsenic/30 flex items-center justify-center">
                                <Download className="w-6 h-6 text-exclu-space" />
                              </div>
                              <p className="text-xs text-exclu-space text-center">
                                This file type ({m.mime_type}) cannot be previewed directly.<br />
                                <a href={m.preview_url} target="_blank" rel="noopener noreferrer" className="text-exclu-cloud underline mt-2 inline-block">Download/Open file</a>
                              </p>
                            </div>
                          )
                        ) : (
                          <p className="text-xs text-exclu-space/70 p-6">No preview available for this file.</p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : selectedLink.previewUrl ? (
                <div className="w-full flex items-center justify-center">
                  {selectedLink.mime_type?.startsWith('video/') ? (
                    <video
                      src={selectedLink.previewUrl}
                      controls
                      className="max-h-[80vh] max-w-full"
                    />
                  ) : selectedLink.mime_type?.startsWith('image/') ? (
                    <img
                      src={selectedLink.previewUrl}
                      alt={selectedLink.title || 'Link content'}
                      className="max-h-[80vh] max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3 p-12">
                      <p className="text-xs text-exclu-space text-center">
                        This file ({selectedLink.mime_type}) cannot be previewed.<br />
                        <a href={selectedLink.previewUrl} target="_blank" rel="noopener noreferrer" className="text-exclu-cloud underline mt-2 inline-block">Open file</a>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 p-12">
                  <p className="text-xs text-exclu-space/70 text-center">No media available for this link.</p>
                  <p className="text-[10px] text-exclu-space/40 text-center break-all max-w-xs">Path: {selectedLink.storage_path || 'None'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowDeleteConfirm(false)}>
          <div
            className="relative max-w-md w-full bg-exclu-ink rounded-2xl border border-red-600/50 overflow-hidden p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-exclu-cloud mb-2">Delete user permanently?</h3>
            <p className="text-sm text-exclu-space mb-4">
              This will permanently delete <strong>{profile?.display_name || profile?.handle || 'this user'}</strong> and all associated data:
            </p>
            <ul className="text-xs text-exclu-space/80 mb-6 space-y-1 list-disc list-inside">
              <li>Profile and account</li>
              <li>All creator links and sales</li>
              <li>All uploaded content (avatars, paid content, public content)</li>
              <li>All purchases made by this user</li>
              <li>Payment account details</li>
            </ul>
            <p className="text-xs text-red-400 font-semibold mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-exclu-cloud bg-exclu-arsenic/50 hover:bg-exclu-arsenic/70 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  handleDeleteUser();
                }}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default AdminUserOverview;
