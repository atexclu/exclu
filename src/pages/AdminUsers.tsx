import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabaseClient';
import { Copy, Check, CreditCard, ExternalLink, LayoutDashboard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface AdminUserSummary {
  id: string;
  display_name: string | null;
  handle: string | null;
  email: string | null;
  created_at: string | null;
  is_creator: boolean | null;
  is_admin: boolean | null;
  links_count: number;
  assets_count: number;
  total_sales: number;
  total_revenue_cents: number;
  profile_view_count: number;
}

const AdminUsers = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Restaurer l'état depuis les paramètres d'URL
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialSearch = searchParams.get('search') || '';
  const initialSort = (searchParams.get('sort') || 'created_desc') as 'created_desc' | 'created_asc' | 'best_sellers' | 'most_viewed';
  
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [sortMode, setSortMode] = useState<'created_desc' | 'created_asc' | 'best_sellers' | 'most_viewed' | 'most_content' | 'most_links'>(initialSort);
  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadUsers = async () => {
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

      const { data, error } = await supabase.functions.invoke('admin-get-users', {
        headers: {
          // Prevent the Functions gateway from trying to validate the user JWT
          // in the Authorization header; we pass it explicitly via x-supabase-auth.
          Authorization: '',
          'x-supabase-auth': session.access_token,
        },
        body: {
          page,
          pageSize,
          search: searchQuery.trim().length > 0 ? searchQuery.trim() : null,
          sortBy: sortMode,
        },
      });

      if (!isMounted) return;

      if (error) {
        console.error('Error loading users from admin-get-users', error);
        setError('Unable to load users. Make sure your account has admin access.');
        setIsLoading(false);
        return;
      }

      const payload = data as {
        users?: AdminUserSummary[];
        total?: number;
        page?: number;
        pageSize?: number;
      };
      setUsers(payload.users ?? []);
      setTotal(payload.total ?? (payload.users ? payload.users.length : 0));
      setIsLoading(false);
    };

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, [page, pageSize, searchQuery, sortMode]);

  const handleViewPublicProfile = (user: AdminUserSummary) => {
    if (user.handle) {
      window.open(`/${user.handle}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleViewDashboard = (user: AdminUserSummary) => {
    // Passer les paramètres actuels dans l'URL pour pouvoir revenir à la même page
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('search', searchQuery);
    params.set('sort', sortMode);
    navigate(`/admin/users/${user.id}/overview?returnTo=${encodeURIComponent(`/admin/users?${params.toString()}`)}`);
  };

  // Le tri est maintenant fait côté serveur, pas besoin de trier ici
  const filteredAndSortedUsers = users;

  const totalCount = total || filteredAndSortedUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <AppShell>
      <main className="px-4 pt-6 pb-8 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Admin – Users</h1>
              <p className="text-xs sm:text-sm text-exclu-space mt-1">
                Internal view of creator and user accounts. Only visible to Exclu admins.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Rechercher par nom, email ou id…"
                className="w-full sm:w-56 rounded-full bg-white border border-exclu-arsenic/70 px-3 py-1.5 text-xs text-black placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-primary/70 focus:border-primary/70"
              />
              <select
                value={sortMode}
                onChange={(e) => {
                  setSortMode(e.target.value as any);
                  setPage(1);
                }}
                className="w-full sm:w-48 rounded-full bg-white border border-exclu-arsenic/70 px-3 py-1.5 text-xs text-black focus:outline-none focus:ring-1 focus:ring-primary/70 focus:border-primary/70"
              >
                <option value="created_desc">Date de création · plus récents</option>
                <option value="created_asc">Date de création · plus anciens</option>
                <option value="best_sellers">Meilleurs vendeurs</option>
                <option value="most_viewed">Plus de vues</option>
                <option value="most_content">Plus de contenus</option>
                <option value="most_links">Plus de liens</option>
              </select>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-exclu-arsenic/70 flex items-center justify-between">
              <span className="text-xs font-medium text-exclu-space uppercase tracking-wide">
                Users ({totalCount})
              </span>
            </div>

            {isLoading ? (
              <div className="px-4 py-6 text-sm text-exclu-space">Loading users…</div>
            ) : error ? (
              <div className="px-4 py-6 text-sm text-red-400">{error}</div>
            ) : filteredAndSortedUsers.length === 0 ? (
              <div className="px-4 py-6 text-sm text-exclu-space">No users found.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="bg-exclu-ink/90 border-b border-exclu-arsenic/70">
                    <tr>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">User</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">Type</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">Contenus</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">Liens</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">Vues</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80">Ventes</th>
                      <th className="px-4 py-2 font-medium text-exclu-space/80 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-exclu-arsenic/40 last:border-b-0 transition-colors duration-150 hover:bg-exclu-ink/80"
                      >
                        <td className="px-4 py-2 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-exclu-cloud text-xs sm:text-sm">
                              {user.display_name || '—'}
                            </span>
                            {user.email && (
                              <span className="text-[11px] text-exclu-space/80 truncate">
                                {user.email}
                              </span>
                            )}
                            <span className="text-[10px] text-exclu-space/60 truncate">{user.id}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 align-middle">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            user.is_admin
                              ? 'bg-red-500/20 text-red-400'
                              : user.is_creator
                              ? 'bg-primary/20 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {user.is_admin ? 'Admin' : user.is_creator ? 'Creator' : 'Fan'}
                          </span>
                        </td>
                        <td className="px-4 py-2 align-middle text-exclu-space">
                          {user.assets_count}
                        </td>
                        <td className="px-4 py-2 align-middle text-exclu-space">
                          {user.links_count}
                        </td>
                        <td className="px-4 py-2 align-middle text-exclu-space">
                          {(user.profile_view_count || 0).toLocaleString('en-US')}
                        </td>
                        <td className="px-4 py-2 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-exclu-cloud font-medium text-xs">
                              {user.total_sales} vente{user.total_sales !== 1 ? 's' : ''}
                            </span>
                            <span className="text-[10px] text-exclu-space/60">
                              {(user.total_revenue_cents / 100).toFixed(2)} €
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 align-middle text-right">
                          <div className="flex items-center justify-end gap-2">
                            {user.handle && (
                              <button
                                type="button"
                                onClick={() => handleViewPublicProfile(user)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-exclu-arsenic/70 text-exclu-space hover:text-exclu-cloud hover:border-exclu-cloud transition-colors"
                                title="View public profile"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleViewDashboard(user)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                              title="View dashboard"
                            >
                              <LayoutDashboard className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-exclu-arsenic/70 flex items-center justify-between text-[11px] text-exclu-space/80">
                  <span>
                    Page {page} / {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1 rounded-full border border-exclu-arsenic/70 disabled:opacity-50 disabled:cursor-not-allowed bg-exclu-ink/80 text-xs"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1 rounded-full border border-exclu-arsenic/70 disabled:opacity-50 disabled:cursor-not-allowed bg-exclu-ink/80 text-xs"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
};

export default AdminUsers;
