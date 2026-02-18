import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';

interface UserProfileOverview {
  id: string;
  display_name: string | null;
  handle: string | null;
  created_at: string | null;
  is_creator: boolean | null;
  country: string | null;
  stripe_connect_status: string | null;
}

interface UserLinkOverview {
  id: string;
  title: string | null;
  status: string | null;
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
  preview_url: string | null;
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

  useEffect(() => {
    if (!id) {
      setError('Missing user id in URL.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadOverview = async () => {
      setIsLoading(true);
      setError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (!session) {
        setError('You are not authenticated. Please sign in again.');
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-get-user-overview', {
        body: { user_id: id },
        headers: {
          // Same pattern as other admin functions: send the access token via x-supabase-auth
          Authorization: '',
          'x-supabase-auth': session.access_token,
        },
      });

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
          Authorization: '',
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
          Authorization: '',
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
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={!profile || isDeleting}
                className="px-3 py-1.5 text-xs sm:text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Delete user
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
                    <p className="text-[11px] text-exclu-space/70 mt-1 break-all">{profile.id}</p>
                  </div>

                  <div className="text-right text-xs text-exclu-space">
                    <p>
                      Created:{' '}
                      <span className="text-exclu-cloud/90">
                        {profile.created_at ? new Date(profile.created_at).toLocaleString() : '—'}
                      </span>
                    </p>
                    <p className="mt-1">
                      Country:{' '}
                      <span className="text-exclu-cloud/90">{profile.country || '—'}</span>
                    </p>
                    <p className="mt-1">
                      Creator:{' '}
                      <span className="text-exclu-cloud/90">{profile.is_creator ? 'Yes' : 'No'}</span>
                    </p>
                  </div>
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

                {links.length === 0 ? (
                  <p className="text-sm text-exclu-space">This user has no links yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-exclu-arsenic/70 bg-exclu-ink/90">
                    <table className="min-w-full text-left text-xs sm:text-sm">
                      <thead className="bg-exclu-ink border-b border-exclu-arsenic/70">
                        <tr>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Content</th>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Title</th>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Status</th>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Visibility</th>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Price</th>
                          <th className="px-4 py-2 font-medium text-exclu-space/80">Created at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {links.map((link) => {
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
                              <td className="px-4 py-2 align-middle text-exclu-space text-[11px] capitalize">
                                {link.status || '—'}
                              </td>
                              <td className="px-4 py-2 align-middle text-[11px]">
                                {link.status === 'published' ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium">
                                    Visible
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                                    Non visible
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 align-middle text-exclu-space text-[11px]">
                                {typeof link.price_cents === 'number'
                                  ? `${(link.price_cents / 100).toFixed(2)}`
                                  : '—'}
                              </td>
                              <td className="px-4 py-2 align-middle text-exclu-space text-[11px]">
                                {link.created_at ? new Date(link.created_at).toLocaleString() : '—'}
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
                    <span className="text-[11px] text-exclu-space/80">{assets.length} assets</span>
                  </div>

                  {assets.length === 0 ? (
                    <p className="text-sm text-exclu-space">This user has not uploaded any content yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {assets.map((asset) => (
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
                            <div className="flex items-center justify-between gap-2 text-[10px] text-exclu-space/70">
                              <span className="truncate">{asset.mime_type || 'Unknown type'}</span>
                              <span>
                                {asset.created_at
                                  ? new Date(asset.created_at).toLocaleDateString()
                                  : '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
            <div className="flex items-center justify-between px-4 py-2 border-b border-exclu-arsenic/70">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-exclu-cloud truncate">
                  {selectedLink.title || 'Untitled link'}
                </span>
                <span className="text-[11px] text-exclu-space/70 truncate">
                  {selectedLink.mime_type || 'Unknown type'} · {selectedLink.status}
                </span>
              </div>
              <button
                type="button"
                className="text-xs text-exclu-space hover:text-exclu-cloud"
                onClick={() => setSelectedLink(null)}
              >
                Close
              </button>
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
