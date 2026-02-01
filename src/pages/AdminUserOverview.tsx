import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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
  const [profile, setProfile] = useState<UserProfileOverview | null>(null);
  const [links, setLinks] = useState<UserLinkOverview[]>([]);
  const [assets, setAssets] = useState<UserAssetOverview[]>([]);
  const [sales, setSales] = useState<UserSaleOverview[]>([]);
  const [stripeDetails, setStripeDetails] = useState<UserStripeOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<UserAssetOverview | null>(null);

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
            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              className="text-xs sm:text-sm text-exclu-space hover:text-exclu-cloud underline-offset-2 hover:underline"
            >
              Back to users
            </button>
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
                    {!stripeDetails?.friendly_messages?.length && (
                      <p className="text-[11px] text-exclu-space/60 mt-1">
                        This is an admin-only control. Clicking "Connect Stripe" will start the same
                        onboarding flow this user sees in their dashboard.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleStripeConnectAsUser}
                    disabled={isConnectingStripe}
                    className="inline-flex items-center self-start rounded-full bg-exclu-cloud text-black px-3 py-1 text-[11px] font-medium hover:bg-white/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {isConnectingStripe ? 'Connecting…' : 'Connect Stripe as user'}
                  </button>
                </div>
                  </div>

                  {links.length === 0 ? (
                    <p className="text-sm text-exclu-space">This user has no links yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-exclu-arsenic/70 bg-exclu-ink/90">
                      <table className="min-w-full text-left text-xs sm:text-sm">
                        <thead className="bg-exclu-ink border-b border-exclu-arsenic/70">
                          <tr>
                            <th className="px-4 py-2 font-medium text-exclu-space/80">Title</th>
                            <th className="px-4 py-2 font-medium text-exclu-space/80">Status</th>
                            <th className="px-4 py-2 font-medium text-exclu-space/80">Price</th>
                            <th className="px-4 py-2 font-medium text-exclu-space/80">Created at</th>
                          </tr>
                        </thead>
                        <tbody>
                          {links.map((link) => (
                            <tr
                              key={link.id}
                              className="border-b border-exclu-arsenic/40 last:border-b-0 transition-colors duration-150 hover:bg-exclu-ink/80"
                            >
                              <td className="px-4 py-2 align-middle text-exclu-cloud">
                                {link.title || 'Untitled link'}
                              </td>
                              <td className="px-4 py-2 align-middle text-exclu-space text-[11px] capitalize">
                                {link.status || '—'}
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
                          ))}
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
                              <img
                                src={asset.preview_url}
                                alt={asset.title || 'Asset preview'}
                                className="w-full h-full object-cover"
                              />
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
    </AppShell>
  );
};

export default AdminUserOverview;
