import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, ExternalLink, Trash2, Eye, EyeOff, Loader2, Tag, Building2, Camera, Mail } from 'lucide-react';
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
  stripe_connect_status: string | null;
  is_directory_visible: boolean | null;
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

interface UserStripeOverview {
  status: string;
  disabled_reason: string | null;
  friendly_messages: string[];
  account_email: string | null;
  payout_country: string | null;
}

interface UserOverviewPayload {
  profile: UserProfileOverview | null;
  links: UserLinkOverview[];
  assets: UserAssetOverview[];
  sales: UserSaleOverview[];
  stripe: UserStripeOverview | null;
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
  const [stripeDetails, setStripeDetails] = useState<UserStripeOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
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

      let data: any = null;
      let error: any = null;
      try {
        const result = await supabase.functions.invoke('admin-get-user-overview', {
          body: { user_id: id },
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'x-supabase-auth': session.access_token,
          },
        });
        data = result.data;
        error = result.error;
      } catch (fetchErr) {
        console.error('Fetch error:', fetchErr);
        error = fetchErr;
      }

      if (!isMounted) return;

      if (error) {
        console.error('Error loading user overview from admin-get-user-overview', error);
        setError('Unable to load user overview. Make sure your account has admin access.');
        setIsLoading(false);
        return;
      }

      const payload = data as UserOverviewPayload;
      setProfile(payload.profile);
      setLinks(payload.links ?? []);
      setAssets(payload.assets ?? []);
      setSales(payload.sales ?? []);
      setStripeDetails(payload.stripe ?? null);

      // Fetch agency data if user is an agency
      if (id) {
        const { data: agencyInfo } = await supabase
          .from('profiles')
          .select('agency_name, agency_logo_url, country')
          .eq('id', id)
          .not('agency_name', 'is', null)
          .maybeSingle();
        if (agencyInfo) {
          setAgencyData(agencyInfo);
          
          // Fetch managed profiles for this agency
          const { data: managed } = await supabase
            .from('creator_profiles')
            .select('id, username, display_name, is_active, avatar_url, model_categories')
            .eq('user_id', id);
          if (managed) {
            setManagedProfiles(managed);
          }
        }
      }

      // Fetch model categories for this user's creator profile
      if (id) {
        const { data: cpData } = await supabase
          .from('creator_profiles')
          .select('model_categories')
          .eq('user_id', id)
          .eq('is_active', true)
          .maybeSingle();
        if (cpData?.model_categories) {
          setModelCategories(cpData.model_categories);
        }
      }
      
      setIsLoading(false);
    };

    loadOverview();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleStripeConnectAsUser = async () => {
    if (!id) return;

    setIsConnectingStripe(true);
    setError(null);

    // Open a blank tab immediately while we're still in the click event,
    // so most browsers will treat this as a user-initiated popup.
    const stripeWindow = window.open('', '_blank', 'noopener,noreferrer');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (stripeWindow) {
          stripeWindow.close();
        }
        setError('Please sign in again to connect Stripe for this user.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
        body: { target_user_id: id },
        headers: {
          // Same pattern as other admin functions: send the access token via x-supabase-auth
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'x-supabase-auth': session.access_token,
        },
      });

      console.log('[AdminUserOverview] stripe-connect-onboard response', { data, error });

      if (error) {
        console.error('Error invoking stripe-connect-onboard as admin', error);
        if (stripeWindow) {
          stripeWindow.close();
        }
        setError('Unable to start Stripe Connect onboarding for this user.');
        return;
      }

      const url = (data as any)?.url as string | undefined;
      console.log('[AdminUserOverview] Stripe onboard URL', url);
      if (!url) {
        if (stripeWindow) {
          stripeWindow.close();
        }
        setError('Stripe Connect URL not available for this user.');
        return;
      }

      try {
        if (stripeWindow) {
          // Normal case: we successfully opened a tab in response to the click,
          // now send it to Stripe.
          stripeWindow.location.assign(url);
        } else {
          // Fallback: popup was blocked, navigate in the current tab.
          window.location.assign(url);
        }
      } catch (navError) {
        console.error('[AdminUserOverview] Failed to navigate to Stripe URL', navError);
        setError('Navigation to Stripe failed. Please copy/paste this URL manually into your browser: ' + url);
      }
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const formatStripeStatus = (status: string | null) => {
    if (!status) return 'Not connected';
    switch (status) {
      case 'pending_requirements':
        return 'Pending verification';
      case 'complete':
        return 'Connected';
      case 'restricted':
        return 'Restricted';
      default:
        return status;
    }
  };

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
      <main className="px-4 pt-6 pb-8 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Admin – User overview</h1>
              <p className="text-xs sm:text-sm text-exclu-space mt-1">
                Read-only snapshot of this creator&apos;s dashboard. No actions are performed on their account.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {profile?.handle && (
                <button
                  type="button"
                  onClick={() => window.open(`/${profile.handle}`, '_blank')}
                  className="p-1.5 rounded-lg hover:bg-exclu-arsenic/30 transition-colors text-exclu-space hover:text-exclu-cloud"
                  title="View public profile"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!profile || isDeleting}
                className="p-1.5 rounded-lg hover:bg-exclu-arsenic/30 transition-colors text-exclu-space hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete user"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate(returnTo)}
                className="text-xs sm:text-sm text-exclu-space hover:text-exclu-cloud underline-offset-2 hover:underline"
              >
                Back to users
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 shadow-lg shadow-black/40 overflow-hidden">
            {isLoading ? (
              <div className="px-4 py-6 text-sm text-exclu-space">Loading user overview…</div>
            ) : !profile ? (
              <div className="px-4 py-6 text-sm text-exclu-space">User profile not found.</div>
            ) : (
              <div className="px-4 py-4 space-y-4">
                {error && (
                  <div className="mb-3 text-sm text-red-400">{error}</div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-exclu-cloud">Profile</h2>
                    <p className="text-xs text-exclu-space mt-1">
                      {profile.display_name || '—'}
                      {profile.handle && (
                        <span className="text-exclu-space/80"> · @{profile.handle}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-exclu-space mt-2 sm:mt-0 sm:justify-end sm:text-right">
                    <p>
                      Created:{' '}
                      <span className="text-exclu-cloud/90">
                        {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
                      </span>
                    </p>
                    <p>
                      Country:{' '}
                      <span className="text-exclu-cloud/90">{profile.country || '—'}</span>
                    </p>
                    <p>
                      Creator:{' '}
                      <span className="text-exclu-cloud/90">{profile.is_creator ? 'Yes' : 'No'}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/90 p-4">
                  <h2 className="text-sm font-semibold text-exclu-cloud mb-2">Directory Visibility</h2>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-exclu-cloud">Show in landing pages</p>
                      <p className="text-xs text-exclu-space mt-1">
                        Controls visibility in creator directory, agency listings, and blog carousel
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {profile.is_directory_visible ? (
                        <Eye className="w-4 h-4 text-green-400" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-red-400" />
                      )}
                      <Switch
                        checked={profile.is_directory_visible || false}
                        onCheckedChange={handleDirectoryVisibilityToggle}
                        disabled={isUpdatingVisibility}
                        className="data-[state=checked]:bg-[#CFFF16]"
                      />
                    </div>
                  </div>
                  
                  {isUpdatingVisibility && (
                    <p className="text-xs text-exclu-space/70 mt-2">Updating visibility...</p>
                  )}
                </div>

                {/* Photo Management */}
                {profile.is_creator && (
                  <div className="mt-3 rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/90 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-2 shrink-0">
                        <Camera className="w-4 h-4 text-[#CFFF16]" />
                        <h2 className="text-sm font-semibold text-exclu-cloud">Photo Management</h2>
                      </div>

                      {managedProfiles.length > 0 && (
                        <select
                          value={photoTargetProfileId ?? ''}
                          onChange={(e) => setPhotoTargetProfileId(e.target.value || null)}
                          className="h-8 rounded-lg bg-exclu-ink border border-exclu-arsenic/70 text-exclu-cloud text-xs px-3 focus:outline-none focus:ring-1 focus:ring-[#CFFF16]/40 w-full sm:w-56"
                        >
                          <option value="">— Select a managed profile —</option>
                          {managedProfiles.map((p) => (
                            <option key={p.id} value={p.id}>{p.display_name || p.username} (@{p.username})</option>
                          ))}
                        </select>
                      )}

                      <div className="flex items-center gap-2 sm:ml-auto">
                        <button
                          type="button"
                          onClick={handleRequestPhotoChange}
                          disabled={isRequestingPhotoChange || (managedProfiles.length > 0 && !photoTargetProfileId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-exclu-arsenic/60 text-exclu-cloud text-xs hover:border-exclu-cloud/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isRequestingPhotoChange ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                          Request change
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteAvatar}
                          disabled={isDeletingAvatar || (managedProfiles.length > 0 && !photoTargetProfileId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs hover:border-red-400/60 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isDeletingAvatar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Delete photo
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Agency Information */}
                {agencyData && (
                  <div className="mt-3 rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/90 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 className="w-4 h-4 text-[#CFFF16]" />
                      <h2 className="text-sm font-semibold text-exclu-cloud">Agency Information</h2>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6 mb-4">
                      {agencyData.agency_logo_url && (
                        <div className="flex-shrink-0">
                          <img 
                            src={agencyData.agency_logo_url} 
                            alt="Agency logo" 
                            className="w-16 h-16 rounded-lg object-cover border border-exclu-arsenic/50"
                          />
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-6 flex-1">
                        <div>
                          <p className="text-[11px] text-exclu-space uppercase tracking-wide mb-1">Agency Name</p>
                          <p className="text-sm text-exclu-cloud">{agencyData.agency_name}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-exclu-space uppercase tracking-wide mb-1">Country</p>
                          <p className="text-sm text-exclu-cloud">{agencyData.country}</p>
                        </div>
                      </div>
                    </div>

                    {/* Managed Profiles */}
                    {managedProfiles.length > 0 && (
                      <div>
                        <p className="text-[11px] text-exclu-space uppercase tracking-wide mb-3">
                          Managed Profiles ({managedProfiles.length})
                        </p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                          {managedProfiles.map((profile) => {
                            const isSelected = profile.id === selectedManagedProfileId;
                            return (
                              <button
                                key={profile.id}
                                onClick={() => setSelectedManagedProfileId(isSelected ? null : profile.id)}
                                type="button"
                                className={`group block relative rounded-2xl overflow-hidden border transition-all duration-300 ${
                                  isSelected 
                                    ? 'border-[#CFFF16] shadow-[0_0_15px_rgba(207,255,22,0.15)] scale-[1.03]' 
                                    : 'border-exclu-arsenic/40 hover:border-white/30 hover:scale-[1.03]'
                                }`}
                                title={`${profile.display_name || profile.username} - ${profile.is_active ? 'Active' : 'Inactive'} (Click to filter)`}
                              >
                                <div className="aspect-[3/4] relative">
                                  {profile.avatar_url ? (
                                    <img
                                      src={profile.avatar_url}
                                      alt={profile.display_name || profile.username}
                                      className="absolute inset-0 w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-exclu-arsenic/30 flex items-center justify-center">
                                      <span className="text-2xl font-bold text-white/20">
                                        {(profile.display_name || profile.username)?.[0]?.toUpperCase()}
                                      </span>
                                    </div>
                                  )}
                                  <div className="absolute top-1 right-1">
                                    <div className={`w-2 h-2 rounded-full ${profile.is_active ? 'bg-green-400' : 'bg-red-400'} border border-black/50`} />
                                  </div>
                                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-exclu-black via-exclu-black/90 to-transparent flex flex-col items-start gap-1">
                                    <p className="text-white font-medium text-xs truncate leading-tight w-full text-left">
                                      {profile.display_name || profile.username}
                                    </p>
                                    <div className="flex items-center justify-between w-full">
                                      <p className="text-exclu-steel text-[10px] truncate">
                                        @{profile.username}
                                      </p>
                                      <a 
                                        href={`/${profile.username}`} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        onClick={(e) => e.stopPropagation()}
                                        className="bg-black/40 hover:bg-black/80 rounded p-1 text-white border border-white/20 z-10"
                                      >
                                        <ExternalLink className="w-3 h-3" />
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
                  </div>
                )}

                {/* Model Categories */}
                {profile.is_creator && (
                  <div className="mt-3 rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/90 p-4">
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
                      <ModelCategoryDropdown
                        value={modelCategories}
                        onChange={setModelCategories}
                      />
                    </div>
                </div>
                )}

                 {/* stripe section moved to bottom */}

                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-exclu-cloud">Links</h2>
                    <span className="text-[11px] text-exclu-space/80">{displayLinks.length} links</span>
                  </div>
                </div>

                {displayLinks.length === 0 ? (
                  <p className="text-sm text-exclu-space">This user has no links yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-exclu-arsenic/70 bg-exclu-ink/90">
                    <table className="min-w-full text-left text-xs sm:text-sm">
                      <thead className="bg-exclu-ink border-b border-exclu-arsenic/70">
                        <tr>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Content</th>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Title</th>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Visibility</th>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Price</th>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Created at</th>
                          <th className="px-4 py-2 font-medium text-exclu-space/80"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayLinks.map((link) => {
                          const isVideo = link.mime_type?.startsWith('video/');
                          return (
                            <tr
                              key={link.id}
                              className="border-b border-exclu-arsenic/40 last:border-b-0 transition-colors duration-150 hover:bg-exclu-ink/80 cursor-pointer"
                              onClick={() => setSelectedLink(link)}
                            >
                              <td className="px-4 py-2 align-middle">
                                <div className="relative w-16 h-12 rounded-lg overflow-hidden border border-exclu-arsenic/60 bg-exclu-ink/80">
                                  {link.previewUrl ? (
                                    isVideo ? (
                                      <video
                                        src={link.previewUrl}
                                        className="w-full h-full object-cover"
                                        muted
                                        playsInline
                                      />
                                    ) : (
                                      <img
                                        src={link.previewUrl}
                                        className="w-full h-full object-cover"
                                        alt={link.title || 'Link content'}
                                      />
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
                              <td className="px-4 py-2 align-middle text-exclu-cloud">
                                {link.title || 'Untitled link'}
                              </td>
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
                              <td className="px-4 py-2 align-middle text-exclu-space text-[11px]">
                                {typeof link.price_cents === 'number'
                                  ? `$${(link.price_cents / 100).toFixed(2)}`
                                  : '—'}
                              </td>
                              <td className="px-4 py-2 align-middle text-exclu-space text-[11px]">
                                {link.created_at ? new Date(link.created_at).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-4 py-2 align-middle">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (link.slug) {
                                      window.open(`/l/${link.slug}`, '_blank');
                                    }
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

                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-exclu-cloud">Content library</h2>
                    <span className="text-[11px] text-exclu-space/80">{displayAssets.length} assets</span>
                  </div>

                  {displayAssets.length === 0 ? (
                    <p className="text-sm text-exclu-space">This user has not uploaded any content yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {displayAssets.map((asset) => (
                        <div
                          key={asset.id}
                          className="rounded-xl border border-exclu-arsenic/60 bg-exclu-ink/90 overflow-hidden flex flex-col text-[11px] cursor-pointer hover:border-exclu-cloud/80 transition-colors"
                          onClick={() => setSelectedAsset(asset)}
                        >
                          <div className="relative aspect-[4/3] bg-exclu-void/60 flex items-center justify-center">
                            {asset.preview_url ? (
                              asset.mime_type?.startsWith('video/') ? (
                                <video
                                  src={asset.preview_url}
                                  className="w-full h-full object-cover"
                                  muted
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={asset.preview_url}
                                  alt={asset.title || 'Asset preview'}
                                  className="w-full h-full object-cover"
                                />
                              )
                            ) : (
                              <span className="text-exclu-space/70">No preview</span>
                            )}
                          </div>
                          <div className="px-3 py-2 space-y-0.5">
                            <p className="truncate text-exclu-cloud font-medium text-[11px]">
                              {asset.title || 'Untitled asset'}
                            </p>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
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
                </div>

                <div className="mt-3 rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/90 p-4">
                  <h2 className="text-sm font-semibold text-exclu-cloud mb-2">Payment Account</h2>

                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-exclu-cloud">Stripe Connect</p>
                      <p className="text-xs text-exclu-space mt-1">
                        {formatStripeStatus(stripeDetails?.status ?? profile.stripe_connect_status)}
                      </p>
                      {stripeDetails?.account_email && (
                        <p className="text-[11px] text-exclu-space/70 mt-1">
                          Stripe account email:
                          <span className="ml-1 font-medium text-exclu-cloud/90">
                            {stripeDetails.account_email}
                          </span>
                          {stripeDetails.payout_country && (
                            <span className="ml-1">
                              · Payout country:{' '}
                              <span className="font-medium">{stripeDetails.payout_country}</span>
                            </span>
                          )}
                        </p>
                      )}
                      {stripeDetails?.friendly_messages && stripeDetails.friendly_messages.length > 0 && (
                        <div className="mt-2 text-[11px] text-exclu-space/70">
                          <p className="font-medium text-exclu-space/80 mb-1">
                            Stripe still needs the following information:
                          </p>
                          <ul className="list-disc list-inside space-y-0.5">
                            {stripeDetails.friendly_messages.map((msg, idx) => (
                              <li key={idx}>{msg}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
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
                <p className="text-xs text-exclu-space/70 p-6">No preview available for this asset.</p>
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
              <li>Stripe Connect account (if connected)</li>
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
